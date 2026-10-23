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
from simulation_platform.schemas.catalog import MaterialCreate, MaterialOut, MaterialPatch
from simulation_platform.schemas.common import ListOut, Single
from simulation_platform.services import catalog as service

router = APIRouter(prefix="/projects/{project_id}/materials", tags=["materials"])


@router.get("", response_model=ListOut[MaterialOut], responses=READ_ERRORS)
def list_materials(
    project_id: uuid.UUID,
    q: Annotated[str | None, Query(description="code/name 부분 일치")] = None,
    include_archived: bool = False,
    sort: Annotated[str | None, Query(
        description="code | name, 앞에 -를 붙이면 내림차순(기본 code)")] = None,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    items, page = service.list_page(
        service.MATERIAL, session, principal, project_id, q=q, include_archived=include_archived,
        sort=sort, limit=limit, cursor=cursor)
    return {"data": items, "page": page}


@router.post("", status_code=201, response_model=Single[MaterialOut],
             responses={**WRITE_ERRORS, 409: ERR})
def create_material(
    project_id: uuid.UUID,
    body: MaterialCreate,
    request: Request,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """재료 정의 생성(admin·editor). default_spec의 모든 필드는 기본이 unknown(0이 아님)이다."""
    material = service.create(
        service.MATERIAL, session, principal, project_id, body, request_id_of(request))
    set_etag(response, material.row_version)
    response.headers["Location"] = f"/api/v1/projects/{project_id}/materials/{material.id}"
    return {"data": material}


@router.get("/{material_id}", response_model=Single[MaterialOut], responses=READ_ERRORS)
def get_material(
    project_id: uuid.UUID,
    material_id: uuid.UUID,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    material = service.get(service.MATERIAL, session, principal, project_id, material_id)
    set_etag(response, material.row_version)
    return {"data": material}


@router.patch("/{material_id}", response_model=Single[MaterialOut],
              responses={**PATCH_ERRORS, 409: ERR})
def patch_material(
    project_id: uuid.UUID,
    material_id: uuid.UUID,
    body: MaterialPatch,
    request: Request,
    response: Response,
    version: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """code·name·form·default_spec·notes 수정. default_spec은 보낸 필드만 교체한다. If-Match 필수."""
    material = service.patch(service.MATERIAL, session, principal, project_id, material_id,
                             version, body, request_id_of(request))
    set_etag(response, material.row_version)
    return {"data": material}
