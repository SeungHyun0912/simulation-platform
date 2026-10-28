"""C0-05: 저장공간 용량과 OUT 막힘(07 §9, DEC-006). 공간 자리 수는 승인된 자산 버전의 storage_capacity(item)에서,
OUT 배출 정책은 설비 OUT 포트의 release_rule·buffer_capacity에서 온다. 모르는 값은 무제한으로 가정하지 않는다."""

import dataclasses
from fractions import Fraction

import pytest
import simpy
from fixtures import (
    EQUIPMENT_1,
    EQUIPMENT_2,
    STORAGE_A,
    STORAGE_B,
    Graph,
    out_split,
    single_insulation,
    speed,
    step,
    uid,
)

from simulation_platform.simulation.compiler import ScenarioAssumptions, compile_snapshot
from simulation_platform.simulation.monitoring import events as ev
from simulation_platform.simulation.resources import SpaceAllocator
from simulation_platform.simulation.runtime import Arrival, Lane, run_model, run_models

F = Fraction
HOLD = ScenarioAssumptions(equipment_hold="hold_for_operation")
UNBOUNDED = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True)
PROJECT = uid()


def cap(mode, value=None, unit=None):
    return {"mode": mode, "value": value, "unit": unit}


def space(capacity):
    return {"storage_capacity": capacity, "ports": []}


def machine(block="yes", out=None):
    """설비 자산 버전: OUT 포트의 배출 규칙(block_machine_while_waiting)과 OUT 용량."""
    rule = {"mode": "unknown"} if block is None else {"mode": "when_destination_accepts",
                                                      "block_machine_while_waiting": block}
    return {"storage_capacity": None, "ports": [
        {"role": "IN", "buffer_capacity": cap("unknown"), "release_rule": {"mode": "unknown"}},
        {"role": "OUT", "buffer_capacity": out or cap("not_allowed"), "release_rule": rule}]}


def with_assets(snapshot, assets):
    return dataclasses.replace(snapshot, assets=assets)


def rules(snapshot, assumptions=HOLD):
    return {i.rule_id for i in compile_snapshot(snapshot, assumptions).issues}


def model_of(snapshot, assumptions=HOLD):
    return compile_snapshot(snapshot, assumptions).require_model()


def two_steps():
    """1단계(설비1, 2,000m → 1,000m×2, 33⅓분/보빈) → 중간 공간 → 2단계(설비2, 1,000m당 100분). 시험 전용 입력."""
    g = Graph()
    g.node("src", "source")
    g.node("wait_in", "buffer", asset_id=STORAGE_A)
    g.node("insulate", "operation", step("split_length", processing=speed("30"), output=out_split(1000, 2),
                                         assets=(EQUIPMENT_1,), state="절연 후"))
    g.node("wait_mid", "buffer", asset_id=STORAGE_B)
    g.node("sheath", "operation", step("split_length", processing=speed("10"), output=out_split(1000, 1),
                                       assets=(EQUIPMENT_2,), state="시스 후"))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    return g.chain().snapshot(project_id=PROJECT)


def lines(mid, block="yes", out=None):
    return with_assets(two_steps(), {STORAGE_A: space(cap("unlimited")), STORAGE_B: space(mid),
                                     EQUIPMENT_1: machine(block, out), EQUIPMENT_2: machine()})


def times(result, event_type, **match):
    return [e.sim_time for e in result.of_type(event_type)
            if all(getattr(e, k) == v for k, v in match.items())]


def idle_at(result, asset):
    return [e.sim_time for e in result.of_type(ev.ASSET_STATE_CHANGED)
            if e.asset_key == asset and e.quantities["state"] == ev.IDLE][-1]


def max_occupancy(result, key):
    count = peak = 0
    for e in result.events:
        if e.event_type == ev.BUFFER_ENTERED and e.destination == key:
            count += 1
        elif e.event_type == ev.BUFFER_LEFT and e.source == key:
            count -= 1
        peak = max(peak, count)
    return peak


