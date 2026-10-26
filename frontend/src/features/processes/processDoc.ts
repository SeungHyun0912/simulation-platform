import type { Schemas } from "../../shared/api/types";
import type { KnownValue } from "../../shared/components/KnownValueInput";

/**
 * 공정 그래프 문서와 단계 DTO 도우미(계약 0.4.0 `process-versions`).
 * - 편집은 서버가 준 단계 DTO(`StepDto`)를 그대로 고쳐 쓴다. 화면이 모르는 필드도 `PUT graph`(전체 교체)에서
 *   빠지지 않게 하기 위해서다(왕복 손실 방지).
 * - 값은 `{mode: unknown|known|not_applicable, value}`이며 미정은 0도 빈 값도 아니다.
 */
export type StepDto = Schemas["StepDto"];
export type GraphNode = Schemas["GraphNode"];
export type GraphEdge = Schemas["GraphEdge"];
export type GraphIn = Schemas["GraphIn"];
export type RequirementDto = Schemas["RequirementDto"];
/** 단계가 받고 내보내는 재료의 상태·수량(0.6.0). 길이·중량·단위 수·가닥 수는 서로 환산하거나 섞지 않는다. */
export type MaterialSpec = Schemas["MaterialSpecDto"];
export type TimingRule = Schemas["TimingRule"];
export type OutputRule = Schemas["OutputRule"];
export type Processing = NonNullable<TimingRule["processing"]>;

/** 서버 기본값(미정)으로 모든 규칙 필드를 채운 단계. 화면은 이 모양으로만 읽고 고친다. */
export type FullStep = Omit<StepDto, "timing_rule" | "input_rule" | "output_rule" | "handoff_rule" | "residual_rule" | "resources"> & {
  timing_rule: Required<TimingRule>;
  input_rule: NonNullable<StepDto["input_rule"]>;
  output_rule: OutputRule;
  handoff_rule: NonNullable<StepDto["handoff_rule"]>;
  residual_rule: NonNullable<StepDto["residual_rule"]>;
  resources: RequirementDto[];
  material_specs: MaterialSpec[];
};

/**
 * 그래프 문서. 서버 응답의 최상위 필드를 모두 담는다: 그래프 `PUT`은 **전체 교체**라서 화면이 모르는 필드를 빼고 보내면
 * 서버에서 지워진다(0.6.0의 `completion_node_id`·단계 `material_specs`·간선 spec 연결). 조회한 문서를 그대로 고쳐 보낸다.
 */
export type GraphDoc = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** 완제품 판정 시점(`kind=milestone` 노드 id). null/없음은 미정(서버가 경고 VAL-GRAPH-014) */
  completion_node_id?: string | null;
};

export type DecimalMeasure = Schemas["DecimalMeasure"];
export type DurationMeasure = Schemas["DurationMeasure"];
export type CountMeasure = Schemas["CountMeasure"];
type AnyMeasure = DecimalMeasure | DurationMeasure | CountMeasure;

/* ---------------- 측정값 ↔ 화면 입력(KnownValue) ---------------- */

/** 서버 측정값 → 입력 값. `known`만 값을 가지며 단위는 화면 선택용이다(서버에는 보내지 않는다). */
export function measureToKnown(m: AnyMeasure | null | undefined, unit: string): KnownValue {
  if (!m || m.mode === "unknown") return { mode: "unknown", value: "", unit };
  if (m.mode === "not_applicable") return { mode: "not_applicable", value: "", unit };
  return { mode: "value", value: m.value === null || m.value === undefined ? "" : String(m.value), unit };
}

/** 입력 값 → decimal 문자열 측정값. 값 있음이 아니면 mode만 보낸다(value를 보내면 서버가 422). */
export function knownToDecimal(kv: KnownValue): DecimalMeasure {
  if (kv.mode === "value") return { mode: "known", value: kv.value };
  return { mode: kv.mode === "not_applicable" ? "not_applicable" : "unknown" };
}

/**
 * 개수는 **JSON 정수**로 보낸다(문자열·소수는 서버가 422).
 * 입력 중인 올바르지 않은 값(빈 칸, "abc", "1.5")은 지워지지 않도록 문자열 그대로 보존한다. 이런 값은 저장 전
 * 검증(`validateMeasure`)이 막고, 보내는 시점(`toGraphIn`·단위 PATCH)에는 항상 정수만 남는다.
 */
