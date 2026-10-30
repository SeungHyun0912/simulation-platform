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
    expect(within(within(panel).getByLabelText("고른 점 순서")).getAllByRole("listitem").map((li) => li.textContent?.trim())).toEqual(["P1", "P3"]);
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

/** 화면 맞춤: zoom 1.075 → 1 m = 21.5 px, 원점 (24, 28) */
const sx = (m: number) => 24 + 21.5 * m;
const sy = (m: number) => 28 + 21.5 * m;
const pointRows = () =>
  within(screen.getByRole("table", { name: "점 목록" }))
    .getAllByRole("row")
    .slice(1)
    .map((r) => (r as HTMLTableRowElement).cells[0]!.textContent);
const draftOrder = () =>
  within(within(screen.getByRole("region", { name: "경로 그리기" })).getByLabelText("고른 점 순서"))
    .getAllByRole("listitem")
    .map((li) => li.textContent?.trim());

describe("경로 그리기 고도화(참고 라벨러 방식: 점 자동 생성·기존 점 선택)", () => {
  it("설비를 누르면 그 산출 포트의 점에서 시작하고, 빈 곳은 새 점을 만들며, 공간을 누르면 접근 포트로 끝나고 Enter로 완성한다", async () => {
    const user = userEvent.setup();
    const { server } = open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "경로 그리기" }));
    fireEvent.click(screen.getByRole("button", { name: /^배치 EQ-001 서버 설비 1/ }), { clientX: sx(8), clientY: sy(5) }); // OUT → P1(이미 연결)
    fireEvent.click(canvas(), { clientX: sx(20), clientY: sy(15) }); // 빈 곳 → 새 점 P4
    fireEvent.click(screen.getByRole("button", { name: /^배치 ST-041 서버 공간 41/ }), { clientX: sx(27), clientY: sy(9) }); // ACCESS → P3
    expect(draftOrder()).toEqual(["P1", "P4 (새 점)", "P3"]);
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("region", { name: "경로 그리기" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "경로 R2 속성" })).toBeInTheDocument();
    expect(pointRows()).toContain("P4");
    await user.click(screen.getByRole("button", { name: "내용 저장" }));
    await screen.findByText(/배치판 내용을 저장했습니다/, {}, slow);
    const sent = puts(server)[0]!.body;
    expect(sent.routes[1]).toMatchObject({ route_key: "R2", points: ["P1", "P4", "P3"] });
    expect(sent.routes[1].from_port_id).toBe(sent.port_points.find((m: { point_key: string }) => m.point_key === "P1").port_id);
    expect(sent.points.find((p: { point_key: string }) => p.point_key === "P4")).toMatchObject({ x_m: "20.0", y_m: "15.0" });
  });

  it("포트가 점에 연결되지 않은 설비를 누르면 그 자리에 점을 만들고 포트를 자동으로 연결한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    const v2 = server.state.layouts.versions.find((v) => v.id === layoutVersionId(2))!;
    v2.placements.push({ ...v2.placements[0]!, asset_id: "aaaaaaaa-0000-4000-8000-000000000002", asset_code: "EQ-002", asset_name: "서버 설비 2", x_m: "30.0", y_m: "15.0" });
    open(editor(2), server);
    await ready();
    await user.click(screen.getByRole("button", { name: "경로 그리기" }));
    fireEvent.click(screen.getByRole("button", { name: /^배치 EQ-002 서버 설비 2/ }), { clientX: sx(30), clientY: sy(15) });
    fireEvent.click(screen.getByRole("button", { name: /^배치 ST-041 서버 공간 41/ }), { clientX: sx(27), clientY: sy(9) });
    await user.keyboard("{Enter}");
    expect(screen.getByRole("table", { name: "점 목록" })).toHaveTextContent("EQ-002 OUT(산출)");
    expect(screen.getByRole("table", { name: "경로 목록" })).toHaveTextContent(/R2EQ-002 OUT\(산출\)ST-041 ACCESS-01\(접근\)/);
  });

  it("기존 점 가까이(화면 12px 안)를 누르면 새 점을 만들지 않고 그 점을 쓰며, '기존 점 추가'로도 고를 수 있다", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "경로 그리기" }));
    fireEvent.click(canvas(), { clientX: sx(13) + 5, clientY: sy(9) - 4 }); // P2(13, 9) 근처
    await user.selectOptions(within(screen.getByRole("region", { name: "경로 그리기" })).getByLabelText("기존 점 추가"), "P3");
    expect(draftOrder()).toEqual(["P2", "P3"]);
    expect(pointRows()).toEqual(["P1", "P2", "P3"]); // 새 점 없음
  });

  it("Backspace는 마지막 점(자동으로 만든 점이면 그 점도)을 빼고, Esc는 그리기를 취소하며 자동으로 만든 점을 모두 지운다", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "경로 그리기" }));
    fireEvent.click(canvas(), { clientX: sx(30), clientY: sy(2) });
    fireEvent.click(canvas(), { clientX: sx(35), clientY: sy(2) });
    expect(pointRows()).toEqual(["P1", "P2", "P3", "P4", "P5"]);
    await user.keyboard("{Backspace}");
    expect(pointRows()).toEqual(["P1", "P2", "P3", "P4"]);
    await user.keyboard("{Escape}");
    expect(pointRows()).toEqual(["P1", "P2", "P3"]);
    expect(screen.queryByRole("region", { name: "경로 그리기" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "경로 목록" })).not.toHaveTextContent("R2");
  });

  it("출발·도착 포트를 정할 수 없으면 끝내지 않고 이유를 알린다", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "경로 그리기" }));
    fireEvent.click(canvas(), { clientX: sx(30), clientY: sy(2) });
    fireEvent.click(canvas(), { clientX: sx(35), clientY: sy(2) });
    await user.keyboard("{Enter}");
    expect(within(screen.getByRole("region", { name: "경로 그리기" })).getByRole("alert")).toHaveTextContent("출발·도착 포트를 고르세요");
  });

  it("선택 모드에서 경로 선을 더블클릭하면 그 자리에 점을 끼워 넣는다", async () => {
    open(editor(2));
    await ready();
    fireEvent.doubleClick(screen.getByRole("button", { name: /^경로 R1 \(/ }), { clientX: sx(19), clientY: sy(9) }); // P2(13,9)–P3(25,9) 사이
    expect(screen.getByRole("region", { name: "점 P4 속성" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^경로 R1 .*: P1 → P2 → P4 → P3$/ })).toBeInTheDocument();
  });

  it("경로 속성에서 점을 빼거나 기존 점을 끝에 붙이고, 쓰이지 않게 된 점은 한 번에 지운다", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "경로 R1 선택" }));
    await user.click(within(screen.getByRole("region", { name: "경로 R1 속성" })).getByRole("button", { name: "2번째 점 P2 빼기" }));
    expect(screen.getByRole("button", { name: /^경로 R1 .*: P1 → P3$/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "쓰지 않는 점 1개 지우기" }));
    expect(pointRows()).toEqual(["P1", "P3"]);
    await user.selectOptions(within(screen.getByRole("region", { name: "경로 R1 속성" })).getByLabelText("끝에 기존 점 추가"), "P1");
    expect(screen.getByRole("button", { name: /^경로 R1 .*: P1 → P3 → P1$/ })).toBeInTheDocument();
  });

  it("되돌리기·다시 하기(Ctrl+Z / Ctrl+Y와 버튼): 경로 하나는 한 번에 되돌린다", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "점 추가" }));
    fireEvent.click(canvas(), { clientX: sx(30), clientY: sy(2) });
    expect(pointRows()).toContain("P4");
    await user.click(screen.getByRole("button", { name: "선택·이동" }));
    await user.keyboard("{Control>}z{/Control}");
    expect(pointRows()).not.toContain("P4");
    await user.keyboard("{Control>}y{/Control}");
    expect(pointRows()).toContain("P4");
    // 경로: 자동 점 + 경로 → 되돌리기 한 번에 모두 사라진다
    await user.click(screen.getByRole("button", { name: "경로 그리기" }));
    fireEvent.click(screen.getByRole("button", { name: /^배치 EQ-001 서버 설비 1/ }), { clientX: sx(8), clientY: sy(5) });
    fireEvent.click(canvas(), { clientX: sx(35), clientY: sy(15) });
    fireEvent.click(screen.getByRole("button", { name: /^배치 ST-041 서버 공간 41/ }), { clientX: sx(27), clientY: sy(9) });
    await user.keyboard("{Enter}");
    expect(pointRows()).toContain("P5");
    await user.click(screen.getByRole("button", { name: "↺ 되돌리기" }));
    expect(pointRows()).not.toContain("P5");
    expect(screen.getByRole("table", { name: "경로 목록" })).not.toHaveTextContent("R2");
    await user.click(screen.getByRole("button", { name: "다시 하기" }));
    expect(screen.getByRole("table", { name: "경로 목록" })).toHaveTextContent("R2");
  });
});

