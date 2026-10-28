import { Link, useParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { classifyError } from "../../shared/api/errors";
import type { Schemas } from "../../shared/api/types";
import { ApiOnlyNotice } from "../../shared/components/ApiOnlyNotice";
import { LinkButton } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { Note, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { useCurrentProject } from "../projects/useCurrentProject";
import { numberText, percentText } from "./analysisView";
import { BottleneckSummaryView } from "./RunAnalysisSections";
import { AssumptionGroups } from "./RunDetailSections";
import { RunStatusBadge } from "./RunStatusBadge";
import { useMetricDefinitions, useRunReport } from "./queries";
/** 가상 시각 분: 서버 소수 원문 대신 읽기 좋게(소수 1자리) 보인다 */
const minutesText = (m: { min: string } | null | undefined) => (m ? `${numberText(m.min)}분` : "없음");

const QUALITY_TEXT: Record<string, string> = {
  complete: "완전한 관측",
  censored: "지평선에서 끊긴 관측",
  incomplete: "불완전한 관측",
};

/** 정지 규칙 원문(JsonValue)을 한 줄로: 모양을 가정하지 않고 키=값으로 보인다. */
function stoppingText(v: unknown): string {
  if (v === null || v === undefined) return "없음";
  if (typeof v !== "object") return String(v);
  if (Array.isArray(v)) return JSON.stringify(v);
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `${k}=${typeof x === "object" && x !== null ? JSON.stringify(x) : String(x)}`)
    .join(" · ");
}

const productLabel = (p: { product_code?: string | null; product_name?: string | null; product_id: string }) =>
  p.product_code ? `${p.product_code}${p.product_name ? ` ${p.product_name}` : ""}` : `제품 ${p.product_id.slice(0, 8)}`;

/**
 * 결과 리포트(0.16.0 `GET /runs/{r}/report`): 한 실행을 한 화면에 묶어 본다 — 한계 → 요약 문장 → 실행·시나리오 → 제품별 결과·지표 →
 * 병목·고칠 곳 → 가동률 상위 설비·대기 많은 공간 → 쓰인 가정. 서버가 만든 문장·값을 그대로 보이고, 제품끼리 합산하지 않는다.
 */
export function RunReportPage() {
  const { runId = "" } = useParams();
  const { projectId, label } = useCurrentProject();
  const source = useDataSource();
  const report = useRunReport(projectId, runId);
  const defs = useMetricDefinitions(source === "api");
  const defMap = new Map(defs.status === "success" ? defs.data.map((d) => [d.metric_key, d]) : []);

  const head = (
    <PageHeader
      title={`결과 리포트 ${runId.slice(0, 8)}`}
      breadcrumbs={[
        { label: "프로젝트", to: "/" },
        { label },
        { label: "실행 결과", to: `/projects/${projectId}/runs` },
        { label: runId.slice(0, 8), to: `/projects/${projectId}/runs/${runId}` },
        { label: "리포트" },
      ]}
      renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
      actions={<LinkButton to={`/projects/${projectId}/runs/${runId}`}>실행 상세로</LinkButton>}
    />
  );
  if (source === "static") return <>{head}<ApiOnlyNotice subject="결과 리포트" /></>;
  if (report.status === "pending") return <>{head}<StateNotice kind="loading" /></>;
  if (report.status === "error") {
    return (
      <>
        {head}
        {classifyError(report.error) === "state" ? (
          <StateNotice kind="empty" title="결과 리포트가 없습니다">
            이 실행에는 공식 결과가 없습니다. 끝까지 실행된 시도가 있어야 리포트를 만들 수 있습니다(대기·실행 중이거나 실패·취소로 끝난 실행은 제공하지 않습니다).
          </StateNotice>
        ) : (
          <QueryErrorNotice error={report.error} subject="결과 리포트" onRetry={report.retry} />
        )}
      </>
    );
  }
  const d = report.data;
  const run = d.run;
  const sc = d.scenario;

  const assetCols: Column<Schemas["ReportAssetOut"]>[] = [
    { key: "asset", header: "설비", render: (a) => (a.code ? `${a.code}${a.name ? ` ${a.name}` : ""}` : <code>{a.asset_id.slice(0, 8)}</code>) },
    { key: "util", header: "가동률", align: "end", render: (a) => percentText(a.utilization) },
    { key: "busy", header: "작업 시간(분)", align: "end", render: (a) => numberText(a.processing_time_min, 0) },
  ];
  const spaceCols: Column<Schemas["ReportSpaceOut"]>[] = [
    { key: "node", header: "공간", render: (x) => (x.node_label ? `${x.node_label} ` : "") },
    { key: "key", header: "노드 키", render: (x) => <code>{x.node_key}</code> },
    { key: "wait", header: "공간 부족 대기(작업물·분)", align: "end", render: (x) => numberText(x.space_wait_item_min, 0) },
    { key: "buf", header: "머문 양(작업물·분)", align: "end", render: (x) => numberText(x.buffer_item_min, 0) },
    { key: "peak", header: "최대 머문 수", align: "end", render: (x) => numberText(x.buffer_peak_items, 0) },
    { key: "avg", header: "평균 머문 시간(분)", align: "end", render: (x) => numberText(x.buffer_wait_avg_min) },
  ];
  const metricCols: Column<Schemas["ReportMetricOut"]>[] = [
    {
      key: "metric",
      header: "지표",
      render: (m) => (
        <>
          {defMap.get(m.metric_key)?.description ?? m.metric_key} <code>{m.metric_key}</code>
        </>
      ),
    },
    { key: "value", header: "값", align: "end", render: (m) => numberText(m.value, 3) },
    { key: "unit", header: "단위", render: (m) => m.unit ?? "" },
  ];
  const shortCols: Column<Schemas["ShortfallOut"]>[] = [
    { key: "step", header: "단계", render: (s) => s.step ?? "" },
    { key: "pool", header: "풀", render: (s) => s.pool },
    { key: "needed", header: "필요", align: "end", render: (s) => s.needed },
    { key: "held", header: "보유", align: "end", render: (s) => s.held },
    { key: "waiting", header: "대기", align: "end", render: (s) => s.waiting },
  ];

  return (
    <>
      {head}
      {/* 한계는 결과 해석의 전제라 항상 맨 위에 펼쳐 보인다 */}
      <StateNotice kind="contract-pending" title="이 리포트의 한계">
        {d.limitations.length === 0 ? (
          "서버가 알린 한계가 없습니다."
        ) : (
          <ul>
            {d.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </StateNotice>
      {run.quality_status !== "complete" && (
        <StateNotice kind="conflict" title={QUALITY_TEXT[run.quality_status] ?? run.quality_status}>
          {run.censored ? "고정 지평선에서 끊긴 관측입니다. 지평선 이후의 일은 결과에 포함되지 않습니다." : "관측이 완전하지 않아 값이 실제보다 작거나 클 수 있습니다."}
        </StateNotice>
      )}
      {d.assumptions.length > 0 && (
        <StateNotice kind="conflict" title="가정 위의 결과입니다">
          이 결과는 시나리오가 정한 가정(아래 "쓰인 가정") 위에서 얻은 값입니다.
        </StateNotice>
      )}

      <Section id="rep-summary" title="요약">
        {d.summary.length === 0 ? (
          <Note>요약 문장이 없습니다.</Note>
        ) : (
          <ul aria-label="요약 문장">
            {d.summary.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
        <Note>요약 문장은 서버가 정해진 규칙으로 만든 것이며 리포트 정의 버전 {d.definition_version}입니다.</Note>
      </Section>

      <Section id="rep-run" title="실행·시나리오">
        <dl>
          <dt>상태</dt>
          <dd>
            <RunStatusBadge status={run.status} />
            {run.termination_reason ? ` · ${run.termination_reason}` : ""}
          </dd>
          <dt>관측 시간(가상)</dt>
          <dd>
            {minutesText(run.observed)} · {QUALITY_TEXT[run.quality_status] ?? run.quality_status}
          </dd>
          <dt>이벤트 수 / 남은 재공품(작업물 수)</dt>
          <dd>
            {run.event_count} / {run.wip_items}
          </dd>
          <dt>엔진 버전 · seed / 반복</dt>
          <dd>
            {run.engine_version} · {run.seed} / {run.replicate_index}
          </dd>
          <dt>입력 해시</dt>
          <dd>
            <code>{run.input_hash}</code>
          </dd>
          <dt>시나리오</dt>
          <dd>
            {sc.scenario_version_id ? (
              <Link to={`/projects/${projectId}/scenarios/versions/${sc.scenario_version_id}`}>
                {sc.code ?? sc.scenario_version_id.slice(0, 8)}
                {sc.version_no !== null && sc.version_no !== undefined ? ` v${sc.version_no}` : ""}
              </Link>
            ) : (
              (sc.code ?? "알 수 없음")
            )}
          </dd>
          <dt>정지 규칙</dt>
          <dd>{stoppingText(sc.stopping_rule)}</dd>
          {sc.assumption_reason && (
            <>
              <dt>가정 사유</dt>
              <dd>{sc.assumption_reason}</dd>
            </>
          )}
        </dl>
      </Section>

      <Section id="rep-products" title="제품별 결과">
        <Note>서로 다른 제품의 생산량·지표는 합산하지 않고 제품(공정 버전)별로 따로 보입니다. 값이 없으면 "해당 없음"입니다.</Note>
        {d.products.length === 0 && <StateNotice kind="empty" title="제품 결과가 없습니다" />}
        {d.products.map((p) => (
          <section key={p.process_version_id} aria-label={`제품 결과: ${productLabel(p)}`}>
            <h3>
              {productLabel(p)} <code>{p.process_version_id.slice(0, 8)}</code>
            </h3>
            <p>
              완제품 {p.completed_items}개 · 최초 완료 {minutesText(p.first_completion)} · 최종 완료 {minutesText(p.last_completion)}
            </p>
            {p.metrics.length > 0 && <DataTable caption={`${productLabel(p)} 지표`} columns={metricCols} rows={p.metrics} getRowKey={(m) => m.metric_key} />}
            {p.shortfalls.length > 0 && (
              <>
                <h4>부족한 입력</h4>
                <DataTable caption={`${productLabel(p)} 부족한 입력`} columns={shortCols} rows={p.shortfalls} getRowKey={(s) => `${s.step ?? ""}:${s.pool}`} />
              </>
            )}
          </section>
        ))}
      </Section>

      <Section id="rep-bottlenecks" title="병목·고칠 곳">
        <BottleneckSummaryView data={d.bottlenecks} />
      </Section>

      <Section id="rep-assets" title="가동률 상위 설비">
        {d.top_assets.length === 0 ? (
          <StateNotice kind="empty" title="가동률을 계산한 설비가 없습니다" />
        ) : (
          <DataTable caption="가동률 상위 설비" columns={assetCols} rows={d.top_assets} getRowKey={(a) => a.asset_id} />
        )}
      </Section>

      <Section id="rep-spaces" title="대기가 많은 공간">
        {d.top_spaces.length === 0 ? (
          <StateNotice kind="empty" title="대기가 기록된 공간이 없습니다" />
        ) : (
          <DataTable caption="대기가 많은 공간" columns={spaceCols} rows={d.top_spaces} getRowKey={(x) => x.node_key} />
        )}
      </Section>

      <Section id="rep-assumptions" title="쓰인 가정">
        {d.assumptions.length === 0 ? <Note>이 실행에 쓰인 가정이 없습니다.</Note> : <AssumptionGroups list={d.assumptions} />}
      </Section>
    </>
  );
}
