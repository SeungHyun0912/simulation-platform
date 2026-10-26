import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "../renderApp";

/**
 * 실제 서버 데이터로 공정 화면을 그려 보는 읽기 전용 통합 확인(GET만 호출, 아무것도 저장하지 않는다).
 *   $env:LIVE_API="http://127.0.0.1:8000/api/v1"; pnpm test:live
 * 시험 데이터 제품 P-001(승인본)·P-004(승인본 + 복사 초안)를 코드로 찾아 화면이 어댑터·표시 코드 변환을 거쳐 그려지는지 본다.
 * 쓰기 구역(`LIVE_WRITE=1`)은 화면 조작이 만든 요청을 실서버가 받아들이는지 P-006 하나의 초안으로 확인한다(승인은 하지 않는다).
 */
const LIVE = process.env.LIVE_API;
const WRITE = process.env.LIVE_WRITE === "1";
const ADMIN = "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a";
const PROJECT_A = "9985bf99-c375-58b0-a776-5a1cc5053585";
const slow = { timeout: 10_000 };

function realFetch(): typeof fetch {
  const base = (LIVE ?? "").replace(/\/+$/, "");
  return ((url: string, init: RequestInit = {}) =>
    fetch(url.startsWith("/api/v1") ? `${base}${url.slice("/api/v1".length)}` : url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), "X-Debug-User": ADMIN },
    })) as typeof fetch;
}

async function json<T>(path: string): Promise<T> {
  const r = await realFetch()(`/api/v1${path}`);
  return ((await r.json()) as { data: T }).data;
}

describe.skipIf(!LIVE)("실제 서버 데이터로 그린 공정 화면 (읽기 전용)", () => {
  it("P-001 승인본: 단계 표·다음 위치·원자재 단위·읽기 전용 상태가 서버 값으로 그려진다", async () => {
    const [p1] = (await json<{ id: string; code: string; current_process_version: { id: string } | null }[]>(`/projects/${PROJECT_A}/products?q=P-001`)).filter((p) => p.code === "P-001");
    renderApp(`/projects/${PROJECT_A}/products/${p1!.id}/processes/${p1!.current_process_version!.id}`, { source: "api", fetchImpl: realFetch() });
    const table = await screen.findByRole("table", { name: /P-001 공정 v1 단계/ }, slow);
    expect(within(table).getAllByRole("row").length).toBeGreaterThanOrEqual(3); // 단계 2 + 머리글
    expect(within(table).getAllByText(/30 m\/분/).length).toBeGreaterThan(0);
    // 설비 후보는 자산 id가 아니라 표시 코드로 보인다
    await waitFor(() => expect(within(table).getAllByText(/EQ-\d{3}/).length).toBeGreaterThan(0), slow);
    expect(screen.getByText(/서버에서 불러온 데이터입니다/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "단계 추가" })).not.toBeInTheDocument(); // 승인본은 읽기 전용
    expect(screen.getByRole("alert", { name: "검증 결과" })).toHaveTextContent(/원자재 기본 단위가 미정입니다/);
  });

  it("P-004 복사 초안: 승인본에서 복사된 그래프를 편집 가능한 초안으로 그린다", async () => {
    const [p4] = (await json<{ id: string; code: string; latest_process_version: { id: string; status: string } }[]>(`/projects/${PROJECT_A}/products?q=P-004`)).filter((p) => p.code === "P-004");
    expect(p4!.latest_process_version.status).toBe("draft");
    renderApp(`/projects/${PROJECT_A}/products/${p4!.id}/processes/${p4!.latest_process_version.id}`, { source: "api", fetchImpl: realFetch() });
    await screen.findByRole("heading", { level: 1, name: /P-004 공정 v2/ }, slow);
    await waitFor(() => expect(screen.getByText(/내 역할: 관리자/)).toBeInTheDocument(), slow);
    expect(await screen.findByText(/기준 버전: v1/, {}, slow)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "단계 추가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^저장/ })).toBeDisabled(); // 변경 전에는 저장할 수 없다
  });

  it("공정이 없는 제품(P-005)의 상세는 공정 버전 빈 상태와 새 초안 버튼을 보여 준다", async () => {
    const [p5] = (await json<{ id: string; code: string }[]>(`/projects/${PROJECT_A}/products?q=P-005`)).filter((p) => p.code === "P-005");
    renderApp(`/projects/${PROJECT_A}/products/${p5!.id}`, { source: "api", fetchImpl: realFetch() });
    expect(await screen.findByText("공정 버전이 없습니다", {}, slow)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "새 초안 만들기" })).toBeEnabled(), slow); // 만들지는 않는다(읽기 전용 확인)
  });
});

