import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_ASSETS } from "../../src/features/assets/sampleAssets";
import { SAMPLE_PROJECT_IDS } from "../../src/features/projects/sampleProjects";
import { projectKey } from "../../src/shared/api/queryKeys";
import type { AssetInfo } from "../../src/features/assets/assetView";
import { ASSETS, createFakeServer, errorBody, ME, P1, type FakeServer } from "../fakeApi";
import { renderApp } from "../renderApp";

const A1 = ASSETS[0]!.id; // EQ-001, row_version 2, 모델 EX-100, 이름 "서버 설비 1"
const path = `/projects/${P1}/assets/${A1}`;

function open(server: FakeServer = createFakeServer()) {
  const app = renderApp(path, { source: "api", fetchImpl: server.fetchImpl });
  return { server, ...app };
}

/** 상세가 로드되고 /me의 역할(관리자)이 적용되어 입력이 가능해질 때까지 기다린다. */
async function ready() {
  await screen.findByRole("heading", { level: 1, name: /EQ-001/ });
  await waitFor(() => expect(screen.getByLabelText("모델")).not.toHaveAttribute("readonly"));
}

const saveButton = () => screen.getByRole("button", { name: /^기본 정보 저장/ });

async function replace(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const el = screen.getByLabelText(label);
  await user.clear(el);
  if (value) await user.type(el, value);
}

describe("자산 기본 정보 저장 (PATCH)", () => {
  it("바꾼 필드만 보내고 If-Match는 편집을 시작한 row_version이며, 성공하면 다음 저장은 새 버전을 쓴다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    expect(saveButton()).toBeDisabled(); // 변경 전에는 저장할 수 없다
    await replace(user, "모델", "EX-200");
    await user.click(saveButton());
    expect(await screen.findByText("기본 정보를 저장했습니다.")).toBeInTheDocument();

    const [first] = server.writes();
    expect(first).toMatchObject({ method: "PATCH", path, body: { equipment: { model_name: "EX-200" } } });
    expect(first!.headers["If-Match"]).toBe('"2"');
    expect(server.state.assets[0]!.equipment!.model_name).toBe("EX-200");
    expect(screen.queryByText(/기본 정보에 저장하지 않은 변경/)).not.toBeInTheDocument();

    await replace(user, "이름", "새 이름");
    await user.click(saveButton());
    await waitFor(() => expect(server.writes()).toHaveLength(2));
    expect(server.writes()[1]!.headers["If-Match"]).toBe('"3"');
    expect(server.writes()[1]!.body).toEqual({ name: "새 이름" });
  });

  it("여러 필드를 바꾸면 그 필드만 보낸다(바꾸지 않은 필드는 본문에 없다)", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await replace(user, "이름", "이름 둘");
    await replace(user, "메모", "메모 둘");
    await user.click(saveButton());
    await screen.findByText("기본 정보를 저장했습니다.");
    expect(server.writes()[0]!.body).toEqual({ name: "이름 둘", notes: "메모 둘" });
  });

  it("선택 필드를 비우면 null(입력 없음)로 보내고 서버 값도 지워진다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await replace(user, "모델", "");
    await user.click(saveButton());
    await screen.findByText("기본 정보를 저장했습니다.");
    expect(server.writes()[0]!.body).toEqual({ equipment: { model_name: null } });
    expect(server.state.assets[0]!.equipment!.model_name).toBeNull();
    expect(screen.getByLabelText("모델")).toHaveValue("");
  });

  it("정렬 순서는 숫자로 보낸다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await replace(user, "정렬 순서", "15");
    await user.click(saveButton());
    await screen.findByText("기본 정보를 저장했습니다.");
    expect(server.writes()[0]!.body).toEqual({ sort_order: 15 });
  });

  it("저장 중에는 버튼이 비활성이고 연속 클릭해도 한 번만 보낸다", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const server = createFakeServer(async (req, std) => {
      if (req.method === "PATCH") await gate;
      return std(req);
    });
    open(server);
    await ready();
    await replace(user, "모델", "Z");
    await user.dblClick(saveButton());
    expect(await screen.findByRole("button", { name: "저장 중…" })).toBeDisabled();
    release();
    await screen.findByText("기본 정보를 저장했습니다.");
    expect(server.writes()).toHaveLength(1);
  });

  it("클라이언트 형식 오류가 있으면 저장 버튼이 비활성이고 요청을 보내지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await replace(user, "이름", "");
    expect(screen.getByLabelText("이름")).toBeInvalid();
    expect(saveButton()).toBeDisabled();
    expect(server.writes()).toHaveLength(0);
  });

  it("저장 성공 후 목록으로 돌아가면 바뀐 이름이 보인다(목록 캐시 갱신)", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await replace(user, "이름", "목록에서 보일 이름");
    await user.click(saveButton());
    await screen.findByText("기본 정보를 저장했습니다.");
    const crumbs = screen.getByRole("navigation", { name: "현재 위치" });
    await user.click(within(crumbs).getByRole("link", { name: "설비·공간" }));
    const table = await screen.findByRole("table", { name: "설비·공간 목록" });
    await waitFor(() => expect(within(table).getByText("목록에서 보일 이름")).toBeInTheDocument());
  });
});

