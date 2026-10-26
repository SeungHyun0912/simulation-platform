import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, ME, P1, type FakeServer } from "../fakeApi";
import { materialIdOf } from "../fakeMaterials";
import { renderApp } from "../renderApp";

const slow = { timeout: 8000 }; // 병렬 실행 중 첫 렌더가 느릴 수 있어 기본(1초)보다 넉넉히 기다린다.
const listPath = `/projects/${P1}/materials`;
const detailPath = (n: number) => `${listPath}/${materialIdOf(n)}`;
const roleText = { admin: "관리자", editor: "편집자", viewer: "조회자" };

function open(path: string, server: FakeServer = createFakeServer()) {
  const app = renderApp(path, { source: "api", fetchImpl: server.fetchImpl });
  return { server, ...app };
}

function serverAs(role: "admin" | "editor" | "viewer") {
  const server = createFakeServer((req, std) =>
    req.path === "/me" ? { status: 200, body: { data: { ...ME, projects: ME.projects.map((p) => ({ ...p, role })) } } } : std(req),
  );
  server.state.role = role;
  return server;
}

async function ready(code = "M-001", role: keyof typeof roleText = "admin") {
  await screen.findByRole("heading", { level: 1, name: new RegExp(code) }, slow);
  await waitFor(() => expect(screen.getByText(new RegExp(`내 역할: ${roleText[role]}`))).toBeInTheDocument(), slow);
}

const saveButton = () => screen.getByRole("button", { name: /^저장/ });
const mat = (s: FakeServer, n: number) => s.state.materials.find((m) => m.id === materialIdOf(n))!;
const patches = (s: FakeServer) => s.writes().filter((w) => w.method === "PATCH");

async function replace(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const el = screen.getByLabelText(label);
  await user.clear(el);
  if (value) await user.type(el, value);
}
const mode = (group: string, name: string) => within(screen.getByRole("group", { name: group })).getByRole("radio", { name });

describe("재료 목록 (API)", () => {
  it("서버 목록을 보여 주고 미정·해당 없음·확정 값을 구분한다", async () => {
    const { server } = open(listPath);
    const table = await screen.findByRole("table", { name: "재료 목록" }, slow);
    expect(screen.getByText(/서버에서 불러온 데이터입니다/)).toBeInTheDocument();
    const m2 = within(table).getByText("M-002").closest("tr")!;
    expect(m2).toHaveTextContent("1000 m");
    expect(m2).toHaveTextContent("3 단위");
    expect(m2).toHaveTextContent("해당 없음");
    expect(within(table).getByText("M-001").closest("tr")).toHaveTextContent("2000.500000 kg");
    expect(within(table).getByText("M-003").closest("tr")).toHaveTextContent("미정");
    expect(within(table).queryByText(/서버 재료 9 /)).not.toBeInTheDocument(); // 보관된 재료는 기본 목록에 없다
    expect(server.requests.find((r) => r.path === listPath)!.query.get("include_archived")).toBeNull();
  });

  it("보관 포함·검색·정렬은 서버 쿼리로 보낸다", async () => {
    const user = userEvent.setup();
    const { server } = open(listPath);
    await screen.findByRole("table", { name: "재료 목록" }, slow);
    await user.click(screen.getByLabelText("보관된 재료 포함"));
    expect(await screen.findByText("서버 재료 9 (보관됨)")).toBeInTheDocument();
    expect(server.requests.some((r) => r.query.get("include_archived") === "true")).toBe(true);
    await user.type(screen.getByLabelText("검색"), "zzzz");
    expect(await screen.findByText("검색 결과가 없습니다")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "검색 조건 지우기" }));
    await screen.findByRole("table", { name: "재료 목록" });
    await user.click(screen.getByRole("button", { name: /이름/ }));
    await waitFor(() => expect(server.requests.some((r) => r.query.get("sort") === "name")).toBe(true));
  });

  it("50건을 넘으면 더 보기로 cursor를 이어 받는다", async () => {
    const user = userEvent.setup();
    const { server } = open(listPath);
    const table = await screen.findByRole("table", { name: "재료 목록" }, slow);
    const before = within(table).getAllByRole("row").length;
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(within(screen.getByRole("table", { name: "재료 목록" })).getAllByRole("row").length).toBeGreaterThan(before));
    expect(server.requests.at(-1)!.query.get("cursor")).toBeTruthy();
  });

  it("서버 오류는 목록 오류 안내와 다시 시도를 보여 준다", async () => {
    const server = createFakeServer((req, std) => (req.path === listPath && req.method === "GET" ? errorBody(500, "INTERNAL", "서버 오류") : std(req)));
    open(listPath, server);
    expect(await screen.findByRole("button", { name: /다시 시도/ }, slow)).toBeInTheDocument();
  });

  it("조회자는 재료 추가가 비활성이다", async () => {
    open(listPath, serverAs("viewer"));
    await screen.findByRole("table", { name: "재료 목록" }, slow);
    await waitFor(() => expect(screen.getByRole("button", { name: "재료 추가" })).toBeDisabled());
  });
});

