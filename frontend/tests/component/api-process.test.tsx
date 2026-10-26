import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, ME, P1, type FakeServer } from "../fakeApi";
import { processProductId, processVersionId } from "../fakeProcess";
import { renderApp } from "../renderApp";

const V1 = processVersionId(1); // P-001 v1 승인본
const V2 = processVersionId(2); // P-001 v2 초안(v1 복사), row_version 3
const V4 = processVersionId(4); // P-004 초안: 분기·합류(직선 아님)
const url = (productNo: number, versionId: string) => `/projects/${P1}/products/${processProductId(productNo)}/processes/${versionId}`;
const slow = { timeout: 8000 }; // 병렬 실행 중 첫 렌더가 느릴 수 있어 기본(1초)보다 넉넉히 기다린다.
const roleText = { admin: "관리자", editor: "편집자", viewer: "조회자" };

function open(path: string, server: FakeServer = createFakeServer()) {
  const app = renderApp(path, { source: "api", fetchImpl: server.fetchImpl });
  return { server, ...app };
}

function serverAs(role: "admin" | "editor" | "viewer", handler?: Parameters<typeof createFakeServer>[0]) {
  const server = createFakeServer((req, std) => {
    if (req.path === "/me") return { status: 200, body: { data: { ...ME, projects: ME.projects.map((p) => ({ ...p, role })) } } };
    return handler ? handler(req, std) : std(req);
  });
  server.state.role = role;
  return server;
}

async function ready(code = "P-001", versionNo = 2, role: keyof typeof roleText = "admin") {
  await screen.findByRole("heading", { level: 1, name: new RegExp(`${code} 공정 v${versionNo}`) }, slow);
  await waitFor(() => expect(screen.getByText(new RegExp(`내 역할: ${roleText[role]}`))).toBeInTheDocument(), slow);
  await screen.findByRole("table", { name: /단계/ }, slow);
}

const saveButton = () => screen.getByRole("button", { name: /^저장/ });
const graphOf = (s: FakeServer, id = V2) => s.state.processes.graphs[id]!;
const versionOf = (s: FakeServer, id = V2) => s.state.processes.versions.find((v) => v.id === id)!;
const puts = (s: FakeServer) => s.writes().filter((w) => w.method === "PUT");
const patches = (s: FakeServer) => s.writes().filter((w) => w.method === "PATCH");
const stepTable = () => screen.getByRole("table", { name: /공정 v\d+ 단계/ });

async function rename(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.click(screen.getByRole("button", { name: `${from} 편집` }));
  const name = screen.getByLabelText("공정명");
  await user.clear(name);
  await user.type(name, to);
}

describe("공정 조회 (API)", () => {
  it("서버의 공정을 단계 표로 보여 주고 자산 id를 표시 코드로 바꾼다", async () => {
    const { server } = open(url(1, V2));
    await ready();
    expect(screen.getByText(/서버에서 불러온 데이터입니다/)).toBeInTheDocument();
    const table = stepTable();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("EQ-001 (택1)")).toBeInTheDocument();
    expect(within(table).getByText("EQ-002 (택1)")).toBeInTheDocument();
    expect(within(table).getAllByText("20 m/분 (산출 기준)")).toHaveLength(2);
    expect(within(table).getByText("ST-041")).toBeInTheDocument();
    expect(within(table).getByText("공간 없음")).toBeInTheDocument();
    // 기준 버전(복사 원본) 표시
    expect(await screen.findByText(/기준 버전: v1/, {}, slow)).toBeInTheDocument();
    // 서버 검증(knowledge)은 서버 값 그대로
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("원자재 기본 단위가 미정입니다.");
    expect(server.writes()).toHaveLength(0);
  });

  it("설비·공간 목록이 50건을 넘어도 모든 페이지를 받아 선택지를 만든다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await user.click(screen.getByRole("button", { name: "압출 편집" }));
    // 60개 자산 중 설비 40개: 마지막 설비(EQ-040)까지 후보로 보인다
    expect(await screen.findByLabelText(/EQ-040/, {}, slow)).toBeInTheDocument();
    const assetCalls = server.requests.filter((r) => r.path === `/projects/${P1}/assets`);
    expect(assetCalls.length).toBeGreaterThanOrEqual(1);
    expect(assetCalls.every((r) => r.query.get("limit") === "200")).toBe(true);
  });

  it("없는 버전·다른 제품의 버전은 찾을 수 없음으로 표시한다", async () => {
    open(url(3, V2)); // V2는 제품 1의 버전
    expect((await screen.findAllByText("공정을 찾을 수 없습니다", {}, slow)).length).toBeGreaterThan(0);
  });
});