describe("충돌(412)은 조용히 덮어쓰지 않는다", () => {
  /** 내가 편집하는 동안 다른 사용자가 이름을 바꾼 상황 */
  const otherUserRenames = (server: FakeServer, name = "다른 사용자가 바꾼 이름") => {
    server.state.assets[0]!.name = name;
    server.state.assets[0]!.row_version = 3;
  };

  it("내 변경 유지: 안 바꾼 필드는 서버 값으로 맞추고 바꾼 필드만 새 버전으로 저장한다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await replace(user, "메모", "내 메모");
    otherUserRenames(server);
    await user.click(saveButton());
    expect(await screen.findByText("자산 기본 정보: 다른 사용자가 먼저 수정했습니다")).toBeInTheDocument();
    expect(screen.getByLabelText("메모")).toHaveValue("내 메모"); // 입력은 사라지지 않았다
    expect(server.state.assets[0]!.notes).toBeNull(); // 서버에는 아무것도 쓰이지 않았다

    await user.click(screen.getByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    await waitFor(() => expect(screen.getByLabelText("이름")).toHaveValue("다른 사용자가 바꾼 이름"));
    expect(screen.getByLabelText("메모")).toHaveValue("내 메모");
    expect(screen.queryByText("자산 기본 정보: 다른 사용자가 먼저 수정했습니다")).not.toBeInTheDocument();
    expect(screen.getByText(/기본 정보에 저장하지 않은 변경/)).toBeInTheDocument();

    await user.click(saveButton());
    await screen.findByText("기본 정보를 저장했습니다.");
    const last = server.writes().at(-1)!;
    expect(last.body).toEqual({ notes: "내 메모" }); // 이름은 보내지 않는다 → 서버의 새 이름이 유지된다
    expect(last.headers["If-Match"]).toBe('"3"');
    expect(server.state.assets[0]!.name).toBe("다른 사용자가 바꾼 이름");
    expect(server.state.assets[0]!.notes).toBe("내 메모");
  });

  it("같은 필드를 둘 다 바꿨으면 내 값을 유지하되 서버 값을 알려 주고 저장 시 내 값으로 바뀐다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await replace(user, "이름", "내 이름");
    otherUserRenames(server, "서버 이름");
    await user.click(saveButton());
    await screen.findByText("자산 기본 정보: 다른 사용자가 먼저 수정했습니다");
    await user.click(screen.getByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    expect(await screen.findByText(/이름\(서버 값: 서버 이름\)/)).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toHaveValue("내 이름");
    expect(server.writes()).toHaveLength(1); // 병합만 했고 아직 저장하지 않았다

    await user.click(saveButton());
    await screen.findByText("기본 정보를 저장했습니다.");
    expect(server.writes().at(-1)!.body).toEqual({ name: "내 이름" });
    expect(server.state.assets[0]!.name).toBe("내 이름");
  });

  it("다시 불러오기: 내 입력을 버리고 서버 값을 보여 준다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await replace(user, "메모", "버려질 메모");
    otherUserRenames(server);
    await user.click(saveButton());
    await screen.findByText("자산 기본 정보: 다른 사용자가 먼저 수정했습니다");
    await user.click(screen.getByRole("button", { name: "최신 내용으로 다시 불러오기" }));
    await waitFor(() => expect(screen.getByLabelText("이름")).toHaveValue("다른 사용자가 바꾼 이름"));
    expect(screen.getByLabelText("메모")).toHaveValue("");
    expect(screen.queryByText(/기본 정보에 저장하지 않은 변경/)).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("조회 캐시가 백그라운드에서 최신으로 바뀌어도 If-Match는 편집을 시작한 버전이라 서버가 충돌로 거부한다", async () => {
    const user = userEvent.setup();
    const { server, queryClient } = open();
    await ready();
    await replace(user, "메모", "내 메모");
    otherUserRenames(server);
    // 다른 화면의 갱신 등으로 캐시가 서버 최신(v3)으로 바뀐 상황
    const key = projectKey(P1, "api", "asset", A1);
    const cached = queryClient.getQueryData<AssetInfo>(key)!;
    queryClient.setQueryData(key, { ...cached, name: "다른 사용자가 바꾼 이름", rowVersion: 3 });
    await user.click(saveButton());
    expect(await screen.findByText("자산 기본 정보: 다른 사용자가 먼저 수정했습니다")).toBeInTheDocument();
    expect(server.writes()[0]!.headers["If-Match"]).toBe('"2"'); // 캐시의 v3가 아니라 편집 시작 버전
    expect(server.state.assets[0]!.notes).toBeNull();
  });

  it("충돌은 용량 버전 섹션의 입력을 지우지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    const cap = await screen.findByLabelText("IN 대기 용량 값");
    await user.clear(cap);
    await user.type(cap, "9");
    await replace(user, "메모", "내 메모");
    otherUserRenames(server);
    await user.click(saveButton());
    await screen.findByText("자산 기본 정보: 다른 사용자가 먼저 수정했습니다");
    await user.click(screen.getByRole("button", { name: "최신 내용으로 다시 불러오기" }));
    await waitFor(() => expect(screen.getByLabelText("메모")).toHaveValue(""));
    expect(screen.getByLabelText("IN 대기 용량 값")).toHaveValue("9");
  });
});

