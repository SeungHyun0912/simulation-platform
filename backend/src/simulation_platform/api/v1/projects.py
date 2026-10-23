import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from simulation_platform.api.deps import (
    CursorQuery,
    LimitQuery,
    request_id_of,
    require_if_match,
    set_etag,
)
from simulation_platform.api.v1.common import ERR, PATCH_ERRORS, READ_ERRORS, WRITE_ERRORS
from simulation_platform.auth.principal import Principal, get_principal
from simulation_platform.db import get_session
from simulation_platform.schemas.common import ListOut, Single
from simulation_platform.schemas.project import ProjectCreate, ProjectOut, ProjectPatch
from simulation_platform.services import projects as service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ListOut[ProjectOut], responses=READ_ERRORS)
def list_projects(
    q: Annotated[str | None, Query(description="code/name 부분 일치")] = None,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """호출자가 멤버인 프로젝트 목록(code 오름차순)."""
    items, page = service.list_projects(session, principal, q=q, limit=limit, cursor=cursor)
    return {"data": items, "page": page}


@router.post("", status_code=201, response_model=Single[ProjectOut],
             responses={**WRITE_ERRORS, 409: ERR})
def create_project(
    body: ProjectCreate,
    request: Request,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """프로젝트 생성(조직 admin). 생성자는 project admin으로 등록된다."""
    project = service.create_project(session, principal, body, request_id_of(request))
    set_etag(response, project.row_version)
    response.headers["Location"] = f"/api/v1/projects/{project.id}"
    return {"data": project}


@router.get("/{project_id}", response_model=Single[ProjectOut], responses=READ_ERRORS)
def get_project(
    project_id: uuid.UUID,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    project = service.get_project(session, principal, project_id)
    set_etag(response, project.row_version)
    return {"data": project}


@router.patch("/{project_id}", response_model=Single[ProjectOut], responses=PATCH_ERRORS)
def patch_project(
    project_id: uuid.UUID,
    body: ProjectPatch,
    request: Request,
    response: Response,
    version: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """name/description/timezone 수정(project admin). If-Match 필수."""
    project = service.patch_project(
        session, principal, project_id, version, body, request_id_of(request))
    set_etag(response, project.row_version)
    return {"data": project}
