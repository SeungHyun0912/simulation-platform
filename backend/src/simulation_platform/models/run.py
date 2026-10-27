"""단계 C 실행: 요청한 run, 불변 입력 스냅샷, DB 작업 큐(job), 시도(attempt). 기준: CR be08 §3, ERD §6.

run을 만드는 순간 입력 스냅샷과 job이 한 트랜잭션으로 생기고, worker는 스냅샷만 읽어 실행한다(현재 master를 읽지 않음).
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
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


__all__ = ["ATTEMPT_STATES", "JOB_STATES", "RUN_STATUSES", "TERMINAL_RUN_STATUSES", "Job", "RunAttempt",
           "RunInputSnapshot", "SimulationRun"]
