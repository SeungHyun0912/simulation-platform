import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ASSETS, createFakeServer, errorBody, ME, P1, type FakeServer } from "../fakeApi";
import { renderApp } from "../renderApp";

const A1 = ASSETS[0]!.id; // EQ-001: 승인본 v1 + 초안 v2(row_version 2)
const A2 = ASSETS[1]!.id; // EQ-002: 버전 없음
const path = `/projects/${P1}/assets/${A1}`;

function open(server: FakeServer = createFakeServer(), at = path) {
  const app = renderApp(at, { source: "api", fetchImpl: server.fetchImpl });
  return { server, ...app };
}

/** 서버 역할을 바꾼 가짜 서버: /me의 역할(화면 노출)과 서버의 403 판정을 같이 맞춘다. */
function serverAs(role: "admin" | "editor" | "viewer", handler?: Parameters<typeof createFakeServer>[0]) {
  const server = createFakeServer((req, std) => {
    if (req.path === "/me")
      return { status: 200, body: { data: { ...ME, projects: ME.projects.map((p) => ({ ...p, role })) } } };
    return handler ? handler(req, std) : std(req);
  });
  server.state.role = role;
  return server;
}

const draftRev = (s: FakeServer) => s.state.revisions.find((r) => r.revision_no === 2)!;
const roleText = { admin: "관리자", editor: "편집자", viewer: "조회자" };

/** 상세·버전이 로드되고 역할이 적용되어 입력이 가능해질 때까지 기다린다. */
async function ready(role: keyof typeof roleText = "admin") {
  // 병렬 실행 중 첫 렌더가 느릴 수 있어 기본(1초)보다 넉넉히 기다린다.
  const slow = { timeout: 8000 };
  await screen.findByRole("heading", { level: 1, name: /EQ-001/ }, slow);
  await waitFor(() => expect(screen.getByText(new RegExp(`내 역할: ${roleText[role]}`))).toBeInTheDocument(), slow);
  await screen.findByLabelText("IN 이동 조건", {}, slow);
}

const saveRevision = () => screen.getByRole("button", { name: /^용량·규칙 저장/ });
const submitButton = () => screen.getByRole("button", { name: /^검토 요청/ });

async function setInCapacity(user: ReturnType<typeof userEvent.setup>, value: string) {
  const el = screen.getByLabelText("IN 대기 용량 값");
  await user.clear(el);
  await user.type(el, value);
}