# --- 컴파일: 공간 용량 ---------------------------------------------------------------------------

def test_finite_item_spaces_need_no_unbounded_assumption():
    snapshot = with_assets(single_insulation(), {STORAGE_A: space(cap("finite", "2", "item")),
                                                 STORAGE_B: space(cap("unlimited")), EQUIPMENT_1: machine()})
    result = compile_snapshot(snapshot, HOLD)
    assert result.ok, result.issues
    assert result.require_model().spaces == {STORAGE_A: 2, STORAGE_B: None}
    assert not any(a.code == "UNBOUNDED_BUFFERS" for a in result.assumptions)


def test_unknown_or_missing_space_capacity_is_not_treated_as_unlimited():
    unknown = with_assets(single_insulation(), {STORAGE_A: space(cap("unknown")), STORAGE_B: space(cap("unlimited"))})
    assert rules(unknown) == {"BUFFER_POLICY_UNKNOWN"}
    assert rules(single_insulation()) == {"BUFFER_POLICY_UNKNOWN"}  # 자산 버전 없음
    result = compile_snapshot(unknown, UNBOUNDED)
    assert result.ok and result.require_model().spaces == {STORAGE_B: None}
    assert any(a.code == "UNBOUNDED_BUFFERS" for a in result.assumptions)


def test_space_marked_not_allowed_or_in_unsupported_units_is_rejected():
    not_allowed = with_assets(single_insulation(), {STORAGE_A: space(cap("not_allowed")),
                                                    STORAGE_B: space(cap("unlimited"))})
    assert rules(not_allowed) == {"SPACE_NOT_ALLOWED"}
    in_kg = with_assets(single_insulation(), {STORAGE_A: space(cap("finite", "500", "kg")),
                                              STORAGE_B: space(cap("unlimited"))})
    assert rules(in_kg) == {"SPACE_CAPACITY_UNIT_UNSUPPORTED"}


def test_direct_handoff_holds_one_item_in_front_of_the_next_machine():
    """사용자 규칙(2026-10-28): 대기 공간 없이 바로 넘기면 다음 설비 앞에 1개(설비가 한 번에 처리하는 입력 수)까지
    기다릴 수 있고, 자리가 차면 앞 설비가 산출을 쥐고 기다린다. 그래서 공간 무제한 가정이 필요 없다."""
    g = Graph()
    g.node("src", "source")
    g.node("a", "operation", step("split_length", processing=speed("30"), output=out_split(1000, 2),
                                  assets=(EQUIPMENT_1,)))
    g.node("b", "operation", step("split_length", processing=speed("10"), output=out_split(1000, 1),
                                  assets=(EQUIPMENT_2,)))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    snapshot = g.chain().snapshot()
    assert "BUFFER_POLICY_UNKNOWN" not in rules(snapshot)
    result = run_model(model_of(snapshot), [Arrival("2000", count=2)])
    assert result.state == "completed" and len(result.of_type(ev.SINK_REACHED)) == 4
    # a는 1,000m 단위를 100/3분마다 낸다. b는 1,000m에 100분. 셋째 단위(100분)가 나올 때 b 앞 자리(1개)에는 둘째가
    # 기다리고 있어 a가 막힌다 → b가 둘째를 가져가는 400/3분에 풀린다
    assert times(result, ev.OUT_BLOCKED, step_key="a")[0] == 100
    assert times(result, ev.OUT_UNBLOCKED, step_key="a")[0] == F(400, 3)


# --- 컴파일: OUT 배출 정책(DEC-006 대응표) -----------------------------------------------------------

