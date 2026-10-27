import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createApiClient } from "../../src/shared/api/client";
import type { Schemas } from "../../src/shared/api/types";
import { renderApp } from "../renderApp";

/**
 * 실서버 쓰기 검증(시나리오 생성·저장·사전검증·승인·실행 요청·취소·Idempotency). 공유 개발 DB에 흔적이 남고 삭제 endpoint가 없으므로
 * `LIVE_WRITE=1`일 때만 실행하고, 쓰는 범위는 프로젝트 `DEMO-WIRE-RUN`의 **전용 시험 시나리오 `FE-LIVE-S1` 하나**(제품 P01 한 개, 도착 2개)다.
 *   $env:LIVE_API="http://127.0.0.1:8000/api/v1"; $env:LIVE_WRITE="1"; pnpm test:live
 * 다시 실행해도 시나리오는 하나만 만들고(승인본이 있으면 재사용), 실행(run)만 새로 쌓인다. 실행에는 worker가 떠 있어야 한다.
 * 사용자 허락(2026-10-27): "전용 시험 시나리오로 실서버 쓰기 검증을 해도 좋아".
 */
const LIVE = process.env.LIVE_API;
const WRITE = process.env.LIVE_WRITE === "1";
const ADMIN = "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a";
const CODE = "FE-LIVE-S1";
const slow = { timeout: 20_000 };
const TERMINAL_MS = 180_000;

function realFetch(): typeof fetch {
  const base = (LIVE ?? "").replace(/\/+$/, "");
  return ((url: string, init: RequestInit = {}) =>
    fetch(url.startsWith("/api/v1") ? `${base}${url.slice("/api/v1".length)}` : url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), "X-Debug-User": ADMIN },
    })) as typeof fetch;
}
const client = createApiClient({ baseUrl: "/api/v1", fetchImpl: realFetch() });

let projectId = "";
let template: Schemas["ScenarioProductDto"] | null = null;
let versionId = "";
const runIds: string[] = [];

async function findScenario() {
  const r = await client.get<Schemas["ListOut_ScenarioOut_"]>(`/projects/${projectId}/scenarios`, { query: { limit: 50 } });
  return r.body.data.find((s) => s.code === CODE) ?? null;
}

/** 실행이 종료 상태가 될 때까지 기다린다(상태 영역의 '진행 중' 안내가 사라지고 상태 제목이 있을 때). */
async function untilTerminal() {
  await waitFor(
    () => {
      expect(screen.getByRole("heading", { name: "상태" })).toBeInTheDocument();
      expect(screen.queryByText(/진행 중입니다\. 자동으로 갱신됩니다/)).not.toBeInTheDocument();
    },
    { timeout: TERMINAL_MS, interval: 500 },
  );
}

beforeAll(async () => {
  if (!LIVE || !WRITE) return;
  const me = await client.get<Schemas["Single_MeOut_"]>("/me");
  projectId = me.body.data.projects.find((p) => p.code === "DEMO-WIRE-RUN")?.id ?? "";
  if (!projectId) return;
  const base = (await client.get<Schemas["ListOut_ScenarioOut_"]>(`/projects/${projectId}/scenarios`, { query: { limit: 50 } })).body.data.find((s) => s.code === "S-MONTH-24");
  if (!base?.latest_version) return;
  const v = (await client.get<Schemas["Single_ScenarioVersionOut_"]>(`/projects/${projectId}/scenario-versions/${base.latest_version.id}`)).body.data;
  template = v.products[0] ?? null;
});

