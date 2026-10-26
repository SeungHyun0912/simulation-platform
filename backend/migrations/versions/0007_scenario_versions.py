"""scenario, scenario_version, scenario_product, scenario_asset

수동 작성·검토본. 기준: CR-backend-20261026-be07-scenario-versions(BE-05a, 보드 DEC-007 승인), ERD §6.
- 시나리오 버전은 draft → approved만 있고 승인 후 내용·자식(제품·자산 고정)이 동결된다(공정 버전과 같은 트리거 방식).
- 제품의 공정 버전은 같은 제품의 것, 자산 버전은 같은 자산의 것이어야 한다(복합 FK, 프로젝트 격리 포함).
  공정 버전에는 이를 위한 (project_id, product_id, id) 유일 제약을 추가한다.
- 의도적으로 두지 않은 것: layout_version_id, calendar_rule, initial_wip, engine_options(정의 없음, 후속 ADD COLUMN),
  실행·스냅샷·job 테이블(CR be08).

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

CHILD_TABLES = ("scenario_product", "scenario_asset")


def _uuid(name, nullable=False):
    return sa.Column(name, pg.UUID(as_uuid=True), nullable=nullable)


def _created():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", pg.UUID(as_uuid=True)),
    ]


def _mutable():
    return [
        *_created(),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        _uuid("updated_by", True),
        sa.Column("row_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
    ]


def upgrade() -> None:
    op.create_unique_constraint("uq_process_version_project_product_id", "process_version",
                                ["project_id", "product_id", "id"])

    op.create_table(
        "scenario",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"),
        sa.Column("code", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text()),
        *_mutable(),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="RESTRICT",
                                name="fk_scenario_project"),
        sa.UniqueConstraint("project_id", "code", name="uq_scenario_project_code"),
        sa.UniqueConstraint("project_id", "id", name="uq_scenario_project_id"),
        sa.CheckConstraint("btrim(code) <> ''", name="ck_scenario_code"),
        sa.CheckConstraint("btrim(name) <> ''", name="ck_scenario_name"),
    )

    op.create_table(
        "scenario_version",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("scenario_id"),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("status", sa.Text(), server_default="draft", nullable=False),
        _uuid("base_version_id", True),
        sa.Column("stopping_rule", pg.JSONB(), nullable=False),
        sa.Column("assumption_reason", sa.Text()),
        sa.Column("notes", sa.Text()),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        _uuid("approved_by", True),
        *_mutable(),
        sa.ForeignKeyConstraint(["project_id", "scenario_id"], ["scenario.project_id", "scenario.id"],
                                ondelete="RESTRICT", name="fk_scenario_version_scenario"),
        sa.UniqueConstraint("scenario_id", "version_no", name="uq_scenario_version_no"),
        sa.UniqueConstraint("project_id", "id", name="uq_scenario_version_project_id"),
        sa.ForeignKeyConstraint(["project_id", "base_version_id"],
                                ["scenario_version.project_id", "scenario_version.id"],
                                ondelete="RESTRICT", name="fk_scenario_version_base"),
        sa.CheckConstraint("status IN ('draft', 'approved')", name="ck_scenario_version_status"),
        sa.CheckConstraint("version_no > 0", name="ck_scenario_version_no"),
        sa.CheckConstraint("jsonb_typeof(stopping_rule) = 'object'",
                           name="ck_scenario_version_stopping"),
        sa.CheckConstraint(
            "status <> 'approved' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)",
            name="ck_scenario_version_approval"),
    )
    op.create_index("uq_scenario_version_one_draft", "scenario_version", ["scenario_id"], unique=True,
                    postgresql_where=sa.text("status = 'draft'"))

    op.create_table(
        "scenario_product",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("scenario_version_id"), _uuid("product_id"),
        _uuid("process_version_id"),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("priority", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("arrivals", pg.JSONB(), nullable=False),
        sa.Column("assumptions", pg.JSONB(), nullable=False),
        *_created(),
        sa.ForeignKeyConstraint(["project_id", "scenario_version_id"],
                                ["scenario_version.project_id", "scenario_version.id"],
                                ondelete="RESTRICT", name="fk_scenario_product_version"),
        sa.ForeignKeyConstraint(
            ["project_id", "product_id", "process_version_id"],
            ["process_version.project_id", "process_version.product_id", "process_version.id"],
            ondelete="RESTRICT", name="fk_scenario_product_process_version"),
        sa.UniqueConstraint("scenario_version_id", "process_version_id",
                            name="uq_scenario_product_process_version"),
        sa.UniqueConstraint("scenario_version_id", "position", name="uq_scenario_product_position"),
        sa.CheckConstraint("priority >= 1", name="ck_scenario_product_priority"),
        sa.CheckConstraint("position >= 0", name="ck_scenario_product_position"),
        sa.CheckConstraint("jsonb_typeof(arrivals) = 'array'", name="ck_scenario_product_arrivals"),
        sa.CheckConstraint("jsonb_typeof(assumptions) = 'object'",
                           name="ck_scenario_product_assumptions"),
    )

    op.create_table(
        "scenario_asset",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("scenario_version_id"), _uuid("asset_id"),
        _uuid("asset_revision_id"),
        *_created(),
        sa.ForeignKeyConstraint(["project_id", "scenario_version_id"],
                                ["scenario_version.project_id", "scenario_version.id"],
                                ondelete="RESTRICT", name="fk_scenario_asset_version"),
        sa.ForeignKeyConstraint(
            ["project_id", "asset_id", "asset_revision_id"],
            ["asset_revision.project_id", "asset_revision.asset_id", "asset_revision.id"],
            ondelete="RESTRICT", name="fk_scenario_asset_revision"),
        sa.UniqueConstraint("scenario_version_id", "asset_id", name="uq_scenario_asset_asset"),
    )
    for table in CHILD_TABLES:
        op.create_index(f"ix_{table}_scenario_version_id", table, ["scenario_version_id"])

    # 시나리오 버전: draft → approved만, 초안이 아니면 내용 동결, 초안만 삭제.
    op.execute(
        """
        CREATE FUNCTION scenario_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                IF OLD.status <> 'draft' THEN
                    RAISE EXCEPTION 'only draft scenario versions can be deleted (version %)', OLD.id
                        USING ERRCODE = 'restrict_violation';
                END IF;
                RETURN OLD;
            END IF;
            IF NEW.id <> OLD.id OR NEW.project_id <> OLD.project_id
               OR NEW.scenario_id <> OLD.scenario_id OR NEW.version_no <> OLD.version_no
               OR NEW.base_version_id IS DISTINCT FROM OLD.base_version_id THEN
                RAISE EXCEPTION 'scenario version identity is immutable (version %)', OLD.id
                    USING ERRCODE = 'restrict_violation';
            END IF;
            IF NEW.status <> OLD.status AND NOT (OLD.status = 'draft' AND NEW.status = 'approved') THEN
                RAISE EXCEPTION 'illegal scenario version status transition % -> %',
                    OLD.status, NEW.status USING ERRCODE = 'restrict_violation';
            END IF;
            IF OLD.status <> 'draft' AND (
                   NEW.stopping_rule IS DISTINCT FROM OLD.stopping_rule
                OR NEW.assumption_reason IS DISTINCT FROM OLD.assumption_reason
                OR NEW.notes IS DISTINCT FROM OLD.notes
                OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
                OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
                RAISE EXCEPTION 'scenario version content is immutable unless draft (version %)',
                    OLD.id USING ERRCODE = 'restrict_violation';
            END IF;
            RETURN NEW;
        END $$
        """
    )
    op.execute(
        "CREATE TRIGGER trg_scenario_version_guard BEFORE UPDATE OR DELETE ON scenario_version "
        "FOR EACH ROW EXECUTE FUNCTION scenario_version_guard()"
    )
    op.execute(
        """
        CREATE FUNCTION scenario_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            vid uuid;
            st text;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                vid := OLD.scenario_version_id;
            ELSE
                vid := NEW.scenario_version_id;
            END IF;
            SELECT status INTO st FROM scenario_version WHERE id = vid;
            IF FOUND AND st <> 'draft' THEN
                RAISE EXCEPTION '% is immutable unless its scenario version is draft (version %)',
                    TG_TABLE_NAME, vid USING ERRCODE = 'restrict_violation';
            END IF;
            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            END IF;
            RETURN NEW;
        END $$
        """
    )
    for table in CHILD_TABLES:
        op.execute(
            f"CREATE TRIGGER trg_{table}_guard BEFORE INSERT OR UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION scenario_child_guard()"
        )


def downgrade() -> None:
    for table in reversed(CHILD_TABLES):
        op.execute(f"DROP TRIGGER trg_{table}_guard ON {table}")
    op.execute("DROP FUNCTION scenario_child_guard()")
    op.execute("DROP TRIGGER trg_scenario_version_guard ON scenario_version")
    op.execute("DROP FUNCTION scenario_version_guard()")
    for table in ("scenario_asset", "scenario_product", "scenario_version", "scenario"):
        op.drop_table(table)
    op.drop_constraint("uq_process_version_project_product_id", "process_version", type_="unique")