describe("저장공간이 있는 배치판(실데이터 v2 모양)", () => {
  it("공간을 먼저·설비를 위에 그리고, 소속 공간(inside_space)을 보여 주며 그 공간을 고를 수 있다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    const v2 = server.state.layouts.versions.find((v) => v.id === layoutVersionId(2))!;
    // 설비를 공간 안에 둔다(정렬은 응답 순서 = 자산 코드 순: EQ가 ST보다 앞)
    v2.placements[0]!.attributes = { inside: "ST42", inside_space: "ST-041" };
    v2.placements[1] = { ...v2.placements[1]!, x_m: "8.0", y_m: "5.0", width_m: "10.0", height_m: "6.0" };
    open(editor(2), server);
    await ready();
    const space = screen.getByRole("button", { name: /^배치 ST-041 서버 공간 41/ });
    const eq = screen.getByRole("button", { name: /^배치 EQ-001 서버 설비 1/ });
    expect(space.compareDocumentPosition(eq) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // 설비가 나중(위)에 그려짐
    expect(within(screen.getByRole("table", { name: "배치 목록" })).getByText("ST-041")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "배치 EQ-001 선택" }));
    const panel = screen.getByRole("region", { name: /배치 EQ-001 .* 속성/ });
    expect(within(panel).getByLabelText("소속 공간")).toHaveTextContent("소속 공간: ST-041 서버 공간 41");
    await user.click(within(panel).getByRole("button", { name: "소속 공간 선택" }));
    expect(screen.getByRole("region", { name: /배치 ST-041 .* 속성/ })).toBeInTheDocument();
  });
});

