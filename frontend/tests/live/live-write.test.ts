import { toAssetInfo } from "../../src/features/assets/apiMappers";
import { buildAssetPatch, mapServerErrors } from "../../src/features/assets/infoDraft";
import { toInfoDraft } from "../../src/features/assets/assetView";
import { createApiClient } from "../../src/shared/api/client";
import { ApiError, classifyError } from "../../src/shared/api/errors";
import type { Schemas } from "../../src/shared/api/types";

/**
 * 실제 서버 쓰기 검증(공유 개발 DB를 바꾼다). 명시적으로 켠 경우에만 실행한다.
 *   $env:LIVE_API="http://127.0.0.1:8000/api/v1"; $env:LIVE_WRITE="1"; pnpm test:live
 * 범위를 좁게 둔다: 시험 데이터 자산 하나(EQ-025)에 PATCH만 하고 **마지막에 원래 값으로 되돌린다**.
 * 삭제 endpoint가 없어 흔적이 남는 자산 생성(POST)은 이 테스트에서 하지 않는다. row_version은 실행마다 올라간다.
 */
const LIVE = process.env.LIVE_API;
const WRITE = process.env.LIVE_WRITE === "1";
const ADMIN = "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a";
const VIEWER = "2628054b-3888-5d81-ad9d-05cd7e1829c2";
const OTHER_ORG = "e64d894b-9649-5c64-af56-d4fcc7d52997";
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

