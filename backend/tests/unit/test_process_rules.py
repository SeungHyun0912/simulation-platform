"""공정 그래프의 순수 규칙(domain/process.py)과 규칙 DTO 검증."""

import uuid

import pytest
from pydantic import ValidationError

from simulation_platform.domain import process as rules
from simulation_platform.schemas.process import (
    DurationMeasure,
    GraphIn,
    OutputRule,
    RequirementDto,
    StepDto,
    TimingRule,
)

UNKNOWN = {"mode": "unknown", "value": None}
KNOWN = lambda v: {"mode": "known", "value": v}
NA = {"mode": "not_applicable", "value": None}


def uid():
    return str(uuid.uuid4())


def node(kind, key=None, step=None, asset_id=None, label=None):
    key = key or uid()[:8]
    return {"id": uid(), "node_key": key, "kind": kind, "label": label or key,
            "asset_id": asset_id, "display_order": 0, "step": step}


def default_step():
    return StepDto().model_dump(mode="json")


def edge(a, b, kind="material"):
    return {"id": uid(), "edge_key": uid()[:8], "from_node_id": a["id"], "to_node_id": b["id"],
            "edge_kind": kind, "movement_rule": {"mode": "unknown"}}


SPEC = {k: UNKNOWN for k in ("length_m", "weight_kg", "unit_count", "strand_count")}


def issues(nodes, edges, raw=SPEC, finished=SPEC):
    return rules.graph_issues(uuid.uuid4(), raw, finished, nodes, edges)


def rule_ids(items):
    return {i.rule_id for i in items}


# --- 구조 오류 ----------------------------------------------------------------------------

def test_structure_errors_detect_dangling_self_loop_and_direction():
    src, op, sink = node("source"), node("operation", step=default_step()), node("sink")
    ghost = {"id": uid(), "kind": "operation"}
    errors = rules.structure_errors([src, op, sink], [
        edge(op, ghost), edge(op, op), edge(op, src), edge(sink, op), edge(src, op)])
    paths = {p for p, _, _ in errors}
    assert {"/edges/0/to_node_id", "/edges/1/to_node_id", "/edges/2/to_node_id",
            "/edges/3/from_node_id"} <= paths
    assert not any(p.startswith("/edges/4") for p in paths)  # 정상 간선은 오류가 없다
    assert {r for _, r, _ in errors} == {"VAL-GRAPH-001", "VAL-GRAPH-003", "VAL-GRAPH-004"}


def test_precedence_edges_into_source_are_not_a_material_direction_error():
    src, op = node("source"), node("operation", step=default_step())
    assert rules.structure_errors([src, op], [edge(op, src, kind="precedence")]) == []


def test_required_count_cannot_exceed_candidates():
    step = default_step()
    step["resources"] = [{"role_key": "main", "resource_kind": "equipment", "selection_mode": "one_of",
                          "required_count": 3, "capacity_mode": "finite",
                          "allocation_rule": {"mode": "unknown"},
                          "candidates": [{"asset_id": uid(), "eligibility_status": "confirmed"}]}]
    errors = rules.structure_errors([node("operation", step=step)], [])
    assert [r for _, r, _ in errors] == ["VAL-RES-001"]
    step["resources"][0]["candidates"] = []  # 후보가 없으면 개수 비교는 하지 않는다(미정)
    assert rules.structure_errors([node("operation", step=step)], []) == []


# --- 경고(미정)와 오류 --------------------------------------------------------------------------

def test_default_step_produces_only_warnings_for_every_unknown():
    op = node("operation", step=default_step())
    found = issues([op], [])
    assert all(i.severity == "warning" for i in found)
    assert {"VAL-HANDLER-001", "VAL-TIME-001", "VAL-TIME-004", "VAL-TIME-005", "VAL-OUT-001",
            "VAL-INPUT-001", "VAL-HANDOFF-001", "VAL-RES-002", "VAL-VER-001",
            "VAL-VER-002"} <= rule_ids(found)


def test_output_speed_requires_stream_basis_and_schedule_not_auto_selected():
    step = default_step()
    step["timing_rule"]["processing"] = {
        "kind": "output_speed", "speed_m_per_min": KNOWN("100"), "basis": "unknown",
        "output_schedule": "unknown", "parallel_streams": UNKNOWN}
    found = issues([node("operation", step=step)], [])
    assert "VAL-TIME-003" in rule_ids(found)
    assert "VAL-TIME-002" not in rule_ids(found)  # 선속 값은 확정


def test_per_reference_length_scaling_unknown_blocks_conversion():
    step = default_step()
    step["timing_rule"]["processing"] = {
        "kind": "per_reference_length", "reference_length_m": KNOWN("1000"),
        "duration_min": KNOWN("720"), "scaling": "unknown", "includes_setup": "unknown"}
    assert "VAL-TIME-005" in rule_ids(issues([node("operation", step=step)], []))


def test_configured_units_needs_length_count_and_quantity_basis():
    step = default_step()
    step["output_rule"] = {**OutputRule().model_dump(mode="json"), "mode": "configured_units",
                           "accounting_mode": "abstract_yield"}
    found = issues([node("operation", step=step)], [])
    assert {"VAL-OUT-002", "VAL-OUT-003", "VAL-OUT-004"} <= rule_ids(found)


