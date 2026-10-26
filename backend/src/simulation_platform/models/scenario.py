"""단계 C 시나리오 버전. 기준: CR-backend-20261026-be07-scenario-versions (BE-05a), ERD §6.

시나리오 버전은 실행 입력(제품별 승인 공정 버전·도착 계획·자산 버전·종료 규칙·가정)을 고정한다. 승인 후 불변이다.
"""

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

from simulation_platform.models.base import Base, CreatedMixin, IdMixin, MutableMixin

SCENARIO_STATUSES = ("draft", "approved")


def _scenario_version_fk(table: str) -> ForeignKeyConstraint:
    return ForeignKeyConstraint(
        ["project_id", "scenario_version_id"],
        ["scenario_version.project_id", "scenario_version.id"],
        name=f"fk_{table}_version", ondelete="RESTRICT")


class Scenario(IdMixin, MutableMixin, Base):
    __tablename__ = "scenario"
    __table_args__ = (
        ForeignKeyConstraint(["project_id"], ["project.id"], name="fk_scenario_project",
                             ondelete="RESTRICT"),
        UniqueConstraint("project_id", "code", name="uq_scenario_project_code"),
        UniqueConstraint("project_id", "id", name="uq_scenario_project_id"),
        CheckConstraint("btrim(code) <> ''", name="ck_scenario_code"),
        CheckConstraint("btrim(name) <> ''", name="ck_scenario_name"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    code: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)


class ScenarioVersion(IdMixin, MutableMixin, Base):
    __tablename__ = "scenario_version"
    __table_args__ = (
        ForeignKeyConstraint(["project_id", "scenario_id"], ["scenario.project_id", "scenario.id"],
                             name="fk_scenario_version_scenario", ondelete="RESTRICT"),
        ForeignKeyConstraint(["project_id", "base_version_id"],
                             ["scenario_version.project_id", "scenario_version.id"],
                             name="fk_scenario_version_base", ondelete="RESTRICT"),
        UniqueConstraint("scenario_id", "version_no", name="uq_scenario_version_no"),
        UniqueConstraint("project_id", "id", name="uq_scenario_version_project_id"),
        CheckConstraint("status IN ('draft', 'approved')", name="ck_scenario_version_status"),
        CheckConstraint("version_no > 0", name="ck_scenario_version_no"),
        CheckConstraint("jsonb_typeof(stopping_rule) = 'object'", name="ck_scenario_version_stopping"),
        CheckConstraint("status <> 'approved' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL)",
                        name="ck_scenario_version_approval"),
        Index("uq_scenario_version_one_draft", "scenario_id", unique=True,
              postgresql_where=text("status = 'draft'")),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    scenario_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    version_no: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, server_default="draft")
    base_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    stopping_rule: Mapped[dict] = mapped_column(JSONB)
    assumption_reason: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class ScenarioProduct(IdMixin, CreatedMixin, Base):
    """시나리오에 넣는 제품 하나 = 엔진의 Lane 하나(공정 버전·도착·가정). position이 동순위 처리 순서다."""

    __tablename__ = "scenario_product"
    __table_args__ = (
        _scenario_version_fk("scenario_product"),
        ForeignKeyConstraint(
            ["project_id", "product_id", "process_version_id"],
            ["process_version.project_id", "process_version.product_id", "process_version.id"],
            name="fk_scenario_product_process_version", ondelete="RESTRICT"),
        UniqueConstraint("scenario_version_id", "process_version_id",
                         name="uq_scenario_product_process_version"),
        UniqueConstraint("scenario_version_id", "position", name="uq_scenario_product_position"),
        CheckConstraint("priority >= 1", name="ck_scenario_product_priority"),
        CheckConstraint("position >= 0", name="ck_scenario_product_position"),
        CheckConstraint("jsonb_typeof(arrivals) = 'array'", name="ck_scenario_product_arrivals"),
        CheckConstraint("jsonb_typeof(assumptions) = 'object'", name="ck_scenario_product_assumptions"),
        Index("ix_scenario_product_scenario_version_id", "scenario_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    scenario_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    process_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    position: Mapped[int] = mapped_column(Integer)
    priority: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    arrivals: Mapped[list] = mapped_column(JSONB)
    assumptions: Mapped[dict] = mapped_column(JSONB)


class ScenarioAsset(IdMixin, CreatedMixin, Base):
    """실행에 쓰는 자산 버전 고정(용량·배출 규칙의 출처). 자산 버전은 같은 자산의 것이어야 한다."""

    __tablename__ = "scenario_asset"
    __table_args__ = (
        _scenario_version_fk("scenario_asset"),
        ForeignKeyConstraint(
            ["project_id", "asset_id", "asset_revision_id"],
            ["asset_revision.project_id", "asset_revision.asset_id", "asset_revision.id"],
            name="fk_scenario_asset_revision", ondelete="RESTRICT"),
        UniqueConstraint("scenario_version_id", "asset_id", name="uq_scenario_asset_asset"),
        Index("ix_scenario_asset_scenario_version_id", "scenario_version_id"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    scenario_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    asset_revision_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
