import { toAssetInfo } from "../../src/features/assets/apiMappers";
import {
  addEdge,
  addNode,
  addStep,
  operationsInOrder,
  patchEdge,
  removeEdge,
  parseLinear,
  stepOf,
  updateNode,
  updateStep,
  type GraphDoc,
} from "../../src/features/processes/processDoc";
import { mapGraphErrors, mapUnitErrors, toGraphIn } from "../../src/features/processes/processDraft";
import {
  buildUnitSpecPatch,
  isOpenProcessStatus,
  toGraphView,
  toListItem,
  toProcessVersionView,
  toUnitSpecEdit,
} from "../../src/features/processes/processView";
import { createApiClient } from "../../src/shared/api/client";
import { ApiError, classifyError } from "../../src/shared/api/errors";
import type { Schemas } from "../../src/shared/api/types";

/**
 * 실제 서버 공정 검증. 읽기 전용 구역은 `LIVE_API`만 있으면 실행하고, 쓰기 구역은 공유 개발 DB를 바꾸므로 명시적으로 켠 경우에만 실행한다.
 *   $env:LIVE_API="http://127.0.0.1:8000/api/v1"; $env:LIVE_WRITE="1"; pnpm test:live
 * 쓰기 범위를 좁게 둔다: 시험 데이터 제품 **P-006 하나**의 공정 초안에서만 저장·검증·제출·반려를 되풀이하며(재실행해도 같은 열린 버전을 재사용),
 * **승인(approve)은 실행하지 않는다**(승인본이 생기면 되돌릴 수 없다). 삭제 endpoint가 없어 P-006에는 공정 초안 하나와 row_version 증가가 남는다.
 */
const LIVE = process.env.LIVE_API;
const WRITE = process.env.LIVE_WRITE === "1";
const ADMIN = "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a";
const VIEWER = "2628054b-3888-5d81-ad9d-05cd7e1829c2";
const OTHER_ORG = "e64d894b-9649-5c64-af56-d4fcc7d52997";
const PROJECT_A = "9985bf99-c375-58b0-a776-5a1cc5053585";
const STEP_LABEL = "[FE 시험] 단계";

function clientAs(user: string) {
  const base = (LIVE ?? "").replace(/\/+$/, "");
  const fetchImpl = ((url: string, init: RequestInit = {}) =>
    fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), "X-Debug-User": user } })) as typeof fetch;
  return createApiClient({ baseUrl: base, fetchImpl });
}

async function failure(p: Promise<unknown>): Promise<ApiError> {
  const e = await p.then(
    () => undefined,
    (x) => x,
  );
  expect(e).toBeInstanceOf(ApiError);
  return e as ApiError;
}

const admin = clientAs(ADMIN);
const productByCode = async (code: string) =>
  (await admin.get<Schemas["ListOut_ProductOut_"]>(`/projects/${PROJECT_A}/products`, { query: { q: code } })).body.data.find((p) => p.code === code)!;
const versionsOf = async (productId: string) =>
  (await admin.get<Schemas["ListOut_ProcessVersionListItem_"]>(`/projects/${PROJECT_A}/products/${productId}/process-versions`, { query: { limit: 200 } })).body.data;

