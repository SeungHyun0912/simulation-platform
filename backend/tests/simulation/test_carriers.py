"""운반 자원(지게차·AMR)과 공간이 가득 찼을 때의 출력 대기 가정(2026-10-28 사용자 결정, DB 불필요).

- 지게차 3대·AMR 2대는 각각 여러 운반 경로가 함께 쓴다(같은 자산이 여러 운반 단계의 후보).
- 운반 뒤 다음 명령이 없으면 목적지에서 기다리고, 다른 곳에서 일을 받으면 그곳까지 빈 차로 이동한다(시간은 시나리오 가정).
- 그 밖의 공간 사이 이동은 사람이 시간 없이 옮긴다(엔진 기본 그대로).
"""

from fractions import Fraction as F

from fixtures import (
    EQUIPMENT_1,
    EQUIPMENT_2,
    STORAGE_A,
    STORAGE_B,
    Graph,
    out_pass,
    per_unit,
    resource,
    step,
    uid,
)
from test_spaces import cap, lines, machine, model_of, space, with_assets

from simulation_platform.simulation.compiler import ScenarioAssumptions, compile_snapshot
from simulation_platform.simulation.runtime import Arrival, Lane, run_model, run_models

CARRIER_1, CARRIER_2 = uid(), uid()
PROJECT = uid()  # 같은 운반 자원을 쓰는 공정은 같은 프로젝트다


def route(carriers, pickup="wait_a", drop="wait_b", pickup_space=STORAGE_A, drop_space=STORAGE_B):
    """원자재 → 공간(pickup) → 운반(4분, 운반 자원 후보) → 공간(drop) → 완제품. 시험 전용 입력."""
    g = Graph()
    g.node("src", "source")
    g.node(pickup, "buffer", asset_id=pickup_space)
    g.node("carry", "operation", step("transport_manual", processing=per_unit("4"), output=out_pass(),
                                      resources=[resource(carriers, "first_available" if len(carriers) > 1 else "unknown")]))
    g.node(drop, "buffer", asset_id=drop_space)
    g.node("complete", "milestone")
    g.node("sink", "sink")
    return g.chain().snapshot(project_id=PROJECT)


def assumed(move="3", **extra):
    return ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True,
                               carrier_empty_move_minutes=None if move is None else F(move), **extra)


def sink_times(result, version=None):
    return [e.sim_time for e in result.of_type("SINK_REACHED") if version is None or e.process_version_id == version]


def test_a_single_carrier_waits_at_the_destination_and_drives_back_empty_for_the_next_job():
    result = run_model(model_of(route((CARRIER_1,)), assumed()), [Arrival("500", count=3)])
    # 1회: 처음 쓰는 자원은 그 자리에 있다고 본다(0~4분). 2·3회: 목적지(wait_b)에서 빈 차로 3분 돌아와 4분 운반
    assert sink_times(result) == [4, 11, 18]
    moves = result.of_type("CARRIER_MOVED")
    assert [(e.sim_time, e.source, e.destination, e.quantities["minutes"]) for e in moves] == [
        (4, "wait_b", "wait_a", 3), (11, "wait_b", "wait_a", 3)]
    assert {a.code for a in result.assumptions} >= {"CARRIER_EMPTY_MOVE"}


def test_two_carriers_work_in_parallel_and_the_free_one_takes_the_next_job():
    result = run_model(model_of(route((CARRIER_1, CARRIER_2)), assumed()), [Arrival("500", count=3)])
    assert sink_times(result) == [4, 4, 11]  # 두 대가 동시에, 셋째는 먼저 비는 자원이 돌아와 운반
    assert len(result.of_type("CARRIER_MOVED")) == 1


def test_carriers_are_shared_between_routes_of_different_products():
    a = model_of(route((CARRIER_1,), "wait_a", "wait_b", STORAGE_A, STORAGE_B), assumed())
    b = model_of(route((CARRIER_1,), "wait_c", "wait_d", uid(), uid()), assumed())
    result = run_models([Lane(a, (Arrival("500"),)), Lane(b, (Arrival("500"),))])
    # 한 대를 두 경로가 쓴다: 첫 경로 0~4분, 둘째 경로는 그 뒤 wait_b → wait_c로 빈 차 3분 이동 후 4분 운반
    assert sink_times(result, a.version_id) == [4] and sink_times(result, b.version_id) == [11]
    [move] = result.of_type("CARRIER_MOVED")
    assert (move.source, move.destination) == ("wait_b", "wait_c")


