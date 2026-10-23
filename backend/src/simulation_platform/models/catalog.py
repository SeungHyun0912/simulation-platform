"""단계 A 두 번째 묶음: 제품·재료 기준정보. 기준: CR-backend-20261023-be03-products-materials."""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from simulation_platform.models.base import Base, IdMixin, MutableMixin


class Product(IdMixin, MutableMixin, Base):
    """버전이 없는 기준정보(공정 정의가 버전을 가진다). code는 표시 코드, 내부 id는 UUID."""

    __tablename__ = "product"
    __table_args__ = (
        UniqueConstraint("project_id", "code", name="uq_product_project_code"),
        # 이후 process_version이 (project_id, product_id)로 복합 FK할 대상.
        UniqueConstraint("project_id", "id", name="uq_product_project_id"),
        CheckConstraint("btrim(code) <> ''", name="ck_product_code"),
        CheckConstraint("btrim(name) <> ''", name="ck_product_name"),
        Index("ix_product_project_archived", "project_id", "archived_at"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project.id", ondelete="RESTRICT")
    )
    code: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    specification: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MaterialDefinition(IdMixin, MutableMixin, Base):
    """원자재·반제품 식별. default_spec은 길이·중량·단위 수·가닥 수를 섞지 않는 판별 객체."""

    __tablename__ = "material_definition"
    __table_args__ = (
        UniqueConstraint("project_id", "code", name="uq_material_project_code"),
        UniqueConstraint("project_id", "id", name="uq_material_project_id"),
        CheckConstraint("btrim(code) <> ''", name="ck_material_code"),
        CheckConstraint("btrim(name) <> ''", name="ck_material_name"),
        CheckConstraint("btrim(form) <> ''", name="ck_material_form"),
        Index("ix_material_project_archived", "project_id", "archived_at"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("project.id", ondelete="RESTRICT")
    )
    code: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    form: Mapped[str] = mapped_column(Text)
    default_spec: Mapped[dict] = mapped_column(JSONB)
    notes: Mapped[str | None] = mapped_column(Text)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