export function knownToCount(kv: KnownValue): CountMeasure {
  if (kv.mode !== "value") return { mode: kv.mode === "not_applicable" ? "not_applicable" : "unknown" };
  const v = kv.value.trim();
  return { mode: "known", value: /^[1-9]\d{0,11}$/.test(v) ? Number(v) : (kv.value as unknown as number) };
}

const POSITIVE_DECIMAL = /^(0|[1-9]\d*)(\.\d{1,6})?$/;
const COUNT = /^[1-9]\d*$/;

export type MeasureKind = "positive" | "nonnegative" | "count";

/**
 * 값 있음일 때의 형식 오류. 처리 시간·선속·길이는 0 초과, 준비·대기 시간은 0이 유효(`nonnegative`),
 * 개수는 1 이상의 정수다. 오류가 없으면 null. 최종 판정은 서버 검증이다.
 */
export function validateMeasure(kv: KnownValue, kind: MeasureKind): string | null {
  if (kv.mode !== "value") return null;
  const v = kv.value.trim();
  if (v === "") return "값을 입력하세요. 모르는 값이면 '미정'을 선택하세요.";
  if (kind === "count") {
    if (!COUNT.test(v)) return "1 이상의 정수만 입력할 수 있습니다.";
    return Number(v) > 1_000_000_000_000 ? "값이 너무 큽니다." : null;
  }
  if (!POSITIVE_DECIMAL.test(v)) return "소수 6자리까지의 숫자만 입력할 수 있습니다(선행 0 불가).";
  if (kind === "positive" && /^0(\.0+)?$/.test(v)) return "0보다 커야 합니다. 모르는 값이면 '미정'을 선택하세요.";
  return null;
}

/* ---------------- 단계 DTO ---------------- */

const unknownDecimal = (): DecimalMeasure => ({ mode: "unknown" });
const unknownDuration = (): DurationMeasure => ({ mode: "unknown" });

/** 새 단계의 시작값: 모두 미정(0이나 임의 값으로 채우지 않는다). */
export function emptyStep(): FullStep {
  return {
    operation_type: null,
    handler_version: null,
    timing_rule: {
      processing: { kind: "unknown" },
      setup: { duration_min: unknownDuration(), trigger: "unknown" },
      precondition_delay: { duration_min: unknownDuration(), trigger: "unknown", occupancy: "unknown" },
    },
    input_rule: { acquire_scope: "unknown", consume_policy: "unknown" },
    output_rule: {
      mode: "unknown",
      unit_form: null,
      length_m: unknownDecimal(),
      weight_kg: unknownDecimal(),
      unit_count: { mode: "unknown" },
      quantity_basis: "unknown",
      schedule: "unknown",
      accounting_mode: "unknown",
    },
    handoff_rule: { mode: "unknown" },
    residual_rule: {
      mode: "unknown",
      on_product_change: "unknown",
      on_run_end: "unknown",
      scope: "unknown",
      physical_join_mode: "unknown",
    },
    resources: [],
    material_specs: [],
  };
}

/** 서버 기본값(미정)으로 빠진 필드를 채운 단계. 서버가 항상 완전한 단계를 주지만 방어적으로 둔다. */
export function stepOf(node: GraphNode): FullStep {
  const base = emptyStep();
  const s = node.step ?? {};
  return {
    ...base,
    ...s,
    timing_rule: { ...base.timing_rule, ...s.timing_rule },
    output_rule: { ...base.output_rule, ...s.output_rule },
    input_rule: { ...base.input_rule, ...s.input_rule },
    handoff_rule: { ...base.handoff_rule, ...s.handoff_rule },
    residual_rule: { ...base.residual_rule, ...s.residual_rule },
    resources: s.resources ?? [],
    material_specs: s.material_specs ?? [],
  };
}

export function isOperation(n: GraphNode): boolean {
  return n.kind === "operation";
}

/** 작업 노드의 단계를 바꾼 새 문서 */
export function updateNode(doc: GraphDoc, id: string, fn: (n: GraphNode) => GraphNode): GraphDoc {
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? fn(n) : n)) };
}

export function updateStep(doc: GraphDoc, id: string, fn: (s: FullStep, n: GraphNode) => StepDto): GraphDoc {
  return updateNode(doc, id, (n) => ({ ...n, step: fn(stepOf(n), n) }));
}

