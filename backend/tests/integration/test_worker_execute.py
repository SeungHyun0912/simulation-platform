"""worker의 자식 프로세스 감시: 취소·시간 제한·비정상 종료·엔진 오류를 구분한다(DB 불필요)."""

import time

from worker_targets import crashes, raises, sleeps_forever

from simulation_platform.worker.execute import CANCEL, CONTINUE, LOST, run_in_child


def never(action=CONTINUE):
    ticks = []

    def tick():
        ticks.append(time.monotonic())
        return action

    return tick, ticks


def test_a_cancel_request_stops_the_child_quickly():
    tick, ticks = never(CANCEL)
    started = time.monotonic()
    outcome = run_in_child({}, tick, tick_seconds=0.2, wall_timeout_seconds=60, target=sleeps_forever)
    assert outcome.kind == "cancelled" and len(ticks) == 1
    assert time.monotonic() - started < 30  # 600초 자는 자식이 취소로 바로 멈춘다


def test_losing_the_lease_also_stops_the_child():
    tick, _ = never(LOST)
    assert run_in_child({}, tick, tick_seconds=0.2, wall_timeout_seconds=60, target=sleeps_forever).kind == "lost"


def test_the_wall_clock_limit_kills_a_stuck_child():
    tick, ticks = never(CONTINUE)
    outcome = run_in_child({}, tick, tick_seconds=0.2, wall_timeout_seconds=1.5, target=sleeps_forever)
    assert outcome.kind == "timeout" and "한도" in outcome.detail
    assert ticks  # 기다리는 동안 계속 임대를 갱신하려고 tick을 불렀다


def test_a_child_that_dies_without_a_result_is_reported_as_crashed():
    tick, _ = never()
    outcome = run_in_child({}, tick, tick_seconds=0.2, wall_timeout_seconds=60, target=crashes)
    assert outcome.kind == "crashed" and "3" in outcome.detail


def test_an_engine_exception_is_reported_with_its_reason_and_is_not_a_crash():
    tick, _ = never()
    outcome = run_in_child({}, tick, tick_seconds=0.2, wall_timeout_seconds=60, target=raises)
    assert outcome.kind == "engine_error" and outcome.detail == "RuntimeError: 엔진 내부 오류 흉내"
