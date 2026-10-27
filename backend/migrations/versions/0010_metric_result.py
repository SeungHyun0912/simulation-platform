"""metric_result

수동 작성·검토본. 기준: CR be08(보드 DEC-008)의 be08c, ERD §6.
- 시도(attempt) 단위로 저장하고 공식 결과는 선택된 시도의 지표뿐이다(이벤트·작업물과 같은 규칙).
- 한 행 = 지표 하나 × 차원(공정 버전·설비·대기 공간) 하나 × 구간(전체·일·주·월) 하나. 같은 지표·차원·구간은 시도 안에서 유일하다.
- value는 분모가 0이거나 해당 없으면 null이다(0이 아니다). quality_status는 그 run의 종료 상태에서 온다
  (complete: 끝까지 실행, censored: 고정 지평선에서 끊김, incomplete: 입력 부족·한도 등으로 끝나지 못함).
- 구간 시작·끝은 가상 시간(분)이며 표시용 numeric과 정확한 분수 문자열을 함께 저장한다.
- 의도적으로 두지 않은 것: 비교·rerun(be08 이후).

Revision ID: 0010
Revises: 0009
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

NUM = sa.Numeric(24, 6)


def upgrade() -> None:
    op.create_table(
        "metric_result",
        sa.Column("id", sa.BigInteger, sa.Identity(always=True), nullable=False),
        sa.Column("attempt_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("metric_key", sa.Text, nullable=False),
        sa.Column("dimensions", pg.JSONB, nullable=False),
        sa.Column("dimensions_hash", sa.Text, nullable=False),
        sa.Column("window_kind", sa.Text, nullable=False),
        sa.Column("window_start_min", NUM, nullable=False), sa.Column("window_start_exact", sa.Text, nullable=False),
        sa.Column("window_end_min", NUM, nullable=False), sa.Column("window_end_exact", sa.Text, nullable=False),
        sa.Column("value", NUM),
        sa.Column("unit", sa.Text, nullable=False),
        sa.Column("definition_version", sa.Text, nullable=False),
        sa.Column("quality_status", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_metric_result"),
        sa.ForeignKeyConstraint(["project_id", "attempt_id"], ["run_attempt.project_id", "run_attempt.id"],
                                name="fk_metric_result_attempt", ondelete="RESTRICT"),
        sa.UniqueConstraint("attempt_id", "metric_key", "dimensions_hash", "window_kind", "window_start_exact",
                            name="uq_metric_result_series"),
        sa.CheckConstraint("window_kind IN ('run', 'day', 'week', 'month')", name="ck_metric_result_window"),
        sa.CheckConstraint("quality_status IN ('complete', 'censored', 'incomplete')", name="ck_metric_result_quality"),
        sa.CheckConstraint("window_end_min >= window_start_min AND window_start_min >= 0", name="ck_metric_result_range"),
        sa.CheckConstraint("jsonb_typeof(dimensions) = 'object'", name="ck_metric_result_dimensions"),
    )
    op.create_index("ix_metric_result_window", "metric_result", ["attempt_id", "window_kind", "id"])


def downgrade() -> None:
    op.drop_table("metric_result")
