import type { VersionStatus } from "../../shared/components/VersionStatusBadge";

/**
 * 화면 전용 뷰 모델. 승인된 API DTO가 아니다(계약 PENDING_REVIEW).
 * 필드는 ERD(02 §5)의 product·process_version에 있는 것만 사용한다.
 */
export type ProcessVersionView = {
  id: string;
  /** 제품 안에서 증가하는 버전 번호 */
  versionNo: number;
  status: VersionStatus;
};

export type ProductView = {
  /** 내부 고유 ID. 화면 표시 코드와 구분한다. */
  id: string;
  /** 화면 표시 코드. 프로젝트 안에서 고유하며 내부 ID가 아니다. */
  code: string;
  name: string;
  /** null은 미정, 빈 문자열은 "규격 없음"이 아니라 입력 중인 값이다. */
  specification: string | null;
  versions: ProcessVersionView[];
};

export function specificationText(spec: string | null): string {
  return spec === null ? "미정" : spec === "" ? "(비어 있음)" : spec;
}

/** 가장 높은 버전 번호의 버전. 없으면 null. */
export function latestVersion(p: ProductView): ProcessVersionView | null {
  return p.versions.reduce<ProcessVersionView | null>(
    (best, v) => (best === null || v.versionNo > best.versionNo ? v : best),
    null,
  );
}
