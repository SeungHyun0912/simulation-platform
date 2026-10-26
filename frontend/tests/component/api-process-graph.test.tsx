import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, ME, P1, type FakeServer } from "../fakeApi";
import { processProductId, processVersionId } from "../fakeProcess";
import { renderApp } from "../renderApp";

const V2 = processVersionId(2); // P-001 v2 초안(직선)
const V4 = processVersionId(4); // P-004 초안(분기·합류), row_version 2
const url = (productNo: number, versionId: string) => `/projects/${P1}/products/${processProductId(productNo)}/processes/${versionId}`;
const slow = { timeout: 8000 };

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

async function ready(code = "P-004", versionNo = 1) {
  await screen.findByRole("heading", { level: 1, name: new RegExp(`${code} 공정 v${versionNo}`) }, slow);
  await waitFor(() => expect(screen.getByText(/내 역할: 관리자/)).toBeInTheDocument(), slow);
  await screen.findByRole("table", { name: "노드" }, slow);
}

const saveButton = () => screen.getByRole("button", { name: /^저장/ });
const graphOf = (s: FakeServer, id = V4) => s.state.processes.graphs[id]!;
const putBody = (s: FakeServer) => s.writes().filter((w) => w.method === "PUT").at(-1)!.body as {
  nodes: { id: string; kind: string; label: string; node_key: string; asset_id?: string | null; display_order: number }[];
  edges: { id: string; edge_key: string; from_node_id: string; to_node_id: string; edge_kind: string; movement_rule?: { mode: string; duration_min: { mode: string; value?: string } } }[];
};
const nodeTable = () => screen.getByRole("table", { name: "노드" });
const edgeTable = () => screen.getByRole("table", { name: "간선" });
const idOf = (s: FakeServer, label: string, v = V4) => graphOf(s, v).nodes.find((n) => n.label === label)!.id;

describe("그래프 구성 표시", () => {
  it("분기·합류 공정의 도식·노드 표·간선 표를 보여 주고 구조 편집 안내를 한다", async () => {
    open(url(4, V4));
    await ready();
    expect(screen.getByRole("group", { name: /공정 그래프 도식/ })).toBeInTheDocument();
    expect(within(nodeTable()).getAllByRole("row")).toHaveLength(6); // 노드 5 + 머리글
    expect(within(edgeTable()).getAllByRole("row")).toHaveLength(6); // 간선 5 + 머리글
    expect(screen.getByText("직선이 아닌 공정입니다")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "단계 추가" })).not.toBeInTheDocument(); // 표의 단계 추가는 직선 전용
    expect(screen.getByRole("button", { name: "노드 추가" })).toBeInTheDocument();
    expect(within(nodeTable()).getByText("들어옴 2 · 나감 1")).toBeInTheDocument(); // 합류
    expect(within(edgeTable()).getAllByText("물류")).toHaveLength(5);
  });

  it("도식의 노드를 누르면 작업 노드는 단계 편집이, 그 밖은 노드 편집이 열린다", async () => {
    const user = userEvent.setup();
    open(url(4, V4));
    await ready();
    await user.click(screen.getByRole("button", { name: "공정 단계 가닥 A 선택" }));
    expect(await screen.findByRole("heading", { name: "단계 편집: 가닥 A" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "합류 합류 선택" }));
    expect(await screen.findByRole("group", { name: "노드 편집: 합류" })).toBeInTheDocument();
  });

  it("조회자는 편집 컨트롤 없이 보기만 한다", async () => {
    open(url(4, V4), serverAs("viewer"));
    await screen.findByRole("heading", { level: 1, name: /P-004 공정 v1/ }, slow);
    await screen.findByRole("table", { name: "노드" }, slow);
    await waitFor(() => expect(screen.getByText(/내 역할: 조회자/)).toBeInTheDocument(), slow);
    expect(screen.queryByRole("button", { name: "노드 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "간선 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^노드 .* 삭제$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "노드 합류 보기" })).toBeInTheDocument();
  });
});

