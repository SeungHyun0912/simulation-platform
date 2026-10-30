"""배치판(layout). 기준: CR-backend-20261028-be18-layout-points-routes(BE-21), ERD §7, migration 0011.

좌표계는 고정이다: m, 도면 왼쪽 위 원점, x 오른쪽·y 아래쪽, 소수 첫째 자리. 설비·공간의 x·y는 중심이다.
통로 대신 점(LayoutPoint)과 점 순서(LayoutRoutePoint)로 경로를 표현한다. 승인 후 배치판과 하위 행은 DB가 동결한다.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from simulation_platform.models.base import Base, CreatedMixin, IdMixin, MutableMixin

COORD = Numeric(9, 1)


def _version_fk(table: str) -> ForeignKeyConstraint:
    return ForeignKeyConstraint(["project_id", "layout_version_id"], ["layout_version.project_id", "layout_version.id"],
                                name=f"fk_{table}_version", ondelete="RESTRICT")


def _point_fk(table: str) -> ForeignKeyConstraint:
    return ForeignKeyConstraint(["layout_version_id", "point_id"], ["layout_point.layout_version_id", "layout_point.id"],
                                name=f"fk_{table}_point", ondelete="RESTRICT")


def _attributes() -> Mapped[dict]:
    return mapped_column(JSONB, server_default=text("'{}'::jsonb"))


class LayoutVersion(IdMixin, MutableMixin, Base):
    __tablename__ = "layout_version"
    __table_args__ = (
        ForeignKeyConstraint(["project_id"], ["project.id"], name="fk_layout_version_project", ondelete="RESTRICT"),
        ForeignKeyConstraint(["project_id", "base_version_id"], ["layout_version.project_id", "layout_version.id"],
                             name="fk_layout_version_base", ondelete="RESTRICT"),
        UniqueConstraint("project_id", "version_no", name="uq_layout_version_no"),
        UniqueConstraint("project_id", "id", name="uq_layout_version_project_id"),
        CheckConstraint("status IN ('draft', 'approved')", name="ck_layout_version_status"),
        CheckConstraint("version_no > 0", name="ck_layout_version_no"),
        CheckConstraint("canvas_width_m IS NULL OR canvas_width_m > 0", name="ck_layout_version_canvas_width"),
        CheckConstraint("canvas_height_m IS NULL OR canvas_height_m > 0", name="ck_layout_version_canvas_height"),
        CheckConstraint("jsonb_typeof(attributes) = 'object'", name="ck_layout_version_attributes"),
        CheckConstraint("status <> 'approved' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)",
                        name="ck_layout_version_approval"),
        Index("uq_layout_version_one_draft", "project_id", unique=True, postgresql_where=text("status = 'draft'")),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    version_no: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, server_default="draft")
    base_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    name: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    canvas_width_m: Mapped[Decimal | None] = mapped_column(COORD)
    canvas_height_m: Mapped[Decimal | None] = mapped_column(COORD)
    attributes: Mapped[dict] = _attributes()
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class LayoutPoint(IdMixin, CreatedMixin, Base):
    """도면 위의 점(P1, P2, …). 포트 위치와 경로의 꺾이는 곳이 모두 점이다."""

    __tablename__ = "layout_point"
    __table_args__ = (
        _version_fk("layout_point"),
        UniqueConstraint("layout_version_id", "point_key", name="uq_layout_point_key"),
        UniqueConstraint("layout_version_id", "id", name="uq_layout_point_version_id"),
        CheckConstraint("btrim(point_key) <> ''", name="ck_layout_point_key"),
        CheckConstraint("x_m >= 0 AND y_m >= 0", name="ck_layout_point_xy"),
        CheckConstraint("jsonb_typeof(attributes) = 'object'", name="ck_layout_point_attributes"),
        Index("ix_layout_point_layout_version_id", "layout_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    layout_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    point_key: Mapped[str] = mapped_column(Text)
    x_m: Mapped[Decimal] = mapped_column(COORD)
    y_m: Mapped[Decimal] = mapped_column(COORD)
    attributes: Mapped[dict] = _attributes()


class AssetPlacement(IdMixin, CreatedMixin, Base):
    """설비·저장공간의 배치. x·y는 중심, 가로(x)·세로(y)·회전은 모르면 null."""

    __tablename__ = "asset_placement"
    __table_args__ = (
        _version_fk("asset_placement"),
        ForeignKeyConstraint(["project_id", "asset_id"], ["asset.project_id", "asset.id"],
                             name="fk_asset_placement_asset", ondelete="RESTRICT"),
        UniqueConstraint("layout_version_id", "asset_id", name="uq_asset_placement_asset"),
        CheckConstraint("x_m >= 0 AND y_m >= 0", name="ck_asset_placement_xy"),
        CheckConstraint("(width_m IS NULL OR width_m > 0) AND (height_m IS NULL OR height_m > 0)",
                        name="ck_asset_placement_size"),
        CheckConstraint("rotation_deg IS NULL OR (rotation_deg >= 0 AND rotation_deg < 360)",
                        name="ck_asset_placement_rotation"),
        CheckConstraint("jsonb_typeof(attributes) = 'object'", name="ck_asset_placement_attributes"),
        Index("ix_asset_placement_layout_version_id", "layout_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    layout_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    x_m: Mapped[Decimal] = mapped_column(COORD)
    y_m: Mapped[Decimal] = mapped_column(COORD)
    width_m: Mapped[Decimal | None] = mapped_column(COORD)
    height_m: Mapped[Decimal | None] = mapped_column(COORD)
    rotation_deg: Mapped[Decimal | None] = mapped_column(COORD)
    attributes: Mapped[dict] = _attributes()


class LayoutPortPoint(IdMixin, CreatedMixin, Base):
    """포트(설비 In/Out, 공간 Access) → 점. 배치판 안에서 포트당 하나."""

    __tablename__ = "layout_port_point"
    __table_args__ = (
        _version_fk("layout_port_point"),
        ForeignKeyConstraint(["project_id", "port_id"], ["asset_port.project_id", "asset_port.id"],
                             name="fk_layout_port_point_port", ondelete="RESTRICT"),
        _point_fk("layout_port_point"),
        UniqueConstraint("layout_version_id", "port_id", name="uq_layout_port_point_port"),
        Index("ix_layout_port_point_layout_version_id", "layout_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    layout_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    port_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    point_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))


class LayoutRoute(IdMixin, CreatedMixin, Base):
    """출발 포트에서 도착 포트까지의 이동 경로. 점 순서는 LayoutRoutePoint."""

    __tablename__ = "layout_route"
    __table_args__ = (
        _version_fk("layout_route"),
        ForeignKeyConstraint(["project_id", "from_port_id"], ["asset_port.project_id", "asset_port.id"],
                             name="fk_layout_route_from_port", ondelete="RESTRICT"),
        ForeignKeyConstraint(["project_id", "to_port_id"], ["asset_port.project_id", "asset_port.id"],
                             name="fk_layout_route_to_port", ondelete="RESTRICT"),
        UniqueConstraint("layout_version_id", "route_key", name="uq_layout_route_key"),
        UniqueConstraint("layout_version_id", "id", name="uq_layout_route_version_id"),
        CheckConstraint("btrim(route_key) <> ''", name="ck_layout_route_key"),
        CheckConstraint("mode IS NULL OR btrim(mode) <> ''", name="ck_layout_route_mode"),
        CheckConstraint("jsonb_typeof(attributes) = 'object'", name="ck_layout_route_attributes"),
        Index("ix_layout_route_layout_version_id", "layout_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    layout_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    route_key: Mapped[str] = mapped_column(Text)
    from_port_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    to_port_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    mode: Mapped[str | None] = mapped_column(Text)
    attributes: Mapped[dict] = _attributes()


class LayoutRoutePoint(CreatedMixin, Base):
    __tablename__ = "layout_route_point"
    __table_args__ = (
        PrimaryKeyConstraint("route_id", "seq", name="pk_layout_route_point"),
        _version_fk("layout_route_point"),
        ForeignKeyConstraint(["layout_version_id", "route_id"], ["layout_route.layout_version_id", "layout_route.id"],
                             name="fk_layout_route_point_route", ondelete="RESTRICT"),
        _point_fk("layout_route_point"),
        CheckConstraint("seq >= 0", name="ck_layout_route_point_seq"),
        Index("ix_layout_route_point_layout_version_id", "layout_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    layout_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    route_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    seq: Mapped[int] = mapped_column(Integer)
    point_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))


class LayoutAisle(IdMixin, CreatedMixin, Base):
    """통로(W): 포트에 묶이지 않은 다닐 수 있는 선(양방향, CR be19). 점 순서는 LayoutAislePoint."""

    __tablename__ = "layout_aisle"
    __table_args__ = (
        _version_fk("layout_aisle"),
        UniqueConstraint("layout_version_id", "aisle_key", name="uq_layout_aisle_key"),
        UniqueConstraint("layout_version_id", "id", name="uq_layout_aisle_version_id"),
        CheckConstraint("btrim(aisle_key) <> ''", name="ck_layout_aisle_key"),
        CheckConstraint("jsonb_typeof(attributes) = 'object'", name="ck_layout_aisle_attributes"),
        Index("ix_layout_aisle_layout_version_id", "layout_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    layout_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    aisle_key: Mapped[str] = mapped_column(Text)
    attributes: Mapped[dict] = _attributes()


class LayoutAislePoint(CreatedMixin, Base):
    __tablename__ = "layout_aisle_point"
    __table_args__ = (
        PrimaryKeyConstraint("aisle_id", "seq", name="pk_layout_aisle_point"),
        _version_fk("layout_aisle_point"),
        ForeignKeyConstraint(["layout_version_id", "aisle_id"], ["layout_aisle.layout_version_id", "layout_aisle.id"],
                             name="fk_layout_aisle_point_aisle", ondelete="RESTRICT"),
        _point_fk("layout_aisle_point"),
        CheckConstraint("seq >= 0", name="ck_layout_aisle_point_seq"),
        Index("ix_layout_aisle_point_layout_version_id", "layout_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    layout_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    aisle_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    seq: Mapped[int] = mapped_column(Integer)
    point_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
