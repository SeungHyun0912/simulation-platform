import { ApiError } from "../../src/shared/api/errors";
import {
  addStep,
  emptyStep,
  knownToCount,
  knownToDecimal,
  measureToKnown,
  moveStep,
  nextLocationOf,
  operationsInOrder,
  parseLinear,
  removeStep,
  setNextLocation,
  stepOf,
  updateStep,
  validateMeasure,
  type GraphDoc,
} from "../../src/features/processes/processDoc";
import {
  docChanged,
  draftChanged,
  mapGraphErrors,
  mapUnitErrors,
  mergeProcessDraft,
  toGraphIn,
  type ProcessDraft,
} from "../../src/features/processes/processDraft";
import {
  buildUnitSpecPatch,
  issuesByEntity,
  outputText,
  processingText,
  resourcesText,
  setupText,
  toUnitSpecEdit,
  validateStepInput,
  validateUnitSpec,
} from "../../src/features/processes/processView";
import { processVersionId, seedProcesses } from "../fakeProcess";

const seed = seedProcesses();
const linear = (): GraphDoc => structuredClone(seed.graphs[processVersionId(2)]!);
const branching = (): GraphDoc => structuredClone(seed.graphs[processVersionId(4)]!);
let counter = 0;
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

describe("측정값 어댑터: 미정은 0도 빈 값도 아니다", () => {
  it("known만 값이 되고 나머지 mode는 value를 보내지 않는다", () => {
    expect(measureToKnown({ mode: "known", value: "20" }, "m_per_min")).toEqual({ mode: "value", value: "20", unit: "m_per_min" });
    expect(measureToKnown({ mode: "unknown", value: null }, "m")).toEqual({ mode: "unknown", value: "", unit: "m" });
    expect(measureToKnown(undefined, "m")).toMatchObject({ mode: "unknown" });
    expect(knownToDecimal({ mode: "value", value: "20", unit: "m" })).toEqual({ mode: "known", value: "20" });
    expect(knownToDecimal({ mode: "unknown", value: "", unit: "m" })).toEqual({ mode: "unknown" });
    expect(knownToDecimal({ mode: "not_applicable", value: "", unit: "m" })).toEqual({ mode: "not_applicable" });
  });

  it("개수는 JSON 정수로 보내고 입력 중인 잘못된 값은 지우지 않고 보존한다", () => {
    expect(knownToCount({ mode: "value", value: "3", unit: "item" })).toEqual({ mode: "known", value: 3 });
    // 정수가 아닌 입력은 사라지지 않고 문자열 그대로 남아 저장 전 검증이 막는다
    expect((knownToCount({ mode: "value", value: "abc", unit: "item" }) as { value: unknown }).value).toBe("abc");
    expect((knownToCount({ mode: "value", value: "", unit: "item" }) as { value: unknown }).value).toBe("");
    expect(measureToKnown(knownToCount({ mode: "value", value: "1.5", unit: "item" }), "item").value).toBe("1.5");
  });

  it("형식 검사: 처리 시간은 0 초과, 준비 시간은 0 허용, 개수는 1 이상 정수", () => {
    const v = (value: string) => ({ mode: "value" as const, value, unit: "min" });
    expect(validateMeasure(v("0"), "positive")).toMatch(/0보다/);
    expect(validateMeasure(v("0"), "nonnegative")).toBeNull();
    expect(validateMeasure(v("0.000"), "nonnegative")).toBeNull();
    expect(validateMeasure(v("1.1234567"), "positive")).toMatch(/6자리/);
    expect(validateMeasure(v("007"), "positive")).toMatch(/선행 0/);
    expect(validateMeasure(v(""), "positive")).toMatch(/값을 입력/);
    expect(validateMeasure(v("0"), "count")).toMatch(/1 이상/);
    expect(validateMeasure(v("2.5"), "count")).toMatch(/정수/);
    expect(validateMeasure(v("12"), "count")).toBeNull();
    expect(validateMeasure({ mode: "unknown", value: "", unit: "min" }, "positive")).toBeNull();
  });
});

