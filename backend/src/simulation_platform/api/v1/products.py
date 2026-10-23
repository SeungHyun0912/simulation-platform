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
from simulation_platform.schemas.catalog import ProductCreate, ProductOut, ProductPatch
from simulation_platform.schemas.common import ListOut, Single
from simulation_platform.services import catalog as service

router = APIRouter(prefix="/projects/{project_id}/products", tags=["products"])


@router.get("", response_model=ListOut[ProductOut], responses=READ_ERRORS)
def list_products(
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
        service.PRODUCT, session, principal, project_id, q=q, include_archived=include_archived,
        sort=sort, limit=limit, cursor=cursor)
    return {"data": items, "page": page}


@router.post("", status_code=201, response_model=Single[ProductOut],
             responses={**WRITE_ERRORS, 409: ERR})
def create_product(
    project_id: uuid.UUID,
    body: ProductCreate,
    request: Request,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """제품 생성(admin·editor). 제품은 버전이 없는 기준정보이며 공정 정의가 버전을 가진다."""
    product = service.create(
        service.PRODUCT, session, principal, project_id, body, request_id_of(request))
    set_etag(response, product.row_version)
    response.headers["Location"] = f"/api/v1/projects/{project_id}/products/{product.id}"
    return {"data": product}


@router.get("/{product_id}", response_model=Single[ProductOut], responses=READ_ERRORS)
def get_product(
    project_id: uuid.UUID,
    product_id: uuid.UUID,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    product = service.get(service.PRODUCT, session, principal, project_id, product_id)
    set_etag(response, product.row_version)
    return {"data": product}


@router.patch("/{product_id}", response_model=Single[ProductOut],
              responses={**PATCH_ERRORS, 409: ERR})
def patch_product(
    project_id: uuid.UUID,
    product_id: uuid.UUID,
    body: ProductPatch,
    request: Request,
    response: Response,
    version: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """code·name·specification·notes 수정. If-Match 필수. null은 specification·notes를 지운다."""
    product = service.patch(service.PRODUCT, session, principal, project_id, product_id, version,
                            body, request_id_of(request))
    set_etag(response, product.row_version)
    return {"data": product}
