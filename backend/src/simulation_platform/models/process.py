"""단계 A 공정 버전·그래프. 기준: CR-backend-20261023-be04-process-versions (BE-04a)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from simulation_platform.models.base import Base, CreatedMixin, IdMixin, MutableMixin

PROCESS_STATUSES = ("draft", "in_review", "approved", "superseded")
NODE_KINDS = ("source", "buffer", "operation", "join", "milestone", "sink")
EDGE_KINDS = ("material", "precedence", "supply")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def _version_fk(table: str) -> ForeignKeyConstraint:
    return ForeignKeyConstraint(
        ["project_id", "process_version_id"],
        ["process_version.project_id", "process_version.id"],
        name=f"fk_{table}_version", ondelete="RESTRICT")


class ProcessVersion(IdMixin, MutableMixin, Base):
    """제품의 공정 정의 버전. 자산 버전과 같은 상태 흐름이며 승인본·검토 중 내용은 동결된다."""

    __tablename__ = "process_version"
    __table_args__ = (
        UniqueConstraint("product_id", "version_no", name="uq_process_version_product_no"),
        UniqueConstraint("project_id", "id", name="uq_process_version_project_id"),
        ForeignKeyConstraint(
            ["project_id", "product_id"], ["product.project_id", "product.id"],
            name="fk_process_version_product", ondelete="RESTRICT"),
        CheckConstraint(_in("status", PROCESS_STATUSES), name="ck_process_version_status"),
        CheckConstraint("version_no > 0", name="ck_process_version_no"),
        CheckConstraint(
            "status NOT IN ('approved', 'superseded')"
            " OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)",
            name="ck_process_version_approval"),
        Index("uq_process_version_one_open", "product_id", unique=True,
              postgresql_where=text("status IN ('draft', 'in_review')")),
        Index("uq_process_version_one_approved", "product_id", unique=True,
              postgresql_where=text("status = 'approved'")),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    version_no: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, server_default="draft")
    schema_version: Mapped[str] = mapped_column(Text, server_default="1.0")
    base_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("process_version.id", ondelete="RESTRICT"))
    raw_unit_spec: Mapped[dict] = mapped_column(JSONB)
    finished_unit_spec: Mapped[dict] = mapped_column(JSONB)
    notes: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class FlowNode(IdMixin, CreatedMixin, Base):
    __tablename__ = "flow_node"
    __table_args__ = (
        _version_fk("flow_node"),
        ForeignKeyConstraint(
            ["project_id", "asset_id", "asset_kind"],
            ["asset.project_id", "asset.id", "asset.kind"],
            name="fk_flow_node_asset", ondelete="RESTRICT"),
        UniqueConstraint("process_version_id", "node_key", name="uq_flow_node_key"),
        UniqueConstraint("project_id", "process_version_id", "id", name="uq_flow_node_version_id"),
        UniqueConstraint("project_id", "process_version_id", "id", "kind",
                         name="uq_flow_node_version_id_kind"),
        CheckConstraint(_in("kind", NODE_KINDS), name="ck_flow_node_kind"),
        CheckConstraint("(asset_id IS NULL) = (asset_kind IS NULL)", name="ck_flow_node_asset"),
        CheckConstraint("asset_id IS NULL OR kind IN ('source', 'buffer', 'sink')",
                        name="ck_flow_node_asset_kind_of_node"),
        CheckConstraint("asset_kind IS NULL OR asset_kind IN ('storage', 'dock')",
                        name="ck_flow_node_space_asset"),
        CheckConstraint("btrim(node_key) <> ''", name="ck_flow_node_node_key"),
        CheckConstraint("btrim(label) <> ''", name="ck_flow_node_label"),
        Index("ix_flow_node_process_version_id", "process_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    process_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    node_key: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(Text)
    label: Mapped[str] = mapped_column(Text)
    asset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    asset_kind: Mapped[str | None] = mapped_column(Text)
    display_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))


class ProcessStep(CreatedMixin, Base):
    """operation 노드의 단계 규칙. 단계 id는 노드 id와 같다."""

    __tablename__ = "process_step"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "process_version_id", "node_id", "node_kind"],
            ["flow_node.project_id", "flow_node.process_version_id", "flow_node.id",
             "flow_node.kind"], name="fk_process_step_node", ondelete="RESTRICT"),
        UniqueConstraint("project_id", "process_version_id", "node_id",
                         name="uq_process_step_version_node"),
        CheckConstraint("node_kind = 'operation'", name="ck_process_step_node_kind"),
        CheckConstraint("operation_type IS NULL OR btrim(operation_type) <> ''",
                        name="ck_process_step_operation_type"),
        CheckConstraint("handler_version IS NULL OR btrim(handler_version) <> ''",
                        name="ck_process_step_handler_version"),
        Index("ix_process_step_process_version_id", "process_version_id"),
    )

    node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    process_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    node_kind: Mapped[str] = mapped_column(Text, server_default="operation")
    operation_type: Mapped[str | None] = mapped_column(Text)
    handler_version: Mapped[str | None] = mapped_column(Text)
    timing_rule: Mapped[dict] = mapped_column(JSONB)
    input_rule: Mapped[dict] = mapped_column(JSONB)
    output_rule: Mapped[dict] = mapped_column(JSONB)
    handoff_rule: Mapped[dict] = mapped_column(JSONB)
    residual_rule: Mapped[dict] = mapped_column(JSONB)


class ResourceRequirement(IdMixin, CreatedMixin, Base):
    __tablename__ = "resource_requirement"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "process_version_id", "step_node_id"],
            ["process_step.project_id", "process_step.process_version_id", "process_step.node_id"],
            name="fk_resource_requirement_step", ondelete="RESTRICT"),
        UniqueConstraint("step_node_id", "role_key", name="uq_resource_requirement_role"),
        UniqueConstraint("project_id", "process_version_id", "id",
                         name="uq_resource_requirement_version_id"),
        CheckConstraint("resource_kind IN ('equipment', 'worker')",
                        name="ck_resource_requirement_kind"),
        CheckConstraint("selection_mode IN ('one_of', 'all_of')",
                        name="ck_resource_requirement_selection"),
        CheckConstraint("required_count >= 1", name="ck_resource_requirement_count"),
        CheckConstraint("capacity_mode IN ('finite', 'unlimited')",
                        name="ck_resource_requirement_capacity"),
        CheckConstraint("resource_kind = 'worker' OR capacity_mode = 'finite'",
                        name="ck_resource_requirement_unlimited_worker_only"),
        CheckConstraint("btrim(role_key) <> ''", name="ck_resource_requirement_role"),
        Index("ix_resource_requirement_process_version_id", "process_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    process_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    step_node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    role_key: Mapped[str] = mapped_column(Text)
    resource_kind: Mapped[str] = mapped_column(Text)
    selection_mode: Mapped[str] = mapped_column(Text)
    required_count: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    capacity_mode: Mapped[str] = mapped_column(Text, server_default="finite")
    allocation_rule: Mapped[dict] = mapped_column(JSONB)


class RequirementCandidate(IdMixin, CreatedMixin, Base):
    __tablename__ = "requirement_candidate"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "process_version_id", "requirement_id"],
            ["resource_requirement.project_id", "resource_requirement.process_version_id",
             "resource_requirement.id"], name="fk_requirement_candidate_req", ondelete="RESTRICT"),
        ForeignKeyConstraint(
            ["project_id", "asset_id", "asset_kind"],
            ["asset.project_id", "asset.id", "asset.kind"],
            name="fk_requirement_candidate_asset", ondelete="RESTRICT"),
        UniqueConstraint("requirement_id", "asset_id", name="uq_requirement_candidate_asset"),
        CheckConstraint("asset_kind = 'equipment'", name="ck_requirement_candidate_kind"),
        CheckConstraint("eligibility_status IN ('confirmed', 'unknown')",
                        name="ck_requirement_candidate_eligibility"),
        Index("ix_requirement_candidate_process_version_id", "process_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    process_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    requirement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_kind: Mapped[str] = mapped_column(Text, server_default="equipment")
    eligibility_status: Mapped[str] = mapped_column(Text, server_default="unknown")


class FlowEdge(IdMixin, CreatedMixin, Base):
    __tablename__ = "flow_edge"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "process_version_id", "from_node_id"],
            ["flow_node.project_id", "flow_node.process_version_id", "flow_node.id"],
            name="fk_flow_edge_from", ondelete="RESTRICT"),
        ForeignKeyConstraint(
            ["project_id", "process_version_id", "to_node_id"],
            ["flow_node.project_id", "flow_node.process_version_id", "flow_node.id"],
            name="fk_flow_edge_to", ondelete="RESTRICT"),
        UniqueConstraint("process_version_id", "edge_key", name="uq_flow_edge_key"),
        CheckConstraint(_in("edge_kind", EDGE_KINDS), name="ck_flow_edge_kind"),
        CheckConstraint("from_node_id <> to_node_id", name="ck_flow_edge_no_self_loop"),
        CheckConstraint("btrim(edge_key) <> ''", name="ck_flow_edge_edge_key"),
        Index("ix_flow_edge_process_version_id", "process_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    process_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    edge_key: Mapped[str] = mapped_column(Text)
    from_node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    to_node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    edge_kind: Mapped[str] = mapped_column(Text)
    movement_rule: Mapped[dict] = mapped_column(JSONB)
