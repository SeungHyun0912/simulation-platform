"""layout_aisle, layout_aisle_point

수동 작성·검토본. 기준: CR-backend-20261030-be19-aisles-paths(BE-22, 사용자 지시 2026-10-30), ERD §7.
- 통로(W) = 포트에 묶이지 않은 점 순서 배열(양방향). 갈림길·교차로는 같은 점을 공유해 잇는다.
- 같은 배치판의 점만 참조(복합 FK). 승인 후 동결은 0011의 layout_child_guard()를 그대로 쓴다.

Revision ID: 0012
Revises: 0011
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

TABLES = ("layout_aisle", "layout_aisle_point")


def _uuid(name, nullable=False):
    return sa.Column(name, pg.UUID(as_uuid=True), nullable=nullable)


def _created():
    return [sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("created_by", pg.UUID(as_uuid=True))]


def upgrade() -> None:
    op.create_table(
        "layout_aisle",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("layout_version_id"),
        sa.Column("aisle_key", sa.Text(), nullable=False),
        sa.Column("attributes", pg.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        *_created(),
        sa.ForeignKeyConstraint(["project_id", "layout_version_id"], ["layout_version.project_id", "layout_version.id"],
                                ondelete="RESTRICT", name="fk_layout_aisle_version"),
        sa.UniqueConstraint("layout_version_id", "aisle_key", name="uq_layout_aisle_key"),
        sa.UniqueConstraint("layout_version_id", "id", name="uq_layout_aisle_version_id"),
        sa.CheckConstraint("btrim(aisle_key) <> ''", name="ck_layout_aisle_key"),
        sa.CheckConstraint("jsonb_typeof(attributes) = 'object'", name="ck_layout_aisle_attributes"),
    )
    op.create_table(
        "layout_aisle_point",
        _uuid("project_id"), _uuid("layout_version_id"), _uuid("aisle_id"),
        sa.Column("seq", sa.Integer(), nullable=False),
        _uuid("point_id"),
        *_created(),
        sa.PrimaryKeyConstraint("aisle_id", "seq", name="pk_layout_aisle_point"),
        sa.ForeignKeyConstraint(["project_id", "layout_version_id"], ["layout_version.project_id", "layout_version.id"],
                                ondelete="RESTRICT", name="fk_layout_aisle_point_version"),
        sa.ForeignKeyConstraint(["layout_version_id", "aisle_id"], ["layout_aisle.layout_version_id", "layout_aisle.id"],
                                ondelete="RESTRICT", name="fk_layout_aisle_point_aisle"),
        sa.ForeignKeyConstraint(["layout_version_id", "point_id"], ["layout_point.layout_version_id", "layout_point.id"],
                                ondelete="RESTRICT", name="fk_layout_aisle_point_point"),
        sa.CheckConstraint("seq >= 0", name="ck_layout_aisle_point_seq"),
    )
    for table in TABLES:
        op.create_index(f"ix_{table}_layout_version_id", table, ["layout_version_id"])
        op.execute(f"CREATE TRIGGER trg_{table}_guard BEFORE INSERT OR UPDATE OR DELETE ON {table} "
                   "FOR EACH ROW EXECUTE FUNCTION layout_child_guard()")


def downgrade() -> None:
    for table in reversed(TABLES):
        op.execute(f"DROP TRIGGER trg_{table}_guard ON {table}")
        op.drop_table(table)
