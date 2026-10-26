import { toUnitSpecEdit } from "../processes/processView";
import type { MaterialView } from "./materialView";

/**
 * 정적 예시 데이터. 실제 API 응답도, 승인된 계약 예제도 아니며 실제 재료 기준정보가 아니다. 화면 구조 검토용이다.
 * 길이·중량·단위 수·가닥 수는 서로 환산하지 않는 별개의 값이며, 미정과 해당 없음을 구분해 보여 주는 예시를 담는다.
 */
const m = (
  id: string,
  code: string,
  name: string,
  form: string,
  defaultSpec: Parameters<typeof toUnitSpecEdit>[0],
  notes: string | null = null,
): MaterialView => ({
  id: `00000000-0000-4000-8000-0000000000${id}`,
  code,
  name,
  form,
  defaultSpec: toUnitSpecEdit(defaultSpec),
  notes,
  archivedAt: null,
  rowVersion: 1,
});

export const SAMPLE_MATERIALS: MaterialView[] = [
  // 길이·중량이 확정, 나머지는 미정
  m("d1", "M-001", "예시 도체", "릴", { length_m: { mode: "known", value: "3000" }, weight_kg: { mode: "known", value: "2000.500000" } }),
  // 보빈: 길이 확정, 단위 수 3, 중량은 해당 없음(미정과 다르다)
  m(
    "d2",
    "M-002",
    "예시 보빈 재료",
    "보빈",
    { length_m: { mode: "known", value: "1000" }, unit_count: { mode: "known", value: 3 }, weight_kg: { mode: "not_applicable" } },
    "보빈 3개 단위로 공급",
  ),
  // 모두 미정
  m("d3", "M-003", "예시 미정 재료", "릴", undefined),
  // 가닥 수만 확정
  m("d4", "M-004", "예시 편조 소재", "보빈", { strand_count: { mode: "known", value: 12 } }),
];
