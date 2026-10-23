import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { SAMPLE_PROJECTS } from "../../features/projects/sampleProjects";
import { ProjectSwitcher } from "../../shared/components/ProjectSwitcher";
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
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();

  // 프로젝트가 바뀌거나 벗어나면 이전 프로젝트의 요청을 취소하고 캐시를 버린다.
  useEffect(() => {
    if (!projectId) return;
    return () => {
      const queryKey = ["project", projectId];
      void queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
    };
  }, [projectId, queryClient]);

  function switchProject(nextId: string) {
    if (nextId === projectId) return;
    // 자산·버전 ID는 프로젝트에 속하므로 상세 경로를 유지하지 않고 같은 메뉴의 목록으로 이동한다.
    const section = pathname.split("/")[3] || "assets";
    navigate(`/projects/${nextId}/${section}`);
  }

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
        <ProjectSwitcher
          projects={SAMPLE_PROJECTS}
          currentId={projectId ?? null}
          onSelect={switchProject}
        />
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
