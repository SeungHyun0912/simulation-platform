"""C0-02·C0-03: 단일 설비 처리, 보빈별 완료 이벤트, 분할 추적(parent/child/remaining), 지평선·실패·재현성."""

import itertools
import subprocess
import sys
from fractions import Fraction

import pytest
from fixtures import (
    EQUIPMENT_1,
    EQUIPMENT_2,
    STORAGE_A,
    Graph,
    known,
    out_pass,
    per_unit,
    single_insulation,
    speed,
    step,
)

from simulation_platform.simulation.compiler import ScenarioAssumptions, compile_snapshot
from simulation_platform.simulation.runtime import Arrival, Lane, _Run, run_model

OK = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True)
F = Fraction


def model_of(snapshot, assumptions=OK):
    return compile_snapshot(snapshot, assumptions).require_model()


def times(result, event_type, **match):
    return [e.sim_time for e in result.of_type(event_type)
            if all(getattr(e, k) == v for k, v in match.items())]


def types(result):
    return [e.event_type for e in result.events]


# --- C0-02: 제품 하나의 절연(2,000m → 1,000m × 2, 30m/min), 보빈별 완료 이벤트 ------------------------

def test_unit_ready_events_follow_length_over_speed_exactly():
    result = run_model(model_of(single_insulation()), [Arrival("2000", form="롤")])
    assert result.state == "completed" and result.reason is None and not result.censored
    # 1,000m / 30 = 100/3분마다 1개, 두 개가 합쳐 200/3분
    assert times(result, "OUTPUT_UNIT_READY") == [F(100, 3), F(200, 3)]
    assert times(result, "PROCESS_STARTED") == [F(0)] and times(result, "PROCESS_FINISHED") == [F(200, 3)]
    ready = result.of_type("OUTPUT_UNIT_READY")
    assert [e.quantities["ordinal"] for e in ready] == [1, 2]
    assert all(e.quantities["length_m"] == 1000 for e in ready)
    assert result.end_time == F(200, 3)


def test_event_order_for_one_operation_matches_the_spec_vocabulary():
    result = run_model(model_of(single_insulation()), [Arrival("2000")])
    first_block = types(result)[:9]
    assert first_block == ["MATERIAL_ARRIVED", "BUFFER_ENTERED", "INPUT_RESERVED", "ASSET_STATE_CHANGED",
                           "BUFFER_LEFT", "INPUT_CONSUMED", "PROCESS_STARTED", "ASSET_STATE_CHANGED",
                           "OUTPUT_UNIT_READY"]
    assert types(result)[-1] == "RUN_TERMINATED"
    assert [e.event_seq for e in result.events] == list(range(1, len(result.events) + 1))  # 안정된 순번
    started = result.of_type("PROCESS_STARTED")[0]
    assert started.step_key == "insulate" and started.operation_id == "insulate#1"
    assert started.asset_key == EQUIPMENT_1 and started.item_key == "item-0001"


def test_per_output_unit_handoff_makes_the_first_unit_available_downstream_immediately():
    result = run_model(model_of(single_insulation(handoff="per_output_unit")), [Arrival("2000")])
    assert times(result, "BUFFER_ENTERED", destination="wait_out") == [F(100, 3), F(200, 3)]
    assert times(result, "MILESTONE_REACHED") == [F(100, 3), F(200, 3)]
    assert times(result, "SINK_REACHED") == [F(100, 3), F(200, 3)]


def test_total_batch_handoff_releases_all_units_only_when_the_operation_finishes():
    result = run_model(model_of(single_insulation(handoff="total_batch")), [Arrival("2000")])
    assert times(result, "OUTPUT_UNIT_READY") == [F(100, 3), F(200, 3)]  # 내부 완료는 보빈별로 남는다
    assert times(result, "BUFFER_ENTERED", destination="wait_out") == [F(200, 3), F(200, 3)]  # 외부 가용은 일괄


def test_completion_milestone_is_flagged_only_on_the_completion_node():
    result = run_model(model_of(single_insulation()), [Arrival("2000")])
    reached = result.of_type("MILESTONE_REACHED")
    assert [e.reason for e in reached] == ["completion", "completion"]
    assert all(e.destination == "complete" for e in reached)


