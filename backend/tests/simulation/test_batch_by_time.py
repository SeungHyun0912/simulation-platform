"""사용자 정리(CR be09, 2026-10-27) 반영: 태신선·멀티신선 같은 설비는 여러 개를 한 번에 받아 하나씩 순차로 만든다.

시험 전용 입력(실제 공정 값이 아니다). 원자재는 길이 없이 무게만 있고(해당 없음), 이 단계가 만든 산출에서 길이가 생긴다.
"""

from fractions import Fraction

from fixtures import (
    EQUIPMENT_1,
    EQUIPMENT_2,
    STORAGE_A,
    UNKNOWN,
    Graph,
    known,
    out_split,
    per_unit,
    speed,
    step,
)

from simulation_platform.simulation.compiler import ScenarioAssumptions, compile_snapshot
from simulation_platform.simulation.runtime import Arrival, Lane, run_model, run_models

F = Fraction
OK = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True)


def mspec(key, direction, *, state, units, length=None, weight=None):
    return {"spec_key": key, "direction": direction, "state_code": state, "form": "보빈",
            "material_definition_id": None, "length_m": known(length) if length else {"mode": "not_applicable"},
            "weight_kg": known(weight) if weight else UNKNOWN, "unit_count": known(units),
            "strand_count": UNKNOWN, "quantity_basis": "per_operation"}


def configured(length, units, accounting="unknown"):
    return {"mode": "configured_units", "unit_form": "보빈", "length_m": known(length), "weight_kg": UNKNOWN,
            "unit_count": known(units), "quantity_basis": "per_operation", "schedule": "sequential_units",
            "accounting_mode": accounting}


def by_mass(weight, units):
    return {"mode": "fixed_mass_units", "unit_form": "보빈", "length_m": UNKNOWN, "weight_kg": known(weight),
            "unit_count": known(units), "quantity_basis": "per_operation", "schedule": "sequential_units",
            "accounting_mode": "physical"}


def two_stage(project_id=None, setup=None):
    """원자재(무게만) 2개 → [멀티: 1,000m 보빈 3개, 100m/min 순차] → 분할 공간 → [절연: 1,000m → 500m × 2]."""
    g = Graph()
    g.node("src", "source")
    g.node("multi", "operation", step(
        "output_units_by_time", processing=speed("100"), output=configured("1000", 3), assets=(EQUIPMENT_1,),
        specs=[mspec("in", "input", state="원자재", units=2, weight="2000"),
               mspec("out", "output", state="신선 후", units=3, length="1000")],
        **({"setup": setup} if setup else {})))
    g.node("wait", "buffer", asset_id=STORAGE_A)
    g.node("split", "operation", step("split_length", processing=speed("100"), output=out_split(500, 2),
                                      assets=(EQUIPMENT_2,)))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    return g.chain().snapshot(project_id=project_id)


def link_specs(snapshot):
    """src → multi 간선에 입력 spec(in)을 연결한다(작업 한 번에 확보할 개수는 이 spec의 개수다)."""
    edge = snapshot.edges[0]
    edge["target_input_spec_key"] = "in"
    return snapshot


def model_of(snapshot, assumptions=OK):
    return compile_snapshot(link_specs(snapshot), assumptions).require_model()


def times(result, event_type, **match):
    return [e.sim_time for e in result.of_type(event_type)
            if all(getattr(e, k) == v for k, v in match.items())]


# --- 길이 없는 원자재와 순차 산출 -----------------------------------------------------------------------

def test_a_raw_material_without_length_is_taken_in_batches_and_made_one_by_one():
    result = run_model(model_of(two_stage()), [Arrival(weight_kg="1000", count=2)])
    assert result.state == "completed"
    # 입력 2개를 한 번에 확보, 보빈 3개가 1,000m ÷ 100m/min = 10분마다 순차로 나온다
    assert [e.sim_time for e in result.of_type("OUTPUT_UNIT_READY") if e.step_key == "multi"] == [10, 20, 30]
    reserved = result.of_type("INPUT_RESERVED")
    assert len([e for e in reserved if e.step_key == "multi"]) == 2 and all(e.sim_time == 0 for e in reserved[:2])
    assert len(result.of_type("SINK_REACHED")) == 6  # 보빈 3개 × 500m 2개
    arrived = result.of_type("MATERIAL_ARRIVED")[0]
    assert "length_m" not in arrived.quantities and arrived.quantities["weight_kg"] == 1000  # 길이를 0으로 채우지 않는다


