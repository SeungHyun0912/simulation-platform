import { toAssetInfo } from "../../src/features/assets/apiMappers";
import { addStep, operationsInOrder, parseLinear, updateNode, updateStep } from "../../src/features/processes/processDoc";
import { toGraphIn } from "../../src/features/processes/processDraft";
import { toGraphView, toListItem, toProcessVersionView } from "../../src/features/processes/processView";
import { createApiClient } from "../../src/shared/api/client";
import { ApiError, classifyError } from "../../src/shared/api/errors";
import type { Schemas } from "../../src/shared/api/types";

/**
 * **되돌릴 수 없는** 승인(approve) 실서버 검증. `LIVE_APPROVE=1`일 때만 실행한다(사용자가 시험 제품 P-007로 명시적으로 허락).
 *   $env:LIVE_API="http://127.0.0.1:8000/api/v1"; $env:LIVE_APPROVE="1"; pnpm vitest run tests/live/live-process-approve.test.ts
 * 이미 P-007에 승인본이 있으면 새로 만들지 않고 건너뛴다(승인본이 계속 늘어나지 않게). 한 번 실행하면 P-007은
 * v1(대체됨)·v2(승인본)가 되며 삭제할 수 없다. 다른 제품은 건드리지 않는다.
 */
const LIVE = process.env.LIVE_API;
const APPROVE = process.env.LIVE_APPROVE === "1";
const ADMIN = "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a";
const EDITOR = "be97ba06-d557-541d-a215-60d98b14de06";
const VIEWER = "2628054b-3888-5d81-ad9d-05cd7e1829c2";
const PROJECT_A = "9985bf99-c375-58b0-a776-5a1cc5053585";

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

