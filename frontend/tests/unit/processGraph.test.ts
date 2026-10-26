import {
  addEdge,
  addNode,
  connectedEdges,
  hasEdge,
  movementOf,
  moveNodeOrder,
  patchEdge,
  patchNode,
  removeEdge,
  removeNode,
  type GraphDoc,
} from "../../src/features/processes/processDoc";
import { BOX, edgeProblem, layoutGraph, validateGraphStructure } from "../../src/features/processes/processGraph";
import { processVersionId, seedProcesses } from "../fakeProcess";

const seed = seedProcesses();
const branching = (): GraphDoc => structuredClone(seed.graphs[processVersionId(4)]!); // src → A,B → join → sink
const linear = (): GraphDoc => structuredClone(seed.graphs[processVersionId(2)]!);
let n = 0;
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const byLabel = (d: GraphDoc, label: string) => d.nodes.find((x) => x.label === label)!;

describe("노드 추가·수정·삭제", () => {
  it("노드를 추가하면 맨 끝 순서와 고유한 키를 받고 연결은 만들지 않는다", () => {
    const doc = branching();
    const r = addNode(doc, "buffer", "새 대기", newId);
    const node = r.doc.nodes.find((x) => x.id === r.id)!;
    expect(node).toMatchObject({ kind: "buffer", label: "새 대기", asset_id: null, step: null });
    expect(node.display_order).toBe(Math.max(...doc.nodes.map((x) => x.display_order ?? 0)) + 1);
    expect(node.node_key).toMatch(/^buf-/);
    expect(new Set(r.doc.nodes.map((x) => x.node_key)).size).toBe(r.doc.nodes.length);
    expect(r.doc.edges).toEqual(doc.edges);
  });

  it("작업 노드는 모두 미정인 단계로 시작하고 다른 종류는 단계가 없다", () => {
    const op = addNode({ nodes: [], edges: [] }, "operation", "검사", newId);
    expect(op.doc.nodes[0]!.step!.timing_rule!.processing).toEqual({ kind: "unknown" });
    expect(op.doc.nodes[0]!.step!.resources).toEqual([]);
    for (const kind of ["source", "join", "milestone", "sink"] as const) expect(addNode(op.doc, kind, "x", newId).doc.nodes.at(-1)!.step).toBeNull();
  });

  it("키가 겹치면 번호를 붙여 고유하게 만든다", () => {
    const id = "00000000-0000-4000-8000-0000000000aa";
    const first = addNode({ nodes: [], edges: [] }, "join", "a", () => id);
    const second = addNode(first.doc, "join", "b", () => id.replace(/a$/, "b").replace(/^0{8}/, "00000000"));
    expect(new Set(second.doc.nodes.map((x) => x.node_key)).size).toBe(2);
  });

  it("이름은 바꿀 수 있고 공간은 시작·대기·끝 노드에만 지정한다(작업·합류에는 무시)", () => {
    const doc = branching();
    const join = byLabel(doc, "합류");
    const sink = byLabel(doc, "완제품");
    const renamed = patchNode(doc, join.id, { label: "새 합류", asset_id: "a-1" });
    expect(renamed.nodes.find((x) => x.id === join.id)).toMatchObject({ label: "새 합류", asset_id: null }); // 합류에는 공간이 붙지 않는다
    const placed = patchNode(doc, sink.id, { asset_id: "a-1" });
    expect(placed.nodes.find((x) => x.id === sink.id)!.asset_id).toBe("a-1");
    expect(patchNode(placed, sink.id, { asset_id: null }).nodes.find((x) => x.id === sink.id)!.asset_id).toBeNull();
    // 종류·키는 바뀌지 않는다
    expect(renamed.nodes.find((x) => x.id === join.id)).toMatchObject({ kind: "join", node_key: join.node_key });
  });

  it("노드를 지우면 연결된 간선만 함께 지우고 앞뒤를 자동으로 잇지 않는다", () => {
    const doc = branching();
    const join = byLabel(doc, "합류");
    const touching = connectedEdges(doc, join.id);
    expect(touching).toHaveLength(3);
    const next = removeNode(doc, join.id);
    expect(next.nodes.some((x) => x.id === join.id)).toBe(false);
    expect(next.edges).toHaveLength(doc.edges.length - 3);
    expect(next.edges.every((e) => e.from_node_id !== join.id && e.to_node_id !== join.id)).toBe(true);
    // 가닥 A·B와 완제품 사이에 새 간선을 만들지 않는다
    expect(next.edges.every((e) => doc.edges.some((o) => o.id === e.id))).toBe(true);
  });

  it("표시 순서를 이웃과 바꾸고 순서는 0부터 빈틈없이 다시 매긴다", () => {
    const doc = branching();
    const a = byLabel(doc, "가닥 A");
    const moved = moveNodeOrder(doc, a.id, 1);
    expect(moved.nodes.map((x) => x.display_order).sort()).toEqual([0, 1, 2, 3, 4]);
    expect(moved.nodes.find((x) => x.id === a.id)!.display_order).toBe(2);
    expect(moveNodeOrder(doc, byLabel(doc, "원자재").id, -1)).toEqual(doc); // 맨 앞은 위로 못 간다
  });
});

