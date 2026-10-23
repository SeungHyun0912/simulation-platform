/**
 * 단위 레지스트리. 길이·중량·시간·선속·개수는 차원이 다르며 서로 변환하지 않는다.
 * 보빈 수·가닥 수·개수도 서로 다른 단위로 둔다(혼용 방지).
 * 승인된 계약의 단위 코드가 정해지면 id를 계약 값에 맞춘다. 현재 id는 03 계약 §3의 예시와 화면용 값이다.
 */
export type Dimension = "count" | "length" | "weight" | "area" | "time" | "speed";

export type UnitDef = {
  id: string;
  label: string;
  dimension: Dimension;
  /** true면 정수만 허용(개수 계열). false면 decimal 문자열 허용. */
  integer: boolean;
  /** 기준을 구분해 주는 보조 설명 */
  hint?: string;
};

export const UNITS: readonly UnitDef[] = [
  { id: "item", label: "개", dimension: "count", integer: true },
  { id: "bobbin", label: "보빈", dimension: "count", integer: true },
  { id: "strand", label: "가닥", dimension: "count", integer: true },
  { id: "bobbin_slot", label: "보빈 슬롯", dimension: "count", integer: true },
  { id: "pallet_slot", label: "팔레트 슬롯", dimension: "count", integer: true },
  { id: "m", label: "m", dimension: "length", integer: false },
  { id: "kg", label: "kg", dimension: "weight", integer: false },
  { id: "m2", label: "㎡", dimension: "area", integer: false },
  { id: "min", label: "분", dimension: "time", integer: false },
  { id: "m_per_min", label: "m/분", dimension: "speed", integer: false, hint: "분당 처리 길이" },
];

const BY_ID = new Map(UNITS.map((u) => [u.id, u]));

export function getUnit(id: string): UnitDef | undefined {
  return BY_ID.get(id);
}
