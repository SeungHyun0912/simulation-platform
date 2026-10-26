/* eslint-disable @typescript-eslint/no-explicit-any -- 가짜 서버가 임의 요청 본문을 검사한다 */
import type { Schemas } from "../src/shared/api/types";
import type { FakeRequest, FakeResponse, FakeState } from "./fakeApi";

/**
 * 공정 버전·그래프 가짜 서버(계약 0.4.0 `process-versions`의 규칙 일부를 흉내 낸다). 실제 서버가 아니다.
 * 응답은 생성된 계약 타입으로 선언해 계약과 어긋나면 컴파일에서 걸린다.
 * 흉내 내는 규칙: 수정은 draft만(409 VERSION_IMMUTABLE), 모든 수정·전이에 If-Match(428/412), 그래프 PUT은 전체 교체이며
 * 오류가 하나라도 있으면 아무것도 저장하지 않음(422, field_path는 요청 본문 기준), 열린 버전은 제품당 하나(409 PROCESS_DRAFT_EXISTS),
 * 승인·반려는 admin만, 새 초안은 승인본이 있으면 그래프를 새 id로 복사.
 */
type Version = Schemas["ProcessVersionOut"];
type Graph = { nodes: Schemas["GraphNode"][]; edges: Schemas["GraphEdge"][] };
export type ProcessState = { versions: Version[]; graphs: Record<string, Graph> };

export type Helpers = {
  errorBody: (status: number, code: string, message: string, details?: unknown[]) => FakeResponse;
  etag: (v: number) => Record<string, string>;
  notFound: () => FakeResponse;
  forbidden: () => FakeResponse;
  missingIfMatch: () => FakeResponse;
  staleVersion: (current: number) => FakeResponse;
  invalid: (path: string, message: string) => FakeResponse;
  project: string;
};

