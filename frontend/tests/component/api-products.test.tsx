import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, ME, P1, PRODUCTS, type FakeServer } from "../fakeApi";
import { renderApp } from "../renderApp";

const P_ONE = PRODUCTS[0]!; // P-001, 규격 입력, 최신 공정 v2 초안
const P_TWO = PRODUCTS[1]!; // P-002, 규격 미정(null)
const listPath = `/projects/${P1}/products`;
const detailPath = (id: string) => `${listPath}/${id}`;

function open(path: string, server: FakeServer = createFakeServer()) {
  const app = renderApp(path, { source: "api", fetchImpl: server.fetchImpl });
  return { server, ...app };
}

function serverAs(role: "admin" | "editor" | "viewer", handler?: Parameters<typeof createFakeServer>[0]) {
  const server = createFakeServer((req, std) => {
    if (req.path === "/me")
      return { status: 200, body: { data: { ...ME, projects: ME.projects.map((p) => ({ ...p, role })) } } };
    return handler ? handler(req, std) : std(req);
  });
  server.state.role = role;
  return server;
}

const roleText = { admin: "관리자", editor: "편집자", viewer: "조회자" };
const slow = { timeout: 8000 }; // 병렬 실행 중 첫 렌더가 느릴 수 있어 기본(1초)보다 넉넉히 기다린다.

async function ready(role: keyof typeof roleText = "admin", code = "P-001") {
  await screen.findByRole("heading", { level: 1, name: new RegExp(code) }, slow);
  await waitFor(() => expect(screen.getByText(new RegExp(`내 역할: ${roleText[role]}`))).toBeInTheDocument(), slow);
}

const saveButton = () => screen.getByRole("button", { name: /^저장/ });

async function replace(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const el = screen.getByLabelText(label);
  await user.clear(el);
  if (value) await user.type(el, value);
}

describe("제품 목록 (API)", () => {
  it("서버 목록을 보여 주고 공정 요약·규격 미정·보관 표시를 구분한다", async () => {
    const { server } = open(listPath);
    const table = await screen.findByRole("table", { name: "제품 목록" }, slow);
    expect(screen.getByText(/서버에서 불러온 데이터입니다/)).toBeInTheDocument();
    expect(within(table).getByText("서버 제품 1")).toBeInTheDocument();
    expect(within(table).getAllByText("미정").length).toBeGreaterThan(0); // P-002
    expect(within(table).getByText("v2")).toBeInTheDocument(); // P-001 최신 공정
    expect(within(table).getAllByText("공정 없음").length).toBeGreaterThan(0);
    // 보관된 제품(P-009)은 기본 목록에 없다
    expect(within(table).queryByText(/서버 제품 9 /)).not.toBeInTheDocument();
    const first = server.requests.find((r) => r.path === `${listPath}`)!;
    expect(first.query.get("include_archived")).toBeNull();
  });

  it("보관된 제품 포함을 켜면 include_archived=true로 다시 요청하고 보관됨을 표시한다", async () => {
    const user = userEvent.setup();
    const { server } = open(listPath);
    await screen.findByRole("table", { name: "제품 목록" }, slow);
    await user.click(screen.getByLabelText("보관된 제품 포함"));
    expect(await screen.findByText("서버 제품 9 (보관됨)")).toBeInTheDocument();
    expect(server.requests.some((r) => r.query.get("include_archived") === "true")).toBe(true);
  });

  it("검색·정렬은 서버 쿼리(q, sort)로 보내고 결과가 없으면 조건 지우기를 제공한다", async () => {
    const user = userEvent.setup();
    const { server } = open(listPath);
    await screen.findByRole("table", { name: "제품 목록" }, slow);
    await user.type(screen.getByLabelText("검색"), "zzzz");
    expect(await screen.findByText("검색 결과가 없습니다")).toBeInTheDocument();
    expect(server.requests.some((r) => r.query.get("q") === "zzzz")).toBe(true);
    await user.click(screen.getByRole("button", { name: "검색 조건 지우기" }));
    await screen.findByRole("table", { name: "제품 목록" });
    await user.click(screen.getByRole("button", { name: /이름/ }));
    await waitFor(() => expect(server.requests.some((r) => r.query.get("sort") === "name")).toBe(true));
  });

  it("50건을 넘으면 더 보기로 cursor를 이어 받는다", async () => {
    const user = userEvent.setup();
    const { server } = open(listPath);
    const table = await screen.findByRole("table", { name: "제품 목록" }, slow);
    const before = within(table).getAllByRole("row").length;
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() => expect(within(screen.getByRole("table", { name: "제품 목록" })).getAllByRole("row").length).toBeGreaterThan(before));
    expect(server.requests.at(-1)!.query.get("cursor")).toBeTruthy();
  });

  it("서버 오류는 목록 오류 안내와 다시 시도를 보여 준다", async () => {
    const server = createFakeServer((req, std) =>
      req.path === listPath && req.method === "GET" ? errorBody(500, "INTERNAL", "서버 오류") : std(req),
    );
    open(listPath, server);
    expect(await screen.findByRole("button", { name: /다시 시도/ }, slow)).toBeInTheDocument();
  });

  it("조회자는 제품 추가가 비활성이고 관리자·편집자는 링크다", async () => {
    open(listPath, serverAs("viewer"));
    await screen.findByRole("table", { name: "제품 목록" }, slow);
    await waitFor(() => expect(screen.getByRole("button", { name: "제품 추가" })).toBeDisabled());
  });
});