describe("용량·규칙 저장 (PATCH /asset-revisions/{id})", () => {
  it("바꾼 용량만 보내고 If-Match는 편집을 시작한 버전 row_version이며 성공하면 다음 저장은 새 버전을 쓴다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    expect(saveRevision()).toBeDisabled(); // 변경 전에는 저장할 수 없다
    await setInCapacity(user, "6");
    await user.click(saveRevision());
    expect(await screen.findByText("용량·규칙을 저장했습니다.")).toBeInTheDocument();

    const rev = draftRev(server);
    const [first] = server.writes();
    expect(first).toMatchObject({ method: "PATCH", path: `/projects/${P1}/asset-revisions/${rev.id}` });
    expect(first!.headers["If-Match"]).toBe('"2"');
    // 포트는 port_id로 병합되므로 바꾼 포트·바꾼 필드만 보낸다(규칙·상태는 보내지 않는다).
    expect(first!.body).toEqual({
      ports: [{ port_id: rev.ports[0]!.port_id, buffer_capacity: { mode: "finite", value: "6", unit: "item" } }],
    });
    expect(rev.ports[0]!.buffer_capacity.value).toBe("6");
    expect(screen.queryByText(/용량·규칙에 저장하지 않은 변경/)).not.toBeInTheDocument();

    await setInCapacity(user, "7");
    await user.click(saveRevision());
    await waitFor(() => expect(server.writes()).toHaveLength(2));
    expect(server.writes()[1]!.headers["If-Match"]).toBe('"3"');
  });

  it("무제한·대기 불가·미정은 mode만 보내고 값·단위·status를 보내지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await user.click(within(screen.getByRole("radiogroup", { name: "IN 대기 용량 상태" })).getByRole("radio", { name: "무제한" }));
    await user.click(saveRevision());
    await screen.findByText("용량·규칙을 저장했습니다.");
    expect(server.writes()[0]!.body).toEqual({
      ports: [{ port_id: draftRev(server).ports[0]!.port_id, buffer_capacity: { mode: "unlimited" } }],
    });
  });

  it("규칙을 바꾸면 규칙 객체 전체를 보내고 용량은 보내지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await user.selectOptions(screen.getByLabelText("IN 이동 중 설비 예약"), "reserve");
    await user.click(saveRevision());
    await screen.findByText("용량·규칙을 저장했습니다.");
    expect(server.writes()[0]!.body).toEqual({
      ports: [
        {
          port_id: draftRev(server).ports[0]!.port_id,
          dispatch_rule: { mode: "when_destination_available", reservation: "reserve", wait_at_in_if_busy: true },
        },
      ],
    });
  });

  it("OUT 포트의 미정 규칙을 확정하면 D-U05·D-U06 시작값(미정 세부 값은 미정 그대로)으로 보낸다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await user.selectOptions(screen.getByLabelText("OUT 배출 조건"), "when_destination_accepts");
    await user.click(saveRevision());
    await screen.findByText("용량·규칙을 저장했습니다.");
    expect(server.writes()[0]!.body).toEqual({
      ports: [
        {
          port_id: draftRev(server).ports[1]!.port_id,
          release_rule: { mode: "when_destination_accepts", block_machine_while_waiting: "unknown" },
        },
      ],
    });
  });

  it("세부 값을 입력한 규칙을 미정으로 바꾸면 확인을 받고, 취소하면 값이 유지된다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await user.selectOptions(screen.getByLabelText("IN 이동 중 설비 예약"), "reserve");
    await user.selectOptions(screen.getByLabelText("IN 이동 조건"), "unknown");
    const dialog = await screen.findByRole("dialog", { name: "규칙을 미정으로 바꿀까요?" });
    await user.click(within(dialog).getByRole("button", { name: "취소" }));
    expect(screen.getByLabelText("IN 이동 중 설비 예약")).toHaveValue("reserve");
    await user.selectOptions(screen.getByLabelText("IN 이동 조건"), "unknown");
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "미정으로 변경" }));
    expect(screen.getByLabelText("IN 이동 조건")).toHaveValue("unknown");
    expect(server.writes()).toHaveLength(0); // 저장하기 전에는 서버에 아무것도 가지 않는다
  });

  it("저장 중에는 버튼이 비활성이고 연속 클릭해도 한 번만 보낸다", async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const server = createFakeServer(async (req, std) => {
      if (req.method === "PATCH") await gate;
      return std(req);
    });
    open(server);
    await ready();
    await setInCapacity(user, "9");
    await user.dblClick(saveRevision());
    expect(await screen.findByRole("button", { name: "저장 중…" })).toBeDisabled();
    release();
    await screen.findByText("용량·규칙을 저장했습니다.");
    expect(server.writes()).toHaveLength(1);
  });

  it("용량에 0을 넣으면 저장 버튼이 비활성이고 요청을 보내지 않는다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await setInCapacity(user, "0");
    expect(screen.getByLabelText("IN 대기 용량 값")).toBeInvalid();
    expect(saveRevision()).toBeDisabled();
    expect(server.writes()).toHaveLength(0);
  });

  it("저장하지 않은 변경이 있으면 검토 요청을 할 수 없다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    expect(submitButton()).toBeEnabled();
    await setInCapacity(user, "5");
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveAttribute("title", "먼저 저장해야 검토를 요청할 수 있습니다");
    expect(server.writes()).toHaveLength(0);
  });

  it("저장하면 서버가 다시 계산한 검증 결과가 갱신된다", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent("서버가 알려 준 경고");
    await user.selectOptions(screen.getByLabelText("OUT 배출 조건"), "when_destination_accepts");
    await user.click(saveRevision());
    await screen.findByText("용량·규칙을 저장했습니다.");
    // 화면이 계산하지 않고 저장 응답의 issues로 갱신한다(이전 경고가 사라진다)
    await waitFor(() => expect(screen.queryByText(/서버가 알려 준 경고/)).not.toBeInTheDocument());
  });
});

