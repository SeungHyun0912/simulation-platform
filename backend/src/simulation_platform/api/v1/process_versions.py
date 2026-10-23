import uuid
from typing import Annotated, Literal

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
from simulation_platform.schemas.process import (
    GraphIn,
    GraphOut,
    ProcessVersionListItem,
    ProcessVersionOut,
    ProcessVersionPatch,
    StepOut,
    StepPatch,
    ValidationOut,
)
from simulation_platform.schemas.revision import RejectBody
from simulation_platform.services import process as service

router = APIRouter(prefix="/projects/{project_id}", tags=["process-versions"])

CONFLICT_ERRORS = {**PATCH_ERRORS, 409: ERR}


@router.get("/products/{product_id}/process-versions", response_model=ListOut[ProcessVersionListItem],
            responses=READ_ERRORS)
def list_process_versions(
    project_id: uuid.UUID,
    product_id: uuid.UUID,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """제품의 공정 버전 목록(최신 version_no부터)."""
    items, page = service.list_versions(
        session, principal, project_id, product_id, limit=limit, cursor=cursor)
    return {"data": items, "page": page}


@router.post("/products/{product_id}/process-versions", status_code=201,
             response_model=Single[ProcessVersionOut], responses={**WRITE_ERRORS, 409: ERR})
def create_process_version(
    project_id: uuid.UUID,
    product_id: uuid.UUID,
    request: Request,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """새 초안. 승인본이 있으면 그래프까지 새 id로 복사하고, 없으면 빈 그래프·미정 단위로 시작한다.

    제품당 열린 버전(draft/in_review)은 하나뿐이다(409 PROCESS_DRAFT_EXISTS).
    """
    version = service.create_version(session, principal, project_id, product_id,
                                     request_id_of(request))
    set_etag(response, version.row_version)
    response.headers["Location"] = f"/api/v1/projects/{project_id}/process-versions/{version.id}"
    return {"data": version}


@router.get("/process-versions/{version_id}", response_model=Single[ProcessVersionOut],
            responses=READ_ERRORS)
def get_process_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    version = service.get_version(session, principal, project_id, version_id)
    set_etag(response, version.row_version)
    return {"data": version}


@router.patch("/process-versions/{version_id}", response_model=Single[ProcessVersionOut],
              responses=CONFLICT_ERRORS)
def patch_process_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    body: ProcessVersionPatch,
    request: Request,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """원자재 기본 단위·완제품 단위·메모 수정(초안만, 단위는 보낸 필드만 교체). If-Match 필수."""
    version = service.patch_version(session, principal, project_id, version_id, expected, body,
                                    request_id_of(request))
    set_etag(response, version.row_version)
    return {"data": version}


@router.get("/process-versions/{version_id}/graph", response_model=Single[GraphOut],
            responses=READ_ERRORS)
def get_graph(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    graph = service.get_graph(session, principal, project_id, version_id)
    set_etag(response, graph.row_version)
    return {"data": graph}


@router.put("/process-versions/{version_id}/graph", response_model=Single[GraphOut],
            responses=CONFLICT_ERRORS)
def put_graph(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    body: GraphIn,
    request: Request,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """그래프 전체를 한 트랜잭션으로 교체한다(초안만). 보내지 않은 노드·간선은 삭제된다.

    노드·간선 id는 클라이언트가 만든 UUID다. 검증 오류가 하나라도 있으면 아무것도 저장하지 않는다.
    """
    graph = service.put_graph(session, principal, project_id, version_id, expected, body,
                              request_id_of(request))
    set_etag(response, graph.row_version)
    return {"data": graph}


@router.patch("/process-versions/{version_id}/steps/{step_id}", response_model=Single[StepOut],
              responses=CONFLICT_ERRORS)
def patch_step(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    step_id: uuid.UUID,
    body: StepPatch,
    request: Request,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """단계 수정(초안만). ETag는 단계가 아니라 **공정 버전**의 row_version이며 보낸 최상위 필드를 통째로 교체한다."""
    step = service.patch_step(session, principal, project_id, version_id, step_id, expected, body,
                              request_id_of(request))
    set_etag(response, step.row_version)
    return {"data": step}


@router.post("/process-versions/{version_id}/validate", response_model=Single[ValidationOut],
             responses=READ_ERRORS)
def validate_process_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    scope: Annotated[Literal["knowledge", "run_template"], Query(
        description="knowledge: 승인 가능 여부(구조 오류만 오류), run_template: 실행 가능 여부(필수 미정도 오류)")
    ] = "knowledge",
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """검증 항목 목록. 오류가 있어도 검증이 정상 수행되면 200이다."""
    return {"data": service.validate(session, principal, project_id, version_id, scope)}


@router.post("/process-versions/{version_id}/submit", response_model=Single[ProcessVersionOut],
             responses={**CONFLICT_ERRORS})
def submit_process_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    request: Request,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """draft → in_review. 구조 오류가 있으면 422 PROCESS_VALIDATION_FAILED. 이후 내용은 수정할 수 없다."""
    version = service.submit_version(session, principal, project_id, version_id, expected,
                                     request_id_of(request))
    set_etag(response, version.row_version)
    return {"data": version}


@router.post("/process-versions/{version_id}/reject", response_model=Single[ProcessVersionOut],
             responses=CONFLICT_ERRORS)
def reject_process_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    body: RejectBody,
    request: Request,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """in_review → draft (project admin, 사유 필수)."""
    version = service.reject_version(session, principal, project_id, version_id, expected,
                                     body.reason, request_id_of(request))
    set_etag(response, version.row_version)
    return {"data": version}


@router.post("/process-versions/{version_id}/approve", response_model=Single[ProcessVersionOut],
             responses=CONFLICT_ERRORS)
def approve_process_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    request: Request,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """in_review → approved (project admin). 이전 승인본은 superseded가 된다. 미정은 경고일 뿐 승인을 막지 않는다."""
    version = service.approve_version(session, principal, project_id, version_id, expected,
                                      request_id_of(request))
    set_etag(response, version.row_version)
    return {"data": version}
