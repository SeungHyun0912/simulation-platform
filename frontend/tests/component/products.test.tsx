import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { latestVersion, specificationText } from "../../src/features/products/productView";
import { SAMPLE_PRODUCTS } from "../../src/features/products/sampleProducts";
import { renderApp } from "../renderApp";

const WITH_SPEC = SAMPLE_PRODUCTS.find((p) => p.specification !== null && p.versions.length > 1)!;
const UNKNOWN_SPEC = SAMPLE_PRODUCTS.find((p) => p.specification === null)!;
const NO_VERSION = SAMPLE_PRODUCTS.find((p) => p.versions.length === 0)!;

describe("productView", () => {
  it("규격 미정은 빈 문자열과 다르게 표시한다", () => {
    expect(specificationText(null)).toBe("미정");
    expect(specificationText("")).toBe("(비어 있음)");
    expect(specificationText("A")).toBe("A");
  });
  it("가장 높은 버전 번호를 최신으로 본다", () => {
    expect(latestVersion(WITH_SPEC)?.versionNo).toBe(2);
    expect(latestVersion(NO_VERSION)).toBeNull();
  });
});

describe("제품 목록", () => {
  it("예시 표시, 전체 행, 최신 공정 버전·상태를 보여 준다", () => {
    renderApp("/projects/p1/products");
    expect(screen.getByText(/예시 데이터입니다/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "제품 목록" });
    expect(within(table).getAllByRole("row")).toHaveLength(SAMPLE_PRODUCTS.length + 1);
    expect(within(table).getByText("공정 없음")).toBeInTheDocument();
    expect(within(table).getByText("미정")).toBeInTheDocument();
  });

  it("검색 결과가 없으면 안내와 조건 지우기를 제공한다", async () => {
    const user = userEvent.setup();
    renderApp("/projects/p1/products");
    await user.type(screen.getByLabelText("검색"), "zzzz");
    expect(screen.getByText("검색 결과가 없습니다")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "검색 조건 지우기" }));
    expect(screen.getByRole("table", { name: "제품 목록" })).toBeInTheDocument();
  });

  it.each([
    ["loading", "불러오는 중입니다"],
    ["error", "요청에 실패했습니다"],
    ["empty", "등록된 제품이 없습니다"],
    ["forbidden", "접근 권한이 없습니다"],
  ])("상태 미리보기 %s", (state, text) => {
    renderApp(`/projects/p1/products?state=${state}`);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("메뉴의 제품 링크로 이동한다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/projects/p1/assets");
    await user.click(within(screen.getByRole("navigation", { name: "주 메뉴" })).getByRole("link", { name: "제품" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/p1/products"));
  });
});

describe("제품 상세·편집", () => {
  it("공정 버전을 최신순으로 보여 주고 초안 UI 링크로 연결한다", () => {
    renderApp(`/projects/p1/products/${WITH_SPEC.id}`);
    const table = screen.getByRole("table", { name: `${WITH_SPEC.code} 공정 버전` });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("v2");
    expect(rows[2]).toHaveTextContent("v1");
    const edit = within(table).getByRole("link", { name: "v2 공정 편집" });
    expect(edit).toHaveAttribute(
      "href",
      `/projects/p1/products/${WITH_SPEC.id}/processes/${WITH_SPEC.versions[1]!.id}`,
    );
    expect(within(table).getByRole("link", { name: "v1 공정 보기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /새 초안 만들기/ })).toBeDisabled();
  });

  it("공정이 없는 제품은 빈 상태를 보여 준다", () => {
    renderApp(`/projects/p1/products/${NO_VERSION.id}`);
    expect(screen.getByText("공정 버전이 없습니다")).toBeInTheDocument();
  });

  it("규격 미정은 경고이고 미정 체크 시 입력란이 비활성화된다", () => {
    renderApp(`/projects/p1/products/${UNKNOWN_SPEC.id}`);
    expect(screen.getByLabelText("규격 미정")).toBeChecked();
    expect(screen.getByLabelText("규격")).toBeDisabled();
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 0건, 경고 1건");
  });

  it("미정을 해제하고 비워 두면 오류이며, 저장하지 않은 변경으로 표시한다", async () => {
    const user = userEvent.setup();
    renderApp(`/projects/p1/products/${UNKNOWN_SPEC.id}`);
    await user.click(screen.getByLabelText("규격 미정"));
    expect(screen.getByLabelText("규격")).toBeInvalid();
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 1건");
    expect(screen.getByText(/저장하지 않은 변경이 있습니다/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(screen.getByLabelText("규격 미정")).toBeChecked();
  });

  it("미저장 변경이 있으면 프로젝트 전환 전에 확인한다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(`/projects/demo-a/products/${WITH_SPEC.id}`);
    await user.type(screen.getByLabelText("이름"), "!");
    await user.click(screen.getByRole("button", { name: /프로젝트 전환/ }));
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitemradio", { name: /예시 프로젝트 B/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("저장하지 않은 변경이 있습니다");
    expect(router.state.location.pathname).toBe(`/projects/demo-a/products/${WITH_SPEC.id}`);
    await user.click(screen.getByRole("button", { name: "변경을 버리고 이동" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/demo-b/products"));
  });

  it("수정 충돌 안내는 자동 덮어쓰기 없이 선택지를 준다", async () => {
    const user = userEvent.setup();
    renderApp(`/projects/p1/products/${WITH_SPEC.id}?state=conflict`);
    expect(screen.getByText("다른 사용자가 먼저 수정했습니다")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    expect(screen.queryByText("다른 사용자가 먼저 수정했습니다")).not.toBeInTheDocument();
  });

  it("없는 제품·권한 없음 상태를 표시한다", () => {
    const { unmount } = renderApp("/projects/p1/products/not-found");
    expect(screen.getAllByText("제품을 찾을 수 없습니다").length).toBeGreaterThan(0);
    unmount();
    renderApp(`/projects/p1/products/${WITH_SPEC.id}?state=forbidden`);
    expect(screen.getByText("접근 권한이 없습니다")).toBeInTheDocument();
  });
});
