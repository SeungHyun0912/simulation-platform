import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_ASSETS } from "../../src/features/assets/sampleAssets";
import { renderApp } from "../renderApp";

const DRAFT = SAMPLE_ASSETS.find((a) => a.code === "EQ-001")!;

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /프로젝트 전환/ }));
  return screen.findByRole("menu");
}

describe("프로젝트 전환", () => {
  it("현재 프로젝트 이름과 코드를 표시하고 메뉴에서 현재 항목을 체크한다", async () => {
    const user = userEvent.setup();
    renderApp("/projects/aaaaaaaa-0000-4000-8000-000000000001/assets");
    const group = screen.getByRole("group", { name: "현재 프로젝트" });
    expect(group).toHaveTextContent("예시 프로젝트 A");
    expect(group).toHaveTextContent("DEMO-A");
    const menu = await openMenu(user);
    expect(within(menu).getByRole("menuitemradio", { name: /예시 프로젝트 A/ })).toBeChecked();
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(3);
  });

  it("전환하면 같은 메뉴의 목록으로 이동하고 상세 경로의 자산 ID는 가져가지 않는다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/projects/aaaaaaaa-0000-4000-8000-000000000001/assets/${DRAFT.id}`);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitemradio", { name: /예시 프로젝트 B/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/aaaaaaaa-0000-4000-8000-000000000002/assets"));
    expect(screen.getByRole("group", { name: "현재 프로젝트" })).toHaveTextContent("DEMO-B");
  });

  it("프로젝트가 없는 화면에서도 선택하면 자산 목록으로 이동한다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitemradio", { name: /예시 프로젝트 C/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/aaaaaaaa-0000-4000-8000-000000000003/assets"));
  });

  it("미저장 변경이 있으면 전환 전에 확인하고, 계속 편집하면 이동하지 않는다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/projects/aaaaaaaa-0000-4000-8000-000000000001/assets/${DRAFT.id}`);
    await user.type(screen.getByLabelText("모델"), "X1");
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitemradio", { name: /예시 프로젝트 B/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("저장하지 않은 변경이 있습니다");
    expect(router.state.location.pathname).toBe(`/projects/aaaaaaaa-0000-4000-8000-000000000001/assets/${DRAFT.id}`);
    await user.click(within(dialog).getByRole("button", { name: "계속 편집" }));
    expect(router.state.location.pathname).toBe(`/projects/aaaaaaaa-0000-4000-8000-000000000001/assets/${DRAFT.id}`);
    expect(screen.getByLabelText("모델")).toHaveValue("EX-100X1"); // 서버 값 EX-100 뒤에 입력한 내용이 유지된다
  });

  it("변경을 버리고 전환하면 새 프로젝트에 이전 입력이 남지 않는다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/projects/aaaaaaaa-0000-4000-8000-000000000001/assets/${DRAFT.id}`);
    await user.type(screen.getByLabelText("모델"), "X1");
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitemradio", { name: /예시 프로젝트 B/ }));
    await user.click(await screen.findByRole("button", { name: "변경을 버리고 이동" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/aaaaaaaa-0000-4000-8000-000000000002/assets"));
    expect(screen.queryByLabelText("모델")).not.toBeInTheDocument();
  });

  it("전환하면 이전 프로젝트의 쿼리 캐시를 제거하고 다른 프로젝트 캐시는 보존한다", async () => {
    const user = userEvent.setup();
    const { router, queryClient } = renderApp("/projects/aaaaaaaa-0000-4000-8000-000000000001/assets");
    queryClient.setQueryData(["project", "aaaaaaaa-0000-4000-8000-000000000001", "assets"], ["a"]);
    queryClient.setQueryData(["project", "aaaaaaaa-0000-4000-8000-000000000002", "assets"], ["b"]);
    const menu = await openMenu(user);
    await user.click(within(menu).getByRole("menuitemradio", { name: /예시 프로젝트 B/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/aaaaaaaa-0000-4000-8000-000000000002/assets"));
    await waitFor(() => expect(queryClient.getQueryData(["project", "aaaaaaaa-0000-4000-8000-000000000001", "assets"])).toBeUndefined());
    expect(queryClient.getQueryData(["project", "aaaaaaaa-0000-4000-8000-000000000002", "assets"])).toEqual(["b"]);
  });
});