describe("제품 기본 정보 저장 (PATCH)", () => {
  it("바꾼 필드만 보내고 If-Match는 편집을 시작한 row_version이며 성공하면 다음 저장은 새 버전을 쓴다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(P_ONE.id));
    await ready();
    expect(saveButton()).toBeDisabled();
    await replace(user, "이름", "새 이름");
    await user.click(saveButton());
    expect(await screen.findByText("제품 정보를 저장했습니다.")).toBeInTheDocument();
    const [first] = server.writes();
    expect(first).toMatchObject({ method: "PATCH", path: detailPath(P_ONE.id), body: { name: "새 이름" } });
    expect(first!.headers["If-Match"]).toBe('"1"');
    expect(server.state.products[0]!.name).toBe("새 이름");

    await replace(user, "메모", "메모 하나");
    await user.click(saveButton());
    await waitFor(() => expect(server.writes()).toHaveLength(2));
    expect(server.writes()[1]!.headers["If-Match"]).toBe('"2"');
    expect(server.writes()[1]!.body).toEqual({ notes: "메모 하나" });
  });

  it("규격을 미정으로 바꾸면 null, 메모를 비우면 null로 보낸다(빈 문자열은 보내지 않는다)", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(P_ONE.id));
    await ready();
    await user.click(screen.getByLabelText("규격 미정"));
    await user.click(saveButton());
    await screen.findByText("제품 정보를 저장했습니다.");
    expect(server.writes()[0]!.body).toEqual({ specification: null });
    expect(server.state.products[0]!.specification).toBeNull();
    expect(screen.getByLabelText("규격 미정")).toBeChecked();
  });

  it("미정이던 규격을 입력하면 값을 보낸다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(P_TWO.id));
    await ready("admin", "P-002");
    await user.click(screen.getByLabelText("규격 미정"));
    expect(screen.getByLabelText("규격")).toBeInvalid(); // 미정 해제 후 비어 있으면 오류
    expect(saveButton()).toBeDisabled();
    await user.type(screen.getByLabelText("규격"), "새 규격");
    await user.click(saveButton());
    await screen.findByText("제품 정보를 저장했습니다.");
    expect(server.writes()[0]!.body).toEqual({ specification: "새 규격" });
  });

  it("저장 중에는 버튼이 비활성이고 연속 클릭해도 한 번만 보낸다", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const server = createFakeServer(async (req, std) => {
      if (req.method === "PATCH") await gate;
      return std(req);
    });
    open(detailPath(P_ONE.id), server);
    await ready();
    await replace(user, "이름", "Z");
    await user.dblClick(saveButton());
    expect(await screen.findByRole("button", { name: "저장 중…" })).toBeDisabled();
    release();
    await screen.findByText("제품 정보를 저장했습니다.");
    expect(server.writes()).toHaveLength(1);
  });

  it("형식 오류가 있으면 저장 버튼이 비활성이고 요청을 보내지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(P_ONE.id));
    await ready();
    await replace(user, "이름", "");
    expect(screen.getByLabelText("이름")).toBeInvalid();
    expect(saveButton()).toBeDisabled();
    expect(server.writes()).toHaveLength(0);
  });

  it("저장 성공 후 목록으로 돌아가면 바뀐 이름이 보인다(목록 캐시 갱신)", async () => {
    const user = userEvent.setup();
    open(detailPath(P_ONE.id));
    await ready();
    await replace(user, "이름", "목록에서 보일 이름");
    await user.click(saveButton());
    await screen.findByText("제품 정보를 저장했습니다.");
    await user.click(within(screen.getByRole("navigation", { name: "주 메뉴" })).getByRole("link", { name: "제품" }));
    expect(await screen.findByText("목록에서 보일 이름")).toBeInTheDocument();
  });
});

