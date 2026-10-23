"""조직·프로젝트 권한 조회. 모든 프로젝트 범위 접근은 여기서 멤버십을 먼저 확인한다."""

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from simulation_platform.models import OrganizationMember, Project, ProjectMember


@dataclass(frozen=True)
class ProjectAccess:
    project: Project
    role: str


def find_project_access(session: Session, user_id: uuid.UUID, project_id: uuid.UUID):
    """멤버가 아니거나 프로젝트가 없으면 None(호출자는 동일한 404로 처리)."""
    row = session.execute(
        select(Project, ProjectMember.role)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(Project.id == project_id, ProjectMember.user_id == user_id)
    ).one_or_none()
    return None if row is None else ProjectAccess(project=row[0], role=row[1])


def find_org_role(session: Session, user_id: uuid.UUID, organization_id: uuid.UUID) -> str | None:
    return session.scalar(
        select(OrganizationMember.role).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user_id,
        )
    )
