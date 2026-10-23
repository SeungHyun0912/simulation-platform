import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column, type SortState } from "../../shared/components/DataTable";
import { TextField } from "../../shared/components/Fields";
import { FilterBar, PreviewStateLinks, SampleDataNotice } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { StateNotice } from "../../shared/components/StateNotice";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { usePreviewState } from "../../shared/hooks/usePreviewState";
import { useCurrentProject } from "../projects/useCurrentProject";
import { latestVersion, specificationText, type ProductView } from "./productView";
import { SAMPLE_PRODUCTS } from "./sampleProducts";

export function ProductListPage() {
  const { projectId, label: projectLabel } = useCurrentProject();
  const [params, setParams] = useSearchParams();
  const preview = usePreviewState();

  // 검색·정렬은 URL 상태로 둔다.
  const q = params.get("q") ?? "";
  const sortKey = params.get("sort");
  const sortDir = params.get("dir") === "desc" ? "desc" : "asc";
  const sort = useMemo<SortState>(
    () => (sortKey === "code" || sortKey === "name" ? { key: sortKey, direction: sortDir } : null),
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
    const filtered = SAMPLE_PRODUCTS.filter(
      (p) =>
        !needle || p.code.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle),
    );
    if (!sort) return filtered;
    const key = sort.key as "code" | "name";
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => a[key].localeCompare(b[key], "ko") * sign);
  }, [q, sort]);

  const columns: Column<ProductView>[] = [
    {
      key: "code",
      header: "표시 코드",
      sortable: true,
      render: (p) => (
        <Link to={`/projects/${projectId}/products/${p.id}`} aria-label={`${p.code} ${p.name} 상세`}>
          {p.code}
        </Link>
      ),
    },
    { key: "name", header: "이름", sortable: true, render: (p) => p.name },
    { key: "spec", header: "규격", render: (p) => specificationText(p.specification) },
    {
      key: "latest",
      header: "최신 공정 버전",
      render: (p) => {
        const v = latestVersion(p);
        return v ? (
          <>
            v{v.versionNo} <VersionStatusBadge status={v.status} />
          </>
        ) : (
          "공정 없음"
        );
      },
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
    body = <StateNotice kind="forbidden">이 프로젝트의 제품을 볼 권한이 없습니다.</StateNotice>;
  else if (preview === "empty")
    body = (
      <StateNotice kind="empty" title="등록된 제품이 없습니다">
        제품 생성은 API 계약 승인 후 사용할 수 있습니다.
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
        caption="제품 목록"
        columns={columns}
        rows={rows}
        getRowKey={(p) => p.id}
        sort={sort}
        onSortChange={(next) => update({ sort: next?.key ?? null, dir: next?.direction ?? null })}
      />
    );

  return (
    <>
      <PageHeader
        title="제품"
        breadcrumbs={[{ label: "프로젝트" }, { label: projectLabel }, { label: "제품" }]}
        actions={
          <Button variant="primary" disabled title="제품 생성 API 계약 필요">
            제품 추가 (계약 필요)
          </Button>
        }
      />
      <SampleDataNotice>
        예시 데이터입니다. 실제 프로젝트 데이터가 아니며 서버에 요청하지 않습니다.
      </SampleDataNotice>
      <FilterBar>
        <TextField
          label="검색"
          hint="코드 또는 이름"
          value={q}
          onChange={(e) => update({ q: e.target.value })}
        />
      </FilterBar>
      <p aria-live="polite" className="visually-hidden">
        {preview ? "" : `${rows.length}건`}
      </p>
      {body}
      <PreviewStateLinks states={["loading", "error", "empty", "forbidden"]} />
    </>
  );
}