describe.skipIf(!LIVE || !APPROVE)("실제 API: 승인(approve)과 이전 승인본 대체 (P-007, 되돌릴 수 없음)", () => {
  const admin = clientAs(ADMIN);
  const base = (id: string) => `/projects/${PROJECT_A}/process-versions/${id}`;

  it("초안을 만들어 저장·제출·승인하고, 새 초안을 승인하면 이전 승인본이 대체됨이 된다", async () => {
    const [p7] = (await admin.get<Schemas["ListOut_ProductOut_"]>(`/projects/${PROJECT_A}/products`, { query: { q: "P-007" } })).body.data.filter((p) => p.code === "P-007");
    const versions = async () => (await admin.get<Schemas["ListOut_ProcessVersionListItem_"]>(`/projects/${PROJECT_A}/products/${p7!.id}/process-versions`, { query: { limit: 200 } })).body.data.map(toListItem);
    if ((await versions()).some((v) => v.status === "approved" || v.status === "superseded")) {
      console.info("P-007에는 이미 승인 이력이 있어 건너뜁니다.");
      return;
    }
    expect(await versions()).toEqual([]); // 열린 버전도 없는 시작 상태만 허용한다

    // 1) 새 초안 → FE가 만든 그래프(원자재 → 단계 → 완제품, 설비 후보 EQ-001) 저장
    const created = await admin.post<Schemas["Single_ProcessVersionOut_"]>(`/projects/${PROJECT_A}/products/${p7!.id}/process-versions`);
    expect(created.status).toBe(201);
    const v1 = created.body.data.id;
    const eq1 = toAssetInfo((await admin.get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_A}/assets`, { query: { q: "EQ-001" } })).body.data.find((a) => a.code === "EQ-001")!).id;
    const added = addStep({ nodes: [], edges: [] })!;
    let doc = updateNode(added.doc, added.id, (n) => ({ ...n, label: "[FE 시험] 승인 확인 단계" }));
    doc = updateStep(doc, added.id, (s) => ({
      ...s,
      operation_type: "output_units_by_time",
      handler_version: "1",
      timing_rule: {
        ...s.timing_rule,
        processing: { kind: "output_speed", speed_m_per_min: { mode: "known", value: "30" }, basis: "per_stream", output_schedule: "sequential_units", parallel_streams: { mode: "known", value: 1 } },
      },
      resources: [{ role_key: "main", resource_kind: "equipment", selection_mode: "one_of", required_count: 1, capacity_mode: "finite", allocation_rule: { mode: "unknown" }, candidates: [{ asset_id: eq1, eligibility_status: "confirmed" }] }],
    }));
    const put = await admin.put<Schemas["Single_GraphOut_"]>(`${base(v1)}/graph`, { body: toGraphIn(doc), ifMatch: created.version! });
    expect(put.status).toBe(200);

    // 2) 제출 전 knowledge 검증: 구조 오류가 없어야 한다(미정은 경고)
    const knowledge = await admin.post<Schemas["Single_ValidationOut_"]>(`${base(v1)}/validate`, { query: { scope: "knowledge" } });
    expect(knowledge.body.data.error_count).toBe(0);

    // 3) 제출 → 편집자·조회자는 승인할 수 없다(403) → 관리자 승인
    const submit = await admin.post<Schemas["Single_ProcessVersionOut_"]>(`${base(v1)}/submit`, { ifMatch: put.version! });
    expect(submit.body.data.status).toBe("in_review");
    expect(classifyError(await failure(clientAs(EDITOR).post(`${base(v1)}/approve`, { ifMatch: submit.version! })))).toBe("forbidden");
    expect(classifyError(await failure(clientAs(VIEWER).post(`${base(v1)}/approve`, { ifMatch: submit.version! })))).toBe("forbidden");
    expect(classifyError(await failure(admin.post(`${base(v1)}/approve`)))).toBe("precondition"); // If-Match 필수
    expect(classifyError(await failure(admin.post(`${base(v1)}/approve`, { ifMatch: submit.version! - 1 })))).toBe("conflict");
    const approved = await admin.post<Schemas["Single_ProcessVersionOut_"]>(`${base(v1)}/approve`, { ifMatch: submit.version! });
    const v1View = toProcessVersionView(approved.body.data);
    expect(v1View.status).toBe("approved");
    expect(v1View.approvedAt).not.toBeNull();

    // 4) 승인본은 수정할 수 없다(409 VERSION_IMMUTABLE). 제품 요약의 현재 승인본이 이 버전이다.
    const immutable = await failure(admin.put(`${base(v1)}/graph`, { body: toGraphIn(doc), ifMatch: approved.version! }));
    expect(immutable.code).toBe("VERSION_IMMUTABLE");
    const summary = (await admin.get<Schemas["Single_ProductOut_"]>(`/projects/${PROJECT_A}/products/${p7!.id}`)).body.data;
    expect(summary.current_process_version).toMatchObject({ id: v1, version_no: 1, status: "approved" });
    expect(summary.latest_process_version!.id).toBe(v1);

    // 5) 승인본에서 새 초안: 그래프를 새 id로 복사하고 base_version_id를 기록한다
    const next = await admin.post<Schemas["Single_ProcessVersionOut_"]>(`/projects/${PROJECT_A}/products/${p7!.id}/process-versions`);
    const v2 = toProcessVersionView(next.body.data);
    expect(v2.baseVersionId).toBe(v1);
    const g1 = toGraphView((await admin.get<Schemas["Single_GraphOut_"]>(`${base(v1)}/graph`)).body.data);
    const g2 = toGraphView((await admin.get<Schemas["Single_GraphOut_"]>(`${base(v2.id)}/graph`)).body.data);
    expect(parseLinear(g2.doc)).not.toBeNull();
    expect(operationsInOrder(g2.doc).map((n) => n.label)).toEqual(operationsInOrder(g1.doc).map((n) => n.label));
    const used = new Set(g1.doc.nodes.map((n) => n.id));
    expect(g2.doc.nodes.every((n) => !used.has(n.id))).toBe(true); // 다른 버전이 쓰는 id를 재사용하지 않는다
    // 열린 버전이 있는 동안 또 만들 수 없다
    expect((await failure(admin.post(`/projects/${PROJECT_A}/products/${p7!.id}/process-versions`))).code).toBe("PROCESS_DRAFT_EXISTS");

    // 6) 두 번째 버전을 제출·승인하면 이전 승인본은 대체됨(superseded)이 된다
    const sub2 = await admin.post<Schemas["Single_ProcessVersionOut_"]>(`${base(v2.id)}/submit`, { ifMatch: next.version! });
    const ok2 = await admin.post<Schemas["Single_ProcessVersionOut_"]>(`${base(v2.id)}/approve`, { ifMatch: sub2.version! });
    expect(ok2.body.data.status).toBe("approved");
    const list = await versions();
    expect(list.map((v) => [v.versionNo, v.status])).toEqual([[2, "approved"], [1, "superseded"]]);
    const after = (await admin.get<Schemas["Single_ProductOut_"]>(`/projects/${PROJECT_A}/products/${p7!.id}`)).body.data;
    expect(after.current_process_version).toMatchObject({ id: v2.id, version_no: 2, status: "approved" });
  });
});
