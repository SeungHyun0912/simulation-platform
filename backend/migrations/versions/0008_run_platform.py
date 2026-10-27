"""simulation_run, run_input_snapshot, job, run_attempt

수동 작성·검토본. 기준: CR be08(보드 DEC-008)의 be08a, ERD §6.
- run을 만들 때 입력 스냅샷과 job이 한 트랜잭션으로 생긴다. 스냅샷은 수정·삭제를 트리거가 막는다(승인 버전과 같은 방식).
- 모든 자식은 (project_id, run_id) 복합 FK로 같은 프로젝트의 run에만 묶인다. run의 시나리오 버전도 같은 프로젝트의 것이다.
- job은 DB 큐다: state·priority·available_at 인덱스로 claim, lease_token·lease_expires_at으로 임대, attempt의 fencing_token으로
  늦게 끝난 옛 worker의 쓰기를 거부한다.
- 의도적으로 두지 않은 것: 이벤트·작업물·지표 테이블(be08b·be08c).

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def _uuid(name, nullable=False):
    return sa.Column(name, pg.UUID(as_uuid=True), nullable=nullable)


def _created():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by", pg.UUID(as_uuid=True)),
    ]


def _ts(name):
    return sa.Column(name, sa.DateTime(timezone=True))


RUN_STATUSES = "'queued', 'running', 'completed', 'stalled', 'horizon_reached', 'failed', 'limit_reached', 'cancelled'"


def upgrade() -> None:
    op.create_table(
        "simulation_run",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("seq", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        _uuid("project_id"), _uuid("scenario_version_id"),
        sa.Column("status", sa.Text(), server_default="queued", nullable=False),
        _uuid("requested_by"),
        sa.Column("seed", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("replicate_index", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("engine_version", sa.Text(), nullable=False),
        sa.Column("input_hash", sa.Text(), nullable=False),
        sa.Column("idempotency_key", sa.Text(), nullable=False),
        sa.Column("request_hash", sa.Text(), nullable=False),
        _ts("cancel_requested_at"), _uuid("cancel_requested_by", True),
        _ts("started_at"), _ts("finished_at"),
        sa.Column("termination_reason", sa.Text()),
        _uuid("selected_attempt_id", True),
        *_created(),
        sa.ForeignKeyConstraint(["project_id", "scenario_version_id"],
                                ["scenario_version.project_id", "scenario_version.id"], ondelete="RESTRICT",
                                name="fk_simulation_run_scenario_version"),
        sa.ForeignKeyConstraint(["requested_by"], ["app_user.id"], ondelete="RESTRICT",
                                name="fk_simulation_run_requested_by"),
        sa.UniqueConstraint("project_id", "id", name="uq_simulation_run_project_id"),
        sa.UniqueConstraint("project_id", "requested_by", "idempotency_key", name="uq_simulation_run_idempotency"),
        sa.CheckConstraint(f"status IN ({RUN_STATUSES})", name="ck_simulation_run_status"),
        sa.CheckConstraint("seed >= 0 AND replicate_index >= 0", name="ck_simulation_run_seed"),
        sa.CheckConstraint("btrim(idempotency_key) <> ''", name="ck_simulation_run_idempotency_key"),
    )
    op.create_index("ix_simulation_run_project_seq", "simulation_run", ["project_id", "seq"])
    op.create_index("ix_simulation_run_scenario_version_id", "simulation_run", ["scenario_version_id"])

    op.create_table(
        "run_input_snapshot",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("run_id"),
        sa.Column("schema_version", sa.Text(), nullable=False),
        sa.Column("snapshot", pg.JSONB(), nullable=False),
        sa.Column("sha256", sa.Text(), nullable=False),
        *_created(),
        sa.ForeignKeyConstraint(["project_id", "run_id"], ["simulation_run.project_id", "simulation_run.id"],
                                ondelete="RESTRICT", name="fk_run_input_snapshot_run"),
        sa.UniqueConstraint("run_id", name="uq_run_input_snapshot_run"),
        sa.CheckConstraint("jsonb_typeof(snapshot) = 'object'", name="ck_run_input_snapshot_object"),
        sa.CheckConstraint("sha256 ~ '^[0-9a-f]{64}$'", name="ck_run_input_snapshot_sha256"),
    )

    op.create_table(
        "job",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("run_id"),
        sa.Column("kind", sa.Text(), server_default="simulation_run", nullable=False),
        sa.Column("state", sa.Text(), server_default="queued", nullable=False),
        sa.Column("priority", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("available_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("lease_owner", sa.Text()), _uuid("lease_token", True), _ts("lease_expires_at"),
        sa.Column("attempt_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("max_attempts", sa.Integer(), server_default=sa.text("3"), nullable=False),
        sa.Column("payload", pg.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        *_created(),
        sa.ForeignKeyConstraint(["project_id", "run_id"], ["simulation_run.project_id", "simulation_run.id"],
                                ondelete="RESTRICT", name="fk_job_run"),
        sa.UniqueConstraint("run_id", "kind", name="uq_job_run_kind"),
        sa.CheckConstraint("state IN ('queued', 'claimed', 'done', 'failed', 'cancelled')", name="ck_job_state"),
        sa.CheckConstraint("attempt_count >= 0 AND max_attempts >= 1", name="ck_job_attempts"),
        sa.CheckConstraint("state <> 'claimed' OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)",
                           name="ck_job_claimed_has_lease"),
    )
    op.create_index("ix_job_claim", "job", ["state", "priority", "available_at"])

    op.create_table(
        "run_attempt",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("run_id"),
        sa.Column("attempt_no", sa.Integer(), nullable=False),
        sa.Column("state", sa.Text(), server_default="running", nullable=False),
        sa.Column("fencing_token", sa.Integer(), nullable=False),
        sa.Column("worker_id", sa.Text(), nullable=False),
        _ts("heartbeat_at"),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        _ts("finished_at"),
        sa.Column("termination_reason", sa.Text()), sa.Column("error_detail", sa.Text()),
        sa.Column("result_summary", pg.JSONB()),
        *_created(),
        sa.ForeignKeyConstraint(["project_id", "run_id"], ["simulation_run.project_id", "simulation_run.id"],
                                ondelete="RESTRICT", name="fk_run_attempt_run"),
        sa.UniqueConstraint("run_id", "attempt_no", name="uq_run_attempt_no"),
        sa.UniqueConstraint("project_id", "run_id", "id", name="uq_run_attempt_run_id"),
        sa.CheckConstraint("state IN ('running', 'finished', 'failed', 'cancelled', 'abandoned')",
                           name="ck_run_attempt_state"),
        sa.CheckConstraint("attempt_no >= 1 AND fencing_token >= 1", name="ck_run_attempt_numbers"),
    )
    op.create_index("ix_run_attempt_run_id", "run_attempt", ["run_id"])

    # 공식 결과 시도는 그 run의 시도여야 한다(복합 FK).
    op.create_foreign_key("fk_simulation_run_selected_attempt", "simulation_run", "run_attempt",
                          ["project_id", "id", "selected_attempt_id"], ["project_id", "run_id", "id"],
                          ondelete="RESTRICT")

    # 입력 스냅샷은 만든 뒤 수정·삭제할 수 없다(재현성·감사).
    op.execute(
        """
        CREATE FUNCTION run_input_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'run_input_snapshot is immutable (run %)', COALESCE(OLD.run_id, NEW.run_id)
                USING ERRCODE = 'restrict_violation';
        END $$
        """
    )
    op.execute("CREATE TRIGGER trg_run_input_snapshot_guard BEFORE UPDATE OR DELETE ON run_input_snapshot "
               "FOR EACH ROW EXECUTE FUNCTION run_input_snapshot_guard()")


def downgrade() -> None:
    op.execute("DROP TRIGGER trg_run_input_snapshot_guard ON run_input_snapshot")
    op.execute("DROP FUNCTION run_input_snapshot_guard()")
    op.drop_constraint("fk_simulation_run_selected_attempt", "simulation_run", type_="foreignkey")
    for table in ("run_attempt", "job", "run_input_snapshot", "simulation_run"):
        op.drop_table(table)