describe("재료 저장 (PATCH)", () => {
  it("바꾼 필드만 보내고 If-Match는 편집을 시작한 row_version이며 성공하면 다음 저장은 새 버전을 쓴다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(1));
    await ready();
    expect(saveButton()).toBeDisabled();
    await replace(user, "이름", "새 이름");
    await user.click(saveButton());
    expect(await screen.findByText("재료 정보를 저장했습니다.")).toBeInTheDocument();
    expect(patches(server)[0]).toMatchObject({ path: detailPath(1), body: { name: "새 이름" } });
    expect(patches(server)[0]!.headers["If-Match"]).toBe('"1"');
    await replace(user, "메모", "메모 하나");
    await user.click(saveButton());
    await waitFor(() => expect(patches(server)).toHaveLength(2));
    expect(patches(server)[1]!.headers["If-Match"]).toBe('"2"');
    expect(patches(server)[1]!.body).toEqual({ notes: "메모 하나" });
  });

  it("기본 규격은 바꾼 값만 보낸다: 미정→값은 known, 값→미정은 mode만, 개수는 JSON 정수", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(3)); // 모두 미정
    await ready("M-003");
    await user.click(mode("기본 규격 길이", "값 있음"));
    await user.type(screen.getByLabelText("기본 규격 길이 값"), "3000");
    await user.click(mode("기본 규격 단위 수", "값 있음"));
    await user.type(screen.getByLabelText("기본 규격 단위 수 값"), "3");
    await user.click(mode("기본 규격 중량", "해당 없음"));
    await user.click(saveButton());
    await screen.findByText("재료 정보를 저장했습니다.");
    const body = patches(server)[0]!.body;
    expect(body).toEqual({
      default_spec: { length_m: { mode: "known", value: "3000" }, unit_count: { mode: "known", value: 3 }, weight_kg: { mode: "not_applicable" } },
    });
    expect(typeof body.default_spec.unit_count.value).toBe("number");
    expect(mat(server, 3).default_spec.strand_count).toMatchObject({ mode: "unknown" }); // 안 보낸 필드는 유지된다

    // 확정값을 다시 미정으로: mode만 보낸다
    await user.click(mode("기본 규격 길이", "미정"));
    await user.click(saveButton());
    await waitFor(() => expect(patches(server)).toHaveLength(2));
    expect(patches(server)[1]!.body).toEqual({ default_spec: { length_m: { mode: "unknown" } } });
    expect(patches(server)[1]!.headers["If-Match"]).toBe('"2"');
    expect(mat(server, 3).default_spec.length_m).toMatchObject({ mode: "unknown", value: null });
  });

  it("규격만 바꾸면 기본 정보 필드는 보내지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(1));
    await ready();
    await user.click(mode("기본 규격 가닥 수", "값 있음"));
    await user.type(screen.getByLabelText("기본 규격 가닥 수 값"), "12");
    await user.click(saveButton());
    await screen.findByText("재료 정보를 저장했습니다.");
    expect(patches(server)[0]!.body).toEqual({ default_spec: { strand_count: { mode: "known", value: 12 } } });
  });

  it("규격 형식 오류가 있으면 저장 버튼이 비활성이고 요청을 보내지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(3));
    await ready("M-003");
    await user.click(mode("기본 규격 중량", "값 있음"));
    await user.type(screen.getByLabelText("기본 규격 중량 값"), "0");
    expect(screen.getByLabelText("기본 규격 중량 값")).toBeInvalid();
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveAttribute("title", "오류를 해결해야 저장할 수 있습니다");
    expect(server.writes()).toHaveLength(0);
  });

  it("저장 중에는 버튼이 비활성이고 연속 클릭해도 한 번만 보낸다", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const server = createFakeServer(async (req, std) => {
      if (req.method === "PATCH") await gate;
      return std(req);
    });
    open(detailPath(1), server);
    await ready();
    await replace(user, "이름", "Z");
    await user.dblClick(saveButton());
    expect(await screen.findByRole("button", { name: "저장 중…" })).toBeDisabled();
    release();
    await screen.findByText("재료 정보를 저장했습니다.");
    expect(patches(server)).toHaveLength(1);
  });

  it("저장 성공 후 목록으로 돌아가면 바뀐 이름이 보인다(목록 캐시 갱신)", async () => {
    const user = userEvent.setup();
    open(detailPath(1));
    await ready();
    await replace(user, "이름", "목록에서 보일 이름");
    await user.click(saveButton());
    await screen.findByText("재료 정보를 저장했습니다.");
    await user.click(within(screen.getByRole("navigation", { name: "주 메뉴" })).getByRole("link", { name: "재료" }));
    expect(await screen.findByText("목록에서 보일 이름", {}, slow)).toBeInTheDocument();
  });
});

