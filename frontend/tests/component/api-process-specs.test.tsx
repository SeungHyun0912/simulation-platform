import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeServer, errorBody, P1, type FakeServer } from "../fakeApi";
import { materialIdOf } from "../fakeMaterials";
import { processProductId, processVersionId } from "../fakeProcess";
import { renderApp } from "../renderApp";

/**
 * 계약 0.6.0: 단계 재료 spec·간선 spec 연결·완제품 지정. 그래프 PUT은 전체 교체라서 화면이 새 필드를 보존하는지가 핵심이다.
 * 시드(P-005 v1 초안): 원자재 → 가닥 A(출력 out-1) → 가닥 B(입력 in-1, 간선이 연결) → 완제품 판정(milestone, 완제품 지정) → 완제품.
 */
const V5 = processVersionId(5);
const url = `/projects/${P1}/products/${processProductId(5)}/processes/${V5}`;
const slow = { timeout: 8000 };

function open(server: FakeServer = createFakeServer()) {
  const app = renderApp(url, { source: "api", fetchImpl: server.fetchImpl });
  return { server, ...app };
}

async function ready() {
  await screen.findByRole("heading", { level: 1, name: /P-005 공정 v1/ }, slow);
  await waitFor(() => expect(screen.getByText(/내 역할: 관리자/)).toBeInTheDocument(), slow);
  await screen.findByRole("table", { name: "노드" }, slow);
}

const saveButton = () => screen.getByRole("button", { name: /^저장/ });
const graphOf = (s: FakeServer) => s.state.processes.graphs[V5]!;
const puts = (s: FakeServer) => s.writes().filter((w) => w.method === "PUT");
const nodeId = (s: FakeServer, label: string) => graphOf(s).nodes.find((n) => n.label === label)!.id;
const specGroup = (name: string) => within(screen.getByRole("group", { name: `재료 spec ${name}` }));

describe("그래프 PUT은 새 필드를 지우지 않는다", () => {
  it("단계 이름만 고쳐도 완제품 지정·모든 단계의 재료 spec·간선 spec 연결이 그대로 저장된다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    const before = structuredClone(graphOf(server));
    await user.click(screen.getByRole("button", { name: "가닥 B 편집" }));
    const name = screen.getByLabelText("공정명");
    await user.clear(name);
    await user.type(name, "가닥 B(수정)");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const body = puts(server)[0]!.body;
    expect(body.completion_node_id).toBe(before.completion_node_id);
    const a = body.nodes.find((n: { label: string }) => n.label === "가닥 A");
    expect(a.step.material_specs).toEqual(before.nodes.find((n) => n.label === "가닥 A")!.step!.material_specs);
    expect(body.edges).toEqual(before.edges);
    // 서버 상태도 같다
    expect(graphOf(server).completion_node_id).toBe(before.completion_node_id);
    expect(graphOf(server).edges.find((e) => e.source_output_spec_key)).toMatchObject({ source_output_spec_key: "out-1", target_input_spec_key: "in-1" });
    expect(graphOf(server).nodes.find((n) => n.label === "가닥 A")!.step!.material_specs).toHaveLength(1);
  });

  it("그래프 구조(노드·간선)를 바꿔도 완제품 지정과 기존 spec 연결은 그대로다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await user.type(screen.getByLabelText("새 노드 이름"), "임시");
    await user.selectOptions(screen.getByLabelText("새 노드 종류"), "buffer");
    await user.click(screen.getByRole("button", { name: "노드 추가" }));
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(graphOf(server).completion_node_id).toBe(nodeId(server, "완제품 판정"));
    expect(graphOf(server).edges.filter((e) => e.source_output_spec_key)).toHaveLength(1);
  });
});

