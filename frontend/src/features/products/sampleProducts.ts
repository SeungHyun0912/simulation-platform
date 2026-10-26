import { SAMPLE_PROCESSES } from "../processes/sampleProcesses";
import type { ProcessVersionSummaryView, ProductView } from "./productView";

/**
 * 정적 예시 데이터. 실제 API 응답도, 승인된 계약 예제도 아니며 실제 제품 기준정보가 아니다.
 * 화면 구조 검토용이다. 공정 요약은 정적 공정 예시(sampleProcesses)에서 서버와 같은 방식으로 만든다.
 */
function summaries(productId: string): Pick<ProductView, "currentProcessVersion" | "latestProcessVersion"> {
  const mine = Object.values(SAMPLE_PROCESSES)
    .map((p) => p.version)
    .filter((v) => v.productId === productId);
  const summary = (v: (typeof mine)[number] | undefined): ProcessVersionSummaryView | null =>
    v ? { id: v.id, versionNo: v.versionNo, status: v.status, approvedAt: v.approvedAt } : null;
  const latest = mine.reduce<(typeof mine)[number] | undefined>((b, v) => (!b || v.versionNo > b.versionNo ? v : b), undefined);
  return {
    latestProcessVersion: summary(latest),
    currentProcessVersion: summary(mine.find((v) => v.status === "approved")),
  };
}

function sample(id: string, code: string, name: string, specification: string | null): ProductView {
  return { id, code, name, specification, notes: null, archivedAt: null, rowVersion: 1, ...summaries(id) };
}

export const SAMPLE_PRODUCTS: ProductView[] = [
  sample("00000000-0000-4000-8000-0000000000c1", "P-001", "예시 제품 가", "규격 예시 A"),
  sample("00000000-0000-4000-8000-0000000000c2", "P-002", "예시 제품 나", null),
  sample("00000000-0000-4000-8000-0000000000c3", "P-003", "예시 제품 다", "규격 예시 C"),
];
