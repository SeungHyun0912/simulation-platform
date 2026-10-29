import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, ME, P1, type FakeServer } from "../fakeApi";
import { layoutVersionId } from "../fakeLayouts";
import { renderApp } from "../renderApp";

/** 배치판(계약 0.17.0): 목록·새 초안, 도면 편집(점·배치·포트 매핑·경로), 붙여 넣기, 저장·검증·승인. 시드: v1 승인본 + v2 초안(같은 내용). */
const slow = { timeout: 8000 };
const list = `/projects/${P1}/layouts`;
const editor = (n: number) => `/projects/${P1}/layouts/${layoutVersionId(n)}`;

function open(path: string, server: FakeServer = createFakeServer()) {
  return { server, ...renderApp(path, { source: "api", fetchImpl: server.fetchImpl }) };
}
const puts = (s: FakeServer) => s.writes().filter((w) => w.method === "PUT" && w.path.endsWith("/content"));
const canvas = () => screen.getByRole("group", { name: /배치판 도면/ });
const ready = () => screen.findByRole("button", { name: /^점 P1 \(/ }, slow);

describe("배치판 목록", () => {
  it("버전을 상태와 함께 보이고, 초안이 이미 있으면 새 초안 대신 그 초안으로 안내한다(409 LAYOUT_DRAFT_EXISTS)", async () => {
    const user = userEvent.setup();
    open(list);
    const table = await screen.findByRole("table", { name: "배치판 버전" }, slow);
    expect(within(table).getByRole("link", { name: "배치판 v2 열기" })).toBeInTheDocument();
    expect(table).toHaveTextContent("초안");
    expect(table).toHaveTextContent("승인");
    await user.click(screen.getByRole("button", { name: "새 초안 만들기" }));
    expect(await screen.findByText("이미 열린 초안이 있습니다", {}, slow)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "v2 초안 열기" })).toHaveAttribute("href", editor(2));
  });

  it("초안이 없으면 최근 승인본을 복사한 새 초안을 만들고 그 화면으로 간다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    server.state.layouts.versions = server.state.layouts.versions.filter((v) => v.status !== "draft");
    const { router } = open(list, server);
    await user.click(await screen.findByRole("button", { name: "새 초안 만들기" }, slow));
    await waitFor(() => expect(router.state.location.pathname).toBe(editor(2)), slow); // 초안을 지웠으므로 다음 번호는 v2
    expect(await screen.findByRole("heading", { level: 1, name: /배치판 v2/ }, slow)).toBeInTheDocument();
    expect(await ready()).toBeInTheDocument(); // 복사된 점
  });

  it("정적 예제 모드에서는 API 전용 안내만 보인다", async () => {
    renderApp(list, { source: "static" });
    expect(await screen.findByRole("heading", { level: 1, name: "배치판" }, slow)).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "배치판 버전" })).not.toBeInTheDocument();
  });
});

