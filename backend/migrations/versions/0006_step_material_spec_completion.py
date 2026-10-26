"""step_material_spec, flow_edge spec 연결, process_version.completion_node_id

수동 작성·검토본. 기준: CR-backend-20261026-be06-process-material-spec-completion(BE-04c), ERD §5.
- step_material_spec: operation 단계의 입력·출력 재료 spec. 수량은 `default_spec`과 같은 값 객체(JSONB, unknown 기본).
  자식 가드 트리거(부모 버전이 draft일 때만 변경)를 같이 건다.
- flow_edge: source_output_spec_id / target_input_spec_id. 복합 FK가 spec이 **간선 끝점 단계에 속하는지와 방향
  (output/input)** 을 DB에서 강제한다(상수 방향 컬럼 + MATCH SIMPLE: spec id가 NULL이면 검사하지 않는다).
  precedence 간선에는 연결할 수 없다.
- process_version.completion_node_id: milestone 노드만 가리키는 복합 FK(같은 방식), 동결 대상 컬럼에 추가.

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

# process_version_guard의 이전(0004) 본문. downgrade에서 복원한다.
GUARD_BODY_TEMPLATE = """
        CREATE OR REPLACE FUNCTION process_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
                OR NEW.notes IS DISTINCT FROM OLD.notes__COMPLETION__
                OR NEW.schema_version <> OLD.schema_version) THEN
                RAISE EXCEPTION 'process version content is immutable unless draft (version %)',
                    OLD.id USING ERRCODE = 'restrict_violation';
            END IF;
            RETURN NEW;
        END $$
