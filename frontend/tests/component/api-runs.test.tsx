import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, ME, P1, type FakeServer } from "../fakeApi";
import { runId, scenarioVersionId } from "../fakeScenarios";
import { renderApp } from "../renderApp";

const slow = { timeout: 8000 };
const list = `/projects/${P1}/runs`;
const detail = (n: number) => `${list}/${runId(n)}`;

function open(path: string, server: FakeServer = createFakeServer()) {
  return { server, ...renderApp(path, { source: "api", fetchImpl: server.fetchImpl }) };
}

/** 대기 중(queued) run 하나를 서버 상태에 추가한다. */
function addRun(server: FakeServer, n: number, patch: Record<string, unknown> = {}) {
  const base = server.state.scenarios.runs[0]!;
  server.state.scenarios.runs.push({
    ...structuredClone(base),
    id: runId(n),
    status: "queued",
    started_at: null,
    finished_at: null,
    attempts: [],
    result: null,
    ...patch,
  } as never);
}

describe("API 모드: 실행 목록", () => {
  it("서버의 실행을 상태·시각·seed와 함께 보여 주고 상세로 이동한다", async () => {
    open(list);
    const table = await screen.findByRole("table", { name: "실행 목록" }, slow);
    expect(within(table).getByText("완료")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: /실행 ffffffff 상세/ })).toHaveAttribute("href", detail(1));
    expect(screen.queryByText(/예시/)).not.toBeInTheDocument();
  });

  it("상태 필터는 서버 쿼리가 되고 결과가 없으면 조건 지우기를 안내한다", async () => {
    const user = userEvent.setup();
    const { server } = open(list);
    await screen.findByRole("table", { name: "실행 목록" }, slow);
    await user.selectOptions(screen.getByLabelText("상태"), "failed");
    expect(await screen.findByText("검색 결과가 없습니다", {}, slow)).toBeInTheDocument();
    expect(server.requests.some((r) => r.path.endsWith("/runs") && r.query.get("status") === "failed")).toBe(true);
    await user.click(screen.getByRole("button", { name: "검색 조건 지우기" }));
    expect(await screen.findByRole("table", { name: "실행 목록" }, slow)).toBeInTheDocument();
  });

  it("실행이 없으면 승인한 시나리오 버전에서 요청하라고 안내한다", async () => {
    const server = createFakeServer();
    server.state.scenarios.runs = [];
    open(list, server);
    expect(await screen.findByText("실행 기록이 없습니다", {}, slow)).toBeInTheDocument();
  });

  it("정적 모드에서는 예시 대신 서버 연동 전용 안내만 보인다", () => {
    renderApp(list, { source: "static" });
    expect(screen.getByText(/서버 연동 모드에서만 사용할 수 있습니다/)).toBeInTheDocument();
  });

  it("목록을 불러오지 못하면 오류와 다시 시도를 보인다(정적 예시로 대체하지 않는다)", async () => {
    const server = createFakeServer((req, std) => (req.path.endsWith("/runs") ? errorBody(500, "INTERNAL_ERROR", "서버 오류") : std(req)));
    open(list, server);
    expect(await screen.findByRole("alert", {}, slow)).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "실행 목록" })).not.toBeInTheDocument();
  });
});

