import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

export type Crumb = { label: string; to?: string };

type Props = {
  title: string;
  breadcrumbs?: Crumb[];
  /** 공통 작업 버튼 영역 */
  actions?: ReactNode;
  /** 경로 링크 렌더러. 라우터 의존을 공통 컴포넌트 밖에 두기 위해 주입한다. */
  renderLink?: (crumb: Crumb) => ReactNode;
};

export function PageHeader({ title, breadcrumbs = [], actions, renderLink }: Props) {
  return (
    <header className={styles.header}>
      {breadcrumbs.length > 0 && (
        <nav aria-label="현재 위치">
          <ol className={styles.crumbs}>
            {breadcrumbs.map((c, i) => {
              const last = i === breadcrumbs.length - 1;
              return (
                <li key={`${i}-${c.label}`} aria-current={last ? "page" : undefined}>
                  {c.to && !last && renderLink ? renderLink(c) : c.label}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className={styles.row}>
        <h1 className={styles.title}>{title}</h1>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  );
}
