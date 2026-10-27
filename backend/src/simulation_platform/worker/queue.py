"""DB 작업 큐: claim · 임대(lease) 갱신 · 끝내기. 기준: CR be08(DEC-008) be08a.

- claim은 `FOR UPDATE SKIP LOCKED`라 여러 worker가 동시에 가져가도 job 하나는 한 worker만 받는다.
- 임대가 끝난 job은 다른 worker가 다시 가져갈 수 있고(이전 시도는 abandoned), 가져갈 때마다 attempt_count와 임대 토큰이 바뀐다.
  늦게 끝난 옛 worker의 모든 쓰기는 이 번호·토큰이 달라 거부된다(fencing, `LeaseLost`).
- 잠그는 순서는 API의 취소와 같다(job → run). 시간은 DB의 now()를 쓴다(worker PC의 시계 차이를 피한다).
- worker는 입력 스냅샷만 읽는다(현재 master를 읽지 않음).
"""

import uuid
from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import and_, func, insert, or_, select, update
from sqlalchemy.orm import Session

from simulation_platform.models import (
    Job,
    MetricResult,
    RunAttempt,
    RunInputSnapshot,
    RunWorkItem,
    RunWorkItemRelation,
    SimulationEvent,
    SimulationRun,
)


class LeaseLost(Exception):
    """내가 가진 임대가 끝났거나 다른 worker가 이 job을 가져갔다. 결과를 쓰지 말고 물러나야 한다."""


@dataclass(frozen=True)
class Claim:
    job_id: uuid.UUID
    run_id: uuid.UUID
    project_id: uuid.UUID
    attempt_id: uuid.UUID
    fencing_token: int  # = attempt_no
    lease_token: uuid.UUID
    worker_id: str


def _after(seconds: float):
    return func.now() + timedelta(seconds=seconds)


def claim_next(session: Session, worker_id: str, lease_seconds: float) -> Claim | None:
    """가져갈 job을 하나 잡는다. 없으면 None. 이미 취소됐거나 시도 한도를 넘긴 job은 정리하고 다음 것을 본다."""
    while True:
        job = session.scalars(
            select(Job).where(Job.kind == "simulation_run").where(or_(
                and_(Job.state == "queued", Job.available_at <= func.now()),
                and_(Job.state == "claimed", Job.lease_expires_at < func.now())))
            .order_by(Job.priority.desc(), Job.available_at).limit(1).with_for_update(skip_locked=True)
        ).one_or_none()
        if job is None:
            session.rollback()
            return None
        run = session.scalars(select(SimulationRun).where(
            SimulationRun.id == job.run_id, SimulationRun.project_id == job.project_id).with_for_update()).one()
        if job.state == "claimed":  # 임대가 끝났다: 이전 시도는 버려졌다
            session.execute(update(RunAttempt).where(
                RunAttempt.run_id == job.run_id, RunAttempt.attempt_no == job.attempt_count,
                RunAttempt.state == "running").values(state="abandoned", finished_at=func.now(),
                                                      termination_reason="LEASE_EXPIRED"))
            if job.attempt_count >= job.max_attempts:
                job.state, job.lease_token, job.lease_expires_at = "failed", None, None
                run.status, run.finished_at, run.termination_reason = "failed", func.now(), "WORKER_LOST"
                session.commit()
                continue
        if run.cancel_requested_at is not None:  # 시작하기 전에 취소가 요청됐다
            job.state, job.lease_token, job.lease_expires_at = "cancelled", None, None
            run.status, run.finished_at, run.termination_reason = "cancelled", func.now(), "CANCELLED_BEFORE_START"
            session.commit()
            continue
        job.attempt_count += 1
        job.state, job.lease_owner = "claimed", worker_id
        job.lease_token, job.lease_expires_at = uuid.uuid4(), _after(lease_seconds)
        attempt = RunAttempt(
            id=uuid.uuid4(), project_id=job.project_id, run_id=job.run_id, attempt_no=job.attempt_count,
            fencing_token=job.attempt_count, worker_id=worker_id, state="running", heartbeat_at=func.now())
        session.add(attempt)
        run.status = "running"
        if run.started_at is None:
            run.started_at = func.now()
        session.flush()
        claim = Claim(job.id, job.run_id, job.project_id, attempt.id, attempt.fencing_token, job.lease_token,
                      worker_id)
        session.commit()
        return claim


