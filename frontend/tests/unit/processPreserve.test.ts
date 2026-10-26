import {
  addEdge,
  addNode,
  addStep,
  moveStep,
  patchEdge,
  removeNode,
  removeStep,
  setNextLocation,
  stepOf,
  updateStep,
  type GraphDoc,
} from "../../src/features/processes/processDoc";
import { docChanged, mergeProcessDraft, toGraphIn, type ProcessDraft } from "../../src/features/processes/processDraft";
import { toGraphView, toUnitSpecEdit } from "../../src/features/processes/processView";
import { processVersionId, seedProcesses } from "../fakeProcess";

/**
 * 계약 0.6.0: 그래프 `PUT`은 전체 교체라서 화면이 모르는 새 필드를 빼고 보내면 서버에서 지워진다
 * (`completion_node_id`·단계 `material_specs`·간선 `source_output_spec_key`/`target_input_spec_key`).
 * 조회한 그래프를 그대로 고쳐 보내는지 서버 응답 모양(가짜 서버 시드)으로 검증한다.
 */
const server = seedProcesses().graphs[processVersionId(5)]!; // 가닥 A(출력 spec) → 가닥 B(입력 spec), 완제품 판정 milestone 지정
const view = () =>
  toGraphView({
    process_version_id: processVersionId(5),
    row_version: 2,
    nodes: structuredClone(server.nodes),
    edges: structuredClone(server.edges),
    completion_node_id: server.completion_node_id ?? null,
    issues: [],
  });
let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const byLabel = (d: GraphDoc, label: string) => d.nodes.find((x) => x.label === label)!;

