import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { Button, LinkButton } from "../../shared/components/Button";
import { DataTable, type Column, type SortState } from "../../shared/components/DataTable";
import { CheckboxField, TextField } from "../../shared/components/Fields";
import { FilterBar, PreviewStateLinks, SampleDataNotice } from "../../shared/components/Layout";
import type { KnownValue } from "../../shared/components/KnownValueInput";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { usePreviewState } from "../../shared/hooks/usePreviewState";
import { canEdit } from "../projects/projectView";
import { useCurrentProject } from "../projects/useCurrentProject";
import type { MaterialView } from "./materialView";
import { useMaterialList } from "./queries";

/** 서버가 지원하는 정렬 키(계약 0.3.0: code | name, 앞에 -를 붙이면 내림차순, 기본 code). */
const SORT_KEYS = ["code", "name"] as const;

/** 규격 값 한 칸: 미정과 해당 없음을 0이나 빈칸으로 보이지 않게 한다. */
export function specCell(v: KnownValue, unit: string): string {
  if (v.mode === "value") return `${v.value} ${unit}`;
  return v.mode === "not_applicable" ? "해당 없음" : "미정";
}

export function MaterialListPage() {
  const { projectId, label: projectLabel, project } = useCurrentProject();
  const source = useDataSource();
  const [params, setParams] = useSearchParams();
  // ?state= 미리보기는 정적 모드에서만 쓴다. API 모드에서는 실제 요청 결과만 보여 준다.
  const previewParam = usePreviewState();
  const preview = source === "static" ? previewParam : null;

  // 검색·보관 포함·정렬은 URL 상태이며 그대로 서버 쿼리(q, include_archived, sort)가 된다.
  const q = params.get("q") ?? "";
  const includeArchived = params.get("archived") === "1";
  const sortKey = params.get("sort");
  const sortDir = params.get("dir") === "desc" ? "desc" : "asc";
  const sort = useMemo<SortState>(
    () => ((SORT_KEYS as readonly string[]).includes(sortKey ?? "") ? { key: sortKey as string, direction: sortDir } : null),
    [sortKey, sortDir],
  );
  const listParams = useMemo(
    () => ({ q, includeArchived, sort: sort ? `${sort.direction === "desc" ? "-" : ""}${sort.key}` : undefined }),
    [q, includeArchived, sort],
  );
  const result = useMaterialList(projectId, listParams);

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) merged.set(k, v);
      else merged.delete(k);
    }
    setParams(merged, { replace: true });
  }

  const columns: Column<MaterialView>[] = [
    {
      key: "code",
      header: "표시 코드",
      sortable: true,
      render: (m) => (
        <Link to={`/projects/${projectId}/materials/${m.id}`} aria-label={`${m.code} ${m.name} 상세`}>
          {m.code}
        </Link>
      ),
    },
    { key: "name", header: "이름", sortable: true, render: (m) => (m.archivedAt ? `${m.name} (보관됨)` : m.name) },
    { key: "form", header: "형태", render: (m) => m.form },
    { key: "length", header: "길이", align: "end", render: (m) => specCell(m.defaultSpec.lengthM, "m") },
    { key: "weight", header: "중량", align: "end", render: (m) => specCell(m.defaultSpec.weightKg, "kg") },
    { key: "units", header: "단위 수", align: "end", render: (m) => specCell(m.defaultSpec.unitCount, "단위") },
    { key: "strands", header: "가닥 수", align: "end", render: (m) => specCell(m.defaultSpec.strandCount, "가닥") },
    { key: "notes", header: "메모", render: (m) => m.notes ?? "" },
  ];

  const hasFilter = q !== "" || includeArchived;
  let body;
  let countText = "";
  if (preview === "loading" || (!preview && result.status === "pending")) body = <StateNotice kind="loading" />;
  else if (preview === "error")
    body = (
      <StateNotice kind="error" action={<Button>다시 시도</Button>}>
        서버에 연결되어 있지 않은 정적 화면의 오류 상태 예시입니다.
      </StateNotice>
    );
  else if (preview === "forbidden") body = <StateNotice kind="forbidden">이 프로젝트의 재료를 볼 권한이 없습니다.</StateNotice>;
  else if (preview === "empty")
    body = (
      <StateNotice kind="empty" title="등록된 재료가 없습니다">
        정적 예시 화면에서는 재료를 만들 수 없습니다.
      </StateNotice>
    );
  else if (result.status === "error") body = <QueryErrorNotice error={result.error} subject="재료 목록" onRetry={result.retry} />;
  else if (result.status === "success") {
    const { items, hasMore, fetchMore, fetchingMore } = result.data;
    countText = `${items.length}건${hasMore ? " 이상" : ""}`;
    if (items.length === 0)
      body = hasFilter ? (
        <StateNotice kind="no-results">
          <Button onClick={() => setParams({}, { replace: true })}>검색 조건 지우기</Button>
        </StateNotice>
      ) : (
        <StateNotice kind="empty" title="등록된 재료가 없습니다">
          {source === "api" ? "재료 추가로 첫 재료를 만들 수 있습니다." : "정적 예시 화면에서는 재료를 만들 수 없습니다."}
        </StateNotice>
      );
    else
      body = (
        <>
          <DataTable
            caption="재료 목록"
            columns={columns}
            rows={items}
            getRowKey={(m) => m.id}
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

  const mayCreate = canEdit(project?.role);
  return (
    <>
      <PageHeader
        title="재료"
        breadcrumbs={[{ label: "프로젝트", to: "/" }, { label: projectLabel }, { label: "재료" }]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
        actions={
          mayCreate ? (
            <LinkButton to={`/projects/${projectId}/materials/new`} variant="primary">
              재료 추가
            </LinkButton>
          ) : (
            <Button variant="primary" disabled title="이 역할은 재료를 만들 수 없습니다(관리자·편집자만)">
              재료 추가
            </Button>
          )
        }
      />
      {source === "static" ? (
        <SampleDataNotice>예시 데이터입니다. 실제 프로젝트 데이터가 아니며 서버에 요청하지 않습니다.</SampleDataNotice>
      ) : (
        <SampleDataNotice>
          서버에서 불러온 데이터입니다. 길이·중량·단위 수·가닥 수는 서로 다른 값이며 환산하지 않습니다. 미정은 0이 아닙니다.
        </SampleDataNotice>
      )}
      <FilterBar>
        <TextField label="검색" hint="코드 또는 이름" value={q} onChange={(e) => update({ q: e.target.value })} />
        <CheckboxField
          label="보관된 재료 포함"
          checked={includeArchived}
          onChange={(e) => update({ archived: e.target.checked ? "1" : null })}
        />
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
