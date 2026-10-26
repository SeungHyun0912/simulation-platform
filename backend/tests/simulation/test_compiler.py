"""C0-01: snapshot → RuntimeModel 컴파일러. 미정·미지원은 조용히 채우지 않고 이유와 함께 막는다."""

from fractions import Fraction

import pytest
from fixtures import (
    EQUIPMENT_1,
    EQUIPMENT_2,
    Graph,
    known,
    out_pass,
    out_split,
    per_unit,
    resource,
    single_insulation,
    speed,
    step,
    uid,
)

from simulation_platform.simulation.compiler import (
    CompileError,
    ScenarioAssumptions,
    compile_snapshot,
)

OK = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True)


def rules_of(result):
    return {i.rule_id for i in result.issues}


def edit(snapshot, key, change):
    """snapshot의 노드(dict)를 key로 찾아 바꾼다(시험용)."""
    node = next(n for n in snapshot.nodes if n["node_key"] == key)
    change(node)
    return snapshot


# --- 정상 컴파일 ----------------------------------------------------------------------------

def test_single_insulation_compiles_to_an_exact_runtime_model():
    result = compile_snapshot(single_insulation(), OK)
    assert result.ok and not result.issues
    model = result.require_model()
    assert model.route == ("src", "wait_in", "insulate", "wait_out", "complete", "sink")
    assert model.source_key == "src" and model.completion_key == "complete"
    step_model = model.steps["insulate"]
    assert (step_model.handler, step_model.handler_version) == ("split_length", "1")
    assert step_model.timing.kind == "speed" and step_model.timing.speed_m_per_min == Fraction(30)
    assert step_model.output.unit_length_m == Fraction(1000) and step_model.output.unit_count == 2
    assert step_model.output.state_code == "절연 후" and step_model.output.form == "보빈"
    assert step_model.candidates == (EQUIPMENT_1,) and step_model.allocation == "single"
    assert step_model.setup_minutes == 0 and step_model.handoff == "per_output_unit"
    assert [n.next_key for n in model.nodes.values()] == [
        "wait_in", "insulate", "wait_out", "complete", "sink", None]


def test_decimal_strings_become_exact_fractions_not_floats():
    model = compile_snapshot(single_insulation(speed_value="1.5", unit="1000.25"), OK).require_model()
    assert model.steps["insulate"].timing.speed_m_per_min == Fraction(3, 2)
    assert model.steps["insulate"].output.unit_length_m == Fraction(100025, 100)


def test_compile_reports_the_scenario_assumptions_it_used():
    model = compile_snapshot(single_insulation(), OK).require_model()
    assert {a.code for a in model.assumptions} == {"UNBOUNDED_BUFFERS", "EQUIPMENT_HOLD_FOR_OPERATION"}
    held = next(a for a in model.assumptions if a.code == "EQUIPMENT_HOLD_FOR_OPERATION")
    assert held.node_key == "insulate"


# --- 시나리오 가정 요구: 용량·점유 정책은 모르는 값을 스스로 정하지 않는다 ----------------------------

def test_unknown_buffer_capacity_and_hold_policy_block_compile_together():
    result = compile_snapshot(single_insulation())
    assert result.model is None and not result.ok
    assert {"BUFFER_POLICY_UNKNOWN", "EQUIPMENT_HOLD_POLICY_REQUIRED"} <= rules_of(result)
    with pytest.raises(CompileError) as raised:
        result.require_model()
    assert {i.rule_id for i in raised.value.issues} == rules_of(result)  # 오류를 모아서 한 번에 보고한다


def test_single_output_step_does_not_need_a_hold_policy():
    one = single_insulation(unit=2000, count=1)
    result = compile_snapshot(one, ScenarioAssumptions(unbounded_buffers=True))
    assert result.ok  # 산출이 하나면 설비 점유 정책이 결과를 바꾸지 않는다


def test_unsupported_hold_policy_is_rejected():
    result = compile_snapshot(single_insulation(), ScenarioAssumptions(
        equipment_hold="release_per_output_unit", unbounded_buffers=True))
    assert rules_of(result) == {"EQUIPMENT_HOLD_UNSUPPORTED"}


# --- 버전·schema ----------------------------------------------------------------------------

def test_only_approved_versions_run_unless_explicitly_allowed():
    draft = single_insulation(status="draft")
    assert rules_of(compile_snapshot(draft, OK)) == {"VERSION_NOT_APPROVED"}
    assert compile_snapshot(draft, OK, allow_unapproved=True).ok


def test_unsupported_schema_version_is_rejected():
    assert "UNSUPPORTED_SCHEMA_VERSION" in rules_of(compile_snapshot(single_insulation(schema="9.9"), OK))


# --- 도메인 실행 검증이 미정을 막는다(ADR-017) -----------------------------------------------------

