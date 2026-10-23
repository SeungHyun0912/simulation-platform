"""단계 A 첫 scope: 조직·사용자·프로젝트·멤버십·감사. 기준: docs/architecture/02_erd_database.md §4."""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from simulation_platform.models.base import Base, CreatedMixin, IdMixin, MutableMixin

# 권한 역할·상태 허용값은 TECH-006(승인자/권한 정책) 미결이라 잠정값이다. CR 참조.
ORG_ROLES = ("admin", "member")
PROJECT_ROLES = ("admin", "editor", "viewer")


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Organization(IdMixin, MutableMixin, Base):
    __tablename__ = "organization"
    __table_args__ = (
        UniqueConstraint("code", name="uq_organization_code"),
        CheckConstraint(_in("status", ("active", "archived")), name="ck_organization_status"),
    )

    name: Mapped[str] = mapped_column(Text)
    code: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="active")


class AppUser(IdMixin, MutableMixin, Base):
    __tablename__ = "app_user"
    __table_args__ = (
        UniqueConstraint("auth_issuer", "auth_subject", name="uq_app_user_issuer_subject"),
        CheckConstraint(_in("status", ("active", "disabled")), name="ck_app_user_status"),
    )

    auth_issuer: Mapped[str] = mapped_column(Text)
    auth_subject: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="active")


class OrganizationMember(IdMixin, MutableMixin, Base):
    __tablename__ = "organization_member"
    __table_args__ = (
        # 한 사용자는 조직당 하나의 역할(ERD의 '조직/사용자/역할 유일' 해석은 CR 참조).
        UniqueConstraint("organization_id", "user_id", name="uq_org_member_org_user"),
        CheckConstraint(_in("role", ORG_ROLES), name="ck_org_member_role"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="RESTRICT")
    )
    role: Mapped[str] = mapped_column(Text)


class Project(IdMixin, MutableMixin, Base):
    __tablename__ = "project"
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_project_org_code"),
        UniqueConstraint("organization_id", "id", name="uq_project_org_id"),
        CheckConstraint(_in("status", ("active", "archived")), name="ck_project_status"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT")
    )
    code: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="active")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProjectMember(IdMixin, MutableMixin, Base):
    """프로젝트 멤버는 같은 조직의 멤버여야 한다(복합 FK로 강제)."""

    __tablename__ = "project_member"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_member_project_user"),
        ForeignKeyConstraint(
            ["organization_id", "project_id"],
            ["project.organization_id", "project.id"],
            name="fk_project_member_project",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["organization_id", "user_id"],
            ["organization_member.organization_id", "organization_member.user_id"],
            name="fk_project_member_org_member",
            ondelete="RESTRICT",
        ),
        CheckConstraint(_in("role", PROJECT_ROLES), name="ck_project_member_role"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    role: Mapped[str] = mapped_column(Text)


class AuditLog(IdMixin, CreatedMixin, Base):
    """append-only. UPDATE/DELETE/TRUNCATE는 트리거가 거부한다. 민감 필드 마스킹은 서비스 책임."""

    __tablename__ = "audit_log"
    __table_args__ = (
        ForeignKeyConstraint(
            ["organization_id", "project_id"],
            ["project.organization_id", "project.id"],
            name="fk_audit_log_project",
            ondelete="RESTRICT",
        ),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="RESTRICT")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("app_user.id", ondelete="RESTRICT")
    )
    action: Mapped[str] = mapped_column(Text)
    entity_type: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    before: Mapped[dict | None] = mapped_column(JSONB)
    after: Mapped[dict | None] = mapped_column(JSONB)
    request_id: Mapped[str | None] = mapped_column(Text)