describe("공정 저장 (PUT graph, PATCH 단위)", () => {
  it("바꾼 단계가 있으면 그래프 전체를 If-Match(편집 시작 버전)와 함께 보내고 노드·간선 id를 보존한다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    expect(saveButton()).toBeDisabled();
    const before = structuredClone(graphOf(server));
    await rename(user, "압출", "압출(수정)");
    await user.click(saveButton());
    expect(await screen.findByText("공정을 저장했습니다.")).toBeInTheDocument();
    expect(patches(server)).toHaveLength(0); // 단위는 바뀌지 않았으므로 PATCH 없음
    const [put] = puts(server);
    expect(put!.path).toBe(`/projects/${P1}/process-versions/${V2}/graph`);
    expect(put!.headers["If-Match"]).toBe('"3"');
    expect(put!.body.nodes).toHaveLength(5);
    expect(put!.body.edges).toEqual(before.edges); // 간선 id·이동 규칙을 그대로 되돌려 보낸다
    expect(put!.body.nodes.map((n: { id: string }) => n.id)).toEqual(before.nodes.map((n) => n.id));
    expect(put!.body.nodes[1].label).toBe("압출(수정)");
    expect(graphOf(server).nodes[1]!.label).toBe("압출(수정)");
    expect(versionOf(server).row_version).toBe(4);

    await rename(user, "편조", "편조(수정)");
    await user.click(saveButton());
    await waitFor(() => expect(puts(server)).toHaveLength(2));
    expect(puts(server)[1]!.headers["If-Match"]).toBe('"4"'); // 저장 성공 후에는 새 버전을 쓴다
  });

  it("단위와 단계를 함께 바꾸면 단위 PATCH 후 그래프 PUT 순서로 보내고 새 버전을 이어 쓴다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await user.click(within(screen.getByRole("group", { name: "원자재 길이" })).getByRole("radio", { name: "값 있음" }));
    await user.type(screen.getByLabelText("원자재 길이 값"), "3000");
    await user.click(within(screen.getByRole("group", { name: "완제품 가닥 수" })).getByRole("radio", { name: "값 있음" }));
    await user.type(screen.getByLabelText("완제품 가닥 수 값"), "12");
    await rename(user, "편조", "편조(수정)");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const writes = server.writes();
    expect(writes.map((w) => w.method)).toEqual(["PATCH", "PUT"]);
    expect(writes[0]!.path).toBe(`/projects/${P1}/process-versions/${V2}`);
    expect(writes[0]!.headers["If-Match"]).toBe('"3"');
    // 바꾼 필드만 보낸다. 개수는 JSON 정수, 길이는 decimal 문자열
    expect(writes[0]!.body).toEqual({
      raw_unit_spec: { length_m: { mode: "known", value: "3000" } },
      finished_unit_spec: { strand_count: { mode: "known", value: 12 } },
    });
    expect(typeof writes[0]!.body.finished_unit_spec.strand_count.value).toBe("number");
    expect(writes[1]!.headers["If-Match"]).toBe('"4"'); // PATCH가 올린 버전을 이어 쓴다
    expect(versionOf(server).raw_unit_spec.length_m).toEqual({ mode: "known", value: "3000" });
    expect(versionOf(server).row_version).toBe(5);
  });

  it("단위는 저장됐는데 그래프가 거부되면 단위는 다시 보내지 않고 그래프 변경만 남긴다", async () => {
    const user = userEvent.setup();
    let reject = true;
    const server = createFakeServer((req, std) =>
      req.method === "PUT" && reject
        ? errorBody(422, "VALIDATION_ERROR", "그래프 구조가 올바르지 않습니다.", [
            { message: "서버: 이 노드는 저장할 수 없습니다.", field_path: "/nodes/3/label", severity: "error", rule_id: "VAL-REF-001" },
          ])
        : std(req),
    );
    open(url(1, V2), server);
    await ready();
    await user.click(within(screen.getByRole("group", { name: "원자재 길이" })).getByRole("radio", { name: "값 있음" }));
    await user.type(screen.getByLabelText("원자재 길이 값"), "3000");
    await rename(user, "편조", "편조(수정)");
    await user.click(saveButton());
    expect((await screen.findAllByText(/서버: 이 노드는 저장할 수 없습니다/)).length).toBeGreaterThan(0);
    // 요청 본문 index 3 = 편조 노드. 그 단계 행에 오류가 연결된다(순서 번호가 아니다)
    expect(within(stepTable()).getByText("편조(수정)").closest("tr")).toHaveTextContent("오류 1");
    expect(versionOf(server).raw_unit_spec.length_m?.mode).toBe("known"); // 단위는 저장됐다
    expect(graphOf(server).nodes[3]!.label).toBe("편조"); // 그래프는 저장되지 않았다
    expect(screen.getByText(/저장하지 않은 변경이 있습니다/)).toBeInTheDocument();

    reject = false;
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(patches(server)).toHaveLength(1); // 단위 PATCH는 한 번뿐
    expect(puts(server)).toHaveLength(2);
    expect(puts(server)[1]!.headers["If-Match"]).toBe('"4"');
  });

  it("개수는 JSON 정수로 보낸다(병렬 스트림 수)", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await user.click(screen.getByRole("button", { name: "압출 편집" }));
    const input = screen.getByLabelText("병렬 스트림 수 값");
    await user.clear(input);
    await user.type(input, "2");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const value = puts(server)[0]!.body.nodes[1].step.timing_rule.processing.parallel_streams.value;
    expect(value).toBe(2);
    expect(typeof value).toBe("number");
  });

  it("형식 오류가 있으면 저장 버튼이 비활성이고 요청을 보내지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await user.click(screen.getByRole("button", { name: "압출 편집" }));
    const speed = screen.getByLabelText("선속 값");
    await user.clear(speed);
    await user.type(speed, "0");
    expect(speed).toBeInvalid();
    expect(saveButton()).toBeDisabled();
    expect(saveButton()).toHaveAttribute("title", "오류를 해결해야 저장할 수 있습니다");
    expect(server.writes()).toHaveLength(0);
  });

  it("저장 중에는 버튼이 비활성이고 연속 클릭해도 한 번만 보낸다", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const server = createFakeServer(async (req, std) => {
      if (req.method === "PUT") await gate;
      return std(req);
    });
    open(url(1, V2), server);
    await ready();
    await rename(user, "압출", "Z");
    await user.dblClick(saveButton());
    expect(await screen.findByRole("button", { name: "저장 중…" })).toBeDisabled();
    release();
    await screen.findByText("공정을 저장했습니다.");
    expect(puts(server)).toHaveLength(1);
  });

  it("서버에 연결하지 못하면 저장 여부를 알 수 없다고 안내하고 입력을 유지한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) => {
      if (req.method === "PUT") throw new TypeError("Failed to fetch");
      return std(req);
    });
    open(url(1, V2), server);
    await ready();
    await rename(user, "압출", "내 이름");
    await user.click(saveButton());
    expect(await screen.findByText("서버에 연결하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByLabelText("공정명")).toHaveValue("내 이름");
    expect(saveButton()).toBeEnabled();
  });

  it("다른 곳에서 검토 요청됐다면(409 VERSION_IMMUTABLE) 저장하지 않고 상태를 서버와 맞춘다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await rename(user, "압출", "내 이름");
    versionOf(server).status = "in_review";
    await user.click(saveButton());
    expect(await screen.findByText("상태가 바뀌어 저장할 수 없습니다")).toBeInTheDocument();
    expect(graphOf(server).nodes[1]!.label).toBe("압출");
  });
});

