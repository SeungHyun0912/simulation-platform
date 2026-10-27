"""CR be08b: 하루·주·월 경계의 관측용 상태 요약(`STATE_SNAPSHOT`)과 이벤트 배치 전달(DB 불필요)."""

from fractions import Fraction

from fixtures import single_insulation

from simulation_platform.simulation.compiler import ScenarioAssumptions, compile_snapshot
from simulation_platform.simulation.runtime import Arrival, Lane, run_models

OK = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True)
DAY = 1440


def build(**kwargs):
    return compile_snapshot(single_insulation(**kwargs), OK).require_model()


MODEL = build()  # 같은 모델을 재사용해야 실행끼리 이벤트(공정 버전 id 포함)를 비교할 수 있다


def run(*arrivals, model=MODEL, **options):
    return run_models([Lane(model, tuple(arrivals))], **options)


def snapshots(result):
    return result.of_type("STATE_SNAPSHOT")


def test_a_snapshot_is_left_at_every_day_boundary_before_the_events_after_it():
    result = run(Arrival("2000"), Arrival("2000", at=3000), daily_snapshots=True)
    found = snapshots(result)
    assert [e.sim_time for e in found] == [Fraction(DAY), Fraction(2 * DAY)]  # 3,000분에 도착하므로 3일차 경계는 없다
    assert [e.quantities["day_index"] for e in found] == [1, 2]
    assert all(e.quantities["periods"] == ["day"] for e in found)
    # 번호는 이어지고 시각은 거꾸로 가지 않는다(경계 이벤트는 그 경계 이후 첫 이벤트 앞에 놓인다)
    assert [e.event_seq for e in result.events] == list(range(1, len(result.events) + 1))
    times = [e.sim_time for e in result.events]
    assert times == sorted(times)
    state = found[0].quantities
    assert set(state) == {"periods", "day_index", "wip", "operations_in_progress", "busy_assets", "space_used",
                          "completed", "residual_pools"}
    assert state["operations_in_progress"] == 0 and state["busy_assets"] == []  # 첫 작업은 이미 끝났다


def test_week_and_month_boundaries_are_marked_on_the_day_snapshot():
    result = run(Arrival("2000", at=35 * DAY), daily_snapshots=True)
    periods = {e.quantities["day_index"]: e.quantities["periods"] for e in snapshots(result)}
    assert sorted(periods) == list(range(1, 36))
    assert periods[7] == ["day", "week"] and periods[14] == ["day", "week"]
    assert periods[30] == ["day", "month"] and periods[1] == ["day"]
    assert periods[28] == ["day", "week"]


def test_a_snapshot_reports_material_waiting_and_machines_busy_at_that_moment():
    # 60,000m / 30m/min = 2,000분이라 1일차 경계(1,440분)에서 설비가 일하는 중이고 보빈 하나는 이미 나왔다
    result = run(Arrival("60000"), model=build(unit=30000), daily_snapshots=True)
    first = snapshots(result)[0].quantities
    assert result.state == "completed" and snapshots(result)[0].sim_time == Fraction(DAY)
    assert first["operations_in_progress"] == 1 and len(first["busy_assets"]) == 1


def test_snapshots_do_not_change_the_simulation_itself():
    arrivals = (Arrival("2000"), Arrival("2000", at=5000), Arrival("3000", at=7000))
    plain, observed = run(*arrivals), run(*arrivals, daily_snapshots=True)

    def core(result):
        return [(e.sim_time, e.event_type, e.step_key, e.item_key, e.asset_key)
                for e in result.events if e.event_type != "STATE_SNAPSHOT"]

    assert core(plain) == core(observed) and plain.end_time == observed.end_time
    assert (plain.state, plain.reason) == (observed.state, observed.reason)
    assert not snapshots(plain)  # 켜지 않으면 이벤트가 늘지 않는다(기존 결과 그대로)
    assert run(*arrivals, daily_snapshots=True).events == observed.events  # 같은 입력이면 같은 이벤트


def test_events_can_be_streamed_in_batches_without_keeping_them_in_memory():
    arrivals = (Arrival("2000"), Arrival("2000", at=3000))
    kept = run(*arrivals, daily_snapshots=True)
    batches = []
    streamed = run(*arrivals, daily_snapshots=True, event_sink=batches.append, retain_events=False, batch_size=7)
    assert streamed.events == () and streamed.event_count == len(kept.events)
    assert [len(b) for b in batches[:-1]] == [7] * (len(batches) - 1) and 0 < len(batches[-1]) <= 7
    assert [e for b in batches for e in b] == list(kept.events)  # 순서·번호·내용이 같다
    assert streamed.end_time == kept.end_time and streamed.state == kept.state


def test_the_event_limit_counts_streamed_events_and_snapshots_too():
    result = run(Arrival("2000", at=10 * DAY), daily_snapshots=True, event_limit=5, retain_events=False,
                 event_sink=lambda batch: None)
    assert result.state == "limit_reached" and result.event_count == 5
