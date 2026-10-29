import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { classifyError } from "../../shared/api/errors";
import type { Schemas } from "../../shared/api/types";
import { ApiOnlyNotice } from "../../shared/components/ApiOnlyNotice";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { Note } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { formatDateTime } from "../../shared/format/datetime";
import { canEdit } from "../projects/projectView";
import { useCurrentProject } from "../projects/useCurrentProject";
import { useProjectTimezone } from "../projects/queries";
import { useLayoutList } from "./queries";
import { useLayoutWriter } from "./writer";

/**
 * 배치판 버전 목록(계약 0.17.0). 배치판은 공장 도면 위의 설비·공간 위치, 점, 포트 → 점 매핑, 점 순서 경로를 담는다.
 * 초안 → 승인으로 관리하며 승인본은 바뀌지 않는다. 새 초안은 최근 승인본을 복사하고 프로젝트에 초안은 하나만 있다.
 */
export function LayoutListPage() {
  const { projectId, label, project } = useCurrentProject();
  const timezone = useProjectTimezone(projectId);
  const source = useDataSource();
  const list = useLayoutList(projectId);
  const writer = useLayoutWriter(projectId);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [exists, setExists] = useState(false);
  const mayCreate = canEdit(project?.role);
  const items = list.status === "success" ? list.data : [];
  const draft = items.find((v) => v.status === "draft");
  const fmt = (iso: string | null | undefined) => (iso ? formatDateTime(iso, timezone) : "");

  async function create() {
    setBusy(true);
    setError(null);
    setExists(false);
    try {
      const v = await writer.createDraft();
      navigate(`/projects/${projectId}/layouts/${v.id}`);
    } catch (e) {
      if (classifyError(e) === "state") setExists(true);
      else setError(e);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Schemas["LayoutVersionListItem"]>[] = [
    {
      key: "version",
      header: "버전",
      render: (v) => (
        <Link to={`/projects/${projectId}/layouts/${v.id}`} aria-label={`배치판 v${v.version_no} 열기`}>
          v{v.version_no}
        </Link>
      ),
    },
    { key: "status", header: "상태", render: (v) => <VersionStatusBadge status={v.status} /> },
    { key: "name", header: "이름", render: (v) => v.name ?? "" },
    { key: "created", header: "만든 시각", render: (v) => fmt(v.created_at) },
    { key: "approved", header: "승인 시각", render: (v) => fmt(v.approved_at) },
  ];

  let body;
  if (source === "static") body = <ApiOnlyNotice subject="배치판" />;
  else if (list.status === "pending") body = <StateNotice kind="loading" />;
  else if (list.status === "error") body = <QueryErrorNotice error={list.error} subject="배치판 목록" onRetry={list.retry} />;
  else if (items.length === 0)
    body = (
      <StateNotice kind="empty" title="배치판이 없습니다">
        새 초안을 만들어 도면 위에 설비·공간을 놓고, 점과 경로로 이동 길을 그립니다. 처음 만드는 초안은 비어 있습니다.
      </StateNotice>
    );
  else body = <DataTable caption="배치판 버전" columns={columns} rows={items} getRowKey={(v) => v.id} />;

  return (
    <>
      <PageHeader
        title="배치판"
        breadcrumbs={[{ label: "프로젝트", to: "/" }, { label }, { label: "배치판" }]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
        actions={
          source === "api" && mayCreate ? (
            <Button variant="primary" onClick={() => void create()} disabled={busy || list.status !== "success"}>
              {busy ? "만드는 중…" : "새 초안 만들기"}
            </Button>
          ) : undefined
        }
      />
      <Note>
        좌표는 m 단위이며 원점은 도면 왼쪽 위, x는 오른쪽·y는 아래쪽으로 커집니다. 설비·공간의 위치는 중심입니다. 지금은 배치판을 시나리오·엔진이 쓰지 않습니다(후속).
      </Note>
      {source === "api" && !mayCreate && <Note>이 역할은 배치판을 만들거나 고칠 수 없습니다(편집자·관리자만).</Note>}
      {exists && (
        <StateNotice kind="conflict" title="이미 열린 초안이 있습니다">
          프로젝트에 배치판 초안은 하나만 둘 수 있습니다.{" "}
          {draft ? <Link to={`/projects/${projectId}/layouts/${draft.id}`}>v{draft.version_no} 초안 열기</Link> : "목록을 새로 고쳐 초안을 확인하세요."}
        </StateNotice>
      )}
      {error !== null && <SaveErrorNotice error={error} />}
      {body}
    </>
  );
}