describe("공정 구조 편집 (직선)", () => {
  it("단계를 추가하면 시작·끝 사이에 새 단계가 생기고 설비는 자산 id로 보낸다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    const before = structuredClone(graphOf(server));
    await user.click(screen.getByRole("button", { name: "단계 추가" }));
    const name = await screen.findByLabelText("공정명");
    await user.type(name, "검사");
    await user.click(screen.getByRole("button", { name: "자원 요구 추가" }));
    await user.click(await screen.findByLabelText(/EQ-003 /, {}, slow));
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const body = puts(server)[0]!.body;
    expect(body.nodes).toHaveLength(6);
    const added = body.nodes.find((n: { label: string }) => n.label === "검사");
    expect(added.kind).toBe("operation");
    expect(added.step.resources[0].candidates).toEqual([{ asset_id: expect.stringMatching(/^aaaaaaaa-/), eligibility_status: "unknown" }]);
    // 기존 노드 id는 그대로이고 기존 간선(이동 규칙 포함)도 보존된다
    for (const n of before.nodes) expect(body.nodes.some((x: { id: string }) => x.id === n.id)).toBe(true);
    expect(body.edges).toHaveLength(5);
    const kept = before.edges.filter((e) => body.edges.some((x: { id: string }) => x.id === e.id));
    expect(kept.length).toBeGreaterThanOrEqual(3);
    for (const e of kept) expect(body.edges.find((x: { id: string }) => x.id === e.id)).toEqual(e);
    expect(graphOf(server).nodes.filter((n) => n.kind === "operation")).toHaveLength(3);
  });

  it("단계를 지우면 그 단계의 다음 위치도 함께 지우고 앞뒤를 새 간선으로 잇는다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await user.click(screen.getByRole("button", { name: "압출 삭제" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "삭제" }));
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const body = puts(server)[0]!.body;
    expect(body.nodes.map((n: { kind: string }) => n.kind)).toEqual(["source", "operation", "sink"]);
    expect(body.edges).toHaveLength(2);
    expect(graphOf(server).nodes).toHaveLength(3);
  });

  it("순서를 바꾸면 노드의 display_order와 간선이 다시 만들어져 저장된다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await user.click(screen.getByRole("button", { name: "압출 아래로 이동" }));
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const labels = graphOf(server).nodes.map((n) => n.label);
    expect(labels.indexOf("편조")).toBeLessThan(labels.indexOf("압출"));
    expect(graphOf(server).nodes.map((n) => n.display_order)).toEqual([0, 1, 2, 3, 4]);
  });

  it("다음 위치를 '공간 없음'으로 바꾸면 대기 공간 노드가 지워진다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await user.click(screen.getByRole("button", { name: "압출 편집" }));
    await user.selectOptions(screen.getByLabelText("다음 위치"), "none");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(graphOf(server).nodes.some((n) => n.kind === "buffer")).toBe(false);
  });
});

