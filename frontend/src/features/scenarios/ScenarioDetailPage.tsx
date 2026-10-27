import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { classifyError } from "../../shared/api/errors";
import { ApiOnlyNotice } from "../../shared/components/ApiOnlyNotice";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { Note, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { formatDateTime } from "../../shared/format/datetime";
import { canEdit } from "../projects/projectView";
import { useCurrentProject, } from "../projects/useCurrentProject";
import { useProjectTimezone } from "../projects/queries";
import { useScenario, useScenarioVersions } from "./queries";
import type { ScenarioVersionItem } from "./scenarioView";
import { useScenarioWriter } from "./writer";

/** 시나리오 상세: 버전 목록과 새 초안. 시나리오당 열린 초안은 하나다(409 SCENARIO_DRAFT_EXISTS). */
export function ScenarioDetailPage() {
  const { scenarioId = "" } = useParams();
  const { projectId, label, project } = useCurrentProject();
  const source = useDataSource();
  const navigate = useNavigate();
  const tz = useProjectTimezone(projectId);
  const scenario = useScenario(projectId, scenarioId);
  const versions = useScenarioVersions(projectId, scenarioId);
  const writer = useScenarioWriter(projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mayEdit = canEdit(project?.role);

  const draft = versions.status === "success" ? versions.data.find((v) => v.status === "draft") : undefined;
  const crumbs = [{ label: "프로젝트", to: "/" }, { label }, { label: "시나리오", to: `/projects/${projectId}/scenarios` }];
  const head = (title: string) => <PageHeader title={title} breadcrumbs={[...crumbs, { label: title }]} renderLink={(c) => <Link to={c.to!}>{c.label}</Link>} />;

  async function newDraft(from?: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const v = await writer.createDraft(scenarioId, from);
      navigate(`/projects/${projectId}/scenarios/versions/${v.id}`);
    } catch (e) {
      // 이미 열린 초안이 있으면 그 초안으로 이동한다(서버 상태가 정본)
      if (classifyError(e) === "state" && draft) navigate(`/projects/${projectId}/scenarios/versions/${draft.id}`);
      else setError(e);
    } finally {
      setBusy(false);
    }
  }

  if (source === "static")
    return (
      <>
        {head("시나리오")}
        <ApiOnlyNotice subject="시나리오" />
      </>
    );
  if (scenario.status === "pending") return <>{head("시나리오")}<StateNotice kind="loading" /></>;
  if (scenario.status === "error") return <>{head("시나리오")}<QueryErrorNotice error={scenario.error} subject="시나리오" onRetry={scenario.retry} /></>;

  const s = scenario.data;
  const columns: Column<ScenarioVersionItem>[] = [
    {
      key: "no",
      header: "버전",
      render: (v) => (
        <Link to={`/projects/${projectId}/scenarios/versions/${v.id}`} aria-label={`v${v.versionNo} 열기`}>
          v{v.versionNo}
        </Link>
      ),
    },
    { key: "status", header: "상태", render: (v) => <VersionStatusBadge status={v.status} /> },
    { key: "approved", header: "승인 시각", render: (v) => (v.approvedAt ? formatDateTime(v.approvedAt, tz) : "") },
    { key: "created", header: "만든 시각", render: (v) => formatDateTime(v.createdAt, tz) },
    {
      key: "action",
      header: "작업",
      render: (v) =>
        mayEdit && !draft ? (
          <Button onClick={() => void newDraft(v.id)} disabled={busy} aria-label={`v${v.versionNo}로 새 초안 만들기`}>
            이 버전으로 새 초안
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      {head(`${s.code} ${s.name}`)}
      <Section id="sec-info" title="시나리오 정보">
        <dl>
          <dt>표시 코드</dt>
          <dd>{s.code}</dd>
          <dt>이름</dt>
          <dd>{s.name}</dd>
          <dt>설명</dt>
          <dd>{s.description ?? "입력 없음"}</dd>
        </dl>
      </Section>
      <Section id="sec-versions" title="버전">
        <SaveErrorNotice error={error} />
        <div>
          {mayEdit ? (
            <Button variant="primary" onClick={() => void newDraft()} disabled={busy || !!draft} title={draft ? "이미 열린 초안이 있습니다(시나리오당 하나)" : undefined}>
              {busy ? "만드는 중…" : "새 초안 만들기"}
            </Button>
          ) : (
            <Button variant="primary" disabled title="이 역할은 초안을 만들 수 없습니다(관리자·편집자만)">
              새 초안 만들기
            </Button>
          )}
          {draft && <Note>열린 초안 v{draft.versionNo}이 있습니다. 승인하거나 이어서 편집하세요.</Note>}
        </div>
        {versions.status === "pending" && <StateNotice kind="loading" />}
        {versions.status === "error" && <QueryErrorNotice error={versions.error} subject="버전 목록" onRetry={versions.retry} />}
        {versions.status === "success" &&
          (versions.data.length === 0 ? (
            <StateNotice kind="empty" title="버전이 없습니다" />
          ) : (
            <DataTable caption="시나리오 버전" columns={columns} rows={versions.data} getRowKey={(v) => v.id} />
          ))}
      </Section>
    </>
  );
}
