import { ApiError, toIssues } from "../../shared/api/errors";
import type { Schemas } from "../../shared/api/types";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import {
  buildUnitSpecPatch,
  changedUnitFields,
  toUnitSpecEdit,
  type UnitSpecField,
} from "../processes/processView";
import type { MaterialDraft, MaterialField, MaterialView } from "./materialView";

/**
 * 재료 저장 규칙(계약 0.3.0 `PATCH /materials/{id}`, MaterialPatch).
 * - 보낸 필드만 바뀐다 → **사용자가 바꾼 필드만** 보낸다. `code`·`name`·`form`은 null로 지울 수 없고 `notes`는 null이 입력 없음이다.
 * - `default_spec`은 보낸 **하위 필드만 교체**하고 나머지는 유지한다. 빈 객체·`null`·필드의 `null`은 422이며, 확정값을 다시 미정으로
 *   되돌리려면 `{mode: "unknown"}`을 보낸다.
 * - 개수(`unit_count`·`strand_count`)는 JSON 정수, 길이·중량은 decimal 문자열이다.
 */
export type MaterialPatchBody = Schemas["MaterialPatch"];
export type MaterialCreateBody = Schemas["MaterialCreate"];

const FIELDS: MaterialField[] = ["code", "name", "form", "notes"];

const valueOf = (d: MaterialDraft, k: MaterialField): string | null => (k === "notes" ? (d.notes === "" ? null : d.notes) : d[k]);

export function changedMaterialFields(original: MaterialDraft, draft: MaterialDraft): MaterialField[] {
  return FIELDS.filter((k) => valueOf(original, k) !== valueOf(draft, k));
}

/** 서버에 보낼 변경 본문. 바뀐 것이 없으면 null(요청을 보내지 않는다). */
export function buildMaterialPatch(original: MaterialDraft, draft: MaterialDraft): MaterialPatchBody | null {
  const changed = new Set(changedMaterialFields(original, draft));
  const body: MaterialPatchBody = {};
  if (changed.has("code")) body.code = draft.code.trim();
  if (changed.has("name")) body.name = draft.name.trim();
  if (changed.has("form")) body.form = draft.form.trim();
  if (changed.has("notes")) body.notes = draft.notes === "" ? null : draft.notes;
  const spec = buildUnitSpecPatch(original.spec, draft.spec);
  if (spec) body.default_spec = spec;
  return Object.keys(body).length > 0 ? body : null;
}

/** 생성 본문. 기본 규격은 값을 정한 필드만 보내고 모두 미정이면 생략한다(서버 기본이 미정). 비운 메모도 생략한다. */
export function buildMaterialCreate(draft: MaterialDraft): MaterialCreateBody {
  const body: MaterialCreateBody = { code: draft.code.trim(), name: draft.name.trim(), form: draft.form.trim() };
  // 전부 미정에서 시작해 바뀐 필드만 담는다(널 없이 mode만 있는 값 객체)
  const spec = buildUnitSpecPatch(toUnitSpecEdit(undefined), draft.spec);
  if (spec) body.default_spec = spec as Schemas["DefaultSpec"];
  if (draft.notes !== "") body.notes = draft.notes;
  return body;
}

export type MaterialMerge = {
  draft: MaterialDraft;
  /** 나와 서버가 모두 바꾼 항목(`code`·`name`·`form`·`notes` 또는 `spec:<필드>`)과 그때 서버 값 문구 */
  conflicts: Record<string, string>;
};

const SPEC_LABEL: Record<UnitSpecField, string> = { lengthM: "길이", weightKg: "중량", unitCount: "단위 수", strandCount: "가닥 수" };

const specText = (d: MaterialDraft, k: UnitSpecField) => {
  const v = d.spec[k];
  return v.mode === "value" ? v.value : v.mode === "not_applicable" ? "해당 없음" : "미정";
};

/** 412 충돌 후 "내 변경을 유지"할 때의 항목 단위 3-way 병합(제품·자산과 같은 원칙). 기본 규격은 네 값을 각각 병합한다. */
export function mergeMaterialDraft(original: MaterialDraft, draft: MaterialDraft, server: MaterialDraft): MaterialMerge {
  const merged: MaterialDraft = { ...server, spec: { ...server.spec } };
  const conflicts: Record<string, string> = {};
  for (const k of FIELDS) {
    if (valueOf(original, k) === valueOf(draft, k)) continue;
    merged[k] = draft[k];
    const serverChanged = valueOf(server, k) !== valueOf(original, k);
    if (serverChanged && valueOf(server, k) !== valueOf(draft, k)) conflicts[k] = valueOf(server, k) ?? "비어 있음";
  }
  for (const k of changedUnitFields(original.spec, draft.spec)) {
    merged.spec[k] = draft.spec[k];
    const serverChanged = changedUnitFields(original.spec, server.spec).includes(k);
    if (serverChanged && changedUnitFields(server.spec, draft.spec).includes(k)) conflicts[`spec:${k}`] = specText(server, k);
  }
  return { draft: merged, conflicts };
}

/** 충돌 안내용 이름 */
export function conflictLabel(key: string): string {
  if (key.startsWith("spec:")) return `기본 규격 ${SPEC_LABEL[key.slice(5) as UnitSpecField]}`;
  return { code: "표시 코드", name: "이름", form: "형태", notes: "메모" }[key] ?? key;
}

const SPEC_PATH: Record<string, UnitSpecField> = {
  length_m: "lengthM",
  weight_kg: "weightKg",
  unit_count: "unitCount",
  strand_count: "strandCount",
};

export type MappedMaterialErrors = {
  fields: Partial<Record<MaterialField, string>>;
  spec: Partial<Record<UnitSpecField, string>>;
  general: ValidationIssue[];
};

/** 저장(PATCH·POST) 오류의 field_path(요청 본문 기준)를 폼 필드·규격 입력에 연결한다. */
export function mapMaterialErrors(e: ApiError): MappedMaterialErrors {
  const fields: MappedMaterialErrors["fields"] = {};
  const spec: MappedMaterialErrors["spec"] = {};
  const general: ValidationIssue[] = [];
  for (const issue of toIssues(e)) {
    const path = issue.field_path ?? "";
    const top = /^\/(code|name|form|notes)$/.exec(path)?.[1] as MaterialField | undefined;
    const sp = /^\/default_spec\/(length_m|weight_kg|unit_count|strand_count)(\/|$)/.exec(path)?.[1];
    if (top && !(top in fields)) fields[top] = issue.message;
    else if (sp && !(SPEC_PATH[sp]! in spec)) spec[SPEC_PATH[sp]!] = issue.message;
    else general.push(issue);
  }
  if (e.code === "MATERIAL_CODE_CONFLICT" && !fields.code) fields.code = "이미 사용 중인 코드입니다.";
  return { fields, spec, general };
}

export const materialSummaryText = (m: MaterialView) =>
  `${m.code} ${m.name}`;
