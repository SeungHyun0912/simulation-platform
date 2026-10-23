import { render, screen } from "@testing-library/react";
import { renderApp } from "../renderApp";
import { StateNotice } from "../../src/shared/components/StateNotice";
import { ValidationPanel } from "../../src/shared/components/ValidationPanel";
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

describe("ValidationPanel", () => {
  const warn = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ severity: "warning" as const, message: `경고 ${i}` }));

  it("경고가 적으면 그대로 보여 주고, 많으면 접되 건수는 항상 보인다", () => {
    const { rerender } = render(<ValidationPanel issues={warn(3)} />);
    expect(screen.getByText("경고 0")).toBeVisible();
    rerender(<ValidationPanel issues={warn(4)} />);
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("경고 4건");
    expect(screen.getByText("경고 0")).not.toBeVisible();
  });

  it("오류는 경고가 많아도 접지 않는다", () => {
    render(
      <ValidationPanel issues={[{ severity: "error", message: "오류 하나" }, ...warn(5)]} />,
    );
    expect(screen.getByText("오류 하나")).toBeVisible();
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
    expect(screen.getByRole("note")).toHaveTextContent("정적 예시 화면입니다");
    expect(screen.getByRole("note")).toHaveAttribute("data-source", "static");
    expect(screen.getByRole("heading", { level: 1, name: "설비·공간" })).toBeInTheDocument();
  });

  it("프로젝트가 없으면 선택 안 됨과 프로젝트 목록을 표시한다", () => {
    renderApp("/");
    expect(screen.getByLabelText("현재 프로젝트")).toHaveTextContent("프로젝트 선택");
    expect(screen.getByRole("table", { name: "프로젝트 목록" })).toBeInTheDocument();
  });
});
