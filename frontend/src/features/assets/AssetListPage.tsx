import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column, type SortState } from "../../shared/components/DataTable";
import { SelectField, TextField } from "../../shared/components/Fields";
import { FilterBar, PreviewStateLinks, SampleDataNotice } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { usePreviewState } from "../../shared/hooks/usePreviewState";
import { useCurrentProject } from "../projects/useCurrentProject";
import { KIND_LABELS, portsText, type AssetInfo, type AssetKind } from "./assetView";
import { useAssetList } from "./queries";

/** 서버가 지원하는 정렬 키(계약 0.2.0: sort_order | code | name, 앞에 -를 붙이면 내림차순). 상태·모델은 서버 정렬이 없다. */
const SORT_KEYS = ["sort_order", "code", "name"] as const;

export function AssetListPage() {
  const { projectId, label } = useCurrentProject();
  const source = useDataSource();
  const [params, setParams] = useSearchParams();
  // ?state= 미리보기는 정적 모드에서만 쓴다. API 모드에서는 실제 요청 결과만 보여 준다.
  const previewParam = usePreviewState();
  const preview = source === "static" ? previewParam : null;

  // 검색·필터·정렬은 URL 상태이며 그대로 서버 쿼리(q, kind, sort)가 된다.
  const q = params.get("q") ?? "";
  const kind = params.get("kind") ?? "";
  const sortKey = params.get("sort");
  const sortDir = params.get("dir") === "desc" ? "desc" : "asc";
  const sort = useMemo<SortState>(
    () =>
      (SORT_KEYS as readonly string[]).includes(sortKey ?? "")
        ? { key: sortKey as string, direction: sortDir }
        : null,
    [sortKey, sortDir],
  );
  const listParams = useMemo(
    () => ({ q, kind, sort: sort ? `${sort.direction === "desc" ? "-" : ""}${sort.key}` : undefined }),
    [q, kind, sort],
  );
  const result = useAssetList(projectId, listParams);

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v);
      else merged.delete(k);
    }
    setParams(merged, { replace: true });
  }

  const columns: Column<AssetInfo>[] = [
    {
      key: "code",
      header: "표시 코드",
      sortable: true,
      render: (a) => (
        <Link to={`/projects/${projectId}/assets/${a.id}`} aria-label={`${a.code} ${a.name} 상세`}>
          {a.code}
        </Link>
      ),
    },
    { key: "name", header: "이름", sortable: true, render: (a) => a.name },
    { key: "kind", header: "유형", render: (a) => KIND_LABELS[a.kind] },
    { key: "ports", header: "포트", render: (a) => portsText(a.ports) },
    { key: "sort_order", header: "정렬 순서", align: "end", sortable: true, render: (a) => a.sortOrder },
    {
      key: "latest",
      header: "최신 버전",
      render: (a) =>
        a.latestRevision ? (
          <>
            v{a.latestRevision.revisionNo} <VersionStatusBadge status={a.latestRevision.status} />
          </>
        ) : (
          "버전 없음"
        ),
    },
    {
      key: "current",
      header: "승인본",
      render: (a) => (a.currentRevision ? `v${a.currentRevision.revisionNo}` : "없음"),
    },
  ];

  const hasFilter = q !== "" || kind !== "";
  let body;
  let countText = "";
  if (preview === "loading" || (!preview && result.status === "pending")) body = <StateNotice kind="loading" />;
  else if (preview === "error")
    body = (
      <StateNotice kind="error" action={<Button>다시 시도</Button>}>
        서버에 연결되어 있지 않은 정적 화면의 오류 상태 예시입니다.
      </StateNotice>
    );
  else if (preview === "forbidden")
    body = <StateNotice kind="forbidden">이 프로젝트의 자산을 볼 권한이 없습니다.</StateNotice>;
  else if (preview === "empty")
    body = (
      <StateNotice kind="empty" title="등록된 설비·공간이 없습니다">
        자산 생성은 아직 연결되지 않았습니다.
      </StateNotice>
    );
  else if (result.status === "error")
    body = <QueryErrorNotice error={result.error} subject="자산 목록" onRetry={result.retry} />;
  else if (result.status === "success") {
    const { items, hasMore, fetchMore, fetchingMore } = result.data;
    countText = `${items.length}건${hasMore ? " 이상" : ""}`;
    if (items.length === 0)
      body = hasFilter ? (
        <StateNotice kind="no-results">
          <Button onClick={() => setParams({}, { replace: true })}>검색 조건 지우기</Button>
        </StateNotice>
      ) : (
        <StateNotice kind="empty" title="등록된 설비·공간이 없습니다">
          자산 생성은 아직 연결되지 않았습니다.
        </StateNotice>
      );
    else
      body = (
        <>
          <DataTable
            caption="설비·공간 목록"
            columns={columns}
            rows={items}
            getRowKey={(a) => a.id}
            sort={sort}
            onSortChange={(next) => update({ sort: next?.key ?? null, dir: next?.direction ?? null })}
          />
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
        title="설비·공간"
        breadcrumbs={[{ label: "프로젝트", to: "/" }, { label }, { label: "설비·공간" }]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
        actions={
          <Button variant="primary" disabled title="자산 생성은 아직 연결되지 않았습니다">
            자산 추가 (연동 후)
          </Button>
        }
      />
      {source === "static" && (
        <SampleDataNotice>
          예시 데이터입니다(계약 0.2.0 예제 모양). 실제 프로젝트 데이터가 아니며 서버에 요청하지 않습니다.
          용량은 목록에 없고 상세에서 확인합니다.
        </SampleDataNotice>
      )}
      <FilterBar>
        <TextField
          label="검색"
          hint="코드 또는 이름"
          value={q}
          onChange={(e) => update({ q: e.target.value })}
        />
        <SelectField label="유형" value={kind} onChange={(e) => update({ kind: e.target.value })}>
          <option value="">전체</option>
          {(Object.keys(KIND_LABELS) as AssetKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </SelectField>
      </FilterBar>
      <p aria-live="polite" className="visually-hidden">
        {countText}
      </p>
      {result.status === "success" && result.refreshing && <p role="status">목록을 새로 불러오는 중…</p>}
      {body}
      {source === "static" && <PreviewStateLinks states={["loading", "error", "empty", "forbidden"]} />}
    </>
  );
}
