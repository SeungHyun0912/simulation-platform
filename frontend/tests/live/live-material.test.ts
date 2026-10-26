import { buildMaterialCreate, buildMaterialPatch, mapMaterialErrors } from "../../src/features/materials/materialDraft";
import { toMaterialView } from "../../src/features/materials/materialMappers";
import { EMPTY_MATERIAL_DRAFT, toMaterialDraft, type MaterialDraft } from "../../src/features/materials/materialView";
import { createApiClient } from "../../src/shared/api/client";
import { ApiError, classifyError } from "../../src/shared/api/errors";
import type { Schemas } from "../../src/shared/api/types";

/**
 * 실제 서버 재료 검증. 읽기 전용 구역은 `LIVE_API`만 있으면 실행하고, 쓰기 구역은 공유 개발 DB를 바꾸므로 명시적으로 켠 경우에만 실행한다.
 *   $env:LIVE_API="http://127.0.0.1:8000/api/v1"; $env:LIVE_WRITE="1"; pnpm test:live
 * 쓰기 범위: 시험 데이터 재료 **M-003 하나**를 수정하고 **마지막에 원래 값(전부 미정·메모 없음)으로 되돌린다**. 삭제 endpoint가 없어
 * 흔적이 남는 생성(POST)은 전용 재료 **FE-LIVE-M1 한 건**만 만들며(재실행하면 이미 있어 409로 확인) 다른 재료는 만들지 않는다.
 */
const LIVE = process.env.LIVE_API;
const WRITE = process.env.LIVE_WRITE === "1";
const ADMIN = "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a";
const VIEWER = "2628054b-3888-5d81-ad9d-05cd7e1829c2";
const OTHER_ORG = "e64d894b-9649-5c64-af56-d4fcc7d52997";
const PROJECT_A = "9985bf99-c375-58b0-a776-5a1cc5053585";
const PROJECT_B = "c649e3ed-2918-5229-a63e-67aef6b4308b";

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
const find = async (code: string, project = PROJECT_A) =>
  (await admin.get<Schemas["ListOut_MaterialOut_"]>(`/projects/${project}/materials`, { query: { q: code } })).body.data.find((m) => m.code === code)!;

describe.skipIf(!LIVE)("실제 API: 재료 (읽기 전용, 시험 데이터 M-001~004)", () => {
  it("재료 목록·상세가 어댑터를 통과하고 규격의 미정·해당 없음·확정이 구분된다", async () => {
    const list = (await admin.get<Schemas["ListOut_MaterialOut_"]>(`/projects/${PROJECT_A}/materials`, { query: { limit: 50 } })).body.data.map(toMaterialView);
    const by = (code: string) => list.find((m) => m.code === code)!;
    expect(list.map((m) => m.code)).toEqual(expect.arrayContaining(["M-001", "M-002", "M-003", "M-004"]));
    // 시험 데이터: M-001 길이·중량 확정 / M-002 길이 확정·단위 수 3·중량 해당 없음 / M-003 모두 미정 / M-004 가닥 수만 확정
    expect(by("M-001").defaultSpec.lengthM.mode).toBe("value");
    expect(by("M-001").defaultSpec.weightKg.mode).toBe("value");
    expect(by("M-002").defaultSpec.unitCount).toMatchObject({ mode: "value", value: "3" });
    expect(by("M-002").defaultSpec.weightKg.mode).toBe("not_applicable");
    expect(Object.values(by("M-003").defaultSpec).every((v) => v.mode === "unknown")).toBe(true);
    expect(by("M-004").defaultSpec.strandCount).toMatchObject({ mode: "value", value: "12" });
    const one = await admin.get<Schemas["Single_MaterialOut_"]>(`/projects/${PROJECT_A}/materials/${by("M-001").id}`);
    expect(one.version).toBe(one.body.data.row_version); // ETag = row_version
  });

  it("검색·정렬이 서버에서 적용되고 프로젝트 B의 같은 코드와 격리된다", async () => {
    const hit = (await admin.get<Schemas["ListOut_MaterialOut_"]>(`/projects/${PROJECT_A}/materials`, { query: { q: "M-001" } })).body.data;
    expect(hit.map((m) => m.code)).toEqual(["M-001"]);
    const desc = (await admin.get<Schemas["ListOut_MaterialOut_"]>(`/projects/${PROJECT_A}/materials`, { query: { sort: "-code" } })).body.data;
    expect(desc[0]!.code >= desc[1]!.code).toBe(true);
    const e = await failure(admin.get(`/projects/${PROJECT_B}/materials/${hit[0]!.id}`));
    expect(classifyError(e)).toBe("not-found"); // A의 재료 id로 B를 조회하면 존재를 알리지 않는다
    expect(classifyError(await failure(clientAs(OTHER_ORG).get(`/projects/${PROJECT_A}/materials/${hit[0]!.id}`)))).toBe("not-found");
  });

  it("조회자도 재료를 읽을 수 있다", async () => {
    const r = await clientAs(VIEWER).get<Schemas["ListOut_MaterialOut_"]>(`/projects/${PROJECT_A}/materials`, { query: { limit: 3 } });
    expect(r.body.data.length).toBe(3);
  });
});

