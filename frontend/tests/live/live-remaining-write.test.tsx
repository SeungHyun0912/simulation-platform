import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createApiClient } from "../../src/shared/api/client";
import type { Schemas } from "../../src/shared/api/types";
import { renderApp } from "../renderApp";

/**
 * FE-07a 이후 추가된 쓰기 기능의 실서버 검증(FE-12a). `LIVE_WRITE=1`일 때만 실행한다.
 *   $env:LIVE_API="http://127.0.0.1:8000/api/v1"; $env:LIVE_WRITE="1"; pnpm vitest run tests/live/live-remaining-write.test.tsx
 * 쓰는 범위(사용자 허락 2026-10-28 "남은 실서버 검증 절차를 전부 진행"):
 *  - DEMO-A의 P-006 열린 초안 한 개: 플로우차트 단계 자동 저장(PATCH) 후 이름을 원래대로 되돌린다(승인하지 않음).
 *  - DEMO-WIRE-RUN의 전용 시험 시나리오 FE-LIVE-S1: 승인본에서 "새 초안을 만들어 최신 공정으로 갱신" → 운반 가정 2개 저장 →
 *    사전검증 → 승인 → 실행 요청 → 종료까지 상태 갱신 → 결과 리포트. 시나리오 버전과 run이 하나씩 쌓인다(삭제 endpoint 없음).
 */
const LIVE = process.env.LIVE_API;
const WRITE = process.env.LIVE_WRITE === "1";
const ADMIN = "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a";
const slow = { timeout: 20_000 };
const TERMINAL_MS = 240_000;

/** 실서버 fetch. 요청 경로를 기록해 화면이 상태를 여러 번 다시 물었는지(polling) 확인한다. */
const seen: string[] = [];
function realFetch(): typeof fetch {
  const base = (LIVE ?? "").replace(/\/+$/, "");
  return ((url: string, init: RequestInit = {}) => {
    seen.push(`${init.method ?? "GET"} ${url}`);
    return fetch(url.startsWith("/api/v1") ? `${base}${url.slice("/api/v1".length)}` : url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), "X-Debug-User": ADMIN },
    });
  }) as typeof fetch;
}
const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: realFetch() });
const get = async <T,>(path: string) => (await client.get<{ data: T }>(path)).body.data;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let projectA = "";
let runProject = "";
beforeAll(async () => {
  if (!LIVE || !WRITE) return;
  const me = await get<Schemas["MeOut"]>("/me");
  projectA = me.projects.find((p) => p.code === "DEMO-A")?.id ?? "";
  runProject = me.projects.find((p) => p.code === "DEMO-WIRE-RUN")?.id ?? "";
});