describe("간선 추가·수정·삭제", () => {
  it("간선을 추가하면 새 id·키를 받고 이동 규칙은 보내지 않는다(서버 기본 미정)", () => {
    const doc = linear();
    const [src, sink] = [doc.nodes[0]!, doc.nodes[4]!];
    const r = addEdge(doc, src.id, sink.id, "precedence", newId);
    const edge = r.doc.edges.find((e) => e.id === r.id)!;
    expect(edge).toMatchObject({ from_node_id: src.id, to_node_id: sink.id, edge_kind: "precedence" });
    expect(edge.edge_key).toMatch(/^e-/);
    expect("movement_rule" in edge).toBe(false);
    expect(movementOf(edge)).toEqual({ mode: "unknown", duration_min: { mode: "unknown" } });
    expect(hasEdge(r.doc, src.id, sink.id, "precedence")).toBe(true);
    expect(hasEdge(r.doc, src.id, sink.id, "material")).toBe(false);
  });

  it("간선을 수정·삭제해도 다른 간선은 그대로다", () => {
    const doc = branching();
    const e = doc.edges[2]!;
    const patched = patchEdge(doc, e.id, { edge_kind: "supply", movement_rule: { mode: "direct_feed", duration_min: { mode: "unknown" } } });
    expect(patched.edges[2]).toMatchObject({ edge_kind: "supply", movement_rule: { mode: "direct_feed" } });
    expect(patched.edges.filter((x) => x.id !== e.id)).toEqual(doc.edges.filter((x) => x.id !== e.id));
    // 직결 공급도 이동 시간을 0으로 가정하지 않는다
    expect(movementOf(patched.edges[2]!).duration_min).toEqual({ mode: "unknown" });
    expect(removeEdge(patched, e.id).edges).toHaveLength(doc.edges.length - 1);
  });

  it("추가 전 문제: 같은 노드·끝에서 나가는 물류·시작으로 들어오는 물류·중복은 막고 순환은 막지 않는다", () => {
    const doc = branching();
    const [src, a, join, sink] = [byLabel(doc, "원자재"), byLabel(doc, "가닥 A"), byLabel(doc, "합류"), byLabel(doc, "완제품")];
    expect(edgeProblem(doc, a.id, a.id, "material")).toMatch(/같은 노드/);
    expect(edgeProblem(doc, sink.id, a.id, "material")).toMatch(/끝\(완제품\)/);
    expect(edgeProblem(doc, a.id, src.id, "material")).toMatch(/시작\(원자재\)/);
    expect(edgeProblem(doc, sink.id, a.id, "precedence")).toBeNull(); // 물류가 아닌 간선은 허용
    expect(edgeProblem(doc, a.id, join.id, "material")).toMatch(/이미 있습니다/);
    expect(edgeProblem(doc, join.id, a.id, "material")).toBeNull(); // 되돌아가는 연결(재작업)은 막지 않는다
    expect(edgeProblem(doc, "", a.id, "material")).toMatch(/모두 고르세요/);
    // 수정 중인 간선 자신은 중복으로 보지 않는다
    const own = doc.edges.find((e) => e.from_node_id === a.id && e.to_node_id === join.id)!;
    expect(edgeProblem(doc, a.id, join.id, "material", own.id)).toBeNull();
  });
});

