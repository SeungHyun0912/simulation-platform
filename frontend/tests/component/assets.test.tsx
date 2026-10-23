import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  isOpenStatus,
  isRevisionEditable,
  statusLabel,
  toInfoDraft,
  toRevisionEdit,
  validateInfoDraft,
} from "../../src/features/assets/assetView";
import {
  fromCapacityDto,
  toCapacityRequest,
  validateCapacity,
} from "../../src/features/assets/capacityAdapter";
import { describeDispatch, describeRelease } from "../../src/features/assets/ruleLabels";
import { SAMPLE_ASSETS, SAMPLE_REVISIONS } from "../../src/features/assets/sampleAssets";
import { SAMPLE_PROJECT_IDS } from "../../src/features/projects/sampleProjects";
import { renderApp } from "../renderApp";

const A = SAMPLE_PROJECT_IDS.a; // 관리자
const B = SAMPLE_PROJECT_IDS.b; // 조회자
const C = SAMPLE_PROJECT_IDS.c; // 편집자

const byCode = (code: string) => SAMPLE_ASSETS.find((a) => a.code === code)!;
const EQ1 = byCode("EQ-001"); // 승인본 v1 + 초안 v2
const EQ2 = byCode("EQ-002"); // 승인본만
const EQ3 = byCode("EQ-003"); // 버전 없음
const EQ4 = byCode("EQ-004"); // 대체됨 이력, kg 경고
const ST1 = byCode("ST-001"); // 저장공간, 초안, 미정 용량
const ST2 = byCode("ST-002"); // 도킹, 검토 중

const at = (project: string, asset: { id: string }, query = "") =>
  `/projects/${project}/assets/${asset.id}${query}`;

describe("capacityAdapter", () => {
  it("값 있음은 finite로 바꾸고 그 외 모드는 mode만 보낸다(unit·status 없음)", () => {
    expect(toCapacityRequest({ mode: "value", value: "4", unit: "item" })).toEqual({
      mode: "finite",
      value: "4",
      unit: "item",
    });
    for (const mode of ["unknown", "unlimited", "not_allowed"] as const)
      expect(toCapacityRequest({ mode, value: "9", unit: "kg" })).toEqual({ mode });
  });
  it("용량에 해당 없음 모드는 없으므로 조용히 바꾸지 않고 오류를 낸다", () => {
    expect(() => toCapacityRequest({ mode: "not_applicable", value: "" })).toThrow();
  });
  it("응답의 finite는 값 있음으로, 그 외는 값 없음으로 바꾼다", () => {
    expect(fromCapacityDto({ mode: "finite", value: "2.5", unit: "kg", status: "confirmed" })).toEqual({
      mode: "value",
      value: "2.5",
      unit: "kg",
    });
    expect(fromCapacityDto({ mode: "not_allowed", value: null, unit: null })).toMatchObject({
      mode: "not_allowed",
      value: "",
    });
  });
});

describe("validateCapacity (finite는 0 초과)", () => {
  const v = (value: string, unit = "item") => validateCapacity({ mode: "value", value, unit });
  it("0은 용량이 될 수 없고 '대기 불가'를 안내한다", () => {
    expect(v("0")).toMatch(/대기 불가/);
    expect(v("0", "kg")).toMatch(/대기 불가/);
    expect(v("0.000", "kg")).toMatch(/대기 불가/);
  });
  it("개수 단위는 선행 0 없는 정수만 허용한다", () => {
    expect(v("4")).toBeNull();
    expect(v("007")).not.toBeNull();
    expect(v("1.5")).not.toBeNull();
    expect(v("")).not.toBeNull();
    expect(v("4", "bobbin_slot")).toBeNull();
  });
  it("kg·㎡는 소수 6자리까지 허용하고 7자리는 거부한다", () => {
    expect(v("2.5", "kg")).toBeNull();
    expect(v("0.5", "m2")).toBeNull();
    expect(v("1.123456", "kg")).toBeNull();
    expect(v("1.1234567", "kg")).not.toBeNull();
    expect(v("01.5", "kg")).not.toBeNull();
  });
  it("용량에 쓸 수 없는 단위는 거부한다", () => {
    expect(v("5", "m")).toMatch(/단위/);
    expect(v("5", "bobbin")).toMatch(/단위/);
  });
  it("값 있음이 아니면 검사하지 않는다", () => {
    expect(validateCapacity({ mode: "unknown", value: "" })).toBeNull();
  });
});

