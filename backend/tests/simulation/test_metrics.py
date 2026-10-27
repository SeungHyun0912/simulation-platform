"""CR be08c: 이벤트로 계산한 지표(07 §10) — 정의·구간 합산·null 규칙(DB 불필요)."""

from fractions import Fraction

import pytest
from fixtures import single_insulation

from simulation_platform.simulation.compiler import ScenarioAssumptions, compile_snapshot
from simulation_platform.simulation.metrics import DEFINITIONS, MetricCollector
from simulation_platform.simulation.runtime import Arrival, Lane, run_models

OK = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True)
SHORT = compile_snapshot(single_insulation(), OK).require_model()  # 2,000m → 1,000m × 2, 30m/min
LONG = compile_snapshot(single_insulation(unit=30000), OK).require_model()  # 60,000m → 30,000m × 2 (2,000분)


def measure(model, *arrivals, **options):
    result = run_models([Lane(model, arrivals)], daily_snapshots=True, **options)
    collector = MetricCollector()
    for event in result.events:
        collector.observe(event)
    return result, collector.finish(result.end_time, result.state)


def pick(rows, key, kind="run", start=None, **dims):
    found = [r for r in rows if r["metric_key"] == key and r["window_kind"] == kind
             and (start is None or r["window_start_min"]["exact"] == str(start))
             and all(r["dimensions"].get(k) == v for k, v in dims.items())]
    assert len(found) == 1, (key, kind, start, dims, len(found))
    return found[0]


def value(rows, key, kind="run", start=None, **dims):
    raw = pick(rows, key, kind, start, **dims)["value"]
    return None if raw is None else Fraction(raw)


def test_flow_metrics_of_a_short_run_follow_the_events_exactly():
    result, rows = measure(SHORT, Arrival("2000"))
    assert value(rows, "arrived_items") == 1 and value(rows, "arrived_length_m") == 2000
    assert value(rows, "completed_items") == 2 and value(rows, "completed_length_m") == 2000
    assert value(rows, "sunk_items") == 2 and value(rows, "discarded_length_m") == 0
    assert value(rows, "lead_time_avg_min") == 50 and value(rows, "lead_time_max_min") == Fraction("66.666667")  # 값은 소수 6자리
    # 완료 2개 ÷ (200/3분 ÷ 1,440분/일) = 43.2개/일
    assert value(rows, "throughput_items_per_day") == Fraction("43.2")
    assert value(rows, "wip_items") == 0 and value(rows, "wip_length_m") == 0
    assert result.end_time == Fraction(200, 3)


def test_equipment_metrics_cover_processing_time_and_utilization():
    _, rows = measure(SHORT, Arrival("2000"))
    assert value(rows, "processing_time_min") == Fraction("66.666667")
    assert value(rows, "utilization") == 1 and value(rows, "blocked_time_min") == 0
    assert pick(rows, "utilization")["unit"] == "ratio"


def test_values_that_do_not_apply_are_null_not_zero():
    _, rows = measure(SHORT, Arrival("2000"))
    assert value(rows, "arrived_weight_kg") is None and value(rows, "completed_weight_kg") is None  # 무게 없는 원자재
    assert value(rows, "discarded_weight_kg") is None
    _, idle = measure(SHORT, Arrival("2000", at=10))
    assert value(idle, "lead_time_avg_min") == 50  # 입고가 늦어도 리드타임은 입고 시각 기준이다


def test_a_window_without_completions_has_no_lead_time_and_the_day_windows_add_up_to_the_run():
    result, rows = measure(LONG, Arrival("60000"))
    day0, day1 = (pick(rows, "completed_items", "day", start) for start in (0, 1440))
    assert (Fraction(day0["value"]), Fraction(day1["value"])) == (1, 1)  # 보빈 하나는 1,000분에, 하나는 2,000분에 나온다
    assert value(rows, "completed_items") == 2
    assert value(rows, "processing_time_min", "day", 0) == 1440 and value(rows, "processing_time_min", "day", 1440) == 560
    assert value(rows, "utilization", "day", 0) == 1 and value(rows, "utilization", "day", 1440) == 1  # 마지막 구간은 560분
    assert pick(rows, "utilization", "day", 1440)["window_end_min"]["exact"] == str(result.end_time)
    for key in ("completed_items", "completed_length_m", "processing_time_min", "sunk_items"):
        assert sum(value(rows, key, "day", s) for s in (0, 1440)) == value(rows, key)
        assert value(rows, key, "week", 0) == value(rows, key, "month", 0) == value(rows, key)  # 한 달이 안 되므로 같다


def test_wip_at_a_window_end_includes_material_being_processed_inside_the_machine():
    _, rows = measure(LONG, Arrival("60000"))
    assert value(rows, "wip_items", "day", 0) == 1 and value(rows, "wip_length_m", "day", 0) == 30000
    assert value(rows, "wip_items", "day", 1440) == 0  # 끝난 구간은 종료 시점의 재공품(없음)


