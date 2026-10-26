import { ApiError } from "../../shared/api/errors";
import type { Schemas } from "../../shared/api/types";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import { effectiveSpecification, specificationText, type ProductDraft, type ProductField } from "./productView";

/**
 * 제품 기본 정보 저장 규칙(계약 0.3.0 `PATCH /products/{id}`, ProductPatch).
 * - 보낸 필드만 바뀐다. 그러므로 **사용자가 바꾼 필드만** 보낸다(다른 사용자가 바꾼 값을 옛 값으로 덮어쓰지 않기 위해).
 * - `code`·`name`은 null로 지울 수 없다. `specification`·`notes`는 null이 각각 "미정"·"입력 없음"이다.
 * - 빈 문자열은 서버가 422로 거부한다. 메모를 비우면 null, 규격은 "미정"을 선택해야 null이 된다.
 */
export type ProductPatchBody = Schemas["ProductPatch"];
export type ProductCreateBody = Schemas["ProductCreate"];

const FIELDS: ProductField[] = ["code", "name", "specification", "notes"];

/** 필드 비교값. 규격은 미정 여부와 값을 하나로 본다. */
function valueOf(d: ProductDraft, k: ProductField): string | null {
  switch (k) {
    case "specification":
      return effectiveSpecification(d);
    case "notes":
      return d.notes === "" ? null : d.notes;
    default:
      return d[k];
  }
}

export function changedProductFields(original: ProductDraft, draft: ProductDraft): ProductField[] {
  return FIELDS.filter((k) => valueOf(original, k) !== valueOf(draft, k));
}

/** 서버에 보낼 변경 본문. 바뀐 필드가 없으면 null(요청을 보내지 않는다). */
export function buildProductPatch(original: ProductDraft, draft: ProductDraft): ProductPatchBody | null {
  const changed = new Set(changedProductFields(original, draft));
  const body: ProductPatchBody = {};
  if (changed.has("code")) body.code = draft.code.trim();
  if (changed.has("name")) body.name = draft.name.trim();
  if (changed.has("specification")) body.specification = effectiveSpecification(draft);
  if (changed.has("notes")) body.notes = draft.notes === "" ? null : draft.notes;
  return Object.keys(body).length > 0 ? body : null;
}

/** 생성 본문. 미정 규격·빈 메모는 생략한다(서버가 null로 저장). */
export function buildProductCreate(draft: ProductDraft): ProductCreateBody {
  const body: ProductCreateBody = { code: draft.code.trim(), name: draft.name.trim() };
  if (!draft.specUnknown) body.specification = draft.specification;
  if (draft.notes !== "") body.notes = draft.notes;
  return body;
}

export type ProductMerge = {
  /** 병합된 입력(내가 바꾼 필드는 내 값, 안 바꾼 필드는 서버의 최신 값) */
  draft: ProductDraft;
  /** 나와 서버가 모두 바꾼 필드와 그때 서버 값(화면 문구). 자동으로 해결하지 않고 사용자에게 보여 준다. */
  conflicts: Partial<Record<ProductField, string>>;
};

/** 412 충돌 후 "내 변경을 유지"할 때의 필드 단위 3-way 병합(자산 기본 정보와 같은 원칙). */
export function mergeProductDraft(original: ProductDraft, draft: ProductDraft, server: ProductDraft): ProductMerge {
  const merged: ProductDraft = { ...server };
  const conflicts: ProductMerge["conflicts"] = {};
  for (const k of FIELDS) {
    if (valueOf(original, k) === valueOf(draft, k)) continue; // 내가 안 바꾼 필드는 서버 값
    if (k === "specification") {
      merged.specUnknown = draft.specUnknown;
      merged.specification = draft.specification;
    } else merged[k] = draft[k];
    const serverChanged = valueOf(server, k) !== valueOf(original, k);
    if (serverChanged && valueOf(server, k) !== valueOf(draft, k)) {
      const v = valueOf(server, k);
      conflicts[k] = k === "specification" ? specificationText(v) : v === null || v === "" ? "비어 있음" : v;
    }
  }
  return { draft: merged, conflicts };
}

const PATH_TO_FIELD: Record<string, ProductField> = {
  "/code": "code",
  "/name": "name",
  "/specification": "specification",
  "/notes": "notes",
};

export type MappedProductErrors = {
  fields: Partial<Record<ProductField, string>>;
  general: ValidationIssue[];
};

/** 저장(PATCH·POST) 오류의 field_path(요청 본문 기준)를 폼 필드에 연결한다. */
export function mapProductErrors(e: ApiError): MappedProductErrors {
  const fields: MappedProductErrors["fields"] = {};
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
  if (e.code === "PRODUCT_CODE_CONFLICT" && !fields.code) fields.code = "이미 사용 중인 코드입니다.";
  return { fields, general };
}
