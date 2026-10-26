"""BE-04c: 재료 spec·간선 spec 연결·완제품 지정의 순수 규칙과 DTO, 비교(CR-backend-20261026-be06)."""

import uuid

import pytest
from pydantic import ValidationError

from simulation_platform.domain import process as rules
from simulation_platform.domain.process_diff import diff_versions
from simulation_platform.schemas.process import GraphEdge, MaterialSpecDto, StepDto, StepPatch

UNKNOWN = {"mode": "unknown", "value": None}
SPEC0 = {k: UNKNOWN for k in ("length_m", "weight_kg", "unit_count", "strand_count")}


def uid():
    return str(uuid.uuid4())


def known(value):
    return {"mode": "known", "value": value}


def spec(key, direction, **quantity):
    return {"spec_key": key, "direction": direction, "material_definition_id": None, "state_code": None,
            "form": None, **SPEC0, **quantity, "quantity_basis": "per_operation"}


def step(*specs):
    return {**StepDto().model_dump(mode="json"), "material_specs": list(specs)}


def node(kind, key, st=None):
    return {"id": uid(), "node_key": key, "kind": kind, "label": key, "asset_id": None,
            "display_order": 0, "step": st}


def edge(a, b, kind="material", source=None, target=None, key=None):
    return {"id": uid(), "edge_key": key or f"{a['node_key']}-{b['node_key']}", "from_node_id": a["id"],
            "to_node_id": b["id"], "edge_kind": kind, "movement_rule": {"mode": "unknown"},
            "source_output_spec_key": source, "target_input_spec_key": target}


def graph():
    a = node("operation", "a", step(spec("in", "input", weight_kg=known("3300")),
                                    spec("out", "output", length_m=known("1000"))))
    b = node("operation", "b", step(spec("in", "input", length_m=known("1000")),
                                    spec("out", "output", length_m=known("1000"))))
    return a, b, node("milestone", "complete"), node("sink", "sink")


def errors(nodes, edges, completion=None):
    return {(p, r) for p, r, _ in rules.structure_errors(nodes, edges, completion)}


# --- DTO -------------------------------------------------------------------------------------

def test_material_spec_values_are_separate_closed_objects_with_unknown_defaults():
    dto = MaterialSpecDto(spec_key="in", direction="input")
    assert all(getattr(dto, f).mode == "unknown" for f in ("length_m", "weight_kg", "unit_count", "strand_count"))
    assert dto.quantity_basis == "unknown" and dto.material_definition_id is None
    with pytest.raises(ValidationError):
        MaterialSpecDto(spec_key="in", direction="input", mixed=1)  # 닫힌 객체
    with pytest.raises(ValidationError):
        MaterialSpecDto(spec_key="in", direction="sideways")
    with pytest.raises(ValidationError):
        MaterialSpecDto(spec_key="in", direction="input", unit_count={"mode": "known", "value": "3"})  # 개수는 정수
    with pytest.raises(ValidationError):
        MaterialSpecDto(spec_key="in", direction="input", length_m={"mode": "known", "value": "0"})  # 0 초과
    with pytest.raises(ValidationError):
        MaterialSpecDto(spec_key="in", direction="input", state_code="  ")  # 빈 문자열은 미정이 아니다
    ok = MaterialSpecDto(spec_key="in", direction="input", strand_count={"mode": "known", "value": 12},
                         form="가닥", state_code="공급 준비")
    assert ok.strand_count.value == 12 and ok.unit_count.mode == "unknown"  # 가닥 수가 보빈 수를 대신하지 않는다


def test_spec_keys_are_unique_within_a_step_across_directions():
    same = [{"spec_key": "x", "direction": "input"}, {"spec_key": "x", "direction": "output"}]
    with pytest.raises(ValidationError):
        StepDto(material_specs=same)
    with pytest.raises(ValidationError):
        StepPatch(material_specs=same)
    assert StepPatch(material_specs=[]).material_specs == []  # 빈 목록은 "모두 제거"
    assert StepPatch(label="x").material_specs is None  # 보내지 않으면 그대로
    assert GraphEdge(id=uuid.uuid4(), edge_key="e", from_node_id=uuid.uuid4(),
                     to_node_id=uuid.uuid4()).source_output_spec_key is None


# --- 구조 오류 ---------------------------------------------------------------------------------

def test_edge_spec_links_must_point_at_the_right_step_and_direction():
    a, b, _, _ = graph()
    assert errors([a, b], [edge(a, b, source="out", target="in")]) == set()
    assert errors([a, b], [edge(a, b, source="nope")]) == {("/edges/0/source_output_spec_key", "VAL-SPEC-002")}
    assert errors([a, b], [edge(a, b, source="in")]) == {  # input spec을 출력으로 연결할 수 없다
        ("/edges/0/source_output_spec_key", "VAL-SPEC-002")}
    assert errors([a, b], [edge(a, b, target="out")]) == {  # output spec을 입력으로 연결할 수 없다
        ("/edges/0/target_input_spec_key", "VAL-SPEC-003")}
    assert errors([a, b], [edge(b, a, source="in")]) == {("/edges/0/source_output_spec_key", "VAL-SPEC-002")}


