import {
  knownValueText,
  validateKnownValue,
  type KnownValue,
} from "../../shared/components/KnownValueInput";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import type { VersionStatus } from "../../shared/components/VersionStatusBadge";

/**
 * 초안 UI용 뷰 모델. 03 계약 §4~7(PROPOSED)의 필드를 화면용으로 단순화한 것이며
 * 승인된 API DTO가 아니다. 계약이 승인되면 필드·열거값이 바뀔 수 있다.
 * 공정 계산의 기준 구현은 백엔드에 있고, 이 파일의 검증은 입력 형식 검사일 뿐이다.
 */
export type ProcessingKind =
  | "unknown"
  | "none"
  | "output_speed"
  | "per_output_unit"
  | "per_reference_length";

export type SetupTrigger =
  | "unknown"
  | "not_applicable"
  | "per_operation"
  | "per_input_replacement"
  | "per_output_replacement"
  | "on_product_change"
  | "on_shift_start"
  | "once_per_run";

export type OutputMode = "unknown" | "configured_units" | "split_length" | "pass_through";

export type Confirmation = "confirmed" | "unknown" | "assumed";

export type StepView = {
  /** 클라이언트가 만드는 UUID. 새 단계도 저장 전에 부여한다. */
  id: string;
  name: string;
  equipment: {
    /** group: 후보 중 자동 배정, specific: 특정 설비 지정 */
    mode: "group" | "specific";
    /** 설비 표시 코드(내부 ID가 아님). 같은 설비를 여러 단계에서 써도 하나의 자원이다. */
    candidateCodes: string[];
  };
  processing: { kind: ProcessingKind; value: KnownValue; referenceLength: KnownValue };
  setup: { trigger: SetupTrigger; duration: KnownValue };
  output: { mode: OutputMode; unitCount: KnownValue; length: KnownValue };
  /** 다음 위치(저장공간 표시 코드). null은 미정. */
  nextLocation: string | null;
  confirmation: Confirmation;
};

export type ProcessVersionDetail = {
  id: string;
  productId: string;
  versionNo: number;
  status: VersionStatus;
  steps: StepView[];
};

export const PROCESSING_LABELS: Record<ProcessingKind, string> = {
  unknown: "미정",
  none: "처리 시간 없음",
  output_speed: "산출 선속 (m/분)",
  per_output_unit: "산출 단위당 시간 (분)",
  per_reference_length: "기준 길이당 시간",
};

export const TRIGGER_LABELS: Record<SetupTrigger, string> = {
  unknown: "미정",
  not_applicable: "해당 없음",
  per_operation: "작업마다",
  per_input_replacement: "투입 교체마다",
  per_output_replacement: "산출 교체마다",
  on_product_change: "제품 교체 시",
  on_shift_start: "근무 시작 시",
  once_per_run: "실행당 한 번",
};

export const OUTPUT_LABELS: Record<OutputMode, string> = {
  unknown: "미정",
  configured_units: "산출 수량 지정",
  split_length: "길이 분할",
  pass_through: "그대로 유지",
};

export const CONFIRMATION_LABELS: Record<Confirmation, string> = {
  confirmed: "확인됨",
  unknown: "미확인",
  assumed: "가정",
};

export const UNKNOWN_VALUE = (unit: string): KnownValue => ({ mode: "unknown", value: "", unit });

export function newStep(id: string): StepView {
  return {
    id,
    name: "",
    equipment: { mode: "group", candidateCodes: [] },
    processing: {
      kind: "unknown",
      value: UNKNOWN_VALUE("m_per_min"),
      referenceLength: UNKNOWN_VALUE("m"),
    },
    setup: { trigger: "unknown", duration: UNKNOWN_VALUE("min") },
    output: { mode: "unknown", unitCount: UNKNOWN_VALUE("bobbin"), length: UNKNOWN_VALUE("m") },
    nextLocation: null,
    confirmation: "unknown",
  };
}

/** 처리 방식에 따라 값이 해석되는 단위. 같은 숫자라도 선속과 시간은 다른 값이다. */
export function processingValueUnit(kind: ProcessingKind): string | null {
  if (kind === "output_speed") return "m_per_min";
  if (kind === "per_output_unit" || kind === "per_reference_length") return "min";
  return null;
}