describe("제품 충돌(412)은 조용히 덮어쓰지 않는다", () => {
  const otherUserRenames = (server: FakeServer) => {
    server.state.products[0]!.name = "다른 사용자가 바꾼 이름";
    server.state.products[0]!.row_version = 3;
  };

  it("내 변경 유지: 안 바꾼 필드는 서버 값으로 맞추고 바꾼 필드만 새 버전으로 저장한다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(P_ONE.id));
    await ready();
    await replace(user, "메모", "내 메모");
    otherUserRenames(server);
    await user.click(saveButton());
    expect(await screen.findByText("다른 사용자가 먼저 수정했습니다")).toBeInTheDocument();
    expect(screen.getByLabelText("메모")).toHaveValue("내 메모");
    expect(server.state.products[0]!.notes).toBeNull();

    await user.click(screen.getByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    await waitFor(() => expect(screen.getByLabelText("이름")).toHaveValue("다른 사용자가 바꾼 이름"));
    expect(screen.getByLabelText("메모")).toHaveValue("내 메모");
    expect(server.writes()).toHaveLength(1); // 병합만 했고 저장은 사용자가 다시 눌러야 한다

    await user.click(saveButton());
    await screen.findByText("제품 정보를 저장했습니다.");
    const last = server.writes().at(-1)!;
    expect(last.body).toEqual({ notes: "내 메모" });
    expect(last.headers["If-Match"]).toBe('"3"');
    expect(server.state.products[0]!.name).toBe("다른 사용자가 바꾼 이름");
  });

  it("같은 필드를 둘 다 바꿨으면 내 값을 유지하되 서버 값을 알린다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(P_ONE.id));
    await ready();
    await replace(user, "이름", "내 이름");
    otherUserRenames(server);
    await user.click(saveButton());
    await user.click(await screen.findByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    expect(await screen.findByText(/다른 사용자가 바꾼 값이 있습니다/)).toHaveTextContent("서버 값: 다른 사용자가 바꾼 이름");
    expect(screen.getByLabelText("이름")).toHaveValue("내 이름");
  });

  it("규격을 서버가 미정으로 바꿨다면 서버 값을 '미정'으로 알린다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(P_ONE.id));
    await ready();
    await replace(user, "규격", "내 규격");
    server.state.products[0]!.specification = null;
    server.state.products[0]!.row_version = 3;
    await user.click(saveButton());
    await user.click(await screen.findByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    expect(await screen.findByText(/다른 사용자가 바꾼 값이 있습니다/)).toHaveTextContent("규격(서버 값: 미정)");
  });

  it("다시 불러오기: 내 입력을 버리고 서버 값을 보여 준다", async () => {
    const user = userEvent.setup();
    const { server } = open(detailPath(P_ONE.id));
    await ready();
    await replace(user, "메모", "내 메모");
    otherUserRenames(server);
    await user.click(saveButton());
    await user.click(await screen.findByRole("button", { name: "최신 내용으로 다시 불러오기" }));
    await waitFor(() => expect(screen.getByLabelText("이름")).toHaveValue("다른 사용자가 바꾼 이름"));
    expect(screen.getByLabelText("메모")).toHaveValue("");
  });

  it("조회 캐시가 백그라운드에서 최신으로 바뀌어도 If-Match는 편집을 시작한 버전이라 서버가 충돌로 거부한다", async () => {
    const user = userEvent.setup();
    const { server, queryClient } = open(detailPath(P_ONE.id));
    await ready();
    await replace(user, "메모", "내 메모");
    otherUserRenames(server);
    await queryClient.refetchQueries({ queryKey: ["project", P1] });
    await user.click(saveButton());
    expect(await screen.findByText("다른 사용자가 먼저 수정했습니다")).toBeInTheDocument();
    expect(server.writes()[0]!.headers["If-Match"]).toBe('"1"');
  });
});