describe("assetView·ruleLabels", () => {
  it("버전 상태 라벨은 대체됨을 포함하고 모르는 값은 알 수 없음이다", () => {
    expect(statusLabel("superseded")).toBe("대체됨");
    expect(statusLabel("whatever")).toBe("알 수 없음");
  });
  it("편집 가능 여부는 draft 상태와 역할이 모두 필요하다", () => {
    expect(isRevisionEditable("draft", true)).toBe(true);
    expect(isRevisionEditable("draft", false)).toBe(false);
    expect(isRevisionEditable("approved", true)).toBe(false);
    expect(isOpenStatus("in_review")).toBe(true);
    expect(isOpenStatus("superseded")).toBe(false);
  });
  it("선택 필드를 비우면 입력 없음으로 다루고 설비 유형은 필수다", () => {
    const d = toInfoDraft(EQ3);
    expect(validateInfoDraft(d, "equipment")).toEqual({});
    expect(validateInfoDraft({ ...d, equipmentType: " " }, "equipment").equipmentType).toBeDefined();
    expect(validateInfoDraft({ ...d, sortOrder: "-1" }, "equipment").sortOrder).toBeDefined();
    expect(validateInfoDraft({ ...d, spaceType: "" }, "storage").spaceType).toBeDefined();
  });
  it("버전 편집본은 포트별 용량·규칙을 portId로 담는다", () => {
    const rev = SAMPLE_REVISIONS[EQ1.id]![0]!;
    const edit = toRevisionEdit(rev);
    expect(Object.keys(edit.ports)).toEqual(rev.ports.map((p) => p.portId));
    expect(Object.keys(edit.ports[rev.ports[0]!.portId]!)).toEqual(["capacity", "dispatch", "release"]);
  });
  it("확정(D-U05·D-U06)과 미정(OPEN-003)을 구분해 표시하고 미정을 채우지 않는다", () => {
    const rule = SAMPLE_REVISIONS[EQ1.id]![0]!.ports[0]!;
    const lines = [...describeDispatch(rule.dispatchRule), ...describeRelease(rule.releaseRule)];
    expect(lines.filter((l) => l.tone === "confirmed").map((l) => l.basis)).toEqual(
      expect.arrayContaining(["D-U05", "D-U06"]),
    );
    expect(lines.find((l) => l.name === "이동 중 설비 예약")).toMatchObject({
      text: "미정",
      tone: "unknown",
      basis: "OPEN-003",
    });
    expect(describeDispatch({ mode: "unknown" })[0]).toMatchObject({ text: "미정", tone: "unknown" });
  });
});

