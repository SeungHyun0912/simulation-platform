"""process_editor_state

수동 작성·검토본. 기준: CR-backend-20261026-be05-process-clone-diff-editor-state(BE-04b), ERD §5.
- 화면 좌표 전용이며 공정 내용이 아니므로 버전 동결·자식 가드 트리거 대상이 아니다(승인본에도 저장 가능).
- PoC 결정: 버전당 공용 하나(user_id IS NULL). 나중에 사용자별로 바꿀 수 있도록 user_id 컬럼과
  사용자별 유일 인덱스를 미리 둔다(지금은 user_id가 항상 NULL).

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "process_editor_state",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("process_version_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", pg.UUID(as_uuid=True)),
        sa.Column("node_positions", pg.JSONB(), nullable=False),
        sa.Column("viewport", pg.JSONB(none_as_null=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", pg.UUID(as_uuid=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.Column("updated_by", pg.UUID(as_uuid=True)),
        sa.Column("row_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id", "process_version_id"],
            ["process_version.project_id", "process_version.id"],
            ondelete="RESTRICT", name="fk_process_editor_state_version"),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="RESTRICT",
                                name="fk_process_editor_state_user"),
        sa.CheckConstraint("jsonb_typeof(node_positions) = 'object'",
                           name="ck_process_editor_state_positions"),
        sa.CheckConstraint("viewport IS NULL OR jsonb_typeof(viewport) = 'object'",
                           name="ck_process_editor_state_viewport"),
    )
    op.create_index("uq_process_editor_state_shared", "process_editor_state",
                    ["process_version_id"], unique=True,
                    postgresql_where=sa.text("user_id IS NULL"))
    op.create_index("uq_process_editor_state_user", "process_editor_state",
                    ["process_version_id", "user_id"], unique=True,
                    postgresql_where=sa.text("user_id IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("uq_process_editor_state_user", table_name="process_editor_state")
    op.drop_index("uq_process_editor_state_shared", table_name="process_editor_state")
    op.drop_table("process_editor_state")
