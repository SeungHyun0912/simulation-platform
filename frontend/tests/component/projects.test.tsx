import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  accentFor,
  canApprove,
  canEdit,
  isValidTimeZone,
  PROJECT_LIMITS,
  projectRoleLabel,
  toProjectOption,
  validateProjectDraft,
  type ProjectDraft,
} from "../../src/features/projects/projectView";
import { SAMPLE_PROJECTS } from "../../src/features/projects/sampleProjects";
import { renderApp } from "../renderApp";

const VALID: ProjectDraft = {
  organizationId: "bbbbbbbb-0000-4000-8000-000000000001",
  code: "P1",
  name: "이름",
  timezone: "Asia/Seoul",
  description: "",
};

describe("validateProjectDraft", () => {
  it("올바른 입력은 오류가 없고 설명은 비워 둘 수 있다", () => {
    expect(validateProjectDraft(VALID)).toEqual({});
  });
  it("필수 항목이 비면 각각 오류다(공백만 있는 값 포함)", () => {
    const e = validateProjectDraft({ ...VALID, organizationId: "", code: " ", name: "", timezone: "" });
    expect(Object.keys(e).sort()).toEqual(["code", "name", "organizationId", "timezone"]);
  });
  it("길이 제한을 넘으면 오류이고 제한 길이는 허용한다", () => {
    expect(validateProjectDraft({ ...VALID, code: "a".repeat(PROJECT_LIMITS.code) })).toEqual({});
    expect(validateProjectDraft({ ...VALID, code: "a".repeat(PROJECT_LIMITS.code + 1) }).code).toMatch(/64자/);
    expect(validateProjectDraft({ ...VALID, name: "a".repeat(PROJECT_LIMITS.name + 1) }).name).toMatch(/200자/);
    expect(
      validateProjectDraft({ ...VALID, description: "a".repeat(PROJECT_LIMITS.description + 1) }).description,
    ).toMatch(/4000자/);
  });
});

