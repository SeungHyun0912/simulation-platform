"""asset_revision, port_policy: 자산 버전·포트 정책(용량/배출 규칙)

수동 작성·검토본. 기준: CR-backend-20261023-be02-asset-revision-capacity (승인됨), ERD §4·§14.
- 상태 전이(draft→in_review→approved→superseded)와 승인본·검토 중 내용 불변을 DB 트리거로 강제한다.
- port_policy는 부모 revision이 draft일 때만 변경 가능하고, 설비 revision은 커밋 시 IN/OUT 정책을 모두 가져야 한다.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def _uuid(name, nullable=False):
    return sa.Column(name, pg.UUID(as_uuid=True), nullable=nullable)


def _ts(name):
    return sa.Column(name, sa.DateTime(timezone=True))


def _audit_cols():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", pg.UUID(as_uuid=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.Column("updated_by", pg.UUID(as_uuid=True)),
        sa.Column("row_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
    ]


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_asset_port_project_asset_id_role", "asset_port",
        ["project_id", "asset_id", "id", "role"])

    op.create_table(
        "asset_revision",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("asset_id"),
        sa.Column("asset_kind", sa.Text(), nullable=False),
        sa.Column("revision_no", sa.Integer(), nullable=False),
        sa.Column("status", sa.Text(), server_default="draft", nullable=False),
        sa.Column("schema_version", sa.Text(), server_default="1.0", nullable=False),
        sa.Column("storage_capacity", pg.JSONB()),
        sa.Column("notes", sa.Text()),
        _ts("submitted_at"), _uuid("submitted_by", True),
        sa.Column("rejection_reason", sa.Text()), _ts("rejected_at"), _uuid("rejected_by", True),
        _ts("approved_at"), _uuid("approved_by", True),
        *_audit_cols(),
        sa.ForeignKeyConstraint(["project_id", "asset_id", "asset_kind"],
                                ["asset.project_id", "asset.id", "asset.kind"],
                                ondelete="RESTRICT", name="fk_asset_revision_asset"),
        sa.UniqueConstraint("asset_id", "revision_no", name="uq_asset_revision_asset_no"),
        sa.UniqueConstraint("project_id", "asset_id", "id",
                            name="uq_asset_revision_project_asset_id"),
        sa.CheckConstraint("status IN ('draft', 'in_review', 'approved', 'superseded')",
                           name="ck_asset_revision_status"),
        sa.CheckConstraint("revision_no > 0", name="ck_asset_revision_no"),
        sa.CheckConstraint(
            "(asset_kind = 'equipment' AND storage_capacity IS NULL)"
            " OR (asset_kind <> 'equipment' AND storage_capacity IS NOT NULL)",
            name="ck_asset_revision_storage_capacity"),
        sa.CheckConstraint(
            "status NOT IN ('approved', 'superseded')"
            " OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)",
            name="ck_asset_revision_approval"),
    )
    op.create_index("uq_asset_revision_one_open", "asset_revision", ["asset_id"], unique=True,
                    postgresql_where=sa.text("status IN ('draft', 'in_review')"))
    op.create_index("uq_asset_revision_one_approved", "asset_revision", ["asset_id"], unique=True,
                    postgresql_where=sa.text("status = 'approved'"))

    op.create_table(
        "port_policy",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("asset_id"), _uuid("asset_revision_id"), _uuid("port_id"),
        sa.Column("port_role", sa.Text(), nullable=False),
        sa.Column("buffer_capacity", pg.JSONB(), nullable=False),
        sa.Column("dispatch_rule", pg.JSONB(), nullable=False),
        sa.Column("release_rule", pg.JSONB(), nullable=False),
        *_audit_cols(),
        sa.ForeignKeyConstraint(
            ["project_id", "asset_id", "asset_revision_id"],
            ["asset_revision.project_id", "asset_revision.asset_id", "asset_revision.id"],
            ondelete="RESTRICT", name="fk_port_policy_revision"),
        sa.ForeignKeyConstraint(
            ["project_id", "asset_id", "port_id", "port_role"],
            ["asset_port.project_id", "asset_port.asset_id", "asset_port.id", "asset_port.role"],
            ondelete="RESTRICT", name="fk_port_policy_port"),
        sa.UniqueConstraint("asset_revision_id", "port_id", name="uq_port_policy_revision_port"),
        sa.CheckConstraint("port_role IN ('IN', 'OUT')", name="ck_port_policy_role"),
    )
    op.create_index("ix_port_policy_asset_revision_id", "port_policy", ["asset_revision_id"])

    # 상태 전이와 내용 불변. 승인·검토 중·대체된 버전의 설정 값은 바꿀 수 없다.
    op.execute(
        """
        CREATE FUNCTION asset_revision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                IF OLD.status <> 'draft' THEN
                    RAISE EXCEPTION 'only draft revisions can be deleted (revision %)', OLD.id
                        USING ERRCODE = 'restrict_violation';
                END IF;
                RETURN OLD;
            END IF;
            IF NEW.id <> OLD.id OR NEW.project_id <> OLD.project_id OR NEW.asset_id <> OLD.asset_id
               OR NEW.asset_kind <> OLD.asset_kind OR NEW.revision_no <> OLD.revision_no THEN
                RAISE EXCEPTION 'revision identity is immutable (revision %)', OLD.id
                    USING ERRCODE = 'restrict_violation';
            END IF;
            IF NEW.status <> OLD.status AND NOT (
                   (OLD.status = 'draft' AND NEW.status = 'in_review')
                OR (OLD.status = 'in_review' AND NEW.status IN ('draft', 'approved'))
                OR (OLD.status = 'approved' AND NEW.status = 'superseded')) THEN
                RAISE EXCEPTION 'illegal revision status transition % -> %', OLD.status, NEW.status
                    USING ERRCODE = 'restrict_violation';
            END IF;
            IF OLD.status <> 'draft' AND (
                   NEW.storage_capacity IS DISTINCT FROM OLD.storage_capacity
                OR NEW.notes IS DISTINCT FROM OLD.notes
                OR NEW.schema_version <> OLD.schema_version) THEN
                RAISE EXCEPTION 'revision content is immutable unless draft (revision %)', OLD.id
                    USING ERRCODE = 'restrict_violation';
            END IF;
            RETURN NEW;
        END $$
        """
    )
    op.execute(
        "CREATE TRIGGER trg_asset_revision_guard BEFORE UPDATE OR DELETE ON asset_revision "
        "FOR EACH ROW EXECUTE FUNCTION asset_revision_guard()"
    )
    op.execute(
        """
        CREATE FUNCTION port_policy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            rid uuid;
            st text;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                rid := OLD.asset_revision_id;
            ELSE
                rid := NEW.asset_revision_id;
            END IF;
            SELECT status INTO st FROM asset_revision WHERE id = rid;
            IF FOUND AND st <> 'draft' THEN
                RAISE EXCEPTION 'port policy is immutable unless its revision is draft (revision %)',
                    rid USING ERRCODE = 'restrict_violation';
            END IF;
            IF TG_OP = 'UPDATE' AND (NEW.asset_revision_id <> OLD.asset_revision_id
                                     OR NEW.port_id <> OLD.port_id) THEN
                RAISE EXCEPTION 'port policy identity is immutable (policy %)', OLD.id
                    USING ERRCODE = 'restrict_violation';
            END IF;
            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            END IF;
            RETURN NEW;
        END $$
        """
    )
    op.execute(
        "CREATE TRIGGER trg_port_policy_guard BEFORE INSERT OR UPDATE OR DELETE ON port_policy "
        "FOR EACH ROW EXECUTE FUNCTION port_policy_guard()"
    )

    # 설비 revision은 커밋 시점에 IN/OUT 정책을 각각 가져야 한다(포트 불변식과 같은 지연 트리거 패턴).
    op.execute(
        """
        CREATE FUNCTION check_revision_policies() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            rid uuid;
            kind text;
        BEGIN
            IF TG_TABLE_NAME = 'asset_revision' THEN
                rid := NEW.id;
            ELSIF TG_OP = 'DELETE' THEN
                rid := OLD.asset_revision_id;
            ELSE
                rid := NEW.asset_revision_id;
            END IF;
            SELECT asset_kind INTO kind FROM asset_revision WHERE id = rid;
            IF NOT FOUND THEN
                RETURN NULL;
            END IF;
            IF kind = 'equipment' AND (
                   (SELECT count(*) FROM port_policy WHERE asset_revision_id = rid
                                                       AND port_role = 'IN') <> 1
                OR (SELECT count(*) FROM port_policy WHERE asset_revision_id = rid
                                                       AND port_role = 'OUT') <> 1) THEN
                RAISE EXCEPTION 'equipment revision % must have exactly one IN and one OUT policy',
                    rid USING ERRCODE = 'check_violation';
            END IF;
            RETURN NULL;
        END $$
        """
    )
    op.execute(
        "CREATE CONSTRAINT TRIGGER trg_revision_policies_on_revision AFTER INSERT ON asset_revision "
        "DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_revision_policies()"
    )
    op.execute(
        "CREATE CONSTRAINT TRIGGER trg_revision_policies_on_policy "
        "AFTER INSERT OR UPDATE OR DELETE ON port_policy "
        "DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_revision_policies()"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER trg_revision_policies_on_policy ON port_policy")
    op.execute("DROP TRIGGER trg_revision_policies_on_revision ON asset_revision")
    op.execute("DROP FUNCTION check_revision_policies()")
    op.execute("DROP TRIGGER trg_port_policy_guard ON port_policy")
    op.execute("DROP FUNCTION port_policy_guard()")
    op.execute("DROP TRIGGER trg_asset_revision_guard ON asset_revision")
    op.execute("DROP FUNCTION asset_revision_guard()")
    op.drop_table("port_policy")
    op.drop_table("asset_revision")
    op.drop_constraint("uq_asset_port_project_asset_id_role", "asset_port", type_="unique")