describe("구조 검증(클라이언트 미리 검사)", () => {
  it("올바른 그래프는 문제가 없다", () => {
    expect(validateGraphStructure(branching())).toEqual([]);
    expect(validateGraphStructure({ nodes: [], edges: [] })).toEqual([]);
  });

  it("빈 이름(작업 노드 제외)·키 중복·자기 간선·끝에서 나가는 물류·시작으로 들어오는 물류를 오류로 알린다", () => {
    const doc = branching();
    const join = byLabel(doc, "합류");
    const sink = byLabel(doc, "완제품");
    const src = byLabel(doc, "원자재");
    const a = byLabel(doc, "가닥 A");
    const bad: GraphDoc = {
      nodes: doc.nodes.map((x) => (x.id === join.id ? { ...x, label: " " } : x.id === a.id ? { ...x, node_key: src.node_key, label: "" } : x)),
      edges: [
        ...doc.edges,
        { ...doc.edges[0]!, id: "e-self", edge_key: "self", from_node_id: a.id, to_node_id: a.id },
        { ...doc.edges[0]!, id: "e-out", edge_key: "out", from_node_id: sink.id, to_node_id: a.id },
        { ...doc.edges[0]!, id: "e-in", edge_key: "in", from_node_id: a.id, to_node_id: src.id },
        { ...doc.edges[0]!, id: "e-ok", edge_key: "ok", from_node_id: sink.id, to_node_id: a.id, edge_kind: "precedence" },
      ],
    };
    const issues = validateGraphStructure(bad);
    const at = (id: string) => issues.filter((i) => i.entity_id === id).map((i) => i.field_path);
    expect(at(join.id)).toEqual(["/label"]); // 합류의 빈 이름
    expect(at(a.id)).toEqual(["/node_key"]); // 작업 노드의 빈 이름은 단계 검증이 알린다(중복 방지), 키 중복은 여기서
    expect(at("e-self")).toEqual(["/to_node_id"]);
    expect(at("e-out")).toEqual(["/from_node_id"]);
    expect(at("e-in")).toEqual(["/to_node_id"]);
    expect(at("e-ok")).toEqual([]); // 선후 관계는 끝에서 나가도 된다
    expect(issues.every((i) => i.severity === "error")).toBe(true);
  });

  it("이동 시간은 0이 유효하고 형식이 틀리면 오류다", () => {
    const doc = branching();
    const e = doc.edges[0]!;
    const withDuration = (value: string): GraphDoc => ({
      ...doc,
      edges: doc.edges.map((x) => (x.id === e.id ? { ...x, movement_rule: { mode: "manual_duration", duration_min: { mode: "known", value } } } : x)),
    });
    expect(validateGraphStructure(withDuration("0"))).toEqual([]);
    expect(validateGraphStructure(withDuration("1.5"))).toEqual([]);
    expect(validateGraphStructure(withDuration("-1"))[0]).toMatchObject({ entity_id: e.id, field_path: "/movement_rule/duration_min/value" });
  });

  it("그래프에 없는 노드를 가리키는 간선은 오류다", () => {
    const doc = branching();
    const bad: GraphDoc = { ...doc, edges: [...doc.edges, { ...doc.edges[0]!, id: "dangling", edge_key: "d", to_node_id: "00000000-0000-4000-8000-0000000000ff" }] };
    expect(validateGraphStructure(bad).find((i) => i.entity_id === "dangling")).toMatchObject({ field_path: "/to_node_id" });
  });
});

describe("도식 배치", () => {
  it("왼쪽에서 오른쪽으로 층을 나누고 같은 층의 노드는 아래로 쌓는다", () => {
    const doc = branching();
    const layout = layoutGraph(doc);
    const box = (label: string) => layout.boxes.get(byLabel(doc, label).id)!;
    expect(box("원자재").layer).toBe(0);
    expect(box("가닥 A").layer).toBe(1);
    expect(box("가닥 B").layer).toBe(1);
    expect(box("합류").layer).toBe(2);
    expect(box("완제품").layer).toBe(3);
    expect(box("가닥 A").row).not.toBe(box("가닥 B").row);
    expect(box("가닥 B").y).toBeGreaterThan(box("가닥 A").y);
    expect(layout.backEdges.size).toBe(0);
    expect(layout.width).toBe(BOX.pad * 2 + 4 * BOX.w + 3 * BOX.gapX);
    // 겹치는 상자가 없다
    const pos = [...layout.boxes.values()].map((b) => `${b.x},${b.y}`);
    expect(new Set(pos).size).toBe(pos.length);
  });

  it("순환(재작업)은 되돌림 간선으로 표시하고 층은 앞으로만 나눈다", () => {
    const doc = linear();
    const [, op1, , op2] = doc.nodes;
    const back = addEdge(doc, op2!.id, op1!.id, "material", newId);
    const layout = layoutGraph(back.doc);
    expect([...layout.backEdges]).toEqual([back.id]);
    expect(layout.boxes.get(op2!.id)!.layer).toBeGreaterThan(layout.boxes.get(op1!.id)!.layer);
  });

  it("빈 그래프·간선만 있는 고립 노드·끊어진 간선도 배치가 깨지지 않는다", () => {
    expect(layoutGraph({ nodes: [], edges: [] }).boxes.size).toBe(0);
    const doc = addNode({ nodes: [], edges: [] }, "operation", "혼자", newId).doc;
    const layout = layoutGraph({ ...doc, edges: [{ id: "x", edge_key: "x", from_node_id: doc.nodes[0]!.id, to_node_id: "없는-노드", edge_kind: "material" }] });
    expect(layout.boxes.size).toBe(1);
    expect(layout.width).toBeGreaterThan(0);
  });
});