describe("경로 끝내기(사용자 보고: 계속 점만 추가됨)", () => {
  it("도면 위 상태 줄에 점 수·출발·도착 포트를 보이고, 끝내지 못하면 그 이유를 도면 위에 보인다", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "경로 그리기" }));
    fireEvent.click(canvas(), { clientX: sx(30), clientY: sy(2) });
    fireEvent.click(canvas(), { clientX: sx(35), clientY: sy(2) });
    const bar = screen.getByRole("region", { name: "경로 그리기 상태" });
    expect(bar).toHaveTextContent("점 2개 · 출발 미정 · 도착 미정");
    await user.click(within(bar).getByRole("button", { name: "경로 끝내기" }));
    expect(within(bar).getByText("경로를 끝내지 못했습니다")).toBeInTheDocument();
    expect(bar).toHaveTextContent("출발·도착 포트를 고르세요");
  });

  it("출발·도착 포트를 선택 상자로 고른 직후에도 Enter로 끝낸다", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "경로 그리기" }));
    fireEvent.click(canvas(), { clientX: sx(30), clientY: sy(2) });
    fireEvent.click(canvas(), { clientX: sx(35), clientY: sy(2) });
    const panel = screen.getByRole("region", { name: "경로 그리기" });
    const from = within(panel).getByLabelText("출발 포트");
    await user.selectOptions(from, within(from).getByRole("option", { name: "EQ-001 OUT(산출)" }));
    const to = within(panel).getByLabelText("도착 포트");
    await user.selectOptions(to, within(to).getByRole("option", { name: "ST-041 ACCESS-01(접근)" }));
    expect(document.activeElement).toBe(to);
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("region", { name: "경로 그리기" })).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "경로 목록" })).toHaveTextContent("R2");
  });
});