describe.skipIf(!LIVE || !WRITE)("실서버 쓰기: 플로우차트 단계 자동 저장 (DEMO-A P-006 초안)", () => {
  it("단계 이름을 고치면 잠시 뒤 그 단계만 저장되고(서버 값 반영), 되돌려 쓰면 원래 이름으로 다시 저장된다", { timeout: 120_000 }, async (ctx) => {
    if (!projectA) return ctx.skip();
    const [p6] = (await get<{ id: string; code: string }[]>(`/projects/${projectA}/products?q=P-006`)).filter((p) => p.code === "P-006");
    const draft = (await get<{ id: string; status: string }[]>(`/projects/${projectA}/products/${p6!.id}/process-versions`)).find((v) => v.status === "draft");
    if (!draft) return ctx.skip(); // 열린 초안이 없으면 만들지 않는다(공정 이력에 새 버전이 생기므로)
    const graphOf = () => get<{ row_version: number; nodes: { id: string; kind: string; label: string }[] }>(`/projects/${projectA}/process-versions/${draft.id}/graph`);
    const before = await graphOf();
    const step = before.nodes.find((n) => n.kind === "operation");
    if (!step) return ctx.skip();
    const original = step.label;

    const user = userEvent.setup();
    renderApp(`/projects/${projectA}/products/${p6!.id}/flow`, { source: "api", fetchImpl: realFetch() });
    await user.click(await screen.findByRole("button", { name: new RegExp(`^공정 단계 ${esc(original)}`) }, slow));
    const field = screen.getByLabelText("공정명");
    await user.type(field, "(FE)");
    expect(await screen.findByText(new RegExp(`단계 "${esc(original)}\\(FE\\)"을\\(를\\) 저장했습니다`), {}, slow)).toBeInTheDocument();
    const mid = await graphOf();
    expect(mid.nodes.find((n) => n.id === step.id)!.label).toBe(`${original}(FE)`);
    expect(mid.row_version).toBeGreaterThan(before.row_version);
    // 그래프 전체 저장(PUT)이 아니라 단계 PATCH로 갔다
    expect(seen.some((s) => s.startsWith("PATCH") && s.includes(`/process-versions/${draft.id}/steps/${step.id}`))).toBe(true);
    expect(seen.some((s) => s.startsWith("PUT") && s.endsWith(`/process-versions/${draft.id}/graph`))).toBe(false);

    // 원래 이름으로 되돌린다(같은 화면에서 이어 쓰면 오른 버전으로 다시 PATCH)
    await user.clear(field);
    await user.type(field, original.replace(/[[{]/g, "$&$&")); // user-event는 [ { 를 키 기호로 읽으므로 두 번 써서 글자로 넣는다
    await waitFor(async () => expect((await graphOf()).nodes.find((n) => n.id === step.id)!.label).toBe(original), { timeout: 20_000, interval: 1000 });
  });
});

/**
 * 장시간 실행(`LIVE_LONG=1`일 때만). FE-LIVE-S1의 최신 승인본이 도착 수량을 크게 늘린 버전(v4, 도착 400개)이어야 한다 — 준비는 API로 했다.
 * Backend 안내: worker는 2초마다 큐를 보고, 취소 요청은 이벤트 묶음(2,000건) 저장마다(이벤트가 없는 구간은 heartbeat 10초 상한) 확인한다.
 */
const LONG = process.env.LIVE_LONG === "1";
describe.skipIf(!LIVE || !WRITE || !LONG)("실서버 쓰기: 장시간 실행의 상태 갱신·실행 중 취소 (FE-LIVE-S1 큰 버전)", () => {
  async function requestRun(seed: number) {
    const sc = (await get<Schemas["ScenarioOut"][]>(`/projects/${runProject}/scenarios?limit=50`)).find((s) => s.code === "FE-LIVE-S1");
    const user = userEvent.setup();
    const { router } = renderApp(`/projects/${runProject}/scenarios/versions/${sc!.latest_version!.id}`, { source: "api", fetchImpl: realFetch() });
    await screen.findByRole("button", { name: "실행 요청" }, slow);
    await user.clear(screen.getByLabelText("seed"));
    await user.type(screen.getByLabelText("seed"), String(seed));
    await user.click(screen.getByRole("button", { name: "실행 요청" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/runs\/[^/]+$/), slow);
    return { user, runId: router.state.location.pathname.split("/").pop()! };
  }
  const badge = (text: string) => screen.queryByText(text, { selector: "span" });

  it("대기 중 → 실행 중이 화면에 보이고, 끝나면 스스로 종료 상태와 결과로 바뀐다", { timeout: 600_000 }, async (ctx) => {
    if (!runProject) return ctx.skip();
    const { runId } = await requestRun(8100 + Math.floor(Math.random() * 100));
    const t0 = Date.now();
    await waitFor(() => expect(badge("실행 중")).not.toBeNull(), { timeout: 30_000, interval: 250 });
    const runningAt = Date.now();
    expect(screen.getByText(/진행 중입니다\. 자동으로 갱신됩니다/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/진행 중입니다\. 자동으로 갱신됩니다/)).toBeNull(), { timeout: 540_000, interval: 1000 });
    const run = await get<Schemas["RunOut"]>(`/projects/${runProject}/runs/${runId}`);
    console.info(`[FE-12a long] run ${runId} → ${run.status}, 실행 중으로 보인 시간 ${Math.round((Date.now() - runningAt) / 1000)}초, 전체 ${Math.round((Date.now() - t0) / 1000)}초, 이벤트 ${run.result?.event_count ?? "?"}건`);
    expect(["completed", "stalled", "horizon_reached", "limit_reached"]).toContain(run.status);
    await screen.findByRole("heading", { name: "결과 요약" }, slow);
  });

  it("실행 중에 취소하면 '취소 요청됨'이 보이고(서버 running + cancel_requested_at), 곧 취소됨으로 바뀐다", { timeout: 300_000 }, async (ctx) => {
    if (!runProject) return ctx.skip();
    const { user, runId } = await requestRun(8300 + Math.floor(Math.random() * 100));
    await waitFor(() => expect(badge("실행 중")).not.toBeNull(), { timeout: 30_000, interval: 250 });
    await user.click(screen.getByRole("button", { name: "실행 취소" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "취소 요청" }));
    const asked = Date.now();
    // 취소 요청이 서버에 닿으면 화면은 "취소 요청됨"(잠김) 또는 이미 "취소됨"이다. 그 뒤에 서버를 본다(요청보다 먼저 묻지 않도록).
    await waitFor(() => expect(screen.queryByRole("button", { name: "취소 요청됨" }) ?? badge("취소됨")).not.toBeNull(), { timeout: 30_000, interval: 200 });
    const mid = await get<Schemas["RunOut"]>(`/projects/${runProject}/runs/${runId}`);
    if (mid.status === "running") {
      expect(mid.cancel_requested_at).toBeTruthy();
      expect(screen.getByRole("button", { name: "취소 요청됨" })).toBeDisabled();
    }
    await waitFor(() => expect(badge("취소됨")).not.toBeNull(), { timeout: 120_000, interval: 500 });
    const run = await get<Schemas["RunOut"]>(`/projects/${runProject}/runs/${runId}`);
    console.info(`[FE-12a cancel] run ${runId} → ${run.status}, 취소 요청 뒤 ${Math.round((Date.now() - asked) / 1000)}초, 요청 직후 서버 상태 ${mid.status}`);
    expect(run.status).toBe("cancelled");
    expect(screen.queryByRole("button", { name: /실행 취소|취소 요청됨/ })).toBeNull(); // 끝난 실행에는 취소 버튼이 없다
  });
});

describe.skipIf(!LIVE || !WRITE)("실서버 쓰기: 최신 공정으로 갱신 → 운반 가정 → 승인 → 실행 상태 추적 → 리포트 (FE-LIVE-S1)", () => {
  it("승인본에서 새 초안을 만들어 갱신하고, 운반 가정을 저장해 실행까지 마친 뒤 결과 리포트를 연다", { timeout: TERMINAL_MS + 120_000 }, async (ctx) => {
    if (!runProject) return ctx.skip();
    const sc = (await get<Schemas["ScenarioOut"][]>(`/projects/${runProject}/scenarios?limit=50`)).find((s) => s.code === "FE-LIVE-S1");
    const latest = sc?.latest_version;
    if (!latest) return ctx.skip(); // live-scenario-run-write가 먼저 승인본을 만들어 둔다
    const user = userEvent.setup();
    const { router } = renderApp(`/projects/${runProject}/scenarios/versions/${latest.id}`, { source: "api", fetchImpl: realFetch() });

    // 1) 최신 공정으로 갱신: 승인본이면 "새 초안을 만들어 갱신", 이전 시험이 남긴 초안이면 그 초안에서 "최신 승인 공정으로 갱신"
    let draftId = latest.id;
    if (latest.status === "approved") {
      await user.click(await screen.findByRole("button", { name: "새 초안을 만들어 최신 공정으로 갱신" }, slow));
      await waitFor(() => expect(router.state.location.pathname).not.toContain(latest.id), slow);
      draftId = router.state.location.pathname.split("/").pop()!;
    } else {
      expect(latest.status).toBe("draft");
      await user.click(await screen.findByRole("button", { name: "최신 승인 공정으로 갱신" }, slow));
      await screen.findByText(/최신 승인 공정·자산 버전으로 갱신했습니다/, {}, slow);
    }
    expect(await screen.findByRole("heading", { name: "갱신 결과" }, slow)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "공정 버전 변경" })).toBeInTheDocument();
    expect((await get<Schemas["ScenarioVersionOut"]>(`/projects/${runProject}/scenario-versions/${draftId}`)).status).toBe("draft");

    // 2) 운반 가정 2개(빈 차 이동 분, 산출 보류 명시) 저장
    // 새 초안은 이전 버전의 가정을 복사해 오므로 비우고 쓴다
    const carrier = await screen.findByLabelText("제품 1 운반 자원 빈 차 이동(분)", {}, slow);
    await user.clear(carrier);
    await user.type(carrier, "3");
    await user.selectOptions(screen.getByLabelText("제품 1 다음 공간이 가득 찰 때 설비 산출"), "hold");
    const reason = screen.getByLabelText("가정 사유") as HTMLTextAreaElement;
    if (!reason.value.trim()) await user.type(reason, "FE 실서버 쓰기 검증(운반 빈 차 이동 3분, 산출 보류 명시).");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("시나리오 버전을 저장했습니다.", {}, slow);
    const saved = await get<Schemas["ScenarioVersionOut"]>(`/projects/${runProject}/scenario-versions/${draftId}`);
    expect(Number(saved.products[0]!.assumptions?.carrier_empty_move_minutes)).toBe(3);
    expect(saved.products[0]!.assumptions?.out_release).toBe("hold");

    // 3) 사전검증 → 승인
    await user.click(screen.getByRole("button", { name: "실행 사전검증" }));
    await screen.findByText("실행할 수 있습니다", {}, slow);
    await user.click(screen.getByRole("button", { name: "승인" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "승인" }));
    await screen.findByText(/시나리오 버전을 승인했습니다/, {}, slow);

    // 4) 실행 요청 → 종료까지 상태 자동 갱신
    await user.clear(screen.getByLabelText("seed"));
    await user.type(screen.getByLabelText("seed"), String(7000 + Math.floor(Math.random() * 1000)));
    await user.click(screen.getByRole("button", { name: "실행 요청" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/runs\/[^/]+$/), slow);
    const runId = router.state.location.pathname.split("/").pop()!;
    const t0 = Date.now();
    await waitFor(
      () => {
        expect(screen.getByRole("heading", { name: "상태" })).toBeInTheDocument();
        expect(screen.queryByText(/진행 중입니다\. 자동으로 갱신됩니다/)).not.toBeInTheDocument();
      },
      { timeout: TERMINAL_MS, interval: 500 },
    );
    const polls = seen.filter((s) => s === `GET /api/v1/projects/${runProject}/runs/${runId}`).length;
    const run = await get<Schemas["RunOut"]>(`/projects/${runProject}/runs/${runId}`);
    console.info(`[FE-12a] run ${runId} → ${run.status} (${Math.round((Date.now() - t0) / 1000)}초, 상태 조회 ${polls}회)`);
    expect(["completed", "stalled", "horizon_reached", "limit_reached"]).toContain(run.status);
    expect(polls).toBeGreaterThan(1); // 화면이 스스로 다시 물어 종료 상태에 닿았다
    const input = await get<Record<string, unknown>>(`/projects/${runProject}/runs/${runId}/input`);
    expect(JSON.stringify(input)).toContain("carrier_empty_move_minutes");

    // 5) 결과 리포트
    await user.click(await screen.findByRole("link", { name: "결과 리포트 보기" }, slow));
    expect(await screen.findByText("이 리포트의 한계", {}, slow)).toBeInTheDocument();
    expect(screen.getAllByRole("region", { name: /^제품 결과: / }).length).toBeGreaterThan(0);
  });
});
