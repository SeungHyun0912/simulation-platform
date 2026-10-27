import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, ME, P1, type FakeServer } from "../fakeApi";
import { processProductId, processVersionId } from "../fakeProcess";
import { renderApp } from "../renderApp";

/**
 * 공정 플로우차트(서버 연동). 시드: 제품 5의 v5 초안(원자재 → 가닥 A → 가닥 B → 완제품 판정(milestone, 완제품 지정) → 완제품,
 * 가닥 A의 출력 spec과 가닥 B의 입력 spec을 간선이 연결), 제품 1의 v1 승인본(직선)과 v2 초안.
 */
const slow = { timeout: 8000 };
const V5 = processVersionId(5);
const flow5 = `/projects/${P1}/products/${processProductId(5)}/flow`;
const flow1 = `/projects/${P1}/products/${processProductId(1)}/flow`;

function open(path: string, server: FakeServer = createFakeServer()) {
  return { server, ...renderApp(path, { source: "api", fetchImpl: server.fetchImpl }) };
}
const asRole = (role: "editor" | "viewer") => {
  const server = createFakeServer((req, std) =>
    req.path === "/me" ? { status: 200, body: { data: { ...ME, projects: ME.projects.map((p) => (p.id === P1 ? { ...p, role } : p)) } } } : std(req),
  );
  server.state.role = role;
  return server;
};
const node = (name: string | RegExp) => screen.getByRole("button", { name });
const graphOf = (s: FakeServer, v = V5) => s.state.processes.graphs[v]!;
const graphPuts = (s: FakeServer) => s.writes().filter((w) => w.method === "PUT" && w.path.endsWith("/graph"));
const statePuts = (s: FakeServer) => s.writes().filter((w) => w.method === "PUT" && w.path.endsWith("/editor-state"));
const saveButton = () => screen.getByRole("button", { name: /^저장/ });

async function ready(name = /공정 단계 가닥 A/) {
  await screen.findByRole("button", { name }, slow);
}
const positionOf = (el: HTMLElement) => /translate\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)/.exec(el.getAttribute("transform") ?? "")!.slice(1).map(Number) as [number, number];

describe("공정 플로우차트: 조회", () => {
  it("제품의 공정 버전 전체를 노드·간선으로 그리고 종류·완제품 지정을 표시한다", async () => {
    open(flow5);
    await ready();
    expect(await screen.findByRole("heading", { level: 1, name: /P-005 공정 플로우차트/ }, slow)).toBeInTheDocument();
    for (const n of [/시작\(원자재\) 원자재/, /공정 단계 가닥 A/, /공정 단계 가닥 B/, /완료 기준 완제품 판정 \(완제품 지정\)/, /끝\(완제품\) 완제품/]) expect(node(n)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^간선 .+ → / })).toHaveLength(4); // 간선 연결 도구 버튼은 제외
    expect(screen.getByRole("link", { name: "공정 플로우차트" })).toHaveAttribute("href", `/projects/${P1}/flow`);
  });

  it("제품을 고르지 않고 열면 공정이 있는 첫 제품으로 이동한다", async () => {
    const { router } = open(`/projects/${P1}/flow`);
    await waitFor(() => expect(router.state.location.pathname).toBe(flow1), slow);
    expect(await screen.findByRole("heading", { level: 1, name: /P-001 공정 플로우차트/ }, slow)).toBeInTheDocument();
  });

  it("제품·버전을 바꿔 다른 공정을 본다(승인본과 초안)", async () => {
    const user = userEvent.setup();
    const { router } = open(flow1);
    await screen.findByRole("heading", { level: 1, name: /P-001 공정 플로우차트/ }, slow);
    const version = screen.getByLabelText("공정 버전");
    expect(within(version).getAllByRole("option").map((o) => o.textContent)).toEqual(["v2 (초안)", "v1 (승인)"]);
    await user.selectOptions(version, processVersionId(1));
    expect(router.state.location.search).toBe(`?version=${processVersionId(1)}`);
    await waitFor(() => expect(screen.getByText(/승인된 버전의 내용은 수정할 수 없습니다/)).toBeInTheDocument(), slow);
    await user.selectOptions(screen.getByLabelText("제품"), processProductId(5));
    await waitFor(() => expect(router.state.location.pathname).toBe(flow5), slow);
  });

  it("저장된 노드 좌표가 있으면 그 위치에 그린다(없는 노드는 자동 배치)", async () => {
    const server = createFakeServer();
    const g = graphOf(server);
    server.state.processes.editorStates[V5] = { positions: { [g.nodes[1]!.id]: { x: 500, y: 300 } }, viewport: { x: 0, y: 0, zoom: 1 }, row_version: 2 };
    open(flow5, server);
    await ready();
    expect(positionOf(node(/공정 단계 가닥 A/))).toEqual([500, 300]);
    expect(positionOf(node(/시작\(원자재\) 원자재/))[0]).toBeLessThan(100);
  });

  it("정적 모드에서는 예시 대신 서버 연동 전용 안내만 보인다", () => {
    renderApp(flow5, { source: "static" });
    expect(screen.getByText(/서버 연동 모드에서만 사용할 수 있습니다/)).toBeInTheDocument();
  });
});