def test_setup_time_delays_processing_and_is_a_separate_asset_state():
    setup = {"duration_min": known("5"), "trigger": "per_operation"}
    result = run_model(model_of(single_insulation(setup=setup)), [Arrival("2000")])
    assert times(result, "SETUP_STARTED") == [F(0)] and times(result, "SETUP_FINISHED") == [F(5)]
    assert times(result, "PROCESS_STARTED") == [F(5)]
    assert times(result, "OUTPUT_UNIT_READY") == [F(5) + F(100, 3), F(5) + F(200, 3)]
    states = [e.quantities["state"] for e in result.of_type("ASSET_STATE_CHANGED")]
    assert states == ["RESERVED", "SETUP", "PROCESSING", "IDLE"]


# --- C0-03: 분할 추적(parent/child/remaining)과 길이 합계 -----------------------------------------

def test_split_lineage_records_parent_children_and_balanced_lengths():
    result = run_model(model_of(single_insulation()), [Arrival("2000", form="롤", lot="LOT-1")])
    (record,) = result.lineage
    assert (record.relation, record.step_key, record.operation_id) == ("split", "insulate", "insulate#1")
    assert record.parent_length_m == 2000 and record.child_lengths_m == (1000, 1000)
    assert record.residual_length_m == 0 and record.balanced
    items = {i.key: i for i in result.items}
    parent = items[record.parent_key]
    assert parent.status == "consumed" and parent.parent_key is None
    children = [items[k] for k in record.child_keys]
    assert [c.parent_key for c in children] == [parent.key, parent.key]
    assert all(c.status == "completed" and c.length_m == 1000 for c in children)
    assert all(c.form == "보빈" and c.state == "절연 후" and c.lot == "LOT-1" for c in children)  # 단계 spec의 상태·형태
    assert [c.created_at for c in children] == [F(100, 3), F(200, 3)]


def test_length_is_conserved_through_the_whole_run():
    result = run_model(model_of(single_insulation()), [Arrival("2000"), Arrival("2000", at=10)])
    finished = sum((i.length_m for i in result.items if i.status == "completed"), F(0))
    assert finished == 2000 + 2000  # 분할이어도 부모 합계 = 자식 합계(잔량 0)
    assert all(r.balanced for r in result.lineage)


def test_pass_through_keeps_the_same_item_and_only_changes_its_state():
    g = Graph()
    g.node("src", "source")
    g.node("braid", "operation", step("pass_through_length", processing=speed("20"),
                                      output={**out_pass(), "mode": "pass_through"}, assets=[EQUIPMENT_1],
                                      state="편조 후"))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    result = run_model(model_of(g.chain().snapshot()), [Arrival("2000", state="절연 후")])
    assert times(result, "OUTPUT_UNIT_READY") == [F(100)]  # 전체 길이가 지나가는 시간 2000/20
    assert len(result.items) == 1  # 새 작업물을 만들지 않는다
    item = result.items[0]
    assert item.state == "편조 후" and item.length_m == 2000 and item.status == "completed"
    (record,) = result.lineage
    assert record.relation == "transform" and record.balanced


def test_inspection_takes_fixed_time_per_item_and_runs_concurrently():
    g = Graph()
    g.node("src", "source")
    g.node("inspect", "operation", step("inspection", processing=per_unit("10"), output=out_pass(), worker=True,
                                        state="검사 후"))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    result = run_model(model_of(g.chain().snapshot()), [Arrival("500", count=3)])
    # 작업자 무제한: 동시 검사 허용, 그래도 각 작업물은 10분이 걸린다
    assert times(result, "PROCESS_STARTED") == [F(0)] * 3 and times(result, "PROCESS_FINISHED") == [F(10)] * 3
    assert result.state == "completed" and all(i.state == "검사 후" for i in result.items)


def test_manual_transport_uses_the_scenario_assumption():
    g = Graph()
    g.node("src", "source")
    g.node("forklift", "operation", {**step("transport_manual", processing={"kind": "unknown"}, output=out_pass()),
                                     "handoff_rule": {"mode": "unknown"}})
    g.node("complete", "milestone")
    g.node("sink", "sink")
    model = model_of(g.chain().snapshot(), ScenarioAssumptions(manual_transport_minutes={"forklift": F(7, 2)}))
    result = run_model(model, [Arrival("500")])
    assert times(result, "PROCESS_FINISHED") == [F(7, 2)] and times(result, "SINK_REACHED") == [F(7, 2)]
    assert any(a.code == "MANUAL_TRANSPORT_MINUTES" for a in result.assumptions)


# --- 설비 경쟁·공유 -------------------------------------------------------------------------