def heartbeat(session: Session, claim: Claim, lease_seconds: float) -> bool:
    """임대를 늘린다. 취소가 요청됐으면 True. 임대를 잃었으면 `LeaseLost`."""
    row = session.execute(update(Job).where(
        Job.id == claim.job_id, Job.lease_token == claim.lease_token, Job.state == "claimed",
        Job.attempt_count == claim.fencing_token).values(lease_expires_at=_after(lease_seconds)).returning(Job.id)
    ).first()
    if row is None:
        session.rollback()
        raise LeaseLost(str(claim.job_id))
    session.execute(update(RunAttempt).where(
        RunAttempt.id == claim.attempt_id, RunAttempt.fencing_token == claim.fencing_token,
        RunAttempt.state == "running").values(heartbeat_at=func.now()))
    cancel = session.scalar(select(SimulationRun.cancel_requested_at).where(
        SimulationRun.id == claim.run_id, SimulationRun.project_id == claim.project_id)) is not None
    session.commit()
    return cancel


def _dec(value: str | None) -> Decimal | None:
    return None if value is None else Decimal(value)


def _event_row(claim: Claim, row: dict) -> dict:
    return {"attempt_id": claim.attempt_id, "project_id": claim.project_id, "event_seq": row["event_seq"],
            "sim_time_min": Decimal(row["sim_time_min"]), "sim_time_exact": row["sim_time_exact"],
            "event_type": row["event_type"], "step_key": row["step_key"], "operation_id": row["operation_id"],
            "asset_key": row["asset_key"], "item_key": row["item_key"],
            "process_version_id": row["process_version_id"], "source": row["source"],
            "destination": row["destination"], "reason": row["reason"], "quantities": row["quantities"]}


def _item_row(claim: Claim, row: dict) -> dict:
    return {"attempt_id": claim.attempt_id, "project_id": claim.project_id, "item_key": row["item_key"],
            "parent_key": row["parent_key"], "process_version_id": row["process_version_id"],
            "lot_key": row["lot_key"], "state_code": row["state_code"], "form": row["form"],
            "length_m": _dec(row["length_m"]), "weight_kg": _dec(row["weight_kg"]),
            "location_key": row["location_key"], "status": row["status"],
            "created_at_min": Decimal(row["created_at_min"]["min"]), "created_at_exact": row["created_at_min"]["exact"]}


def _relation_row(claim: Claim, row: dict) -> dict:
    amounts = {k: _dec(row[k]) for k in ("parent_length_m", "child_length_m", "residual_length_m", "carried_in_m")}
    plain = {k: row[k] for k in ("seq", "operation_key", "step_key", "relation_type", "accounting_mode",
                                 "process_version_id", "parent_key", "child_key", "balanced")}
    return {"attempt_id": claim.attempt_id, "project_id": claim.project_id, **plain, **amounts}


def _metric_row(claim: Claim, row: dict) -> dict:
    start, end = row["window_start_min"], row["window_end_min"]
    return {"attempt_id": claim.attempt_id, "project_id": claim.project_id, "metric_key": row["metric_key"],
            "dimensions": row["dimensions"], "dimensions_hash": row["dimensions_hash"],
            "window_kind": row["window_kind"], "window_start_min": Decimal(start["min"]),
            "window_start_exact": start["exact"], "window_end_min": Decimal(end["min"]),
            "window_end_exact": end["exact"], "value": _dec(row["value"]), "unit": row["unit"],
            "definition_version": row["definition_version"], "quality_status": row["quality_status"]}