describe("API 모드: 실행 상세(진행·결과)", () => {
  it("진행 중인 실행은 자동으로 갱신되어 대기 → 실행 중 → 완료로 바뀌고 종료 후 멈춘다", async () => {
    const server = createFakeServer();
    addRun(server, 2);
    open(detail(2), server);
    await screen.findByText("완료", { selector: "span" }, slow);
    expect(screen.getByRole("heading", { name: "결과 요약" })).toBeInTheDocument();
    const gets = () => server.requests.filter((r) => r.method === "GET" && r.path === `/projects/${P1}/runs/${runId(2)}`).length;
    const settled = gets();
    expect(settled).toBeGreaterThanOrEqual(2); // 진행 중인 상태를 읽은 뒤 종료 상태까지 다시 읽었다
    await new Promise((r) => setTimeout(r, 200));
    expect(gets()).toBe(settled); // 종료 상태는 다시 바뀌지 않으므로 polling이 멈춘다
  });

  it("완료된 실행: 공정 버전별 결과를 보여 주고 시각은 min 값으로 표시한다", async () => {
    open(detail(1));
    const table = await screen.findByRole("table", { name: "공정 버전별 결과" }, slow);
    expect(within(table).getByText("100")).toBeInTheDocument();
    expect(screen.getAllByText("90.000000분").length).toBeGreaterThan(0);
    expect(screen.getByText(/공정\(제품\)의 생산량은 합산하지 않고/)).toBeInTheDocument();
    expect(screen.getByText("입력 해시")).toBeInTheDocument();
  });

  it("결과의 제품은 id 대신 제품 목록의 코드·이름으로 보이고, 목록에 없으면 id 앞 8자를 그대로 보인다", async () => {
    const server = createFakeServer();
    const base = server.state.scenarios.runs[0]!;
    base.result!.products!.push({ ...base.result!.products![0]!, product_id: "99999999-0000-4000-8000-000000000009", process_version_id: "88888888-0000-4000-8000-000000000008" });
    open(detail(1), server);
    const table = await screen.findByRole("table", { name: "공정 버전별 결과" }, slow);
    await waitFor(() => expect(within(table).getByText(/^P-001 /)).toBeInTheDocument(), slow);
    expect(within(table).getByText("제품 99999999")).toBeInTheDocument(); // 코드를 만들어 내지 않는다
  });

  it("쓰인 가정이 있으면 '가정 위의 결과'로 표시하고 용량 무제한 가정은 특별히 알린다", async () => {
    const server = createFakeServer();
    server.state.scenarios.runs[0]!.result!.assumptions = [{ code: "UNBOUNDED_BUFFERS", message: "용량을 모르는 대기 장소 5곳을 용량 제한 없이 대기하는 것으로 가정", node_key: null }];
    open(detail(1), server);
    expect(await screen.findByText("가정 위의 결과입니다", {}, slow)).toBeInTheDocument();
    expect(screen.getByText(/대기 공간 용량 때문에 생기는 지연·막힘은 반영되지 않았습니다/)).toBeInTheDocument();
  });

  it("가정이 없으면 '가정 위의 결과' 안내를 띄우지 않는다", async () => {
    open(detail(1));
    await screen.findByRole("table", { name: "공정 버전별 결과" }, slow);
    expect(screen.queryByText("가정 위의 결과입니다")).not.toBeInTheDocument();
  });

  it("입력 부족으로 멈춘(stalled) 실행은 오류가 아니라 관측 결과로 안내하고 부족한 입력을 보인다", async () => {
    const server = createFakeServer();
    const base = server.state.scenarios.runs[0]!;
    addRun(server, 3, {
      status: "stalled",
      finished_at: base.finished_at,
      result: { ...base.result!, state: "stalled", shortfalls: [{ process_version_id: "pv-aaaaaaaa", step: "압출", pool: "원자재", needed: 2, held: 1, waiting: 1 }] },
    });
    open(detail(3), server);
    expect(await screen.findByText("입력이 부족해 더 진행할 수 없습니다", {}, slow)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "부족한 입력" })).toBeInTheDocument();
    expect(screen.queryByText("실패 정보")).not.toBeInTheDocument();
  });

  it("입력 스냅샷은 펼칠 때만 불러오고 해시 검증 결과를 보인다", async () => {
    const user = userEvent.setup();
    const { server } = open(detail(1));
    await screen.findByRole("heading", { name: "결과 요약" }, slow);
    expect(server.requests.some((r) => r.path.endsWith("/input"))).toBe(false);
    await user.click(screen.getByRole("button", { name: "입력 스냅샷 보기" }));
    expect(await screen.findByText("✓ 일치", {}, slow)).toBeInTheDocument();
    expect(screen.getByLabelText("입력 스냅샷 JSON")).toHaveTextContent(scenarioVersionId(1));
  });

  it("없는 실행은 찾을 수 없음으로 안내한다", async () => {
    open(`${list}/${runId(99)}`);
    expect(await screen.findByText("실행을(를) 찾을 수 없습니다", {}, slow)).toBeInTheDocument();
  });
});

describe("API 모드: 실행 취소", () => {
  it("대기 중인 실행은 확인 후 바로 취소됨이 된다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    server.state.scenarios.autoAdvance = false;
    addRun(server, 2);
    open(detail(2), server);
    await user.click(await screen.findByRole("button", { name: "실행 취소" }, slow));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "취소 요청" }));
    expect(await screen.findByText("취소됨", { selector: "span" }, slow)).toBeInTheDocument();
    expect(server.writes().some((w) => w.path.endsWith(`/runs/${runId(2)}/cancel`))).toBe(true);
    expect(screen.getByText(/시작 전에 취소됨/)).toBeInTheDocument();
  });

  it("실행 중인 실행은 취소를 '요청'만 하며(요청 ≠ 실제 취소) 요청됨으로 표시한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    server.state.scenarios.autoAdvance = false;
    addRun(server, 2, { status: "running", started_at: "2026-10-27T01:00:01Z" });
    open(detail(2), server);
    await user.click(await screen.findByRole("button", { name: "실행 취소" }, slow));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "취소 요청" }));
    expect(await screen.findByText(/취소를 요청했습니다/, {}, slow)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "취소 요청됨" })).toBeDisabled();
    expect(screen.getByText("실행 중", { selector: "span" })).toBeInTheDocument(); // 아직 실제로 취소되지 않았다
  });

  it("이미 끝난 실행을 취소하려 하면(409) 서버 상태로 안내한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) => (req.path.endsWith("/cancel") ? errorBody(409, "JOB_CANCEL_TOO_LATE", "이미 끝났습니다.") : std(req)));
    server.state.scenarios.autoAdvance = false;
    addRun(server, 2);
    open(detail(2), server);
    await user.click(await screen.findByRole("button", { name: "실행 취소" }, slow));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "취소 요청" }));
    expect(await screen.findByText("상태가 바뀌어 저장할 수 없습니다", {}, slow)).toBeInTheDocument();
  });

  it("조회자는 취소할 수 없다", async () => {
    const server = createFakeServer((req, std) =>
      req.path === "/me" ? { status: 200, body: { data: { ...ME, projects: ME.projects.map((p) => (p.id === P1 ? { ...p, role: "viewer" } : p)) } } } : std(req),
    );
    server.state.scenarios.autoAdvance = false;
    addRun(server, 2);
    open(detail(2), server);
    const button = await screen.findByRole("button", { name: "실행 취소" }, slow);
    await waitFor(() => expect(button).toBeDisabled(), slow);
  });
});