describe("노드 편집", () => {
  it("합류 노드 이름을 바꾸면 노드·간선 id는 그대로 저장된다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    const before = structuredClone(graphOf(server));
    await user.click(screen.getByRole("button", { name: "노드 합류 편집" }));
    const name = screen.getByLabelText("노드 이름");
    await user.clear(name);
    await user.type(name, "새 합류");
    expect(screen.getByText(/저장하지 않은 변경이 있습니다/)).toBeInTheDocument();
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const body = putBody(server);
    expect(body.edges).toEqual(before.edges);
    expect(body.nodes.map((n) => n.id)).toEqual(before.nodes.map((n) => n.id));
    expect(body.nodes.find((n) => n.kind === "join")!.label).toBe("새 합류");
    expect(server.writes().at(-1)!.headers["If-Match"]).toBe('"2"');
  });

  it("끝 노드에는 저장·도킹 공간만 지정할 수 있고 비우면 위치 미정이다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    await user.click(screen.getByRole("button", { name: "노드 완제품 편집" }));
    const select = screen.getByLabelText("노드 공간") as HTMLSelectElement;
    const options = within(select).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
    expect(options[0]).toBe("");
    // 설비 자산은 선택지에 없다(저장·도킹 공간만)
    expect(options.slice(1).every((v) => v.startsWith("aaaaaaaa-"))).toBe(true);
    expect(within(select).queryByRole("option", { name: /EQ-001/ })).not.toBeInTheDocument();
    await user.selectOptions(select, within(select).getByRole("option", { name: /ST-041/ }) as HTMLOptionElement);
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(putBody(server).nodes.find((n) => n.kind === "sink")!.asset_id).toMatch(/^aaaaaaaa-/);
  });

  it("합류 노드에는 설비·공간을 직접 지정하지 않는다는 안내만 있다", async () => {
    const user = userEvent.setup();
    open(url(4, V4));
    await ready();
    await user.click(screen.getByRole("button", { name: "노드 합류 편집" }));
    expect(screen.queryByLabelText("노드 공간")).not.toBeInTheDocument();
    expect(screen.getByText(/설비·공간을 직접 지정하지 않습니다/)).toBeInTheDocument();
  });

  it("노드 이름을 비우면 오류이고 저장하지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    await user.click(screen.getByRole("button", { name: "노드 합류 편집" }));
    await user.clear(screen.getByLabelText("노드 이름"));
    expect(screen.getByLabelText("노드 이름")).toBeInvalid();
    expect(saveButton()).toBeDisabled();
    expect(server.writes()).toHaveLength(0);
  });

  it("표시 순서를 바꾸면 단계 표 순서도 바뀐다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    const labels = () => within(screen.getByRole("table", { name: /공정 v1 단계/ })).getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    expect(labels()[0]).toContain("가닥 A");
    await user.click(screen.getByRole("button", { name: "노드 가닥 A 아래로 이동" }));
    expect(labels()[0]).toContain("가닥 B");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(putBody(server).nodes.find((n) => n.label === "가닥 A")!.display_order).toBeGreaterThan(putBody(server).nodes.find((n) => n.label === "가닥 B")!.display_order);
  });
});

describe("노드 추가", () => {
  it("대기 공간 노드를 추가하면 연결 없이 맨 끝에 생기고 노드 편집이 열린다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    await user.selectOptions(screen.getByLabelText("새 노드 종류"), "buffer");
    expect(screen.getByText(/위치는 비워 둘 수 있습니다/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("새 노드 이름"), "임시 대기");
    await user.click(screen.getByRole("button", { name: "노드 추가" }));
    expect(await screen.findByRole("group", { name: "노드 편집: 임시 대기" })).toBeInTheDocument();
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const body = putBody(server);
    expect(body.nodes).toHaveLength(6);
    const added = body.nodes.find((n) => n.label === "임시 대기")!;
    expect(added.kind).toBe("buffer");
    expect(added.asset_id ?? null).toBeNull(); // 위치 미정
    expect(added.node_key).toMatch(/^buf-/);
    expect(body.edges).toHaveLength(5); // 간선을 임의로 만들지 않는다
    const warn = await screen.findByRole("alert", { name: "검증 결과" });
    expect(warn).toHaveTextContent("대기 공간의 위치가 미정입니다"); // 서버 검증이 경고한다
  });

  it("작업 노드를 추가하면 모두 미정인 단계로 시작하고 단계 편집이 열린다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    await user.type(screen.getByLabelText("새 노드 이름"), "검사");
    await user.click(screen.getByRole("button", { name: "노드 추가" }));
    expect(await screen.findByRole("heading", { name: "단계 편집: 검사" })).toBeInTheDocument();
    expect(screen.getByLabelText("처리 방식")).toHaveValue("unknown");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const added = putBody(server).nodes.find((n) => n.label === "검사")!;
    expect(added.kind).toBe("operation");
    expect(graphOf(server).nodes.find((n) => n.label === "검사")!.step!.timing_rule!.processing).toMatchObject({ kind: "unknown" });
  });

  it("이름이 없으면 추가할 수 없다", async () => {
    open(url(4, V4));
    await ready();
    expect(screen.getByRole("button", { name: "노드 추가" })).toBeDisabled();
  });
});

