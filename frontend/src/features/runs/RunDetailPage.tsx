import { useState } from "react";
import { Link, useParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { classifyError } from "../../shared/api/errors";
import { ApiOnlyNotice } from "../../shared/components/ApiOnlyNotice";
import { Button, LinkButton } from "../../shared/components/Button";
import { SelectField } from "../../shared/components/Fields";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { Note, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { formatDateTime } from "../../shared/format/datetime";
import { canEdit } from "../projects/projectView";
import { useProjectTimezone } from "../projects/queries";
import { useCurrentProject } from "../projects/useCurrentProject";
import { RunAssetTimelineSection, RunBottlenecksSection } from "./RunAnalysisSections";
import { RunEventsSection, RunInputSection, RunMetricsSection, RunResultSection } from "./RunDetailSections";
import { RunStatusBadge } from "./RunStatusBadge";
import { useRun, useRunList, runKey } from "./queries";
import { ATTEMPT_STATE_LABELS, isActiveRun, terminationText, type RunOut } from "./runView";
import { useRunWriter } from "./writer";
import { useQueryClient } from "@tanstack/react-query";

/**
 * 실행 상세: 상태(진행 중이면 자동 갱신)·시도·결과 요약·입력 스냅샷·지표·이벤트.
 * 결과·지표·이벤트는 끝까지 실행된 시도(공식 결과)가 있을 때만 제공된다. 취소·실패·미완료 실행의 부분 기록은 보여 주지 않는다.
 */
export function RunDetailPage() {
  const { runId = "" } = useParams();
  const { projectId, label, project } = useCurrentProject();
  const source = useDataSource();
  const tz = useProjectTimezone(projectId);
  const run = useRun(projectId, runId);
  const writer = useRunWriter(projectId);
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mayCancel = canEdit(project?.role);

  const head = (
    <PageHeader
      title={`실행 ${runId.slice(0, 8)}`}
      breadcrumbs={[{ label: "프로젝트", to: "/" }, { label }, { label: "실행 결과", to: `/projects/${projectId}/runs` }, { label: runId.slice(0, 8) }]}
      renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
    />
  );
  if (source === "static") return <>{head}<ApiOnlyNotice subject="실행 결과" /></>;
  if (run.status === "pending") return <>{head}<StateNotice kind="loading" /></>;
  if (run.status === "error") return <>{head}<QueryErrorNotice error={run.error} subject="실행" onRetry={run.retry} /></>;

  const r: RunOut = run.data;
  const active = isActiveRun(r.status);
  const fmt = (iso: string | null) => (iso ? formatDateTime(iso, tz) : "");

  async function cancel() {
    setConfirm(false);
    setBusy(true);
    setError(null);
    try {
      await writer.cancel(runId);
    } catch (e) {
      // 이미 끝난 실행(409 JOB_CANCEL_TOO_LATE)은 서버 상태를 다시 읽어 맞춘다
      if (classifyError(e) === "state") void qc.invalidateQueries({ queryKey: runKey(projectId, source, runId) });
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const attemptCols: Column<RunOut["attempts"][number]>[] = [
    { key: "no", header: "시도", align: "end", render: (a) => a.attempt_no },
    { key: "state", header: "상태", render: (a) => ATTEMPT_STATE_LABELS[a.state] ?? a.state },
    { key: "started", header: "시작", render: (a) => fmt(a.started_at) },
    { key: "finished", header: "종료", render: (a) => fmt(a.finished_at) },
    { key: "reason", header: "종료 사유", render: (a) => terminationText(a.termination_reason) },
  ];

  return (
    <>
      {head}
      <Section id="sec-status" title="상태">
        <p>
          <RunStatusBadge status={r.status} />
          {active && <span role="status"> 진행 중입니다. 자동으로 갱신됩니다.</span>}
        </p>
        {r.cancel_requested_at && active && <Note>취소를 요청했습니다({fmt(r.cancel_requested_at)}). 실행 담당(worker)이 멈출 때까지 잠시 걸릴 수 있습니다.</Note>}
        {r.termination_reason && <p>종료 사유: {terminationText(r.termination_reason)}</p>}
        <SaveErrorNotice error={error} />
        <dl>
          <dt>요청 시각</dt>
          <dd>{fmt(r.requested_at)}</dd>
          <dt>시작</dt>
          <dd>{fmt(r.started_at)}</dd>
          <dt>종료</dt>
          <dd>{fmt(r.finished_at)}</dd>
          <dt>시나리오 버전</dt>
          <dd>
            <Link to={`/projects/${projectId}/scenarios/versions/${r.scenario_version_id}`}>{r.scenario_version_id.slice(0, 8)}</Link>
          </dd>
          <dt>seed / 반복</dt>
          <dd>
            {r.seed} / {r.replicate_index}
          </dd>
          <dt>엔진 버전</dt>
          <dd>{r.engine_version}</dd>
          <dt>입력 해시</dt>
          <dd>
            <code>{r.input_hash}</code>
          </dd>
        </dl>
        {!active && r.result !== null && (
          <p>
            <LinkButton to={`/projects/${projectId}/runs/${runId}/report`}>결과 리포트 보기</LinkButton>
          </p>
        )}
        {active && (
          <div>
            <Button
              disabled={!mayCancel || busy || !!r.cancel_requested_at}
              onClick={() => setConfirm(true)}
              title={mayCancel ? undefined : "이 역할은 실행을 취소할 수 없습니다(관리자·편집자만)"}
            >
              {r.cancel_requested_at ? "취소 요청됨" : "실행 취소"}
            </Button>
          </div>
        )}
        <h3>시도</h3>
        {r.attempts.length === 0 ? <Note>아직 시작한 시도가 없습니다.</Note> : <DataTable caption="실행 시도" columns={attemptCols} rows={r.attempts} getRowKey={(a) => String(a.attempt_no)} />}
      </Section>
      <ConfirmDialog open={confirm} title="실행을 취소할까요?" confirmLabel="취소 요청" cancelLabel="닫기" onConfirm={() => void cancel()} onCancel={() => setConfirm(false)}>
        대기 중이면 바로 취소되고, 실행 중이면 취소를 요청하며 worker가 멈춘 뒤 취소됩니다. 이미 끝난 실행은 취소할 수 없습니다.
      </ConfirmDialog>
      {r.result && <RunResultSection result={r.result} projectId={projectId} />}
      <RunBottlenecksSection projectId={projectId} runId={runId} enabled={!active && r.result !== null} />
      <RunAssetTimelineSection projectId={projectId} runId={runId} enabled={!active && r.result !== null} />
      {!active && r.result !== null && <CompareWith projectId={projectId} runId={runId} />}
      <RunInputSection projectId={projectId} runId={runId} />
      <RunMetricsSection projectId={projectId} runId={runId} enabled={!active && r.result !== null} />
      <RunEventsSection projectId={projectId} runId={runId} enabled={!active && r.result !== null} />
    </>
  );
}

const RESULT_STATES = new Set(["completed", "stalled", "horizon_reached", "limit_reached"]);

/** 다른 실행과 비교: 같은 프로젝트의 결과가 있는(끝까지 실행된) 실행을 고른다. 서버가 최종 판정한다(결과 없으면 409). */
function CompareWith({ projectId, runId }: { projectId: string; runId: string }) {
  const runs = useRunList(projectId, { status: "", scenarioVersionId: "" });
  const [other, setOther] = useState("");
  const options = runs.status === "success" ? runs.data.items.filter((x) => x.id !== runId && RESULT_STATES.has(x.status)) : [];
  return (
    <Section id="sec-compare" title="다른 실행과 비교">
      <Note>이 실행을 기준으로, 다른 실행과 입력 차이·제품별 결과·병목·지표 차이를 나란히 봅니다.</Note>
      {runs.status === "pending" && <StateNotice kind="loading" />}
      {runs.status === "error" && <QueryErrorNotice error={runs.error} subject="실행 목록" onRetry={runs.retry} />}
      {runs.status === "success" &&
        (options.length === 0 ? (
          <Note>비교할 다른 실행이 없습니다(결과가 있는 실행만 비교할 수 있습니다).</Note>
        ) : (
          <div>
            <SelectField label="비교할 실행" value={other} onChange={(e) => setOther(e.target.value)}>
              <option value="">고르세요</option>
              {options.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.id.slice(0, 8)} · seed {x.seed} · 반복 {x.replicate_index} · {x.status}
                </option>
              ))}
            </SelectField>
            {other ? (
              <LinkButton to={`/projects/${projectId}/runs/${runId}/compare/${other}`}>비교 보기</LinkButton>
            ) : (
              <Button disabled title="비교할 실행을 고르세요">
                비교 보기
              </Button>
            )}
          </div>
        ))}
    </Section>
  );
}