describe.skipIf(!LIVE || !WRITE)("실제 API 쓰기 (EQ-025 PATCH 후 원복)", () => {
  const admin = clientAs(ADMIN);
  let id = "";
  const url = () => `/projects/${PROJECT_A}/assets/${id}`;
  let original: Schemas["AssetOut"];

  beforeAll(async () => {
    const found = await admin.get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_A}/assets`, { query: { q: "EQ-025" } });
    id = found.body.data.find((a) => a.code === "EQ-025")!.id;
    original = (await admin.get<Schemas["Single_AssetOut_"]>(url())).body.data;
  });

  afterAll(async () => {
    // 어떤 단계가 실패해도 원래 값으로 되돌린다(현재 버전을 다시 읽어 If-Match로 사용).
    if (!id) return;
    const cur = await admin.get<Schemas["Single_AssetOut_"]>(url());
    const revert: Schemas["AssetPatch"] = {};
    if (cur.body.data.notes !== original.notes) revert.notes = original.notes;
    if (cur.body.data.equipment?.model_name !== original.equipment?.model_name)
      revert.equipment = { model_name: original.equipment?.model_name ?? null };
    if (Object.keys(revert).length > 0) await admin.patch(url(), { body: revert, ifMatch: cur.version! });
  });

  it("If-Match 없이 보내면 428 PRECONDITION_REQUIRED(FE 버그 신호로 분류)", async () => {
    const e = await failure(admin.patch(url(), { body: { notes: "x" } }));
    expect(e).toMatchObject({ status: 428, code: "PRECONDITION_REQUIRED" });
    expect(classifyError(e)).toBe("precondition");
  });

  it("오래된 버전으로 보내면 412 EDIT_CONFLICT이고 서버에는 아무것도 쓰이지 않는다", async () => {
    const cur = await admin.get<Schemas["Single_AssetOut_"]>(url());
    const e = await failure(admin.patch(url(), { body: { notes: "[FE live] 쓰이면 안 됨" }, ifMatch: cur.version! - 1 }));
    expect(e).toMatchObject({ status: 412, code: "EDIT_CONFLICT" });
    expect(classifyError(e)).toBe("conflict");
    expect(e.details[0]?.field_path).toBe("/row_version");
    const after = await admin.get<Schemas["Single_AssetOut_"]>(url());
    expect(after.body.data.notes).toBe(cur.body.data.notes);
    expect(after.version).toBe(cur.version);
  });

  it("정상 저장: 바꾼 필드만 PATCH하면 새 버전(ETag)과 전체 자산을 돌려주고 어댑터를 통과한다", async () => {
    const cur = toAssetInfo((await admin.get<Schemas["Single_AssetOut_"]>(url())).body.data);
    const base = toInfoDraft(cur);
    const patch = buildAssetPatch(base, { ...base, notes: "[FE live] 임시 메모" }, cur.kind)!;
    expect(patch).toEqual({ notes: "[FE live] 임시 메모" });
    const r = await admin.patch<Schemas["Single_AssetOut_"]>(url(), { body: patch, ifMatch: cur.rowVersion });
    expect(r.version).toBe(cur.rowVersion + 1);
    expect(r.body.data.row_version).toBe(r.version);
    const saved = toAssetInfo(r.body.data);
    expect(saved.notes).toBe("[FE live] 임시 메모");
    expect(saved.name).toBe(cur.name); // 보내지 않은 필드는 그대로
    // 원복(null = 입력 없음)
    const back = await admin.patch<Schemas["Single_AssetOut_"]>(url(), { body: { notes: original.notes }, ifMatch: saved.rowVersion });
    expect(back.body.data.notes).toBe(original.notes);
  });

  it("설비 모델: 값을 넣었다가 null(입력 없음)로 지우는 동작이 서버와 일치한다", async () => {
    const cur = await admin.get<Schemas["Single_AssetOut_"]>(url());
    const set = await admin.patch<Schemas["Single_AssetOut_"]>(url(), { body: { equipment: { model_name: "FE-LIVE" } }, ifMatch: cur.version! });
    expect(set.body.data.equipment?.model_name).toBe("FE-LIVE");
    const cleared = await admin.patch<Schemas["Single_AssetOut_"]>(url(), { body: { equipment: { model_name: null } }, ifMatch: set.version! });
    expect(cleared.body.data.equipment?.model_name).toBeNull();
    // 원복
    if (original.equipment?.model_name)
      await admin.patch(url(), { body: { equipment: { model_name: original.equipment.model_name } }, ifMatch: cleared.version! });
  });

  it("같은 프로젝트의 다른 자산 코드로 바꾸면 409 ASSET_CODE_CONFLICT가 /code 필드 오류가 된다", async () => {
    const cur = await admin.get<Schemas["Single_AssetOut_"]>(url());
    const e = await failure(admin.patch(url(), { body: { code: "EQ-002" }, ifMatch: cur.version! }));
    expect(e).toMatchObject({ status: 409, code: "ASSET_CODE_CONFLICT" });
    expect(classifyError(e)).toBe("duplicate");
    expect(mapServerErrors(e).fields.code).toBeTruthy();
  });

  it("빈 문자열·null 불가 필드·허용되지 않은 필드는 422이며 field_path가 폼 필드에 연결된다", async () => {
    const cur = await admin.get<Schemas["Single_AssetOut_"]>(url());
    const v = cur.version!;
    const empty = await failure(admin.patch(url(), { body: { name: "" }, ifMatch: v }));
    expect(empty.status).toBe(422);
    expect(mapServerErrors(empty).fields.name).toBeTruthy();
    const nullName = await failure(admin.patch(url(), { body: { name: null }, ifMatch: v }));
    expect(nullName.status).toBe(422);
    const extra = await failure(admin.patch(url(), { body: { kind: "dock" } as never, ifMatch: v }));
    expect(extra.status).toBe(422);
    expect(extra.details.some((d) => d.field_path === "/kind")).toBe(true);
    const nothing = await failure(admin.patch(url(), { body: {}, ifMatch: v }));
    expect(nothing.status).toBe(422);
    const emptyModel = await failure(admin.patch(url(), { body: { equipment: { model_name: "" } }, ifMatch: v }));
    expect(emptyModel.status).toBe(422);
    expect(mapServerErrors(emptyModel).fields.modelName).toBeTruthy();
  });

  it("조회자는 403 FORBIDDEN, 비멤버는 404 NOT_FOUND", async () => {
    const cur = await admin.get<Schemas["Single_AssetOut_"]>(url());
    const viewer = await failure(clientAs(VIEWER).patch(url(), { body: { notes: "x" }, ifMatch: cur.version! }));
    expect(viewer).toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(classifyError(viewer)).toBe("forbidden");
    const outsider = await failure(clientAs(OTHER_ORG).patch(url(), { body: { notes: "x" }, ifMatch: cur.version! }));
    expect(outsider).toMatchObject({ status: 404, code: "NOT_FOUND" });
    const after = await admin.get<Schemas["Single_AssetOut_"]>(url());
    expect(after.body.data.notes).toBe(cur.body.data.notes); // 어느 쪽도 쓰지 못했다
  });
});