def test_graph_level_warnings_cycle_isolated_and_unplaced_buffer():
    a, b = node("operation", step=default_step()), node("operation", step=default_step())
    lonely = node("operation", step=default_step())
    buf = node("buffer")
    found = issues([a, b, lonely, buf], [edge(a, b), edge(b, a)])
    assert {"VAL-GRAPH-011", "VAL-GRAPH-012", "VAL-GRAPH-013"} <= rule_ids(found)
    assert any(i.rule_id == "VAL-GRAPH-012" and i.entity_id == lonely["id"] for i in found)
    assert "VAL-GRAPH-010" in rule_ids(issues([], []))  # 단계가 없는 그래프


def test_errors_are_listed_before_warnings():
    op = node("operation", step=default_step())
    found = issues([op], [edge(op, op)])
    flags = [i.severity == "error" for i in found]
    assert flags == sorted(flags, reverse=True) and True in flags


def test_run_template_escalates_required_unknowns_and_flags_unsupported_handlers():
    step = default_step()
    step["operation_type"] = "teleport"
    nodes = [node("operation", step=step, label="순간이동")]
    knowledge = issues(nodes, [])
    assert not [i for i in knowledge if i.severity == "error"]  # 등록·승인은 가능
    run = rules.for_run_template(knowledge, nodes)
    assert "UNSUPPORTED_HANDLER" in {i.rule_id for i in run if i.severity == "error"}
    assert {"VAL-TIME-001", "VAL-OUT-001", "VAL-RES-002"} <= {
        i.rule_id for i in run if i.severity == "error"}
    # 실행과 무관한 경고(원자재 단위 미정)는 경고로 남는다.
    assert [i.severity for i in run if i.rule_id == "VAL-VER-001"] == ["warning"]


def test_supported_handler_with_version_passes_registry_check():
    step = default_step()
    step["operation_type"], step["handler_version"] = "split_length", "1"
    nodes = [node("operation", step=step)]
    run = rules.for_run_template(issues(nodes, []), nodes)
    assert "UNSUPPORTED_HANDLER" not in rule_ids(run)
    step["handler_version"] = "99"
    run = rules.for_run_template(issues(nodes, []), nodes)
    assert "UNSUPPORTED_HANDLER" in rule_ids(run)


# --- DTO 검증 -------------------------------------------------------------------------------

def test_duration_allows_zero_but_not_negative_unlike_processing_measures():
    DurationMeasure(mode="known", value="0")  # 준비 0분은 유효
    for bad in ("-1", "1.1234567", "abc", ".5"):
        with pytest.raises(ValidationError):
            DurationMeasure(mode="known", value=bad)
    with pytest.raises(ValidationError):
        DurationMeasure(mode="unknown", value="0")


def test_timing_rule_is_a_closed_discriminated_union():
    assert TimingRule().processing.kind == "unknown"
    TimingRule.model_validate({"processing": {"kind": "none"}})
    for bad in ({"processing": {"kind": "teleport"}},
                {"processing": {"kind": "output_speed", "speed": "1"}},
                {"processing": {"kind": "none", "speed_m_per_min": UNKNOWN}},
                {"setup": {"trigger": "whenever"}}, {"extra": 1}):
        with pytest.raises(ValidationError):
            TimingRule.model_validate(bad)


def test_requirement_rules():
    RequirementDto(role_key="inspector", resource_kind="worker", capacity_mode="unlimited")
    for kwargs in ({"resource_kind": "equipment", "capacity_mode": "unlimited"},
                   {"resource_kind": "worker", "candidates": [{"asset_id": uid()}]},
                   {"required_count": 0},
                   {"candidates": [{"asset_id": "8ff2b1c6-0000-4000-8000-000000000001"},
                                   {"asset_id": "8ff2b1c6-0000-4000-8000-000000000001"}]}):
        with pytest.raises(ValidationError):
            RequirementDto(role_key="r", **kwargs)


def test_step_and_graph_consistency_validators():
    with pytest.raises(ValidationError):
        StepDto(resources=[RequirementDto(role_key="a"), RequirementDto(role_key="a")])
    op = node("operation", step=default_step())
    GraphIn.model_validate({"nodes": [op], "edges": []})
    for bad_nodes in ([{**op, "step": None}],                       # operation에 step 없음
                      [node("buffer", step=default_step())],         # 비 operation에 step
                      [node("operation", step=default_step(), asset_id=uid())],  # operation에 asset
                      [op, {**node("buffer"), "node_key": op["node_key"]}],      # node_key 중복
                      [op, {**node("buffer"), "id": op["id"]}]):                  # id 중복
        with pytest.raises(ValidationError):
            GraphIn.model_validate({"nodes": bad_nodes, "edges": []})


def test_a_process_without_steps_is_not_runnable_dec005():
    """DEC-005(계약 0.6.1): 단계가 없는 공정은 knowledge에서는 경고, run_template에서는 오류다."""
    knowledge = issues([], [])
    assert next(i for i in knowledge if i.rule_id == "VAL-GRAPH-010").severity == "warning"
    run = rules.for_run_template(knowledge, [])
    assert next(i for i in run if i.rule_id == "VAL-GRAPH-010").severity == "error"
    assert "VAL-GRAPH-010" in rules.RUN_BLOCKING
