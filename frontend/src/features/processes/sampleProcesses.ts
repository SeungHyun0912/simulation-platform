import { newStep, UNKNOWN_VALUE, type ProcessVersionDetail } from "./processView";

/**
 * 정적 예시 데이터. 실제 API 응답도 승인된 계약 예제도 아니며 실제 공정이 아니다.
 * 단계 이름·설비·값은 화면 구조와 상태 표현을 보여 주기 위한 임의 값이다.
 * 제품 sampleProducts의 버전 ID와 연결된다.
 */
export const SAMPLE_PROCESS_VERSIONS: ProcessVersionDetail[] = [
  {
    // P-001 v2 (초안)
    id: "00000000-0000-4000-8000-0000000001a2",
    productId: "00000000-0000-4000-8000-0000000000c1",
    versionNo: 2,
    status: "draft",
    steps: [
      {
        ...newStep("00000000-0000-4000-8000-0000000002a1"),
        name: "예시 압출",
        equipment: { mode: "group", candidateCodes: ["EQ-001", "EQ-002"] },
        // 선속(m/분)과 산출 길이(m/보빈)는 서로 다른 값이다.
        processing: {
          kind: "output_speed",
          value: { mode: "value", value: "20", unit: "m_per_min" },
          referenceLength: UNKNOWN_VALUE("m"),
        },
        setup: { trigger: "not_applicable", duration: UNKNOWN_VALUE("min") },
        output: {
          mode: "split_length",
          unitCount: UNKNOWN_VALUE("bobbin"),
          length: { mode: "value", value: "1000", unit: "m" },
        },
        nextLocation: "ST-001",
        confirmation: "confirmed",
      },
      {
        ...newStep("00000000-0000-4000-8000-0000000002a2"),
        name: "예시 편조",
        equipment: { mode: "specific", candidateCodes: ["EQ-003"] },
        processing: {
          kind: "per_output_unit",
          value: { mode: "value", value: "22", unit: "min" },
          referenceLength: UNKNOWN_VALUE("m"),
        },
        // 준비 시점은 알지만 시간은 미정 → 0분이 아니다.
        setup: { trigger: "per_input_replacement", duration: UNKNOWN_VALUE("min") },
        output: {
          mode: "pass_through",
          unitCount: UNKNOWN_VALUE("bobbin"),
          length: UNKNOWN_VALUE("m"),
        },
        nextLocation: "ST-002",
        confirmation: "assumed",
      },
      {
        ...newStep("00000000-0000-4000-8000-0000000002a3"),
        name: "예시 검사",
      },
    ],
  },
  {
    // P-001 v1 (승인, 읽기 전용)
    id: "00000000-0000-4000-8000-0000000001a1",
    productId: "00000000-0000-4000-8000-0000000000c1",
    versionNo: 1,
    status: "approved",
    steps: [
      {
        ...newStep("00000000-0000-4000-8000-0000000002b1"),
        name: "예시 압출",
        equipment: { mode: "group", candidateCodes: ["EQ-001"] },
        processing: {
          kind: "output_speed",
          value: { mode: "value", value: "15", unit: "m_per_min" },
          referenceLength: UNKNOWN_VALUE("m"),
        },
        setup: { trigger: "not_applicable", duration: UNKNOWN_VALUE("min") },
        output: {
          mode: "configured_units",
          unitCount: { mode: "value", value: "10", unit: "bobbin" },
          length: { mode: "value", value: "300", unit: "m" },
        },
        nextLocation: "ST-001",
        confirmation: "confirmed",
      },
    ],
  },
  {
    // P-002 v1 (검토 중, 단계 없음)
    id: "00000000-0000-4000-8000-0000000001b1",
    productId: "00000000-0000-4000-8000-0000000000c2",
    versionNo: 1,
    status: "in_review",
    steps: [],
  },
];