@pytest.mark.parametrize(("block", "out", "kind", "out_capacity"), [
    ("yes", None, "hold", None),
    ("no", cap("finite", "2", "item"), "release_after_out", 2),
    ("no", cap("unlimited"), "release_after_out", None),
    ("no", cap("not_allowed"), "hold", None),  # OUT 자리가 없으면 직접 인계
])
def test_out_policy_follows_the_release_rule_of_the_approved_asset_revision(block, out, kind, out_capacity):
    policy = model_of(lines(cap("finite", "1", "item"), block, out)).steps["insulate"].out_policies[EQUIPMENT_1]
    assert (policy.kind, policy.out_capacity) == (kind, out_capacity)


@pytest.mark.parametrize(("block", "out"), [
    ("unknown", cap("finite", "1", "item")),
    (None, cap("finite", "1", "item")),  # release_rule 자체가 unknown
    ("no", cap("unknown")),
    ("no", cap("finite", "3", "bobbin_slot")),  # item으로 환산할 규칙 없음
])
def test_out_policy_left_undecided_blocks_the_run(block, out):
    assert rules(lines(cap("finite", "1", "item"), block, out)) == {"OUT_RELEASE_POLICY_UNKNOWN"}


def test_out_policy_is_only_required_when_the_next_space_can_fill_up():
    unlimited = lines(cap("unlimited"), block="unknown", out=cap("unknown"))
    model = model_of(unlimited)
    assert model.steps["insulate"].out_policies == {}
    missing_machine = with_assets(two_steps(), {STORAGE_A: space(cap("unlimited")),
                                                STORAGE_B: space(cap("finite", "1", "item"))})
    assert rules(missing_machine) == {"OUT_RELEASE_POLICY_UNKNOWN"}  # 설비 자산 버전 없음 = 미정


# --- 실행 ------------------------------------------------------------------------------------------

def test_unlimited_spaces_never_block():
    result = run_model(model_of(lines(cap("unlimited"))), [Arrival("2000", count=2)])
    assert result.state == "completed"
    assert not result.of_type(ev.OUT_BLOCKED) and not result.of_type(ev.ENTRY_WAITING)
    assert idle_at(result, EQUIPMENT_1) == F(400, 3)


def test_hold_keeps_the_machine_blocked_until_the_next_space_has_a_slot():
    result = run_model(model_of(lines(cap("finite", "1", "item"), "yes")), [Arrival("2000", count=2)])
    assert result.state == "completed"
    # 3번째 보빈(100분): 중간 공간에 2번째가 있어 막힘 → 2단계가 2번째를 가져가는 400/3분에 풀림.
    # 막힌 동안 생산이 멈춰 4번째는 500/3분에 나오고 다시 700/3분까지 막힌다.
    assert times(result, ev.OUT_BLOCKED) == [100, F(500, 3)]
    assert times(result, ev.OUT_UNBLOCKED) == [F(400, 3), F(700, 3)]
    states = [e.quantities["state"] for e in result.of_type(ev.ASSET_STATE_CHANGED) if e.asset_key == EQUIPMENT_1]
    assert states.count(ev.BLOCKED) == 2
    assert idle_at(result, EQUIPMENT_1) == F(700, 3)  # 마지막 산출을 내보낸 뒤에야 설비를 놓는다
    assert max_occupancy(result, "wait_mid") == 1
    assert times(result, ev.SINK_REACHED) == [F(400, 3), F(700, 3), F(1000, 3), F(1300, 3)]


def test_release_after_out_frees_the_machine_while_out_holds_the_output():
    result = run_model(model_of(lines(cap("finite", "1", "item"), "no", cap("finite", "1", "item"))),
                       [Arrival("2000", count=2)])
    assert result.state == "completed"
    assert times(result, ev.OUT_STORED)[0] == 100  # 3번째 보빈은 OUT에 놓고 생산을 계속한다
    assert idle_at(result, EQUIPMENT_1) == F(400, 3)  # 막히지 않은 것과 같은 시각에 설비를 놓는다
    assert max_occupancy(result, "wait_mid") == 1
    assert max_occupancy(result, f"OUT:{EQUIPMENT_1}") <= 1  # OUT 자리 1
    assert len(result.of_type(ev.SINK_REACHED)) == 4