describe("간선 추가·수정", () => {
  it("노드를 이어 새 간선을 추가하면 새 id·키로 저장되고 기존 간선은 보존된다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    const before = structuredClone(graphOf(server));
    await user.selectOptions(screen.getByLabelText("새 간선 시작"), idOf(server, "원자재"));
    await user.selectOptions(screen.getByLabelText("새 간선 끝"), idOf(server, "합류"));
    await user.selectOptions(screen.getByLabelText("새 간선 종류"), "precedence");
    await user.click(screen.getByRole("button", { name: "간선 추가" }));
    expect(await screen.findByRole("group", { name: "간선 편집: 원자재 → 합류" })).toBeInTheDocument();
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const body = putBody(server);
    expect(body.edges).toHaveLength(6);
    const added = body.edges.find((e) => !before.edges.some((o) => o.id === e.id))!;
    expect(added).toMatchObject({ from_node_id: idOf(server, "원자재"), to_node_id: idOf(server, "합류"), edge_kind: "precedence" });
    expect(added.edge_key).toMatch(/^e-/);
    expect("movement_rule" in added).toBe(false);
    for (const e of before.edges) expect(body.edges.find((x) => x.id === e.id)).toEqual(e);
  });

  it("끝에서 나가는 물류·시작으로 들어오는 물류·같은 노드·중복 연결은 추가 버튼이 비활성이고 이유를 보여 준다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    const button = screen.getByRole("button", { name: "간선 추가" });
    expect(button).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("새 간선 시작"), idOf(server, "완제품"));
    await user.selectOptions(screen.getByLabelText("새 간선 끝"), idOf(server, "가닥 A"));
    expect(button).toBeDisabled();
    expect(screen.getByText(/끝\(완제품\) 노드에서 나가는 물류 간선/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("새 간선 시작"), idOf(server, "가닥 A"));
    await user.selectOptions(screen.getByLabelText("새 간선 끝"), idOf(server, "원자재"));
    expect(screen.getByText(/시작\(원자재\) 노드로 들어오는 물류 간선/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("새 간선 끝"), idOf(server, "가닥 A"));
    expect(screen.getByText(/같은 노드로 이어지는 간선/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("새 간선 끝"), idOf(server, "합류"));
    expect(screen.getByText(/이미 있습니다/)).toBeInTheDocument();
    // 선후 관계는 끝에서 나가도 된다
    await user.selectOptions(screen.getByLabelText("새 간선 시작"), idOf(server, "완제품"));
    await user.selectOptions(screen.getByLabelText("새 간선 종류"), "precedence");
    expect(screen.getByRole("button", { name: "간선 추가" })).toBeEnabled();
    expect(server.writes()).toHaveLength(0);
  });

  it("되돌아가는(순환) 연결은 막지 않고 저장할 수 있다(서버가 경고한다)", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    await user.selectOptions(screen.getByLabelText("새 간선 시작"), idOf(server, "합류"));
    await user.selectOptions(screen.getByLabelText("새 간선 끝"), idOf(server, "가닥 A"));
    await user.click(screen.getByRole("button", { name: "간선 추가" }));
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(graphOf(server).edges).toHaveLength(6);
  });

  it("이동 방식은 미정이 기본이고 고르면 이동 시간을 입력한다. 직결 공급도 시간을 0으로 채우지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    await user.click(screen.getByRole("button", { name: "간선 가닥 A → 합류 편집" }));
    expect(screen.getByLabelText("이동 방식")).toHaveValue("unknown");
    expect(screen.queryByLabelText("이동 시간 값")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("이동 방식"), "direct_feed");
    const group = screen.getByRole("radiogroup", { name: "이동 시간 상태" });
    expect(within(group).getByRole("radio", { name: "미정", checked: true })).toBeInTheDocument(); // 0분으로 채우지 않는다
    await user.selectOptions(screen.getByLabelText("이동 방식"), "manual_duration");
    await user.click(within(group).getByRole("radio", { name: "값 있음" }));
    await user.type(screen.getByLabelText("이동 시간 값"), "0");
    expect(screen.getByLabelText("이동 시간 값")).toBeValid(); // 0분은 유효하다
    await user.clear(screen.getByLabelText("이동 시간 값"));
    await user.type(screen.getByLabelText("이동 시간 값"), "5");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const edge = putBody(server).edges.find((e) => e.from_node_id === idOf(server, "가닥 A") && e.to_node_id === idOf(server, "합류"))!;
    expect(edge.movement_rule).toEqual({ mode: "manual_duration", duration_min: { mode: "known", value: "5" } });
    expect(within(edgeTable()).getByText("사람이 정한 이동 시간 · 5 분")).toBeInTheDocument();
  });

  it("이동 방식을 미정으로 되돌리면 이동 시간도 미정으로 비운다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    graphOf(server).edges[2]!.movement_rule = { mode: "manual_duration", duration_min: { mode: "known", value: "7" } };
    open(url(4, V4), server);
    await ready();
    await user.click(screen.getByRole("button", { name: "간선 가닥 A → 합류 편집" }));
    await user.selectOptions(screen.getByLabelText("이동 방식"), "unknown");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const edge = graphOf(server).edges[2]!;
    expect(edge.movement_rule).toMatchObject({ mode: "unknown", duration_min: { mode: "unknown", value: null } });
  });

  it("간선의 시작·끝·종류를 바꿀 수 있고 막아야 할 조합은 그 자리에서 안내한다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    await user.click(screen.getByRole("button", { name: "간선 합류 → 완제품 편집" }));
    await user.selectOptions(screen.getByLabelText("간선 종류"), "supply");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(graphOf(server).edges.find((e) => e.to_node_id === idOf(server, "완제품"))!.edge_kind).toBe("supply");
    // 끝 노드를 시작 노드로 바꾸면 물류 규칙 위반이므로 클라이언트가 미리 오류로 알린다(저장 불가)
    await user.click(screen.getByRole("button", { name: "간선 합류 → 완제품 편집" }));
    await user.selectOptions(screen.getByLabelText("간선 종류"), "material");
    await user.selectOptions(screen.getByLabelText("간선 끝"), idOf(server, "원자재"));
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent(/시작\(원자재\) 노드로 들어오는 물류 간선/);
    expect(saveButton()).toBeDisabled();
  });
});

