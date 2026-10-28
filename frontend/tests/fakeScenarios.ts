import type { Schemas } from "../src/shared/api/types";
import type { FakeRequest, FakeResponse, FakeState } from "./fakeApi";
import type { Helpers } from "./fakeProcess";
import { processProductId, processVersionId } from "./fakeProcess";

/**
 * 시나리오·실행 가짜 서버(계약 0.7.0~0.11.0). 생성 타입으로 검증되며 서버 규칙의 핵심만 모델링한다:
 * 초안만 수정(승인본 409), If-Match 428/412, 시나리오당 초안 하나, 승인은 관리자·사전검증 오류 0일 때만,
 * 실행 요청은 Idempotency-Key 필수·승인 버전만·같은 키 같은 본문은 기존 run(200)·다른 본문은 409.
 * 진행 중 run은 조회할 때마다 queued → running → completed로 한 단계씩 진행한다(polling 검증용).
 */
export type ScenarioState = {
  scenarios: Schemas["ScenarioOut"][];
  versions: Schemas["ScenarioVersionOut"][];
  runs: Schemas["RunOut"][];
  /** (키, 본문 서명) → run id */
  idempotency: Record<string, { sig: string; runId: string }>;
  /** 이벤트 시험용 이벤트 수(완료된 run) */
  eventCount: number;
  /** true면 진행 중 run을 조회할 때마다 한 단계씩 진행한다(polling 시험). 취소 시험에서는 끈다. */
  autoAdvance: boolean;
};