describe("완제품 지정", () => {
  it("milestone 노드 중에서 지정하고 미정으로 되돌릴 수 있으며 표·도식에 표시된다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    const select = screen.getByLabelText("완제품 판정 노드") as HTMLSelectElement;
    expect(select.value).toBe(nodeId(server, "완제품 판정"));
    expect(within(screen.getByRole("table", { name: "노드" })).getByText("완료 기준 · 완제품 지정")).toBeInTheDocument();
    await user.selectOptions(select, "");
    expect(within(screen.getByRole("table", { name: "노드" })).queryByText("완료 기준 · 완제품 지정")).not.toBeInTheDocument();
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(puts(server)[0]!.body.completion_node_id).toBeNull();
    expect(graphOf(server).completion_node_id).toBeNull();
    // 미정이면 서버가 경고한다(승인을 막지 않음)
    expect(await screen.findByText("완제품 판정 시점이 미정입니다.")).toBeInTheDocument();
  });

  it("새 완료 기준 노드를 추가해 지정하면 그 id로 저장된다. 지정한 노드를 지우면 지정도 풀린다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await user.selectOptions(screen.getByLabelText("새 노드 종류"), "milestone");
    await user.type(screen.getByLabelText("새 노드 이름"), "두 번째 판정");
    await user.click(screen.getByRole("button", { name: "노드 추가" }));
    const select = screen.getByLabelText("완제품 판정 노드") as HTMLSelectElement;
    const created = within(select).getByRole("option", { name: "두 번째 판정" }) as HTMLOptionElement;
    await user.selectOptions(select, created.value);
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(puts(server)[0]!.body.completion_node_id).toBe(created.value);
    expect(graphOf(server).completion_node_id).toBe(created.value);

    await user.click(screen.getByRole("button", { name: "노드 두 번째 판정 삭제" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "노드와 간선 삭제" }));
    expect((screen.getByLabelText("완제품 판정 노드") as HTMLSelectElement).value).toBe("");
    await user.click(saveButton());
    await waitFor(() => expect(puts(server)).toHaveLength(2));
    expect(puts(server)[1]!.body.completion_node_id).toBeNull();
  });

  it("서버가 milestone이 아닌 노드 지정을 거부하면(VAL-GRAPH-005) 안내하고 저장하지 않는다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "PUT"
        ? errorBody(422, "VALIDATION_ERROR", "그래프 구조가 올바르지 않습니다.", [
            { message: "서버: 완제품 지정은 완료 기준 노드여야 합니다.", severity: "error", rule_id: "VAL-GRAPH-005", field_path: "/completion_node_id" },
          ])
        : std(req),
    );
    open(server);
    await ready();
    await user.selectOptions(screen.getByLabelText("완제품 판정 노드"), "");
    await user.click(saveButton());
    expect((await screen.findAllByText(/서버: 완제품 지정은 완료 기준 노드여야 합니다/)).length).toBeGreaterThan(0);
    expect(graphOf(server).completion_node_id).toBe(nodeId(server, "완제품 판정"));
  });
});

