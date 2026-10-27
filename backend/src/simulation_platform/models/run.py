"""단계 C 실행: 요청한 run, 불변 입력 스냅샷, DB 작업 큐(job), 시도(attempt). 기준: CR be08 §3, ERD §6.

run을 만드는 순간 입력 스냅샷과 job이 한 트랜잭션으로 생기고, worker는 스냅샷만 읽어 실행한다(현재 master를 읽지 않음).
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from simulation_platform.models.base import Base, CreatedMixin, IdMixin

# run: 대기·진행 중 + 엔진 종료 상태 그대로(완료와 정체를 구분) + 취소
RUN_STATUSES = ("queued", "running", "completed", "stalled", "horizon_reached", "failed", "limit_reached",
                "cancelled")
TERMINAL_RUN_STATUSES = RUN_STATUSES[2:]
JOB_STATES = ("queued", "claimed", "done", "failed", "cancelled")
ATTEMPT_STATES = ("running", "finished", "failed", "cancelled", "abandoned")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class SimulationRun(IdMixin, CreatedMixin, Base):
    __tablename__ = "simulation_run"
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "scenario_version_id"],
                             ["scenario_version.project_id", "scenario_version.id"],
                             name="fk_simulation_run_scenario_version", ondelete="RESTRICT"),
        ForeignKeyConstraint(["requested_by"], ["app_user.id"], name="fk_simulation_run_requested_by",
                             ondelete="RESTRICT"),
        UniqueConstraint("project_id", "id", name="uq_simulation_run_project_id"),
        UniqueConstraint("project_id", "requested_by", "idempotency_key", name="uq_simulation_run_idempotency"),
        # 공식 결과 시도는 그 run의 시도여야 한다(run ↔ attempt 상호 참조라 테이블 생성 뒤에 추가)
        ForeignKeyConstraint(["project_id", "id", "selected_attempt_id"],
                             ["run_attempt.project_id", "run_attempt.run_id", "run_attempt.id"],
                             name="fk_simulation_run_selected_attempt", ondelete="RESTRICT", use_alter=True),
        CheckConstraint(_in("status", RUN_STATUSES), name="ck_simulation_run_status"),
        CheckConstraint("seed >= 0 AND replicate_index >= 0", name="ck_simulation_run_seed"),
        CheckConstraint("btrim(idempotency_key) <> ''", name="ck_simulation_run_idempotency_key"),
        Index("ix_simulation_run_project_seq", "project_id", "seq"),
        Index("ix_simulation_run_scenario_version_id", "scenario_version_id"),
    )

    seq: Mapped[int] = mapped_column(BigInteger, Identity(always=True))  # 목록 정렬용(생성 순서)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    scenario_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    status: Mapped[str] = mapped_column(Text, server_default="queued")
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    seed: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    replicate_index: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    engine_version: Mapped[str] = mapped_column(Text)
    input_hash: Mapped[str] = mapped_column(Text)
    idempotency_key: Mapped[str] = mapped_column(Text)
    request_hash: Mapped[str] = mapped_column(Text)  # 같은 Idempotency-Key의 본문이 같은지 비교
    cancel_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_requested_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    termination_reason: Mapped[str | None] = mapped_column(Text)
    selected_attempt_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))  # 공식 결과 시도(성공한 하나)


class RunInputSnapshot(IdMixin, CreatedMixin, Base):
    """실행 입력의 불변 사본. 수정·삭제는 DB 트리거가 막고, sha256은 정규화 JSON의 해시다."""

    __tablename__ = "run_input_snapshot"
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "run_id"], ["simulation_run.project_id", "simulation_run.id"],
                             name="fk_run_input_snapshot_run", ondelete="RESTRICT"),
        UniqueConstraint("run_id", name="uq_run_input_snapshot_run"),
        CheckConstraint("jsonb_typeof(snapshot) = 'object'", name="ck_run_input_snapshot_object"),
        CheckConstraint("sha256 ~ '^[0-9a-f]{64}$'", name="ck_run_input_snapshot_sha256"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    schema_version: Mapped[str] = mapped_column(Text)
    snapshot: Mapped[dict] = mapped_column(JSONB)
    sha256: Mapped[str] = mapped_column(Text)


class Job(IdMixin, CreatedMixin, Base):
    """DB 작업 큐. claim은 `FOR UPDATE SKIP LOCKED`, 임대(lease)가 끝나면 다른 worker가 다시 가져갈 수 있다."""

    __tablename__ = "job"
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "run_id"], ["simulation_run.project_id", "simulation_run.id"],
                             name="fk_job_run", ondelete="RESTRICT"),
        UniqueConstraint("run_id", "kind", name="uq_job_run_kind"),
        CheckConstraint(_in("state", JOB_STATES), name="ck_job_state"),
        CheckConstraint("attempt_count >= 0 AND max_attempts >= 1", name="ck_job_attempts"),
        CheckConstraint("state <> 'claimed' OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)",
                        name="ck_job_claimed_has_lease"),
        Index("ix_job_claim", "state", "priority", "available_at"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    kind: Mapped[str] = mapped_column(Text, server_default="simulation_run")
    state: Mapped[str] = mapped_column(Text, server_default="queued")
    priority: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    lease_owner: Mapped[str | None] = mapped_column(Text)
    lease_token: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    attempt_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    max_attempts: Mapped[int] = mapped_column(Integer, server_default=text("3"))
    payload: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))  # 비밀 금지


class RunAttempt(IdMixin, CreatedMixin, Base):
    __tablename__ = "run_attempt"
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "run_id"], ["simulation_run.project_id", "simulation_run.id"],
                             name="fk_run_attempt_run", ondelete="RESTRICT"),
        UniqueConstraint("run_id", "attempt_no", name="uq_run_attempt_no"),
        UniqueConstraint("project_id", "run_id", "id", name="uq_run_attempt_run_id"),
        UniqueConstraint("project_id", "id", name="uq_run_attempt_project_id"),
        CheckConstraint(_in("state", ATTEMPT_STATES), name="ck_run_attempt_state"),
        CheckConstraint("attempt_no >= 1 AND fencing_token >= 1", name="ck_run_attempt_numbers"),
        Index("ix_run_attempt_run_id", "run_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    attempt_no: Mapped[int] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(Text, server_default="running")
    fencing_token: Mapped[int] = mapped_column(Integer)  # 늦게 끝난 옛 worker의 쓰기를 거부하는 번호
    worker_id: Mapped[str] = mapped_column(Text)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=text("now()"))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    termination_reason: Mapped[str | None] = mapped_column(Text)
    error_detail: Mapped[str | None] = mapped_column(Text)
    result_summary: Mapped[dict | None] = mapped_column(JSONB(none_as_null=True))


def _attempt_fk(table: str) -> ForeignKeyConstraint:
    return ForeignKeyConstraint(["project_id", "attempt_id"], ["run_attempt.project_id", "run_attempt.id"],
                                name=f"fk_{table}_attempt", ondelete="RESTRICT")


_AMOUNT = Numeric(24, 6)


class SimulationEvent(Base):
    """엔진 이벤트(07 §9). 시도 단위로 저장하며 공식 결과는 선택된 시도의 이벤트뿐이다."""

    __tablename__ = "simulation_event"
    __table_args__ = (
        PrimaryKeyConstraint("attempt_id", "event_seq", name="pk_simulation_event"),
        _attempt_fk("simulation_event"),
        CheckConstraint("event_seq >= 1 AND sim_time_min >= 0", name="ck_simulation_event_numbers"),
        CheckConstraint("jsonb_typeof(quantities) = 'object'", name="ck_simulation_event_quantities"),
        Index("ix_simulation_event_type", "attempt_id", "event_type", "event_seq"),
        Index("ix_simulation_event_step_key", "attempt_id", "step_key", "event_seq",
              postgresql_where=text("step_key IS NOT NULL")),
        Index("ix_simulation_event_asset_key", "attempt_id", "asset_key", "event_seq",
              postgresql_where=text("asset_key IS NOT NULL")),
        Index("ix_simulation_event_item_key", "attempt_id", "item_key", "event_seq",
              postgresql_where=text("item_key IS NOT NULL")),
    )

    attempt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    event_seq: Mapped[int] = mapped_column(BigInteger)
    sim_time_min: Mapped[Decimal] = mapped_column(_AMOUNT)
    sim_time_exact: Mapped[str] = mapped_column(Text)
    event_type: Mapped[str] = mapped_column(Text)
    step_key: Mapped[str | None] = mapped_column(Text)
    operation_id: Mapped[str | None] = mapped_column(Text)
    asset_key: Mapped[str | None] = mapped_column(Text)
    item_key: Mapped[str | None] = mapped_column(Text)
    process_version_id: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(Text)
    destination: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    quantities: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))


class RunWorkItem(Base):
    """실행 중 만들어진 작업물(보빈·롤 단위). 길이·무게가 없으면 null(해당 없음 ≠ 0)."""

    __tablename__ = "work_item"
    __table_args__ = (
        PrimaryKeyConstraint("attempt_id", "item_key", name="pk_work_item"),
        _attempt_fk("work_item"),
        CheckConstraint("status IN ('active', 'consumed', 'completed')", name="ck_work_item_status"),
        CheckConstraint("(length_m IS NULL OR length_m >= 0) AND (weight_kg IS NULL OR weight_kg >= 0)",
                        name="ck_work_item_amounts"),
        Index("ix_work_item_status", "attempt_id", "status"),
    )

    attempt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    item_key: Mapped[str] = mapped_column(Text)
    parent_key: Mapped[str | None] = mapped_column(Text)
    process_version_id: Mapped[str | None] = mapped_column(Text)
    lot_key: Mapped[str | None] = mapped_column(Text)
    state_code: Mapped[str | None] = mapped_column(Text)
    form: Mapped[str | None] = mapped_column(Text)
    length_m: Mapped[Decimal | None] = mapped_column(_AMOUNT)
    weight_kg: Mapped[Decimal | None] = mapped_column(_AMOUNT)
    location_key: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text)
    created_at_min: Mapped[Decimal] = mapped_column(_AMOUNT)
    created_at_exact: Mapped[str] = mapped_column(Text)


class RunWorkItemRelation(Base):
    """작업물 계보: 한 작업(operation)이 부모를 자식으로 바꾼 부모→자식 쌍 하나."""

    __tablename__ = "work_item_relation"
    __table_args__ = (
        PrimaryKeyConstraint("attempt_id", "seq", name="pk_work_item_relation"),
        _attempt_fk("work_item_relation"),
        ForeignKeyConstraint(["attempt_id", "parent_key"], ["work_item.attempt_id", "work_item.item_key"],
                             name="fk_work_item_relation_parent", ondelete="RESTRICT"),
        ForeignKeyConstraint(["attempt_id", "child_key"], ["work_item.attempt_id", "work_item.item_key"],
                             name="fk_work_item_relation_child", ondelete="RESTRICT"),
        CheckConstraint("relation_type IN ('split', 'transform', 'supply', 'yield')",
                        name="ck_work_item_relation_type"),
        CheckConstraint("accounting_mode IN ('physical', 'abstract_yield')", name="ck_work_item_relation_mode"),
        Index("ix_work_item_relation_parent", "attempt_id", "parent_key"),
        Index("ix_work_item_relation_child", "attempt_id", "child_key", postgresql_where=text("child_key IS NOT NULL")),
    )

    attempt_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    seq: Mapped[int] = mapped_column(BigInteger)
    operation_key: Mapped[str] = mapped_column(Text)
    step_key: Mapped[str] = mapped_column(Text)
    relation_type: Mapped[str] = mapped_column(Text)
    accounting_mode: Mapped[str] = mapped_column(Text)
    process_version_id: Mapped[str | None] = mapped_column(Text)
    parent_key: Mapped[str] = mapped_column(Text)
    child_key: Mapped[str | None] = mapped_column(Text)
    parent_length_m: Mapped[Decimal | None] = mapped_column(_AMOUNT)
    child_length_m: Mapped[Decimal | None] = mapped_column(_AMOUNT)
    residual_length_m: Mapped[Decimal | None] = mapped_column(_AMOUNT)
    carried_in_m: Mapped[Decimal | None] = mapped_column(_AMOUNT)
    balanced: Mapped[bool | None] = mapped_column(Boolean)


__all__ = ["ATTEMPT_STATES", "JOB_STATES", "RUN_STATUSES", "TERMINAL_RUN_STATUSES", "Job", "RunAttempt",
           "RunInputSnapshot", "RunWorkItem", "RunWorkItemRelation", "SimulationEvent", "SimulationRun"]
