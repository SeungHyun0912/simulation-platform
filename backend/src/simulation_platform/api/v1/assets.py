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
from simulation_platform.schemas.asset import AssetCreate, AssetKind, AssetOut, AssetPatch, PortOut
from simulation_platform.schemas.common import ListOut, Single
from simulation_platform.services import assets as service

router = APIRouter(prefix="/projects/{project_id}/assets", tags=["assets"])


@router.get("", response_model=ListOut[AssetOut], responses=READ_ERRORS)
def list_assets(
    project_id: uuid.UUID,
    kind: AssetKind | None = None,
    q: Annotated[str | None, Query(description="code/name 부분 일치")] = None,
    include_archived: bool = False,
    sort: Annotated[str | None, Query(
        description="sort_order | code | name, 앞에 -를 붙이면 내림차순(기본 sort_order)")] = None,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    items, page = service.list_assets(
        session, principal, project_id, kind=kind, q=q, include_archived=include_archived,
        sort=sort, limit=limit, cursor=cursor)
    return {"data": items, "page": page}


@router.post("", status_code=201, response_model=Single[AssetOut],
             responses={**WRITE_ERRORS, 409: ERR})
def create_asset(
    project_id: uuid.UUID,
    body: AssetCreate,
    request: Request,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """자산 생성. kind별 상세와 포트(설비 IN/OUT, 공간 ACCESS-01)를 한 트랜잭션으로 만든다."""
    asset = service.create_asset(session, principal, project_id, body, request_id_of(request))
    set_etag(response, asset.row_version)
    response.headers["Location"] = f"/api/v1/projects/{project_id}/assets/{asset.id}"
    return {"data": asset}


@router.get("/{asset_id}", response_model=Single[AssetOut], responses=READ_ERRORS)
def get_asset(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    asset = service.get_asset(session, principal, project_id, asset_id)
    set_etag(response, asset.row_version)
    return {"data": asset}


@router.patch("/{asset_id}", response_model=Single[AssetOut],
              responses={**PATCH_ERRORS, 409: ERR})
def patch_asset(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    body: AssetPatch,
    request: Request,
    response: Response,
    version: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """표시 정보·상세 수정. kind와 포트는 변경할 수 없다. If-Match 필수."""
    asset = service.patch_asset(
        session, principal, project_id, asset_id, version, body, request_id_of(request))
    set_etag(response, asset.row_version)
    return {"data": asset}


@router.get("/{asset_id}/ports", response_model=Single[list[PortOut]], responses=READ_ERRORS)
def get_ports(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    return {"data": service.get_ports(session, principal, project_id, asset_id)}