describe("재료 충돌(412)은 조용히 덮어쓰지 않는다", () => {
  const otherUser = (server: FakeServer) => {
    mat(server, 1).name = "다른 사용자가 바꾼 이름";
    mat(server, 1).row_version = 3;
  };

  it("내 변경 유지: 안 바꾼 항목은 서버 값으로 맞추고 바꾼 항목만 새 버전으로 저장한다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(1));
    await ready();
    await user.click(mode("기본 규격 가닥 수", "값 있음"));
    await user.type(screen.getByLabelText("기본 규격 가닥 수 값"), "12");
    otherUser(server);
    await user.click(saveButton());
    expect(await screen.findByText("다른 사용자가 먼저 수정했습니다")).toBeInTheDocument();
    expect(mat(server, 1).default_spec.strand_count).toMatchObject({ mode: "unknown" }); // 서버에는 아무것도 쓰이지 않았다
    await user.click(screen.getByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    await waitFor(() => expect(screen.getByLabelText("이름")).toHaveValue("다른 사용자가 바꾼 이름"));
    expect(screen.getByLabelText("기본 규격 가닥 수 값")).toHaveValue("12");
    expect(patches(server)).toHaveLength(1); // 병합만 했고 저장은 사용자가 다시 눌러야 한다
    await user.click(saveButton());
    await screen.findByText("재료 정보를 저장했습니다.");
    expect(patches(server)[1]!.body).toEqual({ default_spec: { strand_count: { mode: "known", value: 12 } } });
    expect(patches(server)[1]!.headers["If-Match"]).toBe('"3"');
    expect(mat(server, 1).name).toBe("다른 사용자가 바꾼 이름");
  });

  it("같은 규격 값을 둘 다 바꿨으면 내 값을 유지하되 서버 값을 알린다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(1));
    await ready();
    await replace(user, "기본 규격 길이 값", "999");
    mat(server, 1).default_spec.length_m = { mode: "unknown", value: null };
    mat(server, 1).row_version = 3;
    await user.click(saveButton());
    await user.click(await screen.findByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    expect(await screen.findByText(/다른 사용자가 바꾼 값이 있습니다/)).toHaveTextContent("기본 규격 길이(서버 값: 미정)");
    expect(screen.getByLabelText("기본 규격 길이 값")).toHaveValue("999");
  });

  it("다시 불러오기: 내 입력을 버리고 서버 값을 보여 준다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(1));
    await ready();
    await replace(user, "메모", "내 메모");
    otherUser(server);
    await user.click(saveButton());
    await user.click(await screen.findByRole("button", { name: "최신 내용으로 다시 불러오기" }));
    await waitFor(() => expect(screen.getByLabelText("이름")).toHaveValue("다른 사용자가 바꾼 이름"));
    expect(screen.getByLabelText("메모")).toHaveValue("");
  });
});

