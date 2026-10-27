import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { CheckboxField, TextField } from "../../shared/components/Fields";
import { FilterBar, Note, SampleDataNotice } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { useCurrentProject } from "../projects/useCurrentProject";
import { useProductList } from "../products/queries";
import type { ProcessVersionSummaryView, ProductView } from "../products/productView";

/**
 * 공정 목록: 프로젝트의 제품별 공정 버전 현황. 공정은 제품 아래의 버전(초안·검토 중·승인본·대체됨)이라
 * 별도 목록 API가 없고, 제품 목록이 주는 요약(최신 버전·승인본)을 그대로 쓴다. 편집은 공정 편집 화면으로 이동한다.
 */
export function ProcessListPage() {
  const { projectId, label: projectLabel } = useCurrentProject();
  const source = useDataSource();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const includeArchived = params.get("archived") === "1";
  const listParams = useMemo(() => ({ q, includeArchived, sort: undefined }), [q, includeArchived]);
  const result = useProductList(projectId, listParams);

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v);
      else merged.delete(k);
    }
    setParams(merged, { replace: true });
  }

  const editorLink = (p: ProductView, v: ProcessVersionSummaryView) => `/projects/${projectId}/products/${p.id}/processes/${v.id}`;
  const columns: Column<ProductView>[] = [
    {
      key: "code",
      header: "제품",
      render: (p) => (
        <Link to={`/projects/${projectId}/products/${p.id}`} aria-label={`${p.code} ${p.name} 상세`}>
          {p.code}
        </Link>
      ),
    },
    { key: "name", header: "제품 이름", render: (p) => (p.archivedAt ? `${p.name} (보관됨)` : p.name) },
    {
      key: "latest",
      header: "최신 공정 버전",
      render: (p) =>
        p.latestProcessVersion ? (
          <>
            <Link to={editorLink(p, p.latestProcessVersion)} aria-label={`${p.code} 최신 공정 v${p.latestProcessVersion.versionNo} 열기`}>
              v{p.latestProcessVersion.versionNo}
            </Link>{" "}
            <VersionStatusBadge status={p.latestProcessVersion.status} />
          </>
        ) : (
          "공정 없음"
        ),
    },
    {
      key: "current",
      header: "승인본",
      render: (p) =>
        p.currentProcessVersion ? (
          <Link to={editorLink(p, p.currentProcessVersion)} aria-label={`${p.code} 승인본 v${p.currentProcessVersion.versionNo} 열기`}>
            v{p.currentProcessVersion.versionNo}
          </Link>
        ) : (
          "없음"
        ),
    },
    {
      key: "action",
      header: "작업",
      render: (p) =>
        p.latestProcessVersion ? null : (
          <Link to={`/projects/${projectId}/products/${p.id}`} aria-label={`${p.code} 공정 만들기`}>
            제품에서 공정 만들기
          </Link>
        ),
    },
  ];

  const hasFilter = q !== "" || includeArchived;
  let body;
  let countText = "";
  if (result.status === "pending") body = <StateNotice kind="loading" />;
  else if (result.status === "error")
    body = <QueryErrorNotice error={result.error} subject="공정 목록" onRetry={result.retry} />;
  else {
    const { items, hasMore, fetchMore, fetchingMore } = result.data;
    countText = `${items.length}건${hasMore ? " 이상" : ""}`;
    if (items.length === 0)
      body = hasFilter ? (
        <StateNotice kind="no-results">
          <Button onClick={() => setParams({}, { replace: true })}>검색 조건 지우기</Button>
        </StateNotice>
      ) : (
        <StateNotice kind="empty" title="등록된 제품이 없습니다">
          공정은 제품 아래의 버전으로 만듭니다. 먼저 제품을 추가하세요.
        </StateNotice>
      );
    else
      body = (
        <>
          <DataTable caption="제품별 공정 버전" columns={columns} rows={items} getRowKey={(p) => p.id} />
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
        title="공정"
        breadcrumbs={[{ label: "프로젝트", to: "/" }, { label: projectLabel }, { label: "공정" }]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
      />
      {source === "static" ? (
        <SampleDataNotice>예시 데이터입니다. 실제 프로젝트 데이터가 아니며 서버에 요청하지 않습니다.</SampleDataNotice>
      ) : (
        <Note>
          제품별 공정 버전 현황입니다. 버전 번호를 누르면 공정 편집 화면으로 이동합니다. 새 초안은 제품 상세에서 만듭니다(열린 버전은 제품당 하나).
        </Note>
      )}
      <FilterBar>
        <TextField label="검색" hint="제품 코드 또는 이름" value={q} onChange={(e) => update({ q: e.target.value })} />
        <CheckboxField label="보관된 제품 포함" checked={includeArchived} onChange={(e) => update({ archived: e.target.checked ? "1" : null })} />
      </FilterBar>
      <p aria-live="polite" className="visually-hidden">
        {countText}
      </p>
      {result.status === "success" && result.refreshing && <p role="status">목록을 새로 불러오는 중…</p>}
      {body}
    </>
  );
}
