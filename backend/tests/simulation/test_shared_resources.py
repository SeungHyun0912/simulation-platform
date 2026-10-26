"""C0-04: 같은 설비를 서로 다른 제품(공정)이 공유하며 경쟁한다(ADR-015: 같은 asset_id는 실행에 한 번)."""

import itertools
from fractions import Fraction

import pytest
from fixtures import EQUIPMENT_1, EQUIPMENT_2, single_insulation, uid

from simulation_platform.simulation.compiler import ScenarioAssumptions, compile_snapshot
from simulation_platform.simulation.runtime import Arrival, Lane, run_model, run_models

OK = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True)
F = Fraction
PROJECT = uid()


def lane(arrivals, *, project=PROJECT, **snapshot_args):
    snap = single_insulation(project_id=project, **snapshot_args)
    return Lane(compile_snapshot(snap, OK).require_model(), tuple(arrivals))


def started(result, version):
    return [(e.sim_time, e.asset_key) for e in result.of_type("PROCESS_STARTED")
            if e.process_version_id == version]


def busy_intervals(result, asset):
    changes = [(e.sim_time, e.quantities["state"]) for e in result.of_type("ASSET_STATE_CHANGED")
               if e.asset_key == asset]
    return [(s, t, changes[i + 1][0]) for i, (t, s) in enumerate(changes[:-1])]


def test_two_products_compete_for_one_equipment_in_lane_order():
    a = lane([Arrival("2000")])                       # 2,000m → 1,000m×2 @30 → 200/3분
    b = lane([Arrival("2000")], speed_value="60")     # 1,000m @60 → 50/3분 단위, 합계 100/3분
    result = run_models([a, b])
    version_a, version_b = a.model.version_id, b.model.version_id
    assert result.process_version_ids == (version_a, version_b)
    # 같은 시각의 동순위는 lane 순서: A가 먼저 설비를 쥐고 B는 A가 끝난 뒤에 시작한다(설비는 하나의 자원)
    assert started(result, version_a) == [(F(0), EQUIPMENT_1)]
    assert started(result, version_b) == [(F(200, 3), EQUIPMENT_1)]
    processing = [(s, e) for state, s, e in busy_intervals(result, EQUIPMENT_1) if state == "PROCESSING"]
    assert processing == [(F(0), F(200, 3)), (F(200, 3), F(200, 3) + F(100, 3))]
    assert result.state == "completed" and result.end_time == F(100)


def test_lane_order_decides_ties_and_the_run_is_reproducible():
    a, b = lane([Arrival("2000")]), lane([Arrival("2000")], speed_value="60")
    first = run_models([a, b])
    flipped = run_models([b, a])
    assert started(first, a.model.version_id)[0][0] == 0 and started(first, b.model.version_id)[0][0] > 0
    assert started(flipped, b.model.version_id)[0][0] == 0 and started(flipped, a.model.version_id)[0][0] > 0
    dump = lambda r: [e.to_dict() for e in r.events]
    assert dump(run_models([a, b])) == dump(first)


def test_same_step_keys_in_different_products_do_not_mix():
    a = lane([Arrival("2000")])
    b = lane([Arrival("2000")], speed_value="60")
    assert list(a.model.steps) == list(b.model.steps) == ["insulate"]  # 두 제품이 같은 step key를 쓴다
    result = run_models([a, b])
    ready = {v: [e.sim_time for e in result.of_type("OUTPUT_UNIT_READY") if e.process_version_id == v]
             for v in (a.model.version_id, b.model.version_id)}
    assert ready[a.model.version_id] == [F(100, 3), F(200, 3)]
    assert ready[b.model.version_id] == [F(200, 3) + F(50, 3), F(200, 3) + F(100, 3)]
    assert len(result.of_type("SINK_REACHED")) == 4 and not [e for e in result.events if
                                                              e.event_type != "RUN_TERMINATED"
                                                              and e.process_version_id is None]


def test_waiting_is_first_come_first_served_across_products():
    a = lane([Arrival("2000"), Arrival("2000", at=20)])  # A의 둘째는 t=20에 도착
    b = lane([Arrival("2000", at=10)], speed_value="60")  # B는 t=10에 도착
    result = run_models([a, b])
    starts = sorted((e.sim_time, e.process_version_id) for e in result.of_type("PROCESS_STARTED"))
    # A1 즉시 → B(t=10 요청)가 A(t=20 요청)보다 먼저 배정된다
    assert [v for _, v in starts] == [a.model.version_id, b.model.version_id, a.model.version_id]
    assert starts[1][0] == F(200, 3) and starts[2][0] == F(200, 3) + F(100, 3)


