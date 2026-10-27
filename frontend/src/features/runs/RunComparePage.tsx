import { useState } from "react";
import { Link, useParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { classifyError } from "../../shared/api/errors";
import type { Schemas } from "../../shared/api/types";
import { ApiOnlyNotice } from "../../shared/components/ApiOnlyNotice";
import { Button, LinkButton } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { CheckboxField, SelectField } from "../../shared/components/Fields";
import { FilterBar, Note, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { useCurrentProject } from "../projects/useCurrentProject";
import { numberText, WINDOW_TEXT } from "./analysisView";
import { FindingItem } from "./RunAnalysisSections";
import { RunStatusBadge } from "./RunStatusBadge";
import { useComparisonMetrics, useMetricDefinitions, useRunComparison } from "./queries";
import { minutesText } from "./runView";
import styles from "./RunAnalysis.module.css";

/** 비교 값 표시: null은 0이 아니라 "비교 불가/해당 없음"이다(기준이 0·null이거나 한쪽에만 있음). */
const val = (s: string | null | undefined) => (s === null || s === undefined ? "해당 없음" : numberText(s, 3));
const ratioText = (s: string | null | undefined) => (s === null || s === undefined ? "비교 불가" : `×${numberText(s, 3)}`);
const json = (v: unknown) => (v === null || v === undefined ? "없음" : typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v));

const DIM_TEXT: Record<string, string> = { product_code: "제품", product_id: "제품", asset_key: "설비", node_key: "노드", step_key: "단계", process_version_id: "공정 버전" };

/**
 * 두 실행 비교(0.13.0, 저장 없는 조회형). 엔진은 결정적이라 결과 차이는 입력 차이에서 온다 — 비교 가능 여부와 경고를 먼저,
 * 그다음 입력 차이·제품별 결과·병목·지표 차이를 보인다. 공정 버전이 달라도 같은 제품끼리 맞추며 제품끼리 합산하지 않는다.
 */
export function RunComparePage() {
  const { runId = "", otherId = "" } = useParams();
  const { projectId, label } = useCurrentProject();
  const source = useDataSource();
  const cmp = useRunComparison(projectId, runId, otherId);
  const defs = useMetricDefinitions(source === "api");
  const [window, setWindow] = useState("run");
  const [metricKey, setMetricKey] = useState("");
  const [changedOnly, setChangedOnly] = useState(true);
  const metrics = useComparisonMetrics(projectId, runId, otherId, { window, metricKey, changedOnly });
  const defMap = new Map(defs.status === "success" ? defs.data.map((d) => [d.metric_key, d]) : []);

  const head = (
    <PageHeader
      title={`실행 비교 ${runId.slice(0, 8)} ↔ ${otherId.slice(0, 8)}`}
      breadcrumbs={[{ label: "프로젝트", to: "/" }, { label }, { label: "실행 결과", to: `/projects/${projectId}/runs` }, { label: "비교" }]}
      renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
      actions={<LinkButton to={`/projects/${projectId}/runs/${otherId}/compare/${runId}`}>기준·비교 바꾸기</LinkButton>}
    />
  );
  if (source === "static") return <>{head}<ApiOnlyNotice subject="실행 비교" /></>;
  if (cmp.status === "pending") return <>{head}<StateNotice kind="loading" /></>;
  if (cmp.status === "error") {
    const kind = classifyError(cmp.error);
    return (
      <>
        {head}
        {kind === "state" ? (
          <StateNotice kind="empty" title="비교할 결과가 없습니다">
            두 실행 모두 끝까지 실행된 시도(공식 결과)가 있어야 비교할 수 있습니다.
          </StateNotice>
        ) : kind === "validation" ? (
          <StateNotice kind="error" title="같은 실행끼리는 비교할 수 없습니다" />
        ) : (
          <QueryErrorNotice error={cmp.error} subject="실행 비교" onRetry={cmp.retry} />
        )}
      </>
    );
  }
  const c = cmp.data;

  const changeCols: Column<Schemas["InputChangeOut"]>[] = [
    { key: "path", header: "입력 항목", render: (x) => <code>{x.path}</code> },
    { key: "base", header: "기준", render: (x) => json(x.base) },
    { key: "other", header: "비교", render: (x) => json(x.other) },
    { key: "note", header: "설명", render: (x) => x.note ?? "" },
  ];
  const pairCols: Column<Schemas["MetricPairOut"]>[] = [
    { key: "metric", header: "지표", render: (m) => defMap.get(m.metric_key)?.description ?? m.metric_key },
    { key: "base", header: "기준", align: "end", render: (m) => val(m.base) },
    { key: "other", header: "비교", align: "end", render: (m) => val(m.other) },
    { key: "delta", header: "차이(비교−기준)", align: "end", render: (m) => val(m.delta) },
    { key: "ratio", header: "비율", align: "end", render: (m) => ratioText(m.ratio) },
    { key: "unit", header: "단위", render: (m) => m.unit ?? "" },
  ];
  const diffCols: Column<Schemas["MetricComparisonOut"]>[] = [
    {
      key: "metric",
      header: "지표",
      render: (m) => (
        <>
          <code>{m.metric_key}</code>
          {defMap.get(m.metric_key) && <div>{defMap.get(m.metric_key)!.description}</div>}
        </>
      ),
    },
    {
      key: "dim",
      header: "대상",
      render: (m) =>
        Object.entries(m.dimensions)
          .filter(([k]) => k !== "product_id" || !("product_code" in m.dimensions))
          .map(([k, v]) => `${DIM_TEXT[k] ?? k} ${k.endsWith("_id") ? String(v).slice(0, 8) : String(v)}`)
          .join(" · "),
    },
    { key: "window", header: "구간(분)", render: (m) => (m.window.kind === "run" ? "실행 전체" : `${numberText(m.window.start.min, 0)}~${numberText(m.window.end.min, 0)}`) },
    { key: "base", header: "기준", align: "end", render: (m) => val(m.base) },
    { key: "other", header: "비교", align: "end", render: (m) => val(m.other) },
    { key: "delta", header: "차이", align: "end", render: (m) => val(m.delta) },
    { key: "ratio", header: "비율", align: "end", render: (m) => ratioText(m.ratio) },
    { key: "unit", header: "단위", render: (m) => m.unit ?? "" },
  ];

  return (
    <>
      {head}
      {!c.comparable && (
        <StateNotice kind="error" title="엔진 버전이 달라 결과를 그대로 비교할 수 없습니다">
          아래 값은 참고용입니다. 같은 엔진 버전으로 다시 실행한 뒤 비교하세요.
        </StateNotice>
      )}
      {c.warnings.length > 0 && (
        <StateNotice kind="conflict" title="비교할 때 주의할 점">
          <ul className={styles.limits}>
            {c.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </StateNotice>
      )}
      <Note>엔진은 결정적이라(같은 입력이면 같은 결과) 결과 차이는 입력 차이에서 옵니다. 공정 내용의 차이는 공정 버전 비교에서 봅니다. 제품끼리는 합산하지 않습니다.</Note>

      <Section id="sec-runs" title="두 실행">
        <div className={styles.pair}>
          {[
            { role: "기준", id: c.base_run_id, status: c.base_status, end: c.base_end_time },
            { role: "비교", id: c.other_run_id, status: c.other_status, end: c.other_end_time },
          ].map((r) => (
            <dl key={r.role} aria-label={`${r.role} 실행`}>
              <dt>{r.role}</dt>
              <dd>
                <Link to={`/projects/${projectId}/runs/${r.id}`}>{r.id.slice(0, 8)}</Link> <RunStatusBadge status={r.status} />
              </dd>
              <dt>종료 시각(가상)</dt>
              <dd>{minutesText(r.end)}</dd>
            </dl>
          ))}
        </div>
      </Section>

      <Section id="sec-input" title="입력 차이">
        {c.input_changes.length === 0 ? (
          <StateNotice kind="empty" title="입력 차이가 없습니다">
            같은 입력이면 결과도 같습니다.
          </StateNotice>
        ) : (
          <DataTable caption="입력 차이" columns={changeCols} rows={c.input_changes} getRowKey={(x) => x.path} wrapCells />
        )}
      </Section>

      <Section id="sec-products" title="제품별 결과">
        {c.products.length === 0 && <StateNotice kind="empty" title="두 실행에 함께 있는 제품이 없습니다" />}
        {c.products.map((p) => (
          <section key={p.product_id} aria-label={`${p.product_code ?? p.product_id.slice(0, 8)} 비교`}>
            <h3>
              {p.product_code ?? `제품 ${p.product_id.slice(0, 8)}`} {p.product_name ?? ""}
            </h3>
            <p className={styles.muted}>
              마지막 완료: 기준 {minutesText(p.base_last_completion)} · 비교 {minutesText(p.other_last_completion)}
              {p.base_process_version_id !== p.other_process_version_id && " · 공정 버전이 다릅니다"}
            </p>
            <DataTable caption={`${p.product_code ?? p.product_id} 지표 비교`} columns={pairCols} rows={p.metrics} getRowKey={(m) => m.metric_key} />
          </section>
        ))}
      </Section>

      <Section id="sec-bottlenecks" title="병목(상위 5)">
        <div className={styles.pair}>
          {(["base", "other"] as const).map((side) => (
            <div key={side} aria-label={`${side === "base" ? "기준" : "비교"} 실행 병목`}>
              <h3>{side === "base" ? "기준" : "비교"}</h3>
              {c.bottlenecks[side].length === 0 ? (
                <Note>기준을 넘는 병목이 없습니다.</Note>
              ) : (
                <ul className={styles.findings}>
                  {c.bottlenecks[side].map((f) => (
                    <FindingItem key={`${f.kind}-${f.rank}`} f={f} />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section id="sec-metrics" title="지표 차이">
        <FilterBar>
          <SelectField label="구간" hint="일·주·월은 지표를 하나 골라야 합니다." value={window} onChange={(e) => setWindow(e.target.value)}>
            {["run", "day", "week", "month"].map((w) => (
              <option key={w} value={w}>
                {WINDOW_TEXT[w]}
              </option>
            ))}
          </SelectField>
          <SelectField label="지표" value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
            <option value="">{window === "run" ? "전체" : "지표를 고르세요"}</option>
            {defs.status === "success" &&
              defs.data.map((d) => (
                <option key={d.metric_key} value={d.metric_key}>
                  {d.metric_key} ({d.unit})
                </option>
              ))}
          </SelectField>
          <CheckboxField label="달라진 값만" checked={changedOnly} onChange={(e) => setChangedOnly(e.target.checked)} />
        </FilterBar>
        {window !== "run" && metricKey === "" && <Note>일·주·월 구간은 지표를 하나 고르면 보입니다.</Note>}
        {metrics.status === "pending" && (window === "run" || metricKey !== "") && <StateNotice kind="loading" />}
        {metrics.status === "error" && <QueryErrorNotice error={metrics.error} subject="지표 차이" onRetry={metrics.retry} />}
        {metrics.status === "success" &&
          (metrics.data.items.length === 0 ? (
            <StateNotice kind="empty" title={changedOnly ? "달라진 지표가 없습니다" : "지표가 없습니다"} />
          ) : (
            <>
              <DataTable
                caption="지표 차이"
                columns={diffCols}
                rows={metrics.data.items}
                getRowKey={(m) => `${m.metric_key}|${JSON.stringify(m.dimensions)}|${m.window.kind}|${m.window.start.exact}`}
                wrapCells
              />
              {metrics.data.hasMore && (
                <p>
                  <Button onClick={metrics.data.fetchMore} disabled={metrics.data.fetchingMore}>
                    {metrics.data.fetchingMore ? "불러오는 중…" : "더 보기"}
                  </Button>
                </p>
              )}
            </>
          ))}
      </Section>
    </>
  );
}