describe("배치판 편집: 도면·표", () => {
  it("점·배치·포트 매핑·경로를 도면에 그리고, 모르는 크기·회전은 '모름'으로, 경로 길이는 서버 값으로 보인다", async () => {
    open(editor(2));
    await ready();
    expect(screen.getByRole("button", { name: "점 P1 (10.0, 5.0) 포트 EQ-001 OUT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^배치 EQ-001 서버 설비 1$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "배치 ST-041 서버 공간 41 (크기 모름) (회전 모름)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "경로 R1 (forklift): P1 → P2 → P3" })).toBeInTheDocument();
    const places = screen.getByRole("table", { name: "배치 목록" });
    expect(within(places).getAllByText("모름").length).toBe(3); // ST-041의 가로·세로·회전(0이 아니다)
    const routes = screen.getByRole("table", { name: "경로 목록" });
    expect(routes).toHaveTextContent("17.0"); // (10,5)→(13,9) 5 m + (13,9)→(25,9) 12 m
    expect(routes).toHaveTextContent("지게차(forklift)");
    expect(routes).toHaveTextContent("EQ-001 OUT(산출)");
  });

  it("점 추가 모드에서 도면 빈 곳을 누르면 그 자리(m)에 점이 생기고, 저장하면 통째로 PUT하고 응답 값으로 다시 그린다", async () => {
    const user = userEvent.setup();
    const { server } = open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "점 추가" }));
    // 화면 맞춤: zoom = min(860/(40·20), 500/(20·20)) = 1.075 → 1 m = 21.5 px, 원점 (24, 28)
    fireEvent.click(canvas(), { clientX: 24 + 21.5 * 20, clientY: 28 + 21.5 * 10 });
    expect(await screen.findByRole("button", { name: /^점 P4 \(20\.0, 10\.0\)/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "점 P4 속성" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "내용 저장" }));
    await screen.findByText(/배치판 내용을 저장했습니다/, {}, slow);
    const body = puts(server)[0]!.body;
    expect(puts(server)[0]!.headers["If-Match"]).toBe('"1"');
    expect(body.points.map((p: { point_key: string }) => p.point_key)).toEqual(["P1", "P2", "P3", "P4"]);
    expect(body.placements[1]).toMatchObject({ width_m: null, height_m: null, rotation_deg: null }); // 모름은 null
  });

  it("입력한 크기는 서버가 소수 첫째 자리로 반올림한 값으로 다시 보인다(9.05 → 9.1)", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "배치 ST-041 선택" }));
    const panel = screen.getByRole("region", { name: /배치 ST-041 .* 속성/ });
    await user.type(within(panel).getByLabelText("가로(m)"), "9.05");
    await user.type(within(panel).getByLabelText("세로(m)"), "2");
    await user.click(screen.getByRole("button", { name: "내용 저장" }));
    await screen.findByText(/배치판 내용을 저장했습니다/, {}, slow);
    expect(screen.getByRole("table", { name: "배치 목록" })).toHaveTextContent("9.1 m");
  });

  it("숫자가 아닌 크기는 저장 전에 막고 항목 옆에 알린다(요청 없음)", async () => {
    const user = userEvent.setup();
    const { server } = open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "배치 EQ-001 선택" }));
    const field = within(screen.getByRole("region", { name: /배치 EQ-001 .* 속성/ })).getByLabelText("가로(m)");
    await user.clear(field);
    await user.type(field, "넓음");
    await user.click(screen.getByRole("button", { name: "내용 저장" }));
    expect(await screen.findByText("입력을 확인하세요")).toBeInTheDocument();
    expect(screen.getByText(/가로는 0보다 큰 숫자/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^배치 EQ-001 .*\(오류 있음\)/ })).toBeInTheDocument();
    expect(puts(server)).toHaveLength(0);
  });

  it("저장 422(LAY-SAVE-*)는 보낸 본문 순번으로 대상을 찾아 도면에 표시한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "PUT" && req.path.endsWith("/content")
        ? errorBody(422, "VALIDATION_ERROR", "배치판 내용이 올바르지 않습니다.", [{ rule_id: "LAY-SAVE-009", field_path: "/routes/0/points/1", message: "연달아 같은 점입니다." }])
        : std(req),
    );
    open(editor(2), server);
    await ready();
    await user.click(screen.getByRole("button", { name: "점 P2 선택" }));
    await user.type(within(screen.getByRole("region", { name: "점 P2 속성" })).getByLabelText("x(m)"), "5");
    await user.click(screen.getByRole("button", { name: "내용 저장" }));
    expect(await screen.findByText(/연달아 같은 점입니다/, {}, slow)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^경로 R1 .*\(오류 있음\)$/ })).toBeInTheDocument();
  });

  it("다른 사용자가 먼저 저장했으면(412) 덮어쓰지 않고 충돌을 알린다", async () => {
    const user = userEvent.setup();
    const { server } = open(editor(2));
    await ready();
    server.state.layouts.versions.find((v) => v.id === layoutVersionId(2))!.row_version = 9;
    await user.click(screen.getByRole("button", { name: "점 추가" }));
    fireEvent.click(canvas(), { clientX: 100, clientY: 100 });
    await user.click(screen.getByRole("button", { name: "내용 저장" }));
    expect(await screen.findByText(/배치판: 다른 사용자가 먼저 수정했습니다/, {}, slow)).toBeInTheDocument();
  });

  it("경로 그리기: 출발 포트를 고르면 그 점에서 시작하고, 점을 순서대로 누른 뒤 도착 포트를 골라 경로를 만든다", async () => {
    const user = userEvent.setup();
    const { server } = open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "경로 그리기" }));
    const panel = screen.getByRole("region", { name: "경로 그리기" });
    await user.selectOptions(within(panel).getByLabelText("출발 포트"), within(within(panel).getByLabelText("출발 포트")).getByRole("option", { name: "EQ-001 OUT(산출)" }));
    expect(within(panel).getByLabelText("고른 점 순서")).toHaveTextContent("P1");
    await user.click(screen.getByRole("button", { name: /^점 P3 \(/ }));
    await user.selectOptions(within(panel).getByLabelText("도착 포트"), within(within(panel).getByLabelText("도착 포트")).getByRole("option", { name: "ST-041 ACCESS-01(접근)" }));
    await user.selectOptions(within(panel).getByLabelText("운반 방식"), "amr");
    expect(within(panel).getByLabelText("고른 점 순서")).toHaveTextContent("P1 → P3");
    await user.click(within(panel).getByRole("button", { name: "경로 만들기" }));
    const routes = screen.getByRole("table", { name: "경로 목록" });
    expect(routes).toHaveTextContent("R2");
    expect(routes).toHaveTextContent("저장 후 계산");
    await user.click(screen.getByRole("button", { name: "내용 저장" }));
    await screen.findByText(/배치판 내용을 저장했습니다/, {}, slow);
    expect(puts(server)[0]!.body.routes[1]).toMatchObject({ route_key: "R2", mode: "amr", points: ["P1", "P3"] });
    expect(screen.getByRole("table", { name: "경로 목록" })).toHaveTextContent("15.5"); // (10,5)→(25,9) ≈ 15.52
  });

  it("엑셀에서 복사한 점·배치를 붙여 넣으면 표와 도면에 반영되고 틀린 줄은 알린다", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByText("엑셀에서 붙여 넣기"));
    fireEvent.change(screen.getByLabelText("점 붙여 넣기(이름, x, y)"), { target: { value: "이름\tx\ty\nP7\t1.5\t2\nP1\t11\t5" } });
    await user.click(screen.getByRole("button", { name: "점 반영" }));
    expect(screen.getByRole("status", { name: "붙여 넣기 결과" })).toHaveTextContent("점 1개 추가, 1개 변경");
    expect(screen.getByRole("button", { name: /^점 P7 \(1\.5, 2\)/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/배치 붙여 넣기/), { target: { value: "EQ-002\t20\t15\t3\t2\t90\nXX-9\t1\t1" } });
    await user.click(screen.getByRole("button", { name: "배치 반영" }));
    expect(screen.getByRole("status", { name: "붙여 넣기 결과" })).toHaveTextContent(/XX-9/);
    expect(screen.getByRole("button", { name: /^배치 EQ-002 서버 설비 2$/ })).toBeInTheDocument();
  });

  it("배치판 정보(도면 크기)를 PATCH하고, 이어서 내용 저장은 오른 버전으로 보낸다", async () => {
    const user = userEvent.setup();
    const { server } = open(editor(2));
    await ready();
    await user.clear(screen.getByLabelText("도면 가로(m)"));
    await user.type(screen.getByLabelText("도면 가로(m)"), "50");
    await user.click(screen.getByRole("button", { name: "배치판 정보 저장" }));
    await screen.findByText("배치판 정보를 저장했습니다.", {}, slow);
    const patch = server.writes().find((w) => w.method === "PATCH")!;
    expect(patch.body).toEqual({ canvas_width_m: "50" });
    await user.click(screen.getByRole("button", { name: "점 추가" }));
    fireEvent.click(canvas(), { clientX: 100, clientY: 100 });
    await user.click(screen.getByRole("button", { name: "내용 저장" }));
    await screen.findByText(/배치판 내용을 저장했습니다/, {}, slow);
    expect(puts(server)[0]!.headers["If-Match"]).toBe('"2"');
  });
});