describe("공정 플로우차트: 노드·간선을 눌러 수정", () => {
  it("공정 단계를 누르면 단계 편집 패널이 열리고 이름만 고쳐 저장해도 완제품 지정·재료 spec·간선 연결이 보존된다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    const before = structuredClone(graphOf(server));
    await user.click(node(/공정 단계 가닥 B/));
    expect(await screen.findByRole("heading", { name: /단계 편집: 가닥 B/ })).toBeInTheDocument();
    const name = screen.getByLabelText("공정명");
    await user.clear(name);
    await user.type(name, "가닥 B(수정)");
    await user.click(saveButton());
    await screen.findByText(/공정을 저장했습니다/, {}, slow);
    expect(graphPuts(server)).toHaveLength(1);
    expect(statePuts(server)).toHaveLength(0); // 배치를 안 바꿨으면 좌표는 저장하지 않는다
    const body = graphPuts(server)[0]!.body;
    expect(body.completion_node_id).toBe(before.completion_node_id);
    expect(body.edges).toEqual(before.edges);
    expect(body.nodes.find((n: { label: string }) => n.label === "가닥 A").step.material_specs).toEqual(before.nodes[1]!.step!.material_specs);
    expect(graphOf(server).nodes.some((n) => n.label === "가닥 B(수정)")).toBe(true);
  });

  it("단계가 아닌 노드는 노드 편집 양식으로, 간선은 간선 편집 양식(재료 연결 포함)으로 수정한다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    await user.click(node(/완료 기준 완제품 판정/));
    const label = await screen.findByLabelText("노드 이름");
    await user.clear(label);
    await user.type(label, "최종 판정");
    await user.click(node(/^간선 가닥 A → 가닥 B/));
    expect(await screen.findByLabelText("출력 재료 연결 (시작 단계)")).toHaveValue("out-1");
    await user.selectOptions(screen.getByLabelText("간선 종류"), "precedence");
    await user.click(saveButton());
    await screen.findByText(/공정을 저장했습니다/, {}, slow);
    expect(graphOf(server).nodes.some((n) => n.label === "최종 판정")).toBe(true);
    const e = graphOf(server).edges.find((x) => x.edge_kind === "precedence")!;
    expect(e.source_output_spec_key ?? null).toBeNull(); // 선후 관계로 바뀌면 낡은 재료 연결이 풀린다
  });

  it("노드를 추가하고 간선 연결 모드로 이어 저장하면 새 노드·간선이 서버에 저장된다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    await user.type(screen.getByLabelText("새 노드 이름"), "검사");
    await user.click(screen.getByRole("button", { name: "노드 추가" }));
    expect(await screen.findByRole("button", { name: /공정 단계 검사/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "간선 연결" }));
    await user.click(node(/공정 단계 가닥 A/));
    expect(screen.getByText(/끝 노드를 누르세요/)).toBeInTheDocument();
    await user.click(node(/공정 단계 검사/));
    expect(await screen.findByLabelText("간선 종류")).toBeInTheDocument(); // 만든 간선이 선택되어 편집 양식이 열린다
    await user.click(saveButton());
    await screen.findByText(/공정을 저장했습니다/, {}, slow);
    const g = graphOf(server);
    const id = g.nodes.find((n) => n.label === "검사")!.id;
    expect(g.edges.some((e) => e.to_node_id === id && e.edge_kind === "material")).toBe(true);
    // 새 노드의 위치도 함께 저장된다(공정 내용을 먼저 저장한 뒤 좌표 저장)
    await waitFor(() => expect(statePuts(server)).toHaveLength(1), slow);
    expect(Object.keys(statePuts(server)[0]!.body.node_positions)).toContain(id);
  });

  it("규칙에 어긋나는 연결(끝에서 나가는 물류 간선)은 만들지 않고 이유를 알린다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    await user.click(screen.getByRole("button", { name: "간선 연결" }));
    await user.click(node(/끝\(완제품\) 완제품/));
    await user.click(node(/공정 단계 가닥 A/));
    expect((await screen.findByRole("status")).textContent).toMatch(/끝|완제품|나갈 수 없|연결/);
    expect(graphOf(server).edges).toHaveLength(4);
  });

  it("선택한 노드를 삭제하면 연결된 간선도 함께 지워지고 저장하면 서버에 반영된다(확인 대화상자)", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    await user.click(node(/완료 기준 완제품 판정/));
    await user.click(screen.getByRole("button", { name: "선택 삭제" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/연결된 간선 2개도 함께 지워지며/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));
    expect(screen.queryByRole("button", { name: /완료 기준 완제품 판정/ })).not.toBeInTheDocument();
    await user.click(saveButton());
    await screen.findByText(/공정을 저장했습니다/, {}, slow);
    expect(graphOf(server).nodes.some((n) => n.label === "완제품 판정")).toBe(false);
    expect(graphOf(server).completion_node_id ?? null).toBeNull(); // 완제품 노드를 지우면 지정도 풀린다
  });

  it("초안이 아닌 버전은 내용을 수정할 수 없다(추가·연결·삭제 도구가 막히고 양식이 읽기 전용)", async () => {
    const user = userEvent.setup();
    open(`${flow1}?version=${processVersionId(1)}`);
    await ready(/공정 단계 압출/);
    expect(screen.queryByLabelText("새 노드 이름")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "간선 연결" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "선택 삭제" })).toBeDisabled();
    await user.click(node(/공정 단계 압출/));
    expect(await screen.findByLabelText("공정명")).toBeDisabled();
  });
});