def asset_intervals(result, asset):
    """설비 상태 전이 이벤트에서 (상태, 시작, 끝) 구간을 만든다."""
    changes = [(e.sim_time, e.quantities["state"]) for e in result.of_type("ASSET_STATE_CHANGED")
               if e.asset_key == asset]
    return [(state, start, changes[i + 1][0]) for i, (start, state) in enumerate(changes[:-1])]


def test_one_equipment_serves_one_operation_at_a_time():
    result = run_model(model_of(single_insulation()), [Arrival("2000"), Arrival("2000")])
    assert times(result, "PROCESS_STARTED") == [F(0), F(200, 3)]  # 둘째는 첫째가 끝난 뒤에 시작
    processing = [(s, e) for state, s, e in asset_intervals(result, EQUIPMENT_1) if state == "PROCESSING"]
    assert processing == [(F(0), F(200, 3)), (F(200, 3), F(400, 3))]
    assert all(a_end <= b_start for (_, a_end), (b_start, _) in itertools.pairwise(processing))
    assert result.state == "completed" and result.end_time == F(400, 3)


def test_two_candidates_let_two_items_run_in_parallel_on_different_assets():
    snap = single_insulation(assets=(EQUIPMENT_1, EQUIPMENT_2), allocation="fifo")
    result = run_model(model_of(snap), [Arrival("2000"), Arrival("2000")])
    started = result.of_type("PROCESS_STARTED")
    assert [e.sim_time for e in started] == [F(0), F(0)]
    assert [e.asset_key for e in started] == [EQUIPMENT_1, EQUIPMENT_2]  # 후보 순서가 동순위 처리 순서


def test_the_same_equipment_shared_by_two_steps_is_a_single_resource():
    g = Graph()
    g.node("src", "source")
    for key in ("first", "second"):  # 같은 설비를 재방문하는 두 단계(07: 같은 asset_id는 한 번만 생성)
        g.node(key, "operation", step("pass_through_length", processing=speed("20"), output=out_pass(),
                                      assets=[EQUIPMENT_1], state=key))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    result = run_model(model_of(g.chain().snapshot()), [Arrival("2000"), Arrival("2000")])
    busy = [(s, e) for state, s, e in asset_intervals(result, EQUIPMENT_1) if state == "PROCESSING"]
    busy.sort()
    assert len(busy) == 4 and all(a_end <= b_start for (_, a_end), (b_start, _) in itertools.pairwise(busy))
    assert result.state == "completed"


# --- 종료 상태: 지평선 [0,H), 실패, 정체, 한도 ------------------------------------------------------

def test_fixed_horizon_is_half_open_events_at_h_are_not_processed():
    model = model_of(single_insulation())
    cut = run_model(model, [Arrival("2000")], horizon=F(200, 3))
    assert times(cut, "OUTPUT_UNIT_READY") == [F(100, 3)]  # 정확히 H=200/3의 둘째 산출은 처리하지 않는다
    assert cut.state == "horizon_reached" and cut.censored and cut.reason == "HORIZON"
    assert cut.end_time == F(200, 3)
    assert not cut.of_type("PROCESS_FINISHED")
    assert cut.of_type("RUN_TERMINATED")[0].quantities["operations_in_progress"] == 1  # 가공 중인 작업은 WIP다
    just_after = run_model(model, [Arrival("2000")], horizon=F(200, 3) + F(1, 1000))
    assert times(just_after, "OUTPUT_UNIT_READY") == [F(100, 3), F(200, 3)] and just_after.state == "completed"
    wide = run_model(model, [Arrival("2000")], horizon=100)
    assert wide.state == "completed" and wide.end_time == F(100) and not wide.censored


def test_future_arrivals_after_the_horizon_are_censored_not_completed():
    result = run_model(model_of(single_insulation()), [Arrival("2000", at=500)], horizon=100)
    assert result.state == "horizon_reached" and result.censored and not result.of_type("MATERIAL_ARRIVED")


def test_input_that_does_not_fit_the_step_fails_instead_of_being_hidden():
    result = run_model(model_of(single_insulation()), [Arrival("500")])  # 1,000m 단위 둘이 필요
    assert result.state == "failed" and result.reason == "INPUT_LENGTH_INCOMPATIBLE"
    last = result.events[-1]
    assert last.event_type == "RUN_TERMINATED" and last.step_key == "insulate"
    assert not result.of_type("ASSET_STATE_CHANGED")  # 설비를 쥐기 전에 실패한다


@pytest.mark.parametrize("residual,reason", [("none", "RESIDUAL_UNEXPECTED"),
                                              ("unknown", "RESIDUAL_POLICY_UNKNOWN")])
