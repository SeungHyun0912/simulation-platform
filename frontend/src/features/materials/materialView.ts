import type { Schemas } from "../../shared/api/types";
import {
  toUnitSpecEdit,
  validateUnitSpec,
  type UnitSpecEdit,
  type UnitSpecField,
} from "../processes/processView";

/**
 * 재료 화면 모델(계약 0.3.0 `products-materials`). 재료는 버전이 없는 기준정보이며 항상 수정할 수 있다(권한이 있으면).
 * 기본 규격 `default_spec`은 길이·중량·단위 수·가닥 수 네 값이며 서로 환산하지 않는다. 각 값은 미정(기본)·값 있음·해당 없음이다.
 * 공정의 원자재·완제품 단위와 같은 값 객체라 같은 입력 컴포넌트를 쓴다.
 */
export type MaterialView = {
  id: string;
  /** 화면 표시 코드. 프로젝트 안에서 고유하다(제품 코드와는 서로 독립). */
  code: string;
  name: string;
  /** 자유 텍스트 1~100자(허용값 목록 없음). 예: 보빈, 릴 */
  form: string;
  defaultSpec: UnitSpecEdit;
  /** null은 입력 없음 */
  notes: string | null;
  archivedAt: string | null;
  rowVersion: number;
};

export const MATERIAL_LIMITS = { code: 64, name: 200, form: 100, notes: 4000 } as const;

export type MaterialField = "code" | "name" | "form" | "notes";

/** 입력 중인 폼. 기본 규격은 서버 값 객체 형태가 아니라 화면 입력(KnownValue)으로 들고 있다. */
export type MaterialDraft = {
  code: string;
  name: string;
  form: string;
  notes: string;
  spec: UnitSpecEdit;
};

export type MaterialErrors = { fields: Partial<Record<MaterialField, string>>; spec: Partial<Record<UnitSpecField, string>> };

/** 새 재료의 시작값: 규격은 모두 미정(0이나 빈 값으로 채우지 않는다). */
export const EMPTY_MATERIAL_DRAFT: MaterialDraft = {
  code: "",
  name: "",
  form: "",
  notes: "",
  spec: toUnitSpecEdit(undefined),
};

export function toMaterialDraft(m: MaterialView): MaterialDraft {
  return { code: m.code, name: m.name, form: m.form, notes: m.notes ?? "", spec: m.defaultSpec };
}

export function toMaterialSpec(s: Schemas["DefaultSpec"] | undefined) {
  return toUnitSpecEdit(s);
}

export function validateMaterialDraft(d: MaterialDraft): MaterialErrors {
  const fields: MaterialErrors["fields"] = {};
  const code = d.code.trim();
  if (code === "") fields.code = "표시 코드를 입력하세요.";
  else if (code.length > MATERIAL_LIMITS.code) fields.code = `표시 코드는 ${MATERIAL_LIMITS.code}자 이하여야 합니다.`;
  const name = d.name.trim();
  if (name === "") fields.name = "이름을 입력하세요.";
  else if (name.length > MATERIAL_LIMITS.name) fields.name = `이름은 ${MATERIAL_LIMITS.name}자 이하여야 합니다.`;
  const form = d.form.trim();
  if (form === "") fields.form = "형태를 입력하세요(예: 보빈).";
  else if (form.length > MATERIAL_LIMITS.form) fields.form = `형태는 ${MATERIAL_LIMITS.form}자 이하여야 합니다.`;
  if (d.notes.length > MATERIAL_LIMITS.notes) fields.notes = `메모는 ${MATERIAL_LIMITS.notes.toLocaleString("ko-KR")}자 이하여야 합니다.`;
  return { fields, spec: validateUnitSpec(d.spec) };
}

export const hasMaterialErrors = (e: MaterialErrors) => Object.keys(e.fields).length + Object.keys(e.spec).length > 0;
