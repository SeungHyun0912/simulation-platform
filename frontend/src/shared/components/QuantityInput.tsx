import { useId } from "react";
import { getUnit } from "../units/units";
import styles from "./QuantityInput.module.css";

/** 값은 decimal 문자열로 다룬다. JS number로 왕복하지 않는다. */
export type Quantity = { amount: string; unit: string };

const DECIMAL = /^\d+(\.\d+)?$/;
const INTEGER = /^\d+$/;

/** 오류 문구. 오류가 없으면 null. 빈 값은 0이 아니라 입력 누락이다. */
export function validateQuantity(q: Quantity): string | null {
  const unit = getUnit(q.unit);
  if (!unit) return "알 수 없는 단위입니다.";
  if (q.amount.trim() === "") return "값을 입력하세요.";
  if (unit.integer) return INTEGER.test(q.amount) ? null : `${unit.label} 단위는 0 이상의 정수만 입력할 수 있습니다.`;
  return DECIMAL.test(q.amount) ? null : "0 이상의 숫자만 입력할 수 있습니다.";
}

type RowProps = {
  label: string;
  value: Quantity;
  onChange: (next: Quantity) => void;
  /** 선택 가능한 단위 id. 하나뿐이면 고정 단위로 표시한다. */
  units: string[];
  disabled?: boolean;
  error?: string | null;
  errorId?: string;
};

/** 값+단위 한 줄. QuantityInput과 KnownValueInput이 함께 쓴다. */
export function QuantityRow({ label, value, onChange, units, disabled, error, errorId }: RowProps) {
  const unitDef = getUnit(value.unit);
  return (
    <div className={styles.row}>
      <input
        className={styles.input}
        inputMode={unitDef?.integer ? "numeric" : "decimal"}
        aria-label={`${label} 값`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        value={value.amount}
        onChange={(e) => onChange({ ...value, amount: e.target.value })}
      />
      {units.length > 1 ? (
        <select
          className={styles.select}
          aria-label={`${label} 단위`}
          disabled={disabled}
          value={value.unit}
          onChange={(e) => onChange({ ...value, unit: e.target.value })}
        >
          {units.map((id) => (
            <option key={id} value={id}>
              {getUnit(id)?.label ?? id}
            </option>
          ))}
        </select>
      ) : (
        <span className={styles.unit}>{unitDef?.label ?? value.unit}</span>
      )}
    </div>
  );
}

type Props = Omit<RowProps, "error" | "errorId"> & { hint?: string };

export function QuantityInput({ label, hint, ...rest }: Props) {
  const id = useId();
  const error = validateQuantity(rest.value);
  const unitHint = getUnit(rest.value.unit)?.hint;
  return (
    <fieldset className={styles.field} disabled={rest.disabled}>
      <legend className={styles.legend}>{label}</legend>
      <QuantityRow label={label} {...rest} error={error} errorId={`${id}-error`} />
      {(hint || unitHint) && <p className={styles.hint}>{[hint, unitHint].filter(Boolean).join(" · ")}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </fieldset>
  );
}