def test_spec_links_need_an_operation_with_that_spec_and_exclude_precedence():
    a, b, done, _sink = graph()
    assert errors([a, done], [edge(a, done, source="out")]) == set()  # 도착이 milestone이어도 출력 연결은 된다
    assert errors([a, done], [edge(a, done, target="in")]) == {("/edges/0/target_input_spec_key", "VAL-SPEC-003")}
    buf = node("buffer", "buf")
    assert errors([buf, a], [edge(buf, a, source="out")]) == {  # 출발이 operation이 아니면 spec이 없다
        ("/edges/0/source_output_spec_key", "VAL-SPEC-002")}
    assert errors([buf, a], [edge(buf, a, target="in")]) == set()  # 버퍼 → 단계 간선은 단계의 input에 연결한다
    both = errors([a, b], [edge(a, b, kind="precedence", source="out", target="in")])
    assert both == {("/edges/0/source_output_spec_key", "VAL-SPEC-004"),
                    ("/edges/0/target_input_spec_key", "VAL-SPEC-004")}
    assert errors([a, b], [edge(a, b, kind="supply", source="out", target="in")]) == set()  # 공급 간선은 가능


def test_completion_node_must_be_a_milestone_of_the_graph():
    a, _, done, sink = graph()
    assert errors([a, done], [edge(a, done)], done["id"]) == set()
    assert errors([a, done], [], uuid.UUID(done["id"])) == set()  # UUID로 와도 같다
    assert errors([a, sink], [edge(a, sink)], sink["id"]) == {("/completion_node_id", "VAL-GRAPH-005")}
    assert errors([a, done], [], uid()) == {("/completion_node_id", "VAL-GRAPH-005")}  # 그래프에 없는 노드
    assert errors([a, done], [], None) == set()


# --- 경고 ------------------------------------------------------------------------------------

def issues(nodes, edges, completion=None):
    return rules.graph_issues(uuid.uuid4(), SPEC0, SPEC0, nodes, edges, completion)


def test_unknown_completion_is_a_warning_that_blocks_a_run_only_when_there_are_steps():
    a, _, done, _ = graph()
    knowledge = issues([a, done], [edge(a, done)])
    item = next(i for i in knowledge if i.rule_id == "VAL-GRAPH-014")
    assert item.severity == "warning" and item.field_path == "/completion_node_id"
    run = rules.for_run_template(knowledge, [a, done])
    assert next(i for i in run if i.rule_id == "VAL-GRAPH-014").severity == "error"
    assert "VAL-GRAPH-014" not in {i.rule_id for i in issues([a, done], [edge(a, done)], done["id"])}
    assert "VAL-GRAPH-014" not in {i.rule_id for i in issues([done], [])}  # 단계가 없으면 이 경고는 없다


def test_spec_with_all_quantities_unknown_is_a_warning_per_spec():
    empty = node("operation", "empty", step(spec("in", "input"), spec("out", "output", length_m=known("5"))))
    found = [i for i in issues([empty], []) if i.rule_id == "VAL-SPEC-001"]
    assert [(i.severity, i.field_path, i.entity_id) for i in found] == [
        ("warning", "/material_specs/0", empty["id"])]  # 순서 번호는 단계 안의 경로
    assert "in(input)" in found[0].message
    mixed = node("operation", "mixed", step(spec("in", "input", strand_count=known(12))))
    assert not [i for i in issues([mixed], []) if i.rule_id == "VAL-SPEC-001"]  # 하나라도 있으면 경고 아님
    na = node("operation", "na", step(spec("in", "input", weight_kg={"mode": "not_applicable", "value": None})))
    assert not [i for i in issues([na], []) if i.rule_id == "VAL-SPEC-001"]  # 해당 없음은 미정이 아니다


# --- 비교 ------------------------------------------------------------------------------------

def snapshot(prefix, completion=None, links=("out", "in")):
    a, b, done, _ = graph()
    for n in (a, b, done):
        n["id"] = f"{prefix}-{n['node_key']}"
    edges = [edge(a, b, source=links[0], target=links[1]), edge(b, done)]
    return {"header": {"raw_unit_spec": {}, "finished_unit_spec": {}, "notes": None,
                       "completion_node_key": completion},
            "nodes": [a, b, done], "edges": edges}


def test_diff_covers_material_specs_edge_links_and_completion():
    same = diff_versions(snapshot("t", "complete"), snapshot("a", "complete"))
    assert same["summary"]["identical"] is True
    target = snapshot("t", "complete", links=("out", None))
    against = snapshot("a", None)
    target["nodes"][0]["step"]["material_specs"][0]["weight_kg"] = known("3500")
    target["nodes"][0]["step"]["material_specs"].append(spec("extra", "output", unit_count={"mode": "known", "value": 2}))
    result = diff_versions(target, against)
    header = {f["field_path"]: (f["change"], f["before"], f["after"]) for f in result["header"]}
    assert header == {"/completion_node_key": ("changed", None, "complete")}
    (step_change,) = result["steps"]["changed"]
    fields = {f["field_path"]: f for f in step_change["fields"]}
    assert step_change["node_key"] == "a"
    assert fields["/material_specs/in/weight_kg/value"]["before"] == "3300"  # spec_key로 맞춘다
    assert fields["/material_specs/in/weight_kg/value"]["after"] == "3500"
    assert fields["/material_specs/extra"]["change"] == "added"
    (edge_change,) = result["edges"]["changed"]
    assert edge_change["fields"] == [{"field_path": "/target_input_spec_key", "change": "changed",
                                      "before": "in", "after": None}]


def test_diff_spec_order_does_not_matter():
    target, against = snapshot("t"), snapshot("a")
    against["nodes"][0]["step"]["material_specs"].reverse()
    assert diff_versions(target, against)["summary"]["identical"] is True
