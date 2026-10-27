import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, P1, type FakeServer } from "../fakeApi";
import { runId } from "../fakeScenarios";
import { renderApp } from "../renderApp";

/** 실행 분석: 병목 요약(0.12.0), 설비 타임라인·간트(0.13.0), 두 실행 비교(0.13.0). 시드 run 1은 완료된 실행이다. */
const slow = { timeout: 8000 };
const detail = (n: number) => `/projects/${P1}/runs/${runId(n)}`;
const compare = (a: number, b: number) => `/projects/${P1}/runs/${runId(a)}/compare/${runId(b)}`;

function open(path: string, server: FakeServer = createFakeServer()) {
  return { server, ...renderApp(path, { source: "api", fetchImpl: server.fetchImpl }) };
}
/** 완료된 실행을 하나 더 만든다(seed만 다름) */
function addCompleted(server: FakeServer, n: number, patch: Record<string, unknown> = {}) {
  const base = server.state.scenarios.runs[0]!;
  server.state.scenarios.runs.push({ ...structuredClone(base), id: runId(n), seed: 7, ...patch } as never);
}

describe("병목 요약", () => {
  it("한 줄 요약·판정의 한계·기준값을 함께 보이고, 종류별로 묶어 순위·수준·위치·멈춘 양을 보인다", async () => {
    open(detail(1));
    await screen.findByText("가장 큰 정체: P-001 압출 설비 대기", {}, slow);
    expect(screen.getByText("이 판정의 한계")).toBeInTheDocument();
    expect(screen.getByText(/공간 부족은 평가되지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText(/판정 기준값: 적체 최소 개수 3/)).toBeInTheDocument();
    const busy = screen.getByRole("region", { name: "병목 종류: 설비 가동 대기" });
    expect(within(busy).getAllByRole("listitem", { name: /^병목 \d+위/ })).toHaveLength(3); // 상위 3건만 먼저
    const first = within(busy).getAllByRole("listitem", { name: /^병목 \d+위/ })[0]!;
    expect(first).toHaveTextContent("1위");
    expect(first).toHaveTextContent("높음");
    expect(first).toHaveTextContent("P-001 서버 제품 1 · 단계 압출");
    expect(first).toHaveTextContent("멈춘 양 1,000 작업물·분");
    const pile = screen.getByRole("region", { name: "병목 종류: 대기 자재 적체" });
    expect(pile).toHaveTextContent("대기 공간 ST-041 서버 공간 41");
    // 종류끼리 합산하지 않는다는 안내
    expect(screen.getByText(/종류가 다르면 합산하지 않습니다/)).toBeInTheDocument();
  });

  it("같은 종류가 많으면 '모두 보기'로 펼친다", async () => {
    const user = userEvent.setup();
    open(detail(1));
    const busy = await screen.findByRole("region", { name: "병목 종류: 설비 가동 대기" }, slow);
    await user.click(within(busy).getByRole("button", { name: "설비 가동 대기 모두 보기(5건)" }));
    expect(within(busy).getAllByRole("listitem", { name: /^병목 \d+위/ })).toHaveLength(5);
  });

  it("근거 수치는 열린 구조라 아는 키는 한국어로, 모르는 키는 원문으로 보인다", async () => {
    const user = userEvent.setup();
    open(detail(1));
    const busy = await screen.findByRole("region", { name: "병목 종류: 설비 가동 대기" }, slow);
    const first = within(busy).getAllByRole("listitem", { name: /^병목 \d+위/ })[0]!;
    await user.click(within(first).getByText("근거 수치"));
    expect(within(first).getByText("설비 대기 평균(분): 12.5")).toBeInTheDocument();
    expect(within(first).getByText(/후보 설비: .*EQ-001/)).toBeInTheDocument();
    expect(within(first).getByText("future_key: 열린 구조")).toBeInTheDocument();
  });

  it("공식 결과가 없으면(409) 오류가 아니라 '결과 없음' 안내를 보인다", async () => {
    const server = createFakeServer((req, std) => (req.path.endsWith("/bottlenecks") ? errorBody(409, "RUN_RESULT_NOT_AVAILABLE", "공식 결과가 없습니다.") : std(req)));
    open(detail(1), server);
    expect(await screen.findByText("병목 요약이(가) 없습니다", {}, slow)).toBeInTheDocument();
  });

  it("불완전한 관측이면 판정을 완료 결과처럼 보지 말라고 경고한다", async () => {
    const server = createFakeServer((req, std) => {
      const r = std(req);
      if (req.path.endsWith("/bottlenecks")) (r.body as { data: { quality_status: string } }).data.quality_status = "incomplete";
      return r;
    });
    open(detail(1), server);
    expect(await screen.findByText("불완전한 관측", { selector: "*" }, slow)).toBeInTheDocument();
  });
});

describe("설비 타임라인", () => {
  it("주 단위로 시작해 설비별 구간 가동률을 숫자로 보이고, 쓰이지 않은 설비는 기본으로 숨긴다", async () => {
    const { server } = open(detail(1));
    const table = await screen.findByRole("table", { name: "설비별 구간 가동률" }, slow);
    expect(server.requests.find((r) => r.path.endsWith("/asset-timeline"))!.query.get("window")).toBe("week");
    const row = within(table).getAllByRole("row")[1]!;
    expect(row).toHaveTextContent("EQ-001 서버 설비 1");
    expect(row).toHaveTextContent("100%");
    expect(row).toHaveTextContent("25%");
    expect(within(table).queryByText(/EQ-099/)).not.toBeInTheDocument();
    expect(screen.getByText("쓰이지 않은 설비 1대를 숨겼습니다.")).toBeInTheDocument();
  });

  it("'쓰인 설비만'을 끄면 쓰이지 않은 설비도 전 구간 유휴로 보인다", async () => {
    const user = userEvent.setup();
    open(detail(1));
    await screen.findByRole("table", { name: "설비별 구간 가동률" }, slow);
    await user.click(screen.getByLabelText("이 실행에서 쓰인 설비만"));
    expect(screen.getByText(/EQ-099 쓰이지 않은 설비/)).toBeInTheDocument();
    expect(screen.getByText(/이 실행에서 쓰이지 않음/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EQ-099 쓰이지 않은 설비 상태 보기" })).toBeDisabled();
  });

  it("설비는 20대씩 받고 '설비 더 보기'로 이어 받는다", async () => {
    const user = userEvent.setup();
    const { server } = open(detail(1));
    await screen.findByRole("table", { name: "설비별 구간 가동률" }, slow);
    expect(server.requests.filter((r) => r.path.endsWith("/asset-timeline")).at(-1)!.query.get("limit")).toBe("20");
    await user.click(screen.getByRole("button", { name: "설비 더 보기" }));
    await waitFor(() => expect(screen.getByText(/EQ-024 서버 설비 24/)).toBeInTheDocument(), slow);
  });

  it("구간 단위를 바꾸면 그 단위로 다시 받는다", async () => {
    const user = userEvent.setup();
    const { server } = open(detail(1));
    await screen.findByRole("table", { name: "설비별 구간 가동률" }, slow);
    await user.selectOptions(screen.getByLabelText("구간 단위"), "day");
    await waitFor(() => expect(server.requests.some((r) => r.path.endsWith("/asset-timeline") && r.query.get("window") === "day")).toBe(true), slow);
    expect(await screen.findByRole("columnheader", { name: "3일" }, slow)).toBeInTheDocument();
  });

  it("'상태 보기'로 고른 구간만 잘라 받아 간트와 같은 내용의 표를 보이고, 모르는 상태는 원문으로 보인다", async () => {
    const user = userEvent.setup();
    const { server } = open(detail(1));
    await screen.findByRole("table", { name: "설비별 구간 가동률" }, slow);
    await user.click(screen.getByRole("button", { name: "EQ-001 서버 설비 1 상태 보기" }));
    expect(await screen.findByRole("img", { name: /EQ-001 서버 설비 1 상태 막대/ }, slow)).toBeInTheDocument();
    const req = server.requests.find((r) => r.path.includes("/states"))!;
    expect([req.query.get("from_min"), req.query.get("to_min")]).toEqual(["0", "10080"]);
    await user.click(screen.getByText(/상태 구간 표/));
    const table = screen.getByRole("table", { name: "EQ-001 서버 설비 1 상태 구간" });
    expect(within(table).getByText("준비(교체)")).toBeInTheDocument();
    expect(within(table).getByText("막힘(배출 대기)")).toBeInTheDocument();
    expect(within(table).getByText("FUTURE_STATE")).toBeInTheDocument();
    // 다른 구간을 고르면 그 범위로 다시 받는다
    await user.selectOptions(screen.getByLabelText("간트 구간"), "1");
    await waitFor(() => expect(server.requests.some((r) => r.path.includes("/states") && r.query.get("from_min") === "10080")).toBe(true), slow);
  });
});

describe("두 실행 비교", () => {
  it("실행 상세에서 결과가 있는 다른 실행을 골라 비교 화면으로 간다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    addCompleted(server, 2);
    const { router } = open(detail(1), server);
    const select = await screen.findByLabelText("비교할 실행", {}, slow);
    await user.selectOptions(select, runId(2));
    await user.click(screen.getByRole("link", { name: "비교 보기" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(compare(1, 2)), slow);
  });

  it("비교 가능 여부·입력 차이·제품별 결과(null은 비교 불가)·병목을 보인다", async () => {
    const server = createFakeServer();
    addCompleted(server, 2);
    open(compare(1, 2), server);
    const input = await screen.findByRole("table", { name: "입력 차이" }, slow);
    expect(within(input).getByText("seed")).toBeInTheDocument();
    expect(within(input).getByText("난수 시드")).toBeInTheDocument();
    const prod = screen.getByRole("table", { name: "P-001 지표 비교" });
    const lead = within(prod).getAllByRole("row").find((r) => r.textContent?.includes("lead_time_avg_min") || r.textContent?.includes("평균 리드타임"))!;
    expect(lead).toHaveTextContent("비교 불가"); // 기준이 0이라 비율 없음
    expect(screen.queryByText(/엔진 버전이 달라/)).not.toBeInTheDocument();
    expect(screen.getByRole("generic", { name: "기준 실행 병목" })).toHaveTextContent("1위");
    expect(screen.getByRole("generic", { name: "비교 실행 병목" })).toHaveTextContent("기준을 넘는 병목이 없습니다");
  });

  it("엔진 버전이 다르면 비교할 수 없다고 먼저 알리고 경고를 보인다", async () => {
    const server = createFakeServer();
    addCompleted(server, 2, { engine_version: "engine-test-2" });
    open(compare(1, 2), server);
    expect(await screen.findByText(/엔진 버전이 달라 결과를 그대로 비교할 수 없습니다/, {}, slow)).toBeInTheDocument();
    expect(screen.getByText("비교할 때 주의할 점")).toBeInTheDocument();
  });

  it("지표 차이는 '달라진 값만'으로 시작하고 끄면 같은 값도 보인다. 기준이 없으면 해당 없음·비교 불가", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    addCompleted(server, 2);
    open(compare(1, 2), server);
    const table = await screen.findByRole("table", { name: "지표 차이" }, slow);
    expect(server.requests.find((r) => r.path.endsWith("/metrics") && r.path.includes("/compare/"))!.query.get("changed_only")).toBe("true");
    expect(within(table).queryByText("utilization")).not.toBeInTheDocument();
    const lead = within(table).getAllByRole("row").find((r) => r.textContent?.includes("lead_time_avg_min"))!;
    expect(lead).toHaveTextContent("해당 없음");
    expect(lead).toHaveTextContent("비교 불가");
    await user.click(screen.getByLabelText("달라진 값만"));
    await waitFor(() => expect(within(screen.getByRole("table", { name: "지표 차이" })).getByText("utilization")).toBeInTheDocument(), slow);
  });

  it("일·주·월 구간은 지표를 하나 고를 때까지 요청하지 않는다(서버 규칙)", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    addCompleted(server, 2);
    open(compare(1, 2), server);
    await screen.findByRole("table", { name: "지표 차이" }, slow);
    const before = server.requests.filter((r) => r.path.includes("/compare/") && r.path.endsWith("/metrics")).length;
    await user.selectOptions(screen.getByLabelText("구간"), "day");
    expect(screen.getByText("일·주·월 구간은 지표를 하나 고르면 보입니다.")).toBeInTheDocument();
    expect(server.requests.filter((r) => r.path.includes("/compare/") && r.path.endsWith("/metrics")).length).toBe(before);
  });

  it("'기준·비교 바꾸기'는 두 실행의 자리를 바꾼다", async () => {
    const server = createFakeServer();
    addCompleted(server, 2);
    open(compare(1, 2), server);
    expect(await screen.findByRole("link", { name: "기준·비교 바꾸기" }, slow)).toHaveAttribute("href", compare(2, 1));
  });

  it("결과가 없는 실행과는 비교할 수 없다고 안내한다(409)", async () => {
    const server = createFakeServer();
    addCompleted(server, 2, { status: "cancelled", result: null });
    open(compare(1, 2), server);
    expect(await screen.findByText("비교할 결과가 없습니다", {}, slow)).toBeInTheDocument();
  });

  it("정적 모드에서는 서버 연동 전용 안내만 보인다", () => {
    renderApp(compare(1, 2), { source: "static" });
    expect(screen.getByText(/서버 연동 모드에서만 사용할 수 있습니다/)).toBeInTheDocument();
  });
});