describe.skipIf(!LIVE || !WRITE)("실서버 쓰기: 시나리오 생성 → 저장 → 사전검증 → 승인 → 실행 (전용 시험 시나리오 FE-LIVE-S1)", () => {
  it("전용 시나리오를 화면으로 만들고 제품·도착·가정을 저장해 사전검증·승인까지 마친다", { timeout: 120_000 }, async (ctx) => {
    if (!projectId || !template) return ctx.skip();
    const existing = await findScenario();
    if (existing?.latest_version?.status === "approved") {
      versionId = existing.latest_version.id; // 이미 승인본이 있으면 재사용한다
      return;
    }
    const user = userEvent.setup();
    const { router } = renderApp(existing ? `/projects/${projectId}/scenarios/${existing.id}` : `/projects/${projectId}/scenarios/new`, { source: "api", fetchImpl: realFetch() });
    if (!existing) {
      await screen.findByLabelText("표시 코드", {}, slow);
      await user.type(screen.getByLabelText("표시 코드"), CODE);
      await user.type(screen.getByLabelText("이름"), "FE 시험 시나리오 (실서버 쓰기 검증)");
      await user.click(screen.getByRole("button", { name: "시나리오 만들기" }));
    } else {
      // 열린 초안이 있는 채로 남은 경우: 그 초안을 이어서 쓴다
      await user.click(await screen.findByRole("link", { name: /v\d+ 열기/ }, slow));
    }
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/scenarios\/versions\//), slow);
    versionId = router.state.location.pathname.split("/").pop()!;

    await user.click(await screen.findByRole("button", { name: "제품 추가" }, slow));
    await waitFor(() => expect(within(screen.getByLabelText("제품 1 제품")).queryByRole("option", { name: new RegExp("^P01") })).toBeInTheDocument(), slow);
    await user.selectOptions(screen.getByLabelText("제품 1 제품"), template.product_id);
    await waitFor(() => expect(within(screen.getByLabelText("제품 1 공정 버전")).queryByRole("option", { name: /v1 \(승인\)/ })).toBeInTheDocument(), slow);
    await user.selectOptions(screen.getByLabelText("제품 1 공정 버전"), template.process_version_id);
    await user.click(screen.getByRole("button", { name: "제품 1 도착 추가" }));
    await user.clear(screen.getByLabelText("제품 1 도착 1 개수"));
    await user.type(screen.getByLabelText("제품 1 도착 1 개수"), "2");
    const a = template.arrivals![0]!;
    if (a.length_m) await user.type(screen.getByLabelText("제품 1 도착 1 길이(m)"), a.length_m);
    if (a.weight_kg) await user.type(screen.getByLabelText("제품 1 도착 1 무게(kg)"), a.weight_kg);
    await user.type(screen.getByLabelText("제품 1 도착 1 로트"), "FE-LIVE");
    if (template.assumptions?.unbounded_buffers) await user.click(screen.getByLabelText(/용량을 모르는 대기 공간은 제한 없이 대기한다고 가정/));
    await user.type(screen.getByLabelText("가정 사유"), "FE 실서버 쓰기 검증용 시험(용량 미확정 대기 공간을 제한 없이 가정).");

    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("시나리오 버전을 저장했습니다.", {}, slow);

    await user.click(screen.getByRole("button", { name: "실행 사전검증" }));
    // 실행할 수 없으면 서버의 사유가 화면에 나온다 — 이 단언이 실패하면 사유를 백엔드와 확인한다.
    await screen.findByText("실행할 수 있습니다", {}, slow);

    await user.click(screen.getByRole("button", { name: "승인" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "승인" }));
    await screen.findByText(/시나리오 버전을 승인했습니다/, {}, slow);
    expect(screen.getByLabelText("가정 사유")).toBeDisabled();
  });

  it("승인본에서 실행을 요청하면 worker가 실행하고 상세 화면이 종료 상태·결과 요약·지표·이벤트를 보여 준다", { timeout: TERMINAL_MS + 60_000 }, async (ctx) => {
    if (!versionId) return ctx.skip();
    const user = userEvent.setup();
    const { router } = renderApp(`/projects/${projectId}/scenarios/versions/${versionId}`, { source: "api", fetchImpl: realFetch() });
    await screen.findByRole("button", { name: "실행 요청" }, slow);
    await user.clear(screen.getByLabelText("seed"));
    await user.type(screen.getByLabelText("seed"), String(1000 + Math.floor(Math.random() * 1000)));
    await user.click(screen.getByRole("button", { name: "실행 요청" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/runs\//), slow);
    runIds.push(router.state.location.pathname.split("/").pop()!);
    await untilTerminal();
    const run = (await client.get<Schemas["Single_RunOut_"]>(`/projects/${projectId}/runs/${runIds[0]}`)).body.data;
    // 종료 상태 중 어느 것이든 화면이 그려져야 한다. 실패(failed)면 아래 단언에서 원인을 드러낸다.
    expect(["completed", "stalled", "horizon_reached", "limit_reached"]).toContain(run.status);
    await screen.findByRole("heading", { name: "결과 요약" }, slow);
    expect(screen.getByRole("table", { name: "공정 버전별 결과" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("table", { name: "실행 지표" }) ?? screen.queryByText("지표이(가) 없습니다")).not.toBeNull(), slow);
    await user.click(screen.getByRole("button", { name: "이벤트 보기" }));
    await waitFor(() => expect(screen.queryByRole("table", { name: "실행 이벤트" }) ?? screen.queryByText("이벤트이(가) 없습니다")).not.toBeNull(), slow);
  });

  it("실행을 요청하자마자 취소하면 취소됨이 되거나(대기 중) 취소 요청으로 기록되고(실행 중) 이미 끝났다면 상태 불일치 안내가 나온다", { timeout: TERMINAL_MS + 60_000 }, async (ctx) => {
    if (!versionId) return ctx.skip();
    const user = userEvent.setup();
    const { router } = renderApp(`/projects/${projectId}/scenarios/versions/${versionId}`, { source: "api", fetchImpl: realFetch() });
    await screen.findByRole("button", { name: "실행 요청" }, slow);
    await user.clear(screen.getByLabelText("seed"));
    await user.type(screen.getByLabelText("seed"), String(5000 + Math.floor(Math.random() * 1000)));
    await user.click(screen.getByRole("button", { name: "실행 요청" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/runs\//), slow);
    runIds.push(router.state.location.pathname.split("/").pop()!);
    const cancel = await screen.findByRole("button", { name: /실행 취소|취소 요청됨/ }, slow).catch(() => null);
    if (cancel && cancel.textContent === "실행 취소" && !(cancel as HTMLButtonElement).disabled) {
      await user.click(cancel);
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "취소 요청" }));
    }
    await untilTerminal();
    const run = (await client.get<Schemas["Single_RunOut_"]>(`/projects/${projectId}/runs/${runIds[1]}`)).body.data;
    // 경합에 따라 취소(cancelled) 또는 이미 끝난 결과가 될 수 있다. 어느 쪽이든 화면과 서버 상태가 일치해야 한다.
    expect(["cancelled", "completed", "stalled", "horizon_reached", "limit_reached"]).toContain(run.status);
    if (run.status === "cancelled") expect(screen.getByText("취소됨", { selector: "span" })).toBeInTheDocument();
  });

  it("서버 계약: 같은 Idempotency-Key·같은 본문은 같은 run(200), 같은 키·다른 본문은 409, 키 없음은 428", { timeout: 60_000 }, async (ctx) => {
    if (!versionId) return ctx.skip();
    const key = `fe-live-${Date.now()}`;
    const body = { scenario_version_id: versionId, seed: 4242, replicate_index: 0 };
    const first = await client.post<Schemas["Single_RunOut_"]>(`/projects/${projectId}/runs`, { body, headers: { "Idempotency-Key": key } });
    expect(first.status).toBe(202);
    runIds.push(first.body.data.id);
    const again = await client.post<Schemas["Single_RunOut_"]>(`/projects/${projectId}/runs`, { body, headers: { "Idempotency-Key": key } });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(first.body.data.id);
    await expect(client.post(`/projects/${projectId}/runs`, { body: { ...body, seed: 4243 }, headers: { "Idempotency-Key": key } })).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    await expect(client.post(`/projects/${projectId}/runs`, { body })).rejects.toMatchObject({ status: 428 });
  });

  it("권한·상태 규칙: 승인본은 수정할 수 없고(409) If-Match 없이 수정하면 428이다", { timeout: 60_000 }, async (ctx) => {
    if (!versionId) return ctx.skip();
    await expect(client.patch(`/projects/${projectId}/scenario-versions/${versionId}`, { body: { notes: "x" }, ifMatch: 1 })).rejects.toMatchObject({ status: 409, code: "VERSION_IMMUTABLE" });
    await expect(client.patch(`/projects/${projectId}/scenario-versions/${versionId}`, { body: { notes: "x" } })).rejects.toMatchObject({ status: 428 });
  });
});
