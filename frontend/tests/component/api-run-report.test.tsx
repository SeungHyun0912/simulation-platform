import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, P1, type FakeServer } from "../fakeApi";
import { runId } from "../fakeScenarios";
import { renderApp } from "../renderApp";

/** 결과 리포트(0.16.0 GET /runs/{r}/report). 시드 run 1은 완료된 실행이다. */
const slow = { timeout: 8000 };
const report = (n: number) => `/projects/${P1}/runs/${runId(n)}/report`;

function open(path: string, server: FakeServer = createFakeServer()) {
  return { server, ...renderApp(path, { source: "api", fetchImpl: server.fetchImpl }) };
}

describe("결과 리포트", () => {
  it("한계를 맨 위에 항상 보이고, 요약 문장·실행·시나리오 정보를 서버 값 그대로 보인다", async () => {
    open(report(1));
    const limits = await screen.findByText("이 리포트의 한계", {}, slow);
    expect(screen.getByText("제품끼리 생산량을 합산하지 않습니다.")).toBeInTheDocument();
    const summary = screen.getByRole("list", { name: "요약 문장" });
    expect(within(summary).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["P-001 서버 제품 1은 완제품 12개를 만들었습니다.", "근본 원인 1위는 P-001 피복입니다."]);
    // 한계가 요약보다 먼저
    expect(limits.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const run = screen.getByRole("region", { name: "실행·시나리오" });
    expect(run).toHaveTextContent("90분");
    expect(run).toHaveTextContent("SCN-001 v2");
    expect(run).toHaveTextContent("kind=demand · horizon_min=600");
    expect(run).toHaveTextContent("용량 미확인 공간");
    expect(screen.getByText("가정 위의 결과입니다")).toBeInTheDocument();
  });

  it("제품별 결과는 제품마다 따로 보이고(합산 없음), 지표는 정의 설명으로, 값이 없으면 '해당 없음'이다", async () => {
    open(report(1));
    const p1 = await screen.findByRole("region", { name: "제품 결과: P-001 서버 제품 1" }, slow);
    expect(p1).toHaveTextContent("완제품 12개");
    const metrics = within(p1).getByRole("table", { name: "P-001 서버 제품 1 지표" });
    expect(within(metrics).getByText("해당 없음")).toBeInTheDocument();
    expect(within(p1).getByRole("table", { name: "P-001 서버 제품 1 부족한 입력" })).toHaveTextContent("Cu");
    const p2 = screen.getByRole("region", { name: "제품 결과: P-002 서버 제품 2" });
    expect(p2).toHaveTextContent("완제품 5개");
    expect(within(p2).queryByRole("table", { name: /부족한 입력/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/완제품 17개/)).not.toBeInTheDocument();
  });

  it("병목·고칠 곳은 실행 상세와 같은 표시를 쓰고, 가동률 상위 설비·대기 많은 공간·쓰인 가정(코드별 묶음)을 보인다", async () => {
    const user = userEvent.setup();
    open(report(1));
    const fix = await screen.findByRole("region", { name: "고칠 곳" }, slow);
    expect(within(fix).getAllByRole("listitem", { name: /^고칠 곳 \d+위/ })).toHaveLength(2);
    expect(screen.getByRole("region", { name: "병목 종류: 설비 가동 대기" })).toBeInTheDocument();
    const assets = screen.getByRole("table", { name: "가동률 상위 설비" });
    expect(assets).toHaveTextContent("EQ-002 서버 설비 2");
    expect(assets).toHaveTextContent("97%");
    expect(within(assets).getAllByText("해당 없음").length).toBeGreaterThan(0); // 모르는 가동률은 0이 아니다
    expect(screen.getByRole("table", { name: "대기가 많은 공간" })).toHaveTextContent("ST-041 서버 공간 41");
    const asm = screen.getByText(/UNBOUNDED_BUFFERS/, { selector: "code" }).closest("summary")!;
    expect(asm).toHaveTextContent("2건");
    await user.click(asm);
    expect(screen.getByText(/공간 buf2 용량 미확인/)).toBeInTheDocument();
  });

  it("공식 결과가 없으면(409) 오류가 아니라 '결과 리포트가 없습니다' 안내를 보인다", async () => {
    const server = createFakeServer((req, std) => (req.path.endsWith("/report") ? errorBody(409, "RUN_RESULT_NOT_AVAILABLE", "공식 결과가 없습니다.") : std(req)));
    open(report(1), server);
    expect(await screen.findByText("결과 리포트가 없습니다", {}, slow)).toBeInTheDocument();
  });

  it("실행 상세에서 '결과 리포트 보기'로 들어간다", async () => {
    const user = userEvent.setup();
    open(`/projects/${P1}/runs/${runId(1)}`);
    await user.click(await screen.findByRole("link", { name: "결과 리포트 보기" }, slow));
    expect(await screen.findByText("이 리포트의 한계", {}, slow)).toBeInTheDocument();
  });

  it("정적 예제 모드에서는 API 전용 안내만 보인다", async () => {
    renderApp(report(1), { source: "static" });
    expect(await screen.findByText(/결과 리포트/, { selector: "h1" }, slow)).toBeInTheDocument();
    expect(screen.queryByText("이 리포트의 한계")).not.toBeInTheDocument();
  });
});