describe("통로(W)·경로 계산(0.18.0)", () => {
  it("통로 그리기: 빈 곳은 새 점, 기존 점은 그 점을 지나(갈림길) 통로를 만들고, 저장하면 aisles를 보낸다", async () => {
    const user = userEvent.setup();
    const { server } = open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "통로 그리기" }));
    fireEvent.click(canvas(), { clientX: sx(30), clientY: sy(2) }); // P4
    fireEvent.click(canvas(), { clientX: sx(13) + 3, clientY: sy(9) }); // 기존 P2(갈림길)
    fireEvent.click(canvas(), { clientX: sx(30), clientY: sy(15) }); // P5
    const bar = screen.getByRole("region", { name: "통로 그리기 상태" });
    expect(bar).toHaveTextContent("점 3개");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("region", { name: "통로 W1 속성" })).toHaveTextContent("다른 선과 이어지는 점(공유 점): P2");
    expect(screen.getByRole("table", { name: "통로 목록" })).toHaveTextContent("P4 — P2 — P5");
    await user.click(screen.getByRole("button", { name: "내용 저장" }));
    await screen.findByText(/배치판 내용을 저장했습니다/, {}, slow);
    expect(puts(server)[0]!.body.aisles).toEqual([{ aisle_key: "W1", points: ["P4", "P2", "P5"], attributes: {} }]);
    expect(screen.getByRole("table", { name: "통로 목록" })).not.toHaveTextContent("저장 후 계산"); // 서버 length_m
  });

  it("서버에 있던 통로는 다른 것을 고쳐 저장해도 그대로 다시 보낸다(통째 교체라 빼면 지워짐)", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    const v2 = server.state.layouts.versions.find((v) => v.id === layoutVersionId(2))!;
    v2.aisles = [{ aisle_key: "W7", points: ["P1", "P2"], attributes: { note: "x" }, length_m: "5.0" }];
    open(editor(2), server);
    await ready();
    expect(screen.getByRole("button", { name: "통로 W7: P1 — P2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "점 추가" }));
    fireEvent.click(canvas(), { clientX: sx(35), clientY: sy(2) });
    await user.click(screen.getByRole("button", { name: "내용 저장" }));
    await screen.findByText(/배치판 내용을 저장했습니다/, {}, slow);
    expect(puts(server)[0]!.body.aisles).toEqual([{ aisle_key: "W7", points: ["P1", "P2"], attributes: { note: "x" } }]);
  });

  it("통로 붙여 넣기: 통로 이름 + 점 이름들, 없는 점은 그 줄을 건너뛰고 알린다", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByText("엑셀에서 붙여 넣기"));
    fireEvent.change(screen.getByLabelText(/통로 붙여 넣기/), { target: { value: "W1\tP1 P2 P3\nW2, P3, P9" } });
    await user.click(screen.getByRole("button", { name: "통로 반영" }));
    expect(screen.getByRole("status", { name: "붙여 넣기 결과" })).toHaveTextContent("통로 1개 추가");
    expect(screen.getByRole("status", { name: "붙여 넣기 결과" })).toHaveTextContent("없는 점 P9");
    expect(screen.getByRole("table", { name: "통로 목록" })).toHaveTextContent("P1 — P2 — P3");
  });

  it("경로 보기: 출발 1 → 도착 여러 개를 계산해 고정·계산 경로·갈 수 없음(이유)을 보이고, 가장 짧은 경로를 도면에 강조한다", async () => {
    const user = userEvent.setup();
    const { server } = open(editor(2));
    await ready();
    const sec = screen.getByRole("region", { name: "경로 보기(계산)" });
    const from = within(sec).getByLabelText("출발 포트");
    await user.selectOptions(from, within(from).getByRole("option", { name: "ST-041 ACCESS-01(접근)" }));
    const to = within(sec).getByLabelText(/도착 포트/);
    await user.selectOptions(to, [
      within(to).getByRole("option", { name: "EQ-001 OUT(산출)" }),
      within(to).getByRole("option", { name: "EQ-002 IN(투입)" }),
    ]);
    await user.click(within(sec).getByRole("button", { name: "경로 계산(2쌍)" }));
    const table = await within(sec).findByRole("table", { name: "경로 계산 결과" }, slow);
    expect(server.writes().find((w) => w.path.endsWith("/paths"))!.body.pairs).toHaveLength(2);
    expect(table).toHaveTextContent("갈 수 있음 · 통로로 계산"); // 고정 경로 R1의 반대 방향
    expect(table).toHaveTextContent("17.0");
    expect(table).toHaveTextContent("P3 → P2 → P1");
    expect(table).toHaveTextContent("갈 수 없음: 포트가 점에 연결되지 않았습니다");
    expect(within(table).getByRole("button", { name: "도착 포트 보기" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "계산 경로 P3 → P2 → P1" })).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: /경로 도면에 표시/ }));
    expect(screen.queryByRole("img", { name: /^계산 경로/ })).not.toBeInTheDocument();
  });

  it("저장하지 않은 변경이 있으면 경로 보기는 '저장된 내용 기준'임을 알린다", async () => {
    const user = userEvent.setup();
    open(editor(2));
    await ready();
    await user.click(screen.getByRole("button", { name: "점 추가" }));
    fireEvent.click(canvas(), { clientX: sx(35), clientY: sy(2) });
    expect(within(screen.getByRole("region", { name: "경로 보기(계산)" })).getByText("저장된 내용 기준")).toBeInTheDocument();
  });

  it("검증 경고가 통로·포트를 가리키면(/aisles/{key}, /port_points/{id}) 도면에 표시한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.path.endsWith("/validate")
        ? {
            status: 200,
            body: {
              data: {
                layout_version_id: layoutVersionId(2),
                approvable: true,
                error_count: 0,
                warning_count: 1,
                issues: [{ rule_id: "LAY-008", severity: "warning", field_path: "/aisles/W7", message: "선분이 만나는데 공유 점이 없습니다." }],
              },
            },
          }
        : std(req),
    );
    server.state.layouts.versions.find((v) => v.id === layoutVersionId(2))!.aisles = [{ aisle_key: "W7", points: ["P1", "P3"], attributes: {}, length_m: "15.5" }];
    open(editor(2), server);
    await ready();
    await user.click(screen.getByRole("button", { name: "검증" }));
    expect(await screen.findByText(/공유 점이 없습니다/, {}, slow)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "통로 W7: P1 — P3 (오류 있음)" })).toBeInTheDocument();
  });
});
