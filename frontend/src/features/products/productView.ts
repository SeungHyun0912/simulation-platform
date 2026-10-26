import type { VersionStatus } from "../../shared/components/VersionStatusBadge";

/**
 * 화면 전용 뷰 모델. 계약 0.4.0의 Product 응답을 화면에 맞게 옮긴 것이다(API DTO 그대로가 아니다).
 * 공정 버전은 아직 화면이 정적 예시라서, 목록·상세에는 서버가 주는 요약(현재 승인본·최신 버전)만 쓴다.
 */
export type ProcessVersionView = {
  id: string;
  /** 제품 안에서 증가하는 버전 번호 */
  versionNo: number;
  status: VersionStatus;
};

/** 제품 응답의 `current_process_version`/`latest_process_version` 요약 */
export type ProcessVersionSummaryView = {
  id: string;
  versionNo: number;
  /** 서버 값 그대로. draft|in_review|approved|superseded 외의 값도 올 수 있다. */
  status: string;
  approvedAt: string | null;
};

export type ProductView = {
  /** 내부 고유 ID. 화면 표시 코드와 구분한다. */
  id: string;
  /** 화면 표시 코드. 프로젝트 안에서 고유하며 내부 ID가 아니다. */
  code: string;
  name: string;
  /** null은 미정, 빈 문자열은 "규격 없음"이 아니라 입력 중인 값이다. */
  specification: string | null;
  /** null은 입력 없음 */
  notes: string | null;
  /** 보관된 제품이면 ISO8601 UTC */
  archivedAt: string | null;
  /** 현재 승인본 요약. 없으면 null */
  currentProcessVersion: ProcessVersionSummaryView | null;
  /** 가장 최근 버전 요약(열린 버전 포함). 없으면 null */
  latestProcessVersion: ProcessVersionSummaryView | null;
  rowVersion: number;
  /**
   * 정적 예시 전용: 정적 공정 편집 화면으로 연결되는 버전 목록. API 모드에서는 항상 빈 배열이며
   * 정적 공정 화면과 서버 데이터를 섞어 보여 주지 않는다.
   */
  versions: ProcessVersionView[];
};

export function specificationText(spec: string | null): string {
  return spec === null ? "미정" : spec === "" ? "(비어 있음)" : spec;
}

/** 가장 높은 버전 번호의 버전(정적 예시용). 없으면 null. */
export function latestVersion(p: ProductView): ProcessVersionView | null {
  return p.versions.reduce<ProcessVersionView | null>(
    (best, v) => (best === null || v.versionNo > best.versionNo ? v : best),
    null,
  );
}

/* ---------------- 기본 정보 입력 ---------------- */

export const PRODUCT_LIMITS = { code: 64, name: 200, specification: 4000, notes: 4000 } as const;

/**
 * 입력 중인 폼. 규격은 "미정"(null)과 입력 값을 따로 둔다: 미정이면 값을 보내지 않거나 null로 보내고,
 * 미정이 아닌데 비어 있으면 오류다(빈 문자열은 서버가 422로 거부하며 미정이 아니다).
 */
export type ProductDraft = {
  code: string;
  name: string;
  specUnknown: boolean;
  specification: string;
  notes: string;
};

export type ProductField = "code" | "name" | "specification" | "notes";
export type ProductErrors = Partial<Record<ProductField, string>>;

/** 새 제품의 시작값: 규격은 미정으로 시작한다(0이나 빈 값으로 채우지 않는다). */
export const EMPTY_PRODUCT_DRAFT: ProductDraft = {
  code: "",
  name: "",
  specUnknown: true,
  specification: "",
  notes: "",
};

export function toProductDraft(p: ProductView): ProductDraft {
  return {
    code: p.code,
    name: p.name,
    specUnknown: p.specification === null,
    specification: p.specification ?? "",
    notes: p.notes ?? "",
  };
}

/** 서버에 보낼 규격 값: 미정이면 null */
export const effectiveSpecification = (d: ProductDraft): string | null => (d.specUnknown ? null : d.specification);

export function validateProductDraft(d: ProductDraft): ProductErrors {
  const e: ProductErrors = {};
  const code = d.code.trim();
  if (code === "") e.code = "표시 코드를 입력하세요.";
  else if (code.length > PRODUCT_LIMITS.code) e.code = `표시 코드는 ${PRODUCT_LIMITS.code}자 이하여야 합니다.`;
  const name = d.name.trim();
  if (name === "") e.name = "이름을 입력하세요.";
  else if (name.length > PRODUCT_LIMITS.name) e.name = `이름은 ${PRODUCT_LIMITS.name}자 이하여야 합니다.`;
  if (!d.specUnknown) {
    if (d.specification.trim() === "") e.specification = "규격을 입력하거나 '규격 미정'을 선택하세요.";
    else if (d.specification.length > PRODUCT_LIMITS.specification)
      e.specification = `규격은 ${PRODUCT_LIMITS.specification.toLocaleString("ko-KR")}자 이하여야 합니다.`;
  }
  if (d.notes.length > PRODUCT_LIMITS.notes) e.notes = `메모는 ${PRODUCT_LIMITS.notes.toLocaleString("ko-KR")}자 이하여야 합니다.`;
  return e;
}