def test_a_late_arrival_leaves_empty_days_and_weeks_and_months_are_marked():
    result, rows = measure(SHORT, Arrival("2000", at=35 * 1440))
    days = [r for r in rows if r["metric_key"] == "arrived_items" and r["window_kind"] == "day"]
    assert len(days) == 36 and sum(Fraction(r["value"]) for r in days) == 1
    assert value(rows, "completed_items", "day", 0) == 0  # 관측했지만 완료가 없었다(0)
    assert value(rows, "lead_time_avg_min", "day", 0) is None  # 완료가 없으면 평균은 없다
    assert len([r for r in rows if r["metric_key"] == "completed_items" and r["window_kind"] == "week"]) == 6
    assert len([r for r in rows if r["metric_key"] == "completed_items" and r["window_kind"] == "month"]) == 2
    assert value(rows, "completed_items", "month", 30 * 1440) == 2
    assert value(rows, "wip_items", "week", 28 * 1440) == 0 and result.state == "completed"


def test_every_row_uses_a_defined_metric_and_a_stable_dimension_hash():
    _, rows = measure(SHORT, Arrival("2000"))
    assert {r["metric_key"] for r in rows} <= set(DEFINITIONS)
    assert len({(r["metric_key"], r["dimensions_hash"], r["window_kind"], r["window_start_min"]["exact"]) for r in rows}) == len(rows)
    _, again = measure(SHORT, Arrival("2000"))
    assert [r["dimensions_hash"] for r in rows] == [r["dimensions_hash"] for r in again]  # 같은 차원은 같은 해시
    assert all(r["definition_version"] == "1" for r in rows)


@pytest.mark.parametrize(("options", "quality", "state"), [
    ({}, "complete", "completed"),
    ({"horizon": 30}, "censored", "horizon_reached"),
    ({"event_limit": 6}, "incomplete", "limit_reached"),
])
def test_quality_status_marks_runs_that_did_not_finish(options, quality, state):
    result, rows = measure(SHORT, Arrival("2000"), **options)
    assert result.state == state
    assert {r["quality_status"] for r in rows} == {quality}


def test_a_horizon_run_reports_what_was_still_in_progress_at_the_end():
    result, rows = measure(LONG, Arrival("60000"), horizon=1000)
    assert result.state == "horizon_reached"
    assert value(rows, "wip_items") == 1 and value(rows, "wip_length_m") == 60000  # 아직 산출 전: 부모가 설비 안에 있다
    assert value(rows, "completed_items") == 0 and value(rows, "utilization") == 1


# --- CR be10: 단계별 지표·병목 판정 근거(설비 대기·공간 대기·적체) ------------------------------------------------

def step_value(rows, key, kind="run", start=None):
    found = [r for r in rows if r["metric_key"] == key and r["window_kind"] == kind and "step_key" in r["dimensions"]
             and (start is None or r["window_start_min"]["exact"] == str(start))]
    assert len(found) == 1, (key, len(found))
    return None if found[0]["value"] is None else Fraction(found[0]["value"])


def test_a_second_job_waits_for_the_only_machine_and_that_wait_is_counted_per_step():
    """원자재 2개가 동시에 들어오고 설비는 한 대: 첫 작업은 바로, 둘째는 첫 작업이 끝나는 200/3분에 설비를 받는다."""
    result, rows = measure(SHORT, Arrival("2000", count=2))
    assert result.end_time == Fraction(400, 3)
    assert step_value(rows, "step_operations") == 2
    assert step_value(rows, "step_processing_time_min") == Fraction("133.333333")  # 200/3 × 2
    assert step_value(rows, "step_equipment_wait_item_min") == Fraction("66.666667")  # 둘째 작업물 하나가 200/3분
    assert step_value(rows, "step_equipment_wait_avg_min") == Fraction("33.333333")  # 작업물 2개 평균
    assert step_value(rows, "step_equipment_wait_max_min") == Fraction("66.666667")
    assert step_value(rows, "step_peak_concurrency") == 1  # 설비가 한 대라 동시에 하나만 진행
    assert step_value(rows, "step_blocked_item_min") == 0
    # 대기 공간에는 둘이 한꺼번에 쌓였다(적체 근거)
    queue = [r for r in rows if r["window_kind"] == "run" and r["dimensions"].get("node_key") == "wait_in"]
    peak = next(r for r in queue if r["metric_key"] == "buffer_peak_items")
    assert Fraction(peak["value"]) == 2
    item_min = next(r for r in queue if r["metric_key"] == "buffer_item_min")
    assert Fraction(item_min["value"]) == Fraction("66.666667")  # 첫 작업물은 즉시, 둘째는 200/3분 머문다


def test_a_step_that_never_waits_reports_zero_waiting_and_null_average():
    _, rows = measure(SHORT, Arrival("2000"))
    assert step_value(rows, "step_equipment_wait_item_min") == 0 and step_value(rows, "step_equipment_wait_avg_min") == 0
    assert step_value(rows, "step_equipment_wait_max_min") == 0  # 기다린 작업물이 있었고 0분이었다


def test_peak_concurrency_survives_days_without_events_and_waits_add_up_across_windows():
    # 60,000m 작업이 2,000분 동안 설비를 쥐고 있다: 이벤트가 없는 날에도 동시 진행 수는 1이다
    _, rows = measure(LONG, Arrival("60000"), Arrival("60000", at=100))
    assert step_value(rows, "step_peak_concurrency", "day", 0) == 1 and step_value(rows, "step_peak_concurrency", "day", 1440) == 1
    assert step_value(rows, "step_peak_concurrency") == 1
    parts = [step_value(rows, "step_equipment_wait_item_min", "day", s) for s in (0, 1440, 2880)]
    assert sum(parts) == step_value(rows, "step_equipment_wait_item_min") and step_value(rows, "step_equipment_wait_item_min") > 0