describe("단계 DTO: 알 수 없는 필드를 잃지 않는다", () => {
  it("stepOf는 빠진 필드를 미정으로 채우고 서버가 준 값은 그대로 둔다", () => {
    const n = linear().nodes.find((x) => x.kind === "operation")!;
    const s = stepOf(n);
    expect(s.timing_rule.processing).toMatchObject({ kind: "output_speed" });
    expect(stepOf({ ...n, step: null }).output_rule.mode).toBe("unknown");
    expect(emptyStep().timing_rule.setup.duration_min).toEqual({ mode: "unknown" });
  });

  it("updateStep은 지정한 단계만 바꾼다", () => {
    const doc = linear();
    const [a, b] = doc.nodes.filter((x) => x.kind === "operation");
    const next = updateStep(doc, a!.id, (s) => ({ ...s, operation_type: "inspection" }));
    expect(next.nodes.find((x) => x.id === a!.id)!.step!.operation_type).toBe("inspection");
    expect(next.nodes.find((x) => x.id === b!.id)).toEqual(b);
  });
});

describe("직선 그래프 구조", () => {
  it("source → (operation [buffer])+ → sink를 직선으로 읽는다", () => {
    const chain = parseLinear(linear())!;
    expect(chain.source?.kind).toBe("source");
    expect(chain.sink?.kind).toBe("sink");
    expect(chain.items.map((i) => i.op.label)).toEqual(["압출", "편조"]);
    expect(chain.items[0]!.buffer?.kind).toBe("buffer");
    expect(chain.items[1]!.buffer).toBeNull();
  });

  it("빈 문서는 단계 없는 직선이다. 분기·합류·정의되지 않은 간선은 직선이 아니다", () => {
    expect(parseLinear({ nodes: [], edges: [] })).toEqual({ source: null, items: [], sink: null });
    expect(parseLinear(branching())).toBeNull();
    const doc = linear();
    expect(parseLinear({ ...doc, edges: [...doc.edges, { ...doc.edges[0]!, id: "x", edge_kind: "precedence" }] })).toBeNull();
    expect(parseLinear({ ...doc, edges: doc.edges.slice(1) })).toBeNull(); // 고립 노드
    expect(parseLinear({ ...doc, edges: [...doc.edges, { ...doc.edges[0]!, id: "y", from_node_id: doc.nodes[4]!.id, to_node_id: doc.nodes[0]!.id }] })).toBeNull(); // 순환
    // 연속된 buffer(op → buf → buf → op)는 표로 표현할 수 없다
    const two = linear();
    const [buf1, op2] = [two.nodes[2]!, two.nodes[3]!];
    const buf2 = { ...buf1, id: "00000000-0000-4000-8000-0000000000b2", node_key: "buf2" };
    const edges = two.edges.map((e) => (e.from_node_id === buf1.id ? { ...e, from_node_id: buf2.id } : e));
    const chained: GraphDoc = {
      nodes: [...two.nodes, buf2],
      edges: [...edges, { ...two.edges[0]!, id: "00000000-0000-4000-8000-0000000000e9", edge_key: "e9", from_node_id: buf1.id, to_node_id: buf2.id }],
    };
    expect(op2.kind).toBe("operation");
    expect(parseLinear(chained)).toBeNull();
  });

  it("표 순서는 직선이면 연결 순서, 아니면 display_order 순이다", () => {
    expect(operationsInOrder(linear()).map((n) => n.label)).toEqual(["압출", "편조"]);
    expect(operationsInOrder(branching()).map((n) => n.label)).toEqual(["가닥 A", "가닥 B"]);
  });

  it("단계 추가·삭제·이동은 기존 노드·간선 id와 이동 규칙을 보존한다", () => {
    const doc = linear();
    const before = new Map(doc.edges.map((e) => [e.id, e]));
    const added = addStep(doc, newId)!;
    expect(parseLinear(added.doc)!.items).toHaveLength(3);
    const newOp = added.doc.nodes.find((n) => n.id === added.id)!;
    expect(newOp.kind).toBe("operation");
    expect(newOp.label).toBe(""); // 이름은 사용자가 입력(빈 이름은 저장 전 오류)
    expect(newOp.step).toMatchObject({ operation_type: null });
    for (const e of added.doc.edges.filter((x) => before.has(x.id))) expect(e).toEqual(before.get(e.id));
    // 마지막 단계(편조) 뒤에는 sink 간선이 있었으므로 새 단계 앞뒤 간선이 새로 생긴다
    expect(added.doc.edges.every((e) => e.edge_kind === "material")).toBe(true);
    expect(added.doc.nodes.map((n) => n.display_order)).toEqual(added.doc.nodes.map((_, i) => i));

    const moved = moveStep(doc, doc.nodes[1]!.id, 1, newId)!;
    expect(operationsInOrder(moved).map((n) => n.label)).toEqual(["편조", "압출"]);
    // 다음 위치(buffer)는 단계와 함께 움직인다
    expect(nextLocationOf(parseLinear(moved)!, doc.nodes[1]!.id)).toMatchObject({ kind: "asset" });
    expect(moveStep(doc, doc.nodes[1]!.id, -1, newId)).toEqual(doc); // 첫 단계는 위로 이동하지 않는다

    const removed = removeStep(doc, doc.nodes[1]!.id, newId)!;
    expect(operationsInOrder(removed).map((n) => n.label)).toEqual(["편조"]);
    expect(removed.nodes.some((n) => n.kind === "buffer")).toBe(false); // 지운 단계의 다음 위치도 함께 지운다
    expect(removed.edges).toHaveLength(removed.nodes.length - 1);
  });

  it("빈 문서에서 첫 단계를 추가하면 시작·끝 노드를 함께 만든다", () => {
    const r = addStep({ nodes: [], edges: [] }, newId)!;
    expect(r.doc.nodes.map((n) => n.kind)).toEqual(["source", "operation", "sink"]);
    expect(r.doc.edges).toHaveLength(2);
    expect(new Set(r.doc.nodes.map((n) => n.node_key)).size).toBe(3);
  });

  it("직선이 아니면 구조 편집은 하지 않는다(null)", () => {
    const doc = branching();
    expect(addStep(doc, newId)).toBeNull();
    expect(removeStep(doc, doc.nodes[1]!.id, newId)).toBeNull();
    expect(moveStep(doc, doc.nodes[1]!.id, 1, newId)).toBeNull();
    expect(setNextLocation(doc, doc.nodes[1]!.id, { kind: "none" }, newId)).toBeNull();
  });

  it("다음 위치: 공간 없음 / 위치 미정 / 특정 공간을 구분한다", () => {
    const doc = linear();
    const op = doc.nodes[3]!; // 편조: 뒤에 buffer 없음
    expect(nextLocationOf(parseLinear(doc)!, op.id)).toEqual({ kind: "none" });
    const unset = setNextLocation(doc, op.id, { kind: "unset" }, newId)!;
    expect(nextLocationOf(parseLinear(unset)!, op.id)).toEqual({ kind: "unset" });
    const buf = unset.nodes.find((n) => n.kind === "buffer" && n.asset_id === null)!;
    expect(buf.label).toBe("위치 미정");
    const placed = setNextLocation(unset, op.id, { kind: "asset", assetId: "a-1", label: "ST-1 공간" }, newId)!;
    expect(placed.nodes.find((n) => n.id === buf.id)).toMatchObject({ asset_id: "a-1", label: "ST-1 공간" }); // 같은 노드를 갱신한다
    const none = setNextLocation(placed, op.id, { kind: "none" }, newId)!;
    expect(none.nodes.some((n) => n.id === buf.id)).toBe(false);
  });
});