def test_overlapping_candidate_sets_share_the_same_asset():
    a = lane([Arrival("2000"), Arrival("2000")], assets=(EQUIPMENT_1, EQUIPMENT_2), allocation="fifo")
    b = lane([Arrival("2000")], speed_value="60")  # B는 EQUIPMENT_1만 쓸 수 있다
    result = run_models([a, b])
    assert [(t, s) for t, s in started(result, a.model.version_id)] == [(F(0), EQUIPMENT_1), (F(0), EQUIPMENT_2)]
    assert started(result, b.model.version_id) == [(F(200, 3), EQUIPMENT_1)]  # A1이 쥔 설비가 풀릴 때까지 대기
    for asset in (EQUIPMENT_1, EQUIPMENT_2):
        intervals = sorted((s, e) for state, s, e in busy_intervals(result, asset) if state == "PROCESSING")
        assert all(x_end <= y_start for (_, x_end), (y_start, _) in itertools.pairwise(intervals))


def test_previous_product_on_the_selected_asset_is_recorded_without_adding_changeover_time():
    a = lane([Arrival("2000")])
    b = lane([Arrival("2000")], speed_value="60")
    result = run_models([a, b])
    reserved = [e for e in result.of_type("ASSET_STATE_CHANGED") if e.quantities["state"] == "RESERVED"]
    assert [e.quantities["previous_process_version_id"] for e in reserved] == [None, a.model.version_id]
    assert [e.process_version_id for e in reserved] == [a.model.version_id, b.model.version_id]
    # 교체 시간은 임의로 더하지 않는다: B는 A가 끝난 바로 그 시각에 시작한다
    assert started(result, b.model.version_id)[0][0] == F(200, 3)


def test_allocator_serves_the_oldest_waiter_and_keeps_the_candidate_order():
    """대기열을 훑지 않는 구현이어도 순서는 그대로다: 풀린 설비는 그 설비를 후보로 가진 가장 오래된 대기자에게,
    후보가 여럿이면 후보 목록의 앞쪽 빈 설비가 먼저, 다른 후보로 이미 배정된 대기자는 건너뛴다."""
    import simpy

    from simulation_platform.simulation.resources import EquipmentAllocator

    env = simpy.Environment()
    pool = EquipmentAllocator(env)
    assert pool.acquire(("a", "b")).value == "a"  # 후보 순서의 첫 빈 설비
    assert pool.acquire(("a", "b")).value == "b"
    first, second, third = pool.acquire(("a", "b")), pool.acquire(("b",)), pool.acquire(("a",))
    assert not (first.triggered or second.triggered or third.triggered)
    pool.release("b")  # b를 후보로 가진 가장 오래된 대기자는 first
    assert first.triggered and first.value == "b" and not second.triggered
    pool.release("a")  # a는 first가 아닌 다음 대기자(third)에게. first는 이미 배정돼 건너뛴다
    assert third.triggered and third.value == "a" and not second.triggered
    pool.release("b")
    assert second.triggered and second.value == "b"
    assert pool.is_busy("a") and pool.is_busy("b")


def test_lineage_and_items_carry_their_product_and_stay_balanced():
    a, b = lane([Arrival("2000")]), lane([Arrival("2000")], speed_value="60")
    result = run_models([a, b])
    assert {r.process_version_id for r in result.lineage} == {a.model.version_id, b.model.version_id}
    assert all(r.balanced for r in result.lineage)
    by_version = {v: sum((i.length_m for i in result.items if i.process_version_id == v and
                          i.status == "completed"), F(0)) for v in result.process_version_ids}
    assert by_version == {a.model.version_id: 2000, b.model.version_id: 2000}


def test_a_failure_in_one_product_names_the_product():
    a, b = lane([Arrival("2000")]), lane([Arrival("500")], speed_value="60")  # B의 입력은 짧다
    result = run_models([a, b])
    assert result.state == "failed" and result.reason == "INPUT_LENGTH_INCOMPATIBLE"
    assert result.events[-1].process_version_id == b.model.version_id


def test_horizon_applies_to_all_products_together():
    a, b = lane([Arrival("2000")]), lane([Arrival("2000")], speed_value="60")
    result = run_models([a, b], horizon=F(100))
    assert result.state == "horizon_reached" and result.censored  # B의 마지막 산출이 정확히 H=100이라 처리되지 않는다
    assert [e.sim_time for e in result.of_type("OUTPUT_UNIT_READY")
            if e.process_version_id == b.model.version_id] == [F(200, 3) + F(50, 3)]


def test_products_of_different_projects_cannot_share_equipment_in_one_run():
    a, b = lane([Arrival("2000")]), lane([Arrival("2000")], project=uid())
    with pytest.raises(ValueError, match="프로젝트"):
        run_models([a, b])


def test_same_version_twice_or_no_lanes_is_rejected():
    a = lane([Arrival("2000")])
    with pytest.raises(ValueError, match="두 번"):
        run_models([a, a])
    with pytest.raises(ValueError, match="없습니다"):
        run_models([])


def test_single_model_wrapper_matches_a_one_lane_run():
    a = lane([Arrival("2000")])
    single = run_model(a.model, list(a.arrivals))
    multi = run_models([a])
    assert [e.to_dict() for e in single.events] == [e.to_dict() for e in multi.events]
    assert all(e.process_version_id == a.model.version_id for e in single.events
               if e.event_type != "RUN_TERMINATED")