export function equipmentText(e: StepView["equipment"]): string {
  if (e.candidateCodes.length === 0) return "후보 없음";
  const codes = e.candidateCodes.join(", ");
  return e.mode === "specific" ? `지정: ${codes}` : `후보 그룹: ${codes}`;
}

export function processingText(p: StepView["processing"]): string {
  switch (p.kind) {
    case "unknown":
      return "미정";
    case "none":
      return "처리 시간 없음";
    case "output_speed":
      return `${knownValueText(p.value, "m_per_min")} (산출 기준)`;
    case "per_output_unit":
      return `산출 단위당 ${knownValueText(p.value, "min")}`;
    case "per_reference_length":
      return `기준 ${knownValueText(p.referenceLength, "m")}당 ${knownValueText(p.value, "min")}`;
  }
}

export function setupText(s: StepView["setup"]): string {
  if (s.trigger === "not_applicable") return "없음";
  if (s.trigger === "unknown") return "미정";
  return `${knownValueText(s.duration, "min")} · ${TRIGGER_LABELS[s.trigger]}`;
}

export function outputText(o: StepView["output"]): string {
  switch (o.mode) {
    case "unknown":
      return "미정";
    case "pass_through":
      return "길이·수량 유지";
    case "split_length":
      return `${knownValueText(o.length, "m")}씩 분할`;
    case "configured_units":
      return `${knownValueText(o.length, "m")} × ${knownValueText(o.unitCount, "bobbin")}`;
  }
}

/** 단계 하나의 입력 검증. 오류는 입력 형식 문제, 경고는 실행 전에 해소해야 하는 미정 값이다. */
/** order는 표에 보이는 1부터 시작하는 순서이며 field_path에 쓴다(내부 ID 대신 사람이 읽을 수 있는 위치). */
export function validateStep(step: StepView, order: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const label = step.name.trim() || "(이름 없음)";
  const path = (p: string) => `/steps/${order}${p}`;
  const err = (message: string, field: string) =>
    issues.push({ severity: "error", message: `${label}: ${message}`, field_path: path(field) });
  const warn = (message: string, field: string) =>
    issues.push({ severity: "warning", message: `${label}: ${message}`, field_path: path(field) });

  if (step.name.trim() === "") err("공정명을 입력하세요.", "/name");

  if (step.equipment.mode === "specific" && step.equipment.candidateCodes.length !== 1)
    err("특정 설비 지정은 설비를 정확히 하나 선택해야 합니다.", "/equipment");
  else if (step.equipment.candidateCodes.length === 0)
    warn("설비 후보가 없습니다. 실행 전에 지정해야 합니다.", "/equipment");

  const checkValue = (v: KnownValue, name: string, field: string) => {
    const e = validateKnownValue(v);
    if (e) err(`${name}: ${e}`, field);
    else if (v.mode === "unknown") warn(`${name}이(가) 미정입니다.`, field);
  };

  const p = step.processing;
  if (p.kind === "unknown") warn("처리 방식이 미정입니다.", "/processing");
  if (p.kind === "output_speed") checkValue(p.value, "선속", "/processing/value");
  if (p.kind === "per_output_unit") checkValue(p.value, "산출 단위당 시간", "/processing/value");
  if (p.kind === "per_reference_length") {
    checkValue(p.referenceLength, "기준 길이", "/processing/reference_length_m");
    checkValue(p.value, "기준 길이당 시간", "/processing/value");
  }

  if (step.setup.trigger === "unknown") warn("준비 시점이 미정입니다.", "/setup/trigger");
  else if (step.setup.trigger !== "not_applicable")
    checkValue(step.setup.duration, "준비 시간", "/setup/duration");

  const o = step.output;
  if (o.mode === "unknown") warn("산출 방식이 미정입니다.", "/output");
  if (o.mode === "configured_units" || o.mode === "split_length")
    checkValue(o.length, "산출 길이", "/output/length");
  if (o.mode === "configured_units") checkValue(o.unitCount, "산출 수량", "/output/unit_count");

  if (step.nextLocation === null) warn("다음 위치가 미정입니다.", "/next_location");
  if (step.confirmation === "unknown") warn("확인 상태가 미확인입니다.", "/confirmation");
  return issues;
}