const id = (n: number, prefix: string) => `${prefix.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const processProductId = (i: number) => id(i, "p");
export const processVersionId = (i: number) => id(i, "v");
const assetId = (i: number) => id(i, "a");
const nodeId = (i: number) => id(i, "n");

const UNKNOWN_DECIMAL = { mode: "unknown", value: null } as const;

/** 단계 기본값(미정)을 채운 완전한 단계. 서버 응답처럼 측정값에 value: null을 둔다. */
function fullStep(s: any = {}): Schemas["StepDto"] {
  const measure = (m: any) => (m ? { mode: m.mode, value: m.value ?? null } : { ...UNKNOWN_DECIMAL });
  const t = s.timing_rule ?? {};
  const o = s.output_rule ?? {};
  const p = t.processing ?? { kind: "unknown" };
  const processing: any = { ...p };
  for (const k of ["speed_m_per_min", "parallel_streams", "duration_min", "reference_length_m"]) if (k in processing) processing[k] = measure(processing[k]);
  return {
    operation_type: s.operation_type ?? null,
    handler_version: s.handler_version ?? null,
    timing_rule: {
      processing,
      setup: { duration_min: measure(t.setup?.duration_min), trigger: t.setup?.trigger ?? "unknown" },
      precondition_delay: {
        duration_min: measure(t.precondition_delay?.duration_min),
        trigger: t.precondition_delay?.trigger ?? "unknown",
        occupancy: t.precondition_delay?.occupancy ?? "unknown",
      },
    },
    input_rule: { acquire_scope: s.input_rule?.acquire_scope ?? "unknown", consume_policy: s.input_rule?.consume_policy ?? "unknown" },
    output_rule: {
      mode: o.mode ?? "unknown",
      unit_form: o.unit_form ?? null,
      length_m: measure(o.length_m),
      weight_kg: measure(o.weight_kg),
      unit_count: measure(o.unit_count),
      quantity_basis: o.quantity_basis ?? "unknown",
      schedule: o.schedule ?? "unknown",
      accounting_mode: o.accounting_mode ?? "unknown",
    } as any,
    handoff_rule: { mode: s.handoff_rule?.mode ?? "unknown" },
    residual_rule: {
      mode: s.residual_rule?.mode ?? "unknown",
      on_product_change: s.residual_rule?.on_product_change ?? "unknown",
      on_run_end: s.residual_rule?.on_run_end ?? "unknown",
      scope: s.residual_rule?.scope ?? "unknown",
      physical_join_mode: s.residual_rule?.physical_join_mode ?? "unknown",
    },
    resources: (s.resources ?? []).map((r: any) => ({
      role_key: r.role_key,
      resource_kind: r.resource_kind ?? "equipment",
      selection_mode: r.selection_mode ?? "one_of",
      required_count: r.required_count ?? 1,
      capacity_mode: r.capacity_mode ?? "finite",
      allocation_rule: { mode: r.allocation_rule?.mode ?? "unknown" },
      candidates: (r.candidates ?? []).map((c: any) => ({ asset_id: c.asset_id, eligibility_status: c.eligibility_status ?? "unknown" })),
    })),
  };
}

const edge = (n: number, from: number, to: number): Schemas["GraphEdge"] => ({
  id: id(n, "e"),
  edge_key: `e${n}`,
  from_node_id: nodeId(from),
  to_node_id: nodeId(to),
  edge_kind: "material",
  movement_rule: { mode: "unknown", duration_min: { ...UNKNOWN_DECIMAL } },
});

const node = (n: number, kind: Schemas["GraphNode"]["kind"], key: string, label: string, order: number, extra: Partial<Schemas["GraphNode"]> = {}): Schemas["GraphNode"] => ({
  id: nodeId(n),
  node_key: key,
  kind,
  label,
  asset_id: null,
  display_order: order,
  step: null,
  ...extra,
});

const extrude = (n: number, label: string, equipment: number): Schemas["GraphNode"] =>
  node(n, "operation", `op${n}`, label, n, {
    step: fullStep({
      operation_type: "output_units_by_time",
      handler_version: "1",
      timing_rule: { processing: { kind: "output_speed", speed_m_per_min: { mode: "known", value: "20" }, basis: "per_stream", output_schedule: "sequential_units", parallel_streams: { mode: "known", value: 1 } } },
      resources: [{ role_key: "main", candidates: [{ asset_id: assetId(equipment), eligibility_status: "confirmed" }] }],
    }),
  });

const baseVersion = (n: number, productNo: number, no: number, status: Version["status"], extra: Partial<Version> = {}): Version => ({
  id: processVersionId(n),
  project_id: "11111111-1111-4111-8111-111111111111",
  product_id: processProductId(productNo),
  version_no: no,
  status,
  base_version_id: null,
  schema_version: "1.0",
  raw_unit_spec: { length_m: { ...UNKNOWN_DECIMAL }, weight_kg: { ...UNKNOWN_DECIMAL }, unit_count: { mode: "unknown", value: null }, strand_count: { mode: "unknown", value: null } },
  finished_unit_spec: { length_m: { ...UNKNOWN_DECIMAL }, weight_kg: { ...UNKNOWN_DECIMAL }, unit_count: { mode: "unknown", value: null }, strand_count: { mode: "unknown", value: null } },
  notes: null,
  issues: [],
  submitted_at: null,
  submitted_by: null,
  rejected_at: null,
  rejection_reason: null,
  approved_at: status === "approved" ? "2026-10-20T00:00:00Z" : null,
  approved_by: null,
  created_at: "2026-10-20T00:00:00Z",
  updated_at: null,
  row_version: 1,
  ...extra,
});

/** 제품 P-001: v1 승인본 + v2 초안(v1 복사). P-003: 빈 초안. P-004: 직선이 아닌(분기·합류) 초안. 그 밖의 제품은 버전이 없다. */
export function seedProcesses(): ProcessState {
  const linear = (offset: number): Graph => ({
    nodes: [
      node(offset + 1, "source", "src", "원자재", 0),
      { ...extrude(offset + 2, "압출", 1), display_order: 1 },
      node(offset + 3, "buffer", "buf", "ST-041 서버 공간 41", 2, { asset_id: assetId(41) }),
      { ...extrude(offset + 4, "편조", 2), display_order: 3 },
      node(offset + 5, "sink", "sink", "완제품", 4),
    ],
    edges: [edge(offset + 1, offset + 1, offset + 2), edge(offset + 2, offset + 2, offset + 3), edge(offset + 3, offset + 3, offset + 4), edge(offset + 4, offset + 4, offset + 5)],
  });
  const branching: Graph = {
    nodes: [
      node(301, "source", "src", "원자재", 0),
      { ...extrude(302, "가닥 A", 1), display_order: 1 },
      { ...extrude(303, "가닥 B", 2), display_order: 2 },
      node(304, "join", "join", "합류", 3),
      node(305, "sink", "sink", "완제품", 4),
    ],
    edges: [edge(301, 301, 302), edge(302, 301, 303), edge(303, 302, 304), edge(304, 303, 304), edge(305, 304, 305)],
  };
  return {
    versions: [
      baseVersion(1, 1, 1, "approved", { row_version: 2 }),
      baseVersion(2, 1, 2, "draft", { base_version_id: processVersionId(1), row_version: 3 }),
      baseVersion(3, 3, 1, "draft"),
      baseVersion(4, 4, 1, "draft", { row_version: 2 }),
    ],
    graphs: {
      [processVersionId(1)]: linear(0),
      [processVersionId(2)]: linear(100),
      [processVersionId(3)]: { nodes: [], edges: [] },
      [processVersionId(4)]: branching,
    },
  };
}

/** 서버가 저장 시 다시 계산하는 knowledge 검증(단순화): 미정은 모두 경고 */
function issuesOf(state: FakeState, v: Version): Schemas["IssueDto"][] {
  const out: Schemas["IssueDto"][] = [];
  const w = (rule_id: string, entity_id: string, field_path: string, message: string) =>
    out.push({ severity: "warning", rule_id, entity_id, field_path, message, resolution: null });
  const unitUnknown = (s: Version["raw_unit_spec"]) => [s.length_m, s.weight_kg, s.unit_count, s.strand_count].every((m) => (m as any)?.mode === "unknown");
  if (unitUnknown(v.raw_unit_spec)) w("VAL-VER-001", v.id, "/raw_unit_spec", "원자재 기본 단위가 미정입니다.");
  if (unitUnknown(v.finished_unit_spec)) w("VAL-VER-002", v.id, "/finished_unit_spec", "완제품 단위가 미정입니다.");
  const g = state.processes.graphs[v.id];
  for (const n of g?.nodes ?? []) {
    if (n.kind === "operation") {
      const s = n.step ?? {};
      if ((s.timing_rule?.processing as any)?.kind === "unknown") w("VAL-TIME-001", n.id, "/timing_rule/processing", `${n.label}: 처리 방식이 미정입니다.`);
      if ((s.resources ?? []).length === 0) w("VAL-RES-002", n.id, "/resources", `${n.label}: 설비 후보가 없습니다.`);
    }
    if (n.kind === "buffer" && !n.asset_id) w("VAL-GRAPH-013", n.id, "/asset_id", `${n.label}: 대기 공간의 위치가 미정입니다.`);
  }
  return out;
}

const closeVersion = (state: FakeState, v: Version) => {
  v.issues = issuesOf(state, v);
  return v;
};

function summary(v: Version | undefined) {
  return v ? { id: v.id, version_no: v.version_no, status: v.status, approved_at: v.approved_at } : null;
}

/** 제품의 공정 요약(현재 승인본·최신 버전). 제품 응답에 서버처럼 반영한다. */
export function processSummaries(state: FakeState, productId: string) {
  const mine = state.processes.versions.filter((v) => v.product_id === productId).sort((a, b) => b.version_no - a.version_no);
  return { latest_process_version: summary(mine[0]), current_process_version: summary(mine.find((v) => v.status === "approved")) };
}

const POS = /^(0|[1-9]\d*)(\.\d{1,6})?$/;

/** 측정값 검사. 개수는 JSON 정수(1 이상), decimal은 0 초과 6자리까지(준비·대기 시간은 0 허용). */
function measureError(m: any, path: string, kind: "decimal" | "count" | "duration"): FakeResponse | null {
  if (m === undefined) return null;
  if (!m || !["unknown", "known", "not_applicable"].includes(m.mode)) return { status: 422, body: errorEnv(path, "측정값 모드가 올바르지 않습니다.") };
  if (m.mode !== "known") return m.value === undefined || m.value === null ? null : { status: 422, body: errorEnv(`${path}/value`, "known이 아니면 value를 보낼 수 없습니다.") };
  if (kind === "count") {
    if (!Number.isInteger(m.value) || m.value < 1) return { status: 422, body: errorEnv(`${path}/value`, "1 이상의 JSON 정수여야 합니다.") };
    return null;
  }
  if (typeof m.value !== "string" || !POS.test(m.value) || (kind === "decimal" && Number(m.value) <= 0))
    return { status: 422, body: errorEnv(`${path}/value`, kind === "decimal" ? "0보다 큰 decimal 문자열이어야 합니다." : "0 이상의 decimal 문자열이어야 합니다.") };
  return null;
}

function errorEnv(field_path: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code: "VALIDATION_ERROR", message: "요청 형식이 올바르지 않습니다.", request_id: "req-test", details: [{ message, field_path, severity: "error", ...extra }] } };
}

/** 그래프 본문 검사. 오류가 있으면 첫 오류를 422로 돌려준다(아무것도 저장하지 않음). */
function graphError(state: FakeState, versionId: string, body: any): FakeResponse | null {
  const nodes: any[] = body?.nodes ?? [];
  const edges: any[] = body?.edges ?? [];
  const ids = new Set<string>();
  const keys = new Set<string>();
  const assets = new Map(state.assets.map((a) => [a.id, a]));
  const used = new Set(state.processes.versions.filter((v) => v.id !== versionId).flatMap((v) => (state.processes.graphs[v.id]?.nodes ?? []).map((n) => n.id)));
  for (const [i, n] of nodes.entries()) {
    if (typeof n.label !== "string" || n.label.trim() === "") return { status: 422, body: errorEnv(`/nodes/${i}/label`, "이름이 필요합니다.", { rule_id: "VAL-REF-001" }) };
    if (ids.has(n.id) || used.has(n.id)) return { status: 422, body: errorEnv(`/nodes/${i}/id`, "이미 쓰인 id입니다.", { rule_id: "VAL-REF-003" }) };
    ids.add(n.id);
    if (keys.has(n.node_key)) return { status: 422, body: errorEnv(`/nodes/${i}/node_key`, "node_key가 중복됩니다.", { rule_id: "VAL-REF-001" }) };
    keys.add(n.node_key);
    if (n.asset_id) {
      const a = assets.get(n.asset_id);
      if (!["source", "buffer", "sink"].includes(n.kind) || !a || a.kind === "equipment")
        return { status: 422, body: errorEnv(`/nodes/${i}/asset_id`, "저장·도킹 공간만 지정할 수 있습니다.", { rule_id: "VAL-REF-002" }) };
    }
    if (n.kind === "operation") {
      const s = n.step ?? {};
      const t = s.timing_rule ?? {};
      const p = t.processing;
      const checks: [any, string, "decimal" | "count" | "duration"][] = [
        [p?.speed_m_per_min, "/step/timing_rule/processing/speed_m_per_min", "decimal"],
        [p?.parallel_streams, "/step/timing_rule/processing/parallel_streams", "count"],
        [p?.duration_min, "/step/timing_rule/processing/duration_min", "decimal"],
        [p?.reference_length_m, "/step/timing_rule/processing/reference_length_m", "decimal"],
        [t.setup?.duration_min, "/step/timing_rule/setup/duration_min", "duration"],
        [t.precondition_delay?.duration_min, "/step/timing_rule/precondition_delay/duration_min", "duration"],
        [s.output_rule?.length_m, "/step/output_rule/length_m", "decimal"],
        [s.output_rule?.weight_kg, "/step/output_rule/weight_kg", "decimal"],
        [s.output_rule?.unit_count, "/step/output_rule/unit_count", "count"],
      ];
      for (const [m, path, kind] of checks) {
        const e = measureError(m, `/nodes/${i}${path}`, kind);
        if (e) return e;
      }
      for (const [j, r] of (s.resources ?? []).entries()) {
        const base = `/nodes/${i}/step/resources/${j}`;
        const cands: any[] = r.candidates ?? [];
        for (const [k, c] of cands.entries()) {
          const a = assets.get(c.asset_id);
          if (!a || a.kind !== "equipment") return { status: 422, body: errorEnv(`${base}/candidates/${k}/asset_id`, "같은 프로젝트의 설비 자산만 후보가 될 수 있습니다.", { rule_id: "VAL-REF-002" }) };
        }
        if (new Set(cands.map((c) => c.asset_id)).size !== cands.length) return { status: 422, body: errorEnv(`${base}/candidates`, "후보가 중복됩니다.", { rule_id: "VAL-RES-003" }) };
        if ((r.selection_mode ?? "one_of") === "one_of" && cands.length > 0 && (r.required_count ?? 1) > cands.length)
          return { status: 422, body: errorEnv(`${base}/required_count`, "후보 수보다 많은 수량을 고를 수 없습니다.", { rule_id: "VAL-RES-001" }) };
      }
    } else if (n.step) return { status: 422, body: errorEnv(`/nodes/${i}/step`, "operation만 step을 가질 수 있습니다.", { rule_id: "VAL-REF-001" }) };
  }
  for (const [i, e] of edges.entries()) {
    if (!ids.has(e.from_node_id)) return { status: 422, body: errorEnv(`/edges/${i}/from_node_id`, "간선이 그래프에 없는 노드를 가리킵니다.", { rule_id: "VAL-GRAPH-001" }) };
    if (!ids.has(e.to_node_id)) return { status: 422, body: errorEnv(`/edges/${i}/to_node_id`, "간선이 그래프에 없는 노드를 가리킵니다. 노드를 함께 보내거나 간선을 제거하세요.", { rule_id: "VAL-GRAPH-001" }) };
    if (e.from_node_id === e.to_node_id) return { status: 422, body: errorEnv(`/edges/${i}/to_node_id`, "간선이 자기 자신을 가리킵니다.", { rule_id: "VAL-GRAPH-003" }) };
    const kind = e.edge_kind ?? "material";
    if (!["material", "precedence", "supply"].includes(kind)) return { status: 422, body: errorEnv(`/edges/${i}/edge_kind`, "알 수 없는 간선 종류입니다.", { rule_id: "VAL-REF-001" }) };
    const from = nodes.find((n) => n.id === e.from_node_id);
    const to = nodes.find((n) => n.id === e.to_node_id);
    if (kind === "material" && from?.kind === "sink") return { status: 422, body: errorEnv(`/edges/${i}/from_node_id`, "물류 간선은 끝 노드에서 나갈 수 없습니다.", { rule_id: "VAL-GRAPH-004" }) };
    if (kind === "material" && to?.kind === "source") return { status: 422, body: errorEnv(`/edges/${i}/to_node_id`, "물류 간선은 시작 노드로 들어올 수 없습니다.", { rule_id: "VAL-GRAPH-004" }) };
    const mv = e.movement_rule;
    if (mv) {
      if (mv.mode !== undefined && !["unknown", "manual_duration", "network_route", "direct_feed"].includes(mv.mode)) return { status: 422, body: errorEnv(`/edges/${i}/movement_rule/mode`, "알 수 없는 이동 방식입니다.", { rule_id: "VAL-REF-001" }) };
      const bad = measureError(mv.duration_min, `/edges/${i}/movement_rule/duration_min`, "duration");
      if (bad) return bad;
    }
  }
  return null;
}

function normalizeGraph(body: any): Graph {
  return {
    nodes: (body.nodes ?? []).map((n: any) => ({
      id: n.id,
      node_key: n.node_key,
      kind: n.kind,
      label: n.label,
      asset_id: n.asset_id ?? null,
      display_order: n.display_order ?? 0,
      step: n.kind === "operation" ? fullStep(n.step) : null,
    })),
    edges: (body.edges ?? []).map((e: any) => ({
      id: e.id,
      edge_key: e.edge_key,
      from_node_id: e.from_node_id,
      to_node_id: e.to_node_id,
      edge_kind: e.edge_kind ?? "material",
      movement_rule: { mode: e.movement_rule?.mode ?? "unknown", duration_min: { mode: e.movement_rule?.duration_min?.mode ?? "unknown", value: e.movement_rule?.duration_min?.value ?? null } },
    })),
  };
}

function listItem(v: Version): Schemas["ProcessVersionListItem"] {
  return {
    id: v.id,
    project_id: v.project_id,
    product_id: v.product_id,
    version_no: v.version_no,
    status: v.status,
    base_version_id: v.base_version_id,
    submitted_at: v.submitted_at,
    approved_at: v.approved_at,
    created_at: v.created_at,
    updated_at: v.updated_at,
    row_version: v.row_version,
  };
}

const clone = <T,>(x: T): T => structuredClone(x);

/** 표준 가짜 서버의 공정 경로. 해당하지 않으면 null. */
export function processRoute(req: FakeRequest, state: FakeState, h: Helpers): FakeResponse | null {
  const { method, path } = req;
  const P = state.processes;
  const my = (productId: string) => P.versions.filter((v) => v.product_id === productId);

  const list = /^\/projects\/([^/]+)\/products\/([^/]+)\/process-versions$/.exec(path);
  if (list) {
    if (list[1] !== h.project) return h.notFound();
    const product = state.products.find((p) => p.id === list[2]);
    if (!product) return h.notFound();
    if (method === "GET")
      return { status: 200, body: { data: my(product.id).sort((a, b) => b.version_no - a.version_no).map(listItem), page: { limit: 200, next_cursor: null } } };
    if (method === "POST") {
      if (state.role === "viewer") return h.forbidden();
      if (my(product.id).some((v) => v.status === "draft" || v.status === "in_review"))
        return h.errorBody(409, "PROCESS_DRAFT_EXISTS", "이미 진행 중인 공정 버전이 있습니다.", [{ message: "초안 또는 검토 중인 버전이 제품당 하나만 있을 수 있습니다.", severity: "error" }]);
      const approved = my(product.id).find((v) => v.status === "approved");
      const no = Math.max(0, ...my(product.id).map((v) => v.version_no)) + 1;
      const n = P.versions.length + 1;
      const v = baseVersion(n, 0, no, "draft", {
        product_id: product.id,
        base_version_id: approved?.id ?? null,
        raw_unit_spec: approved ? clone(approved.raw_unit_spec) : baseVersion(0, 0, 0, "draft").raw_unit_spec,
        finished_unit_spec: approved ? clone(approved.finished_unit_spec) : baseVersion(0, 0, 0, "draft").finished_unit_spec,
        id: id(500 + n, "v"),
      });
      // 승인본이 있으면 그래프를 새 id로 복사한다(다른 버전이 쓰는 id를 재사용하지 않는다).
      const src = approved ? P.graphs[approved.id]! : { nodes: [], edges: [] };
      const map = new Map(src.nodes.map((x, i) => [x.id, id(5000 + n * 100 + i, "n")]));
      P.graphs[v.id] = {
        nodes: src.nodes.map((x) => ({ ...clone(x), id: map.get(x.id)! })),
        edges: src.edges.map((e, i) => ({ ...clone(e), id: id(6000 + n * 100 + i, "e"), from_node_id: map.get(e.from_node_id)!, to_node_id: map.get(e.to_node_id)! })),
      };
      P.versions.push(closeVersion(state, v));
      return { status: 201, headers: { ...h.etag(1), Location: `/api/v1/projects/${h.project}/process-versions/${v.id}` }, body: { data: v } };
    }
  }

  const m = /^\/projects\/([^/]+)\/process-versions\/([^/]+)(?:\/(graph|validate|submit|approve|reject|steps\/[^/]+))?$/.exec(path);
  if (!m) return null;
  if (m[1] !== h.project) return h.notFound();
  const version = P.versions.find((v) => v.id === m[2]);
  if (!version) return h.notFound();
  const sub = m[3];
  const ifMatch = req.headers["If-Match"];
  const guardWrite = (): FakeResponse | null => {
    if (state.role === "viewer") return h.forbidden();
    if (ifMatch === undefined) return h.missingIfMatch();
    return null;
  };
  const immutable = () => h.errorBody(409, "VERSION_IMMUTABLE", "초안이 아닌 버전은 수정할 수 없습니다.", [{ message: `현재 상태: ${version.status}`, field_path: "/status" }]);
  const stale = () => Number(String(ifMatch).replace(/"/g, "")) !== version.row_version;
  const done = () => {
    version.row_version += 1;
    version.updated_at = "2026-10-26T01:00:00Z";
    closeVersion(state, version);
  };

  if (!sub && method === "GET") return { status: 200, headers: h.etag(version.row_version), body: { data: closeVersion(state, version) } };

  if (!sub && method === "PATCH") {
    const g = guardWrite();
    if (g) return g;
    if (version.status !== "draft") return immutable();
    if (stale()) return h.staleVersion(version.row_version);
    const b = req.body ?? {};
    for (const k of Object.keys(b)) if (!["raw_unit_spec", "finished_unit_spec", "notes"].includes(k)) return h.invalid(`/${k}`, "허용되지 않는 필드입니다.");
    if (Object.keys(b).length === 0) return h.invalid("/", "변경할 필드가 없습니다.");
    for (const which of ["raw_unit_spec", "finished_unit_spec"] as const) {
      const spec = b[which];
      if (spec === undefined) continue;
      if (spec === null || Object.keys(spec).length === 0) return h.invalid(`/${which}`, "빈 객체·null은 보낼 수 없습니다.");
      for (const [k, m2] of Object.entries<any>(spec)) {
        if (!["length_m", "weight_kg", "unit_count", "strand_count"].includes(k)) return h.invalid(`/${which}/${k}`, "알 수 없는 키입니다.");
        const e = measureError(m2, `/${which}/${k}`, k.endsWith("count") ? "count" : "decimal");
        if (e) return e;
      }
    }
    for (const which of ["raw_unit_spec", "finished_unit_spec"] as const)
      for (const [k, m2] of Object.entries<any>(b[which] ?? {})) (version[which] as any)[k] = { mode: m2.mode, value: m2.value ?? null };
    if ("notes" in b) version.notes = b.notes;
    done();
    return { status: 200, headers: h.etag(version.row_version), body: { data: version } };
  }

  if (sub === "graph" && method === "GET") {
    const g = P.graphs[version.id]!;
    return { status: 200, headers: h.etag(version.row_version), body: { data: { process_version_id: version.id, row_version: version.row_version, nodes: g.nodes, edges: g.edges, issues: closeVersion(state, version).issues } } };
  }

  if (sub === "graph" && method === "PUT") {
    const g = guardWrite();
    if (g) return g;
    if (version.status !== "draft") return immutable();
    if (stale()) return h.staleVersion(version.row_version);
    const bad = graphError(state, version.id, req.body);
    if (bad) return bad;
    P.graphs[version.id] = normalizeGraph(req.body);
    done();
    const out = P.graphs[version.id]!;
    return { status: 200, headers: h.etag(version.row_version), body: { data: { process_version_id: version.id, row_version: version.row_version, nodes: out.nodes, edges: out.edges, issues: version.issues } } };
  }

  if (sub === "validate" && method === "POST") {
    const scope = (req.query.get("scope") ?? "knowledge") as "knowledge" | "run_template";
    let issues = issuesOf(state, version);
    if (scope === "run_template") {
      const promote = /^VAL-(TIME|OUT-00[123]|RES-00[234]|INPUT|HANDOFF|HANDLER|GRAPH-011)/;
      issues = issues.map((i) => (promote.test(i.rule_id) ? { ...i, severity: "error" as const } : i));
      for (const n of P.graphs[version.id]?.nodes ?? [])
        if (n.kind === "operation" && n.step?.operation_type && !["pass_through_length", "split_length", "output_units_by_time", "configured_yield", "supply_delay", "inspection", "transport_manual"].includes(n.step.operation_type))
          issues.push({ severity: "error", rule_id: "UNSUPPORTED_HANDLER", entity_id: n.id, field_path: "/operation_type", message: `엔진이 지원하지 않는 처리기입니다: ${n.step.operation_type}`, resolution: null });
    }
    return { status: 200, body: { data: { scope, error_count: issues.filter((i) => i.severity === "error").length, warning_count: issues.filter((i) => i.severity === "warning").length, issues } } };
  }

  if ((sub === "submit" || sub === "approve" || sub === "reject") && method === "POST") {
    if (state.role === "viewer" || (sub !== "submit" && state.role !== "admin")) return h.forbidden();
    if (ifMatch === undefined) return h.missingIfMatch();
    const from = sub === "submit" ? "draft" : "in_review";
    if (version.status !== from) return h.errorBody(409, "INVALID_STATE_TRANSITION", "이 상태에서는 할 수 없는 작업입니다.", [{ message: `현재 상태: ${version.status}`, field_path: "/status" }]);
    if (stale()) return h.staleVersion(version.row_version);
    if (sub === "reject") {
      const reason = req.body?.reason;
      if (typeof reason !== "string" || reason.trim() === "" || reason.length > 1000) return h.invalid("/reason", "사유는 1~1000자여야 합니다.");
      version.rejection_reason = reason;
      version.rejected_at = "2026-10-26T03:00:00Z";
      version.status = "draft";
    } else if (sub === "submit") {
      version.status = "in_review";
      version.submitted_at = "2026-10-26T03:00:00Z";
    } else {
      for (const o of my(version.product_id)) if (o.status === "approved") o.status = "superseded";
      version.status = "approved";
      version.approved_at = "2026-10-26T03:00:00Z";
    }
    done();
    return { status: 200, headers: h.etag(version.row_version), body: { data: version } };
  }

  return null;
}