/** 표에 보이는 순서: 직선이면 연결 순서, 아니면 display_order·node_key 순 */
export function operationsInOrder(doc: GraphDoc): GraphNode[] {
  const chain = parseLinear(doc);
  if (chain) return chain.items.map((i) => i.op);
  return doc.nodes
    .filter(isOperation)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.node_key.localeCompare(b.node_key));
}

/* ---------------- 직선 그래프(표 편집 가능 구조) ---------------- */

export type ChainItem = { op: GraphNode; buffer: GraphNode | null };
export type Chain = { source: GraphNode | null; items: ChainItem[]; sink: GraphNode | null };

/**
 * 직선 구조: [source] → (operation [buffer])+ → [sink]를 material 간선 하나씩으로 이은 것.
 * join·milestone·precedence/supply 간선·분기·합류·연속 buffer·순환·고립 노드가 있으면 null(표로 구조를 바꿀 수 없음).
 * 노드가 하나도 없는 빈 문서는 단계 없는 직선이다.
 */
export function parseLinear(doc: GraphDoc): Chain | null {
  if (doc.nodes.length === 0) return doc.edges.length === 0 ? { source: null, items: [], sink: null } : null;
  if (doc.edges.some((e) => e.edge_kind !== "material")) return null;
  if (doc.nodes.some((n) => n.kind === "join" || n.kind === "milestone")) return null;
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const out = new Map<string, string>();
  const incoming = new Map<string, number>();
  for (const e of doc.edges) {
    if (!byId.has(e.from_node_id) || !byId.has(e.to_node_id) || out.has(e.from_node_id)) return null;
    out.set(e.from_node_id, e.to_node_id);
    incoming.set(e.to_node_id, (incoming.get(e.to_node_id) ?? 0) + 1);
  }
  if ([...incoming.values()].some((c) => c > 1)) return null;
  const starts = doc.nodes.filter((n) => !incoming.has(n.id));
  if (starts.length !== 1) return null;
  const order: GraphNode[] = [];
  for (let n: GraphNode | undefined = starts[0]; n; n = byId.get(out.get(n.id) ?? "")) {
    if (order.includes(n)) return null;
    order.push(n);
  }
  if (order.length !== doc.nodes.length) return null;

  let i = 0;
  let source: GraphNode | null = null;
  let sink: GraphNode | null = null;
  if (order[i]?.kind === "source") source = order[i++]!;
  const items: ChainItem[] = [];
  while (i < order.length) {
    const n = order[i]!;
    if (n.kind === "sink") {
      if (i !== order.length - 1) return null;
      sink = n;
      i++;
    } else if (n.kind === "operation") {
      const next = order[i + 1];
      if (next?.kind === "buffer") {
        items.push({ op: n, buffer: next });
        i += 2;
      } else {
        items.push({ op: n, buffer: null });
        i += 1;
      }
    } else return null;
  }
  return { source, items, sink };
}

const shortId = (id: string) => id.replace(/-/g, "").slice(0, 8);

/**
 * 직선 구조를 노드·간선으로 다시 만든다. 기존 노드·간선의 id와 간선의 이동 규칙은 보존하고
 * 새로 이어지는 간선만 새 id를 받는다(묵시적으로 엉뚱한 연결을 만들지 않는다).
 */
export function buildLinear(chain: Chain, previous: GraphDoc, newId: () => string = () => crypto.randomUUID()): GraphDoc {
  const seq: GraphNode[] = [];
  if (chain.source) seq.push(chain.source);
  for (const it of chain.items) {
    seq.push(it.op);
    if (it.buffer) seq.push(it.buffer);
  }
  if (chain.sink) seq.push(chain.sink);
  const nodes = seq.map((n, i) => ({ ...n, display_order: i }));
  const existing = new Map(previous.edges.map((e) => [`${e.from_node_id}>${e.to_node_id}`, e]));
  const edges: GraphEdge[] = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i]!;
    const b = nodes[i + 1]!;
    const old = existing.get(`${a.id}>${b.id}`);
    if (old) edges.push(old);
    else {
      const id = newId();
      edges.push({ id, edge_key: `e-${shortId(id)}`, from_node_id: a.id, to_node_id: b.id, edge_kind: "material" });
    }
  }
  return { ...previous, nodes, edges };
}

function newNode(kind: GraphNode["kind"], label: string, id: string, key: string): GraphNode {
  return { id, node_key: key, kind, label, asset_id: null, display_order: 0, step: null };
}

