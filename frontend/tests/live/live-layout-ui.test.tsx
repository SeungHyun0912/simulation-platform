import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../renderApp";

/**
 * 배치판 실서버 검증(계약 0.17.0).
 *   읽기:  $env:LIVE_API="http://127.0.0.1:8000/api/v1"; pnpm vitest run tests/live/live-layout-ui.test.tsx
 *   쓰기:  위에 $env:LIVE_WRITE="1"; $env:LIVE_LAYOUT="1" 추가 — DEMO-A에 배치판 초안 하나를 만들거나 이어 쓴다(승인하지 않음).
 *          Backend 안내(2026-10-29): FE 시험은 DEMO-A에서만, DEMO-WIRE·DEMO-WIRE-RUN에는 배치판 초안을 만들지 않는다.
 */
const LIVE = process.env.LIVE_API;
const WRITE = process.env.LIVE_WRITE === "1" && process.env.LIVE_LAYOUT === "1";
const ADMIN = "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a";
const slow = { timeout: 20_000 };

function realFetch(): typeof fetch {
  const base = (LIVE ?? "").replace(/\/+$/, "");
  return ((url: string, init: RequestInit = {}) =>
    fetch(url.startsWith("/api/v1") ? `${base}${url.slice("/api/v1".length)}` : url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), "X-Debug-User": ADMIN },
    })) as typeof fetch;
}
async function json<T>(path: string): Promise<T> {
  return ((await (await realFetch()(`/api/v1${path}`)).json()) as { data: T }).data;
}

let demoA = "";
beforeAll(async () => {
  if (!LIVE) return;
  const me = await json<{ projects: { id: string; code: string }[] }>("/me");
  demoA = me.projects.find((p) => p.code === "DEMO-A")?.id ?? "";
});

describe.skipIf(!LIVE)("배치판 화면 (실서버 읽기)", () => {
  it("배치판 목록이 서버 값(없으면 빈 상태, 있으면 버전 표)으로 그려진다", async (ctx) => {
    if (!demoA) return ctx.skip();
    const versions = await json<{ id: string }[]>(`/projects/${demoA}/layout-versions`);
    renderApp(`/projects/${demoA}/layouts`, { source: "api", fetchImpl: realFetch() });
    if (versions.length === 0) expect(await screen.findByText("배치판이 없습니다", {}, slow)).toBeInTheDocument();
    else expect(within(await screen.findByRole("table", { name: "배치판 버전" }, slow)).getAllByRole("row")).toHaveLength(versions.length + 1);
  });

  it("배치판이 있으면 최신 버전 편집 화면이 서버의 점·배치·경로 수로 그려진다", async (ctx) => {
    if (!demoA) return ctx.skip();
    const [latest] = await json<{ id: string }[]>(`/projects/${demoA}/layout-versions`);
    if (!latest) return ctx.skip();
    const v = await json<{ points: unknown[]; placements: unknown[]; routes: unknown[] }>(`/projects/${demoA}/layout-versions/${latest.id}`);
    renderApp(`/projects/${demoA}/layouts/${latest.id}`, { source: "api", fetchImpl: realFetch() });
    expect(await screen.findByText(new RegExp(`점 ${v.points.length} · 배치 ${v.placements.length} · 경로 ${v.routes.length}`), {}, slow)).toBeInTheDocument();
  });
});