def test_the_length_comes_from_the_step_output_and_nothing_is_conserved_across_units():
    result = run_model(model_of(two_stage()), [Arrival(weight_kg="1000", count=2)])
    yielded = [r for r in result.lineage if r.relation == "yield"]
    assert len(yielded) == 1 and len(yielded[0].parent_keys) == 2 and yielded[0].parent_length_m is None
    assert yielded[0].balanced is None  # 무게 → 길이는 환산하지 않으므로 보존을 주장하지 않는다
    by_key = {i.key: i for i in result.items}
    assert {by_key[k].length_m for k in yielded[0].child_keys} == {F(1000)}
    assert all(by_key[k].status == "consumed" for k in yielded[0].parent_keys)


def test_a_length_step_does_not_accept_an_item_without_length():
    """길이로 계산하는 단계에 길이 없는 작업물이 오면 0으로 계산하지 않고 이유와 함께 실패한다."""
    g = Graph()
    g.node("src", "source")
    g.node("split", "operation", step("split_length", processing=speed("100"), output=out_split(500, 2),
                                      assets=(EQUIPMENT_2,)))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    result = run_model(compile_snapshot(g.chain().snapshot(), OK).require_model(), [Arrival(weight_kg="2000")])
    assert (result.state, result.reason) == ("failed", "INPUT_LENGTH_MISSING")


def test_mass_outputs_have_no_length_and_use_a_fixed_time_per_unit():
    g = Graph()
    g.node("src", "source")
    g.node("draw", "operation", step(
        "output_units_by_time", processing=per_unit("22", "sequential_units"), output=by_mass("1000", 4),
        assets=(EQUIPMENT_1,), specs=[mspec("in", "input", state="원자재", units=2, weight="3300"),
                                      mspec("out", "output", state="태신선 후", units=4, weight="1000")]))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    result = run_model(model_of(g.chain().snapshot()), [Arrival(weight_kg="3300", count=2)])
    assert [e.sim_time for e in result.of_type("OUTPUT_UNIT_READY")] == [22, 44, 66, 88]
    ready = result.of_type("OUTPUT_UNIT_READY")[0]
    assert ready.quantities["weight_kg"] == 1000 and "length_m" not in ready.quantities


def test_speed_timing_needs_an_output_length_for_batch_handlers():
    g = Graph()
    g.node("src", "source")
    g.node("draw", "operation", step(
        "output_units_by_time", processing=speed("10"), output=by_mass("1000", 4), assets=(EQUIPMENT_1,),
        specs=[mspec("in", "input", state="원자재", units=2, weight="3300")]))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    snapshot = link_specs(g.chain().snapshot())
    assert {i.rule_id for i in compile_snapshot(snapshot, OK).issues} == {"TIMING_UNSUPPORTED"}


# --- 입력 부족 진단 ---------------------------------------------------------------------------------------

def test_leftover_raw_material_is_reported_as_insufficient_input_not_as_a_deadlock():
    """원자재 3개, 한 번에 2개 필요: 1작업(2개) 뒤 1개가 남는다. 완료가 아니라 stalled, 사유는 입력 부족."""
    result = run_model(model_of(two_stage()), [Arrival(weight_kg="1000", count=3)])
    assert (result.state, result.reason) == ("stalled", "INSUFFICIENT_INPUT")
    assert [(f["step"], f["waiting"], f["needed"]) for f in result.shortfalls] == [("multi", 1, 2)]
    assert len(result.of_type("SINK_REACHED")) == 6  # 앞의 작업은 끝까지 갔다
    assert sum(1 for i in result.items if i.status == "active") == 1  # 남은 원자재를 지우거나 새로 만들지 않는다


