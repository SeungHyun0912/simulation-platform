import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSETS, createFakeServer, errorBody, ME, P1, P2 } from "../fakeApi";
import { renderApp } from "../renderApp";

const api = (path: string, server = createFakeServer()) => ({ server, ...renderApp(path, { source: "api", fetchImpl: server.fetchImpl }) });

describe("API 모드: 앱 셸과 프로젝트", () => {
  it("배너가 API 모드를 알리고 전환 메뉴는 /me의 프로젝트(코드)로 구성된다", async () => {
    const user = userEvent.setup();
    const { server } = api(`/projects/${P1}/assets`);
    expect(screen.getByRole("note")).toHaveAttribute("data-source", "api");
    expect(screen.getByRole("note")).toHaveTextContent("API 연동 모드입니다(계약 0.3.0)");
    expect(screen.getByRole("note")).toHaveTextContent("용량·규칙 저장");
    await waitFor(() => expect(screen.getByRole("group", { name: "현재 프로젝트" })).toHaveTextContent("SRV-P1"));
    await user.click(screen.getByRole("button", { name: /프로젝트 전환/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitemradio")).toHaveLength(2);
    expect(within(menu).getByText("서버 프로젝트 2")).toBeInTheDocument();
    expect(within(menu).queryByText(/예시 프로젝트/)).not.toBeInTheDocument();
    expect(server.requests.some((r) => r.path === "/me")).toBe(true);
  });

  it("보관된 프로젝트(/me status=archived)는 전환 메뉴에 포함하되 보관됨을 표시한다(계약 0.3.0)", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.path === "/me"
        ? {
            status: 200,
            body: {
              data: {
                ...ME,
                projects: [
                  ...ME.projects,
                  { id: "66666666-6666-4666-8666-666666666666", organization_id: ME.organizations[0]!.id, code: "OLD", name: "옛 프로젝트", role: "viewer", status: "archived" },
                ],
              },
            },
          }
        : std(req),
    );
    api(`/projects/${P1}/assets`, server);
    await waitFor(() => expect(screen.getByRole("group", { name: "현재 프로젝트" })).toHaveTextContent("SRV-P1"));
    await user.click(screen.getByRole("button", { name: /프로젝트 전환/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("옛 프로젝트 (보관됨)")).toBeInTheDocument();
    expect(within(menu).queryByText("서버 프로젝트 1 (보관됨)")).not.toBeInTheDocument();
  });

  it("프로젝트 전환 시 새 프로젝트로만 요청하고 이전 프로젝트 캐시는 버린다", async () => {
    const user = userEvent.setup();
    const { server, queryClient, router } = api(`/projects/${P1}/assets`);
    await screen.findByRole("table", { name: "설비·공간 목록" });
    expect(queryClient.getQueryCache().findAll({ queryKey: ["project", P1] }).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /프로젝트 전환/ }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /서버 프로젝트 2/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${P2}/assets`));
    await waitFor(() => expect(queryClient.getQueryCache().findAll({ queryKey: ["project", P1] })).toHaveLength(0));
    expect(server.last("/projects/")!.path.startsWith(`/projects/${P2}`)).toBe(true);
  });

  it("전환하는 동안 이전 프로젝트의 목록을 새 프로젝트 화면에 남기지 않는다", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const server = createFakeServer(async (req, std) => {
      if (req.path === `/projects/${P2}/assets`) {
        await gate;
        return { status: 200, body: { data: [], page: { limit: 50, next_cursor: null } } };
      }
      return std(req);
    });
    api(`/projects/${P1}/assets`, server);
    await screen.findByRole("table", { name: "설비·공간 목록" });
    await user.click(screen.getByRole("button", { name: /프로젝트 전환/ }));
    await user.click(within(await screen.findByRole("menu")).getByRole("menuitemradio", { name: /서버 프로젝트 2/ }));
    expect(await screen.findByText("불러오는 중입니다")).toBeInTheDocument();
    expect(screen.queryByText("서버 설비 1")).not.toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "설비·공간 목록" })).not.toBeInTheDocument();
    release();
    expect(await screen.findByText("등록된 설비·공간이 없습니다")).toBeInTheDocument();
  });

  it("같은 프로젝트에서 정렬을 바꾸는 동안에는 이전 목록을 유지하고 갱신 중임을 알린다", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    let hold = false;
    const gate = new Promise<void>((r) => (release = r));
    const server = createFakeServer(async (req, std) => {
      if (hold && req.path === `/projects/${P1}/assets`) await gate;
      return std(req);
    });
    api(`/projects/${P1}/assets`, server);
    await screen.findByRole("table", { name: "설비·공간 목록" });
    hold = true;
    await user.click(within(screen.getByRole("columnheader", { name: /이름/ })).getByRole("button"));
    expect(await screen.findByText("목록을 새로 불러오는 중…")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "설비·공간 목록" })).toBeInTheDocument();
    release();
    await waitFor(() => expect(screen.queryByText("목록을 새로 불러오는 중…")).not.toBeInTheDocument());
  });

  it("프로젝트 목록은 GET /projects 결과에 /me의 역할을 합쳐 보여 준다", async () => {
    api("/");
    const table = await screen.findByRole("table", { name: "프로젝트 목록" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(within(rows[1]!).getByText("SRV-P1")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("관리자")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("조회자")).toBeInTheDocument();
    expect(screen.queryByText(/예시 데이터입니다/)).not.toBeInTheDocument();
  });

  it("프로젝트 만들기의 조직은 /me에서 오며 관리자인 조직만 고를 수 있다", async () => {
    api("/projects/new");
    const select = await screen.findByLabelText("조직");
    const labels = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(labels).toContain("SRV-ORG 서버 조직");
    expect(labels.join()).not.toContain("SRV-MEM");
  });

  it("/me가 실패하면 오류 안내를 보여 주고 정적 예시로 바꾸지 않는다", async () => {
    const server = createFakeServer((req, std) => (req.path === "/me" ? errorBody(500, "INTERNAL_ERROR", "서버 오류") : std(req)));
    api("/projects/new", server);
    expect(await screen.findByText("내 정보을(를) 불러오지 못했습니다.", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("예시 조직 A")).not.toBeInTheDocument();
  });
});

describe("API 모드: 자산 목록", () => {
  it("첫 요청은 limit만 보내고 서버 데이터를 보여 주며 정적 예시는 없다", async () => {
    const { server } = api(`/projects/${P1}/assets`);
    const table = await screen.findByRole("table", { name: "설비·공간 목록" });
    expect(within(table).getAllByRole("row")).toHaveLength(51); // 헤더 + 50
    expect(within(table).getByText("서버 설비 1")).toBeInTheDocument();
    expect(screen.queryByText("예시 절연 압출기")).not.toBeInTheDocument();
    const req = server.last(`/projects/${P1}/assets`)!;
    expect(Object.fromEntries(req.query)).toEqual({ limit: "50" });
    expect(screen.queryByText(/예시 데이터입니다/)).not.toBeInTheDocument();
  });

  it("최신 버전·승인본은 서버 요약으로 표시한다(버전 없음 포함)", async () => {
    api(`/projects/${P1}/assets`);
    const table = await screen.findByRole("table", { name: "설비·공간 목록" });
    const row1 = within(table).getByRole("link", { name: /EQ-001/ }).closest("tr")!;
    expect(row1).toHaveTextContent("v2");
    expect(row1).toHaveTextContent("초안");
    expect(row1).toHaveTextContent("v1");
    expect(within(table).getAllByText("버전 없음").length).toBeGreaterThan(0);
  });

  it("더 보기는 next_cursor로 다음 페이지를 불러온다", async () => {
    const user = userEvent.setup();
    const { server } = api(`/projects/${P1}/assets`);
    await screen.findByRole("table", { name: "설비·공간 목록" });
    await user.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() =>
      expect(within(screen.getByRole("table", { name: "설비·공간 목록" })).getAllByRole("row")).toHaveLength(61),
    );
    const second = server.requests.filter((r) => r.path === `/projects/${P1}/assets`)[1]!;
    expect(second.query.get("cursor")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument();
  });

  it("정렬하면 서버 정렬 키로 새로 요청하고 이전 cursor를 쓰지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = api(`/projects/${P1}/assets`);
    await screen.findByRole("table", { name: "설비·공간 목록" });
    await user.click(screen.getByRole("button", { name: "더 보기" })); // cursor가 생긴 상태
    await waitFor(() => expect(screen.queryByRole("button", { name: "더 보기" })).not.toBeInTheDocument());
    const header = screen.getByRole("columnheader", { name: /이름/ });
    await user.click(within(header).getByRole("button"));
    await user.click(within(header).getByRole("button")); // 내림차순
    await waitFor(() => expect(server.last(`/projects/${P1}/assets`)!.query.get("sort")).toBe("-name"));
    expect(server.last(`/projects/${P1}/assets`)!.query.get("cursor")).toBeNull();
    // 새 정렬 조건의 결과가 오류 없이 표시된다(이전 cursor를 썼다면 서버는 422 INVALID_CURSOR를 낸다).
    expect(await screen.findByRole("table", { name: "설비·공간 목록" })).toBeInTheDocument();
    expect(screen.queryByText(/불러오지 못했습니다|요청 형식/)).not.toBeInTheDocument();
  });

  it("검색·유형 필터는 서버 쿼리(q, kind)로 보낸다", async () => {
    const user = userEvent.setup();
    const { server } = api(`/projects/${P1}/assets`);
    await screen.findByRole("table", { name: "설비·공간 목록" });
    await user.type(screen.getByLabelText("검색"), "ST-0");
    await user.selectOptions(screen.getByLabelText("유형"), "dock");
    await waitFor(() => {
      const q = server.last(`/projects/${P1}/assets`)!.query;
      expect(q.get("q")).toBe("ST-0");
      expect(q.get("kind")).toBe("dock");
    });
  });

  it("검색 결과가 없으면 안내하고, 조건 없이 비어 있으면 빈 상태를 보여 준다", async () => {
    const user = userEvent.setup();
    api(`/projects/${P1}/assets`);
    await screen.findByRole("table", { name: "설비·공간 목록" });
    await user.type(screen.getByLabelText("검색"), "없는코드");
    expect(await screen.findByText("검색 결과가 없습니다")).toBeInTheDocument();
  });

  it("조건 없이 빈 목록이면 빈 상태", async () => {
    const server = createFakeServer((req, std) =>
      req.path.endsWith("/assets") ? { status: 200, body: { data: [], page: { limit: 50, next_cursor: null } } } : std(req),
    );
    api(`/projects/${P1}/assets`, server);
    expect(await screen.findByText("등록된 설비·공간이 없습니다")).toBeInTheDocument();
  });

  it("권한 없음(403)·인증 필요(401)·없음(404)을 각각 다르게 안내한다", async () => {
    for (const [status, code, text] of [
      [403, "FORBIDDEN", "접근 권한이 없습니다"],
      [401, "UNAUTHENTICATED", "인증이 필요합니다"],
      [404, "NOT_FOUND", "찾을 수 없습니다"],
    ] as const) {
      const server = createFakeServer((req, std) => (req.path.endsWith("/assets") ? errorBody(status, code, "x") : std(req)));
      const { unmount } = api(`/projects/${P1}/assets`, server);
      expect(await screen.findByText(text, { exact: false })).toBeInTheDocument();
      unmount();
    }
  });

  it("서버에 연결하지 못하면 안내하고 다시 시도하면 불러온다(정적 예시로 대체하지 않음)", async () => {
    const user = userEvent.setup();
    let down = true;
    const server = createFakeServer((req, std) => {
      if (req.path.endsWith("/assets") && down) throw new TypeError("Failed to fetch");
      return std(req);
    });
    api(`/projects/${P1}/assets`, server);
    expect(await screen.findByText("서버에 연결하지 못했습니다")).toBeInTheDocument();
    expect(screen.queryByText("예시 절연 압출기")).not.toBeInTheDocument();
    down = false;
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("table", { name: "설비·공간 목록" })).toBeInTheDocument();
  });

  it("API 모드에서는 ?state= 미리보기를 무시하고 실제 결과를 보여 준다", async () => {
    api(`/projects/${P1}/assets?state=forbidden`);
    expect(await screen.findByRole("table", { name: "설비·공간 목록" })).toBeInTheDocument();
    expect(screen.queryByText(/상태 미리보기/)).not.toBeInTheDocument();
  });
});

describe("API 모드: 자산 상세", () => {
  const A1 = ASSETS[0]!.id;

  it("자산과 버전 목록을 각각 요청하고 서버 값·서버 검증 결과를 보여 준다", async () => {
    const { server } = api(`/projects/${P1}/assets/${A1}`);
    expect(await screen.findByRole("heading", { level: 1, name: /EQ-001 서버 설비 1/ })).toBeInTheDocument();
    expect(server.requests.map((r) => r.path)).toEqual(
      expect.arrayContaining([`/projects/${P1}/assets/${A1}`, `/projects/${P1}/assets/${A1}/revisions`]),
    );
    expect(screen.getByLabelText("모델")).toHaveValue("EX-100");
    // 서버 데이터 화면에 정적 예시 안내·상태 미리보기가 남아 있으면 안 된다.
    expect(screen.queryByText(/예시 데이터입니다/)).not.toBeInTheDocument();
    expect(screen.getByText(/서버에서 불러온 데이터입니다/)).toBeInTheDocument();
    expect(screen.queryByText(/상태 미리보기/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("버전", { selector: "select" })).toHaveValue(ASSETS[0]!.latest_revision!.id);
    expect(screen.getByLabelText("IN 대기 용량 값")).toHaveValue("4");
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("서버가 알려 준 경고");
    const history = screen.getByRole("table", { name: "EQ-001 버전 이력" });
    expect(within(history).getAllByRole("row")).toHaveLength(3);
  });

  it("승인 시각은 프로젝트의 시간대(GET /projects/{id})로 표시하고 어느 시간대인지 알린다", async () => {
    const { server } = api(`/projects/${P1}/assets/${A1}`);
    const history = await screen.findByRole("table", { name: "EQ-001 버전 이력" });
    // 서버 시각은 UTC 2026-10-23 00:00. 프로젝트 시간대(America/New_York, UTC-4)로는 10월 22일 20:00이다.
    await waitFor(() => expect(within(history).getByText(/2026\. 10\. 22\. 20:00/)).toBeInTheDocument());
    expect(within(history).getByRole("columnheader", { name: /America\/New_York/ })).toBeInTheDocument();
    expect(server.requests.some((r) => r.path === `/projects/${P1}` && r.method === "GET")).toBe(true);
  });

  it("역할은 /me에서 온다: 관리자 프로젝트에서는 편집 가능", async () => {
    api(`/projects/${P1}/assets/${A1}`);
    await screen.findByRole("heading", { level: 1, name: /EQ-001/ });
    await waitFor(() => expect(screen.getByText(/내 역할: 관리자/)).toBeInTheDocument());
    expect(screen.getByLabelText("이름")).not.toHaveAttribute("readonly");
  });

  it("버전이 없는 자산은 빈 상태를 보여 준다", async () => {
    api(`/projects/${P1}/assets/${ASSETS[2]!.id}`);
    expect(await screen.findByText("버전이 없습니다")).toBeInTheDocument();
  });

  it("없는 자산·형식이 틀린 id는 찾을 수 없음으로 표시한다", async () => {
    api(`/projects/${P1}/assets/99999999-0000-4000-8000-000000000000`);
    expect((await screen.findAllByText("자산을 찾을 수 없습니다")).length).toBeGreaterThan(0);
  });

  it("다른 프로젝트 경유 접근은 404와 같은 화면이다", async () => {
    api(`/projects/${P2}/assets/${A1}`);
    expect((await screen.findAllByText("자산을 찾을 수 없습니다")).length).toBeGreaterThan(0);
  });

  it("서버 오류는 요청 ID와 함께 안내하고 다시 시도할 수 있다", async () => {
    const server = createFakeServer((req, std) =>
      req.path.endsWith(`/assets/${A1}`) ? errorBody(500, "INTERNAL_ERROR", "내부 오류") : std(req),
    );
    api(`/projects/${P1}/assets/${A1}`, server);
    expect(await screen.findByText(/자산을\(를\) 불러오지 못했습니다/)).toBeInTheDocument();
    expect(screen.getByText("req-test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("조회만 하는 동안에는 쓰기 요청(PATCH·POST)을 보내지 않는다", async () => {
    const { server } = api(`/projects/${P1}/assets/${A1}`);
    await screen.findByRole("heading", { level: 1, name: /EQ-001/ });
    expect(server.writes()).toHaveLength(0);
  });
});