describe("직선이 아닌 공정은 구조를 보존한다", () => {
  it("단계 내용만 고치면 노드·간선은 서버에서 받은 그대로 되돌려 보낸다(표의 구조 편집은 직선 전용)", async () => {
    const user = userEvent.setup();
    const { server } = open(url(4, V4));
    await ready("P-004", 1);
    expect(screen.getByText("직선이 아닌 공정입니다")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "단계 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "가닥 A 삭제" })).not.toBeInTheDocument(); // 단계 표의 삭제 버튼은 직선 전용
    expect(screen.getByRole("table", { name: "노드" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "간선" })).toBeInTheDocument();
    const before = structuredClone(graphOf(server, V4));
    await rename(user, "가닥 A", "가닥 A(수정)");
    expect(screen.queryByLabelText("다음 위치")).not.toBeInTheDocument(); // 직선 전용 "다음 위치"는 편집하지 않는다
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const body = puts(server)[0]!.body;
    expect(body.edges).toEqual(before.edges);
    expect(body.nodes.map((n: { id: string; kind: string }) => [n.id, n.kind])).toEqual(before.nodes.map((n) => [n.id, n.kind]));
    expect(body.nodes.find((n: { kind: string }) => n.kind === "join")).toBeTruthy(); // 합류 노드가 지워지지 않는다
  });
});

describe("버전 충돌(412)은 조용히 덮어쓰지 않는다", () => {
  it("내 변경 유지: 안 바꾼 단계는 서버 값으로 맞추고 바꾼 단계만 새 버전으로 저장한다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await rename(user, "압출", "내 압출");
    // 다른 사용자가 편조 단계 이름을 바꾸고 버전을 올렸다(구조는 그대로)
    graphOf(server).nodes[3]!.label = "서버 편조";
    versionOf(server).row_version = 7;
    await user.click(saveButton());
    expect(await screen.findByText("공정 버전: 다른 사용자가 먼저 수정했습니다")).toBeInTheDocument();
    expect(puts(server)).toHaveLength(1); // 거부된 요청 하나뿐
    expect(graphOf(server).nodes[1]!.label).toBe("압출");

    await user.click(screen.getByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    await waitFor(() => expect(within(stepTable()).getByText("서버 편조")).toBeInTheDocument());
    expect(within(stepTable()).getByText("내 압출")).toBeInTheDocument();
    expect(puts(server)).toHaveLength(1); // 병합만 했고 저장은 사용자가 다시 눌러야 한다

    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(puts(server)[1]!.headers["If-Match"]).toBe('"7"');
    expect(graphOf(server).nodes[1]!.label).toBe("내 압출");
    expect(graphOf(server).nodes[3]!.label).toBe("서버 편조");
  });

  it("같은 단계를 둘 다 바꿨으면 내 값을 유지하되 서버 값이 바뀌었음을 알린다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await rename(user, "압출", "내 압출");
    graphOf(server).nodes[1]!.label = "서버 압출";
    versionOf(server).row_version = 7;
    await user.click(saveButton());
    await user.click(await screen.findByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    expect(await screen.findByText(/다른 사용자가 바꾼 값이 있습니다/)).toHaveTextContent("단계 내 압출");
    expect(within(stepTable()).getByText("내 압출")).toBeInTheDocument();
  });

  it("서버가 구조를 바꿨고 내가 구조를 바꿔 겹치면 자동으로 합치지 않고 다시 불러오기만 가능하다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await user.click(screen.getByRole("button", { name: "단계 추가" }));
    // 다른 사용자가 단계를 지웠다(구조 변경)
    graphOf(server).nodes = graphOf(server).nodes.filter((n) => n.label !== "편조" && n.kind !== "sink");
    graphOf(server).edges = [];
    versionOf(server).row_version = 7;
    await user.type(await screen.findByLabelText("공정명"), "내 단계");
    await user.click(saveButton());
    await user.click(await screen.findByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    expect(await screen.findByText(/자동으로 합칠 수 없습니다/)).toBeInTheDocument();
    expect(puts(server)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "최신 내용으로 다시 불러오기" }));
    await waitFor(() => expect(screen.queryByText("공정 버전: 다른 사용자가 먼저 수정했습니다")).not.toBeInTheDocument());
    await waitFor(() => expect(within(stepTable()).queryByText("내 단계")).not.toBeInTheDocument());
  });

  it("다시 불러오기: 내 입력을 버리고 서버 값을 보여 준다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await rename(user, "압출", "내 압출");
    graphOf(server).nodes[3]!.label = "서버 편조";
    versionOf(server).row_version = 7;
    await user.click(saveButton());
    await user.click(await screen.findByRole("button", { name: "최신 내용으로 다시 불러오기" }));
    await waitFor(() => expect(within(stepTable()).getByText("서버 편조")).toBeInTheDocument());
    expect(within(stepTable()).queryByText("내 압출")).not.toBeInTheDocument();
    expect(screen.queryByText(/저장하지 않은 변경이 있습니다/)).not.toBeInTheDocument();
  });
});

