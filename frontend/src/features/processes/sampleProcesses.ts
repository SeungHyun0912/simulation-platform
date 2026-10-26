import { SAMPLE_ASSETS } from "../assets/sampleAssets";
import { buildLinear, emptyStep, type FullStep, type GraphDoc, type GraphNode, type StepDto } from "./processDoc";
import { toUnitSpecEdit, type ProcessGraphView, type ProcessVersionListItem, type ProcessVersionView } from "./processView";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";

/**
 * 정적 예시 데이터. 실제 API 응답도 승인된 계약 예제도 아니며 실제 공정이 아니다.
 * 단계 이름·설비·값은 화면 구조와 상태 표현을 보여 주기 위한 임의 값이고, 서버 검증 결과(`issues`)도 예시다.
 * 제품 sampleProducts의 버전 ID와 연결되며 설비·공간은 sampleAssets의 자산 id로 가리킨다(표시 코드가 아님).
 */
const assetId = (code: string) => SAMPLE_ASSETS.find((a) => a.code === code)!.id;
const assetName = (code: string) => `${code} ${SAMPLE_ASSETS.find((a) => a.code === code)!.name}`;
const uuid = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;

const node = (kind: GraphNode["kind"], id: string, key: string, label: string, extra: Partial<GraphNode> = {}): GraphNode => ({
  id,
  node_key: key,
  kind,
  label,
  asset_id: null,
  display_order: 0,
  step: null,
  ...extra,
});

const op = (id: string, key: string, label: string, step: StepDto): GraphNode => node("operation", id, key, label, { step });

const known = (value: string) => ({ mode: "known" as const, value });
const count = (value: number) => ({ mode: "known" as const, value });

const extrusion: FullStep = {
  ...emptyStep(),
  operation_type: "output_units_by_time",
  handler_version: "1",
  timing_rule: {
    processing: {
      kind: "output_speed",
      speed_m_per_min: known("20"),
      basis: "per_stream",
      output_schedule: "sequential_units",
      parallel_streams: count(1),
    },
    // 준비 없음(해당 없음)과 미정은 다르다
    setup: { duration_min: { mode: "not_applicable" }, trigger: "not_applicable" },
    precondition_delay: { duration_min: { mode: "unknown" }, trigger: "unknown", occupancy: "unknown" },
  },
  output_rule: { ...emptyStep().output_rule, mode: "split_length", length_m: known("1000"), quantity_basis: "per_operation" },
  resources: [
    {
      role_key: "main",
      resource_kind: "equipment",
      selection_mode: "one_of",
      required_count: 1,
      capacity_mode: "finite",
      allocation_rule: { mode: "unknown" },
      candidates: [
        { asset_id: assetId("EQ-001"), eligibility_status: "confirmed" },
        { asset_id: assetId("EQ-002"), eligibility_status: "unknown" },
      ],
    },
  ],
};

const braiding: FullStep = {
  ...emptyStep(),
  operation_type: "output_units_by_time",
  handler_version: "1",
  timing_rule: {
    processing: { kind: "per_output_unit", duration_min: known("22"), output_schedule: "sequential_units" },
    // 준비 시점은 알지만 시간은 미정 → 0분이 아니다.
    setup: { duration_min: { mode: "unknown" }, trigger: "per_input_replacement" },
    precondition_delay: { duration_min: { mode: "unknown" }, trigger: "unknown", occupancy: "unknown" },
  },
  output_rule: { ...emptyStep().output_rule, mode: "pass_through" },
  resources: [
    {
      role_key: "main",
      resource_kind: "equipment",
      selection_mode: "one_of",
      required_count: 1,
      capacity_mode: "finite",
      allocation_rule: { mode: "unknown" },
      candidates: [{ asset_id: assetId("EQ-003"), eligibility_status: "confirmed" }],
    },
  ],
};

const V2 = uuid("1a2");
const V1 = uuid("1a1");
const VB1 = uuid("1b1");
const P1 = uuid("c1");
const P2 = uuid("c2");

const warn = (rule_id: string, entity_id: string, field_path: string, message: string, resolution?: string): ValidationIssue => ({
  severity: "warning",
  rule_id,
  entity_id,
  field_path,
  message,
  ...(resolution ? { resolution } : {}),
});

function linearDoc(ops: { op: GraphNode; next: GraphNode | null }[], srcId: string, sinkId: string): GraphDoc {
  const seed = { nodes: [], edges: [] };
  let n = 0;
  return buildLinear(
    {
      source: node("source", srcId, "src", "원자재"),
      items: ops.map((o) => ({ op: o.op, buffer: o.next })),
      sink: node("sink", sinkId, "sink", "완제품"),
    },
    seed,
    () => uuid(`e${(n++).toString(16)}${srcId.slice(-3)}`),
  );
}

const draftDoc = linearDoc(
  [
    {
      op: op(uuid("2a1"), "extrude", "예시 압출", extrusion),
      next: node("buffer", uuid("3a1"), "buf-1", assetName("ST-001"), { asset_id: assetId("ST-001") }),
    },
    // 공간은 있으나 위치가 미정인 buffer(위치 미정 ≠ 공간 없음)
    { op: op(uuid("2a2"), "braid", "예시 편조", braiding), next: node("buffer", uuid("3a2"), "buf-2", "위치 미정") },
    { op: op(uuid("2a3"), "inspect", "예시 검사", emptyStep()), next: null },
  ],
  uuid("4a1"),
  uuid("4a2"),
);

