"""단계 A 두 번째 묶음: 자산 버전과 포트 정책. 기준: CR-backend-20261023-be02-asset-revision-capacity."""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from simulation_platform.models.base import Base, IdMixin, MutableMixin

REVISION_STATUSES = ("draft", "in_review", "approved", "superseded")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class AssetRevision(IdMixin, MutableMixin, Base):
    """자산 설정 버전. 설비는 storage_capacity가 NULL, 공간은 필수(NULL 금지)."""

    __tablename__ = "asset_revision"
    __table_args__ = (
        UniqueConstraint("asset_id", "revision_no", name="uq_asset_revision_asset_no"),
        UniqueConstraint("project_id", "asset_id", "id", name="uq_asset_revision_project_asset_id"),
        ForeignKeyConstraint(
            ["project_id", "asset_id", "asset_kind"],
            ["asset.project_id", "asset.id", "asset.kind"],
            name="fk_asset_revision_asset",
            ondelete="RESTRICT",
        ),
        CheckConstraint(_in("status", REVISION_STATUSES), name="ck_asset_revision_status"),
        CheckConstraint("revision_no > 0", name="ck_asset_revision_no"),
        CheckConstraint(
            "(asset_kind = 'equipment' AND storage_capacity IS NULL)"
            " OR (asset_kind <> 'equipment' AND storage_capacity IS NOT NULL)",
            name="ck_asset_revision_storage_capacity",
        ),
        CheckConstraint(
            "status NOT IN ('approved', 'superseded')"
            " OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)",
            name="ck_asset_revision_approval",
        ),
        # 자산당 열린 버전(draft/in_review)은 하나, 승인된 버전도 하나.
        Index("uq_asset_revision_one_open", "asset_id", unique=True,
              postgresql_where=text("status IN ('draft', 'in_review')")),
        Index("uq_asset_revision_one_approved", "asset_id", unique=True,
              postgresql_where=text("status = 'approved'")),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_kind: Mapped[str] = mapped_column(Text)
    revision_no: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, server_default="draft")
    schema_version: Mapped[str] = mapped_column(Text, server_default="1.0")
    # None을 JSON null이 아니라 SQL NULL로 저장해야 설비/공간 CHECK가 의미대로 동작한다.
    storage_capacity: Mapped[dict | None] = mapped_column(JSONB(none_as_null=True))
    notes: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class PortPolicy(IdMixin, MutableMixin, Base):
    """설비 IN/OUT 포트별 버퍼 용량·배출 규칙. 공간(ACCESS)에는 만들지 않는다."""

    __tablename__ = "port_policy"
    __table_args__ = (
        UniqueConstraint("asset_revision_id", "port_id", name="uq_port_policy_revision_port"),
        ForeignKeyConstraint(
            ["project_id", "asset_id", "asset_revision_id"],
            ["asset_revision.project_id", "asset_revision.asset_id", "asset_revision.id"],
            name="fk_port_policy_revision",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["project_id", "asset_id", "port_id", "port_role"],
            ["asset_port.project_id", "asset_port.asset_id", "asset_port.id", "asset_port.role"],
            name="fk_port_policy_port",
            ondelete="RESTRICT",
        ),
        CheckConstraint("port_role IN ('IN', 'OUT')", name="ck_port_policy_role"),
        Index("ix_port_policy_asset_revision_id", "asset_revision_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_revision_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    port_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    port_role: Mapped[str] = mapped_column(Text)
    buffer_capacity: Mapped[dict] = mapped_column(JSONB)
    dispatch_rule: Mapped[dict] = mapped_column(JSONB)
    release_rule: Mapped[dict] = mapped_column(JSONB)