describe("검토 요청·승인·반려", () => {
  it("검토 요청은 저장한 뒤에만 가능하고 If-Match와 함께 submit을 호출한다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await rename(user, "압출", "내 압출");
    const submit = screen.getByRole("button", { name: "검토 요청" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("title", "먼저 저장해야 검토를 요청할 수 있습니다");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    await user.click(screen.getByRole("button", { name: "검토 요청" }));
    expect(await screen.findByText("검토를 요청했습니다.")).toBeInTheDocument();
    const w = server.writes().at(-1)!;
    expect(w.path).toBe(`/projects/${P1}/process-versions/${V2}/submit`);
    expect(w.headers["If-Match"]).toBe('"4"');
    expect(versionOf(server).status).toBe("in_review");
    // 검토 중에는 수정할 수 없다
    await waitFor(() => expect(screen.getByText(/검토 중인 버전은 수정할 수 없습니다\. 승인되거나/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "단계 추가" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "승인" })).toBeInTheDocument(); // 관리자
  });

  it("승인하면 이전 승인본이 대체됨이 되고 제품의 현재 승인본이 바뀐다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await user.click(screen.getByRole("button", { name: "검토 요청" }));
    await screen.findByText("검토를 요청했습니다.");
    await user.click(await screen.findByRole("button", { name: "승인" }));
    expect(await screen.findByText("승인했습니다.")).toBeInTheDocument();
    expect(server.writes().at(-1)!.headers["If-Match"]).toBe('"4"'); // 제출 후의 버전
    expect(versionOf(server, V1).status).toBe("superseded");
    expect(versionOf(server).status).toBe("approved");
  });

  it("반려는 사유가 필수이고 사유를 보낸다. 반려된 버전은 초안으로 돌아가 사유가 보인다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    versionOf(server).status = "in_review";
    open(url(1, V2), server);
    await ready();
    await user.click(await screen.findByRole("button", { name: "반려" }));
    const dialog = await screen.findByRole("dialog", { name: "이 공정 버전을 반려할까요?" });
    const confirm = within(dialog).getByRole("button", { name: "반려" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("반려 사유"), "   ");
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText("반려 사유"), "설비 후보 근거 부족");
    await user.click(confirm);
    expect(await screen.findByText(/반려했습니다/)).toBeInTheDocument();
    const w = server.writes()[0]!;
    expect(w.path.endsWith("/reject")).toBe(true);
    expect(w.body).toEqual({ reason: "설비 후보 근거 부족" });
    expect(versionOf(server).status).toBe("draft");
    expect(await screen.findByText(/반려 사유: 설비 후보 근거 부족/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "단계 추가" })).toBeInTheDocument(); // 다시 편집할 수 있다
  });

  it("구조 오류가 있어 제출이 거부되면(422 PROCESS_VALIDATION_FAILED) 서버가 알려 준 항목을 단계에 연결해 보여 준다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) => {
      if (req.path.endsWith("/submit")) {
        const opId = std({ ...req, method: "GET", path: `/projects/${P1}/process-versions/${V2}/graph` });
        const graph = (opId.body as { data: { nodes: { id: string; kind: string }[] } }).data;
        const op = graph.nodes.find((n) => n.kind === "operation")!;
        return errorBody(422, "PROCESS_VALIDATION_FAILED", "구조 오류가 있어 제출할 수 없습니다.", [
          { message: "서버: 시작과 끝이 이어지지 않습니다.", severity: "error", rule_id: "VAL-GRAPH-002", entity_id: op.id, field_path: "/" },
        ]);
      }
      return std(req);
    });
    open(url(1, V2), server);
    await ready();
    await user.click(screen.getByRole("button", { name: "검토 요청" }));
    expect(await screen.findByText(/서버: 시작과 끝이 이어지지 않습니다/)).toBeInTheDocument();
    expect(within(stepTable()).getByText("압출").closest("tr")).toHaveTextContent("오류 1");
    expect(versionOf(server).status).toBe("draft");
  });

  it("편집자는 검토 요청만 보이고 승인·반려는 보이지 않는다", async () => {
    const server = serverAs("editor");
    versionOf(server).status = "in_review";
    open(url(1, V2), server);
    await ready("P-001", 2, "editor");
    expect(screen.queryByRole("button", { name: "승인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "반려" })).not.toBeInTheDocument();
  });

  it("화면 역할이 오래되어 서버가 403을 주면 권한 없음 안내를 보이고 상태는 그대로다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer(); // 화면은 관리자, 서버는 편집자로 바뀐 상황
    server.state.role = "editor";
    versionOf(server).status = "in_review";
    open(url(1, V2), server);
    await ready();
    await user.click(await screen.findByRole("button", { name: "승인" }));
    expect(await screen.findByText("저장할 권한이 없습니다")).toBeInTheDocument();
    expect(versionOf(server).status).toBe("in_review");
  });

  it("조회자는 입력이 읽기 전용이고 저장·검토 요청이 없다", async () => {
    const user = userEvent.setup();
    const server = serverAs("viewer");
    open(url(1, V2), server);
    await ready("P-001", 2, "viewer");
    expect(screen.queryByRole("button", { name: "단계 추가" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "검토 요청" })).not.toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "압출 보기" }));
    expect(screen.getByLabelText("공정명")).toBeDisabled();
    expect(server.writes()).toHaveLength(0);
  });
});