describe("단위(원자재·완제품) 저장 본문", () => {
  it("바꾼 필드만 보내고 확정값을 미정으로 되돌릴 때는 mode만 보낸다", () => {
    const base = toUnitSpecEdit(undefined);
    expect(buildUnitSpecPatch(base, { ...base })).toBeNull();
    expect(buildUnitSpecPatch(base, { ...base, lengthM: { mode: "value", value: "3000", unit: "m" } })).toEqual({ length_m: { mode: "known", value: "3000" } });
    expect(buildUnitSpecPatch(base, { ...base, unitCount: { mode: "value", value: "2", unit: "item" } })).toEqual({ unit_count: { mode: "known", value: 2 } });
    const known = { ...base, weightKg: { mode: "value" as const, value: "5", unit: "kg" } };
    expect(buildUnitSpecPatch(known, { ...known, weightKg: { mode: "unknown", value: "", unit: "kg" } })).toEqual({ weight_kg: { mode: "unknown" } });
    expect(buildUnitSpecPatch(base, { ...base, strandCount: { mode: "not_applicable", value: "", unit: "strand" } })).toEqual({ strand_count: { mode: "not_applicable" } });
  });

  it("단위 선택만 바꾼 것은 변경이 아니다(서버에 단위가 없다)", () => {
    const base = { ...toUnitSpecEdit(undefined), lengthM: { mode: "value" as const, value: "5", unit: "m" } };
    expect(buildUnitSpecPatch(base, { ...base, lengthM: { ...base.lengthM, unit: "m" } })).toBeNull();
  });

  it("길이·중량은 0 초과, 개수는 1 이상 정수로 검증한다", () => {
    const base = toUnitSpecEdit(undefined);
    expect(validateUnitSpec(base)).toEqual({});
    expect(validateUnitSpec({ ...base, lengthM: { mode: "value", value: "0", unit: "m" } }).lengthM).toBeDefined();
    expect(validateUnitSpec({ ...base, strandCount: { mode: "value", value: "1.5", unit: "strand" } }).strandCount).toBeDefined();
  });
});

