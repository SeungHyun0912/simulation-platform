import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, MetaData, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# PostgreSQL 식별자는 63자 제한이라 모든 제약·인덱스는 모델과 migration에서 전체 이름을 명시한다.
# 이 규칙은 이름 없는 PK만 보정한다.
NAMING_CONVENTION = {"pk": "pk_%(table_name)s"}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def new_id() -> uuid.UUID:
    """UUID는 앱에서 생성한다(DB 확장에 의존하지 않음)."""
    return uuid.uuid4()


class IdMixin:
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_id)


class CreatedMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class MutableMixin(CreatedMixin):
    """수정 가능한 행. row_version은 compare-and-swap용(앱이 증가)."""

    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    row_version: Mapped[int] = mapped_column(BigInteger, server_default=text("1"))