def test_zero_minute_empty_move_means_carriers_reposition_instantly():
    result = run_model(model_of(route((CARRIER_1,)), assumed("0")), [Arrival("500", count=3)])
    assert sink_times(result) == [4, 8, 12] and not result.of_type("CARRIER_MOVED")


def test_carriers_need_the_empty_move_time_stated_by_the_scenario():
    issues = {i.rule_id for i in compile_snapshot(route((CARRIER_1,)), assumed(None)).issues}
    assert "CARRIER_EMPTY_MOVE_UNKNOWN" in issues


def test_a_transport_step_without_carriers_keeps_unlimited_independent_trips():
    g = Graph()
    g.node("src", "source")
    g.node("carry", "operation", step("transport_manual", processing=per_unit("4"), output=out_pass(), worker=True))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    result = run_model(model_of(g.chain().snapshot(), assumed()), [Arrival("500", count=3)])
    assert sink_times(result) == [4, 4, 4] and not result.of_type("CARRIER_MOVED")  # 자원이 없으면 위치도 따지지 않는다


# --- 다음 공간이 가득 찼을 때 OUT 배출 정책이 없는 설비: 산출을 쥐고 기다리는 가정 ----------------------------------------

def test_machines_without_an_out_policy_hold_their_output_when_the_scenario_says_so():
    snapshot = lines(cap("finite", "1", "item"), None, cap("unknown"))  # 설비1의 OUT 배출 정책·OUT 용량이 미정
    blocked = {i.rule_id for i in compile_snapshot(snapshot, ScenarioAssumptions(equipment_hold="hold_for_operation")).issues}
    assert "OUT_RELEASE_POLICY_UNKNOWN" in blocked
    model = model_of(snapshot, ScenarioAssumptions(equipment_hold="hold_for_operation", out_release="hold"))
    result = run_model(model, [Arrival("2000", count=2)])
    assert any(a.code == "OUT_RELEASE_HOLD" for a in result.assumptions)
    # 정책이 hold로 정해진 설비와 똑같이 막힌다(test_spaces의 같은 구성: 100분·500/3분에 막힘)
    assert [e.sim_time for e in result.of_type("OUT_BLOCKED")] == [100, F(500, 3)]


def test_direct_handoffs_are_reported_apart_from_spaces_of_unknown_capacity():
    g = Graph()
    g.node("src", "source")
    g.node("wait_in", "buffer", asset_id=STORAGE_A)
    g.node("first", "operation", step("pass_through_length", processing={"kind": "output_speed", "speed_m_per_min":
                                      {"mode": "known", "value": "30"}, "basis": "per_stream",
                                      "output_schedule": "sequential_units", "parallel_streams": {"mode": "known", "value": 1}},
                                      output=out_pass(), assets=(EQUIPMENT_1,)))
    g.node("second", "operation", step("pass_through_length", processing={"kind": "output_speed", "speed_m_per_min":
                                       {"mode": "known", "value": "30"}, "basis": "per_stream",
                                       "output_schedule": "sequential_units", "parallel_streams": {"mode": "known", "value": 1}},
                                       output=out_pass(), assets=(EQUIPMENT_2,)))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    snapshot = with_assets(g.chain().snapshot(), {STORAGE_A: space(cap("finite", "5", "item")),
                                                  EQUIPMENT_1: machine(), EQUIPMENT_2: machine()})
    result = compile_snapshot(snapshot, ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True))
    codes = {a.code for a in result.assumptions}
    # 저장공간 용량은 모두 알려졌으므로 공간 무제한 가정은 쓰지 않았고, 단계 사이 직접 인계만 무제한으로 가정했다
    assert "UNBOUNDED_HANDOFFS" in codes and "UNBOUNDED_BUFFERS" not in codes
