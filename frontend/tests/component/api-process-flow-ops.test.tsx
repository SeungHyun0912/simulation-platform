import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, P1, type FakeServer } from "../fakeApi";
import { processProductId, processVersionId } from "../fakeProcess";
import { renderApp } from "../renderApp";

/** 플로우차트의 상태 전환(검토 요청·승인·반려·새 초안)과 단계 단위 저장(PATCH, 자동·수동). */
const slow = { timeout: 8000 };
const V5 = processVersionId(5);
const flow5 = `/projects/${P1}/products/${processProductId(5)}/flow`;
const flow1 = `/projects/${P1}/products/${processProductId(1)}/flow`;

function open(path: string, server: FakeServer = createFakeServer()) {
  return { server, ...renderApp(path, { source: "api", fetchImpl: server.fetchImpl }) };
}
const node = (name: string | RegExp) => screen.getByRole("button", { name });
const patches = (s: FakeServer) => s.writes().filter((w) => w.method === "PATCH" && w.path.includes("/steps/"));
const graphPuts = (s: FakeServer) => s.writes().filter((w) => w.method === "PUT" && w.path.endsWith("/graph"));
const versionOf = (s: FakeServer, id = V5) => s.state.processes.versions.find((v) => v.id === id)!;
const ready = (name: RegExp = /공정 단계 가닥 A/) => screen.findByRole("button", { name }, slow);
const stepB = (s: FakeServer) => s.state.processes.graphs[V5]!.nodes.find((n) => n.label.startsWith("가닥 B"))!;

describe("플로우차트: 상태 전환", () => {
  it("초안은 저장 후 검토 요청을 하고, 관리자는 검토 중인 버전을 승인한다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    await user.click(screen.getByRole("button", { name: "검토 요청" }));
    await waitFor(() => expect(versionOf(server).status).toBe("in_review"), slow);
    expect(await screen.findByRole("button", { name: "승인" }, slow)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "승인" }));
    await waitFor(() => expect(versionOf(server).status).toBe("approved"), slow);
  });

  it("관리자는 반려 사유를 적어 반려하고 버전은 초안으로 돌아간다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    versionOf(server).status = "in_review";
    open(flow5, server);
    await ready();
    await user.click(await screen.findByRole("button", { name: "반려" }, slow));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("반려 사유"), "설비 후보 확인 필요");
    await user.click(within(dialog).getByRole("button", { name: "반려" }));
    await waitFor(() => expect(versionOf(server).status).toBe("draft"), slow);
  });

  it("저장하지 않은 변경이 있으면 검토 요청이 막힌다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    open(flow5, server);
    await ready();
    await user.click(screen.getByLabelText("단계 변경 자동 저장")); // 자동 저장을 끄고 변경을 남긴다
    await user.click(node(/공정 단계 가닥 B/));
    await user.type(screen.getByLabelText("공정명"), "!");
    expect(screen.getByRole("button", { name: "검토 요청" })).toBeDisabled();
  });

  it("승인본에서 '이 버전으로 새 초안 만들기'는 그 버전을 기준으로 복사해 새 초안의 플로우차트로 이동한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    server.state.processes.versions = server.state.processes.versions.filter((v) => v.id !== processVersionId(2)); // 열린 초안 없음
    const { router } = open(`${flow1}?version=${processVersionId(1)}`, server);
    await ready(/공정 단계 압출/);
    await user.click(await screen.findByRole("button", { name: "이 버전으로 새 초안 만들기" }, slow));
    await waitFor(() => expect(router.state.location.search).toMatch(/^\?version=/), slow);
    expect(router.state.location.search).not.toBe(`?version=${processVersionId(1)}`);
    const post = server.writes().find((w) => w.method === "POST" && w.path.endsWith("/process-versions"))!;
    expect(post.body).toEqual({ base_version_id: processVersionId(1) });
    expect(await screen.findByRole("button", { name: "검토 요청" }, slow)).toBeInTheDocument(); // 새 초안은 편집 가능
  });

  it("이미 열린 버전이 있으면 새 초안 대신 그 버전을 여는 링크를 보인다", async () => {
    open(`${flow1}?version=${processVersionId(1)}`);
    await ready(/공정 단계 압출/);
    await waitFor(() => expect(screen.getByRole("button", { name: "이 버전으로 새 초안 만들기" })).toBeDisabled(), slow);
    expect(screen.getByRole("link", { name: "열린 버전(v2) 열기" })).toHaveAttribute("href", `${flow1}?version=${processVersionId(2)}`);
  });
});

