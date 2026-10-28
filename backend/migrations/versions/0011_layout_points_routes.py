"""layout_version, layout_point, asset_placement, layout_port_point, layout_route, layout_route_point

수동 작성·검토본. 기준: CR-backend-20261028-be18-layout-points-routes(BE-21, 사용자 지시 2026-10-28), ERD §7.
- 배치판은 프로젝트당 version_no, 초안은 하나, draft → approved만 있고 승인 후 내용·하위 행이 동결된다(시나리오 버전과 같은 트리거).
- 좌표계 고정: m, 도면 왼쪽 위 원점, x 오른쪽·y 아래쪽. 좌표·크기는 소수 첫째 자리(NUMERIC(9,1)), 반올림은 앱이 한다.
- 통로(network node/edge) 대신 점(layout_point)과 점 순서(layout_route_point)로 경로를 표현한다(사용자 확정).
- 같은 배치판 안의 점만 참조하도록 (layout_version_id, id) 복합 FK. 자산·포트는 같은 프로젝트(복합 FK).
- 의도적으로 두지 않은 것: zone, z(층), scenario_version.layout_version_id(후속).

Revision ID: 0011
Revises: 0010
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

COORD = sa.Numeric(9, 1)
CHILD_TABLES = ("layout_point", "asset_placement", "layout_port_point", "layout_route", "layout_route_point")


def _uuid(name, nullable=False):
    return sa.Column(name, pg.UUID(as_uuid=True), nullable=nullable)


def _created():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by", pg.UUID(as_uuid=True)),
    ]


def _attributes():
    return sa.Column("attributes", pg.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False)


def _version_fk(table):
    return sa.ForeignKeyConstraint(["project_id", "layout_version_id"], ["layout_version.project_id", "layout_version.id"],
                                   ondelete="RESTRICT", name=f"fk_{table}_version")


def upgrade() -> None:
    op.create_table(
        "layout_version",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("status", sa.Text(), server_default="draft", nullable=False),
        _uuid("base_version_id", True),
        sa.Column("name", sa.Text()),
        sa.Column("notes", sa.Text()),
        sa.Column("canvas_width_m", COORD), sa.Column("canvas_height_m", COORD),
        _attributes(),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        _uuid("approved_by", True),
        *_created(),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        _uuid("updated_by", True),
        sa.Column("row_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="RESTRICT", name="fk_layout_version_project"),
        sa.ForeignKeyConstraint(["project_id", "base_version_id"], ["layout_version.project_id", "layout_version.id"],
                                ondelete="RESTRICT", name="fk_layout_version_base"),
        sa.UniqueConstraint("project_id", "version_no", name="uq_layout_version_no"),
        sa.UniqueConstraint("project_id", "id", name="uq_layout_version_project_id"),
        sa.CheckConstraint("status IN ('draft', 'approved')", name="ck_layout_version_status"),
        sa.CheckConstraint("version_no > 0", name="ck_layout_version_no"),
        sa.CheckConstraint("canvas_width_m IS NULL OR canvas_width_m > 0", name="ck_layout_version_canvas_width"),
        sa.CheckConstraint("canvas_height_m IS NULL OR canvas_height_m > 0", name="ck_layout_version_canvas_height"),
        sa.CheckConstraint("jsonb_typeof(attributes) = 'object'", name="ck_layout_version_attributes"),
        sa.CheckConstraint("status <> 'approved' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)",
                           name="ck_layout_version_approval"),
    )
    op.create_index("uq_layout_version_one_draft", "layout_version", ["project_id"], unique=True,
                    postgresql_where=sa.text("status = 'draft'"))

    op.create_table(
        "layout_point",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("layout_version_id"),
        sa.Column("point_key", sa.Text(), nullable=False),
        sa.Column("x_m", COORD, nullable=False), sa.Column("y_m", COORD, nullable=False),
        _attributes(), *_created(),
        _version_fk("layout_point"),
        sa.UniqueConstraint("layout_version_id", "point_key", name="uq_layout_point_key"),
        sa.UniqueConstraint("layout_version_id", "id", name="uq_layout_point_version_id"),
        sa.CheckConstraint("btrim(point_key) <> ''", name="ck_layout_point_key"),
        sa.CheckConstraint("x_m >= 0 AND y_m >= 0", name="ck_layout_point_xy"),
        sa.CheckConstraint("jsonb_typeof(attributes) = 'object'", name="ck_layout_point_attributes"),
    )

    op.create_table(
        "asset_placement",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("layout_version_id"), _uuid("asset_id"),
        sa.Column("x_m", COORD, nullable=False), sa.Column("y_m", COORD, nullable=False),
        sa.Column("width_m", COORD), sa.Column("height_m", COORD), sa.Column("rotation_deg", COORD),
        _attributes(), *_created(),
        _version_fk("asset_placement"),
        sa.ForeignKeyConstraint(["project_id", "asset_id"], ["asset.project_id", "asset.id"], ondelete="RESTRICT",
                                name="fk_asset_placement_asset"),
        sa.UniqueConstraint("layout_version_id", "asset_id", name="uq_asset_placement_asset"),
        sa.CheckConstraint("x_m >= 0 AND y_m >= 0", name="ck_asset_placement_xy"),
        sa.CheckConstraint("(width_m IS NULL OR width_m > 0) AND (height_m IS NULL OR height_m > 0)",
                           name="ck_asset_placement_size"),
        sa.CheckConstraint("rotation_deg IS NULL OR (rotation_deg >= 0 AND rotation_deg < 360)",
                           name="ck_asset_placement_rotation"),
        sa.CheckConstraint("jsonb_typeof(attributes) = 'object'", name="ck_asset_placement_attributes"),
    )

    op.create_table(
        "layout_port_point",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("layout_version_id"), _uuid("port_id"), _uuid("point_id"),
        *_created(),
        _version_fk("layout_port_point"),
        sa.ForeignKeyConstraint(["project_id", "port_id"], ["asset_port.project_id", "asset_port.id"],
                                ondelete="RESTRICT", name="fk_layout_port_point_port"),
        sa.ForeignKeyConstraint(["layout_version_id", "point_id"], ["layout_point.layout_version_id", "layout_point.id"],
                                ondelete="RESTRICT", name="fk_layout_port_point_point"),
        sa.UniqueConstraint("layout_version_id", "port_id", name="uq_layout_port_point_port"),
    )

    op.create_table(
        "layout_route",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("layout_version_id"),
        sa.Column("route_key", sa.Text(), nullable=False),
        _uuid("from_port_id"), _uuid("to_port_id"),
        sa.Column("mode", sa.Text()),
        _attributes(), *_created(),
        _version_fk("layout_route"),
        sa.ForeignKeyConstraint(["project_id", "from_port_id"], ["asset_port.project_id", "asset_port.id"],
                                ondelete="RESTRICT", name="fk_layout_route_from_port"),
        sa.ForeignKeyConstraint(["project_id", "to_port_id"], ["asset_port.project_id", "asset_port.id"],
                                ondelete="RESTRICT", name="fk_layout_route_to_port"),
        sa.UniqueConstraint("layout_version_id", "route_key", name="uq_layout_route_key"),
        sa.UniqueConstraint("layout_version_id", "id", name="uq_layout_route_version_id"),
        sa.CheckConstraint("btrim(route_key) <> ''", name="ck_layout_route_key"),
        sa.CheckConstraint("mode IS NULL OR btrim(mode) <> ''", name="ck_layout_route_mode"),
        sa.CheckConstraint("jsonb_typeof(attributes) = 'object'", name="ck_layout_route_attributes"),
    )

    op.create_table(
        "layout_route_point",
        _uuid("project_id"), _uuid("layout_version_id"), _uuid("route_id"),
        sa.Column("seq", sa.Integer(), nullable=False),
        _uuid("point_id"),
        *_created(),
        sa.PrimaryKeyConstraint("route_id", "seq", name="pk_layout_route_point"),
        _version_fk("layout_route_point"),
        sa.ForeignKeyConstraint(["layout_version_id", "route_id"], ["layout_route.layout_version_id", "layout_route.id"],
                                ondelete="RESTRICT", name="fk_layout_route_point_route"),
        sa.ForeignKeyConstraint(["layout_version_id", "point_id"], ["layout_point.layout_version_id", "layout_point.id"],
                                ondelete="RESTRICT", name="fk_layout_route_point_point"),
        sa.CheckConstraint("seq >= 0", name="ck_layout_route_point_seq"),
    )
    for table in CHILD_TABLES:
        op.create_index(f"ix_{table}_layout_version_id", table, ["layout_version_id"])

    # 배치판: draft → approved만, 초안이 아니면 내용 동결, 초안만 삭제.
    op.execute(
        """
        CREATE FUNCTION layout_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                IF OLD.status <> 'draft' THEN
                    RAISE EXCEPTION 'only draft layout versions can be deleted (version %)', OLD.id
                        USING ERRCODE = 'restrict_violation';
                END IF;
                RETURN OLD;
            END IF;
            IF NEW.id <> OLD.id OR NEW.project_id <> OLD.project_id OR NEW.version_no <> OLD.version_no
               OR NEW.base_version_id IS DISTINCT FROM OLD.base_version_id THEN
                RAISE EXCEPTION 'layout version identity is immutable (version %)', OLD.id
                    USING ERRCODE = 'restrict_violation';
            END IF;
            IF NEW.status <> OLD.status AND NOT (OLD.status = 'draft' AND NEW.status = 'approved') THEN
                RAISE EXCEPTION 'illegal layout version status transition % -> %', OLD.status, NEW.status
                    USING ERRCODE = 'restrict_violation';
            END IF;
            IF OLD.status <> 'draft' AND (
                   NEW.name IS DISTINCT FROM OLD.name OR NEW.notes IS DISTINCT FROM OLD.notes
                OR NEW.canvas_width_m IS DISTINCT FROM OLD.canvas_width_m
                OR NEW.canvas_height_m IS DISTINCT FROM OLD.canvas_height_m
                OR NEW.attributes IS DISTINCT FROM OLD.attributes
                OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
                OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
                RAISE EXCEPTION 'layout version content is immutable unless draft (version %)', OLD.id
                    USING ERRCODE = 'restrict_violation';
            END IF;
            RETURN NEW;
        END $$
        """
    )
    op.execute("CREATE TRIGGER trg_layout_version_guard BEFORE UPDATE OR DELETE ON layout_version "
               "FOR EACH ROW EXECUTE FUNCTION layout_version_guard()")
    op.execute(
        """
        CREATE FUNCTION layout_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            vid uuid;
            st text;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                vid := OLD.layout_version_id;
            ELSE
                vid := NEW.layout_version_id;
            END IF;
            SELECT status INTO st FROM layout_version WHERE id = vid;
            IF FOUND AND st <> 'draft' THEN
                RAISE EXCEPTION '% is immutable unless its layout version is draft (version %)', TG_TABLE_NAME, vid
                    USING ERRCODE = 'restrict_violation';
            END IF;
            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            END IF;
            RETURN NEW;
        END $$
        """
    )
    for table in CHILD_TABLES:
        op.execute(f"CREATE TRIGGER trg_{table}_guard BEFORE INSERT OR UPDATE OR DELETE ON {table} "
                   "FOR EACH ROW EXECUTE FUNCTION layout_child_guard()")


def downgrade() -> None:
    for table in reversed(CHILD_TABLES):
        op.execute(f"DROP TRIGGER trg_{table}_guard ON {table}")
    op.execute("DROP FUNCTION layout_child_guard()")
    op.execute("DROP TRIGGER trg_layout_version_guard ON layout_version")
    op.execute("DROP FUNCTION layout_version_guard()")
    for table in reversed(("layout_version", *CHILD_TABLES)):
        op.drop_table(table)