def test_leftover_length_is_never_silently_dropped(residual, reason):
    snap = single_insulation(count=None, residual=residual)  # 개수를 정하지 않으면 floor(2500/1000)=2, 500m 남음
    result = run_model(model_of(snap), [Arrival("2500")])
    assert result.state == "failed" and result.reason == reason
    assert "500" in result.events[-1].quantities["message"]


def test_work_in_progress_with_no_future_events_is_stalled_not_completed():
    run = _Run([Lane(model_of(single_insulation()), (Arrival("2000"),))], None, 0, None)
    run.allocator._busy.add(EQUIPMENT_1)  # 설비가 영원히 반환되지 않는 상황
    result = run.execute()
    assert result.state == "stalled" and result.reason == "WIP_REMAINING" and not result.censored
    assert result.of_type("RUN_TERMINATED")[0].quantities["wip_items"] == 1
    assert [i.status for i in result.items] == ["active"]


def test_event_limit_ends_the_run_as_limit_reached_not_success():
    result = run_model(model_of(single_insulation()), [Arrival("2000")], event_limit=5)
    assert result.state == "limit_reached" and result.reason == "EVENT_LIMIT" and len(result.events) == 5


# --- 입력 검증·재현성·경계 ------------------------------------------------------------------

@pytest.mark.parametrize("arrival", [Arrival(1000.5), Arrival("0"), Arrival("-5"), Arrival("100", at=-1),
                                     Arrival("100", count=0)])
def test_arrivals_must_be_exact_and_positive(arrival):
    with pytest.raises((TypeError, ValueError)):
        run_model(model_of(single_insulation()), [arrival])


def test_horizon_must_be_positive():
    with pytest.raises(ValueError):
        run_model(model_of(single_insulation()), [Arrival("2000")], horizon=0)


def test_same_input_and_seed_give_identical_events_and_seed_changes_nothing_yet():
    model = model_of(single_insulation(assets=(EQUIPMENT_1, EQUIPMENT_2), allocation="fifo"))
    arrivals = [Arrival("2000"), Arrival("2000", at=10), Arrival("2000", at=10)]
    a = run_model(model, arrivals, seed=1)
    b = run_model(model, arrivals, seed=1)
    c = run_model(model, arrivals, seed=99)  # 이번 범위의 handler에는 확률 요소가 없다
    dump = lambda r: [e.to_dict() for e in r.events]
    assert dump(a) == dump(b) == dump(c)
    assert [i.key for i in a.items] == [i.key for i in b.items]


def test_event_dict_has_exact_and_display_times():
    result = run_model(model_of(single_insulation()), [Arrival("2000")])
    ready = result.of_type("OUTPUT_UNIT_READY")[0].to_dict()
    assert ready["sim_time_exact"] == "100/3" and ready["sim_time_min"] == "33.333333"
    assert ready["quantities"]["length_m"] == "1000.000000"


def test_engine_package_does_not_import_http_or_orm_frameworks():
    code = ("import sys, simulation_platform.simulation.runtime, simulation_platform.simulation.compiler;"
            "bad = sorted(m for m in sys.modules if m.split('.')[0] in {'fastapi','starlette','sqlalchemy','psycopg'});"
            "print(bad); sys.exit(1 if bad else 0)")
    done = subprocess.run([sys.executable, "-I", "-c", code], capture_output=True, text=True, check=False,
                          env={"PYTHONPATH": str(__import__("pathlib").Path(__file__).resolve().parents[2] / "src")})
    assert done.returncode == 0, done.stdout + done.stderr


def test_storage_ids_are_only_labels_for_buffers():
    result = run_model(model_of(single_insulation()), [Arrival("2000")])
    entered = result.of_type("BUFFER_ENTERED")
    assert entered[0].asset_key == STORAGE_A and entered[0].destination == "wait_in"


def test_manual_transport_time_from_the_process_data_is_used_by_the_run():
    from fixtures import per_unit

    g = Graph()
    g.node("src", "source")
    g.node("forklift", "operation", step("transport_manual", processing=per_unit("4", "sequential_units"),
                                         output=out_pass(), worker=True))
    g.node("complete", "milestone")
    g.node("sink", "sink")
    result = run_model(model_of(g.chain().snapshot()), [Arrival("500", count=3)])
    # 보빈마다 독립 이동한다(운반 자원은 이번에는 무제한이라 서로 기다리지 않는다)
    assert times(result, "SINK_REACHED") == [4, 4, 4] and not result.assumptions
