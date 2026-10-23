import type { AssetView } from "./assetView";

/**
 * 정적 예시 데이터. 실제 API 응답도, 승인된 계약 예제도 아니다.
 * 화면 구조 검토용이며 이름·용량 값은 실제 기준정보가 아니다.
 */
const inOut = [
  { kind: "IN", placement: "unknown" },
  { kind: "OUT", placement: "unknown" },
] as const;

export const SAMPLE_ASSETS: AssetView[] = [
  {
    id: "00000000-0000-4000-8000-0000000000a1",
    code: "EQ-001",
    name: "예시 절연 압출기",
    kind: "equipment",
    model: "",
    group: "",
    status: "draft",
    capacity: { mode: "unknown", value: "", unit: "item" },
    ports: [...inOut],
  },
  {
    id: "00000000-0000-4000-8000-0000000000a2",
    code: "EQ-002",
    name: "예시 쉬스 압출기",
    kind: "equipment",
    model: "모델 미정",
    group: "압출",
    status: "approved",
    capacity: { mode: "value", value: "2", unit: "item" },
    ports: [...inOut],
  },
  {
    id: "00000000-0000-4000-8000-0000000000a3",
    code: "EQ-003",
    name: "예시 편조기",
    kind: "equipment",
    model: "",
    group: "편조",
    status: "in_review",
    capacity: { mode: "not_allowed", value: "", unit: "item" },
    ports: [...inOut],
  },
  {
    id: "00000000-0000-4000-8000-0000000000b1",
    code: "ST-001",
    name: "예시 원자재 저장공간",
    kind: "storage",
    model: "",
    group: "",
    status: "draft",
    capacity: { mode: "unlimited", value: "", unit: "item" },
    ports: [{ kind: "ACCESS", placement: "unknown" }],
  },
  {
    id: "00000000-0000-4000-8000-0000000000b2",
    code: "ST-002",
    name: "예시 도킹 A",
    kind: "dock",
    model: "",
    group: "",
    status: "draft",
    // 도킹이라고 해서 적재 용량을 무제한으로 가정하지 않는다.
    capacity: { mode: "unknown", value: "", unit: "item" },
    ports: [{ kind: "ACCESS", placement: "unknown" }],
  },
];