describe("표시 문구", () => {
  const doc = linear();
  const extrusion = stepOf(doc.nodes[1]!);
  const braid = stepOf(doc.nodes[3]!);

  it("선속과 시간을 서로 다른 값으로 보이고 미정은 0이 아니라 미정이다", () => {
    expect(processingText(extrusion)).toBe("20 m/분 (산출 기준)");
    expect(processingText(emptyStep())).toBe("미정");
    expect(setupText(emptyStep())).toBe("미정");
    expect(outputText(emptyStep())).toBe("미정");
    expect(outputText({ ...emptyStep(), output_rule: { ...emptyStep().output_rule, mode: "configured_units", length_m: { mode: "known", value: "300" }, unit_count: { mode: "unknown" } } })).toBe("300 m × 미정");
  });

  it("준비 시점은 알지만 시간이 미정이면 0분이 아니라 미정으로 표시한다", () => {
    const s = { ...emptyStep(), timing_rule: { ...emptyStep().timing_rule, setup: { trigger: "per_input_replacement" as const, duration_min: { mode: "unknown" as const } } } };
    expect(setupText(s)).toBe("미정 · 투입 교체마다");
    expect(setupText({ ...emptyStep(), timing_rule: { ...emptyStep().timing_rule, setup: { trigger: "per_operation", duration_min: { mode: "known", value: "0" } } } })).toBe("0 분 · 작업마다");
  });

  it("설비 후보는 자산 id를 표시 코드로 바꿔 보이고 알 수 없는 자산은 id 앞부분을 쓴다", () => {
    const code = (id: string) => (id === braid.resources[0]!.candidates![0]!.asset_id ? "EQ-002" : id.slice(0, 8));
    expect(resourcesText(braid, code)).toBe("EQ-002 (택1)");
    expect(resourcesText(extrusion, code)).toMatch(/^aaaaaaaa \(택1\)$/);
    expect(resourcesText(emptyStep(), code)).toBe("후보 없음");
  });
});

