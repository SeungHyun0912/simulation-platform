"""simulation_event, work_item, work_item_relation

수동 작성·검토본. 기준: CR be08(보드 DEC-008)의 be08b, ERD §6.
- 모두 시도(attempt) 단위다. 공식 결과는 `simulation_run.selected_attempt_id`의 시도뿐이라, 실패·취소·버려진 시도의 부분
  기록은 조회에서 자동으로 제외된다(별도 삭제 없이 "불완전 로그를 공식 결과에서 제외").
- simulation_event는 한 실행에 수십만~백만 건이 되므로 행 id 없이 (attempt_id, event_seq) 기본 키로 둔다.
  조회 필터(step·asset·item·type)마다 (attempt_id, 열, event_seq) 인덱스를 둔다.
- 시각은 표시용 numeric(소수 6자리)과 정확한 분수 문자열을 함께 저장한다.
- work_item_relation은 부모→자식 쌍 하나가 한 행이다. 길이 보존 값(잔량·이월·균형)은 작업 단위 값이라 그 작업의 모든
  행에 같다. 부모·자식은 같은 시도의 work_item만 가리킨다(복합 FK).
- 의도적으로 두지 않은 것: 지표 테이블(be08c).

Revision ID: 0009
Revises: 0008
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

NUM = sa.Numeric(24, 6)


def _attempt_cols():
    return [sa.Column("attempt_id", pg.UUID(as_uuid=True), nullable=False),
            sa.Column("project_id", pg.UUID(as_uuid=True), nullable=False)]


def _attempt_fk(table):
    return sa.ForeignKeyConstraint(["project_id", "attempt_id"], ["run_attempt.project_id", "run_attempt.id"],
                                   name=f"fk_{table}_attempt", ondelete="RESTRICT")


def upgrade() -> None:
    op.create_unique_constraint("uq_run_attempt_project_id", "run_attempt", ["project_id", "id"])

    op.create_table(
        "simulation_event", *_attempt_cols(),
        sa.Column("event_seq", sa.BigInteger, nullable=False),
        sa.Column("sim_time_min", NUM, nullable=False),
        sa.Column("sim_time_exact", sa.Text, nullable=False),
        sa.Column("event_type", sa.Text, nullable=False),
        sa.Column("step_key", sa.Text), sa.Column("operation_id", sa.Text), sa.Column("asset_key", sa.Text),
        sa.Column("item_key", sa.Text), sa.Column("process_version_id", sa.Text),
        sa.Column("source", sa.Text), sa.Column("destination", sa.Text), sa.Column("reason", sa.Text),
        sa.Column("quantities", pg.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.PrimaryKeyConstraint("attempt_id", "event_seq", name="pk_simulation_event"),
        _attempt_fk("simulation_event"),
        sa.CheckConstraint("event_seq >= 1 AND sim_time_min >= 0", name="ck_simulation_event_numbers"),
        sa.CheckConstraint("jsonb_typeof(quantities) = 'object'", name="ck_simulation_event_quantities"),
    )
    op.create_index("ix_simulation_event_type", "simulation_event", ["attempt_id", "event_type", "event_seq"])
    for column in ("step_key", "asset_key", "item_key"):
        op.create_index(f"ix_simulation_event_{column}", "simulation_event", ["attempt_id", column, "event_seq"],
                        postgresql_where=sa.text(f"{column} IS NOT NULL"))

    op.create_table(
        "work_item", *_attempt_cols(),
        sa.Column("item_key", sa.Text, nullable=False),
        sa.Column("parent_key", sa.Text), sa.Column("process_version_id", sa.Text),
        sa.Column("lot_key", sa.Text), sa.Column("state_code", sa.Text), sa.Column("form", sa.Text),
        sa.Column("length_m", NUM), sa.Column("weight_kg", NUM),
        sa.Column("location_key", sa.Text),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("created_at_min", NUM, nullable=False),
        sa.Column("created_at_exact", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("attempt_id", "item_key", name="pk_work_item"),
        _attempt_fk("work_item"),
        sa.CheckConstraint("status IN ('active', 'consumed', 'completed')", name="ck_work_item_status"),
        sa.CheckConstraint("(length_m IS NULL OR length_m >= 0) AND (weight_kg IS NULL OR weight_kg >= 0)",
                           name="ck_work_item_amounts"),
    )
    op.create_index("ix_work_item_status", "work_item", ["attempt_id", "status"])

    op.create_table(
        "work_item_relation", *_attempt_cols(),
        sa.Column("seq", sa.BigInteger, nullable=False),
        sa.Column("operation_key", sa.Text, nullable=False), sa.Column("step_key", sa.Text, nullable=False),
        sa.Column("relation_type", sa.Text, nullable=False),
        sa.Column("accounting_mode", sa.Text, nullable=False),
        sa.Column("process_version_id", sa.Text),
        sa.Column("parent_key", sa.Text, nullable=False), sa.Column("child_key", sa.Text),
        sa.Column("parent_length_m", NUM), sa.Column("child_length_m", NUM),
        sa.Column("residual_length_m", NUM), sa.Column("carried_in_m", NUM),
        sa.Column("balanced", sa.Boolean),
        sa.PrimaryKeyConstraint("attempt_id", "seq", name="pk_work_item_relation"),
        _attempt_fk("work_item_relation"),
        sa.ForeignKeyConstraint(["attempt_id", "parent_key"], ["work_item.attempt_id", "work_item.item_key"],
                                name="fk_work_item_relation_parent", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["attempt_id", "child_key"], ["work_item.attempt_id", "work_item.item_key"],
                                name="fk_work_item_relation_child", ondelete="RESTRICT"),
        sa.CheckConstraint("relation_type IN ('split', 'transform', 'supply', 'yield')",
                           name="ck_work_item_relation_type"),
        sa.CheckConstraint("accounting_mode IN ('physical', 'abstract_yield')", name="ck_work_item_relation_mode"),
    )
    op.create_index("ix_work_item_relation_parent", "work_item_relation", ["attempt_id", "parent_key"])
    op.create_index("ix_work_item_relation_child", "work_item_relation", ["attempt_id", "child_key"],
                    postgresql_where=sa.text("child_key IS NOT NULL"))


def downgrade() -> None:
    for table in ("work_item_relation", "work_item", "simulation_event"):
        op.drop_table(table)
    op.drop_constraint("uq_run_attempt_project_id", "run_attempt", type_="unique")
