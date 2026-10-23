import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../renderApp";
import { SAMPLE_ASSETS } from "../../src/features/assets/sampleAssets";
import { capacityText } from "../../src/features/assets/assetView";

function renderAt(path: string) {
  return renderApp(path).router;
}

const DRAFT = SAMPLE_ASSETS.find((a) => a.status === "draft" && a.kind === "equipment")!;
const APPROVED = SAMPLE_ASSETS.find((a) => a.status === "approved")!;
const DOCK = SAMPLE_ASSETS.find((a) => a.kind === "dock")!;

describe("capacityText", () => {
  it("미정·무제한·대기 불가를 0이나 빈칸과 구분한다", () => {
    expect(capacityText({ mode: "unknown", value: "" })).toBe("미정");
    expect(capacityText({ mode: "unlimited", value: "" })).toBe("무제한");
    expect(capacityText({ mode: "not_allowed", value: "" })).toBe("대기 불가");
    expect(capacityText({ mode: "value", value: "0" })).toBe("0 개");
  });
});

describe("설비 목록", () => {
  it("예시 데이터 표시와 전체 행을 보여 준다", () => {
    renderAt("/projects/p1/assets");
    expect(screen.getByText(/예시 데이터입니다/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "설비·공간 목록" });
    expect(within(table).getAllByRole("row")).toHaveLength(SAMPLE_ASSETS.length + 1);
  });

  it("검색 결과가 없으면 안내와 조건 지우기를 제공한다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/assets");
    await user.type(screen.getByLabelText("검색"), "zzzz");
    expect(screen.getByText("검색 결과가 없습니다")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "검색 조건 지우기" }));
    expect(screen.getByRole("table", { name: "설비·공간 목록" })).toBeInTheDocument();
  });

  it("유형 필터가 동작한다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/assets");
    await user.selectOptions(screen.getByLabelText("유형"), "dock");
    const table = screen.getByRole("table", { name: "설비·공간 목록" });
    expect(within(table).getAllByRole("row")).toHaveLength(2);
  });

  it("정렬 버튼이 aria-sort를 갱신한다", async () => {
    const user = userEvent.setup();
    renderAt("/projects/p1/assets");
    const header = screen.getByRole("columnheader", { name: /표시 코드/ });
    expect(header).toHaveAttribute("aria-sort", "none");
    await user.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    await user.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
  });

  it.each([
    ["loading", "불러오는 중입니다"],
    ["error", "요청에 실패했습니다"],
    ["empty", "등록된 설비·공간이 없습니다"],
    ["forbidden", "접근 권한이 없습니다"],
  ])("상태 미리보기 %s", (state, text) => {
    renderAt(`/projects/p1/assets?state=${state}`);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe("설비 상세·편집", () => {
  it("포트는 고정 항목으로 표시되고 삭제 동작이 없다", () => {
    renderAt(`/projects/p1/assets/${DRAFT.id}`);
    expect(screen.getByText("IN")).toBeInTheDocument();
    expect(screen.getByText("OUT")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /삭제/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("위치 미정 (미배치)")).toHaveLength(2);
  });

  it("미정 용량은 경고일 뿐 오류가 아니다", () => {
    renderAt(`/projects/p1/assets/${DRAFT.id}`);
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 0건, 경고 1건");
  });

  it("도킹의 용량은 무제한으로 가정하지 않는다", () => {
    renderAt(`/projects/p1/assets/${DOCK.id}`);
    expect(screen.getByRole("radio", { name: "미정" })).toBeChecked();
  });

  it("수정하면 미저장 표시가 나오고 되돌리면 사라진다", async () => {
    const user = userEvent.setup();
    renderAt(`/projects/p1/assets/${DRAFT.id}`);
    expect(screen.queryByText(/저장하지 않은 변경/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("모델"), "X1");
    expect(screen.getByText(/저장하지 않은 변경이 있습니다/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "되돌리기" }));
    expect(screen.queryByText(/저장하지 않은 변경/)).not.toBeInTheDocument();
  });

  it("이름을 비우면 오류 패널과 필드 오류를 보여 준다", async () => {
    const user = userEvent.setup();
    renderAt(`/projects/p1/assets/${DRAFT.id}`);
    await user.clear(screen.getByLabelText("이름"));
    expect(screen.getByLabelText("이름")).toBeInvalid();
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 1건");
  });

  it("미저장 변경이 있으면 목록 이동 전에 확인한다", async () => {
    const user = userEvent.setup();
    const router = renderAt(`/projects/p1/assets/${DRAFT.id}`);
    await user.type(screen.getByLabelText("모델"), "X1");
    const crumbs = screen.getByRole("navigation", { name: "현재 위치" });
    await user.click(within(crumbs).getByRole("link", { name: "설비·공간" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("저장하지 않은 변경이 있습니다");
    expect(router.state.location.pathname).toContain(DRAFT.id);
    await user.click(screen.getByRole("button", { name: "계속 편집" }));
    expect(router.state.location.pathname).toContain(DRAFT.id);
    await user.click(within(crumbs).getByRole("link", { name: "설비·공간" }));
    await user.click(await screen.findByRole("button", { name: "변경을 버리고 이동" }));
    expect(router.state.location.pathname).toBe("/projects/p1/assets");
  });

  it("승인된 버전은 읽기 전용이다", () => {
    renderAt(`/projects/p1/assets/${APPROVED.id}`);
    expect(screen.getByText("읽기 전용")).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toHaveAttribute("readonly");
    expect(screen.getByRole("radio", { name: "무제한" })).toBeDisabled();
  });

  it("수정 충돌 안내는 자동 덮어쓰기 없이 선택지를 준다", async () => {
    const user = userEvent.setup();
    renderAt(`/projects/p1/assets/${DRAFT.id}?state=conflict`);
    expect(screen.getByText("다른 사용자가 먼저 수정했습니다")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    expect(screen.queryByText("다른 사용자가 먼저 수정했습니다")).not.toBeInTheDocument();
  });

  it("존재하지 않는 자산은 찾을 수 없음으로 표시한다", () => {
    renderAt("/projects/p1/assets/not-found");
    expect(screen.getAllByText("자산을 찾을 수 없습니다").length).toBeGreaterThan(0);
  });
});
