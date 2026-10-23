import styles from "./ValidationPanel.module.css";

/** 오류 envelope의 details 항목(04 계약 §2)과 같은 모양. 계약 승인 후 어댑터에서 채운다. */
export type ValidationIssue = {
  severity: "error" | "warning";
  rule_id?: string;
  field_path?: string;
  message: string;
  resolution?: string;
};

export function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  return (
    <section
      className={`${styles.panel} ${errors > 0 ? styles.hasError : styles.onlyWarning}`}
      role="alert"
      aria-label="검증 결과"
    >
      <h2 className={styles.title}>
        검증 결과: 오류 {errors}건, 경고 {warnings}건
      </h2>
      <ul className={styles.list}>
        {issues.map((i, idx) => (
          <li key={`${i.rule_id ?? "issue"}-${idx}`}>
            <strong className={i.severity === "error" ? styles.error : styles.warning}>
              {i.severity === "error" ? "오류" : "경고"}
            </strong>{" "}
            {i.message}
            {i.resolution && <div className={styles.resolution}>해결 방법: {i.resolution}</div>}
            {i.field_path && <code className={styles.path}>{i.field_path}</code>}
          </li>
        ))}
      </ul>
    </section>
  );
}
