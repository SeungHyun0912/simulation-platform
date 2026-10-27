import { Link } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiOnlyNotice } from "../../shared/components/ApiOnlyNotice";
import { Button, LinkButton } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { Note } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { canEdit } from "../projects/projectView";
import { useCurrentProject } from "../projects/useCurrentProject";
import { useScenarioList } from "./queries";
import type { ScenarioView } from "./scenarioView";

/** 시나리오 목록. 시나리오는 실행 조건(제품·도착·가정·종료 규칙)의 묶음이며 버전을 승인해야 실행할 수 있다. */
export function ScenarioListPage() {
  const { projectId, label, project } = useCurrentProject();
  const source = useDataSource();
  const result = useScenarioList(projectId);
  const mayCreate = canEdit(project?.role);

  const columns: Column<ScenarioView>[] = [
    {
      key: "code",
      header: "표시 코드",
      render: (s) => (
        <Link to={`/projects/${projectId}/scenarios/${s.id}`} aria-label={`${s.code} ${s.name} 상세`}>
          {s.code}
        </Link>
      ),
    },
    { key: "name", header: "이름", render: (s) => s.name },
    {
      key: "latest",
      header: "최근 버전",
      render: (s) =>
        s.latestVersion ? (
          <>
            <Link to={`/projects/${projectId}/scenarios/versions/${s.latestVersion.id}`} aria-label={`${s.code} 최근 버전 v${s.latestVersion.versionNo} 열기`}>
              v{s.latestVersion.versionNo}
            </Link>{" "}
            <VersionStatusBadge status={s.latestVersion.status} />
          </>
        ) : (
          "버전 없음"
        ),
    },
    { key: "description", header: "설명", render: (s) => s.description ?? "" },
  ];

  let body;
  if (source === "static") body = <ApiOnlyNotice subject="시나리오" />;
  else if (result.status === "pending") body = <StateNotice kind="loading" />;
  else if (result.status === "error") body = <QueryErrorNotice error={result.error} subject="시나리오 목록" onRetry={result.retry} />;
  else if (result.data.items.length === 0)
    body = (
      <StateNotice kind="empty" title="등록된 시나리오가 없습니다">
        시나리오 추가로 실행 조건을 만들 수 있습니다. 시나리오는 승인된 공정 버전이 있는 제품이 있어야 실행 조건을 채울 수 있습니다.
      </StateNotice>
    );
  else {
    const { items, hasMore, fetchMore, fetchingMore } = result.data;
    body = (
      <>
        <DataTable caption="시나리오 목록" columns={columns} rows={items} getRowKey={(s) => s.id} />
        {hasMore && (
          <p>
            <Button onClick={fetchMore} disabled={fetchingMore}>
              {fetchingMore ? "불러오는 중…" : "더 보기"}
            </Button>
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="시나리오"
        breadcrumbs={[{ label: "프로젝트", to: "/" }, { label }, { label: "시나리오" }]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
        actions={
          mayCreate ? (
            <LinkButton to={`/projects/${projectId}/scenarios/new`} variant="primary">
              시나리오 추가
            </LinkButton>
          ) : (
            <Button variant="primary" disabled title="이 역할은 시나리오를 만들 수 없습니다(관리자·편집자만)">
              시나리오 추가
            </Button>
          )
        }
      />
      {source === "api" && (
        <Note>시나리오 버전은 초안으로 저장하고, 사전검증 오류가 없을 때 관리자가 승인합니다. 승인된 버전만 실행할 수 있습니다.</Note>
      )}
      {body}
    </>
  );
}
