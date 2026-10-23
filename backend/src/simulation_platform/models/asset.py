"""단계 A 첫 scope: 자산·상세·포트. 기준: docs/architecture/02_erd_database.md §4 포트 정합성."""

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
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from simulation_platform.models.base import Base, IdMixin, MutableMixin

ASSET_KINDS = ("equipment", "storage", "dock")
SPACE_KINDS = ("storage", "dock")
PORT_ROLES = ("IN", "OUT", "ACCESS")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Asset(IdMixin, MutableMixin, Base):
    __tablename__ = "asset"
    __table_args__ = (
        UniqueConstraint("project_id", "id", name="uq_asset_project_id"),
        # 하위 테이블이 kind까지 복합 FK로 묶어 subtype 불일치를 DB에서 막는다.
        UniqueConstraint("project_id", "id", "kind", name="uq_asset_project_id_kind"),
        UniqueConstraint("project_id", "code", name="uq_asset_project_code"),
        CheckConstraint(_in("kind", ASSET_KINDS), name="ck_asset_kind"),
        Index("ix_asset_project_kind_archived", "project_id", "kind", "archived_at"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project.id", ondelete="RESTRICT")
    )
    kind: Mapped[str] = mapped_column(Text)
    code: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    external_ref: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EquipmentDetail(MutableMixin, Base):
    """식별 분류만. 능력·용량·달력은 asset_revision(후속 묶음)."""

    __tablename__ = "equipment_detail"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "asset_id", "asset_kind"],
            ["asset.project_id", "asset.id", "asset.kind"],
            name="fk_equipment_detail_asset",
            ondelete="RESTRICT",
        ),
        CheckConstraint("asset_kind = 'equipment'", name="ck_equipment_detail_kind"),
        CheckConstraint("btrim(equipment_type) <> ''", name="ck_equipment_detail_type"),
    )

    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_kind: Mapped[str] = mapped_column(Text, server_default="equipment")
    equipment_type: Mapped[str] = mapped_column(Text)
    model_name: Mapped[str | None] = mapped_column(Text)


class SpaceDetail(MutableMixin, Base):
    """storage/dock 전용. 공간 용량은 asset_revision(후속 묶음)."""

    __tablename__ = "space_detail"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "asset_id", "asset_kind"],
            ["asset.project_id", "asset.id", "asset.kind"],
            name="fk_space_detail_asset",
            ondelete="RESTRICT",
        ),
        CheckConstraint(_in("asset_kind", SPACE_KINDS), name="ck_space_detail_kind"),
        CheckConstraint("btrim(space_type) <> ''", name="ck_space_detail_type"),
    )

    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_kind: Mapped[str] = mapped_column(Text)
    space_type: Mapped[str] = mapped_column(Text)


class AssetPort(IdMixin, MutableMixin, Base):
    """설비는 IN/OUT 각 1개, 공간은 ACCESS 1개 이상(지연 트리거로 커밋 시 검증)."""

    __tablename__ = "asset_port"
    __table_args__ = (
        UniqueConstraint("project_id", "id", name="uq_asset_port_project_id"),
        UniqueConstraint("project_id", "asset_id", "id", name="uq_asset_port_project_asset_id"),
        # port_policy가 IN/OUT 포트만 참조하도록 role까지 묶는 복합 FK의 대상(0002).
        UniqueConstraint("project_id", "asset_id", "id", "role",
                         name="uq_asset_port_project_asset_id_role"),
        UniqueConstraint("project_id", "asset_id", "port_key", name="uq_asset_port_key"),
        ForeignKeyConstraint(
            ["project_id", "asset_id", "asset_kind"],
            ["asset.project_id", "asset.id", "asset.kind"],
            name="fk_asset_port_asset",
            ondelete="RESTRICT",
        ),
        CheckConstraint(_in("role", PORT_ROLES), name="ck_asset_port_role"),
        CheckConstraint(
            "(asset_kind = 'equipment' AND role IN ('IN', 'OUT'))"
            " OR (asset_kind <> 'equipment' AND role = 'ACCESS')",
            name="ck_asset_port_role_kind",
        ),
        CheckConstraint("btrim(port_key) <> ''", name="ck_asset_port_key"),
        Index(
            "uq_asset_port_one_in_out",
            "project_id",
            "asset_id",
            "role",
            unique=True,
            postgresql_where=text("role IN ('IN', 'OUT')"),
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_kind: Mapped[str] = mapped_column(Text)
    port_key: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(Text)
    label: Mapped[str] = mapped_column(Text)
