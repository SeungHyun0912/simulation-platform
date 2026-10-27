import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { useMe } from "../../features/projects/queries";
import { ProjectSwitcher, type ProjectOption } from "../../shared/components/ProjectSwitcher";
import { accentFor } from "../../features/projects/projectView";
import { useDataSource } from "../../shared/api/ApiContext";
import contractMeta from "../../shared/api/generated/CONTRACT.json";
import { Button } from "../../shared/components/Button";
import styles from "./AppShell.module.css";

const MENU = [
  { to: "assets", label: "설비·공간" },
  { to: "products", label: "제품" },
  { to: "materials", label: "재료" },
  { to: "processes", label: "공정" },
  { to: "scenarios", label: "시나리오", pending: true },
  { to: "runs", label: "실행 결과", pending: true },
];

export function AppShell() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const source = useDataSource();
  const me = useMe();

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

  const options: ProjectOption[] =
    me.status === "success"
      ? me.data.projects.map((p) => ({ id: p.id, code: p.code, name: p.name, accent: accentFor(p.id), archived: p.status === "archived" }))
      : [];

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        본문으로 건너뛰기
      </a>
      <div className={styles.banner} role="note" data-source={source}>
        {source === "static"
          ? "정적 예시 화면입니다. 서버에 연결되어 있지 않으며 표시된 데이터는 실제 데이터가 아닙니다."
          : `API 연동 모드입니다(계약 ${contractMeta.contract_version}). 프로젝트 생성, 자산(기본 정보·용량·규칙 버전), 제품 기본 정보, 재료(기본 정보·기본 규격), 공정(버전·그래프 구조·단계·검토 요청)의 저장은 연결되어 있습니다.`}
      </div>
      <header className={styles.top}>
        <strong>시뮬레이션 플랫폼</strong>
        <ProjectSwitcher projects={options} currentId={projectId ?? null} onSelect={switchProject} />
        {me.status === "error" && (
          // 프로젝트 목록을 못 불러오면 전환 메뉴가 비어 보이므로 이유와 재시도를 header에서 알린다.
          // 내 정보가 꼭 필요한 화면은 자기 본문에서 따로 안내한다.
          <span role="alert" className={styles.meError}>
            프로젝트 목록을 불러오지 못했습니다.{" "}
            <Button onClick={me.retry}>다시 시도</Button>
          </span>
        )}
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
