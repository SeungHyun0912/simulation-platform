import { useState } from "react";
import { classifyError } from "../../shared/api/errors";
import type { Schemas } from "../../shared/api/types";
import { Button } from "../../shared/components/Button";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { SelectField, TextField } from "../../shared/components/Fields";
import { FilterBar, Note, Section } from "../../shared/components/Layout";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { useProductOptions } from "../scenarios/queries";
import { useMetricDefinitions, useRunEvents, useRunInput, useRunMetrics } from "./queries";
import { minutesText, type RunResult } from "./runView";

const RESULT_UNAVAILABLE =
  "이 실행에는 공식 결과가 없습니다. 끝까지 실행된 시도가 있어야 합니다(대기·실행 중이거나 실패·취소로 끝난 실행은 제공하지 않습니다).";

/** 409 RUN_RESULT_NOT_AVAILABLE은 오류가 아니라 "아직/끝내 결과 없음"이라 안내로 보인다. */
function ResultErrorNotice({ error, subject, onRetry }: { error: unknown; subject: string; onRetry: () => void }) {
  if (classifyError(error) === "state") return <StateNotice kind="empty" title={`${subject}이(가) 없습니다`}>{RESULT_UNAVAILABLE}</StateNotice>;
  return <QueryErrorNotice error={error} subject={subject} onRetry={onRetry} />;
}

/* ---------------- 결과 요약 ---------------- */

/**
 * 결과 요약. 결과 응답에는 제품 id만 있어(표시 코드 추가는 Backend 계약 후보) 제품 목록으로 코드·이름을 찾아 보인다.
 * 목록에 없으면(보관·접근 불가 등) id 앞 8자를 그대로 보이고 코드를 만들어 내지 않는다.
 */