describe("단계 재료 spec", () => {
  it("산출 재료의 상태·형태·길이·단위 수를 서버 값으로 보여 준다(섞지 않고 구분)", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(screen.getByRole("button", { name: "가닥 A 편집" }));
    const spec = specGroup("산출 1");
    expect(spec.getByLabelText("산출 1 형태")).toHaveValue("보빈");
    expect(spec.getByLabelText("산출 1 길이 값")).toHaveValue("1000");
    expect(spec.getByLabelText("산출 1 단위 수 값")).toHaveValue("2");
    expect(within(screen.getByRole("group", { name: "산출 1 중량" })).getByRole("radio", { name: "미정", checked: true })).toBeInTheDocument(); // 0이 아님
    expect(spec.getByLabelText("산출 1 수량 기준")).toHaveValue("per_operation");
    expect(screen.getByText("투입 0 · 산출 1")).toBeInTheDocument(); // 단계 표의 재료 spec 열
  });

  it("투입 재료를 추가해 3.3t × 11개처럼 중량과 단위 수를 따로 입력하고 재료 기준정보를 고르면 id로 저장된다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await user.click(screen.getByRole("button", { name: "가닥 A 편집" }));
    await user.click(screen.getByRole("button", { name: "투입 재료 추가" }));
    const spec = specGroup("투입 1");
    await user.selectOptions(spec.getByLabelText("투입 1 재료"), within(spec.getByLabelText("투입 1 재료")).getByRole("option", { name: /M-001/ }) as HTMLOptionElement);
    await user.type(spec.getByLabelText("투입 1 상태"), "원재료 상태");
    await user.click(within(screen.getByRole("group", { name: "투입 1 중량" })).getByRole("radio", { name: "값 있음" }));
    await user.type(screen.getByLabelText("투입 1 중량 값"), "3300");
    await user.click(within(screen.getByRole("group", { name: "투입 1 단위 수" })).getByRole("radio", { name: "값 있음" }));
    await user.type(screen.getByLabelText("투입 1 단위 수 값"), "11");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    const a = puts(server)[0]!.body.nodes.find((n: { label: string }) => n.label === "가닥 A");
    const added = a.step.material_specs.find((m: { direction: string }) => m.direction === "input");
    expect(added).toMatchObject({
      material_definition_id: materialIdOf(1),
      state_code: "원재료 상태",
      weight_kg: { mode: "known", value: "3300" },
      unit_count: { mode: "known", value: 11 },
      length_m: { mode: "unknown" }, // 입력하지 않은 값은 미정(0이 아님)
      strand_count: { mode: "unknown" },
    });
    expect(typeof added.unit_count.value).toBe("number");
    expect(added.spec_key).toMatch(/^in-/);
    // 기존 출력 spec은 그대로
    expect(a.step.material_specs.find((m: { spec_key: string }) => m.spec_key === "out-1")).toBeTruthy();
    expect(graphOf(server).nodes.find((n) => n.label === "가닥 A")!.step!.material_specs).toHaveLength(2);
  });

  it("개수에 소수·0을 넣으면 오류로 저장하지 못한다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await user.click(screen.getByRole("button", { name: "가닥 A 편집" }));
    await user.click(screen.getByRole("button", { name: "산출 재료 추가" }));
    await user.click(within(screen.getByRole("group", { name: "산출 2 가닥 수" })).getByRole("radio", { name: "값 있음" }));
    await user.type(screen.getByLabelText("산출 2 가닥 수 값"), "1.5");
    expect(screen.getByLabelText("산출 2 가닥 수 값")).toBeInvalid();
    expect(saveButton()).toBeDisabled();
    expect(server.writes()).toHaveLength(0);
  });

  it("간선이 연결한 spec은 지울 수 없고(연결을 먼저 풀어야 함) 연결이 없는 spec은 지울 수 있다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await user.click(screen.getByRole("button", { name: "가닥 A 편집" }));
    const del = screen.getByRole("button", { name: "재료 spec 산출 1 삭제" });
    expect(del).toBeDisabled();
    expect(screen.getByText(/간선에 연결된 spec입니다/)).toBeInTheDocument();
    // 연결을 풀면 지울 수 있다
    await user.click(screen.getByRole("button", { name: "간선 가닥 A → 가닥 B 편집" }));
    await user.selectOptions(screen.getByLabelText("출력 재료 연결 (시작 단계)"), "");
    await user.selectOptions(screen.getByLabelText("입력 재료 연결 (끝 단계)"), "");
    await user.click(screen.getByRole("button", { name: "가닥 A 편집" }));
    expect(screen.getByRole("button", { name: "재료 spec 산출 1 삭제" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "재료 spec 산출 1 삭제" }));
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(graphOf(server).nodes.find((n) => n.label === "가닥 A")!.step!.material_specs).toHaveLength(0);
    expect(graphOf(server).edges.every((e) => !e.source_output_spec_key && !e.target_input_spec_key)).toBe(true);
  });
});

