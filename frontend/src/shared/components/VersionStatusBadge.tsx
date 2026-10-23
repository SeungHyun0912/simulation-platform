import styles from "./VersionStatusBadge.module.css";

/** 03 계약의 버전 상태. 서버가 모르는 값을 보내면 "알 수 없음"으로 안전하게 표시한다. */
export type VersionStatus = "draft" | "in_review" | "approved" | "archived";

const LABELS: Record<VersionStatus, { text: string; mark: string; tone: string }> = {
  draft: { text: "초안", mark: "✎", tone: "neutral" },
  in_review: { text: "검토 중", mark: "…", tone: "info" },
  approved: { text: "승인", mark: "✓", tone: "success" },
  archived: { text: "보관", mark: "▣", tone: "warning" },
};

export function VersionStatusBadge({ status }: { status: string }) {
  const known = Object.hasOwn(LABELS, status) ? LABELS[status as VersionStatus] : null;
  const view = known ?? { text: "알 수 없음", mark: "?", tone: "danger" };
  return (
    <span className={`${styles.badge} ${styles[view.tone]}`}>
      <span aria-hidden="true">{view.mark}</span>
      {view.text}
    </span>
  );
}
