import uuid

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from simulation_platform.models import Project, ProjectMember
from simulation_platform.repositories.keyset import apply_keyset

KEY_COLUMNS = [Project.code, Project.id]


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_member_projects(
    session: Session,
    user_id: uuid.UUID,
    *,
    q: str | None,
    limit: int,
    cursor_values: list | None,
) -> list[Project]:
    """호출자가 멤버인 프로젝트만. limit+1건 반환."""
    stmt: Select = (
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user_id)
    )
    if q:
        pattern = f"%{_escape_like(q)}%"
        stmt = stmt.where(or_(Project.code.ilike(pattern, escape="\\"),
                              Project.name.ilike(pattern, escape="\\")))
    return list(session.scalars(apply_keyset(stmt, KEY_COLUMNS, False, cursor_values)
                                .limit(limit + 1)))