describe("제품 저장 실패 처리", () => {
  it("코드 중복(409)은 코드 필드에 표시하고 입력은 유지한다", async () => {
    const user = userEvent.setup();
    open(detailPath(P_ONE.id));
    await ready();
    await replace(user, "표시 코드", "P-002");
    await user.click(saveButton());
    expect(await screen.findByText("이미 사용 중인 코드입니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("표시 코드")).toBeInvalid();
    expect(screen.getByLabelText("표시 코드")).toHaveValue("P-002");
  });

  it("422는 field_path로 필드에 연결하고 연결할 수 없는 오류는 검증 패널에 보여 준다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "PATCH"
        ? errorBody(422, "VALIDATION_ERROR", "검증 실패", [
            { message: "서버: 규격이 올바르지 않습니다.", field_path: "/specification" },
            { message: "서버: 본문 전체 규칙 위반", field_path: "/" },
          ])
        : std(req),
    );
    open(detailPath(P_ONE.id), server);
    await ready();
    await replace(user, "규격", "나쁜 규격");
    await user.click(saveButton());
    expect(await screen.findByText("서버: 규격이 올바르지 않습니다.")).toBeInTheDocument();
    expect(screen.getByLabelText("규격")).toBeInvalid();
    expect(screen.getByText("서버: 본문 전체 규칙 위반")).toBeInTheDocument();
  });

  it("403은 권한 없음 안내를 보이고 입력은 유지한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    server.state.role = "viewer"; // 화면은 관리자, 서버는 조회자로 바뀐 상황
    open(detailPath(P_ONE.id), server);
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
    open(detailPath(P_ONE.id), server);
    await ready();
    await replace(user, "메모", "내 메모");
    await user.click(saveButton());
    expect(await screen.findByText("서버에 연결하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByLabelText("메모")).toHaveValue("내 메모");
    expect(saveButton()).toBeEnabled();
  });

  it("없는 제품(404)은 찾을 수 없음 안내를 보여 준다", async () => {
    open(detailPath("00000000-0000-4000-8000-00000000dead"));
    expect((await screen.findAllByText("제품을 찾을 수 없습니다", {}, slow)).length).toBeGreaterThan(0);
  });
});

describe("제품 역할·공정 요약", () => {
  it("조회자는 입력이 읽기 전용이고 저장 요청을 보낼 수 없다", async () => {
    const server = serverAs("viewer");
    open(detailPath(P_ONE.id), server);
    await ready("viewer");
    expect(screen.getByLabelText("이름")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("규격 미정")).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    expect(server.writes()).toHaveLength(0);
  });

  it("공정 버전은 서버 요약만 보이고 정적 공정 화면 링크를 열지 않는다", async () => {
    open(detailPath(P_ONE.id));
    await ready();
    expect(screen.getByText(/최신 버전: v2/)).toBeInTheDocument();
    expect(screen.getByText(/현재 승인본: 없음/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /공정 편집|공정 보기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: /공정 버전/ })).not.toBeInTheDocument();
  });

  it("공정이 없는 제품은 빈 상태를 보여 준다", async () => {
    open(detailPath(P_TWO.id));
    await ready("admin", "P-002");
    expect(screen.getByText("공정 버전이 없습니다")).toBeInTheDocument();
  });
});