const id = (n: number, p: string) => `${p.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const scenarioId = (i: number) => id(i, "c");
export const scenarioVersionId = (i: number) => id(i, "d");
export const runId = (i: number) => id(i, "f");
const NOW = "2026-10-27T01:00:00Z";
export const minutes = (m: string) => ({ min: m, exact: m });

const product = (productIdx: number, versionIdx: number): Schemas["ScenarioProductDto"] => ({
  product_id: processProductId(productIdx),
  process_version_id: processVersionId(versionIdx),
  priority: 1,
  arrivals: [{ at_min: "0", count: 1, length_m: "100", weight_kg: null, lot: null }],
  assumptions: { equipment_hold: null, unbounded_buffers: false, manual_transport_minutes: {}, residual_scope: {} },
});

function ver(n: number, scenario: number, no: number, status: "draft" | "approved", extra: Partial<Schemas["ScenarioVersionOut"]> = {}): Schemas["ScenarioVersionOut"] {
  return {
    id: scenarioVersionId(n),
    project_id: "",
    scenario_id: scenarioId(scenario),
    version_no: no,
    status,
    base_version_id: null,
    approved_at: status === "approved" ? NOW : null,
    approved_by: status === "approved" ? id(1, "u") : null,
    created_at: NOW,
    updated_at: null,
    row_version: 1,
    products: [],
    assets: [],
    stopping_rule: { mode: "drain" },
    assumption_reason: null,
    notes: null,
    ...extra,
  };
}

function completedRun(n: number, versionId: string): Schemas["RunOut"] {
  return {
    id: runId(n),
    project_id: "",
    scenario_version_id: versionId,
    status: "completed",
    input_hash: "a".repeat(64),
    seed: 0,
    replicate_index: 0,
    requested_by: id(1, "u"),
    requested_at: NOW,
    started_at: NOW,
    finished_at: "2026-10-27T01:00:05Z",
    cancel_requested_at: null,
    termination_reason: null,
    engine_version: "engine-test-1",
    attempts: [{ attempt_no: 1, state: "finished", worker_id: "w1", started_at: NOW, heartbeat_at: NOW, finished_at: "2026-10-27T01:00:05Z", termination_reason: null }],
    result: {
      state: "completed",
      reason: null,
      censored: false,
      end_time: minutes("90.000000"),
      horizon: null,
      event_count: 3,
      engine_version: "engine-test-1",
      seed: 0,
      wip_items: 0,
      products: [
        { product_id: processProductId(1), process_version_id: processVersionId(1), completed_items: 1, completed_length_m: "100", reached_sink: 1, first_completion: minutes("90.000000"), last_completion: minutes("90.000000"), discarded_length_m: "0" },
      ],
      assumptions: [],
      shortfalls: [],
      residuals: [],
      compile_issues: [],
      failure: null,
    },
  } as Schemas["RunOut"];
}

/* ---------------- 실행 분석 시드(병목·타임라인·비교) ---------------- */

const finding = (rank: number, kind: "space_full" | "equipment_busy" | "queue_pileup", level: "high" | "medium" | "low", amount: string, extra: Partial<Schemas["BottleneckOut"]> = {}): Schemas["BottleneckOut"] => ({
  rank,
  rank_in_kind: 1,
  kind,
  level,
  stalled_item_min: amount,
  share: "0.5",
  location: { process_version_id: processVersionId(1), product_id: processProductId(1), product_code: "P-001", product_name: "서버 제품 1", step_key: "op-1", step_label: "압출", node_key: null, node_label: null },
  explanation: `${kind} 설명 ${rank}`,
  evidence: { equipment_wait_avg_min: "12.5", assets: [{ asset_code: "EQ-001", utilization: "0.98" }], future_key: "열린 구조" },
  ...extra,
});

export function analysisBottlenecks(runId: string): Schemas["BottleneckSummaryOut"] {
  const busy = Array.from({ length: 5 }, (_, i) => finding(i === 0 ? 1 : i + 2, "equipment_busy", i === 0 ? "high" : "low", String(1000 - i * 100), { rank_in_kind: i + 1, explanation: `설비 대기 ${i + 1}` }));
  return {
    run_id: runId,
    quality_status: "complete",
    observed: minutes("90"),
    definition_version: "1",
    headline: "가장 큰 정체: P-001 압출 설비 대기",
    findings: [
      ...busy,
      finding(2, "queue_pileup", "medium", "800", {
        location: { process_version_id: null, product_id: null, product_code: null, product_name: null, step_key: null, step_label: null, node_key: "buf", node_label: "ST-041 서버 공간 41" },
        explanation: "대기 자재가 최대 5개 쌓였습니다",
        evidence: { peak_items: "5", transport_related: true, carriers: [] },
      }),
    ],
    limitations: ["공간 용량을 무제한으로 가정한 실행이라 공간 부족은 평가되지 않습니다.", "운반 자원 대수는 모델링하지 않습니다."],
    thresholds: { pileup_min_peak_items: "3", level_high_share: "0.30" },
  };
}

const bucket = (i: number, len: number, util: string | null): Schemas["AssetTimelineBucketOut"] => ({
  start: minutes(String(i * len)),
  end: minutes(String((i + 1) * len)),
  processing_min: util === null ? "0" : String(Number(util) * len),
  setup_min: "0",
  reserved_min: "0",
  blocked_min: "0",
  idle_min: util === null ? String(len) : String((1 - Number(util)) * len),
  utilization: util,
});

export function analysisTimeline(window: string): Schemas["AssetTimelineOut"][] {
  const n = window === "week" ? 2 : window === "run" ? 1 : 3;
  const len = window === "week" ? 10080 : window === "run" ? 90 : 1440;
  const used = Array.from({ length: 24 }, (_, i): Schemas["AssetTimelineOut"] => ({
    asset_id: `aaaaaaaa-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    asset_code: `EQ-${String(i + 1).padStart(3, "0")}`,
    asset_name: `서버 설비 ${i + 1}`,
    used: true,
    uses: [{ process_version_id: processVersionId(1), product_code: "P-001", step_key: "op-1", step_label: "압출" }],
    buckets: Array.from({ length: n }, (_, k) => bucket(k, len, k === 0 ? "1" : "0.25")),
  }));
  const unused: Schemas["AssetTimelineOut"] = {
    asset_id: "aaaaaaaa-0000-4000-8000-000000000099",
    asset_code: "EQ-099",
    asset_name: "쓰이지 않은 설비",
    used: false,
    uses: [{ process_version_id: processVersionId(1), product_code: "P-001", step_key: "op-1", step_label: "압출" }],
    buckets: Array.from({ length: n }, (_, k) => bucket(k, len, null)),
  };
  return [...used.slice(0, 2), unused, ...used.slice(2)];
}