describe("검증 실행", () => {
  it("범위를 고르면 서버 검증을 호출하고 결과를 보여 준다(실행 가능 검증은 미정이 오류)", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    // 서버에서 한 단계의 처리 방식이 미정이 된 상태(저장된 값 기준 검증)
    graphOf(server).nodes[3]!.step!.timing_rule = { ...graphOf(server).nodes[3]!.step!.timing_rule, processing: { kind: "unknown" } };
    await user.click(screen.getByRole("button", { name: "검증 실행" }));
    expect(await screen.findByText(/지식 검증 결과: 오류 0건/)).toBeInTheDocument();
    expect(server.requests.at(-1)!.query.get("scope")).toBe("knowledge");
    await user.selectOptions(screen.getByLabelText("검증 범위"), "run_template");
    await user.click(screen.getByRole("button", { name: "검증 실행" }));
    const done = await screen.findByText(/실행 가능 검증 결과: 오류 [1-9]/);
    expect(done).toBeInTheDocument();
    expect(server.requests.at(-1)!.query.get("scope")).toBe("run_template");
    expect(server.writes().filter((w) => w.path.endsWith("/validate"))).toHaveLength(2); // 검증은 POST지만 상태는 바꾸지 않는다
    expect(versionOf(server).row_version).toBe(3);
  });

  it("저장하지 않은 변경이 있으면 검증을 막고 저장한 값을 검증한다고 안내한다", async () => {
    const user = userEvent.setup();
    open(url(1, V2));
    await ready();
    await rename(user, "압출", "내 압출");
    const button = screen.getByRole("button", { name: "검증 실행" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "저장한 값을 검증합니다. 먼저 저장하세요.");
  });

  it("엔진이 지원하지 않는 처리기는 저장은 되고 실행 가능 검증에서만 오류가 된다", async () => {
    const user = userEvent.setup();
    const { server } = open(url(1, V2));
    await ready();
    await user.click(screen.getByRole("button", { name: "압출 편집" }));
    const type = screen.getByLabelText("작업 종류(operation_type)");
    await user.clear(type);
    await user.type(type, "custom_handler");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다."); // 등록(저장)은 handler 지원 여부와 무관하다
    expect(graphOf(server).nodes[1]!.step!.operation_type).toBe("custom_handler");
    await user.selectOptions(screen.getByLabelText("검증 범위"), "run_template");
    await user.click(screen.getByRole("button", { name: "검증 실행" }));
    expect(await screen.findByText(/엔진이 지원하지 않는 처리기입니다: custom_handler/)).toBeInTheDocument();
  });
});

