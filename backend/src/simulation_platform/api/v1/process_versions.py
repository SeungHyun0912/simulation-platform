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
    AssetUseOut,
    EditorStateIn,
    EditorStateOut,
    GraphIn,
    GraphOut,
    ProcessGraphItem,
    ProcessVersionCreate,
    ProcessVersionListItem,
    ProcessVersionOut,
    ProcessVersionPatch,
    StepOut,
    StepPatch,
    ValidationOut,
    VersionDiffOut,
)
from simulation_platform.schemas.revision import RejectBody
from simulation_platform.services import process as service
from simulation_platform.services import process_batch

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
    body: ProcessVersionCreate | None = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """새 초안. 본문의 `base_version_id`(같은 제품의 모든 상태) 또는 승인본의 그래프를 새 id로 복사하고,
    둘 다 없으면 빈 그래프·미정 단위로 시작한다. 본문은 선택이다(없으면 승인본 복사).

    제품당 열린 버전(draft/in_review)은 하나뿐이다(409 PROCESS_DRAFT_EXISTS).
    """
    version = service.create_version(session, principal, project_id, product_id, body,
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


@router.get("/process-versions/{version_id}/diff", response_model=Single[VersionDiffOut],
            responses=READ_ERRORS)
def diff_process_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    against: Annotated[uuid.UUID | None, Query(
        description="비교 기준 버전. 생략하면 이 버전의 base_version_id, 없으면 현재 승인본")
    ] = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """이 버전(after)을 기준 버전(before)과 비교한다. 노드·간선은 node_key·edge_key로 맞춘다(읽기 전용)."""
    return {"data": service.diff_version(session, principal, project_id, version_id, against)}


@router.get("/process-versions/{version_id}/editor-state", response_model=Single[EditorStateOut],
            responses=READ_ERRORS)
def get_editor_state(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """화면 좌표(버전 공용). 저장 전에는 빈 좌표와 row_version 0을 돌려준다. ETag는 이 상태의 row_version이다."""
    state = service.get_editor_state(session, principal, project_id, version_id)
    set_etag(response, state.row_version)
    return {"data": state}


@router.put("/process-versions/{version_id}/editor-state", response_model=Single[EditorStateOut],
            responses=CONFLICT_ERRORS)
def put_editor_state(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    body: EditorStateIn,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """화면 좌표를 통째로 교체한다. 버전 상태와 무관하게 저장되며(승인본 포함) 공정 버전의 ETag·승인에
    영향이 없다. If-Match는 이 상태의 row_version(저장 전 0)이다."""
    state = service.put_editor_state(session, principal, project_id, version_id, expected, body)
    set_etag(response, state.row_version)
    return {"data": state}


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


@router.get("/process-graphs", response_model=ListOut[ProcessGraphItem], responses=READ_ERRORS)
def list_process_graphs(
    project_id: uuid.UUID,
    basis: Annotated[Literal["approved", "latest"], Query(description="approved: 현재 승인본(기본), latest: 가장 최근 버전")] = "approved",
    product_id: Annotated[list[uuid.UUID] | None, Query(description="이 제품들만(반복해서 보낸다)")] = None,
    version_id: Annotated[list[uuid.UUID] | None, Query(description="이 공정 버전들(최대 50개, 주면 basis·product_id는 무시)")] = None,
    mode: Annotated[Literal["summary", "full"], Query(description="summary: 노드·간선 요약(기본), full: 그래프 전체")] = "summary",
    limit: Annotated[int, Query(ge=1, le=50, description="한 번에 제품 수(최대 50)")] = 20,
    cursor: CursorQuery = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """여러 제품의 공정 그래프를 한 번에(제품 코드 순). 기준에 맞는 버전이 없는 제품은 `version: null`로 나온다.
    항목마다 ETag가 있어 바로 편집 요청(If-Match)에 쓸 수 있다."""
    items, page = process_batch.batch_graphs(session, principal, project_id, basis=basis, product_ids=product_id,
                                             version_ids=version_id, mode=mode, limit=limit, cursor=cursor)
    return {"data": items, "page": page}


@router.get("/assets/{asset_id}/uses", response_model=ListOut[AssetUseOut], responses=READ_ERRORS)
def list_asset_uses(
    project_id: uuid.UUID,
    asset_id: uuid.UUID,
    basis: Annotated[Literal["approved", "latest"], Query(description="제품마다 볼 공정 버전 기준")] = "approved",
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """그 자산을 쓰는 제품·공정 버전·노드: 공간 노드의 저장 공간(`space`)이거나 단계의 후보 설비(`equipment_candidate`)."""
    items = process_batch.asset_uses(session, principal, project_id, asset_id, basis)
    return {"data": items, "page": {"limit": len(items), "next_cursor": None}}
