from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func
from sqlalchemy.orm import Session

from simulation_platform.auth.principal import Principal
from simulation_platform.domain.errors import (
    EditConflictError,
    ErrorDetail,
    ForbiddenError,
    NotFoundError,
    ProjectCodeConflict,
    ValidationFailed,
)
from simulation_platform.domain.pagination import (
    DEFAULT_LIMIT,
    decode_cursor,
    encode_cursor,
    make_tag,
)
from simulation_platform.models import Project, ProjectMember
from simulation_platform.models.base import new_id
from simulation_platform.repositories import access as access_repo
from simulation_platform.repositories import projects as project_repo
from simulation_platform.repositories.access import ProjectAccess
from simulation_platform.schemas.common import Page
from simulation_platform.schemas.project import ProjectCreate, ProjectOut, ProjectPatch
from simulation_platform.services.unit_of_work import audit, transaction

NOT_FOUND_MESSAGE = "프로젝트를 찾을 수 없습니다."
WRITE_ROLES = ("admin", "editor")


def require_project(session: Session, principal: Principal, project_id) -> ProjectAccess:
    """멤버가 아니거나 프로젝트가 없으면 동일한 404."""
    found = access_repo.find_project_access(session, principal.user_id, project_id)
    if found is None:
        raise NotFoundError(NOT_FOUND_MESSAGE)
    return found


def require_write(access: ProjectAccess) -> None:
    if access.role not in WRITE_ROLES:
        raise ForbiddenError("이 프로젝트를 수정할 권한이 없습니다.")


def _validate_timezone(name: str) -> None:
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        raise ValidationFailed(
            "알 수 없는 시간대입니다.",
            [ErrorDetail(message="IANA 시간대 이름이어야 합니다(예: Asia/Seoul).",
                         field_path="/timezone")],
        ) from None


def create_project(session: Session, principal: Principal, body: ProjectCreate,
                   request_id: str | None) -> ProjectOut:
    role = access_repo.find_org_role(session, principal.user_id, body.organization_id)
    if role is None:
        raise NotFoundError("조직을 찾을 수 없습니다.")
    if role != "admin":
        raise ForbiddenError("프로젝트를 만들 권한이 없습니다(조직 admin 필요).")
    _validate_timezone(body.timezone)

    project = Project(
        id=new_id(), organization_id=body.organization_id, code=body.code, name=body.name,
        timezone=body.timezone, description=body.description, created_by=principal.user_id,
    )
    conflicts = {"uq_project_org_code": lambda: ProjectCodeConflict(
        "같은 조직에 동일한 프로젝트 코드가 이미 있습니다.",
        [ErrorDetail(message="이미 사용 중인 코드입니다.", field_path="/code")])}
    with transaction(session, conflicts):
        session.add(project)
        session.flush()
        # 생성자는 project admin으로 자동 등록한다(조직 멤버 복합 FK 충족).
        session.add(ProjectMember(
            id=new_id(), organization_id=body.organization_id, project_id=project.id,
            user_id=principal.user_id, role="admin", created_by=principal.user_id))
        audit(session, organization_id=body.organization_id, project_id=project.id,
              actor_id=principal.user_id, action="project.create", entity_type="project",
              entity_id=project.id, before=None,
              after={"code": body.code, "name": body.name, "timezone": body.timezone},
              request_id=request_id)
    return ProjectOut.model_validate(project)


def get_project(session: Session, principal: Principal, project_id) -> ProjectOut:
    return ProjectOut.model_validate(require_project(session, principal, project_id).project)


def patch_project(session: Session, principal: Principal, project_id, version: int,
                  body: ProjectPatch, request_id: str | None) -> ProjectOut:
    access = require_project(session, principal, project_id)
    if access.role != "admin":
        raise ForbiddenError("프로젝트 설정은 project admin만 변경할 수 있습니다.")
    if "timezone" in body.model_fields_set:
        _validate_timezone(body.timezone)
    # 동시 수정 방지: 행을 잠근 뒤 버전을 비교한다.
    project = session.get(Project, project_id, with_for_update=True, populate_existing=True)
    if project.row_version != version:
        raise EditConflictError(
            "다른 곳에서 먼저 수정되었습니다.",
            [ErrorDetail(message=f"현재 버전은 {project.row_version}입니다.",
                         field_path="/row_version")])
    before, after = {}, {}
    with transaction(session, {}):
        for name in body.model_fields_set:
            before[name] = getattr(project, name)
            after[name] = getattr(body, name)
            setattr(project, name, after[name])
        project.row_version = project.row_version + 1
        project.updated_at = func.now()
        project.updated_by = principal.user_id
        audit(session, organization_id=project.organization_id, project_id=project.id,
              actor_id=principal.user_id, action="project.update", entity_type="project",
              entity_id=project.id, before=before, after=after, request_id=request_id)
    session.refresh(project)
    return ProjectOut.model_validate(project)


def list_projects(session: Session, principal: Principal, *, q: str | None, limit: int | None,
                  cursor: str | None) -> tuple[list[ProjectOut], Page]:
    limit = limit or DEFAULT_LIMIT
    tag = make_tag("projects", ("code", False), {"q": q})
    values = decode_cursor(cursor, tag, 2) if cursor else None
    rows = project_repo.list_member_projects(
        session, principal.user_id, q=q, limit=limit, cursor_values=values)
    page_rows = rows[:limit]
    next_cursor = None
    if len(rows) > limit:
        last = page_rows[-1]
        next_cursor = encode_cursor(tag, [last.code, str(last.id)])
    return ([ProjectOut.model_validate(p) for p in page_rows],
            Page(limit=limit, next_cursor=next_cursor))