/** 빈 문서에서 처음 단계를 만들 때 쓰는 시작·끝 노드를 갖춘 직선 */
function chainWithEnds(chain: Chain | null, newId: () => string): Chain {
  if (chain && (chain.source || chain.sink || chain.items.length > 0)) return chain;
  return {
    source: newNode("source", "원자재", newId(), "src"),
    items: [],
    sink: newNode("sink", "완제품", newId(), "sink"),
  };
}

/** 단계 추가(맨 끝). 직선이 아니면 null. */
export function addStep(doc: GraphDoc, newId: () => string = () => crypto.randomUUID()): { doc: GraphDoc; id: string } | null {
  const parsed = parseLinear(doc);
  if (!parsed) return null;
  const chain = chainWithEnds(parsed, newId);
  const id = newId();
  const op: GraphNode = { ...newNode("operation", "", id, `op-${shortId(id)}`), step: emptyStep() };
  return { doc: buildLinear({ ...chain, items: [...chain.items, { op, buffer: null }] }, doc, newId), id };
}

/** 단계 삭제: 그 단계와 뒤따르는 "다음 위치" 노드를 함께 지우고 앞뒤를 새 간선으로 잇는다. */
export function removeStep(doc: GraphDoc, opId: string, newId: () => string = () => crypto.randomUUID()): GraphDoc | null {
  const chain = parseLinear(doc);
  if (!chain) return null;
  return buildLinear({ ...chain, items: chain.items.filter((i) => i.op.id !== opId) }, doc, newId);
}

/** 단계 이동. "다음 위치"는 단계와 함께 움직인다. */
export function moveStep(doc: GraphDoc, opId: string, delta: -1 | 1, newId: () => string = () => crypto.randomUUID()): GraphDoc | null {
  const chain = parseLinear(doc);
  if (!chain) return null;
  const i = chain.items.findIndex((x) => x.op.id === opId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= chain.items.length) return doc;
  const items = [...chain.items];
  [items[i], items[j]] = [items[j]!, items[i]!];
  return buildLinear({ ...chain, items }, doc, newId);
}

/** 다음 위치 값: 공간 없이 바로 이어짐 / 공간은 있으나 위치 미정 / 특정 저장·도킹 공간 */
export type NextLocation = { kind: "none" } | { kind: "unset" } | { kind: "asset"; assetId: string; label: string };

export function nextLocationOf(chain: Chain, opId: string): NextLocation | null {
  const it = chain.items.find((x) => x.op.id === opId);
  if (!it) return null;
  if (!it.buffer) return { kind: "none" };
  return it.buffer.asset_id ? { kind: "asset", assetId: it.buffer.asset_id, label: it.buffer.label } : { kind: "unset" };
}

export function setNextLocation(
  doc: GraphDoc,
  opId: string,
  next: NextLocation,
  newId: () => string = () => crypto.randomUUID(),
): GraphDoc | null {
  const chain = parseLinear(doc);
  if (!chain) return null;
  const items = chain.items.map((it) => {
    if (it.op.id !== opId) return it;
    if (next.kind === "none") return { ...it, buffer: null };
    const buf = it.buffer ?? newNode("buffer", "", newId(), "");
    const id = buf.id;
    const label = next.kind === "asset" ? next.label : "위치 미정";
    return {
      ...it,
      buffer: {
        ...buf,
        node_key: buf.node_key || `buf-${shortId(id)}`,
        label,
        asset_id: next.kind === "asset" ? next.assetId : null,
      },
    };
  });
  return buildLinear({ ...chain, items }, doc, newId);
}

/* ---------------- 일반 그래프 편집(직선이 아니어도 가능) ---------------- */

export type NodeKind = GraphNode["kind"];
export type EdgeKind = NonNullable<GraphEdge["edge_kind"]>;
export type MovementRule = NonNullable<GraphEdge["movement_rule"]>;

/** 저장·도킹 공간(asset)을 가리킬 수 있는 노드 종류. 작업·합류·완료 기준 노드에는 설비·공간을 직접 박지 않는다. */
export const SPACE_KINDS: readonly NodeKind[] = ["source", "buffer", "sink"];

const KEY_PREFIX: Record<NodeKind, string> = { source: "src", buffer: "buf", operation: "op", join: "join", milestone: "ms", sink: "sink" };