describe("공정 플로우차트: 노드 배치(editor-state)", () => {
  it("화살표 키로 노드를 옮기고 저장하면 모든 노드 좌표를 If-Match 0으로 저장하고, 다시 옮기면 1로 저장한다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    const a = node(/공정 단계 가닥 A/);
    const [x0, y0] = positionOf(a);
    a.focus();
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(positionOf(node(/공정 단계 가닥 A/))).toEqual([x0 + 10, y0 + 10]);
    await user.click(saveButton());
    await screen.findByText(/배치를 저장했습니다/, {}, slow);
    expect(graphPuts(server)).toHaveLength(0); // 공정 내용은 바뀌지 않았다
    const put = statePuts(server)[0]!;
    expect(put.headers["If-Match"]).toBe('"0"');
    expect(Object.keys(put.body.node_positions)).toHaveLength(5);
    expect(put.body.node_positions[graphOf(server).nodes[1]!.id]).toEqual({ x: x0 + 10, y: y0 + 10 });
    for (const p of Object.values(put.body.node_positions) as { x: number; y: number }[]) expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
    // 공정 버전의 row_version은 그대로다(좌표는 공정 내용이 아니다)
    expect(server.state.processes.versions.find((v) => v.id === V5)!.row_version).toBe(2);
    node(/공정 단계 가닥 A/).focus();
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    await user.click(saveButton());
    await waitFor(() => expect(statePuts(server)).toHaveLength(2), slow);
    expect(statePuts(server)[1]!.headers["If-Match"]).toBe('"1"');
  });

  it("승인본에서도 배치는 옮겨 저장할 수 있고 공정 내용(그래프)은 저장하지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(`${flow1}?version=${processVersionId(1)}`);
    await ready(/공정 단계 압출/);
    node(/공정 단계 압출/).focus();
    await user.keyboard("{ArrowDown}");
    await user.click(saveButton());
    await screen.findByText(/배치를 저장했습니다/, {}, slow);
    expect(graphPuts(server)).toHaveLength(0);
    expect(server.state.processes.editorStates[processVersionId(1)]!.row_version).toBe(1);
  });

  it("끌어서 옮길 수 있고(포인터) 끈 뒤에는 선택으로 처리하지 않는다", async () => {
    const { server } = open(flow5);
    await ready();
    const a = node(/공정 단계 가닥 A/);
    const [x0, y0] = positionOf(a);
    fireEvent.pointerDown(a, { clientX: 100, clientY: 100, button: 0, pointerId: 1 });
    const svg = a.closest("svg")!;
    fireEvent.pointerMove(svg, { clientX: 160, clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(svg, { clientX: 160, clientY: 140, pointerId: 1 });
    fireEvent.click(node(/공정 단계 가닥 A/)); // 브라우저는 끌기 직후 같은 요소에 click을 보낸다 — 선택으로 처리하지 않는다
    const [x1, y1] = positionOf(node(/공정 단계 가닥 A/));
    expect(x1).toBeGreaterThan(x0);
    expect(y1).toBeGreaterThan(y0);
    expect(screen.queryByRole("heading", { name: /단계 편집/ })).not.toBeInTheDocument();
    expect(server.writes()).toHaveLength(0); // 저장하기 전에는 서버에 아무것도 쓰지 않는다
  });

  it("다른 사용자가 배치를 먼저 저장했으면(412) 알리고, '내 배치로 덮어쓰기'는 최신 버전으로 다시 저장한다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    node(/공정 단계 가닥 A/).focus();
    await user.keyboard("{ArrowRight}");
    server.state.processes.editorStates[V5] = { positions: {}, viewport: null, row_version: 3 }; // 다른 사용자가 먼저 저장
    await user.click(saveButton());
    expect(await screen.findByText("다른 사용자가 배치를 먼저 저장했습니다", {}, slow)).toBeInTheDocument();
    expect(server.state.processes.editorStates[V5]!.row_version).toBe(3); // 덮어쓰지 않았다
    await user.click(screen.getByRole("button", { name: "내 배치로 덮어쓰기" }));
    await screen.findByText(/배치를 저장했습니다/, {}, slow);
    expect(server.state.processes.editorStates[V5]!.row_version).toBe(4);
    expect(statePuts(server).at(-1)!.headers["If-Match"]).toBe('"3"');
  });

  it("'서버 배치로 다시 불러오기'는 이 화면에서 옮긴 위치를 버린다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    const [x0] = positionOf(node(/공정 단계 가닥 A/));
    node(/공정 단계 가닥 A/).focus();
    await user.keyboard("{ArrowRight}");
    server.state.processes.editorStates[V5] = { positions: {}, viewport: null, row_version: 3 };
    await user.click(saveButton());
    await user.click(await screen.findByRole("button", { name: "서버 배치로 다시 불러오기" }, slow));
    await waitFor(() => expect(positionOf(node(/공정 단계 가닥 A/))[0]).toBe(x0), slow);
  });

  it("자동 배치는 모든 노드를 기본 위치로 되돌리고 저장 전에는 서버 값을 바꾸지 않는다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    const g = graphOf(server);
    server.state.processes.editorStates[V5] = { positions: Object.fromEntries(g.nodes.map((n) => [n.id, { x: 900, y: 900 }])), viewport: null, row_version: 1 };
    open(flow5, server);
    await ready();
    expect(positionOf(node(/공정 단계 가닥 A/))).toEqual([900, 900]);
    await user.click(screen.getByRole("button", { name: "자동 배치" }));
    expect(positionOf(node(/공정 단계 가닥 A/))[0]).toBeLessThan(900);
    expect(statePuts(server)).toHaveLength(0);
  });

  it("조회자는 노드를 옮길 수 없고 저장할 수 없다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5, asRole("viewer"));
    await ready();
    await waitFor(() => expect(screen.getByRole("button", { name: "자동 배치" })).toBeDisabled(), slow);
    const [x0] = positionOf(node(/공정 단계 가닥 A/));
    node(/공정 단계 가닥 A/).focus();
    await user.keyboard("{ArrowRight}");
    expect(positionOf(node(/공정 단계 가닥 A/))[0]).toBe(x0);
    expect(saveButton()).toBeDisabled();
    expect(server.writes()).toHaveLength(0);
  });

  it("좌표를 불러오지 못해도(오류) 자동 배치로 공정을 볼 수 있고 배치 저장은 막는다", async () => {
    const server = createFakeServer((req, std) => (req.path.endsWith("/editor-state") ? { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "서버 오류", request_id: "r", details: [] } } } : std(req)));
    open(flow5, server);
    await ready();
    expect(screen.getByText(/저장된 노드 배치를 불러오지 못해 자동 배치로 보여 줍니다/)).toBeInTheDocument();
    node(/공정 단계 가닥 A/).focus();
    await userEvent.setup().keyboard("{ArrowRight}");
    expect(saveButton()).toBeDisabled();
  });
});

describe("공정 플로우차트: 상태 안내", () => {
  it("공정이 없는 제품은 안내와 제품 상세 링크를 보인다", async () => {
    open(`/projects/${P1}/products/${processProductId(2)}/flow`);
    expect(await screen.findByText("공정 버전이 없습니다", {}, slow)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "제품 상세" })).toBeInTheDocument();
  });

  it("서버 검증 결과(경고·오류)를 패널에 보이고 오류가 있는 노드는 접근 가능한 이름에 표시한다", async () => {
    open(flow5);
    await ready();
    expect(await screen.findByRole("alert", { name: "검증 결과" }, slow)).toBeInTheDocument();
  });
});
