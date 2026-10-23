import { render, screen } from "@testing-library/react";
import { renderApp } from "../renderApp";
import { StateNotice } from "../../src/shared/components/StateNotice";
import { VersionStatusBadge } from "../../src/shared/components/VersionStatusBadge";
import { projectKey } from "../../src/shared/api/queryKeys";

describe("VersionStatusBadge", () => {
  it.each([
    ["draft", "초안"],
    ["in_review", "검토 중"],
    ["approved", "승인"],
    ["archived", "보관"],
  ])("%s 상태를 글자로 표시한다", (status, text) => {
    render(<VersionStatusBadge status={status} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("알 수 없는 상태값은 안전하게 표시한다", () => {
    render(<VersionStatusBadge status="superseded_v2" />);
    expect(screen.getByText("알 수 없음")).toBeInTheDocument();
  });
});

describe("StateNotice", () => {
  it("오류는 alert, 로딩은 busy status로 알린다", () => {
    const { rerender } = render(<StateNotice kind="error" />);
    expect(screen.getByRole("alert")).toHaveTextContent("요청에 실패했습니다");
    rerender(<StateNotice kind="loading" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });
});

describe("projectKey", () => {
  it("항상 project와 projectId로 시작한다", () => {
    expect(projectKey("p1", "assets", { q: "a" })).toEqual(["project", "p1", "assets", { q: "a" }]);
  });
});

describe("AppShell", () => {
  it("프로젝트 경로에서는 현재 프로젝트 ID와 계약 미승인 안내를 상시 표시한다", () => {
    renderApp("/projects/demo-1/assets");
    expect(screen.getByLabelText("현재 프로젝트")).toHaveTextContent("demo-1");
    expect(screen.getByRole("note")).toHaveTextContent("PENDING_REVIEW");
    expect(screen.getByRole("heading", { level: 1, name: "설비·공간" })).toBeInTheDocument();
  });

  it("프로젝트가 없으면 선택 안 됨과 계약 필요를 표시한다", () => {
    renderApp("/");
    expect(screen.getByLabelText("현재 프로젝트")).toHaveTextContent("프로젝트 선택");
    expect(screen.getByText("계약 필요")).toBeInTheDocument();
  });
});
