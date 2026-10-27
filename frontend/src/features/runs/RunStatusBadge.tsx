import styles from "../../shared/components/VersionStatusBadge.module.css";
import { RUN_STATUS_LABELS } from "./runView";

/** 실행 상태 배지. 색 외에 글자와 기호로도 구분하며 모르는 상태는 원문을 보여 준다. */
export function RunStatusBadge({ status }: { status: string }) {
  const known = Object.hasOwn(RUN_STATUS_LABELS, status) ? RUN_STATUS_LABELS[status]! : null;
  const view = known ?? { text: `알 수 없음 (${status})`, mark: "?", tone: "danger" };
  return (
    <span className={`${styles.badge} ${styles[view.tone]}`}>
      <span aria-hidden="true">{view.mark}</span>
      {view.text}
    </span>
  );
}
