import type { ProductView } from "./productView";

/**
 * 정적 예시 데이터. 실제 API 응답도, 승인된 계약 예제도 아니며 실제 제품 기준정보가 아니다.
 * 화면 구조 검토용이다.
 */
export const SAMPLE_PRODUCTS: ProductView[] = [
  {
    id: "00000000-0000-4000-8000-0000000000c1",
    code: "P-001",
    name: "예시 제품 가",
    specification: "규격 예시 A",
    versions: [
      { id: "00000000-0000-4000-8000-0000000001a1", versionNo: 1, status: "approved" },
      { id: "00000000-0000-4000-8000-0000000001a2", versionNo: 2, status: "draft" },
    ],
  },
  {
    id: "00000000-0000-4000-8000-0000000000c2",
    code: "P-002",
    name: "예시 제품 나",
    specification: null,
    versions: [{ id: "00000000-0000-4000-8000-0000000001b1", versionNo: 1, status: "in_review" }],
  },
  {
    id: "00000000-0000-4000-8000-0000000000c3",
    code: "P-003",
    name: "예시 제품 다",
    specification: "규격 예시 C",
    versions: [],
  },
];