describe("버전 충돌(412)은 조용히 덮어쓰지 않는다", () => {
  it("내 변경 유지: 안 바꾼 항목은 서버 값으로 맞추고 바꾼 항목만 새 버전으로 저장한다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await setInCapacity(user, "6");
    // 다른 사용자가 OUT 배출 규칙을 확정하고 버전을 올렸다
    draftRev(server).ports[1]!.release_rule = { mode: "when_destination_accepts", block_machine_while_waiting: "yes" };
    draftRev(server).row_version = 5;
    await user.click(saveRevision());
    expect(await screen.findByText("용량 버전: 다른 사용자가 먼저 수정했습니다")).toBeInTheDocument();
    expect(screen.getByLabelText("IN 대기 용량 값")).toHaveValue("6"); // 입력은 사라지지 않았다
    expect(server.writes()).toHaveLength(1); // 거부된 요청 하나뿐

    await user.click(screen.getByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    await waitFor(() => expect(screen.getByLabelText("OUT 배출 조건")).toHaveValue("when_destination_accepts"));
    expect(screen.getByLabelText("IN 대기 용량 값")).toHaveValue("6");
    expect(screen.queryByText("용량 버전: 다른 사용자가 먼저 수정했습니다")).not.toBeInTheDocument();
    expect(server.writes()).toHaveLength(1); // 병합만 했고 저장은 사용자가 다시 눌러야 한다

    await user.click(saveRevision());
    await screen.findByText("용량·규칙을 저장했습니다.");
    const last = server.writes().at(-1)!;
    expect(last.headers["If-Match"]).toBe('"5"');
    expect(last.body).toEqual({
      ports: [{ port_id: draftRev(server).ports[0]!.port_id, buffer_capacity: { mode: "finite", value: "6", unit: "item" } }],
    });
    expect(draftRev(server).ports[1]!.release_rule).toEqual({ mode: "when_destination_accepts", block_machine_while_waiting: "yes" });
  });

  it("같은 항목을 둘 다 바꿨으면 내 값을 유지하되 서버 값이 바뀌었음을 알린다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await setInCapacity(user, "6");
    draftRev(server).ports[0]!.buffer_capacity = { mode: "finite", value: "8", unit: "item", status: "confirmed" };
    draftRev(server).row_version = 5;
    await user.click(saveRevision());
    await user.click(await screen.findByRole("button", { name: "내 변경을 유지하고 계속 편집" }));
    expect(await screen.findByText(/다른 사용자가 바꾼 값이 있습니다/)).toHaveTextContent("IN 대기 용량");
    expect(screen.getByLabelText("IN 대기 용량 값")).toHaveValue("6");
  });

  it("다시 불러오기: 내 입력을 버리고 서버 값을 보여 준다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await setInCapacity(user, "6");
    draftRev(server).ports[0]!.buffer_capacity = { mode: "finite", value: "8", unit: "item", status: "confirmed" };
    draftRev(server).row_version = 5;
    await user.click(saveRevision());
    await user.click(await screen.findByRole("button", { name: "최신 내용으로 다시 불러오기" }));
    await waitFor(() => expect(screen.getByLabelText("IN 대기 용량 값")).toHaveValue("8"));
    expect(screen.queryByText(/용량·규칙에 저장하지 않은 변경/)).not.toBeInTheDocument();
  });
});