describe("validateStepInput: 형식 오류만(미정은 서버 경고)", () => {
  const op = () => ({ ...linear().nodes[1]! });

  it("올바른 단계와 미정만 있는 단계는 오류가 없다", () => {
    expect(validateStepInput(op(), 1)).toEqual([]);
    expect(validateStepInput({ ...op(), step: emptyStep(), label: "검사" }, 1)).toEqual([]);
  });

  it("이름이 비면 오류이고 entity_id로 단계를 가리킨다(순서 번호가 아니다)", () => {
    const issues = validateStepInput({ ...op(), label: "  " }, 2);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "error", field_path: "/label", entity_id: op().id });
  });

  it("값 있음인데 형식이 틀리면 오류이고 준비 시간 0은 유효하다", () => {
    const bad = updateStep({ nodes: [op()], edges: [] }, op().id, (s) => ({
      ...s,
      timing_rule: {
        ...s.timing_rule,
        processing: { kind: "output_speed", speed_m_per_min: { mode: "known", value: "0" }, basis: "per_stream", output_schedule: "sequential_units", parallel_streams: { mode: "known", value: 1 } },
        setup: { trigger: "per_operation", duration_min: { mode: "known", value: "0" } },
      },
    })).nodes[0]!;
    const issues = validateStepInput(bad, 1);
    expect(issues.map((i) => i.field_path)).toEqual(["/timing_rule/processing/speed_m_per_min"]);
  });

  it("후보 중 N개 선택은 후보 수를 넘을 수 없고 후보가 없으면 검사하지 않는다", () => {
    const n = updateStep({ nodes: [op()], edges: [] }, op().id, (s) => ({
      ...s,
      resources: [{ ...s.resources[0]!, required_count: 2 }],
    })).nodes[0]!;
    expect(validateStepInput(n, 1)[0]).toMatchObject({ field_path: "/resources/0/required_count" });
    const none = updateStep({ nodes: [op()], edges: [] }, op().id, (s) => ({ ...s, resources: [{ ...s.resources[0]!, required_count: 2, candidates: [] }] })).nodes[0]!;
    expect(validateStepInput(none, 1)).toEqual([]);
  });

  it("입력 중인 잘못된 개수(문자열)와 수량은 오류가 된다", () => {
    const n = updateStep({ nodes: [op()], edges: [] }, op().id, (s) => ({
      ...s,
      output_rule: { ...s.output_rule, mode: "configured_units", unit_count: knownToCount({ mode: "value", value: "x", unit: "item" }) },
      resources: [{ ...s.resources[0]!, required_count: "abc" as unknown as number }],
    })).nodes[0]!;
    expect(validateStepInput(n, 1).map((i) => i.field_path).sort()).toEqual(["/output_rule/unit_count", "/resources/0/required_count"]);
  });

  it("operation이 아닌 노드는 검사하지 않는다", () => {
    expect(validateStepInput(linear().nodes[0]!, 1)).toEqual([]);
  });

  it("entity_id별로 묶는다", () => {
    const m = issuesByEntity([
      { severity: "warning", message: "a", entity_id: "x" },
      { severity: "error", message: "b", entity_id: "x" },
      { severity: "warning", message: "c" },
    ]);
    expect(m.get("x")).toHaveLength(2);
    expect(m.get("")).toHaveLength(1);
  });
});

describe("저장 초안과 3-way 병합", () => {
  const draft = (doc: GraphDoc): ProcessDraft => ({ doc, raw: toUnitSpecEdit(undefined), finished: toUnitSpecEdit(undefined) });
  const rename = (d: ProcessDraft, id: string, label: string): ProcessDraft => ({
    ...d,
    doc: { ...d.doc, nodes: d.doc.nodes.map((n) => (n.id === id ? { ...n, label } : n)) },
  });

  it("변경 여부와 서버 본문", () => {
    const base = draft(linear());
    expect(draftChanged(base, structuredClone(base))).toBe(false);
    expect(docChanged(base.doc, rename(base, base.doc.nodes[1]!.id, "새 이름").doc)).toBe(true);
    expect(draftChanged(base, { ...base, raw: { ...base.raw, lengthM: { mode: "value", value: "5", unit: "m" } } })).toBe(true);
    expect(toGraphIn(base.doc)).toEqual({ nodes: base.doc.nodes, edges: base.doc.edges, completion_node_id: null });
  });

  it("내가 안 바꾼 단계는 서버 값, 바꾼 단계는 내 값", () => {
    const base = draft(linear());
    const [a, b] = base.doc.nodes.filter((n) => n.kind === "operation");
    const mine = rename(base, a!.id, "내 이름");
    const server = rename(base, b!.id, "서버 이름");
    const m = mergeProcessDraft(base, mine, server)!;
    expect(m.draft.doc.nodes.find((n) => n.id === a!.id)!.label).toBe("내 이름");
    expect(m.draft.doc.nodes.find((n) => n.id === b!.id)!.label).toBe("서버 이름");
    expect(m.conflicts).toEqual([]);
  });

  it("같은 단계를 둘 다 바꿨으면 내 값을 유지하고 충돌로 알린다", () => {
    const base = draft(linear());
    const a = base.doc.nodes[1]!;
    const m = mergeProcessDraft(base, rename(base, a.id, "내 이름"), rename(base, a.id, "서버 이름"))!;
    expect(m.draft.doc.nodes.find((n) => n.id === a.id)!.label).toBe("내 이름");
    expect(m.conflicts).toEqual([a.id]);
  });

  it("단위는 필드 단위로 병합하고 겹치면 알린다", () => {
    const base = draft(linear());
    const known = (value: string) => ({ mode: "value" as const, value, unit: "m" });
    const mine = { ...base, raw: { ...base.raw, lengthM: known("1") } };
    const server = { ...base, raw: { ...base.raw, lengthM: known("2"), weightKg: { mode: "value" as const, value: "9", unit: "kg" } } };
    const m = mergeProcessDraft(base, mine, server)!;
    expect(m.draft.raw.lengthM.value).toBe("1");
    expect(m.draft.raw.weightKg.value).toBe("9");
    expect(m.conflicts).toEqual(["raw:lengthM"]);
  });

  it("내가 구조를 바꿨는데 서버도 바뀌었으면 합치지 않는다(null)", () => {
    const base = draft(linear());
    const mine = draft(addStep(base.doc, newId)!.doc);
    expect(mergeProcessDraft(base, mine, rename(base, base.doc.nodes[1]!.id, "서버 이름"))).toBeNull();
    // 서버 그래프가 그대로면 내 문서를 따른다
    expect(mergeProcessDraft(base, mine, base)!.draft.doc).toEqual(mine.doc);
  });

  it("서버가 구조를 바꿨고 내가 그래프를 안 건드렸으면 서버 문서를 따른다. 내가 건드렸으면 null", () => {
    const base = draft(linear());
    const server = draft(addStep(base.doc, newId)!.doc);
    expect(mergeProcessDraft(base, base, server)!.draft.doc).toEqual(server.doc);
    expect(mergeProcessDraft(base, rename(base, base.doc.nodes[1]!.id, "내 이름"), server)).toBeNull();
  });
});