export function analysisStates(): Schemas["AssetStateSegmentOut"][] {
  return [
    { state: "SETUP", start: minutes("0"), end: minutes("10"), duration_min: "10", operation_id: "op-1#1", step_key: "op-1", process_version_id: processVersionId(1), product_code: "P-001" },
    { state: "PROCESSING", start: minutes("10"), end: minutes("60"), duration_min: "50", operation_id: "op-1#1", step_key: "op-1", process_version_id: processVersionId(1), product_code: "P-001" },
    { state: "BLOCKED", start: minutes("60"), end: minutes("70"), duration_min: "10", operation_id: "op-1#1", step_key: "op-1", process_version_id: processVersionId(1), product_code: "P-001" },
    { state: "FUTURE_STATE", start: minutes("70"), end: minutes("80"), duration_min: "10", operation_id: null, step_key: null, process_version_id: null, product_code: null },
  ];
}

export function analysisComparison(a: Schemas["RunOut"], b: Schemas["RunOut"]): Schemas["RunComparisonOut"] {
  const sameSeed = a.seed === b.seed;
  return {
    base_run_id: a.id,
    other_run_id: b.id,
    comparable: a.engine_version === b.engine_version,
    warnings: a.engine_version === b.engine_version ? [] : ["엔진 버전이 다릅니다."],
    base_status: a.status,
    other_status: b.status,
    base_end_time: minutes("90"),
    other_end_time: minutes("120"),
    input_changes: sameSeed ? [] : [{ path: "seed", base: a.seed, other: b.seed, note: "난수 시드" }, { path: "products/P-001/arrivals", base: [{ count: 1 }], other: [{ count: 2 }], note: null }],
    products: [
      {
        product_id: processProductId(1),
        product_code: "P-001",
        product_name: "서버 제품 1",
        base_process_version_id: processVersionId(1),
        other_process_version_id: processVersionId(1),
        base_last_completion: minutes("90"),
        other_last_completion: minutes("120"),
        metrics: [
          { metric_key: "completed_items", base: "1", other: "2", delta: "1", ratio: "2", unit: "items" },
          { metric_key: "lead_time_avg_min", base: "0", other: "30", delta: "30", ratio: null, unit: "min" },
        ],
      },
    ],
    bottlenecks: { base: analysisBottlenecks(a.id).findings.slice(0, 2), other: [] },
  };
}

export function analysisMetricDiff(a: Schemas["RunOut"], b: Schemas["RunOut"]): Schemas["MetricComparisonOut"][] {
  const w = { kind: "run" as const, start: minutes("0"), end: minutes("120") };
  void a;
  void b;
  return [
    { metric_key: "completed_items", dimensions: { product_id: processProductId(1), product_code: "P-001" }, window: w, base: "1", other: "2", delta: "1", ratio: "2", unit: "items", base_process_version_id: processVersionId(1), other_process_version_id: processVersionId(1) },
    { metric_key: "utilization", dimensions: { asset_key: "EQ-001" }, window: w, base: "0.5", other: "0.5", delta: "0", ratio: "1", unit: "ratio", base_process_version_id: null, other_process_version_id: null },
    { metric_key: "lead_time_avg_min", dimensions: { product_id: processProductId(1), product_code: "P-001" }, window: w, base: null, other: "30", delta: null, ratio: null, unit: "min", base_process_version_id: processVersionId(1), other_process_version_id: processVersionId(1) },
  ];
}

export function seedScenarios(): ScenarioState {
  const versions = [
    // SC-A: 승인 v1 하나(열린 초안 없음 → 새 초안을 만들 수 있다)
    ver(1, 1, 1, "approved", { row_version: 2, products: [product(1, 1)] }),
    // SC-B: 빈 초안 v1
    ver(2, 2, 1, "draft"),
  ];
  const sc = (n: number, code: string, name: string, latest: Schemas["ScenarioVersionOut"]): Schemas["ScenarioOut"] => ({
    id: scenarioId(n),
    project_id: "",
    code,
    name,
    description: n === 1 ? "첫 시나리오" : null,
    latest_version: { id: latest.id, version_no: latest.version_no, status: latest.status },
    created_at: NOW,
    updated_at: null,
    row_version: 1,
  });
  return {
    scenarios: [sc(1, "SC-A", "시나리오 A", versions[0]!), sc(2, "SC-B", "시나리오 B", versions[1]!)],
    versions,
    runs: [completedRun(1, scenarioVersionId(1))],
    idempotency: {},
    eventCount: 150,
    autoAdvance: true,
  };
}