describe("저장·전이 실패 처리", () => {
  it("초안이 아닌 버전(409 VERSION_IMMUTABLE)이면 저장하지 않고 상태를 서버와 맞춘다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await setInCapacity(user, "6");
    draftRev(server).status = "in_review"; // 다른 사용자가 검토를 요청했다
    await user.click(saveRevision());
    expect(await screen.findByText("상태가 바뀌어 저장할 수 없습니다")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/검토 중/).length).toBeGreaterThan(0));
    expect(draftRev(server).ports[0]!.buffer_capacity.value).toBe("4"); // 서버 값은 그대로
  });

  it("422는 request body의 ports 순서(index)로 포트를 찾아 해당 용량 입력에 표시한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "PATCH"
        ? errorBody(422, "VALIDATION_ERROR", "검증 실패", [
            { message: "서버: 이 용량은 허용되지 않습니다.", field_path: "/ports/0/buffer_capacity/value" },
          ])
        : std(req),
    );
    open(server);
    await ready();
    // OUT만 바꿔도 본문의 ports[0]은 OUT이다 → 응답의 /ports/0은 OUT(버전의 ports[0]=IN이 아니다)
    await user.click(within(screen.getByRole("radiogroup", { name: "OUT 대기 용량 상태" })).getByRole("radio", { name: "무제한" }));
    await user.click(saveRevision());
    const msg = await screen.findByText("서버: 이 용량은 허용되지 않습니다.");
    expect(within(screen.getByRole("group", { name: "OUT 대기 용량" })).getByText(msg.textContent!)).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "IN 대기 용량" })).queryByText(msg.textContent!)).not.toBeInTheDocument();
  });

  it("서버에 연결하지 못하면 저장 여부를 알 수 없다고 안내하고 입력을 유지한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) => {
      if (req.method === "PATCH") throw new TypeError("Failed to fetch");
      return std(req);
    });
    open(server);
    await ready();
    await setInCapacity(user, "6");
    await user.click(saveRevision());
    expect(await screen.findByText("서버에 연결하지 못했습니다")).toBeInTheDocument();
    expect(screen.getByLabelText("IN 대기 용량 값")).toHaveValue("6");
    expect(saveRevision()).toBeEnabled();
  });

  it("428은 화면 오류로만 안내한다(원인을 사용자에게 설명하지 않는다)", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "PATCH" ? errorBody(428, "PRECONDITION_REQUIRED", "If-Match 필요") : std(req),
    );
    open(server);
    await ready();
    await setInCapacity(user, "6");
    await user.click(saveRevision());
    expect(await screen.findByText("저장 요청에 문제가 있습니다")).toBeInTheDocument();
    expect(screen.queryByText(/If-Match/)).not.toBeInTheDocument();
  });
});

