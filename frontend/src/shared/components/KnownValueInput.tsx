import { useId } from "react";
import { RadioGroup } from "radix-ui";
import styles from "./KnownValueInput.module.css";
import { getUnit } from "../units/units";
import { QuantityRow, validateQuantity } from "./QuantityInput";

/**
 * 미정 / 값 있음 / 무제한 / 해당 없음 / 대기 불가를 구분하는 입력.
 * 미정은 0도 빈 문자열도 아니다. 값 있음일 때 숫자는 decimal 문자열로만 다룬다.
 */
export type KnownValueMode =
  | "unknown"
  | "value"
  | "unlimited"
  | "not_applicable"
  | "not_allowed";

/** unit은 units 속성으로 단위를 고를 때만 쓴다. 모드가 value가 아니어도 선택한 단위는 유지한다. */
export type KnownValue = { mode: KnownValueMode; value: string; unit?: string };

/** decimal: 길이·중량 등 소수 허용. integer: 개수처럼 정수만 허용. units를 쓰면 단위가 결정한다. */
export type NumberKind = "decimal" | "integer";

const MODE_LABELS: Record<KnownValueMode, string> = {
  unknown: "미정",
  value: "값 있음",
  unlimited: "무제한",
  not_applicable: "해당 없음",
  not_allowed: "대기 불가",
};

const PATTERNS: Record<NumberKind, RegExp> = {
  decimal: /^\d+(\.\d+)?$/,
  integer: /^\d+$/,
};

/** 목록·요약용 문구. 미정을 0이나 빈칸으로 보이지 않게 한다. defaultUnit은 unit이 없을 때만 쓴다. */
export function knownValueText(v: KnownValue, defaultUnit?: string): string {
  if (v.mode === "value") {
    const id = v.unit ?? defaultUnit;
    return id ? `${v.value} ${getUnit(id)?.label ?? id}` : v.value;
  }
  return MODE_LABELS[v.mode];
}

const EMPTY_MESSAGE = "값을 입력하세요. 모르는 값이면 '미정'을 선택하세요.";

/** 값 있음 모드의 입력 오류 문구. 오류가 없으면 null. v.unit이 있으면 그 단위의 규칙을 따른다. */
export function validateKnownValue(v: KnownValue, kind: NumberKind = "decimal"): string | null {
  if (v.mode !== "value") return null;
  if (v.value.trim() === "") return EMPTY_MESSAGE;
  if (v.unit) return validateQuantity({ amount: v.value, unit: v.unit });
  if (!PATTERNS[kind].test(v.value)) {
    return kind === "integer"
      ? "0 이상의 정수만 입력할 수 있습니다."
      : "0 이상의 숫자만 입력할 수 있습니다.";
  }
  return null;
}

type Props = {
  label: string;
  value: KnownValue;
  onChange: (next: KnownValue) => void;
  /** 이 필드에서 허용하는 상태. 계약이 허용하지 않는 상태는 노출하지 않는다. */
  allowedModes?: KnownValueMode[];
  /** 고정 단위 표시 문구 */
  unit?: string;
  numberKind?: NumberKind;
  /** 선택 가능한 단위 id 목록(shared/units). 지정하면 unit·numberKind보다 우선한다. */
  units?: string[];
  /**
   * 필드별 검증. 지정하면 기본 검증 대신 쓴다(값 있음 모드에서만 호출).
   * 예: 용량은 0을 허용하지 않는다. 공정의 "준비 0분"처럼 0이 유효한 필드는 지정하지 않는다.
   */
  validator?: (v: KnownValue) => string | null;
  disabled?: boolean;
};

export function KnownValueInput({
  label,
  value,
  onChange,
  allowedModes = ["unknown", "value"],
  unit,
  numberKind = "decimal",
  units,
  validator,
  disabled,
}: Props) {
  const id = useId();
  const effectiveUnit = units ? (value.unit ?? units[0]) : undefined;
  const effective: KnownValue = effectiveUnit ? { ...value, unit: effectiveUnit } : value;
  const error =
    validator && effective.mode === "value" ? validator(effective) : validateKnownValue(effective, numberKind);
  const errorId = `${id}-error`;

  return (
    <fieldset className={styles.field} disabled={disabled}>
      <legend className={styles.legend}>{label}</legend>
      <RadioGroup.Root
        className={styles.modes}
        aria-label={`${label} 상태`}
        value={value.mode}
        onValueChange={(mode) =>
          onChange({ mode: mode as KnownValueMode, value: "", unit: effectiveUnit })
        }
      >
        {allowedModes.map((mode) => (
          <label key={mode} className={styles.mode}>
            <RadioGroup.Item className={styles.radio} value={mode} />
            {MODE_LABELS[mode]}
          </label>
        ))}
      </RadioGroup.Root>
      {value.mode === "value" &&
        (units && effectiveUnit ? (
          <QuantityRow
            label={label}
            units={units}
            value={{ amount: value.value, unit: effectiveUnit }}
            onChange={(q) => onChange({ mode: "value", value: q.amount, unit: q.unit })}
            error={error}
            errorId={errorId}
          />
        ) : (
          <div className={styles.valueRow}>
            <input
              className={styles.input}
              inputMode={numberKind === "integer" ? "numeric" : "decimal"}
              aria-label={`${label} 값`}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              value={value.value}
              onChange={(e) => onChange({ mode: "value", value: e.target.value })}
            />
            {unit && <span className={styles.unit}>{unit}</span>}
          </div>
        ))}
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