describe("저장 실패 처리", () => {
  const failPatch = (res: ReturnType<typeof errorBody>) =>
    createFakeServer((req, std) => (req.method === "PATCH" ? res : std(req)));

  it("코드 중복(409)은 코드 필드에 표시하고 입력은 유지한다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await replace(user, "표시 코드", "EQ-002");
    await user.click(saveButton());
    await waitFor(() => expect(screen.getByLabelText("표시 코드")).toBeInvalid());
    expect(screen.getByText("이미 사용 중인 코드입니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("표시 코드")).toHaveValue("EQ-002");
    expect(screen.queryByText(/다른 사용자가 먼저 수정했습니다/)).not.toBeInTheDocument();
    expect(server.state.assets[0]!.code).toBe("EQ-001");
    // 고치기 시작하면 서버 오류 표시는 사라진다
    await user.type(screen.getByLabelText("표시 코드"), "X");
    expect(screen.queryByText("이미 사용 중인 코드입니다.")).not.toBeInTheDocument();
  });

  it("422는 field_path로 필드에 연결하고 연결할 수 없는 오류는 검증 패널에 보여 준다", async () => {
    const user = userEvent.setup();
    const server = failPatch(
      errorBody(422, "VALIDATION_ERROR", "형식 오류", [
        { message: "서버가 거부한 이름입니다.", field_path: "/name" },
        { message: "본문 전체 규칙을 위반했습니다.", field_path: "/" },
      ]),
    );
    open(server);
    await ready();
    await replace(user, "이름", "나쁜 이름");
    await user.click(saveButton());
    expect(await screen.findByText("서버가 거부한 이름입니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toBeInvalid();
    // 검증 패널은 기본 정보(저장 오류)와 버전(서버 issues) 두 곳에 있다. 저장 오류 쪽에 내용이 있어야 한다.
    const panels = screen.getAllByRole("alert", { name: "검증 결과" });
    expect(panels.some((p) => p.textContent?.includes("본문 전체 규칙을 위반했습니다."))).toBe(true);
  });

  it("403은 권한 없음 안내를 보여 주고 입력은 유지한다", async () => {
    const user = userEvent.setup();
    open(failPatch(errorBody(403, "FORBIDDEN", "권한 없음")));
    await ready();
    await replace(user, "메모", "내 메모");
    await user.click(saveButton());
    expect(await screen.findByText("저장할 권한이 없습니다")).toBeInTheDocument();
    expect(screen.getByLabelText("메모")).toHaveValue("내 메모");
  });

  it("428(If-Match 누락)은 화면 오류로 안내하고 원인을 사용자에게 설명하지 않는다", async () => {
    const user = userEvent.setup();
    open(failPatch(errorBody(428, "PRECONDITION_REQUIRED", "If-Match 필요")));
    await ready();
    await replace(user, "메모", "내 메모");
    await user.click(saveButton());
    expect(await screen.findByText("저장 요청에 문제가 있습니다")).toBeInTheDocument();
    expect(screen.getByText("req-test")).toBeInTheDocument();
    expect(screen.queryByText(/If-Match/)).not.toBeInTheDocument();
  });

  it("서버에 연결하지 못하면 저장 여부를 알 수 없다고 안내하고 입력을 유지한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) => {
      if (req.method === "PATCH") throw new TypeError("Failed to fetch");
      return std(req);
    });
    open(server);
    await ready();
    await replace(user, "메모", "내 메모");
    await user.click(saveButton());
    expect(await screen.findByText("서버에 연결하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByText(/저장되었는지 알 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByLabelText("메모")).toHaveValue("내 메모");
    expect(saveButton()).toBeEnabled(); // 다시 시도할 수 있다
  });

  it("404(자산이 사라짐)는 대상을 찾을 수 없다고 안내한다", async () => {
    const user = userEvent.setup();
    open(failPatch(errorBody(404, "NOT_FOUND", "없음")));
    await ready();
    await replace(user, "메모", "내 메모");
    await user.click(saveButton());
    expect(await screen.findByText("대상을 찾을 수 없습니다")).toBeInTheDocument();
  });
});

describe("역할에 따른 저장 가능 여부(서버 403이 정본, 화면은 노출만 제한)", () => {
  it("조회자는 입력이 읽기 전용이고 저장 요청을 보낼 수 없다", async () => {
    const asViewer = createFakeServer((req, std) => {
      if (req.path === "/me")
        return { status: 200, body: { data: { ...ME, projects: ME.projects.map((p) => ({ ...p, role: "viewer" })) } } };
      return std(req);
    });
    const user = userEvent.setup();
    open(asViewer);
    await screen.findByRole("heading", { level: 1, name: /EQ-001/ });
    await waitFor(() => expect(screen.getByText(/내 역할: 조회자/)).toBeInTheDocument());
    expect(screen.getByLabelText("모델")).toHaveAttribute("readonly");
    await user.type(screen.getByLabelText("모델"), "X"); // readonly라 입력되지 않는다
    expect(screen.getByLabelText("모델")).toHaveValue("EX-100");
    expect(saveButton()).toBeDisabled();
    expect(asViewer.writes()).toHaveLength(0);
  });

  it("정적 예시 모드에서는 저장하지 않는다(요청 자체가 없다)", async () => {
    const user = userEvent.setup();
    // 정적 예시의 프로젝트 A와 자산 EQ-001(가짜 서버의 id와 별개)
    renderApp(`/projects/${SAMPLE_PROJECT_IDS.a}/assets/${SAMPLE_ASSETS[0]!.id}`);
    await user.type(screen.getByLabelText("모델"), "X");
    expect(screen.getByRole("button", { name: /기본 정보 저장 \(정적 예시\)/ })).toBeDisabled();
  });
});

describe("자산 생성 (POST)", () => {
  const createPath = `/projects/${P1}/assets/new`;

  async function openCreate(server: FakeServer = createFakeServer()) {
    const app = renderApp(createPath, { source: "api", fetchImpl: server.fetchImpl });
    await screen.findByLabelText("표시 코드"); // /me의 역할이 적용된 뒤에만 폼이 나온다
    return { server, ...app };
  }
  const createButton = () => screen.getByRole("button", { name: /^자산 만들기|^만드는 중/ });

  it("설비를 만들면 상세로 이동하고, 본문에는 포트가 없고 비운 선택 필드는 생략된다", async () => {
    const user = userEvent.setup();
    const { server, router } = await openCreate();
    expect(createButton()).toBeDisabled(); // 필수 입력 전
    await user.type(screen.getByLabelText("표시 코드"), "EQ-NEW");
    await user.type(screen.getByLabelText("이름"), "새 설비");
    await user.type(screen.getByLabelText("설비 유형"), "extruder");
    await user.click(createButton());
    await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`^/projects/${P1}/assets/[0-9a-f-]{36}$`)));
    const [post] = server.writes();
    expect(post).toMatchObject({ method: "POST", path: `/projects/${P1}/assets` });
    expect(post!.body).toEqual({
      kind: "equipment",
      code: "EQ-NEW",
      name: "새 설비",
      sort_order: 0,
      equipment: { equipment_type: "extruder" },
    });
    expect(post!.headers["If-Match"]).toBeUndefined(); // 생성에는 If-Match가 없다
    expect(await screen.findByRole("heading", { level: 1, name: /EQ-NEW 새 설비/ })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); // 이동 중 미저장 확인 창이 뜨지 않는다
  });

  it("저장공간은 space만 보내고 서버가 만든 접근 포트가 상세에 보인다", async () => {
    const user = userEvent.setup();
    const { server } = await openCreate();
    await user.selectOptions(screen.getByLabelText("종류"), "storage");
    expect(screen.queryByLabelText("설비 유형")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("표시 코드"), "ST-NEW");
    await user.type(screen.getByLabelText("이름"), "새 공간");
    await user.type(screen.getByLabelText("공간 유형"), "rack");
    await user.click(createButton());
    await screen.findByRole("heading", { level: 1, name: /ST-NEW 새 공간/ });
    expect(server.writes()[0]!.body).toEqual({ kind: "storage", code: "ST-NEW", name: "새 공간", sort_order: 0, space: { space_type: "rack" } });
    expect(screen.getByText("ACCESS")).toBeInTheDocument();
  });

  it("코드 중복(409)은 코드 필드에 표시하고 입력과 화면을 유지한다", async () => {
    const user = userEvent.setup();
    const { router } = await openCreate();
    await user.type(screen.getByLabelText("표시 코드"), "EQ-002");
    await user.type(screen.getByLabelText("이름"), "중복 코드");
    await user.type(screen.getByLabelText("설비 유형"), "extruder");
    await user.click(createButton());
    await waitFor(() => expect(screen.getByLabelText("표시 코드")).toBeInvalid());
    expect(screen.getByText("이미 사용 중인 코드입니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toHaveValue("중복 코드");
    expect(router.state.location.pathname).toBe(createPath);
  });

  it("서버가 필드 오류(422)를 주면 해당 필드에 연결한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "POST"
        ? errorBody(422, "VALIDATION_ERROR", "형식 오류", [{ message: "서버가 거부한 설비 유형", field_path: "/equipment/equipment_type" }])
        : std(req),
    );
    await openCreate(server);
    await user.type(screen.getByLabelText("표시 코드"), "EQ-NEW");
    await user.type(screen.getByLabelText("이름"), "새 설비");
    await user.type(screen.getByLabelText("설비 유형"), "x");
    await user.click(createButton());
    expect(await screen.findByText("서버가 거부한 설비 유형")).toBeInTheDocument();
    expect(screen.getByLabelText("설비 유형")).toBeInvalid();
  });

  it("연결이 끊기면 처리 여부를 알 수 없다고 안내하고 같은 코드로 재조회하는 링크를 준다(중복 생성 방지)", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) => {
      if (req.method === "POST") throw new TypeError("Failed to fetch");
      return std(req);
    });
    await openCreate(server);
    await user.type(screen.getByLabelText("표시 코드"), "EQ-NEW");
    await user.type(screen.getByLabelText("이름"), "새 설비");
    await user.type(screen.getByLabelText("설비 유형"), "extruder");
    await user.click(createButton());
    expect(await screen.findByText("서버에 연결하지 못했습니다")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "이 코드로 목록을 검색" });
    expect(link).toHaveAttribute("href", `/projects/${P1}/assets?q=EQ-NEW`);
    expect(screen.getByLabelText("이름")).toHaveValue("새 설비");
  });

  it("만드는 중에는 버튼이 비활성이고 연속 클릭해도 한 번만 보낸다", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const server = createFakeServer(async (req, std) => {
      if (req.method === "POST") await gate;
      return std(req);
    });
    await openCreate(server);
    await user.type(screen.getByLabelText("표시 코드"), "EQ-NEW");
    await user.type(screen.getByLabelText("이름"), "새 설비");
    await user.type(screen.getByLabelText("설비 유형"), "extruder");
    await user.dblClick(createButton());
    expect(await screen.findByRole("button", { name: "만드는 중…" })).toBeDisabled();
    release();
    await screen.findByRole("heading", { level: 1, name: /EQ-NEW/ });
    expect(server.writes()).toHaveLength(1);
  });

  it("입력 후 다른 화면으로 이동하면 미저장 확인을 한다", async () => {
    const user = userEvent.setup();
    const { router } = await openCreate();
    await user.type(screen.getByLabelText("이름"), "작성 중");
    const crumbs = screen.getByRole("navigation", { name: "현재 위치" });
    await user.click(within(crumbs).getByRole("link", { name: "설비·공간" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("저장하지 않은 변경이 있습니다");
    await user.click(within(dialog).getByRole("button", { name: "계속 편집" }));
    expect(router.state.location.pathname).toBe(createPath);
  });

  it("조회자는 생성할 수 없다(권한 없음 안내, 요청 없음)", async () => {
    const asViewer = createFakeServer((req, std) =>
      req.path === "/me"
        ? { status: 200, body: { data: { ...ME, projects: ME.projects.map((p) => ({ ...p, role: "viewer" })) } } }
        : std(req),
    );
    renderApp(createPath, { source: "api", fetchImpl: asViewer.fetchImpl });
    expect(await screen.findByText("자산을 만들 권한이 없습니다")).toBeInTheDocument();
    expect(screen.queryByLabelText("표시 코드")).not.toBeInTheDocument();
    expect(asViewer.writes()).toHaveLength(0);
  });

  it("목록의 '자산 추가'는 관리자·편집자에게만 링크이고 조회자에게는 비활성이다", async () => {
    const user = userEvent.setup();
    const { router, unmount } = renderApp(`/projects/${P1}/assets`, { source: "api", fetchImpl: createFakeServer().fetchImpl });
    const link = await screen.findByRole("link", { name: "자산 추가" });
    await user.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe(createPath));
    unmount();
    const asViewer = createFakeServer((req, std) =>
      req.path === "/me"
        ? { status: 200, body: { data: { ...ME, projects: ME.projects.map((p) => ({ ...p, role: "viewer" })) } } }
        : std(req),
    );
    renderApp(`/projects/${P1}/assets`, { source: "api", fetchImpl: asViewer.fetchImpl });
    await screen.findByRole("table", { name: "설비·공간 목록" });
    await waitFor(() => expect(screen.getByRole("button", { name: "자산 추가" })).toBeDisabled());
    expect(screen.queryByRole("link", { name: "자산 추가" })).not.toBeInTheDocument();
  });

  it("정적 예시 모드에서는 만들 수 없다", async () => {
    const user = userEvent.setup();
    renderApp(`/projects/${SAMPLE_PROJECT_IDS.a}/assets/new`);
    await user.type(screen.getByLabelText("표시 코드"), "EQ-NEW");
    await user.type(screen.getByLabelText("이름"), "새 설비");
    await user.type(screen.getByLabelText("설비 유형"), "extruder");
    expect(createButton()).toBeDisabled();
  });
});