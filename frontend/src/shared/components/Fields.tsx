import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import styles from "./Fields.module.css";

type BaseProps = { label: string; hint?: string; error?: string | null };

function Wrapper({
  id,
  label,
  hint,
  error,
  children,
}: BaseProps & { id: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, p: BaseProps) {
  const ids = [p.hint ? `${id}-hint` : "", p.error ? `${id}-error` : ""].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

export function TextField({
  label,
  hint,
  error,
  ...rest
}: BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, "id">) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { label, hint, error })}
        {...rest}
      />
    </Wrapper>
  );
}

export function CheckboxField({
  label,
  ...rest
}: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type">) {
  const id = useId();
  return (
    <div className={styles.check}>
      <input id={id} type="checkbox" {...rest} />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  ...rest
}: BaseProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, "id">) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        className={styles.control}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, { label, hint, error })}
        {...rest}
      >
        {children}
      </select>
    </Wrapper>
  );
}