describe("새 초안", () => {
  async function asApprovedOnly() {
    const server = createFakeServer();
    versionOf(server, V2).status = "superseded"; // 열린 버전이 없는 상태
    return server;
  }

  it("승인본에서 '새 초안 만들기'를 누르면 서버가 그래프를 새 id로 복사하고 새 버전 화면으로 이동한다", async () => {
    const user = userEvent.setup();
    const server = await asApprovedOnly();
    const { router } = open(url(1, V1), server);
    await ready("P-001", 1);
    const button = await screen.findByRole("button", { name: "새 초안 만들기" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/processes\/[\w-]+$/));
    expect(router.state.location.pathname).not.toContain(V1);
    expect(server.writes()[0]).toMatchObject({ method: "POST", path: `/projects/${P1}/products/${processProductId(1)}/process-versions` });
    expect(server.writes()[0]!.headers["If-Match"]).toBeUndefined();
    await ready("P-001", 3);
    const created = server.state.processes.versions.at(-1)!;
    expect(created.base_version_id).toBe(V1);
    expect(created.status).toBe("draft");
    // v1의 노드 id를 재사용하지 않는다
    const ids = new Set(graphOf(server, V1).nodes.map((n) => n.id));
    expect(graphOf(server, created.id).nodes.every((n) => !ids.has(n.id))).toBe(true);
    expect(within(stepTable()).getByText("압출")).toBeInTheDocument();
  });

  it("다른 사용자가 먼저 초안을 만들었으면(409 PROCESS_DRAFT_EXISTS) 열린 버전으로 이동한다", async () => {
    const user = userEvent.setup();
    const server = await asApprovedOnly();
    const { router } = open(url(1, V1), server);
    await ready("P-001", 1);
    const button = await screen.findByRole("button", { name: "새 초안 만들기" });
    await waitFor(() => expect(button).toBeEnabled());
    versionOf(server, V2).status = "draft"; // 화면이 모르는 사이에 열린 버전이 생겼다
    await user.click(button);
    await waitFor(() => expect(router.state.location.pathname).toContain(V2));
    expect(server.writes()).toHaveLength(1); // 재시도로 다시 만들지 않는다
  });

  it("열린 버전이 있으면 새 초안 만들기는 비활성이고 열린 버전으로 가는 링크가 있다", async () => {
    open(url(1, V1));
    await ready("P-001", 1);
    expect(await screen.findByRole("link", { name: "열린 버전(v2) 열기" }, slow)).toHaveAttribute("href", expect.stringContaining(V2));
    expect(screen.getByRole("button", { name: "새 초안 만들기" })).toBeDisabled();
  });

  it("조회자에게는 새 초안 버튼이 없다", async () => {
    const server = serverAs("viewer");
    open(url(1, V1), server);
    await ready("P-001", 1, "viewer");
    expect(screen.queryByRole("button", { name: "새 초안 만들기" })).not.toBeInTheDocument();
  });
});