describe("삭제는 영향을 먼저 보여 준다", () => {
  it("노드 삭제는 연결된 간선 목록을 보여 주고 확인 후에만 지우며 앞뒤를 자동으로 잇지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    const before = structuredClone(graphOf(server));
    await user.click(screen.getByRole("button", { name: "노드 합류 삭제" }));
    const dialog = await screen.findByRole("dialog", { name: "노드를 삭제할까요?" });
    expect(dialog).toHaveTextContent("연결된 간선 3개도 함께 지워지며, 앞뒤 노드를 자동으로 잇지 않습니다");
    expect(within(dialog).getByText("가닥 A → 합류")).toBeInTheDocument();
    expect(within(dialog).getByText("합류 → 완제품")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(within(nodeTable()).getAllByRole("row")).toHaveLength(6); // 취소하면 그대로
    await user.click(screen.getByRole("button", { name: "노드 합류 삭제" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "노드와 간선 삭제" }));
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const body = putBody(server);
    expect(body.nodes.map((n) => n.label)).toEqual(["원자재", "가닥 A", "가닥 B", "완제품"]);
    expect(body.edges).toHaveLength(2);
    expect(body.edges.every((e) => before.edges.some((o) => o.id === e.id))).toBe(true); // 새 간선을 만들지 않았다
  });

  it("작업 노드를 지우면 열려 있던 단계 편집도 닫힌다", async () => {
    const user = userEvent.setup();
    open(url(4, V4));
    await ready();
    await user.click(screen.getByRole("button", { name: "공정 단계 가닥 A 선택" }));
    await screen.findByRole("heading", { name: "단계 편집: 가닥 A" });
    await user.click(screen.getByRole("button", { name: "노드 가닥 A 삭제" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "노드와 간선 삭제" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "단계 편집: 가닥 A" })).not.toBeInTheDocument());
  });

  it("간선 삭제는 확인 후에만 반영된다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    await user.click(screen.getByRole("button", { name: "간선 원자재 → 가닥 B 삭제" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "취소" }));
    expect(within(edgeTable()).getAllByRole("row")).toHaveLength(6);
    await user.click(screen.getByRole("button", { name: "간선 원자재 → 가닥 B 삭제" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "간선 삭제" }));
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(graphOf(server).edges).toHaveLength(4);
  });
});