describe("플로우차트: 단계 단위 저장(PATCH)", () => {
  it("자동 저장: 단계 이름을 고치고 잠시 기다리면 그 단계만 PATCH하고 그래프 전체는 보내지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    await user.click(node(/공정 단계 가닥 B/));
    await user.type(screen.getByLabelText("공정명"), "(수정)");
    expect(screen.getByRole("status", { name: "단계 저장 상태" })).toHaveTextContent(/잠시 뒤 이 단계만 자동으로 저장/);
    await waitFor(() => expect(patches(server)).toHaveLength(1), slow);
    const req = patches(server)[0]!;
    expect(req.path).toBe(`/projects/${P1}/process-versions/${V5}/steps/${stepB(server).id}`);
    expect(req.headers["If-Match"]).toBe('"2"');
    expect(req.body.label).toBe("가닥 B(수정)");
    expect(req.body.material_specs).toEqual(stepB(server).step!.material_specs); // 보낸 필드는 통째 교체이므로 그대로 보낸다
    expect(graphPuts(server)).toHaveLength(0);
    expect(await screen.findByText(/단계 "가닥 B\(수정\)"을\(를\) 저장했습니다/, {}, slow)).toBeInTheDocument();
    expect(stepB(server).label).toBe("가닥 B(수정)");
    expect(versionOf(server).row_version).toBe(3);
    // 입력을 이어 가면 다음 PATCH는 오른 버전으로 보낸다
    await user.type(screen.getByLabelText("공정명"), "2");
    await waitFor(() => expect(patches(server)).toHaveLength(2), slow);
    expect(patches(server)[1]!.headers["If-Match"]).toBe('"3"');
  });

  it("자동 저장 중에도 구조 변경은 남고, 나중에 '저장'하면 그래프 PUT이 단계 저장 뒤의 버전으로 간다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    await user.type(screen.getByLabelText("새 노드 이름"), "검사");
    await user.click(screen.getByRole("button", { name: "노드 추가" }));
    await user.click(node(/공정 단계 가닥 B/));
    await user.type(screen.getByLabelText("공정명"), "*");
    await waitFor(() => expect(patches(server)).toHaveLength(1), slow);
    expect(screen.getByText("● 저장하지 않은 변경이 있습니다")).toBeInTheDocument(); // 새 노드가 아직 남아 있다
    await user.click(screen.getByRole("button", { name: /^저장/ }));
    await waitFor(() => expect(graphPuts(server)).toHaveLength(1), slow);
    expect(graphPuts(server)[0]!.headers["If-Match"]).toBe('"3"');
    const g = server.state.processes.graphs[V5]!;
    expect(g.nodes.some((n) => n.label === "검사")).toBe(true);
    expect(g.nodes.some((n) => n.label === "가닥 B*")).toBe(true);
  });

  it("새로 추가한 단계는 PATCH하지 않고 공정 저장으로 저장하라고 안내한다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    await user.type(screen.getByLabelText("새 노드 이름"), "검사");
    await user.click(screen.getByRole("button", { name: "노드 추가" }));
    expect(await screen.findByRole("status", { name: "단계 저장 상태" })).toHaveTextContent(/공정과 함께 저장/);
    await user.type(screen.getByLabelText("공정명"), "2");
    await new Promise((r) => setTimeout(r, 1500));
    expect(patches(server)).toHaveLength(0);
  });

  it("다른 노드를 고르면 남은 단계 변경을 기다리지 않고 바로 저장한다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    await user.click(node(/공정 단계 가닥 B/));
    await user.type(screen.getByLabelText("공정명"), "!");
    await user.click(node(/공정 단계 가닥 A/));
    await waitFor(() => expect(patches(server)).toHaveLength(1), { timeout: 600 });
    expect(patches(server)[0]!.body.label).toBe("가닥 B!");
  });

  it("자동 저장을 끄면 '이 단계만 저장' 버튼으로 그 단계만 저장한다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    await user.click(screen.getByLabelText("단계 변경 자동 저장"));
    await user.click(node(/공정 단계 가닥 B/));
    await user.type(screen.getByLabelText("공정명"), "!");
    await new Promise((r) => setTimeout(r, 1500));
    expect(patches(server)).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "이 단계만 저장" }));
    await waitFor(() => expect(patches(server)).toHaveLength(1), slow);
    expect(stepB(server).label).toBe("가닥 B!");
  });

  it("입력 오류가 있으면 자동 저장하지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    await user.click(node(/공정 단계 가닥 B/));
    await user.clear(screen.getByLabelText("공정명")); // 이름이 비면 입력 오류
    expect(await screen.findByRole("status", { name: "단계 저장 상태" })).toHaveTextContent(/입력 오류를 고치면/);
    await new Promise((r) => setTimeout(r, 1500));
    expect(patches(server)).toHaveLength(0);
  });

  it("다른 사용자가 먼저 수정했으면(412) 자동 저장을 멈추고 충돌을 알린다(덮어쓰지 않음)", async () => {
    const user = userEvent.setup();
    const { server } = open(flow5);
    await ready();
    await user.click(node(/공정 단계 가닥 B/));
    versionOf(server).row_version = 9; // 다른 사용자가 먼저 저장
    await user.type(screen.getByLabelText("공정명"), "!");
    expect(await screen.findByText(/공정 버전: 다른 사용자가 먼저 수정했습니다/, {}, slow)).toBeInTheDocument();
    expect(screen.getByText(/단계 자동 저장을 멈췄습니다/)).toBeInTheDocument();
    expect(screen.getByLabelText("단계 변경 자동 저장")).not.toBeChecked();
    expect(stepB(server).label).toBe("가닥 B");
  });

  it("서버가 단계 저장을 거부하면(422) 사유를 보이고 자동 저장을 멈춘다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "PATCH" && req.path.includes("/steps/")
        ? errorBody(422, "VALIDATION_ERROR", "단계가 올바르지 않습니다.", [{ severity: "error", rule_id: "VAL-SPEC-005", message: "서버: 간선이 연결한 spec은 제거할 수 없습니다.", field_path: "/material_specs" }])
        : std(req),
    );
    open(flow5, server);
    await ready();
    await user.click(node(/공정 단계 가닥 B/));
    await user.type(screen.getByLabelText("공정명"), "!");
    expect((await screen.findAllByText(/서버: 간선이 연결한 spec은 제거할 수 없습니다/, {}, slow)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("단계 변경 자동 저장")).not.toBeChecked();
  });

  it("단계 저장 요청이 진행되는 동안 더 입력한 내용은 사라지지 않고, 다음 저장은 앞 저장이 끝난 뒤 오른 버전으로 간다(요청이 겹치지 않음)", async () => {
    const user = userEvent.setup();
    let release: (() => void) | null = null;
    let inFlight = 0;
    let peak = 0;
    const server = createFakeServer(async (req, std) => {
      if (req.method === "PATCH" && req.path.includes("/steps/")) {
        inFlight++;
        peak = Math.max(peak, inFlight);
        if (!release) await new Promise<void>((r) => (release = r)); // 첫 저장의 응답을 붙잡아 둔다
        inFlight--;
      }
      return std(req);
    });
    open(flow5, server);
    await ready();
    await user.click(node(/공정 단계 가닥 B/));
    await user.type(screen.getByLabelText("공정명"), "1");
    await waitFor(() => expect(patches(server)).toHaveLength(1), slow); // 첫 저장이 나갔고 응답 대기 중
    await user.type(screen.getByLabelText("공정명"), "2"); // 요청 중에 더 입력
    release!();
    await waitFor(() => expect(patches(server)).toHaveLength(2), slow);
    expect(screen.getByLabelText("공정명")).toHaveValue("가닥 B12"); // 요청 중 입력이 남아 있다
    expect(patches(server)[0]!.body.label).toBe("가닥 B1");
    expect(patches(server)[1]!.body.label).toBe("가닥 B12");
    expect(patches(server)[1]!.headers["If-Match"]).toBe('"3"'); // 앞 저장으로 오른 버전
    expect(peak).toBe(1); // 동시에 두 요청이 나가지 않았다
    await waitFor(() => expect(stepB(server).label).toBe("가닥 B12"), slow);
  });

  it("그래프 저장 중에 더 입력한 단계 내용도 사라지지 않는다", async () => {
    const user = userEvent.setup();
    let release: (() => void) | null = null;
    const server = createFakeServer(async (req, std) => {
      if (req.method === "PUT" && req.path.endsWith("/graph") && !release) await new Promise<void>((r) => (release = r));
      return std(req);
    });
    open(flow5, server);
    await ready();
    await user.click(screen.getByLabelText("단계 변경 자동 저장")); // 자동 저장 끔: 그래프 저장 경로만 본다
    await user.type(screen.getByLabelText("새 노드 이름"), "검사");
    await user.click(screen.getByRole("button", { name: "노드 추가" }));
    await user.click(screen.getByRole("button", { name: /^저장/ }));
    await waitFor(() => expect(graphPuts(server)).toHaveLength(1), slow);
    await user.click(node(/공정 단계 가닥 B/));
    await user.type(screen.getByLabelText("공정명"), "!"); // 저장 응답 전에 입력
    release!();
    await screen.findByText(/공정을 저장했습니다/, {}, slow);
    expect(screen.getByLabelText("공정명")).toHaveValue("가닥 B!");
    expect(screen.getByText("● 저장하지 않은 변경이 있습니다")).toBeInTheDocument();
  });

  it("초안이 아니면 자동 저장 선택이 보이지 않는다", async () => {
    open(`${flow1}?version=${processVersionId(1)}`);
    await ready(/공정 단계 압출/);
    expect(screen.queryByLabelText("단계 변경 자동 저장")).not.toBeInTheDocument();
  });
});
