// T8: 프런트엔드 공정 그래프 저장이 0.6.0 필드를 보존하는가. 실제 서버·실제 DB 대상.
// 기준 공정: DEMO-WIRE P05(단계 재료 spec·간선 spec 연결·완제품 지정 포함)를 새 제품·새 초안에 새 id로 복사해 사용한다.
// 시드 공정은 수정하지 않는다. 판정 기준과 알려진 제한은 docs/collaboration/INTEGRATION_BOARD.md 참고.
import { toGraphIn } from "../../../frontend/src/features/processes/processDraft";
import { toGraphView } from "../../../frontend/src/features/processes/processView";
import { PROJECT_WIRE, RUN, clientAs } from "./live";

/* eslint-disable @typescript-eslint/no-explicit-any */
const admin = clientAs("admin");
const base = `/projects/${PROJECT_WIRE}`;

let versionId = "";
let original: any; // 0.6.0을 아는 호출자가 저장한 직후의 서버 그래프
let afterFe: any; // 프런트엔드 저장 경로를 거친 뒤의 서버 그래프

const byKey = (items: any[], key: string) => Object.fromEntries(items.map((x) => [x[key], x]));
const nodeKeyOf = (g: any, id: string | null) => (id ? g.nodes.find((n: any) => n.id === id)?.node_key ?? null : null);

beforeAll(async () => {
  // 1) 기준 그래프(P05)를 읽는다.
  const products = (await admin.get<any>(`${base}/products`, { query: { q: "P05" } })).body.data;
  const p05 = products.find((p: any) => p.code === "P05");
  const srcVersion = p05.latest_process_version.id;
  const src = (await admin.get<any>(`${base}/process-versions/${srcVersion}/graph`)).body.data;

  // 2) 새 제품·새 초안을 만들고, 같은 구조를 새 id로 저장한다(0.6.0 필드 포함, 서버 응답 모양 그대로).
  const product = (await admin.post<any>(`${base}/products`, { body: { code: `INT${RUN}-T8`, name: "[INT] T8 그래프 왕복" } })).body.data;
  const draft = await admin.post<any>(`${base}/products/${product.id}/process-versions`);
  versionId = draft.body.data.id;
  const ids = new Map<string, string>();
  const fresh = (old: string) => (ids.has(old) ? ids.get(old)! : (ids.set(old, crypto.randomUUID()), ids.get(old)!));
  const body = {
    nodes: src.nodes.map((n: any) => ({ ...n, id: fresh(n.id) })),
    edges: src.edges.map((e: any) => ({ ...e, id: fresh(e.id), from_node_id: fresh(e.from_node_id), to_node_id: fresh(e.to_node_id) })),
    completion_node_id: src.completion_node_id ? fresh(src.completion_node_id) : null,
  };
  const put = await admin.put<any>(`${base}/process-versions/${versionId}/graph`, { body, ifMatch: draft.version! });
  original = put.body.data;

  // 3) 프런트엔드가 실제로 하는 저장: 응답 → toGraphView → (편집 없음) → toGraphIn → PUT.
  const loaded = (await admin.get<any>(`${base}/process-versions/${versionId}/graph`)).body.data;
  const view = toGraphView(loaded);
  const res = await admin.put<any>(`${base}/process-versions/${versionId}/graph`, { body: toGraphIn(view.doc), ifMatch: view.rowVersion });
  expect(res.status).toBe(200);
  afterFe = (await admin.get<any>(`${base}/process-versions/${versionId}/graph`)).body.data;
});

describe("T8 전제: 기준 그래프가 0.6.0 필드를 실제로 가지고 있다", () => {
  it("단계 재료 spec·간선 spec 연결·완제품 지정이 모두 존재한다", () => {
    const specs = original.nodes.flatMap((n: any) => n.step?.material_specs ?? []);
    expect(specs.length).toBeGreaterThan(0);
    expect(original.edges.some((e: any) => e.source_output_spec_key || e.target_input_spec_key)).toBe(true);
    expect(original.completion_node_id).toBeTruthy();
  });
});

describe("T8 프런트엔드 저장 후 재조회(편집 없음, 프런트엔드 저장 경로 그대로)", () => {
  it("노드·간선 구조와 단계 규칙(노드 단위)이 보존된다", () => {
    expect(afterFe.nodes.length).toBe(original.nodes.length);
    expect(afterFe.edges.length).toBe(original.edges.length);
    const b = byKey(original.nodes, "node_key");
    const a = byKey(afterFe.nodes, "node_key");
    for (const k of Object.keys(b)) expect({ k, step: { ...a[k].step, material_specs: undefined } }).toEqual({ k, step: { ...b[k].step, material_specs: undefined } });
  });

  it("단계 재료 spec(material_specs)이 보존된다", () => {
    const b = byKey(original.nodes, "node_key");
    const a = byKey(afterFe.nodes, "node_key");
    for (const k of Object.keys(b)) expect({ k, specs: a[k].step?.material_specs ?? null }).toEqual({ k, specs: b[k].step?.material_specs ?? null });
  });

  it("간선 spec 연결(source_output_spec_key·target_input_spec_key)이 보존된다", () => {
    const pick = (g: any) => Object.fromEntries(g.edges.map((e: any) => [e.edge_key, [e.source_output_spec_key, e.target_input_spec_key]]));
    expect(pick(afterFe)).toEqual(pick(original));
  });

  // KL-001(알려진 제한, 0043d1b)은 e382749(FE-04a, 클라이언트 0.6.0)에서 해소되어 일반 회귀 테스트로 승격했다.
  it("완제품 지정(completion_node_id)이 보존된다", () => {
    expect(nodeKeyOf(afterFe, afterFe.completion_node_id)).toBe(nodeKeyOf(original, original.completion_node_id));
  });
});