const uniqueKey = (doc: GraphDoc, kind: NodeKind, id: string) => {
  const base = `${KEY_PREFIX[kind]}-${shortId(id)}`;
  let key = base;
  for (let i = 2; doc.nodes.some((n) => n.node_key === key); i++) key = `${base}-${i}`;
  return key;
};

const maxOrder = (doc: GraphDoc) => doc.nodes.reduce((m, n) => Math.max(m, n.display_order ?? 0), -1);

/** 노드 추가(맨 끝 순서). 연결은 만들지 않는다 — 간선은 사용자가 직접 추가한다. 작업 노드는 모두 미정인 단계로 시작한다. */
export function addNode(
  doc: GraphDoc,
  kind: NodeKind,
  label: string,
  newId: () => string = () => crypto.randomUUID(),
): { doc: GraphDoc; id: string } {
  const id = newId();
  const node: GraphNode = {
    id,
    node_key: uniqueKey(doc, kind, id),
    kind,
    label,
    asset_id: null,
    display_order: maxOrder(doc) + 1,
    step: kind === "operation" ? emptyStep() : null,
  };
  return { doc: { ...doc, nodes: [...doc.nodes, node] }, id };
}

/** 이름·공간만 바꾼다. 종류와 키는 만든 뒤 바꾸지 않는다. 공간은 시작·대기·끝 노드에만 둘 수 있다. */
export function patchNode(doc: GraphDoc, id: string, patch: { label?: string; asset_id?: string | null }): GraphDoc {
  return updateNode(doc, id, (n) => ({
    ...n,
    ...(patch.label !== undefined ? { label: patch.label } : {}),
    ...(patch.asset_id !== undefined && SPACE_KINDS.includes(n.kind) ? { asset_id: patch.asset_id } : {}),
  }));
}

export function connectedEdges(doc: GraphDoc, nodeId: string): GraphEdge[] {
  return doc.edges.filter((e) => e.from_node_id === nodeId || e.to_node_id === nodeId);
}

/**
 * 노드 삭제. 연결된 간선도 함께 지운다. 앞뒤를 자동으로 잇지 않는다(묵시적으로 엉뚱한 연결을 만들지 않는다) —
 * 어떤 간선이 사라지는지는 호출한 쪽이 `connectedEdges`로 미리 보여 준다.
 */
export function removeNode(doc: GraphDoc, nodeId: string): GraphDoc {
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => n.id !== nodeId),
    edges: doc.edges.filter((e) => e.from_node_id !== nodeId && e.to_node_id !== nodeId),
    // 완제품으로 지정한 노드를 지우면 지정도 푼다(없는 노드를 가리키면 서버가 422)
    ...(doc.completion_node_id === nodeId ? { completion_node_id: null } : {}),
  };
}

/** 노드 표시 순서(display_order)를 이웃과 바꾼다. 직선이 아닌 공정의 단계 표 순서에 쓰인다. 순서는 0부터 빈틈없이 다시 매긴다. */
export function moveNodeOrder(doc: GraphDoc, nodeId: string, delta: -1 | 1): GraphDoc {
  const sorted = [...doc.nodes].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.node_key.localeCompare(b.node_key));
  const i = sorted.findIndex((n) => n.id === nodeId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= sorted.length) return doc;
  [sorted[i], sorted[j]] = [sorted[j]!, sorted[i]!];
  const order = new Map(sorted.map((n, idx) => [n.id, idx]));
  return { ...doc, nodes: doc.nodes.map((n) => ({ ...n, display_order: order.get(n.id)! })) };
}

/** 같은 시작·끝·종류의 간선이 이미 있는지(중복 연결 방지) */
export function hasEdge(doc: GraphDoc, from: string, to: string, kind: EdgeKind, exceptId?: string): boolean {
  return doc.edges.some((e) => e.id !== exceptId && e.from_node_id === from && e.to_node_id === to && (e.edge_kind ?? "material") === kind);
}

/** 간선 추가. 이동 규칙은 보내지 않아 서버 기본(미정)이 된다. */
export function addEdge(
  doc: GraphDoc,
  from: string,
  to: string,
  kind: EdgeKind,
  newId: () => string = () => crypto.randomUUID(),
): { doc: GraphDoc; id: string } {
  const id = newId();
  const edge: GraphEdge = { id, edge_key: `e-${shortId(id)}`, from_node_id: from, to_node_id: to, edge_kind: kind };
  return { doc: { ...doc, edges: [...doc.edges, edge] }, id };
}