describe("간선 spec 연결", () => {
  it("시작 단계의 출력 spec과 끝 단계의 입력 spec으로 연결하고 표에 보인다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    expect(within(screen.getByRole("table", { name: "간선" })).getByText("out-1 → in-1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "간선 가닥 A → 가닥 B 편집" }));
    expect(screen.getByLabelText("출력 재료 연결 (시작 단계)")).toHaveValue("out-1");
    expect(screen.getByLabelText("입력 재료 연결 (끝 단계)")).toHaveValue("in-1");
    // 출력 spec 선택지는 시작 단계의 출력만, 입력은 끝 단계의 입력만
    expect(within(screen.getByLabelText("출력 재료 연결 (시작 단계)")).getAllByRole("option").map((o) => (o as HTMLOptionElement).value)).toEqual(["", "out-1"]);
    expect(within(screen.getByLabelText("입력 재료 연결 (끝 단계)")).getAllByRole("option").map((o) => (o as HTMLOptionElement).value)).toEqual(["", "in-1"]);
    await user.selectOptions(screen.getByLabelText("출력 재료 연결 (시작 단계)"), "");
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(graphOf(server).edges.find((e) => e.target_input_spec_key)).toMatchObject({ source_output_spec_key: null, target_input_spec_key: "in-1" });
  });

  it("선후 관계로 바꾸면 연결이 풀리고, 끝점을 바꾸면 그쪽 연결이 풀린다", async () => {
    const user = userEvent.setup();
    const { server } = open();
    await ready();
    await user.click(screen.getByRole("button", { name: "간선 가닥 A → 가닥 B 편집" }));
    await user.selectOptions(screen.getByLabelText("간선 종류"), "precedence");
    expect(screen.getByText(/선후 관계 간선에는 재료를 연결할 수 없습니다/)).toBeInTheDocument();
    await user.click(saveButton());
    await screen.findByText("공정을 저장했습니다.");
    expect(graphOf(server).edges.every((e) => !e.source_output_spec_key && !e.target_input_spec_key)).toBe(true);
  });

  it("끝점이 단계가 아닌 간선(대기 공간·완료 기준 노드)에는 재료 연결 대신 안내를 보인다", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(screen.getByRole("button", { name: "간선 원자재 → 가닥 A 편집" }));
    expect(screen.getByLabelText("입력 재료 연결 (끝 단계)")).toBeInTheDocument(); // 끝 단계(가닥 A)에는 투입 spec이 없음
    expect(screen.getByText(/끝 단계에 투입 재료 spec이 없습니다/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "간선 가닥 B → 완제품 판정 편집" }));
    expect(screen.getByLabelText("출력 재료 연결 (시작 단계)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "간선 완제품 판정 → 완제품 편집" }));
    expect(screen.getByText(/단계에 직접 이어진 간선에만 합니다/)).toBeInTheDocument();
  });

  it("서버가 spec 연결 오류(VAL-SPEC-002)를 거부하면 그 간선 행에 연결한다", async () => {
    const user = userEvent.setup();
    const server = createFakeServer((req, std) =>
      req.method === "PUT"
        ? errorBody(422, "VALIDATION_ERROR", "spec 연결이 올바르지 않습니다.", [
            { message: "서버: 시작 단계의 출력 spec이어야 합니다.", severity: "error", rule_id: "VAL-SPEC-002", field_path: "/edges/1/source_output_spec_key" },
          ])
        : std(req),
    );
    open(server);
    await ready();
    await user.click(screen.getByRole("button", { name: "가닥 B 편집" }));
    const name = screen.getByLabelText("공정명");
    await user.type(name, "!");
    await user.click(saveButton());
    expect((await screen.findAllByText(/서버: 시작 단계의 출력 spec이어야 합니다/)).length).toBeGreaterThan(0);
    const row = within(screen.getByRole("table", { name: "간선" })).getByRole("button", { name: "간선 가닥 A → 가닥 B! 편집" }).closest("tr")!;
    expect(row).toHaveTextContent("오류 1");
  });
});
