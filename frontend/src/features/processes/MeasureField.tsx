import { KnownValueInput, type KnownValueMode } from "../../shared/components/KnownValueInput";
import {
  knownToCount,
  knownToDecimal,
  measureToKnown,
  validateMeasure,
  type CountMeasure,
  type DecimalMeasure,
  type MeasureKind,
} from "./processDoc";

const MODES: KnownValueMode[] = ["unknown", "value", "not_applicable"];
const MODES_NO_NA: KnownValueMode[] = ["unknown", "value"];

/**
 * 서버 decimal 측정값(`{mode: unknown|known|not_applicable, value}`) 입력. 미정은 0도 빈 값도 아니다.
 * 처리 시간·선속·길이는 0 초과, 준비·대기 시간(`nonnegative`)만 0이 유효하다.
 */
export function MeasureField({
  label,
  value,
  unit,
  kind,
  onChange,
  allowNotApplicable = true,
  disabled,
}: {
  label: string;
  value: DecimalMeasure | null | undefined;
  /** 단위 id(shared/units) */
  unit: string;
  kind: Exclude<MeasureKind, "count">;
  onChange: (next: DecimalMeasure) => void;
  allowNotApplicable?: boolean;
  disabled?: boolean;
}) {
  return (
    <KnownValueInput
      label={label}
      value={measureToKnown(value, unit)}
      allowedModes={allowNotApplicable ? MODES : MODES_NO_NA}
      units={[unit]}
      validator={(v) => validateMeasure(v, kind)}
      onChange={(next) => onChange(knownToDecimal(next))}
      disabled={disabled}
    />
  );
}

/** 서버 개수 측정값 입력: **JSON 정수**(1 이상). 입력 중인 잘못된 값은 지우지 않고 저장 전 검증이 막는다. */
export function CountField({
  label,
  value,
  unitLabel = "단위",
  onChange,
  allowNotApplicable = false,
  disabled,
}: {
  label: string;
  value: CountMeasure | null | undefined;
  unitLabel?: string;
  onChange: (next: CountMeasure) => void;
  allowNotApplicable?: boolean;
  disabled?: boolean;
}) {
  return (
    <KnownValueInput
      label={label}
      value={measureToKnown(value, "item")}
      allowedModes={allowNotApplicable ? MODES : MODES_NO_NA}
      unit={unitLabel}
      numberKind="integer"
      validator={(v) => validateMeasure(v, "count")}
      onChange={(next) => onChange(knownToCount(next))}
      disabled={disabled}
    />
  );
}