def test_unknown_values_from_domain_validation_block_the_compile():
    snap = edit(single_insulation(), "insulate",
                lambda n: n["step"]["timing_rule"].update(processing={"kind": "unknown"}))
    result = compile_snapshot(snap, OK)
    assert "VAL-TIME-001" in rules_of(result) and result.model is None
    issue = next(i for i in result.issues if i.rule_id == "VAL-TIME-001")
    assert issue.node_key == "insulate" and issue.field_path == "/timing_rule/processing"


def test_missing_completion_milestone_blocks_a_run():
    assert "VAL-GRAPH-014" in rules_of(compile_snapshot(single_insulation(completion=None), OK))


def test_unconfirmed_candidate_equipment_blocks_a_run():
    snap = edit(single_insulation(), "insulate", lambda n: n["step"]["resources"][0]["candidates"][0].update(
        eligibility_status="unknown"))
    assert "VAL-RES-004" in rules_of(compile_snapshot(snap, OK))


# --- 엔진 범위 밖은 이유와 함께 막는다 ------------------------------------------------------------

def test_parallel_streams_are_never_auto_selected():
    snap = edit(single_insulation(), "insulate", lambda n: n["step"]["timing_rule"].update(
        processing=speed("100", streams=12, basis="per_stream")))
    result = compile_snapshot(snap, OK)
    assert rules_of(result) == {"TIMING_UNSUPPORTED"}
    assert "스트림 1" in result.issues[0].message  # 메시지가 지원 범위를 알려 준다
    aggregate = edit(single_insulation(), "insulate", lambda n: n["step"]["timing_rule"].update(
        processing=speed("100", streams=1, basis="aggregate_output")))
    assert rules_of(compile_snapshot(aggregate, OK)) == {"TIMING_UNSUPPORTED"}


def test_registered_but_unimplemented_handler_is_reported_as_engine_gap():
    snap = edit(single_insulation(), "insulate", lambda n: n["step"].update(operation_type="configured_yield"))
    result = compile_snapshot(snap, OK)
    assert "ENGINE_HANDLER_NOT_AVAILABLE" in rules_of(result)
    assert "configured_yield" in next(i for i in result.issues if i.rule_id == "ENGINE_HANDLER_NOT_AVAILABLE").message


def test_unknown_handler_name_is_blocked_by_domain_validation():
    snap = edit(single_insulation(), "insulate", lambda n: n["step"].update(operation_type="frobnicate"))
    assert "UNSUPPORTED_HANDLER" in rules_of(compile_snapshot(snap, OK))


def test_handler_output_mode_must_match():
    snap = edit(single_insulation(), "insulate", lambda n: n["step"].update(output_rule=out_pass()))
    assert "OUTPUT_MODE_MISMATCH" in rules_of(compile_snapshot(snap, OK))


def test_setup_only_per_operation_or_zero_is_supported():
    five = single_insulation(setup={"duration_min": known("5"), "trigger": "per_operation"})
    assert compile_snapshot(five, OK).require_model().steps["insulate"].setup_minutes == Fraction(5)
    change = single_insulation(setup={"duration_min": known("5"), "trigger": "on_product_change"})
    assert rules_of(compile_snapshot(change, OK)) == {"SETUP_TRIGGER_UNSUPPORTED"}
    zero = single_insulation(setup={"duration_min": known("0"), "trigger": "on_product_change"})
    assert compile_snapshot(zero, OK).require_model().steps["insulate"].setup_minutes == 0


def test_precondition_delay_needs_the_supply_delay_handler():
    snap = edit(single_insulation(), "insulate", lambda n: n["step"]["timing_rule"].update(
        precondition_delay={"duration_min": known("120"), "trigger": "per_operation", "occupancy": "occupies_machine"}))
    assert rules_of(compile_snapshot(snap, OK)) == {"PRECONDITION_DELAY_UNSUPPORTED"}


# --- 후보 설비 선택 ------------------------------------------------------------------------

def test_multiple_candidates_need_an_explicit_allocation_rule():
    two = (EQUIPMENT_1, EQUIPMENT_2)
    assert rules_of(compile_snapshot(single_insulation(assets=two), OK)) == {"ALLOCATION_RULE_UNKNOWN"}
    fifo = compile_snapshot(single_insulation(assets=two, allocation="fifo"), OK).require_model()
    assert fifo.steps["insulate"].candidates == two and fifo.steps["insulate"].allocation == "fifo"
    priority = single_insulation(assets=two, allocation="priority")
    assert rules_of(compile_snapshot(priority, OK)) == {"ALLOCATION_RULE_UNKNOWN"}  # 아직 지원하지 않는 규칙


def test_simultaneous_multi_equipment_requirements_are_not_supported_yet():
    snap = edit(single_insulation(), "insulate", lambda n: n["step"]["resources"][0].update(
        selection_mode="all_of"))
    assert "RESOURCE_REQUIREMENT_UNSUPPORTED" in rules_of(compile_snapshot(snap, OK))
    two_roles = edit(single_insulation(), "insulate", lambda n: n["step"]["resources"].append(
        {**resource([EQUIPMENT_2]), "role_key": "second"}))
    assert "RESOURCE_ROLES_UNSUPPORTED" in rules_of(compile_snapshot(two_roles, OK))


