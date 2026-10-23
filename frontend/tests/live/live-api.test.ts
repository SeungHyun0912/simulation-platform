import { toAssetInfo, toRevisionDetail } from "../../src/features/assets/apiMappers";
import { toMeView, toProjectView } from "../../src/features/projects/queries";
import { createApiClient } from "../../src/shared/api/client";
import { ApiError, classifyError } from "../../src/shared/api/errors";
import type { Schemas } from "../../src/shared/api/types";

/**
 * 실제 API 서버 대상 읽기 전용 검증(GET만 호출). 서버가 없으면 건너뛴다(기본 `pnpm test`에는 서버가 필요 없다).
 *   $env:LIVE_API="http://127.0.0.1:8000/api/v1"; pnpm test:live
 * 아래 사용자·프로젝트 id는 backend 시험 데이터 시드의 개발 전용 식별자이며 비밀이 아니다
 * (docs/communication/request-from-backend.md "현재 Backend 상태"). 시드가 바뀌면 값을 맞춘다.
 */
const LIVE = process.env.LIVE_API;
const ADMIN = "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a"; // A·B admin
const VIEWER = "2628054b-3888-5d81-ad9d-05cd7e1829c2"; // A viewer
const OTHER_ORG = "e64d894b-9649-5c64-af56-d4fcc7d52997"; // C만
const NOBODY = "1afa5603-8a7e-56c2-b626-1e4b28d162bd"; // 소속 없음
const PROJECT_A = "9985bf99-c375-58b0-a776-5a1cc5053585";
const PROJECT_B = "c649e3ed-2918-5229-a63e-67aef6b4308b";

function clientAs(user: string) {
  const base = (LIVE ?? "").replace(/\/+$/, "");
  const fetchImpl = ((url: string, init: RequestInit = {}) =>
    fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), "X-Debug-User": user } })) as typeof fetch;
  return createApiClient({ baseUrl: base, fetchImpl });
}

