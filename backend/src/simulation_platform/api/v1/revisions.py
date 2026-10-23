import uuid

from fastapi import APIRouter, Depends, Request, Response
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
from simulation_platform.schemas.revision import AssetRevisionOut, RejectBody, RevisionPatch
from simulation_platform.services import revisions as service

router = APIRouter(prefix="/projects/{project_id}", tags=["asset-revisions"])

CONFLICT_ERRORS = {**PATCH_ERRORS, 409: ERR}


@router.get("/assets/{asset_id}/revisions", response_model=ListOut[AssetRevisionOut],
            responses=READ_ERRORS)
def list_revisions(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """자산의 버전 목록(최신 revision_no부터)."""
    items, page = service.list_revisions(
        session, principal, project_id, asset_id, limit=limit, cursor=cursor)
    return {"data": items, "page": page}


@router.post("/assets/{asset_id}/revisions", status_code=201,
             response_model=Single[AssetRevisionOut], responses={**WRITE_ERRORS, 409: ERR})
def create_revision(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    request: Request,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """새 초안 생성. 승인본이 있으면 그 설정을 복사하고, 없으면 용량을 모두 '미정'으로 시작한다.

    자산당 열린 버전(draft/in_review)은 하나뿐이다(409 REVISION_DRAFT_EXISTS).
    """
    revision = service.create_revision(
        session, principal, project_id, asset_id, request_id_of(request))
    set_etag(response, revision.row_version)
    response.headers["Location"] = f"/api/v1/projects/{project_id}/asset-revisions/{revision.id}"
    return {"data": revision}


@router.get("/asset-revisions/{revision_id}", response_model=Single[AssetRevisionOut],
            responses=READ_ERRORS)
def get_revision(
    project_id: uuid.UUID,
    revision_id: uuid.UUID,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    revision = service.get_revision(session, principal, project_id, revision_id)
    set_etag(response, revision.row_version)
    return {"data": revision}


@router.patch("/asset-revisions/{revision_id}", response_model=Single[AssetRevisionOut],
              responses=CONFLICT_ERRORS)
def patch_revision(
    project_id: uuid.UUID,
    revision_id: uuid.UUID,
    body: RevisionPatch,
    request: Request,
    response: Response,
    version: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """초안 수정. 보낸 필드만 바뀌며 ports는 port_id별로 병합한다. 초안이 아니면 409 VERSION_IMMUTABLE."""
    revision = service.patch_revision(
        session, principal, project_id, revision_id, version, body, request_id_of(request))
    set_etag(response, revision.row_version)
    return {"data": revision}


@router.post("/asset-revisions/{revision_id}/submit", response_model=Single[AssetRevisionOut],
             responses=CONFLICT_ERRORS)
def submit_revision(
    project_id: uuid.UUID,
    revision_id: uuid.UUID,
    request: Request,
    response: Response,
    version: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """draft → in_review (검토 요청). 이후 내용은 수정할 수 없다."""
    revision = service.submit_revision(
        session, principal, project_id, revision_id, version, request_id_of(request))
    set_etag(response, revision.row_version)
    return {"data": revision}


@router.post("/asset-revisions/{revision_id}/reject", response_model=Single[AssetRevisionOut],
             responses=CONFLICT_ERRORS)
def reject_revision(
    project_id: uuid.UUID,
    revision_id: uuid.UUID,
    body: RejectBody,
    request: Request,
    response: Response,
    version: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """in_review → draft (project admin, 사유 필수)."""
    revision = service.reject_revision(
        session, principal, project_id, revision_id, version, body, request_id_of(request))
    set_etag(response, revision.row_version)
    return {"data": revision}


@router.post("/asset-revisions/{revision_id}/approve", response_model=Single[AssetRevisionOut],
             responses=CONFLICT_ERRORS)
def approve_revision(
    project_id: uuid.UUID,
    revision_id: uuid.UUID,
    request: Request,
    response: Response,
    version: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """in_review → approved (project admin). 이전 승인본은 superseded가 된다.

    미정 값은 경고(issues)일 뿐 승인을 막지 않는다. 실행 가능 여부는 시나리오에서 검증한다.
    """
    revision = service.approve_revision(
        session, principal, project_id, revision_id, version, request_id_of(request))
    set_etag(response, revision.row_version)
    return {"data": revision}
