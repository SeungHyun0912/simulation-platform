import { NavLink, Outlet, useParams } from "react-router";
import styles from "./AppShell.module.css";

const MENU = [
  { to: "assets", label: "설비·공간" },
  { to: "products", label: "제품", pending: true },
  { to: "processes", label: "공정", pending: true },
  { to: "scenarios", label: "시나리오", pending: true },
  { to: "runs", label: "실행 결과", pending: true },
];

export function AppShell() {
  const { projectId } = useParams();

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        본문으로 건너뛰기
      </a>
      <div className={styles.banner} role="note">
        정적 화면입니다. API 계약이 아직 승인되지 않아(PENDING_REVIEW) 서버와 연결되어 있지 않습니다.
      </div>
      <header className={styles.top}>
        <strong>시뮬레이션 플랫폼</strong>
        <div className={styles.project} aria-label="현재 프로젝트">
          <span className={styles.projectLabel}>프로젝트</span>
          {projectId ? (
            <code className={styles.projectId}>{projectId}</code>
          ) : (
            <span>선택 안 됨 (프로젝트 목록 계약 필요)</span>
          )}
        </div>
      </header>
      <div className={styles.body}>
        {projectId && (
          <nav className={styles.menu} aria-label="주 메뉴">
            <ul>
              {MENU.map((m) => (
                <li key={m.to}>
                  {m.pending ? (
                    <span className={styles.disabled}>{m.label} (준비 중)</span>
                  ) : (
                    <NavLink to={`/projects/${projectId}/${m.to}`}>{m.label}</NavLink>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}
        <main id="main" className={styles.main} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