describe.skipIf(!LIVE)("실데이터 배치판(DEMO-WIRE v1 승인본, 설비 96대) 읽기", () => {
  // Backend 안내(2026-10-29): DEMO-WIRE v1 = 0e7592fb…, 도면 269.9 × 215.9 m, 점·경로 없음, 회전 0, attributes.source·inside 원문
  const VID = "0e7592fb-5947-44c8-b2aa-995a803acc40";
  it("승인본을 읽기 전용으로 그리고 96대 배치·도면 크기·원본 값을 서버 값 그대로 보인다", { timeout: 60_000 }, async (ctx) => {
    const me = await json<{ projects: { id: string; code: string }[] }>("/me");
    const wire = me.projects.find((p) => p.code === "DEMO-WIRE")?.id;
    if (!wire) return ctx.skip();
    const r = await realFetch()(`/api/v1/projects/${wire}/layout-versions/${VID}`);
    if (r.status === 404) return ctx.skip();
    const v = ((await r.json()) as { data: { placements: { asset_code: string; asset_name: string; attributes: Record<string, unknown> }[] } }).data;
    const user = userEvent.setup();
    renderApp(`/projects/${wire}/layouts/${VID}`, { source: "api", fetchImpl: realFetch() });
    expect(await screen.findByText(new RegExp(`범위 269\\.9 × 215\\.9 m\\(도면 크기\\) · 점 0 · 배치 ${v.placements.length} · 경로 0`), {}, slow)).toBeInTheDocument();
    expect(screen.getByText("승인된 배치판은 바꿀 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "점 추가" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "배치 목록" })).getAllByRole("row")).toHaveLength(v.placements.length + 1);
    const withInside = v.placements.find((p) => "inside" in p.attributes)!;
    await user.click(screen.getByRole("button", { name: `배치 ${withInside.asset_code} 선택` }));
    const panel = screen.getByRole("region", { name: `배치 ${withInside.asset_code} ${withInside.asset_name} 속성` });
    expect(within(panel).getByLabelText("원본 값")).toHaveTextContent(`inside: ${String(withInside.attributes.inside)}`);
    expect(within(panel).getByLabelText("원본 값")).toHaveTextContent("anchor=top_left");
  });
});

describe.skipIf(!LIVE)("실데이터 배치판 v2(DEMO-WIRE, 설비 96 + 저장공간 22) 읽기", () => {
  // Backend 안내(2026-10-29): v2 = c9eeef72…, 공간을 먼저·설비를 위에, 설비 46대에 inside_space(위치로 계산한 소속 공간 코드)
  const VID = "c9eeef72-ed6c-40d1-b2a5-4459138285c3";
  it("118개 배치를 그리고 공간이 설비보다 먼저(아래) 그려지며, 소속 공간을 inside_space로 보인다", { timeout: 60_000 }, async (ctx) => {
    const me = await json<{ projects: { id: string; code: string }[] }>("/me");
    const wire = me.projects.find((p) => p.code === "DEMO-WIRE")?.id;
    if (!wire) return ctx.skip();
    const r = await realFetch()(`/api/v1/projects/${wire}/layout-versions/${VID}`);
    if (r.status === 404) return ctx.skip();
    const v = ((await r.json()) as { data: { placements: { asset_code: string; asset_name: string; asset_kind: string; attributes: Record<string, unknown> }[] } }).data;
    const user = userEvent.setup();
    renderApp(`/projects/${wire}/layouts/${VID}`, { source: "api", fetchImpl: realFetch() });
    expect(await screen.findByText(new RegExp(`배치 ${v.placements.length} · 경로 0`), {}, slow)).toBeInTheDocument();
    const buttons = within(screen.getByRole("group", { name: /배치판 도면/ })).getAllByRole("button", { name: /^배치 / });
    const firstEq = buttons.findIndex((b) => /^배치 EQ-/.test(b.getAttribute("aria-label") ?? ""));
    const lastSpace = buttons.map((b) => /^배치 (ST|DK)-/.test(b.getAttribute("aria-label") ?? "")).lastIndexOf(true);
    expect(lastSpace).toBeLessThan(firstEq);
    const eq = v.placements.find((p) => typeof p.attributes.inside_space === "string")!;
    await user.click(screen.getByRole("button", { name: `배치 ${eq.asset_code} 선택` }));
    const panel = screen.getByRole("region", { name: `배치 ${eq.asset_code} ${eq.asset_name} 속성` });
    expect(within(panel).getByLabelText("소속 공간")).toHaveTextContent(`소속 공간: ${String(eq.attributes.inside_space)}`);
  });
});

describe.skipIf(!LIVE || !WRITE)("배치판 실서버 쓰기 (DEMO-A 초안 하나)", () => {
  it("초안을 만들거나 이어 쓰고, 점·배치·포트 매핑·경로를 저장한 뒤 서버 반올림 값과 경로 길이를 보고 검증한다", { timeout: 120_000 }, async (ctx) => {
    if (!demoA) return ctx.skip();
    const user = userEvent.setup();
    const versions = await json<{ id: string; status: string }[]>(`/projects/${demoA}/layout-versions`);
    let draft = versions.find((v) => v.status === "draft");
    const { router } = renderApp(`/projects/${demoA}/layouts`, { source: "api", fetchImpl: realFetch() });
    if (!draft) {
      await user.click(await screen.findByRole("button", { name: "새 초안 만들기" }, slow));
      await waitFor(() => expect(router.state.location.pathname).toMatch(/\/layouts\/[^/]+$/), slow);
      draft = { id: router.state.location.pathname.split("/").pop()!, status: "draft" };
    } else {
      await user.click(await screen.findByRole("link", { name: /배치판 v\d+ 열기/ }, slow));
      await waitFor(() => expect(router.state.location.pathname).toContain(draft!.id), slow);
    }
    await screen.findByRole("heading", { name: "도면" }, slow);
    await user.click(screen.getByText("엑셀에서 붙여 넣기"));
    fireEvent.change(screen.getByLabelText("점 붙여 넣기(이름, x, y)"), { target: { value: "FE1\t5.05\t5\nFE2\t15\t5\nFE3\t15\t12" } });
    await user.click(screen.getByRole("button", { name: "점 반영" }));
    fireEvent.change(screen.getByLabelText(/배치 붙여 넣기/), { target: { value: "EQ-001\t3\t5\t4\t2\t0\nEQ-002\t17\t12\t4\t2\t90" } });
    await user.click(screen.getByRole("button", { name: "배치 반영" }));
    await user.click(screen.getByRole("button", { name: "배치 EQ-001 선택" }));
    const p1 = screen.getByRole("region", { name: /배치 EQ-001 .* 속성/ });
    await user.selectOptions(within(p1).getByLabelText(/^OUT .* 점$/), "FE1");
    await user.click(screen.getByRole("button", { name: "배치 EQ-002 선택" }));
    const p2 = screen.getByRole("region", { name: /배치 EQ-002 .* 속성/ });
    await user.selectOptions(within(p2).getByLabelText(/^IN .* 점$/), "FE3");
    // 다시 돌릴 때: 이전 실행이 남긴 경로 FE-R1을 지우고 새로 그린다(같은 초안을 이어 씀)
    const old = screen.queryByRole("button", { name: "경로 FE-R1 선택" });
    if (old) {
      await user.click(old);
      await user.click(screen.getByRole("button", { name: "경로 삭제" }));
    }
    await user.click(screen.getByRole("button", { name: "경로 그리기" }));
    const panel = screen.getByRole("region", { name: "경로 그리기" });
    await user.type(within(panel).getByLabelText("경로 이름"), "FE-R1");
    const from = within(panel).getByLabelText("출발 포트");
    await user.selectOptions(from, within(from).getByRole("option", { name: /^EQ-001 OUT/ }));
    await user.click(screen.getByRole("button", { name: /^점 FE2 \(/ }));
    await user.click(screen.getByRole("button", { name: /^점 FE3 \(/ }));
    const to = within(panel).getByLabelText("도착 포트");
    await user.selectOptions(to, within(to).getByRole("option", { name: /^EQ-002 IN/ }));
    await user.click(within(panel).getByRole("button", { name: "경로 만들기" }));
    await user.click(screen.getByRole("button", { name: "내용 저장" }));
    await screen.findByText(/배치판 내용을 저장했습니다/, {}, slow);
    // 서버 반올림(5.05 → 5.1)과 길이: FE1(5.1,5)→FE2(15,5) 9.9 + FE2→FE3(15,12) 7 = 16.9
    expect(screen.getByRole("button", { name: /^점 FE1 \(5\.1, 5\.0\)/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "경로 목록" })).toHaveTextContent("16.9");
    await user.click(screen.getByRole("button", { name: "검증" }));
    await waitFor(() => expect(screen.queryByText(/승인할 수 있습니다|경고만 있어|오류가 있어/)).not.toBeNull(), slow);
  });
});