describe("프로젝트 시간대·색·역할", () => {
  it("IANA 시간대 이름만 허용한다", () => {
    expect(isValidTimeZone("Asia/Seoul")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(validateProjectDraft({ ...VALID, timezone: "Seoul" }).timezone).toMatch(/IANA/);
  });
  it("프로젝트 색은 id로 결정되며 목록 순서와 무관하다", () => {
    for (const p of SAMPLE_PROJECTS) expect(accentFor(p.id)).toBe(accentFor(p.id));
    const accents = SAMPLE_PROJECTS.map((p) => toProjectOption(p).accent);
    expect([...accents].reverse()).toEqual(
      [...SAMPLE_PROJECTS].reverse().map((p) => toProjectOption(p).accent),
    );
    for (const a of accents) expect([1, 2, 3, 4]).toContain(a);
  });
  it("역할 라벨은 모르는 값을 그대로 보여 주고 권한 판정은 서버 몫임을 전제로 노출용만 계산한다", () => {
    expect(projectRoleLabel("admin")).toBe("관리자");
    expect(projectRoleLabel("reviewer")).toBe("reviewer");
    expect(canEdit("editor")).toBe(true);
    expect(canEdit("viewer")).toBe(false);
    expect(canEdit(undefined)).toBe(false);
    expect(canApprove("editor")).toBe(false);
    expect(canApprove("admin")).toBe(true);
  });
});

describe("프로젝트 목록", () => {
  it("예시 표시와 모든 프로젝트의 코드·역할·상태를 보여 준다", () => {
    renderApp("/");
    expect(screen.getByText(/예시 데이터입니다/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "프로젝트 목록" });
    expect(within(table).getAllByRole("row")).toHaveLength(SAMPLE_PROJECTS.length + 1);
    expect(within(table).getByText("조회자")).toBeInTheDocument();
    expect(within(table).getAllByText("active").length).toBeGreaterThan(0);
  });

  it("프로젝트를 열면 그 프로젝트의 설비·공간 화면으로 이동한다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");
    await user.click(screen.getByRole("link", { name: "예시 프로젝트 B 열기" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/aaaaaaaa-0000-4000-8000-000000000002/assets"));
    expect(screen.getByRole("group", { name: "현재 프로젝트" })).toHaveTextContent("DEMO-B");
  });

  it("검색 결과가 없으면 안내하고 조건 지우기로 되돌린다", async () => {
    const user = userEvent.setup();
    renderApp("/");
    await user.type(screen.getByLabelText("검색"), "zzzz");
    expect(screen.getByText("검색 결과가 없습니다")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "검색 조건 지우기" }));
    expect(screen.getByRole("table", { name: "프로젝트 목록" })).toBeInTheDocument();
  });

  it.each([
    ["loading", "불러오는 중입니다"],
    ["error", "요청에 실패했습니다"],
    ["empty", "접근 가능한 프로젝트가 없습니다"],
    ["forbidden", "접근 권한이 없습니다"],
  ])("상태 미리보기 %s", (state, text) => {
    renderApp(`/?state=${state}`);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("프로젝트 만들기 링크로 생성 화면에 이동한다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/");
    await user.click(screen.getByRole("link", { name: "프로젝트 만들기" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/new"));
  });
});

describe("프로젝트 만들기", () => {
  it("처음에는 오류를 보여 주지 않고, 생성 버튼은 계약 필요로 비활성이다", () => {
    renderApp("/projects/new");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /만들기 \(계약 필요\)/ })).toBeDisabled();
    expect(screen.getByLabelText("조직")).toHaveValue("bbbbbbbb-0000-4000-8000-000000000001");
    expect(screen.getByLabelText("시간대")).toHaveValue("Asia/Seoul");
  });

  it("조직 관리자인 조직만 고를 수 있다(구성원 조직은 선택지에 없다)", () => {
    renderApp("/projects/new");
    const options = within(screen.getByLabelText("조직")).getAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain("ORG-A 예시 조직 A");
    expect(labels.join()).not.toContain("ORG-B");
  });

  it("알 수 없는 시간대를 입력하면 IANA 이름 안내가 나온다", async () => {
    const user = userEvent.setup();
    renderApp("/projects/new");
    const tz = screen.getByLabelText("시간대");
    await user.clear(tz);
    await user.type(tz, "Seoul");
    expect(tz).toBeInvalid();
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("IANA");
  });

  it("건드린 필드의 오류만 보여 준다", async () => {
    const user = userEvent.setup();
    renderApp("/projects/new");
    await user.type(screen.getByLabelText("이름"), "a");
    await user.clear(screen.getByLabelText("이름"));
    expect(screen.getByLabelText("이름")).toBeInvalid();
    expect(screen.getByLabelText("코드")).not.toBeInvalid();
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 1건");
  });

  it("설명은 선택 항목이라 비워도 오류가 아니다", async () => {
    const user = userEvent.setup();
    renderApp("/projects/new");
    await user.type(screen.getByLabelText("설명 (선택)"), "x");
    await user.clear(screen.getByLabelText("설명 (선택)"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("입력 후 다른 화면으로 이동하면 확인하고, 계속 편집하면 입력이 유지된다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/projects/new");
    await user.type(screen.getByLabelText("코드"), "ABC");
    expect(screen.getByText(/저장하지 않은 변경이 있습니다/)).toBeInTheDocument();
    const crumbs = screen.getByRole("navigation", { name: "현재 위치" });
    await user.click(within(crumbs).getByRole("link", { name: "프로젝트" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "계속 편집" }));
    expect(router.state.location.pathname).toBe("/projects/new");
    expect(screen.getByLabelText("코드")).toHaveValue("ABC");
    await user.click(within(crumbs).getByRole("link", { name: "프로젝트" }));
    await user.click(await screen.findByRole("button", { name: "변경을 버리고 이동" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});
