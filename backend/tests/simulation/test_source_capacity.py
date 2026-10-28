"""원자재 입고 위치(source 노드의 저장공간)의 용량(2026-10-28 사용자 결정 "모두 반영", DB 불필요).

입고 위치가 가득 차면 원자재는 자리가 날 때까지 들어오지 못한다. 다음 공간으로 옮겨 가거나 단계가 가져가면 자리가 빈다.
용량이 정해지지 않은 입고 위치는 지금처럼 제한하지 않는다.
"""

from fixtures import EQUIPMENT_1, STORAGE_A, STORAGE_B, Graph, out_split, speed, step, uid
from test_spaces import cap, machine, model_of, space, with_assets

from simulation_platform.simulation.compiler import ScenarioAssumptions
from simulation_platform.simulation.runtime import Arrival, run_model

RAW_YARD = uid()
HOLD = ScenarioAssumptions(equipment_hold="hold_for_operation")


def line(raw_capacity):
    """원자재 입고 위치(RAW_YARD) → 대기 1자리 → 절연(2,000m → 1,000m×2, 30m/min) → 완료 공간 → 완제품."""
    g = Graph()
    g.node("src", "source", asset_id=RAW_YARD)
    g.node("wait_in", "buffer", asset_id=STORAGE_A)
    g.node("insulate", "operation", step("split_length", processing=speed("30"), output=out_split(1000, 2),
                                         assets=(EQUIPMENT_1,), state="절연 후"))
    g.node("wait_out", "buffer", asset_id=STORAGE_B)
    g.node("complete", "milestone")
    g.node("sink", "sink")
    assets = {STORAGE_A: space(cap("finite", "1", "item")), STORAGE_B: space(cap("unlimited")), EQUIPMENT_1: machine()}
    if raw_capacity is not None:
        assets[RAW_YARD] = space(cap("finite", str(raw_capacity), "item"))
    return with_assets(g.chain().snapshot(), assets)


def arrivals(result):
    return [e.sim_time for e in result.of_type("MATERIAL_ARRIVED")]


def test_a_full_raw_material_yard_makes_arrivals_wait_for_a_slot():
    result = run_model(model_of(line(1), HOLD), [Arrival("2000", count=4)])
    assert result.state == "completed" and len(result.of_type("SINK_REACHED")) == 8
    late = [t for t in arrivals(result) if t > 0]
    assert late  # 입고 위치 1자리: 앞 원자재가 대기 공간으로 옮겨 가기 전에는 다음 원자재가 들어오지 못한다
    waits = [e for e in result.of_type("ENTRY_WAITING") if e.destination == "src"]
    assert waits and all(e.item_key is None for e in waits)  # 아직 들어오지 않은 원자재라 작업물 번호가 없다


def test_a_yard_with_room_or_without_a_known_capacity_does_not_hold_arrivals_back():
    for capacity in (10, None):
        result = run_model(model_of(line(capacity), HOLD), [Arrival("2000", count=4)])
        assert arrivals(result) == [0, 0, 0, 0], capacity
        assert not [e for e in result.of_type("ENTRY_WAITING") if e.destination == "src"]
