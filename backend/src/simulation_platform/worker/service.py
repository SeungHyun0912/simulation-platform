"""worker 한 번의 일: claim → 스냅샷 확인 → 자식 프로세스에서 실행 → 결과 기록. API 프로세스와 분리된 경계다.

HTTP·FastAPI를 쓰지 않는다. DB는 큐 모듈을 통해서만 만진다(모든 쓰기는 임대·fencing 확인을 거친다).
"""

import logging
import os
import socket
import time
import uuid
from collections.abc import Callable

from sqlalchemy.orm import Session, sessionmaker

from simulation_platform.domain.run import sha256_of
from simulation_platform.settings import Settings
from simulation_platform.worker import queue
from simulation_platform.worker.execute import CANCEL, CONTINUE, LOST, ChildOutcome, run_in_child

log = logging.getLogger("simulation_platform.worker")


def default_worker_id() -> str:
    return f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:6]}"


def process_one(sessions: sessionmaker[Session], settings: Settings, worker_id: str,
                runner: Callable[..., ChildOutcome] = run_in_child) -> str | None:
    """job 하나를 처리한다. 가져올 job이 없으면 None, 처리했으면 run의 새 상태(임대를 잃어 버렸으면 'lost')."""
    with sessions() as session:
        claim = queue.claim_next(session, worker_id, settings.worker_lease_seconds)
    if claim is None:
        return None
    log.info("claimed run=%s attempt=%s", claim.run_id, claim.fencing_token)

    with sessions() as session:
        stored = queue.load_snapshot(session, claim)
        snapshot, expected = stored.snapshot, stored.sha256
    if sha256_of(snapshot) != expected:  # 저장된 입력이 요청 때와 다르면 실행하지 않는다(불변이어야 한다)
        return _finish(sessions, claim, outcome="failed", reason="SNAPSHOT_HASH_MISMATCH",
                       detail="저장된 입력 스냅샷의 해시가 요청 때와 다릅니다.")

    def tick() -> str:
        with sessions() as session:
            try:
                return CANCEL if queue.heartbeat(session, claim, settings.worker_lease_seconds) else CONTINUE
            except queue.LeaseLost:
                return LOST

    outcome = runner(snapshot, tick, tick_seconds=settings.worker_heartbeat_seconds,
                     wall_timeout_seconds=settings.worker_wall_timeout_seconds)
    if outcome.kind == "ok":
        return _finish(sessions, claim, outcome="finished", summary=outcome.summary,
                       reason=outcome.summary.get("reason"))
    if outcome.kind == "cancelled":
        return _finish(sessions, claim, outcome="cancelled")
    if outcome.kind == "lost":
        log.warning("lease lost run=%s; dropping the result", claim.run_id)
        return "lost"
    reasons = {"engine_error": ("ENGINE_ERROR", False), "timeout": ("WALL_TIMEOUT", False),
               "crashed": ("WORKER_CRASH", True)}
    reason, retry = reasons[outcome.kind]
    return _finish(sessions, claim, outcome="failed", reason=reason, detail=outcome.detail, retry=retry)


def _finish(sessions: sessionmaker[Session], claim: queue.Claim, **fields) -> str:
    with sessions() as session:
        try:
            status = queue.finish(session, claim, **fields)
        except queue.LeaseLost:
            log.warning("lease lost before finishing run=%s; the result is discarded", claim.run_id)
            return "lost"
    log.info("finished run=%s status=%s", claim.run_id, status)
    return status


def run_forever(sessions: sessionmaker[Session], settings: Settings, worker_id: str,
                should_stop: Callable[[], bool] = lambda: False) -> None:
    while not should_stop():
        try:
            handled = process_one(sessions, settings, worker_id)
        except Exception:
            log.exception("worker error")
            handled = None
        if handled is None:
            time.sleep(settings.worker_poll_seconds)
