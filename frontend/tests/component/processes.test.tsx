import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_PROCESS_VERSIONS } from "../../src/features/processes/sampleProcesses";
import {
  newStep,
  outputText,
  processingText,
  setupText,
  validateStep,
  UNKNOWN_VALUE,
  type StepView,
} from "../../src/features/processes/processView";
import { renderApp } from "../renderApp";

const DRAFT = SAMPLE_PROCESS_VERSIONS.find((v) => v.status === "draft")!;
const APPROVED = SAMPLE_PROCESS_VERSIONS.find((v) => v.status === "approved")!;
const EMPTY = SAMPLE_PROCESS_VERSIONS.find((v) => v.steps.length === 0)!;
const url = (v: { id: string; productId: string }, query = "") =>
  `/projects/p1/products/${v.productId}/processes/${v.id}${query}`;

function step(patch: Partial<StepView>): StepView {
  return { ...newStep("s1"), name: "단계", ...patch };
}

describe("processView 문구", () => {
  it("선속과 보빈당 길이를 서로 다른 값으로 표시한다", () => {
    const s = DRAFT.steps[0]!;
    expect(processingText(s.processing)).toBe("20 m/분 (산출 기준)");
    expect(outputText(s.output)).toBe("1000 m씩 분할");
  });
  it("준비 시점은 알지만 시간이 미정이면 0분이 아니라 미정으로 표시한다", () => {
    expect(setupText(DRAFT.steps[1]!.setup)).toBe("미정 · 투입 교체마다");
    expect(
      setupText({ trigger: "per_operation", duration: { mode: "value", value: "0", unit: "min" } }),
    ).toBe("0 분 · 작업마다");
    expect(setupText({ trigger: "not_applicable", duration: UNKNOWN_VALUE("min") })).toBe("없음");
  });
  it("기준 길이당 시간은 기준 길이를 함께 보여 준다", () => {
    expect(
      processingText({
        kind: "per_reference_length",
        referenceLength: { mode: "value", value: "1000", unit: "m" },
        value: { mode: "value", value: "720", unit: "min" },
      }),
    ).toBe("기준 1000 m당 720 분");
  });
});

describe("validateStep", () => {
  it("이름이 없으면 오류, 새 단계의 미정 값은 경고다", () => {
    const issues = validateStep(newStep("s1"), 1);
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(1);
    expect(issues.some((i) => i.severity === "warning")).toBe(true);
  });
  it("특정 설비 지정은 설비가 정확히 하나여야 한다", () => {
    const two = step({ equipment: { mode: "specific", candidateCodes: ["EQ-001", "EQ-002"] } });
    expect(validateStep(two, 1).some((i) => i.severity === "error")).toBe(true);
    const one = step({ equipment: { mode: "specific", candidateCodes: ["EQ-001"] } });
    expect(validateStep(one, 1).some((i) => i.field_path?.endsWith("/equipment"))).toBe(false);
  });
  it("값 있음인데 형식이 틀리면 오류이고 0은 유효하다", () => {
    const bad = step({
      processing: {
        kind: "output_speed",
        value: { mode: "value", value: "1e3", unit: "m_per_min" },
        referenceLength: UNKNOWN_VALUE("m"),
      },
    });
    expect(validateStep(bad, 1).some((i) => i.severity === "error")).toBe(true);
    const zero = step({
      setup: { trigger: "per_operation", duration: { mode: "value", value: "0", unit: "min" } },
    });
    expect(validateStep(zero, 1).some((i) => i.field_path?.includes("/setup"))).toBe(false);
  });
  it("그대로 유지(pass_through)는 산출 길이를 요구하지 않는다", () => {
    const s = step({
      output: { mode: "pass_through", unitCount: UNKNOWN_VALUE("bobbin"), length: UNKNOWN_VALUE("m") },
    });
    expect(validateStep(s, 1).some((i) => i.field_path?.includes("/output"))).toBe(false);
  });
});

