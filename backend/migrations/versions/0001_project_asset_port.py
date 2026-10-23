"""project/asset/port 첫 scope: organization, app_user, members, project, asset, detail, port, audit

수동 작성·검토본(autogenerate 미사용). 기준: docs/architecture/02_erd_database.md §4, §16.

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _id():
    return sa.Column("id", pg.UUID(as_uuid=True), primary_key=True)


def _created():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("created_by", pg.UUID(as_uuid=True)),
    ]


def _mutable():
    return _created() + [
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.Column("updated_by", pg.UUID(as_uuid=True)),
        sa.Column("row_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
    ]


def _uuid(name, nullable=False):
    return sa.Column(name, pg.UUID(as_uuid=True), nullable=nullable)


def _text(name, nullable=False, **kw):
    return sa.Column(name, sa.Text(), nullable=nullable, **kw)


def upgrade() -> None:
    op.create_table(
        "organization",
        _id(), _text("name"), _text("code"), _text("status", server_default="active"), *_mutable(),
        sa.UniqueConstraint("code", name="uq_organization_code"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_organization_status"),
    )
    op.create_table(
        "app_user",
        _id(), _text("auth_issuer"), _text("auth_subject"), _text("display_name"),
        _text("status", server_default="active"), *_mutable(),
        sa.UniqueConstraint("auth_issuer", "auth_subject", name="uq_app_user_issuer_subject"),
        sa.CheckConstraint("status IN ('active', 'disabled')", name="ck_app_user_status"),
    )
    op.create_table(
        "organization_member",
        _id(), _uuid("organization_id"), _uuid("user_id"), _text("role"), *_mutable(),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT",
                                name="fk_organization_member_organization_id_organization"),
        sa.ForeignKeyConstraint(["user_id"], ["app_user.id"], ondelete="RESTRICT",
                                name="fk_organization_member_user_id_app_user"),
        sa.UniqueConstraint("organization_id", "user_id", name="uq_org_member_org_user"),
        sa.CheckConstraint("role IN ('admin', 'member')", name="ck_org_member_role"),
    )
    op.create_table(
        "project",
        _id(), _uuid("organization_id"), _text("code"), _text("name"), _text("timezone"),
        _text("description", nullable=True), _text("status", server_default="active"),
        sa.Column("archived_at", sa.DateTime(timezone=True)), *_mutable(),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT",
                                name="fk_project_organization_id_organization"),
        sa.UniqueConstraint("organization_id", "code", name="uq_project_org_code"),
        sa.UniqueConstraint("organization_id", "id", name="uq_project_org_id"),
        sa.CheckConstraint("status IN ('active', 'archived')", name="ck_project_status"),
    )
    op.create_table(
        "project_member",
        _id(), _uuid("organization_id"), _uuid("project_id"), _uuid("user_id"), _text("role"),
        *_mutable(),
        sa.ForeignKeyConstraint(["organization_id", "project_id"],
                                ["project.organization_id", "project.id"], ondelete="RESTRICT",
                                name="fk_project_member_project"),
        sa.ForeignKeyConstraint(["organization_id", "user_id"],
                                ["organization_member.organization_id", "organization_member.user_id"],
                                ondelete="RESTRICT", name="fk_project_member_org_member"),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_member_project_user"),
        sa.CheckConstraint("role IN ('admin', 'editor', 'viewer')", name="ck_project_member_role"),
    )
    op.create_table(
        "audit_log",
        _id(), _uuid("organization_id"), _uuid("project_id", nullable=True),
        _uuid("actor_id", nullable=True), _text("action"), _text("entity_type"),
        _uuid("entity_id", nullable=True), sa.Column("before", pg.JSONB()),
        sa.Column("after", pg.JSONB()), _text("request_id", nullable=True), *_created(),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT",
                                name="fk_audit_log_organization_id_organization"),
        sa.ForeignKeyConstraint(["organization_id", "project_id"],
                                ["project.organization_id", "project.id"], ondelete="RESTRICT",
                                name="fk_audit_log_project"),
        sa.ForeignKeyConstraint(["actor_id"], ["app_user.id"], ondelete="RESTRICT",
                                name="fk_audit_log_actor_id_app_user"),
    )
    op.execute(
        """
        CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'restrict_violation';
        END $$
        """
    )
    op.execute(
        "CREATE TRIGGER trg_audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log "
        "FOR EACH ROW EXECUTE FUNCTION audit_log_append_only()"
    )
    op.execute(
        "CREATE TRIGGER trg_audit_log_no_truncate BEFORE TRUNCATE ON audit_log "
        "FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only()"
    )

    op.create_table(
        "asset",
        _id(), _uuid("project_id"), _text("kind"), _text("code"), _text("name"),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        _text("external_ref", nullable=True), _text("notes", nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True)), *_mutable(),
        sa.ForeignKeyConstraint(["project_id"], ["project.id"], ondelete="RESTRICT",
                                name="fk_asset_project_id_project"),
        sa.UniqueConstraint("project_id", "id", name="uq_asset_project_id"),
        sa.UniqueConstraint("project_id", "id", "kind", name="uq_asset_project_id_kind"),
        sa.UniqueConstraint("project_id", "code", name="uq_asset_project_code"),
        sa.CheckConstraint("kind IN ('equipment', 'storage', 'dock')", name="ck_asset_kind"),
    )
    op.create_index("ix_asset_project_kind_archived", "asset", ["project_id", "kind", "archived_at"])

    op.create_table(
        "equipment_detail",
        _uuid("asset_id"), _uuid("project_id"), _text("asset_kind", server_default="equipment"),
        _text("equipment_type"), _text("model_name", nullable=True), *_mutable(),
        sa.PrimaryKeyConstraint("asset_id", name="pk_equipment_detail"),
        sa.ForeignKeyConstraint(["project_id", "asset_id", "asset_kind"],
                                ["asset.project_id", "asset.id", "asset.kind"],
                                ondelete="RESTRICT", name="fk_equipment_detail_asset"),
        sa.CheckConstraint("asset_kind = 'equipment'", name="ck_equipment_detail_kind"),
        sa.CheckConstraint("btrim(equipment_type) <> ''", name="ck_equipment_detail_type"),
    )
    op.create_table(
        "space_detail",
        _uuid("asset_id"), _uuid("project_id"), _text("asset_kind"), _text("space_type"),
        *_mutable(),
        sa.PrimaryKeyConstraint("asset_id", name="pk_space_detail"),
        sa.ForeignKeyConstraint(["project_id", "asset_id", "asset_kind"],
                                ["asset.project_id", "asset.id", "asset.kind"],
                                ondelete="RESTRICT", name="fk_space_detail_asset"),
        sa.CheckConstraint("asset_kind IN ('storage', 'dock')", name="ck_space_detail_kind"),
        sa.CheckConstraint("btrim(space_type) <> ''", name="ck_space_detail_type"),
    )
    op.create_table(
        "asset_port",
        _id(), _uuid("project_id"), _uuid("asset_id"), _text("asset_kind"), _text("port_key"),
        _text("role"), _text("label"), *_mutable(),
        sa.ForeignKeyConstraint(["project_id", "asset_id", "asset_kind"],
                                ["asset.project_id", "asset.id", "asset.kind"],
                                ondelete="RESTRICT", name="fk_asset_port_asset"),
        sa.UniqueConstraint("project_id", "id", name="uq_asset_port_project_id"),
        sa.UniqueConstraint("project_id", "asset_id", "id", name="uq_asset_port_project_asset_id"),
        sa.UniqueConstraint("project_id", "asset_id", "port_key", name="uq_asset_port_key"),
        sa.CheckConstraint("role IN ('IN', 'OUT', 'ACCESS')", name="ck_asset_port_role"),
        sa.CheckConstraint(
            "(asset_kind = 'equipment' AND role IN ('IN', 'OUT'))"
            " OR (asset_kind <> 'equipment' AND role = 'ACCESS')",
            name="ck_asset_port_role_kind",
        ),
        sa.CheckConstraint("btrim(port_key) <> ''", name="ck_asset_port_key"),
    )
    op.create_index(
        "uq_asset_port_one_in_out", "asset_port", ["project_id", "asset_id", "role"],
        unique=True, postgresql_where=sa.text("role IN ('IN', 'OUT')"),
    )

    # 설비는 커밋 시점에 IN/OUT 각 1개, 공간은 ACCESS 1개 이상이어야 한다.
    # 한 행 CHECK로는 다른 행을 셀 수 없어 지연 제약 트리거를 쓴다(ERD §4).
    op.execute(
        """
        CREATE FUNCTION check_asset_ports() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            aid uuid;
            k text;
        BEGIN
            IF TG_TABLE_NAME = 'asset' THEN
                aid := NEW.id;
            ELSIF TG_OP = 'DELETE' THEN
                aid := OLD.asset_id;
            ELSE
                aid := NEW.asset_id;
            END IF;
            SELECT kind INTO k FROM asset WHERE id = aid;
            IF NOT FOUND THEN
                RETURN NULL;
            END IF;
            IF k = 'equipment' THEN
                IF (SELECT count(*) FROM asset_port WHERE asset_id = aid AND role = 'IN') <> 1
                   OR (SELECT count(*) FROM asset_port WHERE asset_id = aid AND role = 'OUT') <> 1 THEN
                    RAISE EXCEPTION 'equipment asset % must have exactly one IN and one OUT port', aid
                        USING ERRCODE = 'check_violation';
                END IF;
            ELSIF (SELECT count(*) FROM asset_port WHERE asset_id = aid AND role = 'ACCESS') < 1 THEN
                RAISE EXCEPTION 'space asset % must have at least one ACCESS port', aid
                    USING ERRCODE = 'check_violation';
            END IF;
            RETURN NULL;
        END $$
        """
    )
    op.execute(
        "CREATE CONSTRAINT TRIGGER trg_asset_ports_on_asset AFTER INSERT ON asset "
        "DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_asset_ports()"
    )
    op.execute(
        "CREATE CONSTRAINT TRIGGER trg_asset_ports_on_port AFTER INSERT OR UPDATE OR DELETE "
        "ON asset_port DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_asset_ports()"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER trg_asset_ports_on_port ON asset_port")
    op.execute("DROP TRIGGER trg_asset_ports_on_asset ON asset")
    op.execute("DROP FUNCTION check_asset_ports()")
    op.drop_table("asset_port")
    op.drop_table("space_detail")
    op.drop_table("equipment_detail")
    op.drop_table("asset")
    op.drop_table("audit_log")
    op.execute("DROP FUNCTION audit_log_append_only()")
    op.drop_table("project_member")
    op.drop_table("project")
    op.drop_table("organization_member")
    op.drop_table("app_user")
    op.drop_table("organization")