describe("서버 거부와 충돌", () => {
  it("서버가 간선 오류(VAL-GRAPH-004)를 거부하면 그 간선 행에 연결하고 아무것도 저장하지 않는다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "PUT"
        ? errorBody(422, "VALIDATION_ERROR", "그래프 구조가 올바르지 않습니다.", [
            { message: "서버: 이 연결은 허용되지 않습니다.", severity: "error", rule_id: "VAL-GRAPH-004", field_path: "/edges/2/from_node_id" },
          ])
        : std(req),
    );
    open(url(4, V4), server);
    await ready();
    await user.click(screen.getByRole("button", { name: "노드 합류 편집" }));
    await user.type(screen.getByLabelText("노드 이름"), "!");
    await user.click(saveButton());
    expect((await screen.findAllByText(/서버: 이 연결은 허용되지 않습니다/)).length).toBeGreaterThan(0);
    // 요청 본문의 edges[2] = 가닥 A → 합류 간선에 연결된다(순서 번호가 아니라 id). 이름을 "합류!"로 바꿨으므로 간선 이름도 따라간다.
    const row = within(edgeTable()).getByRole("button", { name: "간선 가닥 A → 합류! 편집" }).closest("tr")!;
    expect(row).toHaveTextContent("오류 1");
    expect(graphOf(server).nodes.find((n) => n.kind === "join")!.label).toBe("합류");
  });

  it("다른 사용자가 구조를 바꿨고 내가 구조를 바꿔 겹치면 자동으로 합치지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready();
    await user.type(screen.getByLabelText("새 노드 이름"), "내 대기");
    await user.selectOptions(screen.getByLabelText("새 노드 종류"), "buffer");
    await user.click(screen.getByRole("button", { name: "노드 추가" }));
    graphOf(server).edges = graphOf(server).edges.slice(0, 4); // 서버에서 간선이 지워졌다
    server.state.processes.versions.find((v) => v.id === V4)!.row_version = 6;
    await user.click(saveButton());
    await user.click(await screen.findByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    expect(await screen.findByText(/자동으로 합칠 수 없습니다/)).toBeInTheDocument();
    expect(server.writes().filter((w) => w.method === "PUT")).toHaveLength(1);
  });
});

describe("직선 공정에서도 같은 편집을 쓴다", () => {
  it("직선 공정에 분기를 만들면 직선이 아니게 되어 표의 구조 편집 버튼이 사라진다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready("P-001", 2);
    expect(screen.getByRole("button", { name: "단계 추가" })).toBeInTheDocument();
    expect(screen.queryByText("직선이 아닌 공정입니다")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("새 간선 시작"), idOf(server, "압출", V2));
    await user.selectOptions(screen.getByLabelText("새 간선 끝"), idOf(server, "완제품", V2));
    await user.click(screen.getByRole("button", { name: "간선 추가" }));
    expect(await screen.findByText("직선이 아닌 공정입니다")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "단계 추가" })).not.toBeInTheDocument();
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(graphOf(server, V2).edges).toHaveLength(5);
  });
});
