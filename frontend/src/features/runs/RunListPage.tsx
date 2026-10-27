import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiOnlyNotice } from "../../shared/components/ApiOnlyNotice";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { SelectField } from "../../shared/components/Fields";
import { FilterBar, Note } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { formatDateTime } from "../../shared/format/datetime";
import { useProjectTimezone } from "../projects/queries";
import { useCurrentProject } from "../projects/useCurrentProject";
import { RunStatusBadge } from "./RunStatusBadge";
import { useRunList } from "./queries";
import { RUN_STATUS_LABELS, type RunListItem } from "./runView";

/** 실행 목록(최신 요청부터). 진행 중인 실행이 있으면 자동으로 상태를 갱신한다. 실행은 시나리오 버전 화면에서 요청한다. */
export function RunListPage() {
  const { projectId, label } = useCurrentProject();
  const source = useDataSource();
  const tz = useProjectTimezone(projectId);
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const scenarioVersionId = params.get("version") ?? "";
  const listParams = useMemo(() => ({ status, scenarioVersionId }), [status, scenarioVersionId]);
  const result = useRunList(projectId, listParams);

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v);
      else merged.delete(k);
    }
    setParams(merged, { replace: true });
  }

  const columns: Column<RunListItem>[] = [
    {
      key: "requested",
      header: "요청 시각",
      render: (r) => (
        <Link to={`/projects/${projectId}/runs/${r.id}`} aria-label={`실행 ${r.id.slice(0, 8)} 상세`}>
          {formatDateTime(r.requested_at, tz)}
        </Link>
      ),
    },
    { key: "status", header: "상태", render: (r) => <RunStatusBadge status={r.status} /> },
    {
      key: "scenario",
      header: "시나리오 버전",
      render: (r) => <Link to={`/projects/${projectId}/scenarios/versions/${r.scenario_version_id}`}>{r.scenario_version_id.slice(0, 8)}</Link>,
    },
    { key: "seed", header: "seed", align: "end", render: (r) => r.seed },
    { key: "rep", header: "반복", align: "end", render: (r) => r.replicate_index },
    { key: "started", header: "시작", render: (r) => (r.started_at ? formatDateTime(r.started_at, tz) : "") },
    { key: "finished", header: "종료", render: (r) => (r.finished_at ? formatDateTime(r.finished_at, tz) : "") },
  ];

  const hasFilter = status !== "" || scenarioVersionId !== "";
  let body;
  if (source === "static") body = <ApiOnlyNotice subject="실행 결과" />;
  else if (result.status === "pending") body = <StateNotice kind="loading" />;
  else if (result.status === "error") body = <QueryErrorNotice error={result.error} subject="실행 목록" onRetry={result.retry} />;
  else if (result.data.items.length === 0)
    body = hasFilter ? (
      <StateNotice kind="no-results">
        <Button onClick={() => setParams({}, { replace: true })}>검색 조건 지우기</Button>
      </StateNotice>
    ) : (
      <StateNotice kind="empty" title="실행 기록이 없습니다">
        시나리오 버전을 승인한 뒤 그 버전 화면에서 실행을 요청할 수 있습니다.
      </StateNotice>
    );
  else {
    const { items, hasMore, fetchMore, fetchingMore } = result.data;
    body = (
      <>
        <DataTable caption="실행 목록" columns={columns} rows={items} getRowKey={(r) => r.id} />
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
      <PageHeader title="실행 결과" breadcrumbs={[{ label: "프로젝트", to: "/" }, { label }, { label: "실행 결과" }]} renderLink={(c) => <Link to={c.to!}>{c.label}</Link>} />
      {source === "api" && <Note>실행은 승인된 시나리오 버전의 입력을 고정한 스냅샷으로 수행됩니다. 진행 중인 실행은 자동으로 갱신됩니다.</Note>}
      {source === "api" && (
        <FilterBar>
          <SelectField label="상태" value={status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">전체</option>
            {Object.entries(RUN_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.text}
              </option>
            ))}
          </SelectField>
        </FilterBar>
      )}
      {body}
    </>
  );
}