describe("API 모드: 지표·이벤트", () => {
  it("지표는 정의(설명·단위)를 서버에서 가져오고 null은 0이 아니라 '해당 없음'으로 보인다", async () => {
    open(detail(1));
    const table = await screen.findByRole("table", { name: "실행 지표" }, slow);
    expect(within(table).getByText("완제품 milestone에 도달한 작업물 수")).toBeInTheDocument(); // metric-definitions의 설명
    const rows = within(table).getAllByRole("row");
    const lead = rows.find((r) => within(r).queryByText("lead_time_avg_min"))!;
    expect(within(lead).getByText("해당 없음")).toBeInTheDocument();
    expect(within(lead).queryByText("0")).not.toBeInTheDocument();
    const util = rows.find((r) => within(r).queryByText("utilization"))!;
    expect(within(util).getByText("0.5")).toBeInTheDocument();
    expect(within(util).getByText("ratio")).toBeInTheDocument();
  });

  it("구간과 지표 필터는 서버 쿼리가 된다", async () => {
    const user = userEvent.setup();
    const { server } = open(detail(1));
    await screen.findByRole("table", { name: "실행 지표" }, slow);
    await user.selectOptions(screen.getByLabelText("구간"), "day");
    await user.selectOptions(screen.getByRole("combobox", { name: "지표" }), "utilization");
    await waitFor(() => expect(server.requests.some((r) => r.path.endsWith("/metrics") && r.query.get("window") === "day" && r.query.get("metric_key") === "utilization")).toBe(true), slow);
    expect(await screen.findByText("utilization", { selector: "code" }, slow)).toBeInTheDocument();
  });

  it("불완전한 결과(quality_status)는 완료 결과처럼 보이지 않게 경고한다", async () => {
    const server = createFakeServer((req, std) => {
      const r = std(req);
      if (req.path.endsWith("/metrics")) {
        const body = r.body as { data: { quality_status: string }[] };
        body.data.forEach((m) => (m.quality_status = "incomplete"));
      }
      return r;
    });
    open(detail(1), server);
    expect(await screen.findByText("불완전한 관측", {}, slow)).toBeInTheDocument();
  });

  it("진행 중인 실행은 지표·이벤트를 요청하지 않고 끝나면 보여 준다는 안내만 보인다", async () => {
    const server = createFakeServer();
    server.state.scenarios.autoAdvance = false;
    addRun(server, 2, { status: "running" });
    open(detail(2), server);
    expect(await screen.findByText("실행이 끝나면 지표를 볼 수 있습니다", {}, slow)).toBeInTheDocument();
    expect(screen.getByText("실행이 끝나면 이벤트를 볼 수 있습니다")).toBeInTheDocument();
    expect(server.requests.some((r) => r.path.endsWith("/metrics") || r.path.endsWith("/events"))).toBe(false);
  });

  it("공식 결과가 없으면(409 RUN_RESULT_NOT_AVAILABLE) 오류가 아니라 안내로 보인다", async () => {
    const server = createFakeServer((req, std) => (req.path.endsWith("/metrics") ? errorBody(409, "RUN_RESULT_NOT_AVAILABLE", "공식 결과가 없습니다.") : std(req)));
    open(detail(1), server);
    expect(await screen.findByText("지표이(가) 없습니다", {}, slow)).toBeInTheDocument();
    expect(screen.getByText(/끝까지 실행된 시도가 있어야 합니다/)).toBeInTheDocument();
  });

  it("이벤트는 펼칠 때 100건을 읽고 '더 보기'로 cursor를 따라 이어 읽으며 모르는 종류는 원문으로 보인다", async () => {
    const user = userEvent.setup();
    const { server } = open(detail(1));
    await screen.findByRole("table", { name: "실행 지표" }, slow);
    expect(server.requests.some((r) => r.path.endsWith("/events"))).toBe(false);
    await user.click(screen.getByRole("button", { name: "이벤트 보기" }));
    const table = await screen.findByRole("table", { name: "실행 이벤트" }, slow);
    expect(within(table).getAllByRole("row")).toHaveLength(101); // 머리글 + 100건
    expect(within(table).getAllByText("FUTURE_EVENT_KIND").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(within(screen.getByRole("table", { name: "실행 이벤트" })).getAllByRole("row")).toHaveLength(151), slow);
    expect(server.requests.filter((r) => r.path.endsWith("/events")).map((r) => r.query.get("cursor"))).toEqual([null, "100"]);
    expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
  });

  it("이벤트 종류 필터는 서버 쿼리가 된다", async () => {
    const user = userEvent.setup();
    const { server } = open(detail(1));
    await screen.findByRole("table", { name: "실행 지표" }, slow);
    await user.click(screen.getByRole("button", { name: "이벤트 보기" }));
    await screen.findByRole("table", { name: "실행 이벤트" }, slow);
    await user.type(screen.getByLabelText("이벤트 종류"), "ARRIVAL");
    await waitFor(() => expect(server.requests.some((r) => r.path.endsWith("/events") && r.query.get("event_type") === "ARRIVAL")).toBe(true), slow);
  });
});