describe("재료 저장 실패 처리", () => {
  it("코드 중복(409)은 코드 필드에 표시하고 입력은 유지한다", async () => {
    const user = userEvent.setup();
    open(detailPath(1));
    await ready();
    await replace(user, "표시 코드", "M-002");
    await user.click(saveButton());
    expect(await screen.findByText("이미 사용 중인 코드입니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("표시 코드")).toBeInvalid();
    expect(screen.getByLabelText("표시 코드")).toHaveValue("M-002");
  });

  it("422는 field_path로 기본 정보·규격 입력에 연결하고 연결할 수 없는 오류는 검증 패널에 보여 준다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "PATCH"
        ? errorBody(422, "VALIDATION_ERROR", "검증 실패", [
            { message: "서버: 형태가 올바르지 않습니다.", field_path: "/form" },
            { message: "서버: 이 길이는 허용되지 않습니다.", field_path: "/default_spec/length_m/value" },
            { message: "서버: 본문 전체 규칙 위반", field_path: "/" },
          ])
        : std(req),
    );
    open(detailPath(1), server);
    await ready();
    await replace(user, "형태", "나쁜 형태");
    await replace(user, "기본 규격 길이 값", "1234");
    await user.click(saveButton());
    expect(await screen.findByText("서버: 형태가 올바르지 않습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("형태")).toBeInvalid();
    expect(screen.getByText("서버: 이 길이는 허용되지 않습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("기본 규격 길이 값")).toBeInvalid();
    expect(screen.getByText("서버: 본문 전체 규칙 위반")).toBeInTheDocument();
    // 고치기 시작하면 그 항목의 서버 오류가 사라진다
    await user.type(screen.getByLabelText("형태"), "!");
    expect(screen.queryByText("서버: 형태가 올바르지 않습니다.")).not.toBeInTheDocument();
  });

  it("403은 권한 없음 안내를 보이고 입력은 유지한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    server.state.role = "viewer"; // 화면은 관리자, 서버는 조회자로 바뀐 상황
    open(detailPath(1), server);
    await ready();
    await replace(user, "이름", "내 이름");
    await user.click(saveButton());
    expect(await screen.findByText("저장할 권한이 없습니다")).toBeInTheDocument();
    expect(screen.getByLabelText("이름")).toHaveValue("내 이름");
  });

  it("서버에 연결하지 못하면 저장 여부를 알 수 없다고 안내하고 입력을 유지한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) => {
      if (req.method === "PATCH") throw new TypeError("Failed to fetch");
      return std(req);
    });
    open(detailPath(1), server);
    await ready();
    await replace(user, "메모", "내 메모");
    await user.click(saveButton());
    expect(await screen.findByText("서버에 연결하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByLabelText("메모")).toHaveValue("내 메모");
    expect(saveButton()).toBeEnabled();
  });

  it("없는 재료(404)는 찾을 수 없음 안내를 보여 준다", async () => {
    open(`${listPath}/00000000-0000-4000-8000-00000000dead`);
    expect((await screen.findAllByText("재료를 찾을 수 없습니다", {}, slow)).length).toBeGreaterThan(0);
  });
});

describe("재료 역할", () => {
  it("조회자는 입력이 읽기 전용이고 저장 요청을 보낼 수 없다", async () => {
    const server = serverAs("viewer");
    open(detailPath(1), server);
    await ready("M-001", "viewer");
    expect(screen.getByLabelText("이름")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("기본 규격 길이 값")).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    expect(server.writes()).toHaveLength(0);
  });

  it("보관된 재료는 보관됨 안내를 보여 준다", async () => {
    open(detailPath(9));
    await ready("M-009");
    expect(screen.getByText("보관된 재료입니다.")).toBeInTheDocument();
  });
});

describe("재료 생성 (POST)", () => {
  const createPath = `${listPath}/new`;
  const submit = () => screen.getByRole("button", { name: /재료 만들기|만드는 중/ });
  const fillBasics = async (user: ReturnType<typeof userEvent.setup>, code: string, name = "새 재료", form = "릴") => {
    await user.type(screen.getByLabelText("표시 코드"), code);
    await user.type(screen.getByLabelText("이름"), name);
    await user.type(screen.getByLabelText("형태"), form);
  };

  it("규격 미정·빈 메모는 본문에서 생략하고 성공하면 상세로 이동한다", async () => {
    const user = userEvent.setup();
    const { server, router } = open(createPath);
    await screen.findByLabelText("표시 코드", {}, slow);
    expect(screen.getAllByRole("radio", { name: "미정", checked: true })).toHaveLength(4);
    await fillBasics(user, "NEW-1");
    await user.click(submit());
    await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`${listPath}/[\\w-]+$`)));
    expect(server.writes()[0]).toMatchObject({ method: "POST", path: listPath, body: { code: "NEW-1", name: "새 재료", form: "릴" } });
    expect(Object.keys(server.writes()[0]!.body)).toEqual(["code", "name", "form"]);
    expect(await screen.findByRole("heading", { level: 1, name: /NEW-1 새 재료/ }, slow)).toBeInTheDocument();
  });

  it("값을 정한 규격과 해당 없음을 본문에 담고 개수는 JSON 정수로 보낸다", async () => {
    const user = userEvent.setup();
    const { server } = open(createPath);
    await screen.findByLabelText("표시 코드", {}, slow);
    await fillBasics(user, "NEW-2", "둘째", "보빈");
    await user.click(mode("기본 규격 길이", "값 있음"));
    await user.type(screen.getByLabelText("기본 규격 길이 값"), "3000");
    await user.click(mode("기본 규격 단위 수", "값 있음"));
    await user.type(screen.getByLabelText("기본 규격 단위 수 값"), "3");
    await user.click(mode("기본 규격 중량", "해당 없음"));
    await user.type(screen.getByLabelText("메모"), "메모 Y");
    await user.click(submit());
    await waitFor(() => expect(server.writes()).toHaveLength(1));
    expect(server.writes()[0]!.body).toEqual({
      code: "NEW-2",
      name: "둘째",
      form: "보빈",
      notes: "메모 Y",
      default_spec: { length_m: { mode: "known", value: "3000" }, unit_count: { mode: "known", value: 3 }, weight_kg: { mode: "not_applicable" } },
    });
    await waitFor(() => expect(server.state.materials.at(-1)!.default_spec.unit_count).toEqual({ mode: "known", value: 3 }));
  });

  it("형태를 비우면 만들 수 없다", async () => {
    const user = userEvent.setup();
    const { server } = open(createPath);
    await screen.findByLabelText("표시 코드", {}, slow);
    await user.type(screen.getByLabelText("표시 코드"), "NEW-3");
    await user.type(screen.getByLabelText("이름"), "셋째");
    expect(submit()).toBeDisabled();
    await user.type(screen.getByLabelText("형태"), "릴");
    expect(submit()).toBeEnabled();
    expect(server.writes()).toHaveLength(0);
  });

  it("코드 중복(409)은 코드 필드에 표시하고 입력과 화면을 유지한다", async () => {
    const user = userEvent.setup();
    const { router } = open(createPath);
    await screen.findByLabelText("표시 코드", {}, slow);
    await fillBasics(user, "M-001", "중복");
    await user.click(submit());
    expect(await screen.findByText("이미 사용 중인 코드입니다.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(createPath);
    expect(screen.getByLabelText("이름")).toHaveValue("중복");
  });

  it("서버가 규격 오류(422)를 주면 해당 규격 입력에 연결한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "POST"
        ? errorBody(422, "VALIDATION_ERROR", "검증 실패", [{ message: "서버: 가닥 수가 올바르지 않습니다.", field_path: "/default_spec/strand_count/value" }])
        : std(req),
    );
    open(createPath, server);
    await screen.findByLabelText("표시 코드", {}, slow);
    await fillBasics(user, "NEW-4");
    await user.click(mode("기본 규격 가닥 수", "값 있음"));
    await user.type(screen.getByLabelText("기본 규격 가닥 수 값"), "12");
    await user.click(submit());
    expect(await screen.findByText("서버: 가닥 수가 올바르지 않습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("기본 규격 가닥 수 값")).toBeInvalid();
  });

  it("연결이 끊기면 처리 여부를 알 수 없다고 안내하고 같은 코드로 재검색하는 링크를 준다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) => {
      if (req.method === "POST") throw new TypeError("Failed to fetch");
      return std(req);
    });
    open(createPath, server);
    await screen.findByLabelText("표시 코드", {}, slow);
    await fillBasics(user, "NEW-5");
    await user.click(submit());
    expect(await screen.findByText("서버에 연결하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이 코드로 목록을 검색" })).toHaveAttribute("href", expect.stringContaining("q=NEW-5"));
  });

  it("조회자는 만들 수 없다", async () => {
    const server = serverAs("viewer");
    open(createPath, server);
    expect(await screen.findByText("재료를 만들 권한이 없습니다", {}, slow)).toBeInTheDocument();
    expect(server.writes()).toHaveLength(0);
  });

  it("입력 후 다른 화면으로 이동하면 미저장 확인을 한다", async () => {
    const user = userEvent.setup();
    open(createPath);
    await screen.findByLabelText("표시 코드", {}, slow);
    await user.type(screen.getByLabelText("표시 코드"), "X");
    await user.click(within(screen.getByRole("navigation", { name: "주 메뉴" })).getByRole("link", { name: "제품" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("저장하지 않은 변경이 있습니다");
  });
});
