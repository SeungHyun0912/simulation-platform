import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_MATERIALS } from "../../src/features/materials/sampleMaterials";
import { renderApp } from "../renderApp";

const PROJECT = "aaaaaaaa-0000-4000-8000-000000000001";
const list = `/projects/${PROJECT}/materials`;
const byCode = (code: string) => SAMPLE_MATERIALS.find((m) => m.code === code)!;

describe("재료 목록 (정적 예시)", () => {
  it("예시 표시와 전체 행, 규격의 미정·해당 없음을 구분해 보여 준다", () => {
    renderApp(list);
    expect(screen.getByText(/예시 데이터입니다/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "재료 목록" });
    expect(within(table).getAllByRole("row")).toHaveLength(SAMPLE_MATERIALS.length + 1);
    const m2 = within(table).getByText("M-002").closest("tr")!;
    expect(m2).toHaveTextContent("1000 m");
    expect(m2).toHaveTextContent("3 단위");
    expect(m2).toHaveTextContent("해당 없음"); // 중량: 해당 없음
    expect(within(table).getByText("M-003").closest("tr")).toHaveTextContent("미정"); // 모두 미정
    expect(within(table).getByText("M-001").closest("tr")).toHaveTextContent("2000.500000 kg"); // 길이와 중량은 환산하지 않는 별개의 값
    expect(within(table).getByText("M-004").closest("tr")).toHaveTextContent("12 가닥");
  });

  it("사이드 메뉴의 재료 링크로 이동한다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/projects/${PROJECT}/assets`);
    await user.click(within(screen.getByRole("navigation", { name: "주 메뉴" })).getByRole("link", { name: "재료" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(list));
  });

  it("검색 결과가 없으면 안내와 조건 지우기를 제공한다", async () => {
    const user = userEvent.setup();
    renderApp(list);
    await user.type(screen.getByLabelText("검색"), "zzzz");
    expect(screen.getByText("검색 결과가 없습니다")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "검색 조건 지우기" }));
    expect(screen.getByRole("table", { name: "재료 목록" })).toBeInTheDocument();
  });

  it.each([
    ["loading", "불러오는 중입니다"],
    ["error", "요청에 실패했습니다"],
    ["empty", "등록된 재료가 없습니다"],
    ["forbidden", "접근 권한이 없습니다"],
  ])("상태 미리보기 %s", (state, text) => {
    renderApp(`${list}?state=${state}`);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe("재료 상세·편집 (정적 예시)", () => {
  const detail = (code: string, query = "") => `${list}/${byCode(code).id}${query}`;

  it("기본 정보와 기본 규격 네 값을 보여 주고 저장은 정적 예시라 비활성이다", () => {
    renderApp(detail("M-002"));
    expect(screen.getByLabelText("형태")).toHaveValue("보빈");
    expect(screen.getByLabelText("메모")).toHaveValue("보빈 3개 단위로 공급");
    expect(screen.getByLabelText("기본 규격 길이 값")).toHaveValue("1000");
    expect(screen.getByLabelText("기본 규격 단위 수 값")).toHaveValue("3");
    expect(within(screen.getByRole("group", { name: "기본 규격 중량" })).getByRole("radio", { name: "해당 없음", checked: true })).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "기본 규격 가닥 수" })).getByRole("radio", { name: "미정", checked: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장 (정적 예시)" })).toBeDisabled();
  });

  it("미정 → 값 있음으로 바꾸면 미저장 변경이 표시되고 0·잘못된 값은 오류이다", async () => {
    const user = userEvent.setup();
    renderApp(detail("M-003"));
    await user.click(within(screen.getByRole("group", { name: "기본 규격 길이" })).getByRole("radio", { name: "값 있음" }));
    await user.type(screen.getByLabelText("기본 규격 길이 값"), "0");
    expect(screen.getByLabelText("기본 규격 길이 값")).toBeInvalid();
    expect(screen.getByText(/저장하지 않은 변경이 있습니다/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("기본 규격 길이 값"));
    await user.type(screen.getByLabelText("기본 규격 길이 값"), "3000");
    expect(screen.getByLabelText("기본 규격 길이 값")).toBeValid();
    await user.click(within(screen.getByRole("group", { name: "기본 규격 단위 수" })).getByRole("radio", { name: "값 있음" }));
    await user.type(screen.getByLabelText("기본 규격 단위 수 값"), "1.5");
    expect(screen.getByLabelText("기본 규격 단위 수 값")).toBeInvalid(); // 개수는 정수
    await user.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(screen.getByLabelText("형태")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "기본 규격 길이" })).getByRole("radio", { name: "미정", checked: true })).toBeInTheDocument();
  });

  it("형태를 비우면 오류이다", async () => {
    const user = userEvent.setup();
    renderApp(detail("M-001"));
    await user.clear(screen.getByLabelText("형태"));
    expect(screen.getByLabelText("형태")).toBeInvalid();
  });

  it("미저장 변경이 있으면 프로젝트 전환 전에 확인한다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(detail("M-001"));
    await user.type(screen.getByLabelText("이름"), "!");
    await user.click(screen.getByRole("button", { name: /프로젝트 전환/ }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /예시 프로젝트 B/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("저장하지 않은 변경이 있습니다");
    await user.click(screen.getByRole("button", { name: "변경을 버리고 이동" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/aaaaaaaa-0000-4000-8000-000000000002/materials"));
  });

  it("수정 충돌 미리보기는 자동 덮어쓰기 없이 선택지를 준다", async () => {
    const user = userEvent.setup();
    renderApp(detail("M-001", "?state=conflict"));
    expect(screen.getByText("다른 사용자가 먼저 수정했습니다")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    expect(screen.queryByText("다른 사용자가 먼저 수정했습니다")).not.toBeInTheDocument();
  });

  it("없는 재료·권한 없음 상태를 표시한다", () => {
    const { unmount } = renderApp(`${list}/not-found`);
    expect(screen.getAllByText("재료를 찾을 수 없습니다").length).toBeGreaterThan(0);
    unmount();
    renderApp(detail("M-001", "?state=forbidden"));
    expect(screen.getByText("접근 권한이 없습니다")).toBeInTheDocument();
  });
});

describe("재료 추가 (정적 예시)", () => {
  it("기본 규격은 모두 미정으로 시작하고 정적 예시에서는 만들 수 없다", async () => {
    const user = userEvent.setup();
    renderApp(`${list}/new`);
    expect(screen.getAllByRole("radio", { name: "미정", checked: true })).toHaveLength(4);
    await user.type(screen.getByLabelText("표시 코드"), "NEW-1");
    await user.type(screen.getByLabelText("이름"), "새 재료");
    await user.type(screen.getByLabelText("형태"), "릴");
    expect(screen.getByRole("button", { name: "재료 만들기" })).toBeDisabled();
    expect(screen.getByText(/정적 예시 화면에서는 재료가 만들어지지 않습니다/)).toBeInTheDocument();
  });
});