describe("설비·공간 목록", () => {
  it("용량·그룹 컬럼 없이 최신 버전과 승인본을 보여 준다", () => {
    renderApp(`/projects/${A}/assets`);
    const table = screen.getByRole("table", { name: "설비·공간 목록" });
    expect(within(table).getAllByRole("row")).toHaveLength(SAMPLE_ASSETS.length + 1);
    expect(within(table).queryByRole("columnheader", { name: /용량|그룹/ })).not.toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "최신 버전" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "승인본" })).toBeInTheDocument();
    expect(within(table).getByText("버전 없음")).toBeInTheDocument();
    expect(within(table).queryByText("대체됨")).not.toBeInTheDocument(); // 목록에는 최신 버전만 보인다
  });

  it("경로에 프로젝트 id 대신 코드를 표시한다", () => {
    renderApp(`/projects/${A}/assets`);
    const crumbs = screen.getByRole("navigation", { name: "현재 위치" });
    expect(crumbs).toHaveTextContent("DEMO-A");
    expect(crumbs).not.toHaveTextContent(A);
  });

  it("서버가 지원하는 정렬(정렬 순서·코드·이름)만 제공하고 상태·모델 정렬은 없다", () => {
    renderApp(`/projects/${A}/assets`);
    const table = screen.getByRole("table", { name: "설비·공간 목록" });
    for (const name of ["표시 코드", "이름", "정렬 순서"])
      expect(within(table).getByRole("columnheader", { name })).toHaveAttribute("aria-sort");
    for (const name of ["유형", "포트", "최신 버전", "승인본"])
      expect(within(table).getByRole("columnheader", { name })).not.toHaveAttribute("aria-sort");
  });

  it("정렬 순서 내림차순이 숫자 기준으로 적용된다", async () => {
    const user = userEvent.setup();
    renderApp(`/projects/${A}/assets`);
    const header = screen.getByRole("columnheader", { name: /정렬 순서/ });
    await user.click(within(header).getByRole("button"));
    await user.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
    const rows = within(screen.getByRole("table", { name: "설비·공간 목록" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("ST-002"); // 120이 가장 크다
  });

  it("검색 결과가 없으면 안내와 조건 지우기를 제공한다", async () => {
    const user = userEvent.setup();
    renderApp(`/projects/${A}/assets`);
    await user.type(screen.getByLabelText("검색"), "zzzz");
    expect(screen.getByText("검색 결과가 없습니다")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "검색 조건 지우기" }));
    expect(screen.getByRole("table", { name: "설비·공간 목록" })).toBeInTheDocument();
  });

  it("유형 필터가 동작한다", async () => {
    const user = userEvent.setup();
    renderApp(`/projects/${A}/assets`);
    await user.selectOptions(screen.getByLabelText("유형"), "dock");
    expect(within(screen.getByRole("table", { name: "설비·공간 목록" })).getAllByRole("row")).toHaveLength(2);
  });

  it.each([
    ["loading", "불러오는 중입니다"],
    ["error", "요청에 실패했습니다"],
    ["empty", "등록된 설비·공간이 없습니다"],
    ["forbidden", "접근 권한이 없습니다"],
  ])("상태 미리보기 %s", (state, text) => {
    renderApp(`/projects/${A}/assets?state=${state}`);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe("설비 상세: 설비(승인본 + 초안)", () => {
  it("기본 정보는 항상 편집 가능하고 버전은 초안에서만 편집 가능하다", () => {
    renderApp(at(A, EQ1));
    expect(screen.getByLabelText("이름")).not.toHaveAttribute("readonly");
    expect(within(screen.getByRole("radiogroup", { name: "IN 대기 용량 상태" })).getByRole("radio", { name: "값 있음" })).toBeEnabled();
  });

  it("최신 버전(초안)을 기본으로 열고 포트별 용량을 보여 준다", () => {
    renderApp(at(A, EQ1));
    expect(screen.getByLabelText("버전", { selector: "select" })).toHaveValue(EQ1.latestRevision!.id);
    expect(screen.getByLabelText("IN 대기 용량 값")).toHaveValue("4");
    expect(
      within(screen.getByRole("radiogroup", { name: "OUT 대기 용량 상태" })).getByRole("radio", {
        name: "대기 불가",
      }),
    ).toBeChecked();
  });

  it("서버 검증 결과를 그대로 보여 준다(미정 규칙은 경고)", () => {
    renderApp(at(A, EQ1));
    const panel = screen.getByRole("alert", { name: "검증 결과" });
    expect(panel).toHaveTextContent("오류 0건, 경고 2건");
    expect(panel).toHaveTextContent("OPEN-003");
  });

  it("이동·배출 규칙은 선택 입력이며 확정(D-U05·D-U06)과 미정(OPEN-003)을 구분해 보여 준다", () => {
    renderApp(at(A, EQ1));
    const dispatch = screen.getByLabelText("IN 이동 조건") as HTMLSelectElement;
    expect(dispatch.value).toBe("when_destination_available");
    expect(within(dispatch).getByRole("option", { name: /D-U05 확정/ })).toBeInTheDocument();
    expect((screen.getByLabelText("IN 배출 조건") as HTMLSelectElement).value).toBe("when_destination_accepts");
    expect((screen.getByLabelText("IN 이동 중 설비 예약") as HTMLSelectElement).value).toBe("unknown"); // 미정을 채우지 않는다
    expect(within(dispatch).getByRole("option", { name: /OPEN-003/ })).toBeInTheDocument(); // 미정 선택지도 근거를 표시한다
  });

  it("용량에 0을 입력하면 오류이고 대기 불가를 안내한다", async () => {
    const user = userEvent.setup();
    renderApp(at(A, EQ1));
    const input = screen.getByLabelText("IN 대기 용량 값");
    await user.clear(input);
    await user.type(input, "0");
    expect(input).toBeInvalid();
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("오류 1건");
    expect(screen.getAllByText(/대기 불가/).length).toBeGreaterThan(0);
    expect(screen.getByText(/용량·규칙에 저장하지 않은 변경/)).toBeInTheDocument();
  });

  it("용량 단위는 5종이며 공정 단위는 없다", () => {
    renderApp(at(A, EQ1));
    const unit = screen.getByLabelText("IN 대기 용량 단위");
    expect(within(unit).getAllByRole("option").map((o) => (o as HTMLOptionElement).value)).toEqual([
      "item",
      "bobbin_slot",
      "pallet_slot",
      "kg",
      "m2",
    ]);
  });

  it("기본 정보 변경과 용량 변경은 각각 따로 표시되고 정적 예시에서는 저장 버튼이 비활성이다", async () => {
    const user = userEvent.setup();
    renderApp(at(A, EQ1));
    await user.type(screen.getByLabelText("모델"), "X");
    expect(screen.getByText(/기본 정보에 저장하지 않은 변경/)).toBeInTheDocument();
    expect(screen.queryByText(/용량·규칙에 저장하지 않은 변경/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /기본 정보 저장/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /용량·규칙 저장/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "기본 정보 되돌리기" }));
    expect(screen.queryByText(/기본 정보에 저장하지 않은 변경/)).not.toBeInTheDocument();
  });

  it("이름을 비우면 필드 오류가 나고 저장 버튼 안내가 바뀐다", async () => {
    const user = userEvent.setup();
    renderApp(at(A, EQ1));
    await user.clear(screen.getByLabelText("이름"));
    expect(screen.getByLabelText("이름")).toBeInvalid();
  });

  it("역할별 버튼: 관리자는 검토 요청이 보이고 승인·반려는 검토 중 버전에서만 보인다", () => {
    renderApp(at(A, EQ1));
    expect(screen.getByRole("button", { name: /검토 요청/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^승인/ })).not.toBeInTheDocument();
  });
});

describe("충돌은 리소스별로 구분된다", () => {
  it("기본 정보 충돌: 용량 입력은 보존하고 기본 정보만 되돌린다", async () => {
    const user = userEvent.setup();
    renderApp(at(A, EQ1, "?state=conflict"));
    expect(screen.getByText("자산 기본 정보: 다른 사용자가 먼저 수정했습니다")).toBeInTheDocument();
    const cap = screen.getByLabelText("IN 대기 용량 값");
    await user.clear(cap);
    await user.type(cap, "9");
    await user.type(screen.getByLabelText("모델"), "Z");
    await user.click(screen.getByRole("button", { name: "최신 내용으로 다시 불러오기" }));
    expect(screen.getByLabelText("모델")).toHaveValue("EX-100");
    expect(screen.getByLabelText("IN 대기 용량 값")).toHaveValue("9");
  });

  it("버전 충돌: 기본 정보 입력은 보존하고 용량만 되돌린다", async () => {
    const user = userEvent.setup();
    renderApp(at(A, EQ1, "?state=conflict-revision"));
    expect(screen.getByText("용량 버전: 다른 사용자가 먼저 수정했습니다")).toBeInTheDocument();
    await user.type(screen.getByLabelText("모델"), "Z");
    const cap = screen.getByLabelText("IN 대기 용량 값");
    await user.clear(cap);
    await user.type(cap, "9");
    await user.click(screen.getByRole("button", { name: "최신 내용으로 다시 불러오기" }));
    expect(screen.getByLabelText("IN 대기 용량 값")).toHaveValue("4");
    expect(screen.getByLabelText("모델")).toHaveValue("EX-100Z");
  });
});

describe("승인된 버전은 읽기 전용이지만 기본 정보는 편집할 수 있다", () => {
  it("승인본만 있는 자산: 용량 입력 비활성, 새 초안 안내, 기본 정보는 편집 가능", () => {
    renderApp(at(A, EQ2));
    expect(screen.getByText(/승인 상태의 버전은 수정할 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /새 초안 만들기/ })).toBeDisabled();
    expect(
      within(screen.getByRole("radiogroup", { name: "IN 대기 용량 상태" })).getByRole("radio", {
        name: "미정",
      }),
    ).toBeDisabled();
    expect(screen.getByLabelText("이름")).not.toHaveAttribute("readonly");
  });

  it("승인본을 보다가 열린 초안으로 이동할 수 있다", async () => {
    const user = userEvent.setup();
    renderApp(at(A, EQ1));
    await user.selectOptions(screen.getByLabelText("버전", { selector: "select" }), EQ1.currentRevision!.id);
    expect(screen.getByText(/승인 상태의 버전은 수정할 수 없습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /새 초안 만들기/ })).not.toBeInTheDocument(); // 이미 열린 버전이 있다
    await user.click(screen.getByRole("button", { name: /열린 버전\(v2\) 보기/ }));
    expect(screen.getByLabelText("버전", { selector: "select" })).toHaveValue(EQ1.latestRevision!.id);
  });

  it("대체됨 이력과 단위 경고(kg)를 보여 준다", async () => {
    const user = userEvent.setup();
    renderApp(at(A, EQ4));
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("경고 1건");
    await user.selectOptions(
      screen.getByLabelText("버전", { selector: "select" }),
      SAMPLE_REVISIONS[EQ4.id]![1]!.id,
    );
    expect(screen.getByText(/대체됨 상태의 버전은 수정할 수 없습니다/)).toBeInTheDocument();
    const history = screen.getByRole("table", { name: "EQ-004 버전 이력" });
    expect(within(history).getByText("대체됨")).toBeInTheDocument();
  });
});