describe("조회한 그래프를 그대로 보내면 새 필드가 지워지지 않는다", () => {
  it("toGraphView → toGraphIn 왕복에서 완제품 지정·재료 spec·간선 spec 연결이 그대로다", () => {
    const doc = view().doc;
    const body = toGraphIn(doc);
    expect(body.completion_node_id).toBe(server.completion_node_id);
    expect(body.nodes).toEqual(server.nodes); // 단계의 material_specs 포함
    expect(body.edges).toEqual(server.edges); // spec 연결 포함
    const a = body.nodes.find((x) => x.label === "가닥 A")!;
    expect(a.step!.material_specs![0]).toMatchObject({ spec_key: "out-1", direction: "output", form: "보빈", length_m: { mode: "known", value: "1000" }, unit_count: { mode: "known", value: 2 } });
    expect(body.edges!.find((e) => e.source_output_spec_key)).toMatchObject({ source_output_spec_key: "out-1", target_input_spec_key: "in-1" });
  });

  it("완제품 지정이 없는 응답은 null로 되돌려 보낸다(없던 값을 만들지 않는다)", () => {
    const doc = toGraphView({ process_version_id: "v", row_version: 1, nodes: [], edges: [], completion_node_id: null, issues: [] }).doc;
    expect(toGraphIn(doc)).toEqual({ nodes: [], edges: [], completion_node_id: null });
  });

  it("단계 이름·내용을 고쳐도 같은 단계의 material_specs와 다른 단계·간선·완제품 지정은 그대로다", () => {
    const doc = view().doc;
    const a = byLabel(doc, "가닥 A");
    const edited = updateStep(doc, a.id, (s) => ({ ...s, operation_type: "inspection" }));
    const body = toGraphIn(edited);
    const after = body.nodes.find((x) => x.id === a.id)!;
    expect(after.step!.operation_type).toBe("inspection");
    expect(after.step!.material_specs).toEqual(a.step!.material_specs);
    expect(body.edges).toEqual(server.edges);
    expect(body.completion_node_id).toBe(server.completion_node_id);
    expect(stepOf(after).material_specs).toHaveLength(1);
  });

  it("노드·간선을 추가해도 기존 항목과 완제품 지정은 그대로다", () => {
    const doc = view().doc;
    const added = addNode(doc, "buffer", "새 대기", newId);
    const edge = addEdge(added.doc, byLabel(doc, "가닥 B").id, added.id, "material", newId);
    const body = toGraphIn(edge.doc);
    expect(body.completion_node_id).toBe(server.completion_node_id);
    for (const e of server.edges) expect(body.edges!.find((x) => x.id === e.id)).toEqual(e);
    expect(body.edges!.find((x) => x.id === edge.id)).not.toHaveProperty("source_output_spec_key"); // 새 간선은 연결 없이 시작
  });

  it("완제품으로 지정한 노드를 지우면 지정도 함께 푼다(없는 노드를 가리키지 않는다). 다른 노드를 지우면 지정은 유지된다", () => {
    const doc = view().doc;
    const milestone = byLabel(doc, "완제품 판정");
    expect(removeNode(doc, milestone.id).completion_node_id).toBeNull();
    expect(removeNode(doc, byLabel(doc, "가닥 A").id).completion_node_id).toBe(milestone.id);
  });

  it("간선의 끝점을 바꾸면 낡은 spec 연결을 풀고, 선후 관계로 바꾸면 둘 다 푼다(VAL-SPEC-004)", () => {
    const doc = view().doc;
    const linked = doc.edges.find((e) => e.source_output_spec_key)!;
    const other = byLabel(doc, "완제품 판정").id;
    const toChanged = patchEdge(doc, linked.id, { to_node_id: other }).edges.find((e) => e.id === linked.id)!;
    expect(toChanged).toMatchObject({ target_input_spec_key: null, source_output_spec_key: "out-1" }); // 시작 단계는 그대로라 출력 연결은 유지
    const fromChanged = patchEdge(doc, linked.id, { from_node_id: other }).edges.find((e) => e.id === linked.id)!;
    expect(fromChanged).toMatchObject({ source_output_spec_key: null, target_input_spec_key: "in-1" });
    const prec = patchEdge(doc, linked.id, { edge_kind: "precedence" }).edges.find((e) => e.id === linked.id)!;
    expect(prec).toMatchObject({ source_output_spec_key: null, target_input_spec_key: null });
    // 연결과 무관한 수정(이동 규칙)은 연결을 건드리지 않는다
    const moved = patchEdge(doc, linked.id, { movement_rule: { mode: "direct_feed", duration_min: { mode: "unknown" } } }).edges.find((e) => e.id === linked.id)!;
    expect(moved).toMatchObject({ source_output_spec_key: "out-1", target_input_spec_key: "in-1" });
  });

  it("직선 편집 연산(buildLinear 경유)도 문서의 다른 최상위 필드를 보존한다", () => {
    const linear: GraphDoc = {
      nodes: seedProcesses().graphs[processVersionId(2)]!.nodes,
      edges: seedProcesses().graphs[processVersionId(2)]!.edges,
      completion_node_id: null,
    };
    expect(addStep(linear, newId)!.doc).toHaveProperty("completion_node_id", null);
    expect(removeStep(linear, linear.nodes[1]!.id, newId)).toHaveProperty("completion_node_id", null);
    expect(moveStep(linear, linear.nodes[1]!.id, 1, newId)).toHaveProperty("completion_node_id", null);
    expect(setNextLocation(linear, linear.nodes[1]!.id, { kind: "none" }, newId)).toHaveProperty("completion_node_id", null);
    const withCompletion: GraphDoc = { ...linear, completion_node_id: linear.nodes[4]!.id };
    expect(moveStep(withCompletion, linear.nodes[1]!.id, 1, newId)!.completion_node_id).toBe(linear.nodes[4]!.id);
  });

  it("완제품 지정만 바뀌어도 변경으로 보고, 병합은 구조 변경으로 다룬다", () => {
    const doc = view().doc;
    const changed: GraphDoc = { ...doc, completion_node_id: null };
    expect(docChanged(doc, changed)).toBe(true);
    const draft = (d: GraphDoc): ProcessDraft => ({ doc: d, raw: toUnitSpecEdit(undefined), finished: toUnitSpecEdit(undefined) });
    // 내가 지정을 바꿨고 서버 그래프는 그대로면 내 문서를 따른다
    expect(mergeProcessDraft(draft(doc), draft(changed), draft(doc))!.draft.doc.completion_node_id).toBeNull();
    // 서버가 지정을 바꿨고 내가 단계 이름을 바꿨다면 구조가 겹쳐 자동 병합하지 않는다
    const renamed = updateStep(doc, byLabel(doc, "가닥 A").id, (s) => ({ ...s, operation_type: "x" }));
    expect(mergeProcessDraft(draft(doc), draft(renamed), draft(changed))).toBeNull();
    // 내용만 겹쳐 병합하면 서버의 완제품 지정을 그대로 가져간다
    const m = mergeProcessDraft(draft(doc), draft(renamed), draft(doc))!;
    expect(m.draft.doc.completion_node_id).toBe(server.completion_node_id);
  });
});