const METRIC_DEFINITIONS: Schemas["MetricDefinitionOut"][] = [
  { metric_key: "completed_items", unit: "items", dimension: "process_version_id", description: "완제품 milestone에 도달한 작업물 수", definition_version: "1" },
  { metric_key: "lead_time_avg_min", unit: "min", dimension: "process_version_id", description: "평균 리드타임", definition_version: "1" },
  { metric_key: "utilization", unit: "ratio", dimension: "asset_key", description: "설비 가동률(24시간 기준)", definition_version: "1" },
];

function precheck(state: FakeState, v: Schemas["ScenarioVersionOut"]): Schemas["PrecheckOut"] {
  const issues: Schemas["PrecheckIssue"][] = [];
  if (v.products.length === 0) issues.push({ severity: "error", rule_id: "SCN-PROD-001", message: "제품이 없습니다.", field_path: "/products" });
  v.products.forEach((p, i) => {
    if ((p.arrivals ?? []).length === 0) issues.push({ severity: "error", rule_id: "SCN-ARR-001", message: "도착이 없습니다.", field_path: `/products/${i}/arrivals` });
    const a = (p.assumptions ?? { unbounded_buffers: false }) as Schemas["AssumptionsDto"];
    const used = a.equipment_hold || a.unbounded_buffers || Object.keys(a.manual_transport_minutes ?? {}).length > 0 || Object.keys(a.residual_scope ?? {}).length > 0;
    if (used && !v.assumption_reason) issues.push({ severity: "error", rule_id: "SCN-ASM-001", message: "가정을 썼는데 사유가 없습니다.", field_path: "/assumption_reason" });
  });
  const errors = issues.filter((i) => i.severity === "error").length;
  void state;
  return {
    scenario_version_id: v.id,
    runnable: errors === 0,
    error_count: errors,
    warning_count: issues.length - errors,
    issues,
    products: v.products.map((p) => ({ product_id: p.product_id, process_version_id: p.process_version_id, compiled: true, compile_issues: [], assumptions_used: [], waived: [] })),
    engine_version: "engine-test-1",
  };
}

