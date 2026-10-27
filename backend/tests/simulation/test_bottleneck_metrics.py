"""CR be10: 공간 부족으로 멈춘 양(출력 막힘·공간 대기)의 지표(DB 불필요). 용량이 유한한 공간 구성은 test_spaces와 같다."""

from fractions import Fraction

from test_spaces import (
    EQUIPMENT_1,
    HOLD,
    STORAGE_A,
    STORAGE_B,
    cap,
    lines,
    machine,
    model_of,
    single_insulation,
    space,
    with_assets,
)

from simulation_platform.simulation.metrics import MetricCollector
from simulation_platform.simulation.runtime import Arrival, Lane, run_models


def measure(model, *arrivals):
    result = run_models([Lane(model, arrivals)], daily_snapshots=True)
    collector = MetricCollector()
    for event in result.events:
        collector.observe(event)
    return result, collector.finish(result.end_time, result.state)


def run_value(rows, key, **dims):
    found = [r for r in rows if r["metric_key"] == key and r["window_kind"] == "run"
             and all(r["dimensions"].get(k) == v for k, v in dims.items())]
    assert len(found) == 1, (key, dims, len(found))
    return None if found[0]["value"] is None else Fraction(found[0]["value"])


def test_a_full_next_space_blocks_the_machine_output_and_the_blocked_time_is_counted():
    # 중간 공간이 1자리: 설비 출력이 100/3분 + 200/3분 = 100(작업물·분) 막힌다(test_spaces의 같은 구성)
    model = model_of(lines(cap("finite", "1", "item"), "yes"))
    _, rows = measure(model, Arrival("2000", count=2))
    assert run_value(rows, "step_blocked_item_min", step_key="insulate") == 100
    assert run_value(rows, "step_blocked_item_min", step_key="sheath") == 0
    assert run_value(rows, "blocked_time_min", asset_key=EQUIPMENT_1) == 100  # 설비 쪽 BLOCKED 시간과 같은 양
    # 중간 공간은 한 자리뿐이라 한 개씩만 머문다
    assert run_value(rows, "buffer_peak_items", node_key="wait_mid") == 1


def test_arrivals_waiting_outside_a_full_space_are_counted_as_space_wait():
    snapshot = with_assets(single_insulation(), {STORAGE_A: space(cap("finite", "1", "item")),
                                                 STORAGE_B: space(cap("unlimited")), EQUIPMENT_1: machine()})
    result, rows = measure(model_of(snapshot, HOLD), Arrival("2000", count=3))
    waiting = {e.item_key: e.sim_time for e in result.of_type("ENTRY_WAITING")}
    entered = {e.item_key: e.sim_time for e in result.of_type("BUFFER_ENTERED") if e.destination == "wait_in"}
    expected = sum(entered[item] - since for item, since in waiting.items())
    assert expected > 0 and len(waiting) == 2
    assert abs(run_value(rows, "space_wait_item_min", node_key="wait_in") - expected) < Fraction(1, 10**5)
    assert run_value(rows, "space_wait_max_min", node_key="wait_in") > 0
    # 공간이 무제한인 노드는 기다림이 없다(관측한 0)
    assert run_value(rows, "space_wait_item_min", node_key="wait_out") == 0
    assert run_value(rows, "space_wait_max_min", node_key="wait_out") is None
