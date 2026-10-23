import { ApiError } from "../../shared/api/errors";
import type { Schemas } from "../../shared/api/types";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import type { AssetKind, InfoDraft } from "./assetView";

/**
 * 자산 기본 정보 저장 규칙(계약 0.2.0 `PATCH /assets/{id}`, AssetPatch).
 * - 보낸 필드만 바뀐다. 그러므로 **사용자가 바꾼 필드만** 보낸다(다른 사용자가 바꾼 값을 옛 값으로 덮어쓰지 않기 위해).
 * - `code`·`name`·`sort_order`·`equipment`·`space`는 null로 지울 수 없다. `external_ref`·`notes`·`model_name`은 null이 "입력 없음"이다.
 * - 빈 문자열은 null이 아니며 서버가 422로 거부한다. 선택 필드를 비우면 null(입력 없음)로 보낸다.
 * - `kind`·포트는 PATCH 대상이 아니다.
 */
export type AssetPatchBody = Schemas["AssetPatch"];

const FIELDS: (keyof InfoDraft)[] = [
  "code",
  "name",
  "sortOrder",
  "externalRef",
  "notes",
  "equipmentType",
  "modelName",
  "spaceType",
];

/** 필드가 바뀌었는지. 화면 입력은 문자열이라 문자열로 비교한다. */
export function changedFields(original: InfoDraft, draft: InfoDraft): (keyof InfoDraft)[] {
  return FIELDS.filter((k) => original[k] !== draft[k]);
}

/** 서버에 보낼 변경 본문. 바뀐 필드가 없으면 null(요청을 보내지 않는다). */
export function buildAssetPatch(original: InfoDraft, draft: InfoDraft, kind: AssetKind): AssetPatchBody | null {
  const changed = new Set(changedFields(original, draft));
  const body: AssetPatchBody = {};
  if (changed.has("code")) body.code = draft.code.trim();
  if (changed.has("name")) body.name = draft.name.trim();
  if (changed.has("sortOrder")) body.sort_order = Number(draft.sortOrder);
  if (changed.has("externalRef")) body.external_ref = draft.externalRef === "" ? null : draft.externalRef;
  if (changed.has("notes")) body.notes = draft.notes === "" ? null : draft.notes;
  if (kind === "equipment") {
    const eq: NonNullable<AssetPatchBody["equipment"]> = {};
    if (changed.has("equipmentType")) eq.equipment_type = draft.equipmentType.trim();
    if (changed.has("modelName")) eq.model_name = draft.modelName === "" ? null : draft.modelName;
    if (Object.keys(eq).length > 0) body.equipment = eq;
  } else if (changed.has("spaceType")) {
    body.space = { space_type: draft.spaceType.trim() };
  }
  return Object.keys(body).length > 0 ? body : null;
}

export type AssetCreateBody = Schemas["AssetCreate"];

/**
 * 생성 본문(계약 `AssetCreate`). 포트는 보내지 않는다(서버가 kind에 맞춰 같은 트랜잭션에서 만든다).
 * kind에 맞는 상세 객체만 보내며 선택 필드는 비어 있으면 생략한다(빈 문자열은 서버가 422로 거부).
 */
export function buildAssetCreate(draft: InfoDraft, kind: AssetKind): AssetCreateBody {
  const body: AssetCreateBody = {
    kind,
    code: draft.code.trim(),
    name: draft.name.trim(),
    sort_order: Number(draft.sortOrder),
  };
  if (draft.externalRef !== "") body.external_ref = draft.externalRef;
  if (draft.notes !== "") body.notes = draft.notes;
  if (kind === "equipment")
    body.equipment = {
      equipment_type: draft.equipmentType.trim(),
      ...(draft.modelName !== "" ? { model_name: draft.modelName } : {}),
    };
  else body.space = { space_type: draft.spaceType.trim() };
  return body;
}

export const EMPTY_INFO_DRAFT: InfoDraft = {
  code: "",
  name: "",
  sortOrder: "0",
  externalRef: "",
  notes: "",
  equipmentType: "",
  modelName: "",
  spaceType: "",
};

export type MergeResult = {
  /** 병합된 입력(내가 바꾼 필드는 내 값, 안 바꾼 필드는 서버의 최신 값) */
  draft: InfoDraft;
  /** 나와 서버가 모두 바꾼 필드와 그때 서버 값. 자동으로 해결하지 않고 사용자에게 보여 준다. */
  conflicts: Partial<Record<keyof InfoDraft, string>>;
};

/**
 * 412 충돌 후 "내 변경을 유지"할 때의 필드 단위 3-way 병합.
 * - 내가 안 바꾼 필드: 서버 최신 값을 따른다(옛 값으로 되돌려 보내지 않음).
 * - 내가 바꾼 필드: 내 값을 유지한다. 서버도 다른 값으로 바꿨다면 conflicts에 서버 값을 알려 준다.
 * 어느 쪽도 자동으로 덮어쓰지 않고, 병합 결과를 사용자가 확인한 뒤 새 버전 번호로 다시 저장한다.
 */
export function mergeInfoDraft(original: InfoDraft, draft: InfoDraft, server: InfoDraft): MergeResult {
  const merged = { ...server };
  const conflicts: MergeResult["conflicts"] = {};
  for (const k of FIELDS) {
    const mine = original[k] !== draft[k];
    if (!mine) continue;
    merged[k] = draft[k];
    const serverChanged = server[k] !== original[k];
    if (serverChanged && server[k] !== draft[k]) conflicts[k] = server[k];
  }
  return { draft: merged, conflicts };
}

/** 요청 본문의 JSON Pointer → 화면 필드 */
const PATH_TO_FIELD: Record<string, keyof InfoDraft> = {
  "/code": "code",
  "/name": "name",
  "/sort_order": "sortOrder",
  "/external_ref": "externalRef",
  "/notes": "notes",
  "/equipment/equipment_type": "equipmentType",
  "/equipment/model_name": "modelName",
  "/space/space_type": "spaceType",
};

export type MappedErrors = {
  fields: Partial<Record<keyof InfoDraft, string>>;
  /** 화면 필드에 대응하지 못한 오류(본문 전체 규칙 위반 `/` 등) */
  general: ValidationIssue[];
};

/**
 * 서버 오류의 details를 폼 필드에 연결한다. field_path는 요청 본문 기준이다
 * (쿼리·헤더 오류와 이름이 겹칠 수 있어 이 함수는 저장(PATCH·POST) 요청의 오류에만 쓴다).
 */
export function mapServerErrors(e: ApiError): MappedErrors {
  const fields: MappedErrors["fields"] = {};
  const general: ValidationIssue[] = [];
  for (const d of e.details) {
    const field = d.field_path ? PATH_TO_FIELD[d.field_path] : undefined;
    if (field && !(field in fields)) fields[field] = d.message;
    else
      general.push({
        severity: d.severity === "warning" ? "warning" : "error",
        message: d.message,
        ...(d.field_path ? { field_path: d.field_path } : {}),
        ...(d.rule_id ? { rule_id: d.rule_id } : {}),
        ...(d.resolution ? { resolution: d.resolution } : {}),
      });
  }
  // 코드 중복은 details가 없을 수도 있어 최상위 코드로도 코드 필드에 연결한다.
  if (e.code === "ASSET_CODE_CONFLICT" && !fields.code) fields.code = "이미 사용 중인 코드입니다.";
  return { fields, general };
}