describe("검토 요청·승인·반려", () => {
  it("검토를 요청하면 If-Match와 함께 submit을 호출하고 검토 중이 된다(편집 불가)", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await user.click(submitButton());
    expect(await screen.findByText("검토를 요청했습니다.")).toBeInTheDocument();
    const w = server.writes()[0]!;
    expect(w.path).toBe(`/projects/${P1}/asset-revisions/${draftRev(server).id}/submit`);
    expect(w.headers["If-Match"]).toBe('"2"');
    expect(w.body).toBeUndefined();
    expect(draftRev(server).status).toBe("in_review");
    await waitFor(() => expect(screen.getByLabelText("IN 대기 용량 값")).toBeDisabled());
    expect(screen.queryByRole("button", { name: /^검토 요청/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "승인" })).toBeInTheDocument(); // 관리자
  });

  it("승인하면 이전 승인본이 대체됨이 되고 현재 승인본 표시가 바뀐다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await user.click(submitButton());
    await screen.findByText("검토를 요청했습니다.");
    await user.click(await screen.findByRole("button", { name: "승인" }));
    expect(await screen.findByText("승인했습니다.")).toBeInTheDocument();
    expect(server.writes()[1]!.path.endsWith("/approve")).toBe(true);
    expect(server.writes()[1]!.headers["If-Match"]).toBe('"3"'); // 제출 후의 버전
    expect(server.state.revisions.find((r) => r.revision_no === 1)!.status).toBe("superseded");
    expect(server.state.assets[0]!.current_revision!.revision_no).toBe(2);
    const history = await screen.findByRole("table", { name: /버전 이력/ });
    await waitFor(() => expect(within(history).getByText("대체됨")).toBeInTheDocument());
  });

  it("반려는 사유를 입력해야 하고 사유를 보낸다. 반려된 버전은 초안으로 돌아가 사유가 보인다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    draftRev(server).status = "in_review";
    open(server);
    await ready();
    await user.click(await screen.findByRole("button", { name: "반려" }));
    const dialog = await screen.findByRole("dialog", { name: "이 버전을 반려할까요?" });
    const confirm = within(dialog).getByRole("button", { name: "반려" });
    expect(confirm).toBeDisabled(); // 사유 없이는 반려할 수 없다
    await user.type(within(dialog).getByLabelText("반려 사유"), "   ");
    expect(confirm).toBeDisabled(); // 공백만으로는 안 된다
    await user.type(within(dialog).getByLabelText("반려 사유"), "OUT 용량 근거 부족");
    await user.click(confirm);
    expect(await screen.findByText(/반려했습니다/)).toBeInTheDocument();
    const w = server.writes()[0]!;
    expect(w.path.endsWith("/reject")).toBe(true);
    expect(w.body).toEqual({ reason: "OUT 용량 근거 부족" });
    expect(draftRev(server).status).toBe("draft");
    expect(await screen.findByText(/반려 사유: OUT 용량 근거 부족/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("반려 창을 닫으면 요청을 보내지 않고 다시 열면 입력이 비어 있다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    draftRev(server).status = "in_review";
    open(server);
    await ready();
    await user.click(await screen.findByRole("button", { name: "반려" }));
    await user.type(await screen.findByLabelText("반려 사유"), "임시");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "반려" }));
    expect(await screen.findByLabelText("반려 사유")).toHaveValue("");
    expect(server.writes()).toHaveLength(0);
  });

  it("편집자는 검토 요청만 보이고 승인·반려는 보이지 않는다", async () => {
    const server = serverAs("editor");
    draftRev(server).status = "in_review";
    open(server);
    await ready("editor");
    expect(screen.queryByRole("button", { name: "승인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "반려" })).not.toBeInTheDocument();
  });

  it("화면 역할이 오래되어 서버가 403을 주면 권한 없음 안내를 보이고 상태는 그대로다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer(); // 화면은 관리자, 서버는 편집자로 바뀐 상황
    server.state.role = "editor";
    draftRev(server).status = "in_review";
    open(server);
    await ready();
    await user.click(await screen.findByRole("button", { name: "승인" }));
    expect(await screen.findByText("저장할 권한이 없습니다")).toBeInTheDocument();
    expect(draftRev(server).status).toBe("in_review");
  });

  it("조회자는 입력이 읽기 전용이고 저장·검토 요청 버튼이 없다", async () => {
    const server = serverAs("viewer");
    open(server);
    await ready("viewer");
    expect(screen.getByLabelText("IN 대기 용량 값")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^용량·규칙 저장/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^검토 요청/ })).not.toBeInTheDocument();
    expect(server.writes()).toHaveLength(0);
  });

  it("이미 검토 중으로 바뀌었는데 요청하면(409) 상태가 바뀌었다고 안내하고 화면을 서버와 맞춘다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    draftRev(server).status = "in_review";
    await user.click(submitButton());
    expect(await screen.findByText("상태가 바뀌어 저장할 수 없습니다")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: /^검토 요청/ })).not.toBeInTheDocument());
  });
});