describe.skipIf(!LIVE || !WRITE)("실제 서버: 화면 조작으로 저장·검토 요청·반려 (P-006 초안 하나)", () => {
  it("단계를 저장하면 서버가 받아들이고, 이어서 이름을 바꿔 다시 저장해도 ETag 연쇄가 이어지며, 검토 요청 후 반려로 초안에 돌아온다", async () => {
    const user = userEvent.setup();
    const [p6] = (await json<{ id: string; code: string }[]>(`/projects/${PROJECT_A}/products?q=P-006`)).filter((p) => p.code === "P-006");
    const list = await json<{ id: string; status: string }[]>(`/projects/${PROJECT_A}/products/${p6!.id}/process-versions`);
    let open = list.find((v) => v.status === "draft" || v.status === "in_review");
    if (!open) {
      // 열린 버전이 없으면 제품 화면의 "새 초안 만들기"로 만든다(화면 조작도 함께 확인)
      const { unmount } = renderApp(`/projects/${PROJECT_A}/products/${p6!.id}`, { source: "api", fetchImpl: realFetch() });
      const button = await screen.findByRole("button", { name: "새 초안 만들기" }, slow);
      await waitFor(() => expect(button).toBeEnabled(), slow);
      await user.click(button);
      await waitFor(async () => {
        open = (await json<{ id: string; status: string }[]>(`/projects/${PROJECT_A}/products/${p6!.id}/process-versions`)).find((v) => v.status === "draft");
        expect(open).toBeTruthy();
      }, slow);
      unmount();
    }
    expect(open!.status === "draft" || open!.status === "in_review").toBe(true);
    const versionId = open!.id;
    const graphOf = () => json<{ row_version: number; nodes: { kind: string; label: string; step: { resources: { candidates: { asset_id: string }[] }[] } | null }[] }>(`/projects/${PROJECT_A}/process-versions/${versionId}/graph`);

    renderApp(`/projects/${PROJECT_A}/products/${p6!.id}/processes/${versionId}`, { source: "api", fetchImpl: realFetch() });
    await screen.findByRole("heading", { level: 1, name: /P-006 공정 v/ }, slow);
    await waitFor(() => expect(screen.getByText(/내 역할: 관리자/)).toBeInTheDocument(), slow);

    // 검토 중으로 남아 있으면 먼저 반려해 초안으로 되돌린다(이전 실행 정리)
    if (open!.status === "in_review") {
      await user.click(await screen.findByRole("button", { name: "반려" }, slow));
      await user.click(await screen.findByLabelText("반려 사유"));
      await user.paste("[FE 시험] 정리");
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "반려" }));
      await screen.findByText(/반려했습니다/, {}, slow);
    }

    // 1) 단계가 없으면 추가하고 이름·설비를 정해 저장한다
    if ((await graphOf()).nodes.filter((n) => n.kind === "operation").length === 0) {
      await user.click(await screen.findByRole("button", { name: "단계 추가" }, slow));
      await user.click(await screen.findByLabelText("공정명"));
      await user.paste("[FE 시험] UI 단계");
      await user.click(screen.getByRole("button", { name: "자원 요구 추가" }));
      await user.click(await screen.findByLabelText(/EQ-001 /, {}, slow));
      await user.click(screen.getByRole("button", { name: /^저장/ }));
      await screen.findByText("공정을 저장했습니다.", {}, slow);
      const g = await graphOf();
      const op = g.nodes.find((n) => n.kind === "operation")!;
      expect(op.label).toBe("[FE 시험] UI 단계");
      expect(op.step!.resources[0]!.candidates).toHaveLength(1); // 자산 id로 저장된다
    }

    // 2) 이름을 바꿔 다시 저장한다(저장 응답의 새 버전을 If-Match로 이어 쓴다)
    const before = await graphOf();
    const op = before.nodes.find((n) => n.kind === "operation")!;
    // 이름이 같은 단계가 여러 개 남아 있을 수 있어 첫 번째(표의 첫 행)를 쓴다
    await user.click((await screen.findAllByRole("button", { name: `${op.label} 편집` }, slow))[0]!);
    const name = screen.getByLabelText("공정명");
    const next = op.label.endsWith("*") ? op.label.slice(0, -1) : `${op.label}*`;
    await user.clear(name);
    await user.click(name);
    await user.paste(next);
    await user.click(screen.getByRole("button", { name: /^저장/ }));
    await screen.findByText("공정을 저장했습니다.", {}, slow);
    const after = await graphOf();
    expect(after.row_version).toBe(before.row_version + 1);
    expect(after.nodes.find((n) => n.kind === "operation")!.label).toBe(next);

    // 3) 검토 요청 → 검토 중(수정 불가) → 반려 → 다시 초안
    await user.click(await screen.findByRole("button", { name: "검토 요청" }, slow));
    await screen.findByText("검토를 요청했습니다.", {}, slow);
    await waitFor(() => expect(screen.queryByRole("button", { name: "단계 추가" })).not.toBeInTheDocument(), slow);
    await user.click(await screen.findByRole("button", { name: "반려" }, slow));
    await user.click(await screen.findByLabelText("반려 사유"));
    await user.paste("[FE 시험] 반려 확인");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "반려" }));
    await screen.findByText(/반려했습니다/, {}, slow);
    expect(await screen.findByText(/반려 사유: \[FE 시험\] 반려 확인/, {}, slow)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "단계 추가" }, slow)).toBeInTheDocument();
  });

  it("화면 조작으로 합류 노드와 간선·이동 규칙을 추가해 저장하고, 삭제해 원래 구조로 정리한다", async () => {
    const user = userEvent.setup();
    const [p6] = (await json<{ id: string; code: string }[]>(`/projects/${PROJECT_A}/products?q=P-006`)).filter((p) => p.code === "P-006");
    const open = (await json<{ id: string; status: string }[]>(`/projects/${PROJECT_A}/products/${p6!.id}/process-versions`)).find((v) => v.status === "draft")!;
    type G = { row_version: number; nodes: { id: string; kind: string; label: string }[]; edges: { id: string; from_node_id: string; to_node_id: string; movement_rule?: { mode: string; duration_min: { mode: string; value?: string | null } } }[] };
    const graphOf = () => json<G>(`/projects/${PROJECT_A}/process-versions/${open.id}/graph`);
    const before = await graphOf();
    const sink = before.nodes.find((n) => n.kind === "sink")!;
    const lastEdge = before.edges.find((e) => e.to_node_id === sink.id)!;

    renderApp(`/projects/${PROJECT_A}/products/${p6!.id}/processes/${open.id}`, { source: "api", fetchImpl: realFetch() });
    await screen.findByRole("heading", { level: 1, name: /P-006 공정 v/ }, slow);
    await waitFor(() => expect(screen.getByText(/내 역할: 관리자/)).toBeInTheDocument(), slow);

    // 노드 추가(합류)
    await user.selectOptions(await screen.findByLabelText("새 노드 종류", {}, slow), "join");
    await user.click(screen.getByLabelText("새 노드 이름"));
    await user.paste("[FE 시험] UI 합류");
    await user.click(screen.getByRole("button", { name: "노드 추가" }));
    await screen.findByRole("group", { name: "노드 편집: [FE 시험] UI 합류" });

    // 간선 추가: 마지막 단계 → 합류 (이동 규칙 사람이 정한 1분), 합류 → 완제품
    const joinOption = within(screen.getByLabelText("새 간선 끝")).getByRole("option", { name: /\[FE 시험\] UI 합류/ }) as HTMLOptionElement;
    await user.selectOptions(screen.getByLabelText("새 간선 시작"), lastEdge.from_node_id);
    await user.selectOptions(screen.getByLabelText("새 간선 끝"), joinOption.value);
    await user.click(screen.getByRole("button", { name: "간선 추가" }));
    await screen.findByRole("group", { name: /^간선 편집: .* → \[FE 시험\] UI 합류$/ });
    await user.selectOptions(screen.getByLabelText("이동 방식"), "manual_duration");
    await user.click(within(screen.getByRole("radiogroup", { name: "이동 시간 상태" })).getByRole("radio", { name: "값 있음" }));
    await user.type(screen.getByLabelText("이동 시간 값"), "1");
    await user.selectOptions(screen.getByLabelText("새 간선 시작"), joinOption.value);
    await user.selectOptions(screen.getByLabelText("새 간선 끝"), sink.id);
    await user.click(screen.getByRole("button", { name: "간선 추가" }));
    await user.click(screen.getByRole("button", { name: /^저장/ }));
    await screen.findByText("공정을 저장했습니다.", {}, slow);

    const saved = await graphOf();
    expect(saved.row_version).toBe(before.row_version + 1);
    const join = saved.nodes.find((n) => n.kind === "join")!;
    expect(join.label).toBe("[FE 시험] UI 합류");
    expect(saved.edges).toHaveLength(before.edges.length + 2);
    expect(saved.edges.find((e) => e.to_node_id === join.id)!.movement_rule).toMatchObject({ mode: "manual_duration", duration_min: { mode: "known", value: "1" } });
    expect(await screen.findByText("직선이 아닌 공정입니다", {}, slow)).toBeInTheDocument();

    // 정리: 합류 노드를 지우면 연결된 간선도 함께 지워지고(앞뒤를 자동으로 잇지 않음) 원래 구조가 된다
    await user.click(screen.getByRole("button", { name: "노드 [FE 시험] UI 합류 삭제" }));
    const dialog = await screen.findByRole("dialog", { name: "노드를 삭제할까요?" });
    expect(dialog).toHaveTextContent("연결된 간선 2개");
    await user.click(within(dialog).getByRole("button", { name: "노드와 간선 삭제" }));
    await user.click(screen.getByRole("button", { name: /^저장/ }));
    await waitFor(async () => expect((await graphOf()).row_version).toBe(saved.row_version + 1), slow);
    const after = await graphOf();
    expect(after.nodes.map((n) => n.id)).toEqual(before.nodes.map((n) => n.id));
    expect(after.edges.map((e) => e.id).sort()).toEqual(before.edges.map((e) => e.id).sort());
  });
});
