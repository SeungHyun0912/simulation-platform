import type { ProcessVersionView, ProductView } from "./productView";

/**
 * 정적 예시 데이터. 실제 API 응답도, 승인된 계약 예제도 아니며 실제 제품 기준정보가 아니다.
 * 화면 구조 검토용이다.
 */
function sample(
  id: string,
  code: string,
  name: string,
  specification: string | null,
  versions: ProcessVersionView[],
): ProductView {
  const latest = versions.reduce<ProcessVersionView | null>((b, v) => (!b || v.versionNo > b.versionNo ? v : b), null);
  const current = versions.find((v) => v.status === "approved") ?? null;
  const summary = (v: ProcessVersionView | null) =>
    v ? { id: v.id, versionNo: v.versionNo, status: v.status, approvedAt: null } : null;
  return {
    id,
    code,
    name,
    specification,
    notes: null,
    archivedAt: null,
    currentProcessVersion: summary(current),
    latestProcessVersion: summary(latest),
    rowVersion: 1,
    versions,
  };
}

export const SAMPLE_PRODUCTS: ProductView[] = [
  sample("00000000-0000-4000-8000-0000000000c1", "P-001", "예시 제품 가", "규격 예시 A", [
    { id: "00000000-0000-4000-8000-0000000001a1", versionNo: 1, status: "approved" },
    { id: "00000000-0000-4000-8000-0000000001a2", versionNo: 2, status: "draft" },
  ]),
  sample("00000000-0000-4000-8000-0000000000c2", "P-002", "예시 제품 나", null, [
    { id: "00000000-0000-4000-8000-0000000001b1", versionNo: 1, status: "in_review" },
  ]),
  sample("00000000-0000-4000-8000-0000000000c3", "P-003", "예시 제품 다", "규격 예시 C", []),
];
