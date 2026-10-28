import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, ME, P1, type FakeServer } from "../fakeApi";
import { scenarioId, scenarioVersionId } from "../fakeScenarios";
import { processProductId, processVersionId } from "../fakeProcess";
import { renderApp } from "../renderApp";

const slow = { timeout: 8000 };
const list = `/projects/${P1}/scenarios`;
const versionUrl = (n: number) => `${list}/versions/${scenarioVersionId(n)}`;

function open(path: string, server: FakeServer = createFakeServer()) {
  return { server, ...renderApp(path, { source: "api", fetchImpl: server.fetchImpl }) };
}
/** 화면의 역할은 /me의 프로젝트 역할에서 온다(서버 쓰기 판정은 state.role). 두 쪽을 함께 맞춘다. */
function asRole(role: "editor" | "viewer") {
  const server = createFakeServer((req, std) =>
    req.path === "/me" ? { status: 200, body: { data: { ...ME, projects: ME.projects.map((p) => (p.id === P1 ? { ...p, role } : p)) } } } : std(req),
  );
  server.state.role = role;
  return server;
}
const patches = (s: FakeServer) => s.writes().filter((w) => w.method === "PATCH" && w.path.includes("/scenario-versions/"));

/** 빈 초안(SC-B v1)에 제품 하나·도착 하나를 채운다. */
async function fillProduct(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "제품 추가" }));
  await user.selectOptions(screen.getByLabelText("제품 1 제품"), processProductId(1));
  await waitFor(() => expect(within(screen.getByLabelText("제품 1 공정 버전")).queryByRole("option", { name: /v1 \(승인\)/ })).toBeInTheDocument(), slow);
  await user.selectOptions(screen.getByLabelText("제품 1 공정 버전"), processVersionId(1));
  await user.click(screen.getByRole("button", { name: "제품 1 도착 추가" }));
  await user.clear(screen.getByLabelText("제품 1 도착 1 개수"));
  await user.type(screen.getByLabelText("제품 1 도착 1 개수"), "3");
  await user.type(screen.getByLabelText("제품 1 도착 1 길이(m)"), "100");
}

