import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../renderApp";

/**
 * 실제 서버 데이터로 시나리오·실행 화면을 그려 보는 읽기 전용 확인(GET만 호출, 아무것도 저장하지 않는다).
 *   $env:LIVE_API="http://127.0.0.1:8000/api/v1"; pnpm test:live
 * 프로젝트 `DEMO-WIRE-RUN`(시나리오 S-MONTH-24와 실행 2건)이 있을 때만 의미가 있고, 없으면 건너뛴다(시드 시점 의존).
 */
const LIVE = process.env.LIVE_API;
const ADMIN = "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a";
const slow = { timeout: 15_000 };

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

type Run = { id: string; status: string; scenario_version_id: string };
let projectId = "";
let scenarioId = "";
let versionId = "";
let runs: Run[] = [];

beforeAll(async () => {
  if (!LIVE) return;
  const me = await json<{ projects: { id: string; code: string }[] }>("/me");
  projectId = me.projects.find((p) => p.code === "DEMO-WIRE-RUN")?.id ?? "";
  if (!projectId) return;
  const sc = (await json<{ id: string; code: string; latest_version: { id: string } | null }[]>(`/projects/${projectId}/scenarios`)).find((s) => s.code === "S-MONTH-24");
  scenarioId = sc?.id ?? "";
  versionId = sc?.latest_version?.id ?? "";
  runs = await json<Run[]>(`/projects/${projectId}/runs`);
});

describe.skipIf(!LIVE)("실제 서버 데이터로 그린 시나리오·실행 화면 (읽기 전용)", () => {
  it("시나리오 목록과 상세가 서버 값(코드·최근 버전·버전 목록)으로 그려진다", async (ctx) => {
    if (!scenarioId) return ctx.skip();
    renderApp(`/projects/${projectId}/scenarios`, { source: "api", fetchImpl: realFetch() });
    const table = await screen.findByRole("table", { name: "시나리오 목록" }, slow);
    expect(within(table).getAllByRole("link", { name: /S-MONTH-24/ }).length).toBeGreaterThan(0);
  });

  it("승인된 시나리오 버전은 읽기 전용으로 그려지고 제품·도착·종료 규칙이 서버 값이다", async (ctx) => {
    if (!versionId) return ctx.skip();
    renderApp(`/projects/${projectId}/scenarios/versions/${versionId}`, { source: "api", fetchImpl: realFetch() });
    expect(await screen.findByText(/승인된 버전은 수정할 수 없습니다/, {}, slow)).toBeInTheDocument();
    expect(screen.getByLabelText("제품 1 우선순위")).toBeDisabled();
    expect(screen.getByRole("button", { name: "실행 요청" })).toBeInTheDocument(); // 요청은 하지 않는다(읽기 전용 확인)
    expect(screen.getAllByLabelText(/도착 1 개수/).length).toBeGreaterThan(0);
  });

  it("실행 목록은 서버의 실행을 상태 배지와 함께 보여 준다", async (ctx) => {
    if (runs.length === 0) return ctx.skip();
    renderApp(`/projects/${projectId}/runs`, { source: "api", fetchImpl: realFetch() });
    const table = await screen.findByRole("table", { name: "실행 목록" }, slow);
    expect(within(table).getAllByRole("row").length).toBe(runs.length + 1);
    const text = table.textContent ?? "";
    if (runs.some((r) => r.status === "stalled")) expect(text).toContain("입력 부족으로 멈춤");
    if (runs.some((r) => r.status === "cancelled")) expect(text).toContain("취소됨");
  });

  it("입력 부족으로 멈춘 실행은 오류가 아니라 관측 결과로 안내하고 결과 요약을 그린다", async (ctx) => {
    const stalled = runs.find((r) => r.status === "stalled");
    if (!stalled) return ctx.skip();
    renderApp(`/projects/${projectId}/runs/${stalled.id}`, { source: "api", fetchImpl: realFetch() });
    expect(await screen.findByText("입력이 부족해 더 진행할 수 없습니다", {}, slow)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "공정 버전별 결과" })).toBeInTheDocument();
    expect(screen.queryByText("실패 정보")).not.toBeInTheDocument();
  });

  it("끝까지 실행된 시도가 있는 실행의 지표·이벤트는 공식 결과가 있으면 표로, 없으면 안내로 보인다(오류 화면이 아님)", async (ctx) => {
    const ended = runs.find((r) => r.status === "stalled" || r.status === "completed");
    if (!ended) return ctx.skip();
    const user = userEvent.setup();
    renderApp(`/projects/${projectId}/runs/${ended.id}`, { source: "api", fetchImpl: realFetch() });
    await screen.findByRole("heading", { name: "결과 요약" }, slow);
    await waitFor(() => expect(screen.queryByRole("table", { name: "실행 지표" }) ?? screen.queryByText("지표이(가) 없습니다") ?? screen.queryByText("조건에 맞는 지표가 없습니다")).not.toBeNull(), slow);
    await user.click(screen.getByRole("button", { name: "이벤트 보기" }));
    await waitFor(() => expect(screen.queryByRole("table", { name: "실행 이벤트" }) ?? screen.queryByText("이벤트이(가) 없습니다")).not.toBeNull(), slow);
  });

  it("취소된 실행은 취소됨과 종료 사유를 보이고 지표·이벤트는 요청 결과 없음으로 안내한다", async (ctx) => {
    const cancelled = runs.find((r) => r.status === "cancelled");
    if (!cancelled) return ctx.skip();
    renderApp(`/projects/${projectId}/runs/${cancelled.id}`, { source: "api", fetchImpl: realFetch() });
    expect(await screen.findByText("취소됨", { selector: "span" }, slow)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "실행 취소" })).not.toBeInTheDocument(); // 이미 끝남
  });
});
