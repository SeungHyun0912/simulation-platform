"""실행(run)·스냅샷·job·attempt 조회. 모든 쿼리는 project_id 조건을 필수로 받는다."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from simulation_platform.models import Job, RunAttempt, RunInputSnapshot, SimulationRun
from simulation_platform.repositories.keyset import apply_keyset


def get_run(session: Session, project_id: uuid.UUID, run_id: uuid.UUID,
            for_update: bool = False) -> SimulationRun | None:
    stmt = select(SimulationRun).where(SimulationRun.id == run_id, SimulationRun.project_id == project_id)
    if for_update:
        stmt = stmt.with_for_update()
    return session.scalars(stmt).one_or_none()


def find_by_key(session: Session, project_id: uuid.UUID, user_id: uuid.UUID, key: str) -> SimulationRun | None:
    return session.scalars(select(SimulationRun).where(
        SimulationRun.project_id == project_id, SimulationRun.requested_by == user_id,
        SimulationRun.idempotency_key == key)).one_or_none()


def list_runs(session: Session, project_id: uuid.UUID, *, limit: int, cursor_values: list | None,
              status: str | None, scenario_version_id: uuid.UUID | None) -> list[SimulationRun]:
    """최근 요청부터. limit+1건 반환."""
    stmt = select(SimulationRun).where(SimulationRun.project_id == project_id)
    if status is not None:
        stmt = stmt.where(SimulationRun.status == status)
    if scenario_version_id is not None:
        stmt = stmt.where(SimulationRun.scenario_version_id == scenario_version_id)
    stmt = apply_keyset(stmt, [SimulationRun.seq], True, cursor_values)
    return list(session.scalars(stmt.limit(limit + 1)))


def attempts_of(session: Session, project_id: uuid.UUID, run_id: uuid.UUID) -> list[RunAttempt]:
    return list(session.scalars(select(RunAttempt).where(
        RunAttempt.project_id == project_id, RunAttempt.run_id == run_id).order_by(RunAttempt.attempt_no)))


def snapshot_of(session: Session, project_id: uuid.UUID, run_id: uuid.UUID) -> RunInputSnapshot | None:
    return session.scalars(select(RunInputSnapshot).where(
        RunInputSnapshot.project_id == project_id, RunInputSnapshot.run_id == run_id)).one_or_none()


def job_of(session: Session, project_id: uuid.UUID, run_id: uuid.UUID, for_update: bool = False) -> Job | None:
    stmt = select(Job).where(Job.project_id == project_id, Job.run_id == run_id, Job.kind == "simulation_run")
    if for_update:
        stmt = stmt.with_for_update()
    return session.scalars(stmt).one_or_none()
