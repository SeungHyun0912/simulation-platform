import styles from "./VersionStatusBadge.module.css";

/**
 * 버전 상태. 서버(계약 0.2.0)는 draft|in_review|approved|superseded를 쓰고 archived는 아직 쓰지 않는다.
 * archived는 서버가 쓰기 시작할 때를 대비해 둔다. 서버가 모르는 값을 보내면 "알 수 없음"으로 안전하게 표시한다.
 */
export type VersionStatus = "draft" | "in_review" | "approved" | "superseded" | "archived";

const LABELS: Record<VersionStatus, { text: string; mark: string; tone: string }> = {
  draft: { text: "초안", mark: "✎", tone: "neutral" },
  in_review: { text: "검토 중", mark: "…", tone: "info" },
  approved: { text: "승인", mark: "✓", tone: "success" },
  superseded: { text: "대체됨", mark: "↺", tone: "neutral" },
  archived: { text: "보관", mark: "▣", tone: "warning" },
};

/** 상태 코드 → 한국어 이름. 목록 정렬·접근성 문구 등 배지 밖에서 쓴다. */
export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = Object.fromEntries(
  Object.entries(LABELS).map(([k, v]) => [k, v.text]),
) as Record<VersionStatus, string>;

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