describe.skipIf(!LIVE || !WRITE)("실제 API: 재료 쓰기 (M-003 수정 후 원복, 전용 재료 FE-LIVE-M1 한 건)", () => {
  const viewer = clientAs(VIEWER);
  let id = "";
  let original: MaterialDraft;
  const url = () => `/projects/${PROJECT_A}/materials/${id}`;
  const read = async () => {
    const r = await admin.get<Schemas["Single_MaterialOut_"]>(url());
    return { view: toMaterialView(r.body.data), version: r.version! };
  };
  const known = (value: string, unit: string) => ({ mode: "value" as const, value, unit });

  beforeAll(async () => {
    id = (await find("M-003")).id;
    original = toMaterialDraft((await read()).view);
  });

  afterAll(async () => {
    // 어떤 단계가 실패해도 원래 값으로 되돌린다(현재 버전을 다시 읽어 If-Match로 사용).
    if (!id) return;
    const cur = await read();
    const revert = buildMaterialPatch(toMaterialDraft(cur.view), original);
    if (revert) await admin.patch(url(), { body: revert, ifMatch: cur.version });
  });

  it("If-Match 없이 보내면 428, 오래된 버전은 412이고 서버에는 아무것도 쓰이지 않는다", async () => {
    const cur = await read();
    expect(classifyError(await failure(admin.patch(url(), { body: { notes: "x" } })))).toBe("precondition");
    expect(classifyError(await failure(admin.patch(url(), { body: { notes: "x" }, ifMatch: cur.version - 1 })))).toBe("conflict");
    expect((await read()).view.notes).toBe(original.notes === "" ? null : original.notes);
  });

  it("FE가 만든 PATCH 본문(바꾼 필드만)을 서버가 받아들이고 보낸 규격 필드만 교체한다", async () => {
    const cur = await read();
    const draft: MaterialDraft = {
      ...toMaterialDraft(cur.view),
      notes: "[FE 시험] 메모",
      spec: { ...toMaterialDraft(cur.view).spec, lengthM: known("1000", "m"), unitCount: known("3", "item") },
    };
    const patch = buildMaterialPatch(toMaterialDraft(cur.view), draft)!;
    expect(Object.keys(patch).sort()).toEqual(["default_spec", "notes"]);
    const r = await admin.patch<Schemas["Single_MaterialOut_"]>(url(), { body: patch, ifMatch: cur.version });
    expect(r.version).toBe(cur.version + 1);
    const saved = toMaterialView(r.body.data);
    expect(saved.defaultSpec.lengthM).toMatchObject({ mode: "value", value: "1000" });
    expect(saved.defaultSpec.unitCount).toMatchObject({ mode: "value", value: "3" });
    expect(saved.defaultSpec.weightKg.mode).toBe("unknown"); // 보내지 않은 필드는 그대로
    expect(saved.notes).toBe("[FE 시험] 메모");
    // 두 번째 저장은 응답의 새 버전을 이어 쓴다. 해당 없음·확정값을 미정으로 되돌리기
    const next = { ...toMaterialDraft(saved), spec: { ...toMaterialDraft(saved).spec, weightKg: { mode: "not_applicable" as const, value: "", unit: "kg" }, lengthM: { mode: "unknown" as const, value: "", unit: "m" } } };
    const r2 = await admin.patch<Schemas["Single_MaterialOut_"]>(url(), { body: buildMaterialPatch(toMaterialDraft(saved), next)!, ifMatch: r.version! });
    const saved2 = toMaterialView(r2.body.data);
    expect(saved2.defaultSpec.weightKg.mode).toBe("not_applicable");
    expect(saved2.defaultSpec.lengthM.mode).toBe("unknown");
    expect(saved2.defaultSpec.unitCount).toMatchObject({ mode: "value", value: "3" }); // 건드리지 않은 값은 유지
  });

  it("잘못된 규격·빈 default_spec·null은 422이고 field_path가 입력에 연결된다", async () => {
    const cur = await read();
    const zero = await failure(admin.patch(url(), { body: { default_spec: { length_m: { mode: "known", value: "0" } } }, ifMatch: cur.version }));
    expect(zero.status).toBe(422);
    expect(mapMaterialErrors(zero).spec).toHaveProperty("lengthM");
    const count = await failure(admin.patch(url(), { body: { default_spec: { unit_count: { mode: "known", value: "3" } } }, ifMatch: cur.version }));
    expect(mapMaterialErrors(count).spec).toHaveProperty("unitCount"); // 개수는 문자열이 아니라 JSON 정수여야 한다
    expect((await failure(admin.patch(url(), { body: { default_spec: {} }, ifMatch: cur.version }))).status).toBe(422);
    expect((await failure(admin.patch(url(), { body: { default_spec: null }, ifMatch: cur.version }))).status).toBe(422);
    expect((await failure(admin.patch(url(), { body: { form: null }, ifMatch: cur.version }))).status).toBe(422);
    expect((await failure(admin.patch(url(), { body: { form: "" }, ifMatch: cur.version }))).status).toBe(422);
    expect((await read()).version).toBe(cur.version); // 아무것도 저장되지 않았다
  });

  it("같은 프로젝트의 다른 재료 코드로 바꾸면 409 MATERIAL_CODE_CONFLICT가 /code 필드 오류가 된다", async () => {
    const cur = await read();
    const e = await failure(admin.patch(url(), { body: { code: "M-001" }, ifMatch: cur.version }));
    expect(e.status).toBe(409);
    expect(e.code).toBe("MATERIAL_CODE_CONFLICT");
    expect(classifyError(e)).toBe("duplicate");
    expect(mapMaterialErrors(e).fields.code).toBeDefined();
  });

  it("조회자는 403, 비멤버는 404이다", async () => {
    const cur = await read();
    expect(classifyError(await failure(viewer.patch(url(), { body: { notes: "x" }, ifMatch: cur.version })))).toBe("forbidden");
    expect(classifyError(await failure(clientAs(OTHER_ORG).patch(url(), { body: { notes: "x" }, ifMatch: cur.version })))).toBe("not-found");
  });

  it("FE가 만든 생성 본문을 서버가 받아들이고(전용 재료 FE-LIVE-M1), 같은 코드를 다시 만들면 409이다", async () => {
    const draft: MaterialDraft = { ...EMPTY_MATERIAL_DRAFT, code: "FE-LIVE-M1", name: "[FE 시험] 생성 확인 재료", form: "보빈", spec: { ...EMPTY_MATERIAL_DRAFT.spec, strandCount: known("12", "strand") } };
    const body = buildMaterialCreate(draft);
    expect(Object.keys(body).sort()).toEqual(["code", "default_spec", "form", "name"]); // 비운 메모는 생략
    const existing = (await admin.get<Schemas["ListOut_MaterialOut_"]>(`/projects/${PROJECT_A}/materials`, { query: { q: "FE-LIVE-M1" } })).body.data.find((m) => m.code === "FE-LIVE-M1");
    if (!existing) {
      const r = await admin.post<Schemas["Single_MaterialOut_"]>(`/projects/${PROJECT_A}/materials`, { body });
      expect(r.status).toBe(201);
      expect(r.version).toBe(r.body.data.row_version);
      const view = toMaterialView(r.body.data);
      expect(view.defaultSpec.strandCount).toMatchObject({ mode: "value", value: "12" });
      expect(view.defaultSpec.lengthM.mode).toBe("unknown"); // 보내지 않은 규격은 미정(0이 아님)
    }
    const dup = await failure(admin.post(`/projects/${PROJECT_A}/materials`, { body }));
    expect(dup.code).toBe("MATERIAL_CODE_CONFLICT");
    expect(mapMaterialErrors(dup).fields.code).toBeDefined();
    expect(classifyError(await failure(viewer.post(`/projects/${PROJECT_A}/materials`, { body })))).toBe("forbidden");
  });
});