describe("API 모드: 실행 요청의 재시도 안전성", () => {
  it("네트워크가 끊겨 처리 여부를 모를 때 다시 요청해도 같은 Idempotency-Key를 써서 실행이 하나만 생긴다", async () => {
    const user = userEvent.setup();
    const base = createFakeServer();
    let failed = false;
    const fetchImpl: typeof fetch = async (input, init) => {
      const u = new URL(String(input), "http://fake.local");
      if (init?.method === "POST" && u.pathname.endsWith("/runs") && !failed) {
        failed = true;
        // 서버는 처리했지만 응답을 받지 못한 상황을 흉내 낸다
        await base.fetchImpl(input as string, init);
        throw new TypeError("network down");
      }
      return base.fetchImpl(input as string, init);
    };
    renderApp(`/projects/${P1}/scenarios/versions/${scenarioVersionId(1)}`, { source: "api", fetchImpl });
    await screen.findByRole("heading", { level: 1, name: /SC-A v1/ }, slow);
    const before = base.state.scenarios.runs.length;
    await user.click(await screen.findByRole("button", { name: "실행 요청" }));
    expect(await screen.findByText(/요청이 처리되었는지 알 수 없습니다/, {}, slow)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "실행 요청" }));
    await waitFor(() => expect(base.requests.filter((r) => r.method === "POST" && r.path.endsWith("/runs"))).toHaveLength(2), slow);
    const keys = base.requests.filter((r) => r.method === "POST" && r.path.endsWith("/runs")).map((r) => r.headers["Idempotency-Key"]);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]); // 같은 본문의 재시도는 같은 키
    expect(base.state.scenarios.runs.length).toBe(before + 1); // 중복 실행 없음
  });

  it("재시도 전에 seed를 바꾸면 새 키를 쓴다(본문이 다르므로 서버가 409로 거부하지 않는다)", async () => {
    const user = userEvent.setup();
    const base = createFakeServer();
    let failed = false;
    const fetchImpl: typeof fetch = async (input, init) => {
      const u = new URL(String(input), "http://fake.local");
      if (init?.method === "POST" && u.pathname.endsWith("/runs") && !failed) {
        failed = true;
        throw new TypeError("network down"); // 서버에 닿지 못함
      }
      return base.fetchImpl(input as string, init);
    };
    const { router } = renderApp(`/projects/${P1}/scenarios/versions/${scenarioVersionId(1)}`, { source: "api", fetchImpl });
    await screen.findByRole("heading", { level: 1, name: /SC-A v1/ }, slow);
    await user.click(await screen.findByRole("button", { name: "실행 요청" }));
    await screen.findByText(/요청이 처리되었는지 알 수 없습니다/, {}, slow);
    await user.clear(screen.getByLabelText("seed"));
    await user.type(screen.getByLabelText("seed"), "7");
    await user.click(screen.getByRole("button", { name: "실행 요청" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/runs\//), slow);
    const posts = base.requests.filter((r) => r.method === "POST" && r.path.endsWith("/runs"));
    expect(posts).toHaveLength(1); // 첫 요청은 서버에 닿지 않았다
    expect(posts[0]!.body).toMatchObject({ seed: 7 });
    expect(posts[0]!.headers["Idempotency-Key"]).toBeTruthy();
  });
});
