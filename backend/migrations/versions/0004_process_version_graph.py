"""process_version, flow_node, process_step, resource_requirement, requirement_candidate, flow_edge

수동 작성·검토본. 기준: CR-backend-20261023-be04-process-versions(BE-04a), ERD §5·§9·§14.
- 공정 버전은 자산 버전과 같은 상태 전이 표·내용 동결·부분 유일 인덱스(제품당 열린 버전 1, 승인본 1)를 트리거로 강제한다.
- 노드·간선·단계·자원 요구·후보는 모두 (project_id, process_version_id) 복합 FK로 같은 프로젝트·버전만 묶고,
  부모 버전이 draft일 때만 변경할 수 있다(자식 직접 수정으로 승인 불변이 깨지는 것을 막는다, ERD §14).
- 의도적으로 두지 않은 것(04b·04c): step_material_spec, process_editor_state, completion_node_id, input_match_policy,
  condition_rule, execution_rule, requirement_candidate.parameter_override.

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

CHILD_TABLES = ("flow_node", "process_step", "resource_requirement", "requirement_candidate",
                "flow_edge")


def _uuid(name, nullable=False):
    return sa.Column(name, pg.UUID(as_uuid=True), nullable=nullable)


def _ts(name):
    return sa.Column(name, sa.DateTime(timezone=True))


def _created():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", pg.UUID(as_uuid=True)),
    ]


def _child_cols():
    return [
        _uuid("project_id"), _uuid("process_version_id"),
    ]


def _version_fk(table):
    return sa.ForeignKeyConstraint(
        ["project_id", "process_version_id"], ["process_version.project_id", "process_version.id"],
        ondelete="RESTRICT", name=f"fk_{table}_version")


def upgrade() -> None:
    op.create_table(
        "process_version",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        _uuid("project_id"), _uuid("product_id"),
        sa.Column("version_no", sa.Integer(), nullable=False),
        sa.Column("status", sa.Text(), server_default="draft", nullable=False),
        sa.Column("schema_version", sa.Text(), server_default="1.0", nullable=False),
        _uuid("base_version_id", True),
        sa.Column("raw_unit_spec", pg.JSONB(), nullable=False),
        sa.Column("finished_unit_spec", pg.JSONB(), nullable=False),
        sa.Column("notes", sa.Text()),
        _ts("submitted_at"), _uuid("submitted_by", True),
        sa.Column("rejection_reason", sa.Text()), _ts("rejected_at"), _uuid("rejected_by", True),
        _ts("approved_at"), _uuid("approved_by", True),
        *_created(),
        _ts("updated_at"), _uuid("updated_by", True),
        sa.Column("row_version", sa.BigInteger(), server_default=sa.text("1"), nullable=False),
        sa.ForeignKeyConstraint(["project_id", "product_id"], ["product.project_id", "product.id"],
                                ondelete="RESTRICT", name="fk_process_version_product"),
        sa.ForeignKeyConstraint(["base_version_id"], ["process_version.id"], ondelete="RESTRICT",
                                name="fk_process_version_base_version_id_process_version"),
        sa.UniqueConstraint("product_id", "version_no", name="uq_process_version_product_no"),
        sa.UniqueConstraint("project_id", "id", name="uq_process_version_project_id"),
        sa.CheckConstraint("status IN ('draft', 'in_review', 'approved', 'superseded')",
                           name="ck_process_version_status"),
        sa.CheckConstraint("version_no > 0", name="ck_process_version_no"),
        sa.CheckConstraint(
            "status NOT IN ('approved', 'superseded')"
            " OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)",
            name="ck_process_version_approval"),
    )
    op.create_index("uq_process_version_one_open", "process_version", ["product_id"], unique=True,
                    postgresql_where=sa.text("status IN ('draft', 'in_review')"))
    op.create_index("uq_process_version_one_approved", "process_version", ["product_id"],
                    unique=True, postgresql_where=sa.text("status = 'approved'"))

    op.create_table(
        "flow_node",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        *_child_cols(),
        sa.Column("node_key", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        _uuid("asset_id", True),
        sa.Column("asset_kind", sa.Text()),
        sa.Column("display_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        *_created(),
        _version_fk("flow_node"),
        sa.ForeignKeyConstraint(["project_id", "asset_id", "asset_kind"],
                                ["asset.project_id", "asset.id", "asset.kind"],
                                ondelete="RESTRICT", name="fk_flow_node_asset"),
        sa.UniqueConstraint("process_version_id", "node_key", name="uq_flow_node_key"),
        sa.UniqueConstraint("project_id", "process_version_id", "id",
                            name="uq_flow_node_version_id"),
        sa.UniqueConstraint("project_id", "process_version_id", "id", "kind",
                            name="uq_flow_node_version_id_kind"),
        sa.CheckConstraint(
            "kind IN ('source', 'buffer', 'operation', 'join', 'milestone', 'sink')",
            name="ck_flow_node_kind"),
        sa.CheckConstraint("(asset_id IS NULL) = (asset_kind IS NULL)", name="ck_flow_node_asset"),
        sa.CheckConstraint("asset_id IS NULL OR kind IN ('source', 'buffer', 'sink')",
                           name="ck_flow_node_asset_kind_of_node"),
        sa.CheckConstraint("asset_kind IS NULL OR asset_kind IN ('storage', 'dock')",
                           name="ck_flow_node_space_asset"),
        sa.CheckConstraint("btrim(node_key) <> ''", name="ck_flow_node_node_key"),
        sa.CheckConstraint("btrim(label) <> ''", name="ck_flow_node_label"),
    )

    op.create_table(
        "process_step",
        sa.Column("node_id", pg.UUID(as_uuid=True), primary_key=True),
        *_child_cols(),
        sa.Column("node_kind", sa.Text(), server_default="operation", nullable=False),
        sa.Column("operation_type", sa.Text()),
        sa.Column("handler_version", sa.Text()),
        sa.Column("timing_rule", pg.JSONB(), nullable=False),
        sa.Column("input_rule", pg.JSONB(), nullable=False),
        sa.Column("output_rule", pg.JSONB(), nullable=False),
        sa.Column("handoff_rule", pg.JSONB(), nullable=False),
        sa.Column("residual_rule", pg.JSONB(), nullable=False),
        *_created(),
        sa.ForeignKeyConstraint(
            ["project_id", "process_version_id", "node_id", "node_kind"],
            ["flow_node.project_id", "flow_node.process_version_id", "flow_node.id",
             "flow_node.kind"], ondelete="RESTRICT", name="fk_process_step_node"),
        sa.UniqueConstraint("project_id", "process_version_id", "node_id",
                            name="uq_process_step_version_node"),
        sa.CheckConstraint("node_kind = 'operation'", name="ck_process_step_node_kind"),
        sa.CheckConstraint("operation_type IS NULL OR btrim(operation_type) <> ''",
                           name="ck_process_step_operation_type"),
        sa.CheckConstraint("handler_version IS NULL OR btrim(handler_version) <> ''",
                           name="ck_process_step_handler_version"),
    )

    op.create_table(
        "resource_requirement",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        *_child_cols(),
        _uuid("step_node_id"),
        sa.Column("role_key", sa.Text(), nullable=False),
        sa.Column("resource_kind", sa.Text(), nullable=False),
        sa.Column("selection_mode", sa.Text(), nullable=False),
        sa.Column("required_count", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("capacity_mode", sa.Text(), server_default="finite", nullable=False),
        sa.Column("allocation_rule", pg.JSONB(), nullable=False),
        *_created(),
        sa.ForeignKeyConstraint(
            ["project_id", "process_version_id", "step_node_id"],
            ["process_step.project_id", "process_step.process_version_id", "process_step.node_id"],
            ondelete="RESTRICT", name="fk_resource_requirement_step"),
        sa.UniqueConstraint("step_node_id", "role_key", name="uq_resource_requirement_role"),
        sa.UniqueConstraint("project_id", "process_version_id", "id",
                            name="uq_resource_requirement_version_id"),
        sa.CheckConstraint("resource_kind IN ('equipment', 'worker')",
                           name="ck_resource_requirement_kind"),
        sa.CheckConstraint("selection_mode IN ('one_of', 'all_of')",
                           name="ck_resource_requirement_selection"),
        sa.CheckConstraint("required_count >= 1", name="ck_resource_requirement_count"),
        sa.CheckConstraint("capacity_mode IN ('finite', 'unlimited')",
                           name="ck_resource_requirement_capacity"),
        sa.CheckConstraint("resource_kind = 'worker' OR capacity_mode = 'finite'",
                           name="ck_resource_requirement_unlimited_worker_only"),
        sa.CheckConstraint("btrim(role_key) <> ''", name="ck_resource_requirement_role"),
    )

    op.create_table(
        "requirement_candidate",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        *_child_cols(),
        _uuid("requirement_id"), _uuid("asset_id"),
        sa.Column("asset_kind", sa.Text(), server_default="equipment", nullable=False),
        sa.Column("eligibility_status", sa.Text(), server_default="unknown", nullable=False),
        *_created(),
        sa.ForeignKeyConstraint(
            ["project_id", "process_version_id", "requirement_id"],
            ["resource_requirement.project_id", "resource_requirement.process_version_id",
             "resource_requirement.id"], ondelete="RESTRICT", name="fk_requirement_candidate_req"),
        sa.ForeignKeyConstraint(["project_id", "asset_id", "asset_kind"],
                                ["asset.project_id", "asset.id", "asset.kind"],
                                ondelete="RESTRICT", name="fk_requirement_candidate_asset"),
        sa.UniqueConstraint("requirement_id", "asset_id", name="uq_requirement_candidate_asset"),
        sa.CheckConstraint("asset_kind = 'equipment'", name="ck_requirement_candidate_kind"),
        sa.CheckConstraint("eligibility_status IN ('confirmed', 'unknown')",
                           name="ck_requirement_candidate_eligibility"),
    )

    op.create_table(
        "flow_edge",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        *_child_cols(),
        sa.Column("edge_key", sa.Text(), nullable=False),
        _uuid("from_node_id"), _uuid("to_node_id"),
        sa.Column("edge_kind", sa.Text(), nullable=False),
        sa.Column("movement_rule", pg.JSONB(), nullable=False),
        *_created(),
        sa.ForeignKeyConstraint(
            ["project_id", "process_version_id", "from_node_id"],
            ["flow_node.project_id", "flow_node.process_version_id", "flow_node.id"],
            ondelete="RESTRICT", name="fk_flow_edge_from"),
        sa.ForeignKeyConstraint(
            ["project_id", "process_version_id", "to_node_id"],
            ["flow_node.project_id", "flow_node.process_version_id", "flow_node.id"],
            ondelete="RESTRICT", name="fk_flow_edge_to"),
        sa.UniqueConstraint("process_version_id", "edge_key", name="uq_flow_edge_key"),
        sa.CheckConstraint("edge_kind IN ('material', 'precedence', 'supply')",
                           name="ck_flow_edge_kind"),
        sa.CheckConstraint("from_node_id <> to_node_id", name="ck_flow_edge_no_self_loop"),
        sa.CheckConstraint("btrim(edge_key) <> ''", name="ck_flow_edge_edge_key"),
    )
    for table in CHILD_TABLES:
        op.create_index(f"ix_{table}_process_version_id", table, ["process_version_id"])

    # 공정 버전: 상태 전이 표와 초안 외 내용 동결(자산 버전의 asset_revision_guard와 같은 방식).
    op.execute(
        """
        CREATE FUNCTION process_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP = 'DELETE' THEN
                IF OLD.status <> 'draft' THEN
                    RAISE EXCEPTION 'only draft process versions can be deleted (version %)', OLD.id
                        USING ERRCODE = 'restrict_violation';
                END IF;
                RETURN OLD;
            END IF;
            IF NEW.id <> OLD.id OR NEW.project_id <> OLD.project_id
               OR NEW.product_id <> OLD.product_id OR NEW.version_no <> OLD.version_no
               OR NEW.base_version_id IS DISTINCT FROM OLD.base_version_id THEN
                RAISE EXCEPTION 'process version identity is immutable (version %)', OLD.id
                    USING ERRCODE = 'restrict_violation';
            END IF;
            IF NEW.status <> OLD.status AND NOT (
                   (OLD.status = 'draft' AND NEW.status = 'in_review')
                OR (OLD.status = 'in_review' AND NEW.status IN ('draft', 'approved'))
                OR (OLD.status = 'approved' AND NEW.status = 'superseded')) THEN
                RAISE EXCEPTION 'illegal process version status transition % -> %',
                    OLD.status, NEW.status USING ERRCODE = 'restrict_violation';
            END IF;
            IF OLD.status <> 'draft' AND (
                   NEW.raw_unit_spec IS DISTINCT FROM OLD.raw_unit_spec
                OR NEW.finished_unit_spec IS DISTINCT FROM OLD.finished_unit_spec
                OR NEW.notes IS DISTINCT FROM OLD.notes
                OR NEW.schema_version <> OLD.schema_version) THEN
                RAISE EXCEPTION 'process version content is immutable unless draft (version %)',
                    OLD.id USING ERRCODE = 'restrict_violation';
            END IF;
            RETURN NEW;
        END $$
        """
    )
    op.execute(
        "CREATE TRIGGER trg_process_version_guard BEFORE UPDATE OR DELETE ON process_version "
        "FOR EACH ROW EXECUTE FUNCTION process_version_guard()"
    )
    # 자식 행(노드·단계·자원 요구·후보·간선)은 부모 버전이 draft일 때만 변경할 수 있다.
    op.execute(
        """
        CREATE FUNCTION process_graph_child_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        DECLARE
            vid uuid;
            st text;
        BEGIN
            IF TG_OP = 'DELETE' THEN
                vid := OLD.process_version_id;
            ELSE
                vid := NEW.process_version_id;
            END IF;
            SELECT status INTO st FROM process_version WHERE id = vid;
            IF FOUND AND st <> 'draft' THEN
                RAISE EXCEPTION '% is immutable unless its process version is draft (version %)',
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
            "FOR EACH ROW EXECUTE FUNCTION process_graph_child_guard()"
        )


def downgrade() -> None:
    for table in reversed(CHILD_TABLES):
        op.execute(f"DROP TRIGGER trg_{table}_guard ON {table}")
    op.execute("DROP FUNCTION process_graph_child_guard()")
    op.execute("DROP TRIGGER trg_process_version_guard ON process_version")
    op.execute("DROP FUNCTION process_version_guard()")
    for table in ("flow_edge", "requirement_candidate", "resource_requirement", "process_step",
                  "flow_node", "process_version"):
        op.drop_table(table)
