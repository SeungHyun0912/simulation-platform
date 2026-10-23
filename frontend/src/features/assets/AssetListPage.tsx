import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column, type SortState } from "../../shared/components/DataTable";
import { SelectField, TextField } from "../../shared/components/Fields";
import { PageHeader } from "../../shared/components/PageHeader";
import { StateNotice } from "../../shared/components/StateNotice";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import {
  capacityText,
  KIND_LABELS,
  portsText,
  type AssetKind,
  type AssetView,
} from "./assetView";
import styles from "./AssetListPage.module.css";
import { SAMPLE_ASSETS } from "./sampleAssets";
import { usePreviewState } from "./usePreviewState";

type SortKey = "code" | "name";

export function AssetListPage() {
  const { projectId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const preview = usePreviewState();

  // 검색·필터·정렬은 URL 상태로 둔다. 화면 이동 후 돌아와도 유지된다.
  const q = params.get("q") ?? "";
  const kind = params.get("kind") ?? "";
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
    const filtered = SAMPLE_ASSETS.filter(
      (a) =>
        (!kind || a.kind === kind) &&
        (!needle || a.code.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle)),
    );
    if (!sort) return filtered;
    const key = sort.key as SortKey;
    const sign = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => a[key].localeCompare(b[key], "ko") * sign);
  }, [q, kind, sort]);

  const columns: Column<AssetView>[] = [
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
    { key: "capacity", header: "대기 용량", render: (a) => capacityText(a.capacity) },
    { key: "status", header: "상태", render: (a) => <VersionStatusBadge status={a.status} /> },
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
        자산 생성은 API 계약 승인 후 사용할 수 있습니다.
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
        breadcrumbs={[{ label: "프로젝트" }, { label: projectId }, { label: "설비·공간" }]}
        actions={
          <Button variant="primary" disabled title="자산 생성 API 계약 필요">
            자산 추가 (계약 필요)
          </Button>
        }
      />
      <p className={styles.sample}>
        예시 데이터입니다. 실제 프로젝트 데이터가 아니며 서버에 요청하지 않습니다.
      </p>
      <form className={styles.toolbar} role="search" onSubmit={(e) => e.preventDefault()}>
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
      </form>
      <p className={styles.count} aria-live="polite">
        {preview ? "" : `${rows.length}건`}
      </p>
      {body}
      <p className={styles.preview}>
        상태 미리보기:{" "}
        {["", "loading", "error", "empty", "forbidden"].map((s) => (
          <Link key={s} to={s ? `?state=${s}` : "."} className={styles.previewLink}>
            {s || "정상"}
          </Link>
        ))}
      </p>
    </>
  );
}