describe("제품 생성 (POST)", () => {
  const createPath = `${listPath}/new`;
  const submit = () => screen.getByRole("button", { name: /제품 만들기|만드는 중/ });

  it("규격 미정·빈 메모는 본문에서 생략하고 성공하면 상세로 이동한다", async () => {
    const user = userEvent.setup();
    const { server, router } = open(createPath);
    await screen.findByRole("heading", { level: 1, name: "제품 추가" }, slow);
    await waitFor(() => expect(screen.getByLabelText("표시 코드")).toBeInTheDocument());
    expect(screen.getByLabelText("규격 미정")).toBeChecked(); // 미정으로 시작
    await user.type(screen.getByLabelText("표시 코드"), "NEW-1");
    await user.type(screen.getByLabelText("이름"), "새 제품");
    await user.click(submit());
    await waitFor(() => expect(router.state.location.pathname).toMatch(new RegExp(`${listPath}/[0-9a-f-]+$`)));
    expect(server.writes()[0]).toMatchObject({ method: "POST", path: listPath, body: { code: "NEW-1", name: "새 제품" } });
    expect(Object.keys(server.writes()[0]!.body)).toEqual(["code", "name"]);
    expect(await screen.findByRole("heading", { level: 1, name: /NEW-1 새 제품/ }, slow)).toBeInTheDocument();
  });

  it("규격을 입력하고 메모를 쓰면 함께 보낸다", async () => {
    const user = userEvent.setup();
    const { server } = open(createPath);
    await screen.findByLabelText("표시 코드", {}, slow);
    await user.type(screen.getByLabelText("표시 코드"), "NEW-2");
    await user.type(screen.getByLabelText("이름"), "둘째");
    await user.click(screen.getByLabelText("규격 미정"));
    await user.type(screen.getByLabelText("규격"), "규격 X");
    await user.type(screen.getByLabelText("메모"), "메모 Y");
    await user.click(submit());
    await waitFor(() => expect(server.writes()).toHaveLength(1));
    expect(server.writes()[0]!.body).toEqual({ code: "NEW-2", name: "둘째", specification: "규격 X", notes: "메모 Y" });
  });

  it("코드 중복(409)은 코드 필드에 표시하고 입력과 화면을 유지한다", async () => {
    const user = userEvent.setup();
    const { router } = open(createPath);
    await screen.findByLabelText("표시 코드", {}, slow);
    await user.type(screen.getByLabelText("표시 코드"), "P-001");
    await user.type(screen.getByLabelText("이름"), "중복");
    await user.click(submit());
    expect(await screen.findByText("이미 사용 중인 코드입니다.")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(createPath);
    expect(screen.getByLabelText("이름")).toHaveValue("중복");
  });

  it("미정을 해제하고 규격을 비우면 만들 수 없다", async () => {
    const user = userEvent.setup();
    const { server } = open(createPath);
    await screen.findByLabelText("표시 코드", {}, slow);
    await user.type(screen.getByLabelText("표시 코드"), "NEW-3");
    await user.type(screen.getByLabelText("이름"), "셋째");
    await user.click(screen.getByLabelText("규격 미정"));
    expect(screen.getByLabelText("규격")).toBeInvalid();
    expect(submit()).toBeDisabled();
    expect(server.writes()).toHaveLength(0);
  });

  it("연결이 끊기면 처리 여부를 알 수 없다고 안내하고 같은 코드로 재검색하는 링크를 준다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) => {
      if (req.method === "POST") throw new TypeError("Failed to fetch");
      return std(req);
    });
    open(createPath, server);
    await screen.findByLabelText("표시 코드", {}, slow);
    await user.type(screen.getByLabelText("표시 코드"), "NEW-4");
    await user.type(screen.getByLabelText("이름"), "넷째");
    await user.click(submit());
    expect(await screen.findByText("서버에 연결하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "이 코드로 목록을 검색" })).toHaveAttribute("href", expect.stringContaining("q=NEW-4"));
  });

  it("조회자는 만들 수 없다(권한 없음 안내, 요청 없음)", async () => {
    const server = serverAs("viewer");
    open(createPath, server);
    expect(await screen.findByText("제품을 만들 권한이 없습니다", {}, slow)).toBeInTheDocument();
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

  it("정적 예시 모드에서는 만들 수 없다(요청 없음)", async () => {
    const server = createFakeServer();
    renderApp("/projects/aaaaaaaa-0000-4000-8000-000000000001/products/new", { source: "static", fetchImpl: server.fetchImpl });
    const button = await screen.findByRole("button", { name: "제품 만들기" }, slow);
    expect(button).toBeDisabled();
    expect(server.writes()).toHaveLength(0);
  });
});