describe("공정 표 편집 (초안 UI)", () => {
  it("초안 UI 표시와 예시 표시, 단계 표를 보여 준다", () => {
    renderApp(url(DRAFT));
    expect(screen.getByText("초안 UI")).toBeInTheDocument();
    expect(screen.getByText(/예시 데이터입니다/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /단계/ });
    expect(within(table).getAllByRole("row")).toHaveLength(DRAFT.steps.length + 1);
    expect(within(table).getByText("20 m/분 (산출 기준)")).toBeInTheDocument();
    expect(within(table).getByText("후보 없음")).toBeInTheDocument();
  });

  it("미정 값은 경고로 모으고 오류는 없다", () => {
    renderApp(url(DRAFT));
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 0건");
  });

  it("편집을 열면 제목으로 포커스가 이동하고 닫으면 편집 버튼으로 돌아온다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 압출 편집" }));
    const heading = await screen.findByRole("heading", { name: "단계 편집: 예시 압출" });
    await waitFor(() => expect(heading).toHaveFocus());
    await user.click(screen.getByRole("button", { name: "편집 닫기" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "예시 압출 편집" })).toHaveFocus());
  });

  it("이름을 바꾸면 표와 미저장 표시에 반영된다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 압출 편집" }));
    const name = screen.getByLabelText("공정명");
    await user.clear(name);
    await user.type(name, "새 이름");
    expect(screen.getByText(/저장하지 않은 변경이 있습니다/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /단계/ });
    expect(within(table).getByText("새 이름")).toBeInTheDocument();
  });

  it("처리 방식을 바꾸면 이전 단위의 값을 이어받지 않는다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 압출 편집" }));
    expect(screen.getByLabelText("선속 값")).toHaveValue("20");
    await user.selectOptions(screen.getByLabelText("처리 방식"), "per_output_unit");
    expect(screen.queryByLabelText("선속 값")).not.toBeInTheDocument();
    const group = screen.getByRole("radiogroup", { name: "산출 단위당 시간 상태" });
    expect(within(group).getByRole("radio", { name: "미정" })).toBeChecked();
    const table = screen.getByRole("table", { name: /단계/ });
    expect(within(table).getAllByText("산출 단위당 미정").length).toBeGreaterThan(0);
  });

  it("준비 시점이 해당 없음이면 준비 시간 입력이 없다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 압출 편집" }));
    expect(screen.queryByRole("group", { name: "준비 시간" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("준비 시점"), "per_operation");
    expect(screen.getByRole("group", { name: "준비 시간" })).toBeInTheDocument();
  });

  it("특정 설비 지정에서 후보를 둘 고르면 오류가 된다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 압출 편집" }));
    await user.selectOptions(screen.getByLabelText("배정 방식"), "specific");
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 1건");
    await user.click(screen.getByLabelText(/EQ-002/));
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 0건");
  });

  it("단계를 추가하면 이름 없는 단계가 오류가 되고 편집이 열린다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "단계 추가" }));
    expect(await screen.findByRole("heading", { name: /단계 편집/ })).toBeInTheDocument();
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 1건");
  });

  it("순서를 바꾸면 표의 순서가 바뀌고 첫 단계는 위로 이동할 수 없다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    expect(screen.getByRole("button", { name: "예시 압출 위로 이동" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "예시 압출 아래로 이동" }));
    const rows = within(screen.getByRole("table", { name: /단계/ })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("예시 편조");
    expect(rows[2]).toHaveTextContent("예시 압출");
  });

  it("삭제는 확인 후에만 반영되고 취소하면 유지된다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 검사 삭제" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.getByRole("button", { name: "예시 검사 편집" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "예시 검사 삭제" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "삭제" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "예시 검사 편집" })).not.toBeInTheDocument(),
    );
  });

  it("미저장 변경이 있으면 프로젝트 전환 전에 확인한다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(url(DRAFT).replace("/p1/", "/demo-a/"));
    await user.click(screen.getByRole("button", { name: "단계 추가" }));
    await user.click(screen.getByRole("button", { name: /프로젝트 전환/ }));
    await user.click(
      within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /예시 프로젝트 B/ }),
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent("저장하지 않은 변경이 있습니다");
    await user.click(screen.getByRole("button", { name: "변경을 버리고 이동" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/demo-b/products"));
  });

  it("승인된 버전은 읽기 전용이다", async () => {
    const user = userEvent.setup();
    renderApp(url(APPROVED));
    expect(screen.queryByRole("button", { name: "단계 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /삭제$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "예시 압출 보기" }));
    expect(await screen.findByText(/읽기 전용입니다/)).toBeInTheDocument();
    expect(screen.getByLabelText("공정명")).toBeDisabled();
  });

  it("단계가 없는 검토 중 버전은 빈 상태를 보여 준다", () => {
    renderApp(url(EMPTY));
    expect(screen.getByText("단계가 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "단계 추가" })).not.toBeInTheDocument();
  });

  it("다른 제품의 버전 ID를 붙이면 찾을 수 없음으로 표시한다", () => {
    renderApp(`/projects/p1/products/${EMPTY.productId}/processes/${DRAFT.id}`);
    expect(screen.getAllByText("공정을 찾을 수 없습니다").length).toBeGreaterThan(0);
  });

  it.each([
    ["loading", "불러오는 중입니다"],
    ["error", "요청에 실패했습니다"],
    ["forbidden", "접근 권한이 없습니다"],
    ["conflict", "다른 사용자가 먼저 수정했습니다"],
  ])("상태 미리보기 %s", (state, text) => {
    renderApp(url(DRAFT, `?state=${state}`));
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
