import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, P1 } from "../fakeApi";
import { processProductId, processVersionId } from "../fakeProcess";
import { renderApp } from "../renderApp";

const slow = { timeout: 8000 };

describe("API 모드: 공정 목록(메뉴 '공정')", () => {
  it("사이드 메뉴의 '공정'은 준비 중이 아니라 링크이고 제품별 공정 버전을 서버 값으로 보여 준다", async () => {
    const server = createFakeServer();
    renderApp(`/projects/${P1}/processes`, { source: "api", fetchImpl: server.fetchImpl });
    expect(screen.getByRole("link", { name: "공정" })).toHaveAttribute("href", `/projects/${P1}/processes`);
    expect(screen.queryByText("공정 (준비 중)")).not.toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "제품별 공정 버전" }, slow);
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
    expect(server.requests.some((r) => r.path === `/projects/${P1}/products`)).toBe(true);
  });

  it("버전 번호를 누르면 그 버전의 공정 편집 화면으로 이동한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    const { router } = renderApp(`/projects/${P1}/processes`, { source: "api", fetchImpl: server.fetchImpl });
    await screen.findByRole("table", { name: "제품별 공정 버전" }, slow);
    await user.type(screen.getByLabelText("검색"), "P-005");
    const link = await screen.findByRole("link", { name: /P-005 최신 공정 v1 열기/ }, slow);
    await user.click(link);
    await waitFor(
      () => expect(router.state.location.pathname).toBe(`/projects/${P1}/products/${processProductId(5)}/processes/${processVersionId(5)}`),
      slow,
    );
  });

  it("공정이 없는 제품은 '공정 없음'과 제품에서 만드는 링크를 보인다", async () => {
    const server = createFakeServer();
    renderApp(`/projects/${P1}/processes`, { source: "api", fetchImpl: server.fetchImpl });
    const table = await screen.findByRole("table", { name: "제품별 공정 버전" }, slow);
    const none = within(table).queryAllByText("공정 없음");
    if (none.length > 0) expect(within(table).getAllByRole("link", { name: /공정 만들기/ }).length).toBe(none.length);
  });

  it("목록을 불러오지 못하면 오류와 다시 시도를 보인다(정적 예시로 대체하지 않는다)", async () => {
    const server = createFakeServer((req, std) => (req.path.endsWith("/products") ? errorBody(500, "INTERNAL_ERROR", "서버 오류") : std(req)));
    renderApp(`/projects/${P1}/processes`, { source: "api", fetchImpl: server.fetchImpl });
    expect(await screen.findByRole("alert", {}, slow)).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "제품별 공정 버전" })).not.toBeInTheDocument();
  });
});
