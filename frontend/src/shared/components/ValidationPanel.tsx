import styles from "./ValidationPanel.module.css";

/** 오류 envelope의 details 항목(04 계약 §2)과 같은 모양. 계약 승인 후 어댑터에서 채운다. */
export type ValidationIssue = {
  severity: "error" | "warning";
  rule_id?: string;
  field_path?: string;
  message: string;
  resolution?: string;
};

/** 경고가 이 개수를 넘으면 접어서 보여 준다. 오류는 항상 펼쳐 둔다. */
const COLLAPSE_WARNINGS_OVER = 3;

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  return (
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
  );
}

export function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  const errorIssues = issues.filter((i) => i.severity === "error");
  const warningIssues = issues.filter((i) => i.severity === "warning");
  const collapse = warningIssues.length > COLLAPSE_WARNINGS_OVER;
  return (
    <section
      className={`${styles.panel} ${errorIssues.length > 0 ? styles.hasError : styles.onlyWarning}`}
      role="alert"
      aria-label="검증 결과"
    >
      <h2 className={styles.title}>
        검증 결과: 오류 {errorIssues.length}건, 경고 {warningIssues.length}건
      </h2>
      {errorIssues.length > 0 && <IssueList issues={errorIssues} />}
      {warningIssues.length > 0 &&
        (collapse ? (
          <details className={styles.details}>
            <summary>경고 {warningIssues.length}건 보기 (실행 전에 해소해야 하는 미정 값)</summary>
            <IssueList issues={warningIssues} />
          </details>
        ) : (
          <IssueList issues={warningIssues} />
        ))}
    </section>
  );
}
