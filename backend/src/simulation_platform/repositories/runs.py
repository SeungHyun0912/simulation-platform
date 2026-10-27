"""실행(run)·스냅샷·job·attempt 조회. 모든 쿼리는 project_id 조건을 필수로 받는다."""

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from simulation_platform.models import (
    Job,
    RunAttempt,
    RunInputSnapshot,
    RunWorkItem,
    RunWorkItemRelation,
    SimulationEvent,
    SimulationRun,
)
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


def list_events(session: Session, project_id: uuid.UUID, attempt_id: uuid.UUID, *, limit: int,
                cursor_values: list | None, event_type: str | None, step_key: str | None, asset_key: str | None,
                item_key: str | None, from_min: Decimal | None, to_min: Decimal | None) -> list[SimulationEvent]:
    """event_seq 순서. limit+1건 반환. 필터는 모두 AND이고 시각은 [from_min, to_min)이다."""
    stmt = select(SimulationEvent).where(SimulationEvent.project_id == project_id,
                                         SimulationEvent.attempt_id == attempt_id)
    for column, value in ((SimulationEvent.event_type, event_type), (SimulationEvent.step_key, step_key),
                          (SimulationEvent.asset_key, asset_key), (SimulationEvent.item_key, item_key)):
        if value is not None:
            stmt = stmt.where(column == value)
    if from_min is not None:
        stmt = stmt.where(SimulationEvent.sim_time_min >= from_min)
    if to_min is not None:
        stmt = stmt.where(SimulationEvent.sim_time_min < to_min)
    stmt = apply_keyset(stmt, [SimulationEvent.event_seq], False, cursor_values)
    return list(session.scalars(stmt.limit(limit + 1)))


def get_work_item(session: Session, project_id: uuid.UUID, attempt_id: uuid.UUID, item_key: str) -> RunWorkItem | None:
    return session.scalars(select(RunWorkItem).where(
        RunWorkItem.project_id == project_id, RunWorkItem.attempt_id == attempt_id,
        RunWorkItem.item_key == item_key)).one_or_none()


def work_items(session: Session, project_id: uuid.UUID, attempt_id: uuid.UUID, keys) -> list[RunWorkItem]:
    return list(session.scalars(select(RunWorkItem).where(
        RunWorkItem.project_id == project_id, RunWorkItem.attempt_id == attempt_id,
        RunWorkItem.item_key.in_(list(keys))).order_by(RunWorkItem.item_key)))


def relations_of(session: Session, project_id: uuid.UUID, attempt_id: uuid.UUID, keys, *,
                 as_child: bool) -> list[RunWorkItemRelation]:
    """주어진 작업물이 자식인(조상을 찾을 때) 또는 부모인(후손을 찾을 때) 계보 행."""
    column = RunWorkItemRelation.child_key if as_child else RunWorkItemRelation.parent_key
    return list(session.scalars(select(RunWorkItemRelation).where(
        RunWorkItemRelation.project_id == project_id, RunWorkItemRelation.attempt_id == attempt_id,
        column.in_(list(keys))).order_by(RunWorkItemRelation.seq)))


def relations_of_operations(session: Session, project_id: uuid.UUID, attempt_id: uuid.UUID,
                            operation_keys) -> list[RunWorkItemRelation]:
    """한 작업의 모든 부모→자식 행(작업 하나를 통째로 보여 주기 위해)."""
    return list(session.scalars(select(RunWorkItemRelation).where(
        RunWorkItemRelation.project_id == project_id, RunWorkItemRelation.attempt_id == attempt_id,
        RunWorkItemRelation.operation_key.in_(list(operation_keys))).order_by(RunWorkItemRelation.seq)))
