import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column, type SortState } from "../../shared/components/DataTable";
import { SelectField, TextField } from "../../shared/components/Fields";
import { FilterBar, PreviewStateLinks, SampleDataNotice } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { StateNotice } from "../../shared/components/StateNotice";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { usePreviewState } from "../../shared/hooks/usePreviewState";
import { useCurrentProject } from "../projects/useCurrentProject";
import { KIND_LABELS, portsText, type AssetInfo, type AssetKind } from "./assetView";
import { SAMPLE_ASSETS } from "./sampleAssets";

/** 서버가 지원하는 정렬 키(계약 0.2.0: sort_order | code | name, 앞에 -를 붙이면 내림차순). 상태·모델은 서버 정렬이 없다. */
const SORT_KEYS = ["sort_order", "code", "name"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function sortValue(a: AssetInfo, key: SortKey): string | number {
  if (key === "sort_order") return a.sortOrder;
  return a[key];
}

export function AssetListPage() {
  const { projectId, label } = useCurrentProject();
  const [params, setParams] = useSearchParams();
  const preview = usePreviewState();

  // 검색·필터·정렬은 URL 상태로 둔다. 실제 연동 시 이 값이 그대로 서버 쿼리(q, kind, sort)가 된다.
  const q = params.get("q") ?? "";
  const kind = params.get("kind") ?? "";
  const sortKey = params.get("sort");
  const sortDir = params.get("dir") === "desc" ? "desc" : "asc";
  const sort = useMemo<SortState>(
    () =>
      (SORT_KEYS as readonly string[]).includes(sortKey ?? "")
        ? { key: sortKey as SortKey, direction: sortDir }
        : null,
    [sortKey, sortDir],
  );

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v);
      else merged.delete(k);
    }
    setParams(merged, { replace: true });
  }

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = SAMPLE_ASSETS.filter(
      (a) =>
        (!kind || a.kind === kind) &&
        (!needle || a.code.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle)),
    );
    if (!sort) return filtered;
    const key = sort.key as SortKey;
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = sortValue(a, key);
      const y = sortValue(b, key);
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ko");
      return cmp * sign;
    });
  }, [q, kind, sort]);

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

  let body;
  if (preview === "loading") body = <StateNotice kind="loading" />;
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
        자산 생성은 API 연동 후 사용할 수 있습니다.
      </StateNotice>
    );
  else if (rows.length === 0)
    body = (
      <StateNotice kind="no-results">
        <Button onClick={() => setParams({}, { replace: true })}>검색 조건 지우기</Button>
      </StateNotice>
    );
  else
    body = (
      <DataTable
        caption="설비·공간 목록"
        columns={columns}
        rows={rows}
        getRowKey={(a) => a.id}
        sort={sort}
        onSortChange={(next) => update({ sort: next?.key ?? null, dir: next?.direction ?? null })}
      />
    );

  return (
    <>
      <PageHeader
        title="설비·공간"
        breadcrumbs={[{ label: "프로젝트", to: "/" }, { label }, { label: "설비·공간" }]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
        actions={
          <Button variant="primary" disabled title="자산 생성은 API 연동 후 사용할 수 있습니다">
            자산 추가 (연동 후)
          </Button>
        }
      />
      <SampleDataNotice>
        예시 데이터입니다(계약 0.2.0 예제 모양). 실제 프로젝트 데이터가 아니며 서버에 요청하지 않습니다.
        용량은 목록에 없고 상세에서 확인합니다.
      </SampleDataNotice>
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
        {preview ? "" : `${rows.length}건`}
      </p>
      {body}
      <PreviewStateLinks states={["loading", "error", "empty", "forbidden"]} />
    </>
  );
}