describe("버전이 없거나 공간인 자산", () => {
  it("버전이 없으면 빈 상태와 시작 버튼을 보여 준다(자동 생성하지 않음)", () => {
    renderApp(at(A, EQ3));
    expect(screen.getByText("버전이 없습니다")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /용량 설정 시작/ })).toBeDisabled();
    expect(screen.queryByRole("table", { name: /버전 이력/ })).not.toBeInTheDocument();
  });

  it("저장공간은 저장 용량 하나만 있고 IN/OUT 용량 구역은 없다", () => {
    renderApp(at(A, ST1));
    expect(screen.getByRole("group", { name: "저장 용량" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /IN 대기 용량/ })).not.toBeInTheDocument();
    expect(screen.getByText(/접근 포트\(ACCESS\)에는 용량·규칙 정책이 없고/)).toBeInTheDocument();
    expect(screen.getByLabelText("공간 유형")).toHaveValue("storage");
  });

  it("도킹의 용량을 무제한으로 가정하지 않고 검토 중 버전은 읽기 전용이며 관리자는 승인·반려 버튼이 보인다", () => {
    renderApp(at(A, ST2));
    expect(screen.getByText(/도킹이라는 이유로 용량을 무제한으로 가정하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText(/검토 중 상태의 버전은 수정할 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^승인/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^반려/ })).toBeDisabled();
  });
});

