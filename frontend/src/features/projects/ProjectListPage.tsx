import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { Button, LinkButton } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { TextField } from "../../shared/components/Fields";
import { FilterBar, PreviewStateLinks, SampleDataNotice } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { StateNotice } from "../../shared/components/StateNotice";
import { usePreviewState } from "../../shared/hooks/usePreviewState";
import type { ProjectView } from "./projectView";
import { SAMPLE_PROJECTS } from "./sampleProjects";

/** 접근 가능한 프로젝트 목록. 프로젝트를 고르기 전의 첫 화면이다. */
export function ProjectListPage() {
  const [params, setParams] = useSearchParams();
  const preview = usePreviewState();
  const q = params.get("q") ?? "";

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return SAMPLE_PROJECTS.filter(
      (p) =>
        !needle || p.code.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle),
    );
  }, [q]);

  const columns: Column<ProjectView>[] = [
    {
      key: "code",
      header: "코드",
      render: (p) => (
        <Link to={`/projects/${p.id}/assets`} aria-label={`${p.name} 열기`}>
          {p.code}
        </Link>
      ),
    },
    { key: "name", header: "이름", render: (p) => p.name },
    { key: "timezone", header: "시간대", render: (p) => p.timezone },
    { key: "role", header: "내 역할", render: (p) => p.role },
    { key: "status", header: "상태", render: (p) => p.status },
    { key: "description", header: "설명", render: (p) => p.description ?? "-" },
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
    body = <StateNotice kind="forbidden">프로젝트 목록을 볼 권한이 없습니다.</StateNotice>;
  else if (preview === "empty")
    body = (
      <StateNotice kind="empty" title="접근 가능한 프로젝트가 없습니다">
        프로젝트를 만들거나 관리자에게 멤버 등록을 요청하세요.
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
        caption="프로젝트 목록"
        columns={columns}
        rows={rows}
        getRowKey={(p) => p.id}
        wrapCells
      />
    );

  return (
    <>
      <PageHeader
        title="프로젝트"
        actions={<LinkButton to="/projects/new" variant="primary">프로젝트 만들기</LinkButton>}
      />
      <SampleDataNotice>
        예시 데이터입니다. 실제 프로젝트가 아니며 서버에 요청하지 않습니다. 프로젝트를 열면 해당
        프로젝트의 설비·공간 화면으로 이동합니다.
      </SampleDataNotice>
      <FilterBar>
        <TextField
          label="검색"
          hint="코드 또는 이름"
          value={q}
          onChange={(e) => {
            const merged = new URLSearchParams(params);
            if (e.target.value) merged.set("q", e.target.value);
            else merged.delete("q");
            setParams(merged, { replace: true });
          }}
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
