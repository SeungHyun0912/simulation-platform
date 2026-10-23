"""product, material_definition: 제품·재료 기준정보

수동 작성·검토본. 기준: CR-backend-20261023-be03-products-materials(승인), ERD §5.
- 버전이 없는 기준정보다. 이후 process_version이 (project_id, product_id) 등으로 복합 FK할 수 있도록
  UNIQUE(project_id, id)를 둔다. 존재하지 않는 테이블을 참조하는 FK는 만들지 않는다(ERD §16).

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def _common():
    return [
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
    ]


def _tail():
    return [
        sa.Column("notes", sa.Text()),
        sa.Column("archived_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", pg.UUID(as_uuid=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.Column("updated_by", pg.UUID(as_uuid=True)),
        sa.Column("row_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "product",
        *_common(),
        sa.Column("specification", sa.Text()),
        *_tail(),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="RESTRICT",
                                name="fk_product_project_id_project"),
        sa.UniqueConstraint("project_id", "code", name="uq_product_project_code"),
        sa.UniqueConstraint("project_id", "id", name="uq_product_project_id"),
        sa.CheckConstraint("btrim(code) <> ''", name="ck_product_code"),
        sa.CheckConstraint("btrim(name) <> ''", name="ck_product_name"),
    )
    op.create_index("ix_product_project_archived", "product", ["project_id", "archived_at"])

    op.create_table(
        "material_definition",
        *_common(),
        sa.Column("form", sa.Text(), nullable=False),
        sa.Column("default_spec", pg.JSONB(), nullable=False),
        *_tail(),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="RESTRICT",
                                name="fk_material_definition_project_id_project"),
        sa.UniqueConstraint("project_id", "code", name="uq_material_project_code"),
        sa.UniqueConstraint("project_id", "id", name="uq_material_project_id"),
        sa.CheckConstraint("btrim(code) <> ''", name="ck_material_code"),
        sa.CheckConstraint("btrim(name) <> ''", name="ck_material_name"),
        sa.CheckConstraint("btrim(form) <> ''", name="ck_material_form"),
    )
    op.create_index("ix_material_project_archived", "material_definition",
                    ["project_id", "archived_at"])


def downgrade() -> None:
    op.drop_table("material_definition")
    op.drop_table("product")
