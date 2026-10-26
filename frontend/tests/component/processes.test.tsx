import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_PROCESSES } from "../../src/features/processes/sampleProcesses";
import { renderApp } from "../renderApp";

const PROJECT = "aaaaaaaa-0000-4000-8000-000000000001";
const DRAFT = Object.values(SAMPLE_PROCESSES).find((p) => p.version.status === "draft")!.version;
const APPROVED = Object.values(SAMPLE_PROCESSES).find((p) => p.version.status === "approved")!.version;
const EMPTY = Object.values(SAMPLE_PROCESSES).find((p) => p.version.status === "in_review")!.version;
const url = (v: { id: string; productId: string }, query = "") => `/projects/${PROJECT}/products/${v.productId}/processes/${v.id}${query}`;
const stepTable = () => screen.getByRole("table", { name: /공정 v\d+ 단계/ });

describe("공정 화면 (정적 예시)", () => {
  it("예시 표시와 단계 표: 설비 후보·처리·다음 위치를 자산 표시 코드로 보여 준다", () => {
    renderApp(url(DRAFT));
    expect(screen.getByText(/예시 데이터입니다/)).toBeInTheDocument();
    expect(screen.queryByText("초안 UI")).not.toBeInTheDocument(); // 계약이 승인되어 더 이상 초안 UI가 아니다
    const table = stepTable();
    expect(within(table).getAllByRole("row")).toHaveLength(4); // 단계 3 + 머리글
    expect(within(table).getByText("EQ-001, EQ-002 (택1)")).toBeInTheDocument();
    expect(within(table).getByText("20 m/분 (산출 기준)")).toBeInTheDocument();
    expect(within(table).getByText("ST-001")).toBeInTheDocument();
    expect(within(table).getByText("위치 미정")).toBeInTheDocument(); // 공간은 있으나 위치 미정
    expect(within(table).getByText("공간 없음")).toBeInTheDocument(); // 공간 자체가 없음(위치 미정과 다르다)
    expect(within(table).getByText("미정 · 투입 교체마다")).toBeInTheDocument(); // 준비 시간 미정 ≠ 0분
  });

  it("미정은 서버 검증 경고로 보이고 오류는 없다(FE가 경고를 만들지 않는다)", () => {
    renderApp(url(DRAFT));
    const panel = screen.getByRole("alert", { name: "검증 결과" });
    expect(panel).toHaveTextContent("오류 0건, 경고 6건");
    expect(panel).toHaveTextContent("대기 공간의 위치가 미정입니다.");
    const row = within(stepTable()).getByText("예시 검사").closest("tr")!;
    expect(row).toHaveTextContent("경고 2"); // 처리 방식 미정 + 설비 후보 없음, entity_id로 단계에 연결된다
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
    expect(within(stepTable()).getByText("새 이름")).toBeInTheDocument();
  });

  it("처리 방식을 바꿔 값이 사라질 때는 확인하고, 취소하면 그대로 둔다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 압출 편집" }));
    await user.selectOptions(screen.getByLabelText("처리 방식"), "per_output_unit");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("입력한 값이 사라집니다");
    expect(dialog).toHaveTextContent("선속: 20 m/분");
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.getByLabelText("처리 방식")).toHaveValue("output_speed");
    expect(screen.getByLabelText("선속 값")).toHaveValue("20");
    expect(screen.queryByText(/저장하지 않은 변경이 있습니다/)).not.toBeInTheDocument();
  });

  it("확인하면 새 방식으로 바뀌고 이전 단위의 값을 이어받지 않는다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 압출 편집" }));
    await user.selectOptions(screen.getByLabelText("처리 방식"), "per_output_unit");
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "값을 버리고 변경" }));
    expect(screen.getByLabelText("처리 방식")).toHaveValue("per_output_unit");
    // 선속 20이 시간 20분으로 둔갑하지 않는다
    expect(within(screen.getByRole("radiogroup", { name: "산출 단위당 시간 상태" })).getByRole("radio", { name: "미정", checked: true })).toBeInTheDocument();
    expect(screen.getByText(/저장하지 않은 변경이 있습니다/)).toBeInTheDocument();
  });

  it("버릴 값이 없으면 확인 없이 바로 바뀐다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 검사 편집" }));
    await user.selectOptions(screen.getByLabelText("처리 방식"), "per_output_unit");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("처리 방식")).toHaveValue("per_output_unit");
  });

  it("산출 방식을 바꿔 길이가 사라질 때도 확인한다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 압출 편집" }));
    await user.selectOptions(screen.getByLabelText("산출 방식"), "pass_through");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("산출 길이: 1000 m");
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.getByLabelText("산출 방식")).toHaveValue("split_length");
  });

  it("준비 시점이 해당 없음이면 준비 시간 입력이 없다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 압출 편집" }));
    expect(screen.queryByLabelText("준비 시간 값")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("준비 시점"), "per_operation");
    // 준비 시간 입력이 나타나며 기본은 미정이다(0분이 아니다)
    const group = screen.getByRole("radiogroup", { name: "준비 시간 상태" });
    expect(within(group).getByRole("radio", { name: "미정", checked: true })).toBeInTheDocument();
    await user.click(within(group).getByRole("radio", { name: "값 있음" }));
    await user.type(screen.getByLabelText("준비 시간 값"), "0");
    expect(screen.getByLabelText("준비 시간 값")).toBeValid(); // 준비 시간 0분은 유효하다
  });

  it("설비 후보는 자산 id로 고르고 후보 수보다 많은 수량은 오류가 된다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 압출 편집" }));
    expect(screen.getByLabelText(/EQ-001 예시 절연 압출기/)).toBeChecked();
    expect(screen.getByLabelText(/EQ-002 예시 쉬스 압출기/)).toBeChecked();
    const count = screen.getByLabelText("자원 1 필요 수량");
    await user.clear(count);
    await user.type(count, "3");
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 1건");
    expect(screen.getByRole("region", { name: "이 단계의 검증 항목" })).toBeInTheDocument();
    await user.clear(count);
    await user.type(count, "2");
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 0건");
    // 후보 확인 상태는 확인됨으로 가정하지 않는다
    expect(screen.getByLabelText("EQ-002 후보 확인 상태 (자원 1)")).toHaveValue("unknown");
  });

  it("단계를 추가하면 이름 없는 단계가 오류가 되고 편집이 열린다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "단계 추가" }));
    expect(await screen.findByRole("heading", { name: /단계 편집/ })).toBeInTheDocument();
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 1건");
    expect(screen.getByRole("button", { name: "저장 (정적 예시)" })).toBeDisabled();
  });

  it("순서를 바꾸면 표의 순서가 바뀌고 첫 단계는 위로 이동할 수 없다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    expect(screen.getByRole("button", { name: "예시 압출 위로 이동" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "예시 압출 아래로 이동" }));
    const rows = within(stepTable()).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("예시 편조");
    expect(rows[2]).toHaveTextContent("예시 압출");
    expect(rows[2]).toHaveTextContent("ST-001"); // 다음 위치는 단계와 함께 움직인다
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
    await waitFor(() => expect(screen.queryByRole("button", { name: "예시 검사 편집" })).not.toBeInTheDocument());
  });

  it("다음 위치를 바꾼다: 공간 없음 / 위치 미정 / 특정 공간", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "예시 검사 편집" }));
    await user.selectOptions(screen.getByLabelText("다음 위치"), "unset");
    expect(within(stepTable()).getAllByText("위치 미정")).toHaveLength(2);
    const st2 = screen.getByRole("option", { name: /ST-002/ }) as HTMLOptionElement;
    await user.selectOptions(screen.getByLabelText("다음 위치"), st2.value);
    expect(within(stepTable()).getByText("ST-002")).toBeInTheDocument();
  });

  it("원자재·완제품 단위는 미정으로 시작하고 입력할 수 있다", async () => {
    const user = userEvent.setup();
    renderApp(url(DRAFT));
    expect(screen.getAllByRole("radio", { name: "미정", checked: true }).length).toBeGreaterThanOrEqual(8);
    await user.click(within(screen.getByRole("group", { name: "원자재 길이" })).getByRole("radio", { name: "값 있음" }));
    await user.type(screen.getByLabelText("원자재 길이 값"), "3000");
    expect(screen.getByText(/저장하지 않은 변경이 있습니다/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("원자재 길이 값"));
    await user.type(screen.getByLabelText("원자재 길이 값"), "0");
    expect(screen.getByLabelText("원자재 길이 값")).toBeInvalid();
  });

  it("미저장 변경이 있으면 프로젝트 전환 전에 확인한다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(url(DRAFT));
    await user.click(screen.getByRole("button", { name: "단계 추가" }));
    await user.click(screen.getByRole("button", { name: /프로젝트 전환/ }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /예시 프로젝트 B/ }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("저장하지 않은 변경이 있습니다");
    await user.click(screen.getByRole("button", { name: "변경을 버리고 이동" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/aaaaaaaa-0000-4000-8000-000000000002/products"));
  });

  it("승인된 버전은 읽기 전용이다", async () => {
    const user = userEvent.setup();
    renderApp(url(APPROVED));
    expect(screen.queryByRole("button", { name: "단계 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /삭제$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/초안이 아닌 버전은 수정할 수 없습니다/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "예시 압출 보기" }));
    expect(await screen.findByText(/읽기 전용입니다/)).toBeInTheDocument();
    expect(screen.getByLabelText("공정명")).toBeDisabled();
    expect(screen.getByRole("button", { name: "저장 (정적 예시)" })).toBeDisabled();
  });

  it("정적 예시에서는 검토 요청·검증·새 초안을 보내지 않는다", () => {
    renderApp(url(DRAFT));
    expect(screen.getByRole("button", { name: "검토 요청" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "검증 실행" })).toBeDisabled();
  });

  it("단계가 없는 검토 중 버전은 빈 상태를 보여 준다", () => {
    renderApp(url(EMPTY));
    expect(screen.getByText("단계가 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "단계 추가" })).not.toBeInTheDocument();
  });

  it("다른 제품의 버전 ID를 붙이면 찾을 수 없음으로 표시한다", () => {
    renderApp(`/projects/${PROJECT}/products/${EMPTY.productId}/processes/${DRAFT.id}`);
    expect(screen.getAllByText("공정을 찾을 수 없습니다").length).toBeGreaterThan(0);
  });

  it.each([
    ["loading", "불러오는 중입니다"],
    ["error", "요청에 실패했습니다"],
    ["forbidden", "접근 권한이 없습니다"],
    ["conflict", "다른 사용자가 먼저 수정했습니다"],
  ])("상태 미리보기 %s", (state, text) => {
    renderApp(url(DRAFT, `?state=${state}`));
    expect(screen.getAllByText(new RegExp(text)).length).toBeGreaterThan(0);
  });
});
