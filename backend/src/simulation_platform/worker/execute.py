"""엔진을 **자식 프로세스**에서 실행하고 부모가 heartbeat·취소·시간 제한을 감시한다. 기준: CR be08 §3.

엔진이 오래 걸리거나 멈춰도 부모는 임대를 계속 갱신하고(또는 잃은 것을 알고), 취소·wall-clock 한도를 지킬 수 있다. 자식은
`spawn`으로 새 인터프리터에서 시작해(Windows·Linux 동작이 같음) 스냅샷 dict만 받아 요약을 돌려준다.
"""

import multiprocessing
import time
from collections.abc import Callable
from dataclasses import dataclass

CONTINUE, CANCEL, LOST = "continue", "cancel", "lost"


@dataclass(frozen=True)
class ChildOutcome:
    kind: str  # ok | engine_error | crashed | timeout | cancelled | lost
    summary: dict | None = None
    detail: str | None = None


def _child_main(snapshot: dict, conn) -> None:  # pragma: no cover - 자식 프로세스에서 실행된다
    from simulation_platform.simulation.runner import run_snapshot

    def on_batch(kind: str, rows: list[dict]) -> None:
        conn.send(("batch", (kind, rows)))

    try:
        conn.send(("ok", run_snapshot(snapshot, on_batch)))
    except BaseException as exc:  # noqa: BLE001 - 어떤 오류든 부모에게 이유를 알린다
        conn.send(("engine_error", f"{type(exc).__name__}: {exc}"))
    finally:
        conn.close()


def run_in_child(snapshot: dict, on_tick: Callable[[], str], *, tick_seconds: float, wall_timeout_seconds: float,
                 on_batch: Callable[[str, list[dict]], str] | None = None, target=_child_main) -> ChildOutcome:
    """스냅샷을 자식 프로세스에서 실행한다. `on_tick`은 tick마다 부르며 CANCEL·LOST면 자식을 멈춘다.
    자식이 이벤트·작업물·계보를 묶음으로 보내면 `on_batch(kind, rows)`가 저장하고, 마찬가지로 CANCEL·LOST를 돌려주면 멈춘다.

    `target`은 시험에서 느리거나 비정상인 자식을 흉내 내는 데만 바꾼다."""
    ctx = multiprocessing.get_context("spawn")
    receiver, sender = ctx.Pipe(duplex=False)
    process = ctx.Process(target=target, args=(snapshot, sender), daemon=True)
    process.start()
    sender.close()
    deadline = time.monotonic() + wall_timeout_seconds
    next_tick = time.monotonic() + tick_seconds
    try:
        while True:
            if receiver.poll(min(0.2, tick_seconds)):
                try:
                    kind, payload = receiver.recv()
                except EOFError:
                    process.join(5)  # 종료 코드를 알 수 있게 잠시 기다린다
                    return ChildOutcome("crashed", detail=f"자식 프로세스가 결과 없이 닫혔습니다(종료 코드 {process.exitcode}).")
                if kind == "batch":
                    action = CONTINUE if on_batch is None else on_batch(*payload)
                    if action != CONTINUE:
                        return ChildOutcome("cancelled" if action == CANCEL else "lost")
                else:
                    process.join(5)
                    return ChildOutcome("ok", summary=payload) if kind == "ok" else ChildOutcome(kind, detail=payload)
            elif not process.is_alive():
                if receiver.poll(0):
                    continue
                return ChildOutcome("crashed", detail=f"자식 프로세스가 종료 코드 {process.exitcode}로 끝났습니다.")
            if time.monotonic() >= deadline:  # 자식이 끊임없이 묶음을 보내도 시간 제한·임대 갱신은 건너뛰지 않는다
                return ChildOutcome("timeout", detail=f"실행 시간 한도 {wall_timeout_seconds:g}초를 넘었습니다.")
            if time.monotonic() >= next_tick:
                next_tick = time.monotonic() + tick_seconds
                action = on_tick()
                if action != CONTINUE:
                    return ChildOutcome("cancelled" if action == CANCEL else "lost")
    finally:
        if process.is_alive():
            process.kill()
        process.join(5)
        receiver.close()