export function scenarioRoute(req: FakeRequest, state: FakeState, h: Helpers): FakeResponse | null {
  const { method, path } = req;
  const S = state.scenarios;
  const P = h.project;
  const fix = <T extends { project_id: string }>(x: T): T => ({ ...x, project_id: P });
  const latest = (scenario: string) => S.versions.filter((v) => v.scenario_id === scenario).sort((a, b) => b.version_no - a.version_no)[0];
  const refresh = (scenario: string) => {
    const sc = S.scenarios.find((x) => x.id === scenario);
    const l = latest(scenario);
    if (sc && l) sc.latest_version = { id: l.id, version_no: l.version_no, status: l.status };
  };
  const listItem = (v: Schemas["ScenarioVersionOut"]) => {
    // 목록 항목은 내용(products 등)을 뺀 요약이다
    return fix({
      id: v.id, project_id: v.project_id, scenario_id: v.scenario_id, version_no: v.version_no, status: v.status, base_version_id: v.base_version_id,
      approved_at: v.approved_at, created_at: v.created_at, updated_at: v.updated_at, row_version: v.row_version,
    });
  };
  const viewer = state.role === "viewer";

  if (method === "GET" && path === "/metric-definitions") return { status: 200, body: { data: METRIC_DEFINITIONS, page: { limit: 200, next_cursor: null } } };

  // ---- 시나리오 ----
  if (path === `/projects/${P}/scenarios`) {
    if (method === "GET") return { status: 200, body: { data: S.scenarios.map(fix), page: { limit: 50, next_cursor: null } } };
    if (method === "POST") {
      if (viewer) return h.forbidden();
      const b = req.body ?? {};
      if (S.scenarios.some((x) => x.code === b.code))
        return h.errorBody(409, "SCENARIO_CODE_CONFLICT", "같은 프로젝트에 동일한 시나리오 코드가 있습니다.", [{ message: "이미 사용 중인 코드입니다.", field_path: "/code" }]);
      const n = S.scenarios.length + 1;
      const v = ver(100 + n, n, 1, "draft");
      S.versions.push(v);
      const sc: Schemas["ScenarioOut"] = { id: scenarioId(n), project_id: P, code: b.code, name: b.name, description: b.description ?? null, latest_version: { id: v.id, version_no: 1, status: "draft" }, created_at: NOW, updated_at: null, row_version: 1 };
      S.scenarios.push(sc);
      return { status: 201, headers: h.etag(1), body: { data: sc } };
    }
  }
  const one = new RegExp(`^/projects/${P}/scenarios/([^/]+)$`).exec(path);
  if (one) {
    const sc = S.scenarios.find((x) => x.id === one[1]);
    return sc && method === "GET" ? { status: 200, headers: h.etag(sc.row_version), body: { data: fix(sc) } } : h.notFound();
  }
  const vers = new RegExp(`^/projects/${P}/scenarios/([^/]+)/versions$`).exec(path);
  if (vers) {
    const sc = S.scenarios.find((x) => x.id === vers[1]);
    if (!sc) return h.notFound();
    if (method === "GET")
      return { status: 200, body: { data: S.versions.filter((v) => v.scenario_id === sc.id).sort((a, b) => b.version_no - a.version_no).map(listItem), page: { limit: 200, next_cursor: null } } };
    if (method === "POST") {
      if (viewer) return h.forbidden();
      if (S.versions.some((v) => v.scenario_id === sc.id && v.status === "draft")) return h.errorBody(409, "SCENARIO_DRAFT_EXISTS", "이미 열린 초안이 있습니다.", [{ message: "시나리오당 초안은 하나입니다." }]);
      const mine = S.versions.filter((v) => v.scenario_id === sc.id);
      const from = (req.body?.from_version_id ? mine.find((v) => v.id === req.body.from_version_id) : mine.filter((v) => v.status === "approved").sort((a, b) => b.version_no - a.version_no)[0]) ?? null;
      const no = Math.max(0, ...mine.map((v) => v.version_no)) + 1;
      const nv = ver(200 + S.versions.length, Number(sc.id.slice(-12)), no, "draft", { base_version_id: from?.id ?? null, products: from ? structuredClone(from.products) : [], stopping_rule: from ? structuredClone(from.stopping_rule) : { mode: "drain" } });
      S.versions.push(nv);
      refresh(sc.id);
      return { status: 201, headers: h.etag(1), body: { data: fix(nv) } };
    }
  }

  // ---- 시나리오 버전 ----
  // 0.14.0 최신 공정으로 갱신: 초안의 제품별 공정 버전을 현재 승인본으로(도착·가정은 그대로)
  const rf = new RegExp(`^/projects/${P}/scenario-versions/([^/]+)/refresh$`).exec(path);
  if (rf && method === "POST") {
    const v = S.versions.find((x) => x.id === rf[1]);
    if (!v) return h.notFound();
    if (viewer) return h.forbidden();
    const im = req.headers["If-Match"];
    if (im === undefined) return h.missingIfMatch();
    if (v.status === "approved") return h.errorBody(409, "VERSION_IMMUTABLE", "승인된 버전은 갱신할 수 없습니다.", [{ message: "승인본입니다." }]);
    if (im !== `"${v.row_version}"`) return h.staleVersion(v.row_version);
    const process_changes = v.products.map((p) => {
      const approved = state.processes.versions.find((x) => x.product_id === p.product_id && x.status === "approved");
      const from = state.processes.versions.find((x) => x.id === p.process_version_id);
      if (!approved) return { product_id: p.product_id, product_code: null, from_process_version_id: p.process_version_id, from_version_no: from?.version_no ?? null, to_process_version_id: p.process_version_id, to_version_no: from?.version_no ?? null, status: "no_approved_version" as const };
      const changed = approved.id !== p.process_version_id;
      const out = { product_id: p.product_id, product_code: null, from_process_version_id: p.process_version_id, from_version_no: from?.version_no ?? null, to_process_version_id: approved.id, to_version_no: approved.version_no, status: changed ? ("changed" as const) : ("unchanged" as const) };
      p.process_version_id = approved.id;
      return out;
    });
    const asset_changes = (req.body?.assets ?? "latest") === "latest" ? [{ asset_id: "aaaaaaaa-0000-4000-8000-000000000041", asset_code: "ST-041", change: "updated" as const, from_revision_id: null, to_revision_id: "rrrrrrrr-0000-4000-8000-000000000001" }] : [];
    v.row_version += 1;
    return { status: 200, headers: h.etag(v.row_version), body: { data: { version: fix(v), process_changes, asset_changes } } };
  }

  const vm = new RegExp(`^/projects/${P}/scenario-versions/([^/]+)(?:/(validate|approve))?$`).exec(path);
  if (vm) {
    const v = S.versions.find((x) => x.id === vm[1]);
    if (!v) return h.notFound();
    const action = vm[2];
    if (!action && method === "GET") return { status: 200, headers: h.etag(v.row_version), body: { data: fix(v) } };
    if (!action && method === "PATCH") {
      if (viewer) return h.forbidden();
      const im = req.headers["If-Match"];
      if (im === undefined) return h.missingIfMatch();
      if (v.status === "approved") return h.errorBody(409, "VERSION_IMMUTABLE", "승인된 버전은 수정할 수 없습니다.", [{ message: "승인본입니다." }]);
      if (im !== `"${v.row_version}"`) return h.staleVersion(v.row_version);
      const b = req.body ?? {};
      if (b.products) {
        const seen = new Set<string>();
        for (const [i, p] of (b.products as Schemas["ScenarioProductDto"][]).entries()) {
          if (seen.has(p.process_version_id)) return h.invalid(`/products/${i}/process_version_id`, "같은 공정 버전을 두 번 넣을 수 없습니다.");
          seen.add(p.process_version_id);
          const pv = state.processes.versions.find((x) => x.id === p.process_version_id);
          if (!pv || pv.product_id !== p.product_id) return h.invalid(`/products/${i}/process_version_id`, "SCN-REF-001: 그 제품의 공정 버전이 아닙니다.");
          if (pv.status !== "approved" && pv.status !== "superseded") return h.invalid(`/products/${i}/process_version_id`, "SCN-REF-002: 승인되지 않은 공정 버전입니다.");
          for (const [j, a] of (p.arrivals ?? []).entries()) if (a.length_m == null && a.weight_kg == null) return h.invalid(`/products/${i}/arrivals/${j}`, "도착에는 길이 또는 무게가 있어야 합니다.");
        }
      }
      for (const key of ["products", "stopping_rule", "assumption_reason", "notes", "assets"] as const) if (key in b) Object.assign(v, { [key]: structuredClone(b[key]) });
      v.row_version += 1;
      v.updated_at = NOW;
      return { status: 200, headers: h.etag(v.row_version), body: { data: fix(v) } };
    }
    if (action === "validate" && method === "POST") return { status: 200, body: { data: precheck(state, v) } };
    if (action === "approve" && method === "POST") {
      if (state.role !== "admin") return h.forbidden();
      const im = req.headers["If-Match"];
      if (im === undefined) return h.missingIfMatch();
      if (v.status === "approved") return h.errorBody(409, "VERSION_IMMUTABLE", "이미 승인된 버전입니다.", [{ message: "승인본입니다." }]);
      if (im !== `"${v.row_version}"`) return h.staleVersion(v.row_version);
      const pre = precheck(state, v);
      if (!pre.runnable)
        return h.errorBody(422, "SCENARIO_NOT_RUNNABLE", "실행할 수 없는 시나리오는 승인할 수 없습니다.", pre.issues.filter((i) => i.severity === "error").map((i) => ({ severity: "error", rule_id: i.rule_id, message: i.message, field_path: i.field_path })));
      v.status = "approved";
      v.approved_at = NOW;
      v.approved_by = id(1, "u");
      v.row_version += 1;
      refresh(v.scenario_id);
      return { status: 200, headers: h.etag(v.row_version), body: { data: fix(v) } };
    }
  }

  // ---- 실행 ----
  const advance = (r: Schemas["RunOut"]) => {
    if (!S.autoAdvance) return;
    // 조회할 때마다 한 단계씩 진행한다: queued → running → completed
    if (r.status === "queued") {
      r.status = "running";
      r.started_at = NOW;
      r.attempts = [{ attempt_no: 1, state: "running", worker_id: "w1", started_at: NOW, heartbeat_at: NOW, finished_at: null, termination_reason: null }];
    } else if (r.status === "running" && !r.cancel_requested_at) {
      const done = completedRun(0, r.scenario_version_id);
      Object.assign(r, { status: "completed", finished_at: NOW, result: done.result, attempts: done.attempts });
    } else if (r.status === "running" && r.cancel_requested_at) {
      Object.assign(r, { status: "cancelled", finished_at: NOW, termination_reason: "CANCELLED", result: null });
    }
  };
  const runItem = (r: Schemas["RunOut"]): Schemas["RunListItem"] => ({
    id: r.id, project_id: P, scenario_version_id: r.scenario_version_id, status: r.status, input_hash: r.input_hash, seed: r.seed, replicate_index: r.replicate_index,
    requested_at: r.requested_at, started_at: r.started_at, finished_at: r.finished_at,
  });
  if (path === `/projects/${P}/runs`) {
    if (method === "GET") {
      const status = req.query.get("status");
      const ver = req.query.get("scenario_version_id");
      const items = [...S.runs].reverse().filter((r) => (!status || r.status === status) && (!ver || r.scenario_version_id === ver));
      return { status: 200, body: { data: items.map(runItem), page: { limit: 50, next_cursor: null } } };
    }
    if (method === "POST") {
      if (viewer) return h.forbidden();
      const key = req.headers["Idempotency-Key"];
      if (!key) return h.errorBody(428, "PRECONDITION_REQUIRED", "Idempotency-Key 헤더가 필요합니다.", [{ message: "Idempotency-Key 헤더가 필요합니다." }]);
      const b = req.body ?? {};
      const v = S.versions.find((x) => x.id === b.scenario_version_id);
      if (!v) return h.notFound();
      const sig = JSON.stringify([b.scenario_version_id, b.seed ?? 0, b.replicate_index ?? 0]);
      const prev = S.idempotency[key];
      if (prev) {
        if (prev.sig !== sig) return h.errorBody(409, "IDEMPOTENCY_CONFLICT", "같은 요청 키로 다른 본문을 보냈습니다.", [{ message: "다른 본문입니다." }]);
        return { status: 200, body: { data: fix(S.runs.find((r) => r.id === prev.runId)!) } };
      }
      if (v.status !== "approved") return h.errorBody(422, "RUN_NOT_RUNNABLE", "승인되지 않은 시나리오 버전은 실행할 수 없습니다.", [{ severity: "error", rule_id: "RUN-SCN-001", message: "승인되지 않은 시나리오 버전입니다." }]);
      const run: Schemas["RunOut"] = {
        ...completedRun(S.runs.length + 1, v.id),
        status: "queued", seed: b.seed ?? 0, replicate_index: b.replicate_index ?? 0, started_at: null, finished_at: null, attempts: [], result: null,
        requested_at: NOW,
      } as Schemas["RunOut"];
      S.runs.push(run);
      S.idempotency[key] = { sig, runId: run.id };
      return { status: 202, body: { data: fix(run) } };
    }
  }
  // ---- 실행 분석(0.12.0 병목, 0.13.0 설비 타임라인·두 실행 비교) ----
  const an = new RegExp(`^/projects/${P}/runs/([^/]+)/(bottlenecks|asset-timeline|assets/([^/]+)/states|compare/([^/]+)(/metrics)?)$`).exec(path);
  if (an && method === "GET") {
    const r = S.runs.find((x) => x.id === an[1]);
    if (!r) return h.notFound();
    const noResult = () => h.errorBody(409, "RUN_RESULT_NOT_AVAILABLE", "공식 결과가 없습니다.", [{ message: "선택된 시도가 없습니다." }]);
    if (an[2] === "bottlenecks") {
      if (r.status !== "completed") return noResult();
      return { status: 200, body: { data: analysisBottlenecks(r.id) } };
    }
    if (an[2] === "asset-timeline") {
      if (r.status !== "completed") return noResult();
      const win = req.query.get("window") ?? "day";
      const limit = Number(req.query.get("limit") ?? 50);
      const start = Number(req.query.get("cursor") ?? 0);
      const all = analysisTimeline(win);
      const page = all.slice(start, start + limit);
      return { status: 200, body: { data: page, page: { limit, next_cursor: start + limit < all.length ? String(start + limit) : null } } };
    }
    if (an[3]) {
      if (r.status !== "completed") return noResult();
      const segs = an[3] === "aaaaaaaa-0000-4000-8000-000000000001" ? analysisStates() : [];
      return { status: 200, body: { data: segs, page: { limit: 200, next_cursor: null } } };
    }
    if (an[4]) {
      const o = S.runs.find((x) => x.id === an[4]);
      if (!o) return h.notFound();
      if (o.id === r.id) return h.invalid("/other_run_id", "같은 실행끼리는 비교할 수 없습니다.");
      if (r.status !== "completed" || o.status !== "completed") return noResult();
      if (an[5]) {
        const changedOnly = req.query.get("changed_only") === "true";
        const rows = analysisMetricDiff(r, o).filter((m) => !changedOnly || m.base !== m.other);
        return { status: 200, body: { data: rows, page: { limit: 200, next_cursor: null } } };
      }
      return { status: 200, body: { data: analysisComparison(r, o) } };
    }
  }

  const rm = new RegExp(`^/projects/${P}/runs/([^/]+)(?:/(input|cancel|events|metrics))?$`).exec(path);
  if (rm) {
    const r = S.runs.find((x) => x.id === rm[1]);
    if (!r) return h.notFound();
    const sub = rm[2];
    if (!sub && method === "GET") {
      const before = { ...r };
      advance(r);
      void before;
      return { status: 200, body: { data: fix(r) } };
    }
    if (sub === "input" && method === "GET") return { status: 200, body: { data: { run_id: r.id, schema_version: "1", sha256: r.input_hash, hash_verified: true, snapshot: { scenario_version_id: r.scenario_version_id, seed: r.seed } } } };
    if (sub === "cancel" && method === "POST") {
      if (viewer) return h.forbidden();
      if (r.status === "queued") Object.assign(r, { status: "cancelled", termination_reason: "CANCELLED_BEFORE_START", finished_at: NOW });
      else if (r.status === "running") r.cancel_requested_at = NOW;
      else return h.errorBody(409, "JOB_CANCEL_TOO_LATE", "이미 끝난 실행은 취소할 수 없습니다.", [{ message: "종료된 실행입니다." }]);
      return { status: 202, body: { data: fix(r) } };
    }
    if ((sub === "events" || sub === "metrics") && method === "GET") {
      if (r.status !== "completed") return h.errorBody(409, "RUN_RESULT_NOT_AVAILABLE", "공식 결과가 없습니다.", [{ message: "선택된 시도가 없습니다." }]);
      if (sub === "metrics") {
        const win = req.query.get("window") ?? "run";
        const key = req.query.get("metric_key");
        const rows: Schemas["MetricOut"][] = [
          { metric_key: "completed_items", dimensions: { process_version_id: processVersionId(1) }, window: { kind: win as "run", start: minutes("0"), end: minutes("90.000000") }, value: "1", unit: "items", definition_version: "1", quality_status: "complete" },
          // 분모 0 → null (0과 다르다)
          { metric_key: "lead_time_avg_min", dimensions: { process_version_id: processVersionId(1) }, window: { kind: win as "run", start: minutes("0"), end: minutes("90.000000") }, value: null, unit: "min", definition_version: "1", quality_status: "complete" },
          { metric_key: "utilization", dimensions: { asset_key: "EQ-001" }, window: { kind: win as "run", start: minutes("0"), end: minutes("90.000000") }, value: "0.5", unit: "ratio", definition_version: "1", quality_status: "complete" },
        ].filter((m) => !key || m.metric_key === key) as unknown as Schemas["MetricOut"][];
        return { status: 200, body: { data: rows, page: { limit: 200, next_cursor: null } } };
      }
      const limit = Number(req.query.get("limit") ?? 100);
      const start = Number(req.query.get("cursor") ?? 0);
      const type = req.query.get("event_type");
      const all = Array.from({ length: S.eventCount }, (_, i): Schemas["EventOut"] => ({
        event_seq: i + 1,
        sim_time: minutes(String(i)),
        event_type: i % 3 === 0 ? "ARRIVAL" : i % 3 === 1 ? "SINK_REACHED" : "FUTURE_EVENT_KIND",
        step_key: null, operation_id: null, asset_key: null, item_key: `item-${i}`, process_version_id: null, source: null, destination: null, reason: null, quantities: {},
      })).filter((e) => !type || e.event_type === type);
      const page = all.slice(start, start + limit);
      return { status: 200, body: { data: page, page: { limit, next_cursor: start + limit < all.length ? String(start + limit) : null } } };
    }
  }
  return null;
}
