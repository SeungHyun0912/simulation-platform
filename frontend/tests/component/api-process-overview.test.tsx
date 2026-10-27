import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, P1, type FakeServer } from "../fakeApi";
import { processVersionId } from "../fakeProcess";
import { renderApp } from "../renderApp";

/**
 * 프로젝트 전체 공정(읽기 전용). 시드: P-001(v1 승인·v2 초안), P-003(빈 초안), P-004(분기 초안), P-005(spec 초안).
 * 가짜 공정의 단계는 모두 설비 EQ-001을 후보로 쓴다(extrude 시드) → 여러 제품이 함께 쓰는 설비로 잡힌다.
 */
const slow = { timeout: 8000 };
const url = `/projects/${P1}/flow/all`;
const open = (path = url, server: FakeServer = createFakeServer()) => ({ server, ...renderApp(path, { source: "api", fetchImpl: server.fetchImpl }) });
const lane = (code: string) => screen.getByRole("region", { name: `${code} 공정` });
const graphGets = (s: FakeServer) => s.requests.filter((r) => r.method === "GET" && r.path.endsWith("/graph"));

describe("프로젝트 전체 공정", () => {
  it("공정이 있는 모든 제품을 제품별 줄로 한 화면에 그리고, 공정이 없는 제품은 따로 알린다", async () => {
    const { server } = open();
    await screen.findByRole("region", { name: "P-005 공정" }, slow);
    for (const code of ["P-001", "P-003", "P-004", "P-005"]) expect(lane(code)).toBeInTheDocument();
    await waitFor(() => expect(within(lane("P-005")).getByRole("group", { name: "P-005 공정 도식" })).toBeInTheDocument(), slow);
    expect(within(lane("P-005")).getByText("단계 2개")).toBeInTheDocument();
    expect(within(lane("P-005")).getByText("완제품 지정됨")).toBeInTheDocument();
    expect(within(lane("P-003")).getByText("노드가 없습니다.")).toBeInTheDocument();
    expect(screen.getByText(/공정이 없는 제품: P-002/)).toBeInTheDocument();
    // 최신 버전 기준: P-001은 v2 초안의 그래프를 읽는다
    expect(graphGets(server).some((r) => r.path.includes(processVersionId(2)))).toBe(true);
    expect(screen.getByRole("link", { name: "프로젝트 전체 공정" })).toHaveAttribute("aria-current", "page");
  });

  it("'승인본' 기준이면 승인된 공정만 보이고 승인본이 없는 제품을 알린다", async () => {
    const user = userEvent.setup();
    const { router } = open();
    await screen.findByRole("region", { name: "P-005 공정" }, slow);
    await user.selectOptions(screen.getByLabelText("보는 버전"), "approved");
    expect(router.state.location.search).toBe("?basis=approved");
    await waitFor(() => expect(screen.queryByRole("region", { name: "P-005 공정" })).not.toBeInTheDocument(), slow);
    expect(lane("P-001")).toHaveTextContent("v1");
    expect(screen.getByText(/승인본이 없는 제품: .*P-005/)).toBeInTheDocument();
  });

  it("여러 제품이 함께 쓰는 설비를 표로 모으고, 강조하면 모든 제품 도식에서 그 설비를 쓰는 단계가 강조된다", async () => {
    const user = userEvent.setup();
    const { router } = open();
    const table = await screen.findByRole("table", { name: "여러 제품이 함께 쓰는 설비" }, slow);
    const row = within(table).getAllByRole("row")[1]!;
    expect(row).toHaveTextContent("EQ-001");
    expect(row).toHaveTextContent(/P-001: .*압출/);
    await user.click(within(row).getByRole("button", { name: /강조$/ }));
    expect(router.state.location.search).toMatch(/asset=/);
    // 강조된 노드는 접근 가능한 이름에 "(강조)"가 붙는다
    expect(within(lane("P-001")).getAllByLabelText(/\(강조\)/).length).toBeGreaterThan(0);
    // P-005는 가닥 A만 EQ-001을 쓴다(가닥 B는 EQ-002)
    expect(within(lane("P-005")).getAllByLabelText(/\(강조\)/)).toHaveLength(1);
    expect(within(lane("P-005")).getByLabelText(/공정 단계 가닥 A \(강조\)/)).toBeInTheDocument();
    expect(within(lane("P-005")).getByText(/강조 단계 1개/)).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: /강조$/ }));
    expect(screen.queryAllByLabelText(/\(강조\)/)).toHaveLength(0);
  });

  it("한 제품의 공정을 못 불러와도 다른 제품은 그대로 보이고 그 줄에만 오류와 다시 시도를 보인다", async () => {
    const server = createFakeServer((req, std) => (req.path.endsWith(`/process-versions/${processVersionId(4)}/graph`) ? errorBody(500, "INTERNAL_ERROR", "서버 오류") : std(req)));
    open(url, server);
    await waitFor(() => expect(within(lane("P-004")).getByRole("alert")).toBeInTheDocument(), slow);
    expect(within(lane("P-005")).getByRole("group", { name: "P-005 공정 도식" })).toBeInTheDocument();
  });

  it("제품 이름을 누르면 그 제품·버전의 플로우차트로 이동한다", async () => {
    const user = userEvent.setup();
    const { router } = open();
    await screen.findByRole("region", { name: "P-005 공정" }, slow);
    await user.click(screen.getByRole("link", { name: /P-005 .* 플로우차트 열기/ }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/products\/.+\/flow$/), slow);
    expect(router.state.location.search).toBe(`?version=${processVersionId(5)}`);
  });

  it("정적 모드에서는 서버 연동 전용 안내만 보인다", () => {
    renderApp(url, { source: "static" });
    expect(screen.getByText(/서버 연동 모드에서만 사용할 수 있습니다/)).toBeInTheDocument();
  });
});