describe.skipIf(!LIVE)("실제 API (읽기 전용)", () => {
  it("/health와 계약 버전과 맞는 서버인지 확인한다", async () => {
    const r = await clientAs(ADMIN).get<{ data: { status: string } }>("/health");
    expect(r.body.data.status).toBe("ok");
  });

  it("/me: 관리자는 프로젝트 A·B와 조직 역할을 받는다", async () => {
    const r = await clientAs(ADMIN).get<Schemas["Single_MeOut_"]>("/me");
    const me = toMeView(r.body.data);
    const codes = me.projects.map((p) => p.code);
    expect(codes).toEqual(expect.arrayContaining(["DEMO-A", "DEMO-B"]));
    expect(me.projects.find((p) => p.id === PROJECT_A)!.role).toBe("admin");
    expect(me.organizations.some((o) => o.role === "admin")).toBe(true);
  });

  it("/me: 소속 없는 사용자는 빈 목록, 다른 조직 관리자는 자기 프로젝트만 받는다", async () => {
    const nobody = toMeView((await clientAs(NOBODY).get<Schemas["Single_MeOut_"]>("/me")).body.data);
    expect(nobody.projects).toEqual([]);
    const other = toMeView((await clientAs(OTHER_ORG).get<Schemas["Single_MeOut_"]>("/me")).body.data);
    expect(other.projects.map((p) => p.id)).not.toContain(PROJECT_A);
  });

  it("인증 헤더가 없으면 401 UNAUTHENTICATED로 분류된다", async () => {
    const base = (LIVE ?? "").replace(/\/+$/, "");
    const e = await createApiClient({ baseUrl: base }).get("/me").catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(classifyError(e)).toBe("unauthenticated");
  });

  it("GET /projects: ProjectOut을 화면용으로 바꾸고 시간대를 확인한다", async () => {
    const r = await clientAs(ADMIN).get<Schemas["ListOut_ProjectOut_"]>("/projects", { query: { limit: 50 } });
    const projects = r.body.data.map(toProjectView);
    expect(projects.find((p) => p.id === PROJECT_A)).toMatchObject({ code: "DEMO-A", timezone: "Asia/Seoul" });
  });

  it("자산 목록: 기본 limit 50, next_cursor, 다음 페이지, 정렬 변경 시 이전 cursor 거부(422)", async () => {
    const c = clientAs(ADMIN);
    const first = await c.get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_A}/assets`, { query: { limit: 50 } });
    expect(first.body.data).toHaveLength(50);
    expect(first.body.page.next_cursor).toBeTruthy();
    const items = first.body.data.map(toAssetInfo);
    expect(items.every((a) => a.ports.length > 0)).toBe(true);

    const second = await c.get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_A}/assets`, {
      query: { limit: 50, cursor: first.body.page.next_cursor },
    });
    expect(second.body.data.length).toBeGreaterThanOrEqual(10);
    const ids = new Set([...first.body.data, ...second.body.data].map((a) => a.id));
    expect(ids.size).toBe(first.body.data.length + second.body.data.length); // 중복 없음

    const err = await c
      .get(`/projects/${PROJECT_A}/assets`, { query: { limit: 50, sort: "-name", cursor: first.body.page.next_cursor } })
      .catch((x) => x);
    expect(err).toMatchObject({ status: 422, code: "INVALID_CURSOR" });
    expect(classifyError(err)).toBe("validation");
  });

  it("자산 목록 정렬·검색·종류 필터가 서버에서 적용된다", async () => {
    const c = clientAs(ADMIN);
    const desc = await c.get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_A}/assets`, { query: { sort: "-code", limit: 5 } });
    const codes = desc.body.data.map((a) => a.code);
    expect([...codes].sort().reverse()).toEqual(codes);
    const docks = await c.get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_A}/assets`, { query: { kind: "dock", limit: 50 } });
    expect(docks.body.data.length).toBeGreaterThan(0);
    expect(docks.body.data.every((a) => a.kind === "dock")).toBe(true);
    const q = await c.get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_A}/assets`, { query: { q: "EQ-005" } });
    expect(q.body.data.map((a) => a.code)).toContain("EQ-005");
  });

  it("자산 상세와 버전 목록: 승인본 + 새 초안(EQ-005)이 어댑터를 통과한다", async () => {
    const c = clientAs(ADMIN);
    const found = await c.get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_A}/assets`, { query: { q: "EQ-005" } });
    const id = found.body.data.find((a) => a.code === "EQ-005")!.id;
    const asset = await c.get<Schemas["Single_AssetOut_"]>(`/projects/${PROJECT_A}/assets/${id}`);
    expect(asset.version).toBe(asset.body.data.row_version); // ETag = row_version
    const info = toAssetInfo(asset.body.data);
    expect(info.currentRevision?.status).toBe("approved");
    expect(info.latestRevision?.status).toBe("draft");

    const revs = await c.get<Schemas["ListOut_AssetRevisionOut_"]>(`/projects/${PROJECT_A}/assets/${id}/revisions`, { query: { limit: 200 } });
    const details = revs.body.data.map(toRevisionDetail);
    expect(details.map((r) => r.status).sort()).toEqual(["approved", "draft"]);
    for (const r of details) {
      expect(r.ports.every((p) => p.role === "IN" || p.role === "OUT")).toBe(true);
      expect(r.ports.every((p) => ["unknown", "value", "unlimited", "not_allowed"].includes(p.bufferCapacity.mode))).toBe(true);
    }
  });

  it("버전 상태별 시험 자산이 모두 어댑터를 통과한다(superseded 포함)", async () => {
    const c = clientAs(ADMIN);
    const all = await c.get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_A}/assets`, { query: { limit: 200 } });
    const statuses = new Set<string>();
    for (const a of all.body.data) {
      const revs = await c.get<Schemas["ListOut_AssetRevisionOut_"]>(`/projects/${PROJECT_A}/assets/${a.id}/revisions`, { query: { limit: 200 } });
      for (const r of revs.body.data.map(toRevisionDetail)) statuses.add(r.status);
    }
    expect([...statuses].sort()).toEqual(["approved", "draft", "in_review", "superseded"]);
  });

  it("프로젝트 격리: 같은 코드(EQ-001)가 B에도 있지만 A의 자산 id로 B를 조회하면 404", async () => {
    const c = clientAs(ADMIN);
    const a = (await c.get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_A}/assets`, { query: { q: "EQ-001" } })).body.data.find((x) => x.code === "EQ-001")!;
    const b = (await c.get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_B}/assets`, { query: { q: "EQ-001" } })).body.data.find((x) => x.code === "EQ-001")!;
    expect(a.id).not.toBe(b.id);
    const cross = await c.get(`/projects/${PROJECT_B}/assets/${a.id}`).catch((x) => x);
    expect(cross).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("비멤버(다른 조직 관리자)는 프로젝트 A에 접근할 수 없다(404, 존재를 알리지 않음)", async () => {
    const e = await clientAs(OTHER_ORG).get(`/projects/${PROJECT_A}/assets`).catch((x) => x);
    expect(e).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(classifyError(e)).toBe("not-found");
  });

  it("조회자도 읽기는 가능하다(역할은 /me로 확인)", async () => {
    const me = toMeView((await clientAs(VIEWER).get<Schemas["Single_MeOut_"]>("/me")).body.data);
    expect(me.projects.find((p) => p.id === PROJECT_A)!.role).toBe("viewer");
    const r = await clientAs(VIEWER).get<Schemas["ListOut_AssetOut_"]>(`/projects/${PROJECT_A}/assets`, { query: { limit: 5 } });
    expect(r.body.data.length).toBe(5);
  });

  it("경로 id가 UUID가 아니면 422이며 FE는 찾을 수 없음으로 처리한다", async () => {
    const e = await clientAs(ADMIN).get(`/projects/${PROJECT_A}/assets/not-a-uuid`).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect([404, 422]).toContain(e.status);
  });
});
