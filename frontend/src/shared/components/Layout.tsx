import type { ReactNode } from "react";
import { Link } from "react-router";
import styles from "./Layout.module.css";

/** 제목이 있는 구역 카드(상세·편집 화면의 섹션) */
export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.heading}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** 입력 필드 격자(좁은 화면에서는 한 줄씩) */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className={styles.fieldGrid}>{children}</div>;
}

/** 보조 설명 문구 */
export function Note({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}

/** 예시 데이터·정적 화면 표시. 실제 데이터로 오해하지 않게 화면 상단에 둔다. */
export function SampleDataNotice({ children }: { children: ReactNode }) {
  return <p className={styles.sample}>{children}</p>;
}

/** 검색·필터 입력 줄 */
export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <form className={styles.filterBar} role="search" onSubmit={(e) => e.preventDefault()}>
      {children}
    </form>
  );
}

/** 정적 단계 전용: ?state= 상태 미리보기 링크 */
export function PreviewStateLinks({ states }: { states: string[] }) {
  return (
    <p className={styles.preview}>
      상태 미리보기:{" "}
      {["", ...states].map((s) => (
        <Link key={s} to={s ? `?state=${s}` : "."} className={styles.previewLink}>
          {s || "정상"}
        </Link>
      ))}
    </p>
  );
}

/** 저장하지 않은 변경 표시(글자와 기호로 구분) */
export function DirtyIndicator() {
  return <p className={styles.dirty}>● 저장하지 않은 변경이 있습니다</p>;
}

/** 화면 블록 간 간격 */
export function Block({ children }: { children: ReactNode }) {
  return <div className={styles.block}>{children}</div>;
}