def test_arrivals_wait_outside_a_full_space_in_arrival_order():
    snapshot = with_assets(single_insulation(), {STORAGE_A: space(cap("finite", "1", "item")),
                                                 STORAGE_B: space(cap("unlimited")), EQUIPMENT_1: machine()})
    result = run_model(model_of(snapshot), [Arrival("2000", count=3)])
    assert result.state == "completed"
    # 첫 작업물은 바로 설비로 가며 자리를 비운다. 두 번째는 그 자리에서 설비를 기다리고, 세 번째는 공간 밖에서 기다린다.
    assert times(result, ev.BUFFER_ENTERED, destination="wait_in") == [0, 0, F(200, 3)]
    waiting = result.of_type(ev.ENTRY_WAITING)
    assert [e.destination for e in waiting] == ["wait_in", "wait_in"]
    assert max_occupancy(result, "wait_in") == 1


def test_one_space_is_shared_by_processes_that_use_the_same_asset():
    def lane(equipment, capacity):
        snapshot = single_insulation(assets=(equipment,), project_id=PROJECT)
        return Lane(model_of(with_assets(snapshot, {STORAGE_A: space(capacity), STORAGE_B: space(cap("unlimited")),
                                                     equipment: machine()})), (Arrival("2000", count=2),))

    shared = run_models([lane(EQUIPMENT_1, cap("finite", "1", "item")), lane(EQUIPMENT_2, cap("finite", "1", "item"))])
    assert shared.state == "completed"
    assert max_occupancy(shared, "wait_in") == 1  # 두 공정의 같은 노드 key·같은 공간 = 자리 1개
    free = run_models([lane(EQUIPMENT_1, cap("unlimited")), lane(EQUIPMENT_2, cap("unlimited"))])
    assert max_occupancy(free, "wait_in") > 1  # 제한이 없으면 두 공정의 작업물이 함께 머문다
    with pytest.raises(ValueError, match="용량이 공정마다"):
        run_models([lane(EQUIPMENT_1, cap("finite", "1", "item")), lane(EQUIPMENT_2, cap("finite", "2", "item"))])


def test_a_space_that_feeds_and_receives_the_same_machine_can_stall():
    """같은 공간을 입·출력에 쓰고 자리가 1이면: 설비를 기다리는 작업물이 자리를 쥐고, 설비는 그 자리를 기다린다."""
    g = Graph()
    g.node("src", "source")
    g.node("wait_in", "buffer", asset_id=STORAGE_A)
    g.node("insulate", "operation", step("split_length", processing=speed("30"), output=out_split(1000, 2),
                                         assets=(EQUIPMENT_1,)))
    g.node("wait_out", "buffer", asset_id=STORAGE_A)
    g.node("complete", "milestone")
    g.node("sink", "sink")
    snapshot = with_assets(g.chain().snapshot(), {STORAGE_A: space(cap("finite", "1", "item")),
                                                  EQUIPMENT_1: machine("yes")})
    result = run_model(model_of(snapshot), [Arrival("2000", count=2)])
    assert (result.state, result.reason) == ("stalled", "WIP_REMAINING")
    assert times(result, ev.OUT_BLOCKED) == [F(100, 3)]
    assert not times(result, ev.OUT_UNBLOCKED)


# --- 자리 배정기 ------------------------------------------------------------------------------------

def test_space_allocator_grants_in_fifo_order_without_cutting_in():
    env = simpy.Environment()
    spaces = SpaceAllocator(env, {"s": 1, "free": None})
    assert spaces.try_take("s") and not spaces.try_take("s")
    first, second = spaces.wait("s"), spaces.wait("s")
    spaces.release("s")
    assert first.triggered and not second.triggered
    spaces.release("s")
    assert second.triggered
    spaces.release("s")
    assert spaces.try_take("s")  # 기다리는 요청이 없으면 바로 차지
    assert all(spaces.try_take("free") for _ in range(5))  # 용량 None = 제한 없음