export function patchEdge(
  doc: GraphDoc,
  id: string,
  patch: {
    from_node_id?: string;
    to_node_id?: string;
    edge_kind?: EdgeKind;
    movement_rule?: MovementRule;
    source_output_spec_key?: string | null;
    target_input_spec_key?: string | null;
  },
): GraphDoc {
  return {
    ...doc,
    edges: doc.edges.map((e) => {
      if (e.id !== id) return e;
      const next = { ...e, ...patch };
      // spec 연결은 끝점 단계의 spec을 가리킨다. 끝점이 바뀌면 낡은 연결을 풀고, 선후 관계 간선에는 연결할 수 없다(VAL-SPEC-004).
      if (patch.from_node_id !== undefined && patch.from_node_id !== e.from_node_id) next.source_output_spec_key = null;
      if (patch.to_node_id !== undefined && patch.to_node_id !== e.to_node_id) next.target_input_spec_key = null;
      if (patch.edge_kind === "precedence") {
        next.source_output_spec_key = null;
        next.target_input_spec_key = null;
      }
      return next;
    }),
  };
}

export function removeEdge(doc: GraphDoc, edgeId: string): GraphDoc {
  return { ...doc, edges: doc.edges.filter((e) => e.id !== edgeId) };
}

/** 서버 기본값(미정)을 채운 이동 규칙. direct_feed도 이동 시간을 0으로 가정하지 않는다(03 §7). */
export function movementOf(e: GraphEdge): { mode: NonNullable<MovementRule["mode"]>; duration_min: DurationMeasure } {
  return { mode: e.movement_rule?.mode ?? "unknown", duration_min: e.movement_rule?.duration_min ?? { mode: "unknown" } };
}

/* ---------------- 완제품 지정·재료 spec·간선 spec 연결(계약 0.6.0) ---------------- */

/** 완제품 판정 시점 지정. milestone 노드만 가능하며 null은 미정이다(서버가 경고 VAL-GRAPH-014). */
export function setCompletion(doc: GraphDoc, nodeId: string | null): GraphDoc {
  if (nodeId !== null && doc.nodes.find((n) => n.id === nodeId)?.kind !== "milestone") return doc;
  return { ...doc, completion_node_id: nodeId };
}

/**
 * 새 재료 spec. 값은 모두 미정(0이 아님)으로 시작하고 spec_key는 단계 안에서 입력·출력 공통으로 유일하다.
 * 키는 만든 뒤 바꾸지 않는다(간선 연결이 key로 이어지므로).
 */
export function newMaterialSpec(direction: MaterialSpec["direction"], existing: readonly MaterialSpec[], newId: () => string = () => crypto.randomUUID()): MaterialSpec {
  const prefix = direction === "input" ? "in" : "out";
  let key = `${prefix}-${shortId(newId())}`;
  for (let i = 2; existing.some((s) => s.spec_key === key); i++) key = `${prefix}-${shortId(newId())}-${i}`;
  return {
    spec_key: key,
    direction,
    material_definition_id: null,
    state_code: null,
    form: null,
    length_m: { mode: "unknown" },
    weight_kg: { mode: "unknown" },
    unit_count: { mode: "unknown" },
    strand_count: { mode: "unknown" },
    quantity_basis: "unknown",
  };
}

/** 이 노드의 spec 중 간선이 연결해 둔 key(제거하거나 방향을 바꾸면 서버가 422 VAL-SPEC-005) */
export function linkedSpecKeys(doc: GraphDoc, nodeId: string): Set<string> {
  const keys = new Set<string>();
  for (const e of doc.edges) {
    if (e.from_node_id === nodeId && e.source_output_spec_key) keys.add(e.source_output_spec_key);
    if (e.to_node_id === nodeId && e.target_input_spec_key) keys.add(e.target_input_spec_key);
  }
  return keys;
}

/** spec의 표시 이름: 재료가 정해졌으면 재료, 아니면 상태·형태, 없으면 키 */
export function specTitle(spec: MaterialSpec, materialName?: (id: string) => string | undefined): string {
  const material = spec.material_definition_id ? materialName?.(spec.material_definition_id) : undefined;
  const detail = [material, spec.state_code, spec.form].filter(Boolean).join(" · ");
  return detail ? `${spec.spec_key} (${detail})` : spec.spec_key;
}