describe("새 초안", () => {
  it("버전이 없으면 '용량 설정 시작'으로 초안을 만들고 그 버전을 보여 준다", async () => {
    const user = userEvent.setup();
    const { server } = open(undefined, `/projects/${P1}/assets/${A2}`);
    await screen.findByRole("heading", { level: 1, name: /EQ-002/ });
    const start = await screen.findByRole("button", { name: "용량 설정 시작" });
    await waitFor(() => expect(start).toBeEnabled());
    await user.click(start);
    expect(await screen.findByText("새 초안을 만들었습니다.")).toBeInTheDocument();
    expect(server.writes()[0]).toMatchObject({ method: "POST", path: `/projects/${P1}/assets/${A2}/revisions` });
    expect(server.writes()[0]!.headers["If-Match"]).toBeUndefined();
    // 승인본이 없으면 용량은 모두 미정으로 시작한다(0이나 무제한으로 채우지 않는다)
    await waitFor(() => expect(screen.getAllByRole("radio", { name: "미정", checked: true })).toHaveLength(2)); // IN·OUT
    expect(screen.getAllByText(/초안/).length).toBeGreaterThan(0);
  });

  it("승인된 뒤 '새 초안 만들기'는 승인본 값을 복사해 시작한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    const rev = draftRev(server);
    rev.status = "approved";
    rev.approved_at = "2026-10-23T00:00:00Z";
    server.state.revisions.find((r) => r.revision_no === 1)!.status = "superseded";
    server.state.assets[0]!.current_revision = { id: rev.id, revision_no: 2, status: "approved", approved_at: rev.approved_at };
    server.state.assets[0]!.latest_revision = server.state.assets[0]!.current_revision;
    open(server);
    await ready();
    await user.click(await screen.findByRole("button", { name: "새 초안 만들기" }));
    expect(await screen.findByText("새 초안을 만들었습니다.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("IN 대기 용량 값")).toHaveValue("4")); // v2 승인본 값
    expect(screen.getByLabelText("IN 대기 용량 값")).toBeEnabled();
  });

  it("다른 사용자가 먼저 초안을 만들었으면(409 REVISION_DRAFT_EXISTS) 그 열린 버전으로 이동한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer();
    const rev = draftRev(server);
    rev.status = "approved";
    rev.approved_at = "2026-10-23T00:00:00Z";
    server.state.revisions.find((r) => r.revision_no === 1)!.status = "superseded";
    server.state.assets[0]!.current_revision = { id: rev.id, revision_no: 2, status: "approved", approved_at: rev.approved_at };
    server.state.assets[0]!.latest_revision = server.state.assets[0]!.current_revision;
    open(server);
    await ready();
    const button = await screen.findByRole("button", { name: "새 초안 만들기" });
    // 화면이 모르는 사이에 다른 사용자가 초안을 만들었다
    server.state.revisions.push({ ...structuredClone(rev), id: "dddddddd-0000-4000-8000-000000000099", revision_no: 3, status: "draft", approved_at: null, row_version: 1 });
    await user.click(button);
    expect(await screen.findByText("이미 열린 버전이 있어 그 버전으로 이동했습니다.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("버전")).toHaveValue("dddddddd-0000-4000-8000-000000000099"));
    expect(server.writes()).toHaveLength(1); // 재시도로 다시 만들지 않는다
  });

  it("조회자에게는 시작·새 초안 버튼이 없다", async () => {
    const server = serverAs("viewer");
    open(server, `/projects/${P1}/assets/${A2}`);
    await screen.findByRole("heading", { level: 1, name: /EQ-002/ });
    await screen.findByText("버전이 없습니다");
    await waitFor(() => expect(screen.getByText(/내 역할: 조회자/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "용량 설정 시작" })).not.toBeInTheDocument();
  });
});
