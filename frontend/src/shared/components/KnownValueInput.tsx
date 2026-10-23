import { useId } from "react";
import { RadioGroup } from "radix-ui";
import styles from "./KnownValueInput.module.css";

/**
 * 미정 / 값 있음 / 무제한 / 해당 없음을 구분하는 입력.
 * 미정은 0도 빈 문자열도 아니다. 값 있음일 때 숫자는 decimal 문자열로만 다룬다.
 */
export type KnownValueMode = "unknown" | "value" | "unlimited" | "not_applicable";

export type KnownValue = { mode: KnownValueMode; value: string };

const MODE_LABELS: Record<KnownValueMode, string> = {
  unknown: "미정",
  value: "값 있음",
  unlimited: "무제한",
  not_applicable: "해당 없음",
};

const DECIMAL = /^\d+(\.\d+)?$/;

/** 값 있음 모드의 입력 오류 문구. 오류가 없으면 null. */
export function validateKnownValue(v: KnownValue): string | null {
  if (v.mode !== "value") return null;
  if (v.value.trim() === "") return "값을 입력하세요. 모르는 값이면 '미정'을 선택하세요.";
  if (!DECIMAL.test(v.value)) return "0 이상의 숫자만 입력할 수 있습니다.";
  return null;
}

type Props = {
  label: string;
  value: KnownValue;
  onChange: (next: KnownValue) => void;
  /** 이 필드에서 허용하는 상태. 계약이 허용하지 않는 상태는 노출하지 않는다. */
  allowedModes?: KnownValueMode[];
  unit?: string;
  disabled?: boolean;
};

export function KnownValueInput({
  label,
  value,
  onChange,
  allowedModes = ["unknown", "value"],
  unit,
  disabled,
}: Props) {
  const id = useId();
  const error = validateKnownValue(value);
  const errorId = `${id}-error`;

  return (
    <fieldset className={styles.field} disabled={disabled}>
      <legend className={styles.legend}>{label}</legend>
      <RadioGroup.Root
        className={styles.modes}
        aria-label={`${label} 상태`}
        value={value.mode}
        onValueChange={(mode) => onChange({ mode: mode as KnownValueMode, value: "" })}
      >
        {allowedModes.map((mode) => (
          <label key={mode} className={styles.mode}>
            <RadioGroup.Item className={styles.radio} value={mode} />
            {MODE_LABELS[mode]}
          </label>
        ))}
      </RadioGroup.Root>
      {value.mode === "value" && (
        <div className={styles.valueRow}>
          <input
            className={styles.input}
            inputMode="decimal"
            aria-label={`${label} 값`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            value={value.value}
            onChange={(e) => onChange({ mode: "value", value: e.target.value })}
          />
          {unit && <span className={styles.unit}>{unit}</span>}
        </div>
      )}
      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