BATCH_KINDS = {"events": (SimulationEvent, _event_row), "items": (RunWorkItem, _item_row),
               "relations": (RunWorkItemRelation, _relation_row), "metrics": (MetricResult, _metric_row)}


def write_batch(session: Session, claim: Claim, kind: str, rows: list[dict], lease_seconds: float) -> bool:
    """엔진이 낸 이벤트·작업물·계보 한 묶음을 이 시도에 저장한다. 임대·fencing을 같은 트랜잭션에서 확인하고(옛 worker의
    쓰기를 거부, `LeaseLost`) 임대도 함께 늘린다. 취소가 요청됐으면 True."""
    model, convert = BATCH_KINDS[kind]
    leased = session.execute(update(Job).where(
        Job.id == claim.job_id, Job.lease_token == claim.lease_token, Job.state == "claimed",
        Job.attempt_count == claim.fencing_token).values(lease_expires_at=_after(lease_seconds)).returning(Job.id)
    ).first()
    if leased is None:
        session.rollback()
        raise LeaseLost(str(claim.job_id))
    session.execute(insert(model), [convert(claim, row) for row in rows])
    session.execute(update(RunAttempt).where(
        RunAttempt.id == claim.attempt_id, RunAttempt.fencing_token == claim.fencing_token,
        RunAttempt.state == "running").values(heartbeat_at=func.now()))
    cancel = session.scalar(select(SimulationRun.cancel_requested_at).where(
        SimulationRun.id == claim.run_id, SimulationRun.project_id == claim.project_id)) is not None
    session.commit()
    return cancel


def load_snapshot(session: Session, claim: Claim) -> RunInputSnapshot:
    snapshot = session.scalars(select(RunInputSnapshot).where(
        RunInputSnapshot.project_id == claim.project_id, RunInputSnapshot.run_id == claim.run_id)).one()
    session.rollback()  # 읽기만 했으므로 트랜잭션을 닫는다
    return snapshot


def finish(session: Session, claim: Claim, *, outcome: str, summary: dict | None = None,
           reason: str | None = None, detail: str | None = None, retry: bool = False,
           retry_after_seconds: float = 5.0) -> str:
    """시도를 끝낸다. outcome: finished(엔진이 끝까지 감, 결과 요약 있음) | cancelled | failed(인프라 실패).

    임대·fencing 확인에 실패하면 아무것도 쓰지 않고 `LeaseLost`를 낸다. 돌려주는 값은 run의 새 상태다."""
    job = session.scalars(select(Job).where(Job.id == claim.job_id, Job.project_id == claim.project_id)
                          .with_for_update()).one()
    if job.lease_token != claim.lease_token or job.state != "claimed" or job.attempt_count != claim.fencing_token:
        session.rollback()
        raise LeaseLost(str(claim.job_id))
    run = session.scalars(select(SimulationRun).where(
        SimulationRun.id == claim.run_id, SimulationRun.project_id == claim.project_id).with_for_update()).one()
    attempt = session.get(RunAttempt, claim.attempt_id, with_for_update=True)
    attempt.finished_at, attempt.termination_reason, attempt.error_detail = func.now(), reason, detail
    job.lease_token, job.lease_expires_at = None, None
    if outcome == "finished":
        attempt.state, attempt.result_summary = "finished", summary
        run.status, run.termination_reason = summary["state"], summary.get("reason")
        run.finished_at, run.selected_attempt_id = func.now(), attempt.id
        job.state = "done"
    elif outcome == "cancelled":
        attempt.state, job.state = "cancelled", "cancelled"
        run.status, run.termination_reason, run.finished_at = "cancelled", "CANCELLED", func.now()
    elif retry and job.attempt_count < job.max_attempts:  # 인프라 실패(예: worker 비정상 종료)는 다시 시도한다
        attempt.state, job.state = "failed", "queued"
        job.available_at = _after(retry_after_seconds)
        run.status = "queued"
    else:
        attempt.state, job.state = "failed", "failed"
        run.status, run.termination_reason, run.finished_at = "failed", reason, func.now()
    status = run.status
    session.commit()
    return status