const approvedDoc = linearDoc(
  [
    {
      op: op(uuid("2b1"), "extrude", "예시 압출", {
        ...extrusion,
        timing_rule: {
          ...extrusion.timing_rule,
          processing: { kind: "output_speed", speed_m_per_min: known("15"), basis: "per_stream", output_schedule: "sequential_units", parallel_streams: count(1) },
        },
        output_rule: { ...extrusion.output_rule, mode: "configured_units", length_m: known("300"), unit_count: count(10) },
        resources: [{ ...extrusion.resources[0]!, candidates: [{ asset_id: assetId("EQ-001"), eligibility_status: "confirmed" }] }],
      }),
      next: node("buffer", uuid("3b1"), "buf-1", assetName("ST-001"), { asset_id: assetId("ST-001") }),
    },
  ],
  uuid("4b1"),
  uuid("4b2"),
);

const version = (
  id: string,
  productId: string,
  versionNo: number,
  status: string,
  extra: Partial<ProcessVersionView> = {},
): ProcessVersionView => ({
  id,
  productId,
  versionNo,
  status,
  baseVersionId: null,
  rawUnitSpec: toUnitSpecEdit(undefined),
  finishedUnitSpec: toUnitSpecEdit(undefined),
  notes: null,
  issues: [],
  rejectionReason: null,
  approvedAt: null,
  rowVersion: 1,
  ...extra,
});

const draftIssues = [
  warn("VAL-VER-001", V2, "/raw_unit_spec", "원자재 기본 단위가 미정입니다."),
  warn("VAL-VER-002", V2, "/finished_unit_spec", "완제품 단위가 미정입니다."),
  warn("VAL-TIME-004", uuid("2a2"), "/timing_rule/setup/duration_min", "준비 시간이 미정입니다.", "준비 시간을 입력하세요."),
  warn("VAL-TIME-001", uuid("2a3"), "/timing_rule/processing", "처리 방식이 미정입니다."),
  warn("VAL-RES-002", uuid("2a3"), "/resources", "설비 후보가 없습니다.", "설비 후보를 지정하세요."),
  warn("VAL-GRAPH-013", uuid("3a2"), "/asset_id", "대기 공간의 위치가 미정입니다."),
];

/** 분기·합류가 있는 예시(직선이 아님): 원자재 → 가닥 A·가닥 B → 합류 → 완제품. 가닥 A → 합류 이동은 사람이 정한 5분. */
const branchNodes = [
  node("source", uuid("4c1"), "src", "원자재", { display_order: 0 }),
  op(uuid("2c1"), "strand-a", "예시 가닥 A", extrusion),
  op(uuid("2c2"), "strand-b", "예시 가닥 B", braiding),
  node("join", uuid("5c1"), "join", "예시 합류", { display_order: 3 }),
  node("sink", uuid("4c2"), "sink", "완제품", { display_order: 4 }),
].map((n, i) => ({ ...n, display_order: i }));
const branchEdge = (n: number, from: string, to: string, extra: Partial<GraphDoc["edges"][number]> = {}): GraphDoc["edges"][number] => ({
  id: uuid(`6c${n}`),
  edge_key: `e${n}`,
  from_node_id: from,
  to_node_id: to,
  edge_kind: "material",
  ...extra,
});
const branchDoc: GraphDoc = {
  nodes: branchNodes,
  edges: [
    branchEdge(1, uuid("4c1"), uuid("2c1")),
    branchEdge(2, uuid("4c1"), uuid("2c2")),
    branchEdge(3, uuid("2c1"), uuid("5c1"), { movement_rule: { mode: "manual_duration", duration_min: { mode: "known", value: "5" } } }),
    branchEdge(4, uuid("2c2"), uuid("5c1")),
    branchEdge(5, uuid("5c1"), uuid("4c2")),
  ],
};
const VC1 = uuid("1d1");
const P4 = uuid("c4");

type SampleProcess = { version: ProcessVersionView; graph: ProcessGraphView };

export const SAMPLE_PROCESSES: Record<string, SampleProcess> = {
  [V2]: {
    version: version(V2, P1, 2, "draft", { baseVersionId: V1, issues: draftIssues, rowVersion: 3 }),
    graph: { rowVersion: 3, doc: draftDoc, issues: draftIssues },
  },
  [V1]: {
    version: version(V1, P1, 1, "approved", { approvedAt: "2026-10-20T00:00:00Z", rowVersion: 2 }),
    graph: { rowVersion: 2, doc: approvedDoc, issues: [] },
  },
  [VC1]: {
    version: version(VC1, P4, 1, "draft", { rowVersion: 1 }),
    graph: { rowVersion: 1, doc: branchDoc, issues: [] },
  },
  [VB1]: {
    version: version(VB1, P2, 1, "in_review", { rowVersion: 2 }),
    graph: { rowVersion: 2, doc: { nodes: [], edges: [] }, issues: [] },
  },
};

export function sampleVersionList(productId: string): ProcessVersionListItem[] {
  return Object.values(SAMPLE_PROCESSES)
    .filter((p) => p.version.productId === productId)
    .map(({ version: v }) => ({
      id: v.id,
      versionNo: v.versionNo,
      status: v.status,
      baseVersionId: v.baseVersionId,
      approvedAt: v.approvedAt,
      submittedAt: null,
      createdAt: "2026-10-20T00:00:00Z",
      rowVersion: v.rowVersion,
    }))
    .sort((a, b) => b.versionNo - a.versionNo);
}