describe("API 모드: 시나리오 목록·생성·상세", () => {
  it("사이드 메뉴가 활성이고 목록은 서버 값(코드·최근 버전·상태)을 보여 준다", async () => {
    open(list);
    expect(screen.getByRole("link", { name: "시나리오" })).toHaveAttribute("href", list);
    expect(screen.getByRole("link", { name: "실행 결과" })).toHaveAttribute("href", `/projects/${P1}/runs`);
    const table = await screen.findByRole("table", { name: "시나리오 목록" }, slow);
    expect(within(table).getByRole("link", { name: "SC-A 시나리오 A 상세" })).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "SC-B 최근 버전 v1 열기" })).toBeInTheDocument();
    expect(screen.queryByText(/예시/)).not.toBeInTheDocument();
  });

  it("정적 모드에서는 예시 데이터 대신 서버 연동 전용 안내를 보인다", () => {
    renderApp(list, { source: "static" });
    expect(screen.getByText(/서버 연동 모드에서만 사용할 수 있습니다/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("조회자는 시나리오를 추가할 수 없다", async () => {
    open(list, asRole("viewer"));
    await screen.findByRole("table", { name: "시나리오 목록" }, slow);
    await waitFor(() => expect(screen.getByRole("button", { name: "시나리오 추가" })).toBeDisabled(), slow);
  });

  it("만들면 비어 있는 첫 초안의 편집 화면으로 이동한다", async () => {
    const user = userEvent.setup();
    const { server, router } = open(`${list}/new`);
    await screen.findByLabelText("표시 코드", {}, slow);
    expect(screen.getByRole("button", { name: "시나리오 만들기" })).toBeDisabled();
    await user.type(screen.getByLabelText("표시 코드"), "SC-NEW");
    await user.type(screen.getByLabelText("이름"), "새 시나리오");
    await user.click(screen.getByRole("button", { name: "시나리오 만들기" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/scenarios\/versions\//), slow);
    expect(server.writes().find((w) => w.path === `/projects/${P1}/scenarios`)!.body).toEqual({ code: "SC-NEW", name: "새 시나리오" });
  });

  it("코드가 중복이면(409) 코드 필드에 연결하고 이동하지 않는다", async () => {
    const user = userEvent.setup();
    const { router } = open(`${list}/new`);
    await screen.findByLabelText("표시 코드", {}, slow);
    await user.type(screen.getByLabelText("표시 코드"), "SC-A");
    await user.type(screen.getByLabelText("이름"), "중복");
    await user.click(screen.getByRole("button", { name: "시나리오 만들기" }));
    expect((await screen.findAllByText(/이미 사용 중인 코드입니다/, {}, slow)).length).toBeGreaterThan(0);
    expect(router.state.location.pathname).toBe(`${list}/new`);
    expect(screen.getByLabelText("이름")).toHaveValue("중복");
  });

  it("상세는 버전 목록을 보이고 승인본에서 새 초안을 만들면 그 초안 화면으로 간다", async () => {
    const user = userEvent.setup();
    const { server, router } = open(`${list}/${scenarioId(1)}`);
    const table = await screen.findByRole("table", { name: "시나리오 버전" }, slow);
    expect(within(table).getByRole("link", { name: "v1 열기" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "새 초안 만들기" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/scenarios\/versions\//), slow);
    const post = server.writes().find((w) => w.path.endsWith("/versions"))!;
    expect(post.body).toEqual({}); // 서버가 가장 최근 승인 버전을 복사한다
  });

  it("열린 초안이 있으면 새 초안 버튼이 막힌다(시나리오당 하나)", async () => {
    open(`${list}/${scenarioId(2)}`);
    const button = await screen.findByRole("button", { name: "새 초안 만들기" }, slow);
    await waitFor(() => expect(button).toBeDisabled(), slow);
    expect(screen.getByText(/열린 초안 v1이 있습니다/)).toBeInTheDocument();
  });
});

describe("API 모드: 시나리오 버전 편집", () => {
  it("제품·도착을 입력해 저장하면 바뀐 필드만 If-Match와 함께 보내고 assets는 보내지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(versionUrl(2));
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await fillProduct(user);
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("시나리오 버전을 저장했습니다.", {}, slow);
    const req = patches(server)[0]!;
    expect(req.headers["If-Match"]).toBe('"1"');
    expect(Object.keys(req.body)).toEqual(["products"]);
    expect(req.body.products[0]).toMatchObject({
      product_id: processProductId(1),
      process_version_id: processVersionId(1),
      priority: 1,
      arrivals: [{ at_min: "0", count: 3, length_m: "100", weight_kg: null, lot: null }],
    });
    expect(typeof req.body.products[0].arrivals[0].count).toBe("number");
    expect(server.state.scenarios.versions.find((v) => v.id === scenarioVersionId(2))!.row_version).toBe(2);
  });

  it("길이·무게가 모두 비면 저장할 수 없고 무게만 입력하면 length_m은 null로 간다", async () => {
    const user = userEvent.setup();
    const { server } = open(versionUrl(2));
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await fillProduct(user);
    await user.clear(screen.getByLabelText("제품 1 도착 1 길이(m)"));
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    expect(screen.getAllByText(/길이 또는 무게 중 하나는 입력/).length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText("제품 1 도착 1 무게(kg)"), "3300");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("시나리오 버전을 저장했습니다.", {}, slow);
    expect(patches(server)[0]!.body.products[0].arrivals[0]).toMatchObject({ length_m: null, weight_kg: "3300" });
  });

  it("종료 규칙을 고정 지평선으로 바꾸면 분을 요구하고 저장 본문에 담는다", async () => {
    const user = userEvent.setup();
    const { server } = open(versionUrl(2));
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await user.selectOptions(screen.getByLabelText("종료 방식"), "fixed_horizon");
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    await user.type(screen.getByLabelText("지평선(분)"), "1440");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("시나리오 버전을 저장했습니다.", {}, slow);
    expect(patches(server)[0]!.body).toEqual({ stopping_rule: { mode: "fixed_horizon", horizon_min: "1440" } });
  });

  it("다른 사용자가 먼저 수정했으면(412) 덮어쓰지 않고 충돌을 알리며, 다시 불러오면 서버 값으로 돌아간다", async () => {
    const user = userEvent.setup();
    const { server } = open(versionUrl(2));
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await user.type(screen.getByLabelText("메모"), "내 메모");
    // 다른 사용자가 먼저 저장
    const v = server.state.scenarios.versions.find((x) => x.id === scenarioVersionId(2))!;
    v.notes = "남의 메모";
    v.row_version = 5;
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByText(/다른 사용자가 먼저 수정했습니다/, {}, slow)).toBeInTheDocument();
    expect(v.notes).toBe("남의 메모");
    await user.click(screen.getByRole("button", { name: "최신 내용으로 다시 불러오기" }));
    await waitFor(() => expect(screen.getByLabelText("메모")).toHaveValue("남의 메모"), slow);
  });

  it("서버가 참조 오류(422 SCN-REF-002)를 주면 그 제품 줄의 공정 버전 필드에 표시한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "PATCH" && req.path.includes("/scenario-versions/")
        ? errorBody(422, "VALIDATION_ERROR", "참조가 올바르지 않습니다.", [{ severity: "error", rule_id: "SCN-REF-002", message: "서버: 승인되지 않은 공정 버전입니다.", field_path: "/products/0/process_version_id" }])
        : std(req),
    );
    open(versionUrl(2), server);
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await fillProduct(user);
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect((await screen.findAllByText(/서버: 승인되지 않은 공정 버전입니다/, {}, slow)).length).toBeGreaterThan(0);
    expect(screen.getByLabelText("제품 1 공정 버전")).toHaveAccessibleDescription(/서버: 승인되지 않은 공정 버전입니다/);
  });

  it("가정을 쓰면 사유가 필요하다고 알리고 운반 시간 0분을 값으로 보낸다", async () => {
    const user = userEvent.setup();
    const { server } = open(versionUrl(2));
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await fillProduct(user);
    await user.selectOptions(screen.getByLabelText("제품 1 설비 점유 정책"), "hold_for_operation");
    expect(screen.getAllByText(/가정을 썼으므로 사유를 입력하세요/).length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText("가정 사유"), "문서에 없는 정책");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("시나리오 버전을 저장했습니다.", {}, slow);
    const body = patches(server)[0]!.body;
    expect(body.assumption_reason).toBe("문서에 없는 정책");
    expect(body.products[0].assumptions.equipment_hold).toBe("hold_for_operation");
  });
});

describe("API 모드: 운반 자원·출력 대기 가정(0.15.0)", () => {
  it("빈 차 이동 분·출력 대기를 입력하면 가정으로 저장하고 사유를 요구하며, 음수는 막는다", async () => {
    const user = userEvent.setup();
    const { server } = open(versionUrl(2));
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await fillProduct(user);
    await user.type(screen.getByLabelText("제품 1 운반 자원 빈 차 이동(분)"), "-1");
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    expect(screen.getAllByText(/0 이상의 분을 입력하세요/).length).toBeGreaterThan(0);
    await user.clear(screen.getByLabelText("제품 1 운반 자원 빈 차 이동(분)"));
    await user.type(screen.getByLabelText("제품 1 운반 자원 빈 차 이동(분)"), "3");
    await user.selectOptions(screen.getByLabelText("제품 1 다음 공간이 가득 찰 때 설비 산출"), "hold");
    expect(screen.getAllByText(/가정을 썼으므로 사유를 입력하세요/).length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText("가정 사유"), "운반 자원 2대 공유");
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("시나리오 버전을 저장했습니다.", {}, slow);
    const a = patches(server)[0]!.body.products[0].assumptions;
    expect(a).toMatchObject({ carrier_empty_move_minutes: "3", out_release: "hold" });
  });

  it("정하지 않으면 두 값 모두 null로 보낸다(out_release는 서버 기본값 hold)", async () => {
    const user = userEvent.setup();
    const { server } = open(versionUrl(2));
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await fillProduct(user);
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("시나리오 버전을 저장했습니다.", {}, slow);
    expect(patches(server)[0]!.body.products[0].assumptions).toMatchObject({ carrier_empty_move_minutes: null, out_release: null });
  });
});

describe("API 모드: 최신 공정으로 갱신(0.14.0)", () => {
  /** P-001의 승인본을 v1 → v2로 바꿔 시나리오가 옛 공정 버전을 가리키게 한다 */
  const promoteV2 = (server: FakeServer) => {
    const vs = server.state.processes.versions;
    vs.find((v) => v.id === processVersionId(1))!.status = "superseded";
    vs.find((v) => v.id === processVersionId(2))!.status = "approved";
  };

  it("승인본에서 '새 초안을 만들어 최신 공정으로 갱신'하면 초안을 만들고 갱신한 뒤 그 초안에서 바뀐 내용을 보인다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    promoteV2(server);
    const { router } = open(versionUrl(1), server);
    await screen.findByRole("heading", { level: 1, name: /SC-A v1/ }, slow);
    await user.click(await screen.findByRole("button", { name: "새 초안을 만들어 최신 공정으로 갱신" }, slow));
    await waitFor(() => expect(router.state.location.pathname).not.toBe(versionUrl(1)), slow);
    const post = server.writes().find((w) => w.path.endsWith("/refresh"))!;
    expect(post.headers["If-Match"]).toBe('"1"');
    expect(post.body).toEqual({ assets: "latest" });
    const proc = await screen.findByRole("table", { name: "공정 버전 변경" }, slow);
    expect(proc).toHaveTextContent("새 승인본으로 바뀜");
    expect(proc).toHaveTextContent("v1");
    expect(proc).toHaveTextContent("v2");
    expect(screen.getByRole("table", { name: "자산 고정 변경" })).toHaveTextContent("ST-041");
    expect(screen.getByText(/공정 1개가 새 승인본으로 바뀌었고/)).toBeInTheDocument();
    // 갱신된 초안은 새 공정 버전을 가리킨다
    const draftId = router.state.location.pathname.split("/").pop()!;
    expect(server.state.scenarios.versions.find((v) => v.id === draftId)!.products[0]!.process_version_id).toBe(processVersionId(2));
  });

  it("초안에서는 바로 갱신하고, '기존 고정 유지'를 고르면 assets=keep으로 보낸다. 저장하지 않은 변경이 있으면 막는다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    const draft = server.state.scenarios.versions.find((v) => v.id === scenarioVersionId(2))!;
    draft.products = structuredClone(server.state.scenarios.versions.find((v) => v.id === scenarioVersionId(1))!.products);
    promoteV2(server);
    open(versionUrl(2), server);
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await user.type(screen.getByLabelText("메모"), "x");
    expect(screen.getByRole("button", { name: "최신 승인 공정으로 갱신" })).toBeDisabled();
    await user.clear(screen.getByLabelText("메모"));
    await user.selectOptions(screen.getByLabelText("자산 고정"), "keep");
    await user.click(screen.getByRole("button", { name: "최신 승인 공정으로 갱신" }));
    expect(await screen.findByRole("table", { name: "공정 버전 변경" }, slow)).toHaveTextContent("새 승인본으로 바뀜");
    expect(server.writes().find((w) => w.path.endsWith("/refresh"))!.body).toEqual({ assets: "keep" });
    expect(screen.getByText("자산 고정은 바뀌지 않았습니다.")).toBeInTheDocument();
    // 갱신 결과는 편집기가 서버 값으로 다시 시작해도 남는다
    expect(screen.getByRole("status", { name: "" }).textContent ?? "").toMatch(/최신 승인 공정·자산 버전으로 갱신했습니다/);
  });

  it("다른 사용자가 먼저 고쳤으면(412) 덮어쓰지 않고 충돌을 알린다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    open(versionUrl(2), server);
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    server.state.scenarios.versions.find((v) => v.id === scenarioVersionId(2))!.row_version = 7;
    await user.click(screen.getByRole("button", { name: "최신 승인 공정으로 갱신" }));
    expect(await screen.findByText(/다른 사용자가 먼저 수정했습니다/, {}, slow)).toBeInTheDocument();
  });

  it("조회자에게는 갱신 버튼이 없다", async () => {
    open(versionUrl(1), asRole("viewer"));
    await screen.findByRole("heading", { level: 1, name: /SC-A v1/ }, slow);
    await waitFor(() => expect(screen.queryByRole("button", { name: /최신 공정으로 갱신/ })).not.toBeInTheDocument(), slow);
  });
});

describe("API 모드: 사전검증·승인·실행 요청", () => {
  it("사전검증은 저장한 값을 서버에 묻고 오류를 그대로 보인다(저장 전에는 막힘)", async () => {
    const user = userEvent.setup();
    const { server } = open(versionUrl(2));
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await user.click(screen.getByRole("button", { name: "실행 사전검증" }));
    expect(await screen.findByText("아직 실행할 수 없습니다", {}, slow)).toBeInTheDocument();
    expect(screen.getAllByText(/제품이 없습니다/).length).toBeGreaterThan(0);
    expect(server.writes().some((w) => w.path.endsWith("/validate"))).toBe(true);
    // 입력을 바꾸면 이전 검증 결과는 사라지고 저장 전에는 검증할 수 없다
    await user.type(screen.getByLabelText("메모"), "x");
    expect(screen.queryByText("아직 실행할 수 없습니다")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "실행 사전검증" })).toBeDisabled();
  });

  it("사전검증 오류가 있는 초안을 승인하면 서버 사유를 그대로 보이고 승인되지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open(versionUrl(2));
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await user.click(screen.getByRole("button", { name: "승인" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "승인" }));
    expect((await screen.findAllByText(/제품이 없습니다/, {}, slow)).length).toBeGreaterThan(0);
    expect(server.state.scenarios.versions.find((v) => v.id === scenarioVersionId(2))!.status).toBe("draft");
  });

  it("채운 초안을 저장·승인하면 승인본이 되어 읽기 전용이 되고 실행을 요청할 수 있다", async () => {
    const user = userEvent.setup();
    const { server, router } = open(versionUrl(2));
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await fillProduct(user);
    await user.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("시나리오 버전을 저장했습니다.", {}, slow);
    await user.click(screen.getByRole("button", { name: "실행 사전검증" }));
    expect(await screen.findByText("실행할 수 있습니다", {}, slow)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "승인" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "승인" }));
    await screen.findByText(/시나리오 버전을 승인했습니다/, {}, slow);
    expect(screen.getByLabelText("메모")).toBeDisabled();
    expect(screen.getByText(/승인된 버전은 수정할 수 없습니다/)).toBeInTheDocument();
    // 실행 요청: seed·반복 번호
    await user.clear(screen.getByLabelText("seed"));
    await user.type(screen.getByLabelText("seed"), "42");
    await user.click(screen.getByRole("button", { name: "실행 요청" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/runs\/ffffffff-/), slow);
    const post = server.writes().find((w) => w.path === `/projects/${P1}/runs`)!;
    expect(post.body).toEqual({ scenario_version_id: scenarioVersionId(2), seed: 42, replicate_index: 0 });
    expect(post.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("승인은 관리자만: 편집자는 승인 버튼이 막힌다", async () => {
    open(versionUrl(2), asRole("editor"));
    await screen.findByRole("heading", { level: 1, name: /SC-B v1/ }, slow);
    await waitFor(() => expect(screen.getByRole("button", { name: "승인" })).toBeDisabled(), slow);
  });

  it("조회자는 초안을 수정할 수 없고 승인본은 실행 요청도 못 한다", async () => {
    open(versionUrl(1), asRole("viewer"));
    await screen.findByRole("heading", { level: 1, name: /SC-A v1/ }, slow);
    await waitFor(() => expect(screen.getByRole("button", { name: "실행 요청" })).toBeDisabled(), slow);
  });

  it("실행 요청마다 Idempotency-Key 헤더가 붙는다", async () => {
    const user = userEvent.setup();
    const { server, router } = open(versionUrl(1));
    await screen.findByRole("heading", { level: 1, name: /SC-A v1/ }, slow);
    await user.click(await screen.findByRole("button", { name: "실행 요청" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/runs\//), slow);
    const post = server.writes().find((w) => w.path === `/projects/${P1}/runs`)!;
    expect(post.headers["Idempotency-Key"]).toMatch(/\S{8,}/);
    expect(post.body).toEqual({ scenario_version_id: scenarioVersionId(1), seed: 0, replicate_index: 0 });
  });
});
