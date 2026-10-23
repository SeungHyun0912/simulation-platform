from sqlalchemy import select
from sqlalchemy.orm import Session

from simulation_platform.auth.principal import Principal
from simulation_platform.models import Organization, OrganizationMember, Project, ProjectMember
from simulation_platform.schemas.me import MeOrganization, MeOut, MeProject, MeUser


def get_me(session: Session, principal: Principal) -> MeOut:
    orgs = session.execute(
        select(Organization, OrganizationMember.role)
        .join(OrganizationMember, OrganizationMember.organization_id == Organization.id)
        .where(OrganizationMember.user_id == principal.user_id)
        .order_by(Organization.code)
    ).all()
    projects = session.execute(
        select(Project, ProjectMember.role)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == principal.user_id)
        .order_by(Project.code, Project.id)
    ).all()
    return MeOut(
        user=MeUser(id=principal.user_id, display_name=principal.display_name),
        organizations=[MeOrganization(id=o.id, code=o.code, name=o.name, role=r) for o, r in orgs],
        projects=[MeProject(id=p.id, organization_id=p.organization_id, code=p.code,
                            name=p.name, status=p.status, role=r) for p, r in projects],
    )
