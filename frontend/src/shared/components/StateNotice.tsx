import type { ReactNode } from "react";
import styles from "./StateNotice.module.css";

/** 화면 공통 상태. 색 외에 제목 글자와 기호로도 구분한다. */
export type NoticeKind =
  | "loading"
  | "empty"
  | "no-results"
  | "error"
  | "forbidden"
  | "conflict"
  | "contract-pending";

const VIEW: Record<NoticeKind, { mark: string; title: string; tone: string }> = {
  loading: { mark: "⏳", title: "불러오는 중입니다", tone: "neutral" },
  empty: { mark: "○", title: "표시할 데이터가 없습니다", tone: "neutral" },
  "no-results": { mark: "⌕", title: "검색 결과가 없습니다", tone: "neutral" },
  error: { mark: "!", title: "요청에 실패했습니다", tone: "danger" },
  forbidden: { mark: "⛔", title: "접근 권한이 없습니다", tone: "danger" },
  conflict: { mark: "⚠", title: "다른 사용자가 먼저 수정했습니다", tone: "warning" },
  "contract-pending": { mark: "ⓘ", title: "계약 필요", tone: "info" },
};

type Props = {
  kind: NoticeKind;
  /** 기본 제목 대신 쓸 문구 */
  title?: string;
  children?: ReactNode;
  /** 재시도 등 해결 동작 */
  action?: ReactNode;
};

export function StateNotice({ kind, title, children, action }: Props) {
  const v = VIEW[kind];
  const urgent = kind === "error" || kind === "forbidden" || kind === "conflict";
  return (
    <section
      className={`${styles.notice} ${styles[v.tone]}`}
      role={urgent ? "alert" : "status"}
      aria-busy={kind === "loading" ? true : undefined}
    >
      <h2 className={styles.title}>
        <span aria-hidden="true">{v.mark}</span> {title ?? v.title}
      </h2>
      {children && <div className={styles.body}>{children}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </section>
  );
}