describe("저장 오류 매핑: field_path는 요청 본문 기준", () => {
  const err = (details: { message: string; field_path?: string; rule_id?: string }[]) =>
    new ApiError({ status: 422, code: "VALIDATION_ERROR", message: "x", requestId: "r", details });

  it("/nodes/{i}/…는 보낸 본문의 index로 노드 id를 찾고 경로는 엔티티 내부로 바꾼다", () => {
    const doc = linear();
    const sent = toGraphIn(doc);
    const idx = sent.nodes.findIndex((n) => n.kind === "operation");
    const [r] = mapGraphErrors(err([{ message: "a", field_path: `/nodes/${idx}/step/timing_rule/processing`, rule_id: "VAL-TIME-001" }]), sent);
    expect(r).toMatchObject({ entity_id: sent.nodes[idx]!.id, field_path: "/timing_rule/processing", rule_id: "VAL-TIME-001" });
    const [asset] = mapGraphErrors(err([{ message: "b", field_path: `/nodes/2/asset_id` }]), sent);
    expect(asset).toMatchObject({ entity_id: sent.nodes[2]!.id, field_path: "/asset_id" });
  });

  it("/edges/{i}/…는 간선 id를 가리키고 알 수 없는 경로는 그대로 둔다", () => {
    const sent = toGraphIn(linear());
    expect(mapGraphErrors(err([{ message: "c", field_path: "/edges/1/to_node_id" }]), sent)[0]).toMatchObject({ entity_id: sent.edges![1]!.id, field_path: "/to_node_id" });
    expect(mapGraphErrors(err([{ message: "d", field_path: "/nodes/99/label" }]), sent)[0]).toMatchObject({ field_path: "/nodes/99/label" });
    expect(mapGraphErrors(err([{ message: "e" }]), sent)[0]!.entity_id).toBeUndefined();
  });

  it("단위 오류는 입력별로 연결하고 나머지는 일반 오류다", () => {
    const r = mapUnitErrors(
      err([
        { message: "길이", field_path: "/raw_unit_spec/length_m/value" },
        { message: "가닥", field_path: "/finished_unit_spec/strand_count" },
        { message: "기타", field_path: "/notes" },
      ]),
    );
    expect(r.byField).toEqual({ "raw:lengthM": "길이", "finished:strandCount": "가닥" });
    expect(r.general.map((g) => g.message)).toEqual(["기타"]);
  });
});