describe("배치판 검증·승인", () => {
  it("검증하면 오류·경고를 key 경로로 도면에 표시하고, 경고만 있으면 승인해 읽기 전용이 된다", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "검증" }));
    expect(await screen.findByText(/경고만 있어 승인할 수 있습니다/, {}, slow)).toBeInTheDocument();
    expect(screen.getByText(/ST-041의 가로·세로 크기를 모릅니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^배치 ST-041 .*\(오류 있음\)/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "승인" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "승인" }));
    expect(await screen.findByText(/배치판을 승인했습니다/, {}, slow)).toBeInTheDocument();
    expect(screen.getByText("승인된 배치판은 바꿀 수 없습니다")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "점 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내용 저장" })).not.toBeInTheDocument();
  });

  it("검증 오류가 있으면 승인이 422 LAYOUT_VALIDATION_FAILED로 거부되고 문제 경로를 표시한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    const v2 = server.state.layouts.versions.find((v) => v.id === layoutVersionId(2))!;
    v2.routes[0]!.points = ["P1", "P2"]; // 끝 점 ≠ 도착 포트의 점(P3)
    open(editor(2), server);
    await ready();
    await user.click(screen.getByRole("button", { name: "승인" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "승인" }));
    expect(await screen.findByText(/끝 점이 도착 포트의 점\(P3\)이 아닙니다/, {}, slow)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^경로 R1 .*\(오류 있음\)$/ })).toBeInTheDocument();
    expect(v2.status).toBe("draft");
  });

  it("저장하지 않은 변경이 있으면 검증·승인을 막는다(서버에 저장된 내용을 보기 때문)", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "점 추가" }));
    fireEvent.click(canvas(), { clientX: 100, clientY: 100 });
    expect(screen.getByRole("button", { name: "검증" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "승인" })).toBeDisabled();
  });

  it("승인본은 읽기 전용이며, 새 초안을 만들려 해도 초안이 있으면 안내한다", async () => {
    const user = userEvent.setup();
    open(editor(1));
    await ready();
    expect(screen.getByText("승인된 배치판은 바꿀 수 없습니다")).toBeInTheDocument();
    expect(screen.getByLabelText("도면 가로(m)")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "이 버전으로 새 초안 만들기" }));
    expect(await screen.findByText(/이미 열린 초안이 있습니다/, {}, slow)).toBeInTheDocument();
  });

  it("조회자는 초안도 읽기 전용으로 보고 편집·승인 버튼이 없다", async () => {
    const server = createFakeServer((req, std) =>
      req.path === "/me" ? { status: 200, body: { data: { ...ME, projects: ME.projects.map((p) => (p.id === P1 ? { ...p, role: "viewer" } : p)) } } } : std(req),
    );
    server.state.role = "viewer";
    open(editor(2), server);
    await ready();
    expect(await screen.findByText(/이 역할은 배치판을 고칠 수 없습니다/, {}, slow)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "점 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내용 저장" })).not.toBeInTheDocument();
  });
});