"""
WITH_COMPLETION = GUARD_BODY_TEMPLATE.replace(
    "__COMPLETION__", "\n                OR NEW.completion_node_id IS DISTINCT FROM OLD.completion_node_id")
WITHOUT_COMPLETION = GUARD_BODY_TEMPLATE.replace("__COMPLETION__", "")


def upgrade() -> None:
    op.create_table(
        "step_material_spec",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column("project_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("process_version_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("step_node_id", pg.UUID(as_uuid=True), nullable=False),
        sa.Column("spec_key", sa.Text(), nullable=False),
        sa.Column("direction", sa.Text(), nullable=False),
        sa.Column("material_definition_id", pg.UUID(as_uuid=True)),
        sa.Column("state_code", sa.Text()),
        sa.Column("form", sa.Text()),
        sa.Column("quantity", pg.JSONB(), nullable=False),
        sa.Column("quantity_basis", sa.Text(), server_default="unknown", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("created_by", pg.UUID(as_uuid=True)),
        sa.ForeignKeyConstraint(
            ["project_id", "process_version_id", "step_node_id"],
            ["process_step.project_id", "process_step.process_version_id", "process_step.node_id"],
            ondelete="RESTRICT", name="fk_step_material_spec_step"),
        sa.ForeignKeyConstraint(
            ["project_id", "material_definition_id"],
            ["material_definition.project_id", "material_definition.id"],
            ondelete="RESTRICT", name="fk_step_material_spec_material"),
        sa.UniqueConstraint("step_node_id", "spec_key", name="uq_step_material_spec_key"),
        sa.UniqueConstraint("project_id", "process_version_id", "step_node_id", "id", "direction",
                            name="uq_step_material_spec_edge_ref"),
        sa.CheckConstraint("direction IN ('input', 'output')", name="ck_step_material_spec_direction"),
        sa.CheckConstraint(
            "quantity_basis IN ('unknown', 'per_operation', 'per_input_unit', 'per_lot', 'total_plan')",
            name="ck_step_material_spec_basis"),
        sa.CheckConstraint("btrim(spec_key) <> ''", name="ck_step_material_spec_key"),
        sa.CheckConstraint("state_code IS NULL OR btrim(state_code) <> ''",
                           name="ck_step_material_spec_state"),
        sa.CheckConstraint("form IS NULL OR btrim(form) <> ''", name="ck_step_material_spec_form"),
        sa.CheckConstraint("jsonb_typeof(quantity) = 'object'", name="ck_step_material_spec_quantity"),
    )
    op.create_index("ix_step_material_spec_process_version_id", "step_material_spec",
                    ["process_version_id"])
    op.execute(
        "CREATE TRIGGER trg_step_material_spec_guard BEFORE INSERT OR UPDATE OR DELETE "
        "ON step_material_spec FOR EACH ROW EXECUTE FUNCTION process_graph_child_guard()")

    # 간선의 spec 연결: 방향 상수 컬럼을 복합 FK에 넣어 output/input 방향까지 DB가 강제한다.
    op.add_column("flow_edge", sa.Column("source_output_spec_id", pg.UUID(as_uuid=True)))
    op.add_column("flow_edge", sa.Column("source_spec_direction", sa.Text(),
                                         server_default="output", nullable=False))
    op.add_column("flow_edge", sa.Column("target_input_spec_id", pg.UUID(as_uuid=True)))
    op.add_column("flow_edge", sa.Column("target_spec_direction", sa.Text(),
                                         server_default="input", nullable=False))
    op.create_foreign_key(
        "fk_flow_edge_source_spec", "flow_edge", "step_material_spec",
        ["project_id", "process_version_id", "from_node_id", "source_output_spec_id",
         "source_spec_direction"],
        ["project_id", "process_version_id", "step_node_id", "id", "direction"],
        ondelete="RESTRICT")
    op.create_foreign_key(
        "fk_flow_edge_target_spec", "flow_edge", "step_material_spec",
        ["project_id", "process_version_id", "to_node_id", "target_input_spec_id",
         "target_spec_direction"],
        ["project_id", "process_version_id", "step_node_id", "id", "direction"],
        ondelete="RESTRICT")
    op.create_check_constraint("ck_flow_edge_source_direction", "flow_edge",
                               "source_spec_direction = 'output'")
    op.create_check_constraint("ck_flow_edge_target_direction", "flow_edge",
                               "target_spec_direction = 'input'")
    op.create_check_constraint(
        "ck_flow_edge_spec_link_kind", "flow_edge",
        "edge_kind <> 'precedence' OR (source_output_spec_id IS NULL AND target_input_spec_id IS NULL)")

    # 완제품 지정 milestone.
    op.add_column("process_version", sa.Column("completion_node_id", pg.UUID(as_uuid=True)))
    op.add_column("process_version", sa.Column("completion_node_kind", sa.Text(),
                                               server_default="milestone", nullable=False))
    op.create_check_constraint("ck_process_version_completion_kind", "process_version",
                               "completion_node_kind = 'milestone'")
    op.create_foreign_key(
        "fk_process_version_completion", "process_version", "flow_node",
        ["project_id", "id", "completion_node_id", "completion_node_kind"],
        ["project_id", "process_version_id", "id", "kind"], ondelete="RESTRICT")
    op.execute(WITH_COMPLETION)


def downgrade() -> None:
    op.execute(WITHOUT_COMPLETION)
    op.drop_constraint("fk_process_version_completion", "process_version", type_="foreignkey")
    op.drop_constraint("ck_process_version_completion_kind", "process_version", type_="check")
    op.drop_column("process_version", "completion_node_kind")
    op.drop_column("process_version", "completion_node_id")
    for name in ("ck_flow_edge_spec_link_kind", "ck_flow_edge_target_direction",
                 "ck_flow_edge_source_direction"):
        op.drop_constraint(name, "flow_edge", type_="check")
    op.drop_constraint("fk_flow_edge_target_spec", "flow_edge", type_="foreignkey")
    op.drop_constraint("fk_flow_edge_source_spec", "flow_edge", type_="foreignkey")
    for column in ("target_spec_direction", "target_input_spec_id", "source_spec_direction",
                   "source_output_spec_id"):
        op.drop_column("flow_edge", column)
    op.execute("DROP TRIGGER trg_step_material_spec_guard ON step_material_spec")
    op.drop_index("ix_step_material_spec_process_version_id", table_name="step_material_spec")
    op.drop_table("step_material_spec")