def test_a_run_that_used_all_its_input_has_no_shortfalls():
    run = run_model(model_of(two_stage()), [Arrival(weight_kg="1000", count=2)])
    assert run.reason is None and run.shortfalls == ()


# --- 제품이 바뀔 때만 생기는 준비 ---------------------------------------------------------------------------

def test_setup_on_product_change_only_applies_when_the_machine_last_made_another_product():
    project = "same-project"
    setup = {"duration_min": known("120"), "trigger": "on_product_change"}

    def lane(arrival_at):
        return Lane(model_of(two_stage(project, setup)), (Arrival(weight_kg="1000", count=2, at=arrival_at),))

    # 같은 설비 EQUIPMENT_1을 두 제품(공정 버전)이 쓴다. 첫 작업은 준비 없음, 제품이 바뀐 두 번째 작업만 120분
    result = run_models([lane(0), lane(100)])
    started = times(result, "SETUP_STARTED")
    assert len(started) == 1
    finished = times(result, "SETUP_FINISHED")
    assert finished[0] - started[0] == 120
    # 같은 제품이 연속하면 준비는 없다
    same = run_model(model_of(two_stage(project, setup)), [Arrival(weight_kg="1000", count=4)])
    assert times(same, "SETUP_STARTED") == []


def test_setup_per_operation_still_applies_to_every_operation():
    setup = {"duration_min": known("120"), "trigger": "per_operation"}
    result = run_model(model_of(two_stage(None, setup)), [Arrival(weight_kg="1000", count=4)])
    assert len(times(result, "SETUP_STARTED")) == 2  # 4개 / 2개씩 = 작업 2번


# --- 다른 제품이 설비에서 시작되면 이전 제품의 잔량은 폐기 ---------------------------------------------------------

def carry_line(project, equipment, raw_unit, unit, count_basis="per_lot"):
    g = Graph()
    g.node("src", "source")
    rule = {"mode": "carry_same_product", "on_product_change": "discard", "on_run_end": "unknown",
            "scope": "machine", "physical_join_mode": "abstract_length_pool"}
    g.node("split", "operation", step("split_length", processing=speed("100"),
                                      output=out_split(unit, 10, count_basis), assets=(equipment,),
                                      residual_rule=rule))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    return g.chain().snapshot(project_id=project)


def plain_line(project, equipment, unit):
    g = Graph()
    g.node("src", "source")
    g.node("split", "operation", step("split_length", processing=speed("100"), output=out_split(unit, 1, "per_input_unit"),
                                      assets=(equipment,)))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    return g.chain().snapshot(project_id=project)


def test_residual_is_kept_for_the_same_product_and_discarded_when_another_product_starts_on_the_machine():
    project = "p"
    p1 = Lane(compile_snapshot(carry_line(project, EQUIPMENT_1, 1000, 300), OK).require_model(),
              (Arrival("1000", count=1),))  # 1,000m → 300m × 3 + 100m 잔량
    other = Lane(compile_snapshot(plain_line(project, EQUIPMENT_1, 500), OK).require_model(),
                 (Arrival("500", at=1000),))  # 다른 제품이 같은 설비에서 시작
    result = run_models([p1, other])
    created = result.of_type("RESIDUAL_CREATED")
    assert [e.quantities["length_m"] for e in created] == [100]
    discarded = result.of_type("RESIDUAL_DISCARDED")
    assert len(discarded) == 1 and discarded[0].reason == "PRODUCT_CHANGE" and discarded[0].quantities["length_m"] == 100
    assert discarded[0].sim_time == 1000  # 다른 제품이 시작하는 순간
    assert result.state == "completed"
    # 같은 제품만 이어지면 잔량을 이월해 쓴다
    same = run_model(compile_snapshot(carry_line(project, EQUIPMENT_1, 1000, 300), OK).require_model(),
                     [Arrival("1000", count=3)])
    assert [e.quantities["length_m"] for e in same.of_type("RESIDUAL_CARRIED")] == [100, 200]
    assert not same.of_type("RESIDUAL_DISCARDED")