export function RunResultSection({ result, projectId }: { result: RunResult; projectId: string }) {
  const options = useProductOptions(projectId);
  const byProduct = options.status === "success" ? options.data.byId : new Map<string, { code: string; name: string }>();
  const productOf = new Map((result.products ?? []).map((p) => [p.process_version_id, p.product_id]));
  const pvLabel = (processVersionId: string) => {
    const pid = productOf.get(processVersionId);
    const prod = pid ? byProduct.get(pid) : undefined;
    return (
      <>
        {prod ? `${prod.code} ${prod.name}` : pid ? `제품 ${pid.slice(0, 8)}` : "제품 알 수 없음"} <code>{processVersionId.slice(0, 8)}</code>
      </>
    );
  };
  const productCols: Column<NonNullable<RunResult["products"]>[number]>[] = [
    { key: "pv", header: "제품 · 공정 버전", render: (p) => pvLabel(p.process_version_id) },
    { key: "items", header: "완제품 수", align: "end", render: (p) => p.completed_items },
    { key: "len", header: "완제품 길이(m)", align: "end", render: (p) => p.completed_length_m },
    { key: "first", header: "최초 완료", render: (p) => minutesText(p.first_completion) },
    { key: "last", header: "최종 완료", render: (p) => minutesText(p.last_completion) },
    { key: "disc", header: "폐기 길이(m)", align: "end", render: (p) => p.discarded_length_m },
  ];
  const stalled = result.state === "stalled";
  return (
    <Section id="sec-result" title="결과 요약">
      {stalled && (
        <StateNotice kind="conflict" title="입력이 부족해 더 진행할 수 없습니다">
          실행 실패가 아니라 관측 결과입니다. 아래 "부족한 입력"을 확인하세요.
        </StateNotice>
      )}
      {(result.assumptions ?? []).length > 0 && (
        <StateNotice kind="conflict" title="가정 위의 결과입니다">
          이 결과는 시나리오가 정한 가정(아래 "이 실행에 쓰인 가정") 위에서 얻은 값입니다.
          {(result.assumptions ?? []).some((a) => a.code === "UNBOUNDED_BUFFERS") && " 특히 용량을 모르는 대기 공간을 제한 없이 대기하는 것으로 가정했으므로 대기 공간 용량 때문에 생기는 지연·막힘은 반영되지 않았습니다."}
        </StateNotice>
      )}
      {result.censored && <Note>고정 지평선에서 끊긴 관측입니다. 지평선 이후의 일은 결과에 포함되지 않습니다.</Note>}
      <dl>
        <dt>종료 상태</dt>
        <dd>{result.state}</dd>
        {result.reason && (
          <>
            <dt>종료 사유</dt>
            <dd>{result.reason}</dd>
          </>
        )}
        <dt>종료 시각(가상)</dt>
        <dd>{minutesText(result.end_time)}</dd>
        {result.horizon && (
          <>
            <dt>지평선</dt>
            <dd>{minutesText(result.horizon)}</dd>
          </>
        )}
        <dt>이벤트 수</dt>
        <dd>{result.event_count ?? 0}</dd>
        <dt>남은 재공품(작업물 수)</dt>
        <dd>{result.wip_items ?? 0}</dd>
        <dt>엔진 버전</dt>
        <dd>{result.engine_version}</dd>
      </dl>
      {result.failure && (
        <StateNotice kind="error" title="실패 정보">
          {result.failure.reason}
          {result.failure.step_key ? ` (단계 ${result.failure.step_key})` : ""}
          {result.failure.message ? `: ${result.failure.message}` : ""}
        </StateNotice>
      )}
      {(result.products ?? []).length > 0 && (
        <>
          <h3>공정(제품)별 결과</h3>
          <Note>서로 다른 공정(제품)의 생산량은 합산하지 않고 공정 버전별로 보여 줍니다.</Note>
          <DataTable caption="공정 버전별 결과" columns={productCols} rows={result.products ?? []} getRowKey={(p) => p.process_version_id} />
        </>
      )}
      {(result.shortfalls ?? []).length > 0 && (
        <>
          <h3>부족한 입력</h3>
          <DataTable
            caption="부족한 입력"
            columns={[
              { key: "pv", header: "제품 · 공정 버전", render: (s) => pvLabel(s.process_version_id) },
              { key: "step", header: "단계", render: (s) => s.step ?? "" },
              { key: "pool", header: "풀", render: (s) => s.pool },
              { key: "needed", header: "필요", align: "end", render: (s) => s.needed },
              { key: "held", header: "보유", align: "end", render: (s) => s.held },
              { key: "waiting", header: "대기", align: "end", render: (s) => s.waiting },
            ]}
            rows={result.shortfalls ?? []}
            getRowKey={(s) => `${s.process_version_id}:${s.step ?? ""}:${s.pool}`}
          />
        </>
      )}
      {(result.residuals ?? []).length > 0 && (
        <>
          <h3>잔량</h3>
          <DataTable
            caption="잔량"
            columns={[
              { key: "pv", header: "제품 · 공정 버전", render: (r) => pvLabel(r.process_version_id) },
              { key: "pool", header: "풀", render: (r) => r.pool },
              { key: "len", header: "길이(m)", align: "end", render: (r) => r.length_m },
              { key: "disp", header: "처리", render: (r) => r.disposition },
            ]}
            rows={result.residuals ?? []}
            getRowKey={(r) => `${r.process_version_id}:${r.pool}:${r.disposition}`}
          />
        </>
      )}
      {(result.assumptions ?? []).length > 0 && (
        <>
          <h3>이 실행에 쓰인 가정</h3>
          <ul>
            {(result.assumptions ?? []).map((a, i) => (
              <li key={`${a.code}-${i}`}>
                <code>{a.code}</code> {a.node_key ? `(${a.node_key}) ` : ""}
                {a.message}
              </li>
            ))}
          </ul>
        </>
      )}
      {(result.compile_issues ?? []).length > 0 && (
        <>
          <h3>컴파일 문제</h3>
          <ul>
            {(result.compile_issues ?? []).map((c, i) => (
              <li key={`${c.rule_id}-${i}`}>
                <code>{c.rule_id}</code> {c.node_key ? `(${c.node_key}) ` : ""}
                {c.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

/* ---------------- 입력 스냅샷 ---------------- */

export function RunInputSection({ projectId, runId }: { projectId: string; runId: string }) {
  const [open, setOpen] = useState(false);
  const input = useRunInput(projectId, runId, open);
  return (
    <Section id="sec-input" title="실행 당시 입력">
      <Note>실행을 요청한 시점의 시나리오·공정 그래프·도착·가정·고정 자산 버전·시드를 해시로 고정한 스냅샷입니다. 이후 원본이 바뀌어도 그대로입니다.</Note>
      {!open && <Button onClick={() => setOpen(true)}>입력 스냅샷 보기</Button>}
      {open && input.status === "pending" && <StateNotice kind="loading" />}
      {open && input.status === "error" && <QueryErrorNotice error={input.error} subject="입력 스냅샷" onRetry={input.retry} />}
      {open && input.status === "success" && (
        <>
          <dl>
            <dt>SHA-256</dt>
            <dd>
              <code>{input.data.sha256}</code>
            </dd>
            <dt>저장본 해시 검증</dt>
            <dd>{input.data.hash_verified ? "✓ 일치" : "✕ 불일치(저장본이 변경되었을 수 있습니다)"}</dd>
            <dt>스키마 버전</dt>
            <dd>{input.data.schema_version}</dd>
          </dl>
          <pre tabIndex={0} aria-label="입력 스냅샷 JSON" style={{ maxHeight: "24rem", overflow: "auto" }}>
            {JSON.stringify(input.data.snapshot, null, 2)}
          </pre>
          <Button onClick={() => setOpen(false)}>접기</Button>
        </>
      )}
    </Section>
  );
}

/* ---------------- 지표 ---------------- */

const WINDOW_LABELS: Record<string, string> = { run: "실행 전체", day: "하루(1,440분)", week: "주(7일)", month: "월(30일)" };
const DIMENSION_LABELS: Record<string, string> = { process_version_id: "공정 버전", asset_key: "설비·공간", node_key: "노드" };
const QUALITY_NOTICE: Record<string, string> = {
  censored: "고정 지평선에서 끊긴 관측입니다. 지평선 이후는 포함되지 않습니다.",
  incomplete: "입력 부족·이벤트 한도 등으로 끝까지 실행되지 못한 불완전한 결과입니다. 지표를 완료된 결과처럼 해석하지 마세요.",
};

export function RunMetricsSection({ projectId, runId, enabled }: { projectId: string; runId: string; enabled: boolean }) {
  const [window, setWindow] = useState("run");
  const [metricKey, setMetricKey] = useState("");
  const defs = useMetricDefinitions(enabled);
  const metrics = useRunMetrics(projectId, runId, { window, metricKey }, enabled);
  const defMap = new Map(defs.status === "success" ? defs.data.map((d) => [d.metric_key, d]) : []);

  const cols: Column<Schemas["MetricOut"]>[] = [
    {
      key: "metric",
      header: "지표",
      render: (m) => {
        const d = defMap.get(m.metric_key);
        return (
          <>
            <code>{m.metric_key}</code>
            {d && <div>{d.description}</div>}
          </>
        );
      },
    },
    {
      key: "dim",
      header: "대상",
      render: (m) =>
        Object.entries(m.dimensions).map(([k, v]) => (
          <div key={k}>
            {DIMENSION_LABELS[k] ?? k}: <code>{k === "process_version_id" ? String(v).slice(0, 8) : String(v)}</code>
          </div>
        )),
    },
    { key: "window", header: "구간(가상 분)", render: (m) => `${m.window.start.min} ~ ${m.window.end.min}` },
    // null은 0이 아니라 "해당 없음/계산 불가"다(분모 0·해당 없는 양). 0과 구분해 표시한다.
    { key: "value", header: "값", align: "end", render: (m) => (m.value === null ? <span title="분모가 0이거나 해당 없는 양입니다(0이 아닙니다)">해당 없음</span> : m.value) },
    { key: "unit", header: "단위", render: (m) => m.unit },
  ];

  return (
    <Section id="sec-metrics" title="지표">
      <Note>
        지표는 이벤트로 계산한 값이며 24시간 연속 기준입니다. 공정(제품)이 다른 값은 합산하지 않습니다. 값이 "해당 없음"인 것은 0이 아니라 계산할 수 없는 값입니다.
      </Note>
      <FilterBar>
        <SelectField label="구간" value={window} onChange={(e) => setWindow(e.target.value)}>
          {Object.entries(WINDOW_LABELS).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </SelectField>
        <SelectField label="지표" value={metricKey} onChange={(e) => setMetricKey(e.target.value)}>
          <option value="">전체</option>
          {defs.status === "success" &&
            defs.data.map((d) => (
              <option key={d.metric_key} value={d.metric_key}>
                {d.metric_key} ({d.unit})
              </option>
            ))}
        </SelectField>
      </FilterBar>
      {!enabled && <StateNotice kind="empty" title="실행이 끝나면 지표를 볼 수 있습니다" />}
      {enabled && metrics.status === "pending" && <StateNotice kind="loading" />}
      {enabled && metrics.status === "error" && <ResultErrorNotice error={metrics.error} subject="지표" onRetry={metrics.retry} />}
      {enabled && metrics.status === "success" &&
        (metrics.data.items.length === 0 ? (
          <StateNotice kind="empty" title="조건에 맞는 지표가 없습니다">
            사용 기록이 없는 설비·공간은 행이 없습니다(0이 아니라 "기록 없음").
          </StateNotice>
        ) : (
          <>
            {QUALITY_NOTICE[metrics.data.items[0]!.quality_status] && <StateNotice kind="conflict" title="불완전한 관측">{QUALITY_NOTICE[metrics.data.items[0]!.quality_status]}</StateNotice>}
            <DataTable caption="실행 지표" columns={cols} rows={metrics.data.items} getRowKey={(m) => `${m.metric_key}|${JSON.stringify(m.dimensions)}|${m.window.kind}|${m.window.start.exact}`} wrapCells />
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
  );
}

/* ---------------- 이벤트 ---------------- */

export function RunEventsSection({ projectId, runId, enabled }: { projectId: string; runId: string; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [eventType, setEventType] = useState("");
  const [stepKey, setStepKey] = useState("");
  const events = useRunEvents(projectId, runId, { eventType: eventType.trim(), stepKey: stepKey.trim() }, enabled && open);
  const cols: Column<Schemas["EventOut"]>[] = [
    { key: "seq", header: "순번", align: "end", render: (e) => e.event_seq },
    { key: "time", header: "시각(가상 분)", render: (e) => e.sim_time.min },
    { key: "type", header: "종류", render: (e) => <code>{e.event_type}</code> },
    { key: "step", header: "단계", render: (e) => e.step_key ?? "" },
    { key: "asset", header: "설비·공간", render: (e) => e.asset_key ?? "" },
    { key: "item", header: "작업물", render: (e) => e.item_key ?? "" },
    { key: "reason", header: "사유", render: (e) => e.reason ?? "" },
  ];
  return (
    <Section id="sec-events" title="이벤트">
      <Note>공식 결과의 이벤트를 발생 순서로 보여 줍니다. 100건씩 이어서 불러옵니다. 이벤트 종류는 서버가 늘릴 수 있어 원문을 그대로 표시합니다.</Note>
      {!enabled && <StateNotice kind="empty" title="실행이 끝나면 이벤트를 볼 수 있습니다" />}
      {enabled && !open && <Button onClick={() => setOpen(true)}>이벤트 보기</Button>}
      {enabled && open && (
        <>
          <FilterBar>
            <TextField label="이벤트 종류" hint="정확히 일치(예: SINK_REACHED)" value={eventType} onChange={(e) => setEventType(e.target.value)} />
            <TextField label="단계 키" hint="정확히 일치" value={stepKey} onChange={(e) => setStepKey(e.target.value)} />
          </FilterBar>
          {events.status === "pending" && <StateNotice kind="loading" />}
          {events.status === "error" && <ResultErrorNotice error={events.error} subject="이벤트" onRetry={events.retry} />}
          {events.status === "success" &&
            (events.data.items.length === 0 ? (
              <StateNotice kind="no-results" />
            ) : (
              <>
                <DataTable caption="실행 이벤트" columns={cols} rows={events.data.items} getRowKey={(e) => String(e.event_seq)} />
                {events.data.hasMore && (
                  <p>
                    <Button onClick={events.data.fetchMore} disabled={events.data.fetchingMore}>
                      {events.data.fetchingMore ? "불러오는 중…" : "더 보기"}
                    </Button>
                  </p>
                )}
              </>
            ))}
        </>
      )}
    </Section>
  );
}