def test_finite_workers_are_not_supported_but_unlimited_workers_are():
    g = Graph()
    g.node("src", "source")
    g.node("inspect", "operation", step("inspection", processing=per_unit("10"), output=out_pass(), worker=True))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    assert compile_snapshot(g.chain().snapshot(), OK).ok
    finite = edit(g.snapshot(), "inspect", lambda n: n["step"]["resources"][0].update(capacity_mode="finite"))
    assert "WORKER_CAPACITY_UNSUPPORTED" in rules_of(compile_snapshot(finite, OK))


# --- 경로: 이번 범위는 단일 선형 흐름 ------------------------------------------------------------

def linear_with_extra_edge(kind, extra_target="sink"):
    snap = single_insulation()
    by_key = {n["node_key"]: n for n in snap.nodes}
    edges = list(snap.edges) + [{
        "id": uid(), "edge_key": f"extra-{kind}", "from_node_id": by_key["wait_in"]["id"],
        "to_node_id": by_key[extra_target]["id"], "edge_kind": kind, "movement_rule": {"mode": "unknown"},
        "source_output_spec_key": None, "target_input_spec_key": None}]
    return type(snap)(**{**snap.__dict__, "edges": tuple(edges)})


def test_supply_precedence_branch_and_join_flows_are_rejected_with_reasons():
    assert "NONLINEAR_EDGE_UNSUPPORTED" in rules_of(compile_snapshot(linear_with_extra_edge("supply"), OK))
    assert "NONLINEAR_EDGE_UNSUPPORTED" in rules_of(compile_snapshot(linear_with_extra_edge("precedence"), OK))
    material = compile_snapshot(linear_with_extra_edge("material"), OK)
    assert {"BRANCH_UNSUPPORTED", "JOIN_UNSUPPORTED"} <= rules_of(material)


def test_unreachable_nodes_and_missing_sink_are_reported():
    g = Graph()
    g.node("src", "source")
    g.node("insulate", "operation", step("split_length", processing=speed("30"), output=out_split(1000, 2),
                                         assets=[EQUIPMENT_1], state="x"))
    g.node("complete", "milestone")
    snap = g.chain().snapshot()
    assert "ROUTE_NO_SINK" in rules_of(compile_snapshot(snap, ScenarioAssumptions(equipment_hold="hold_for_operation")))
    g2 = single_insulation()
    orphan = {"id": uid(), "node_key": "orphan", "kind": "buffer", "label": "x", "asset_id": None,
              "display_order": 99, "step": None}
    snap2 = type(g2)(**{**g2.__dict__, "nodes": g2.nodes + (orphan,)})
    assert "UNREACHABLE_NODE" in rules_of(compile_snapshot(snap2, OK))


def test_exactly_one_source_is_required():
    g = Graph()
    g.node("a", "source")
    g.node("b", "source")
    g.node("sink", "sink")
    assert "ROUTE_SOURCE" in rules_of(compile_snapshot(g.chain().snapshot(completion=None), OK))


# --- 수동 운반: 이동 시간은 시나리오가 명시한 가정으로만 ----------------------------------------------

def with_transport():
    g = Graph()
    g.node("src", "source")
    g.node("forklift", "operation", {**step("transport_manual", processing={"kind": "unknown"}, output=out_pass()),
                                     "handoff_rule": {"mode": "unknown"}})
    g.node("complete", "milestone")
    g.node("sink", "sink")
    return g.chain().snapshot()


def test_manual_transport_needs_an_explicit_duration_assumption():
    blocked = compile_snapshot(with_transport(), OK)
    assert "TRANSPORT_DURATION_UNKNOWN" in rules_of(blocked) and "VAL-RES-002" in rules_of(blocked)
    assumptions = ScenarioAssumptions(manual_transport_minutes={"forklift": Fraction(0)})
    result = compile_snapshot(with_transport(), assumptions)
    assert result.ok, result.issues  # 0분도 승인한 가정으로 명시하면 허용된다
    model = result.require_model()
    assert model.steps["forklift"].transport_minutes == 0
    assert any(a.code == "MANUAL_TRANSPORT_MINUTES" and a.node_key == "forklift" for a in model.assumptions)
    waived = {w.rule_id for w in result.waived}
    assert {"VAL-RES-002", "VAL-TIME-001"} <= waived  # 면제한 항목도 숨기지 않고 보고한다


def test_negative_transport_minutes_are_invalid():
    result = compile_snapshot(with_transport(), ScenarioAssumptions(
        manual_transport_minutes={"forklift": Fraction(-1)}))
    assert "TRANSPORT_DURATION_INVALID" in rules_of(result)


def test_transport_waiver_does_not_hide_an_unsupported_handler():
    snap = edit(with_transport(), "forklift", lambda n: n["step"].update(operation_type="network_transport"))
    result = compile_snapshot(snap, ScenarioAssumptions(manual_transport_minutes={"forklift": Fraction(5)}))
    assert "UNSUPPORTED_HANDLER" in rules_of(result)