describe("역할에 따른 화면", () => {
  it("조회자는 모든 입력이 읽기 전용이고 작업 버튼이 보이지 않는다", () => {
    renderApp(at(B, EQ1));
    expect(screen.getByText(/내 역할: 조회자/)).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toHaveAttribute("readonly");
    expect(
      within(screen.getByRole("radiogroup", { name: "IN 대기 용량 상태" })).getByRole("radio", {
        name: "값 있음",
      }),
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: /검토 요청/ })).not.toBeInTheDocument();
  });

  it("편집자는 검토 요청은 보이지만 승인·반려는 보이지 않는다", () => {
    renderApp(at(C, ST2));
    expect(screen.getByText(/내 역할: 편집자/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^승인/ })).not.toBeInTheDocument();
    renderApp(at(C, EQ1));
    expect(screen.getAllByRole("button", { name: /검토 요청/ }).length).toBeGreaterThan(0);
  });

  it("목록에 없는 프로젝트는 역할을 알 수 없어 읽기 전용이다", () => {
    renderApp(at("00000000-0000-4000-8000-0000000000ff", EQ1));
    expect(screen.getByText(/내 역할: 알 수 없음/)).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toHaveAttribute("readonly");
  });
});

describe("기타 상태", () => {
  it("포트는 고정 항목이며 삭제 동작이 없고 위치는 미정으로 표시한다", () => {
    renderApp(at(A, EQ1));
    expect(screen.queryByRole("button", { name: /포트.*삭제/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("위치 미정 (미배치)")).toHaveLength(2);
  });

  it("존재하지 않는 자산은 찾을 수 없음으로 표시한다", () => {
    renderApp(`/projects/${A}/assets/not-a-uuid`);
    expect(screen.getAllByText("자산을 찾을 수 없습니다").length).toBeGreaterThan(0);
  });

  it("권한 없음 상태를 표시한다", () => {
    renderApp(at(A, EQ1, "?state=forbidden"));
    expect(screen.getByText("접근 권한이 없습니다")).toBeInTheDocument();
  });

  it("승인 시각은 프로젝트 시간대로 표시한다", () => {
    renderApp(at(A, EQ2));
    const history = screen.getByRole("table", { name: "EQ-002 버전 이력" });
    expect(within(history).getByText(/2026\. 10\. 23\. 09:00/)).toBeInTheDocument(); // UTC 00:00 → Asia/Seoul 09:00
  });

  it("미저장 변경이 있으면 화면 이동 전에 확인한다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(at(A, EQ1));
    await user.type(screen.getByLabelText("모델"), "X");
    const crumbs = screen.getByRole("navigation", { name: "현재 위치" });
    await user.click(within(crumbs).getByRole("link", { name: "설비·공간" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("저장하지 않은 변경이 있습니다");
    await user.click(within(dialog).getByRole("button", { name: "변경을 버리고 이동" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${A}/assets`));
  });

  it("용량만 바꿔도 미저장 변경으로 보호한다", async () => {
    const user = userEvent.setup();
    const { router } = renderApp(at(A, EQ1));
    const cap = screen.getByLabelText("IN 대기 용량 값");
    await user.clear(cap);
    await user.type(cap, "7");
    const crumbs = screen.getByRole("navigation", { name: "현재 위치" });
    await user.click(within(crumbs).getByRole("link", { name: "설비·공간" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(at(A, EQ1));
  });
});