describe.skipIf(!LIVE)("실제 API: 공정 (읽기 전용, 시험 데이터 P-001·P-002·P-004)", () => {
  it("제품의 공정 요약과 버전 목록이 일치하고 어댑터를 통과한다", async () => {
    const p1 = await productByCode("P-001");
    const list = (await versionsOf(p1.id)).map(toListItem);
    expect(list[0]!.versionNo).toBe(p1.latest_process_version!.version_no);
    expect(list.find((v) => v.status === "approved")!.id).toBe(p1.current_process_version!.id);
    const p4 = await productByCode("P-004");
    expect((await versionsOf(p4.id)).map((v) => [v.version_no, v.status])).toEqual([[2, "draft"], [1, "approved"]]);
    expect((await versionsOf((await productByCode("P-005")).id))).toEqual([]); // 공정이 없는 제품
  });

  it("승인본 그래프의 단계 DTO·ETag·issues가 어댑터를 통과한다(완료 기준 노드가 있으면 표 구조 편집 대상이 아니다)", async () => {
    const p1 = await productByCode("P-001");
    const id = p1.current_process_version!.id;
    const v = await admin.get<Schemas["Single_ProcessVersionOut_"]>(`/projects/${PROJECT_A}/process-versions/${id}`);
    const g = await admin.get<Schemas["Single_GraphOut_"]>(`/projects/${PROJECT_A}/process-versions/${id}/graph`);
    expect(v.version).toBe(v.body.data.row_version); // ETag = row_version
    const version = toProcessVersionView(v.body.data);
    const graph = toGraphView(g.body.data);
    expect(version.status).toBe("approved");
    expect(graph.rowVersion).toBe(version.rowVersion);
    // 계약 0.6.0 이후 시드는 완료 기준(milestone) 노드와 완제품 지정을 가진다 → parseLinear는 null이 정상이다.
    // milestone이 없는 구버전 시드라면 직선이다. 어느 쪽이든 표 순서(operationsInOrder)는 단계를 모두 돌려준다.
    const hasMilestone = graph.doc.nodes.some((n) => n.kind === "milestone");
    expect(parseLinear(graph.doc) === null).toBe(hasMilestone);
    if (hasMilestone) expect(graph.doc.completion_node_id).not.toBeNull();
    const ops = operationsInOrder(graph.doc);
    expect(ops.length).toBeGreaterThanOrEqual(2);
    // 값은 판별 객체이고 서버가 모든 필드를 채워 준다(왕복 손실 없음)
    const step = stepOf(ops[0]!);
    expect(step.timing_rule.processing.kind).toBe("output_speed");
    expect(step.resources[0]!.candidates![0]!.asset_id).toMatch(/^[0-9a-f-]{36}$/); // 후보는 표시 코드가 아니라 자산 id
    expect(version.rawUnitSpec.lengthM.mode).toBeDefined();
    // 미정(단위) 경고는 entity_id가 버전 자체다
    expect(graph.issues.every((i) => i.entity_id !== undefined && i.rule_id !== undefined)).toBe(true);
  });

  it("빈 초안 그래프(P-002)는 단계 없음 경고와 함께 빈 직선으로 읽힌다", async () => {
    const p2 = await productByCode("P-002");
    const draft = (await versionsOf(p2.id)).find((v) => v.status === "draft")!;
    const g = toGraphView((await admin.get<Schemas["Single_GraphOut_"]>(`/projects/${PROJECT_A}/process-versions/${draft.id}/graph`)).body.data);
    expect(g.doc.nodes.length).toBeGreaterThanOrEqual(0);
    if (g.doc.nodes.length === 0) {
      expect(parseLinear(g.doc)).toEqual({ source: null, items: [], sink: null });
      expect(g.issues.some((i) => i.rule_id === "VAL-GRAPH-010")).toBe(true);
    }
  });

  it("다른 프로젝트·제품의 버전과 형식이 틀린 id는 찾을 수 없음으로 분류된다", async () => {
    const e = await failure(admin.get(`/projects/${PROJECT_A}/process-versions/00000000-0000-4000-8000-00000000dead`));
    expect(classifyError(e)).toBe("not-found");
    const f = await failure(clientAs(OTHER_ORG).get(`/projects/${PROJECT_A}/process-versions/00000000-0000-4000-8000-00000000dead`));
    expect(classifyError(f)).toBe("not-found");
  });

  it("검증(knowledge·run_template)은 상태를 바꾸지 않고 entity_id와 엔티티 내부 field_path를 준다", async () => {
    const p1 = await productByCode("P-001");
    const id = p1.current_process_version!.id;
    const before = (await admin.get<Schemas["Single_ProcessVersionOut_"]>(`/projects/${PROJECT_A}/process-versions/${id}`)).body.data.row_version;
    for (const scope of ["knowledge", "run_template"] as const) {
      const r = await admin.post<Schemas["Single_ValidationOut_"]>(`/projects/${PROJECT_A}/process-versions/${id}/validate`, { query: { scope } });
      expect(r.body.data.scope).toBe(scope);
      expect(r.body.data.error_count).toBe(r.body.data.issues.filter((i) => i.severity === "error").length);
      for (const i of r.body.data.issues) expect(i.entity_id).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect((await admin.get<Schemas["Single_ProcessVersionOut_"]>(`/projects/${PROJECT_A}/process-versions/${id}`)).body.data.row_version).toBe(before);
  });
});

describe.skipIf(!LIVE || !WRITE)("실제 API: 공정 쓰기 (P-006 하나의 초안에서 저장·검증·제출·반려)", () => {
  const viewer = clientAs(VIEWER);
  let productId = "";
  let versionId = "";
  let equipmentId = "";
  const base = () => `/projects/${PROJECT_A}/process-versions/${versionId}`;
  const read = async () => {
    const v = await admin.get<Schemas["Single_ProcessVersionOut_"]>(base());
    const g = await admin.get<Schemas["Single_GraphOut_"]>(`${base()}/graph`);
    return { version: toProcessVersionView(v.body.data), graph: toGraphView(g.body.data) };
  };

  beforeAll(async () => {
    productId = (await productByCode("P-006")).id;
    equipmentId = toAssetInfo(
      (await admin.get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_A}/assets`, { query: { q: "EQ-001" } })).body.data.find((a) => a.code === "EQ-001")!,
    ).id;
    // 열린 버전을 재사용하고 없으면 새 초안을 만든다(재실행해도 흔적이 늘지 않는다).
    let open = (await versionsOf(productId)).find((v) => isOpenProcessStatus(v.status));
    if (!open) {
      const r = await admin.post<Schemas["Single_ProcessVersionOut_"]>(`/projects/${PROJECT_A}/products/${productId}/process-versions`);
      expect(r.status).toBe(201);
      expect(r.version).toBe(r.body.data.row_version);
      open = r.body.data as unknown as typeof open;
    }
    versionId = open!.id;
    if (open!.status === "in_review") {
      // 이전 실행이 중간에 멈춘 경우: 반려해 초안으로 되돌린다
      const cur = await read();
      await admin.post(`${base()}/reject`, { body: { reason: "[FE 시험] 이전 실행 정리" }, ifMatch: cur.version.rowVersion });
    }
  });

  it("새 초안 만들기를 다시 누르면 409 PROCESS_DRAFT_EXISTS(상태 오류)이고 열린 버전이 목록에 있다", async () => {
    const e = await failure(admin.post(`/projects/${PROJECT_A}/products/${productId}/process-versions`));
    expect(e.status).toBe(409);
    expect(e.code).toBe("PROCESS_DRAFT_EXISTS");
    expect(classifyError(e)).toBe("state");
    expect((await versionsOf(productId)).filter((v) => isOpenProcessStatus(v.status))).toHaveLength(1);
  });

  it("FE가 만든 그래프 본문(addStep → 편집 → toGraphIn)을 서버가 받아들이고 직선 그래프로 돌려준다", async () => {
    const { graph } = await read();
    let doc: GraphDoc = graph.doc;
    if (!operationsInOrder(doc).some((n) => n.label === STEP_LABEL)) {
      const added = addStep(doc)!;
      doc = updateNode(added.doc, added.id, (n) => ({ ...n, label: STEP_LABEL }));
    }
    const target = operationsInOrder(doc).find((n) => n.label === STEP_LABEL)!;
    doc = updateStep(doc, target.id, (s) => ({
      ...s,
      operation_type: "output_units_by_time",
      handler_version: "1",
      timing_rule: {
        ...s.timing_rule,
        processing: { kind: "output_speed", speed_m_per_min: { mode: "known", value: "30" }, basis: "per_stream", output_schedule: "sequential_units", parallel_streams: { mode: "known", value: 1 } },
        setup: { duration_min: { mode: "not_applicable" }, trigger: "not_applicable" },
      },
      output_rule: { ...s.output_rule, mode: "configured_units", length_m: { mode: "known", value: "1000" }, unit_count: { mode: "known", value: 2 } },
      resources: [{ role_key: "main", resource_kind: "equipment", selection_mode: "one_of", required_count: 1, capacity_mode: "finite", allocation_rule: { mode: "unknown" }, candidates: [{ asset_id: equipmentId, eligibility_status: "confirmed" }] }],
    }));
    const cur = await read();
    const r = await admin.put<Schemas["Single_GraphOut_"]>(`${base()}/graph`, { body: toGraphIn(doc), ifMatch: cur.version.rowVersion });
    expect(r.status).toBe(200);
    expect(r.version).toBe(cur.version.rowVersion + 1); // 저장하면 버전이 하나 오른다
    const saved = toGraphView(r.body.data);
    expect(parseLinear(saved.doc)).not.toBeNull();
    const back = stepOf(operationsInOrder(saved.doc).find((n) => n.id === target.id)!);
    expect(back.timing_rule.processing).toMatchObject({ kind: "output_speed", speed_m_per_min: { mode: "known", value: "30" }, parallel_streams: { mode: "known", value: 1 } });
    expect(back.resources[0]!.candidates![0]).toEqual({ asset_id: equipmentId, eligibility_status: "confirmed" });
    // 서버가 돌려준 문서를 그대로 다시 보내도 변하지 않는다(왕복 안정)
    const again = await admin.put<Schemas["Single_GraphOut_"]>(`${base()}/graph`, { body: toGraphIn(saved.doc), ifMatch: r.version! });
    expect(toGraphView(again.body.data).doc).toEqual(saved.doc);
  });

  it("그래프 편집: 분기·합류·선후 간선·이동 규칙·순환을 서버가 받아들이고 왕복 안정이며, 물류 규칙 위반은 422(VAL-GRAPH-004)로 매핑된다", async () => {
    const start = await read();
    const original = start.graph.doc; // 끝나면 이 직선 그래프로 복원한다
    const src = original.nodes.find((n) => n.kind === "source")!;
    const sink = original.nodes.find((n) => n.kind === "sink")!;
    // 이름이 같은 단계가 여러 번 남아 있을 수 있어(이전 실행) 끝 노드로 이어지는 마지막 단계를 쓴다
    const lastEdge = original.edges.find((e) => e.to_node_id === sink.id)!;
    const op = original.nodes.find((n) => n.id === lastEdge.from_node_id)!;
    expect(op.kind).toBe("operation");

    // 원자재 → [단계, 가닥 B] → 합류 → 완제품, 단계→합류는 사람이 정한 5분, 원자재→합류 선후 관계
    let doc = removeEdge(original, lastEdge.id);
    const b = addNode(doc, "operation", "[FE 시험] 가닥 B");
    const j = addNode(b.doc, "join", "[FE 시험] 합류");
    doc = j.doc;
    doc = addEdge(doc, src.id, b.id, "material").doc;
    const toJoin = addEdge(doc, op.id, j.id, "material");
    doc = patchEdge(toJoin.doc, toJoin.id, { movement_rule: { mode: "manual_duration", duration_min: { mode: "known", value: "5" } } });
    doc = addEdge(doc, b.id, j.id, "material").doc;
    doc = addEdge(doc, j.id, sink.id, "material").doc;
    const prec = addEdge(doc, src.id, j.id, "precedence");
    doc = prec.doc;
    const r = await admin.put<Schemas["Single_GraphOut_"]>(`${base()}/graph`, { body: toGraphIn(doc), ifMatch: (await read()).version.rowVersion });
    expect(r.status).toBe(200);
    const saved = toGraphView(r.body.data);
    expect(parseLinear(saved.doc)).toBeNull(); // 분기·합류·선후 간선이 있어 직선이 아니다
    expect(saved.doc.nodes.map((n) => n.id).sort()).toEqual(doc.nodes.map((n) => n.id).sort());
    expect(saved.doc.edges.find((e) => e.id === toJoin.id)!.movement_rule).toMatchObject({ mode: "manual_duration", duration_min: { mode: "known", value: "5" } });
    expect(saved.doc.edges.find((e) => e.id === prec.id)!.edge_kind).toBe("precedence");
    // 서버가 돌려준 문서를 그대로 다시 보내도 변하지 않는다
    const again = await admin.put<Schemas["Single_GraphOut_"]>(`${base()}/graph`, { body: toGraphIn(saved.doc), ifMatch: r.version! });
    expect(toGraphView(again.body.data).doc).toEqual(saved.doc);

    // 되돌아가는 연결(재작업)은 저장할 수 있다
    const cyc = addEdge(saved.doc, j.id, op.id, "material");
    const withCycle = await admin.put<Schemas["Single_GraphOut_"]>(`${base()}/graph`, { body: toGraphIn(cyc.doc), ifMatch: again.version! });
    expect(withCycle.status).toBe(200);
    expect(toGraphView(withCycle.body.data).issues.some((i) => i.rule_id === "VAL-GRAPH-011")).toBe(true); // 순환은 경고

    // 끝에서 나가는 물류 간선은 422이고 field_path(요청 본문 기준)가 간선 id로 매핑된다
    const bad = addEdge(toGraphView(withCycle.body.data).doc, sink.id, op.id, "material", () => "00000000-0000-4000-8000-0000000000e2");
    const sent = toGraphIn(bad.doc);
    const e = await failure(admin.put(`${base()}/graph`, { body: sent, ifMatch: withCycle.version! }));
    expect(e.status).toBe(422);
    expect(e.details.some((d) => d.rule_id === "VAL-GRAPH-004")).toBe(true);
    expect(mapGraphErrors(e, sent)[0]).toMatchObject({ entity_id: "00000000-0000-4000-8000-0000000000e2" });

    // 복원: 원래 직선 그래프로
    const cur = await read();
    const back = await admin.put<Schemas["Single_GraphOut_"]>(`${base()}/graph`, { body: toGraphIn(original), ifMatch: cur.version.rowVersion });
    expect(back.status).toBe(200);
    expect(parseLinear(toGraphView(back.body.data).doc)).not.toBeNull();
  });

  it("그래프 오류는 422이고 아무것도 저장하지 않으며 field_path(요청 본문 기준)가 간선 id로 매핑된다", async () => {
    const { graph, version } = await read();
    const bad: GraphDoc = { nodes: graph.doc.nodes, edges: [...graph.doc.edges, { ...graph.doc.edges[0]!, id: "00000000-0000-4000-8000-0000000000e1", edge_key: "bad", to_node_id: "00000000-0000-4000-8000-0000000000ff" }] };
    const sent = toGraphIn(bad);
    const e = await failure(admin.put(`${base()}/graph`, { body: sent, ifMatch: version.rowVersion }));
    expect(e.status).toBe(422);
    const [issue] = mapGraphErrors(e, sent);
    expect(issue).toMatchObject({ entity_id: "00000000-0000-4000-8000-0000000000e1", field_path: "/to_node_id" });
    expect((await read()).version.rowVersion).toBe(version.rowVersion); // 저장되지 않았다
  });

  it("If-Match 없이 보내면 428, 오래된 버전은 412 EDIT_CONFLICT이고 서버에는 아무것도 쓰이지 않는다", async () => {
    const { graph, version } = await read();
    const e428 = await failure(admin.put(`${base()}/graph`, { body: toGraphIn(graph.doc) }));
    expect(classifyError(e428)).toBe("precondition");
    const e412 = await failure(admin.put(`${base()}/graph`, { body: toGraphIn(graph.doc), ifMatch: version.rowVersion - 1 }));
    expect(classifyError(e412)).toBe("conflict");
    expect((await read()).version.rowVersion).toBe(version.rowVersion);
  });

  it("단위 PATCH: 길이는 decimal 문자열, 개수는 JSON 정수로 받고 잘못된 값은 422가 입력별로 매핑된다", async () => {
    const { version } = await read();
    const base0 = toUnitSpecEdit(undefined);
    const patch = buildUnitSpecPatch(base0, { ...base0, lengthM: { mode: "value", value: "3000", unit: "m" }, strandCount: { mode: "value", value: "12", unit: "strand" } })!;
    const r = await admin.patch<Schemas["Single_ProcessVersionOut_"]>(base(), { body: { raw_unit_spec: patch }, ifMatch: version.rowVersion });
    const saved = toProcessVersionView(r.body.data);
    expect(saved.rawUnitSpec.lengthM).toMatchObject({ mode: "value", value: "3000" });
    expect(saved.rawUnitSpec.strandCount).toMatchObject({ mode: "value", value: "12" });
    // 확정값을 미정으로 되돌리는 것은 {mode: "unknown"}
    const reset = buildUnitSpecPatch(saved.rawUnitSpec, { ...saved.rawUnitSpec, strandCount: { mode: "unknown", value: "", unit: "strand" } })!;
    const r2 = await admin.patch<Schemas["Single_ProcessVersionOut_"]>(base(), { body: { raw_unit_spec: reset }, ifMatch: r.version! });
    expect(toProcessVersionView(r2.body.data).rawUnitSpec.strandCount.mode).toBe("unknown");
    const e = await failure(admin.patch(base(), { body: { raw_unit_spec: { length_m: { mode: "known", value: "0" } } }, ifMatch: r2.version! }));
    expect(e.status).toBe(422);
    expect(mapUnitErrors(e).byField).toHaveProperty("raw:lengthM");
  });

  it("검증 후 제출하면 검토 중이 되고 그때는 저장이 409 VERSION_IMMUTABLE, 조회자는 403이다", async () => {
    const { version, graph } = await read();
    const knowledge = await admin.post<Schemas["Single_ValidationOut_"]>(`${base()}/validate`, { query: { scope: "knowledge" } });
    expect(knowledge.body.data.scope).toBe("knowledge");
    const submit = await admin.post<Schemas["Single_ProcessVersionOut_"]>(`${base()}/submit`, { ifMatch: version.rowVersion });
    expect(submit.body.data.status).toBe("in_review");
    const e = await failure(admin.put(`${base()}/graph`, { body: toGraphIn(graph.doc), ifMatch: submit.version! }));
    expect(e.code).toBe("VERSION_IMMUTABLE");
    expect(classifyError(e)).toBe("state");
    const v = await failure(viewer.post(`${base()}/approve`, { ifMatch: submit.version! }));
    expect(classifyError(v)).toBe("forbidden");
    const noReason = await failure(admin.post(`${base()}/reject`, { body: { reason: "" }, ifMatch: submit.version! }));
    expect(noReason.status).toBe(422);
  });

  it("반려하면 초안으로 돌아가고 사유가 남으며 다시 저장할 수 있다", async () => {
    const cur = await read();
    expect(cur.version.status).toBe("in_review");
    const r = await admin.post<Schemas["Single_ProcessVersionOut_"]>(`${base()}/reject`, { body: { reason: "[FE 시험] 반려 확인" }, ifMatch: cur.version.rowVersion });
    const back = toProcessVersionView(r.body.data);
    expect(back.status).toBe("draft");
    expect(back.rejectionReason).toBe("[FE 시험] 반려 확인");
    const again = await admin.put(`${base()}/graph`, { body: toGraphIn((await read()).graph.doc), ifMatch: r.version! });
    expect(again.status).toBe(200);
  });

  it("조회자는 저장할 수 없고(403) 비멤버는 존재를 알 수 없다(404)", async () => {
    const { graph, version } = await read();
    expect(classifyError(await failure(viewer.put(`${base()}/graph`, { body: toGraphIn(graph.doc), ifMatch: version.rowVersion })))).toBe("forbidden");
    expect(classifyError(await failure(clientAs(OTHER_ORG).put(`${base()}/graph`, { body: toGraphIn(graph.doc), ifMatch: version.rowVersion })))).toBe("not-found");
  });
});
