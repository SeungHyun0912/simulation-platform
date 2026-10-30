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
from simulation_platform.schemas.layout import (
    LayoutContentIn,
    LayoutValidationOut,
    LayoutVersionCreate,
    LayoutVersionListItem,
    LayoutVersionOut,
    LayoutVersionPatch,
    PathOut,
    PathsIn,
    ProcessLinksOut,
)
from simulation_platform.services import layouts as service

router = APIRouter(prefix="/projects/{project_id}", tags=["layouts"])

CONFLICT_ERRORS = {**PATCH_ERRORS, 409: ERR}


@router.get("/layout-versions", response_model=ListOut[LayoutVersionListItem], responses=READ_ERRORS)
def list_layout_versions(
    project_id: uuid.UUID,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """배치판 목록(최신 version_no부터)."""
    items, page = service.list_versions(session, principal, project_id, limit=limit, cursor=cursor)
    return {"data": items, "page": page}


@router.post("/layout-versions", status_code=201, response_model=Single[LayoutVersionOut],
             responses={**WRITE_ERRORS, 409: ERR})
def create_layout_version(
    project_id: uuid.UUID,
    request: Request,
    response: Response,
    body: LayoutVersionCreate | None = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """새 초안. `from_version_id`(모든 상태) 또는 가장 최근 승인본의 내용(점·배치·포트 매핑·경로)을 복사하고, 둘 다 없으면
    빈 초안이다. 프로젝트당 초안은 하나뿐이다(409 LAYOUT_DRAFT_EXISTS)."""
    version = service.create_version(session, principal, project_id, body, request_id_of(request))
    set_etag(response, version.row_version)
    response.headers["Location"] = f"/api/v1/projects/{project_id}/layout-versions/{version.id}"
    return {"data": version}


@router.get("/layout-versions/{version_id}", response_model=Single[LayoutVersionOut], responses=READ_ERRORS)
def get_layout_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """배치판 전체: 좌표계, 점, 설비·공간 배치, 포트 → 점 매핑, 경로(점 key 순서와 계산한 길이)."""
    version = service.get_version(session, principal, project_id, version_id)
    set_etag(response, version.row_version)
    return {"data": version}


@router.patch("/layout-versions/{version_id}", response_model=Single[LayoutVersionOut], responses=CONFLICT_ERRORS)
def patch_layout_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    body: LayoutVersionPatch,
    request: Request,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """초안의 이름·메모·도면 크기·확장 속성 수정(보낸 필드만). 승인본은 409 VERSION_IMMUTABLE."""
    version = service.patch_version(session, principal, project_id, version_id, expected, body, request_id_of(request))
    set_etag(response, version.row_version)
    return {"data": version}


@router.put("/layout-versions/{version_id}/content", response_model=Single[LayoutVersionOut],
            responses=CONFLICT_ERRORS)
def put_layout_content(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    body: LayoutContentIn,
    request: Request,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """초안의 점·배치·포트 매핑·경로를 통째로 교체한다. 좌표·크기는 소수 첫째 자리로 반올림해 저장한다. 구조 오류(중복 key,
    없는 점·자산·포트, 점 2개 미만 경로 등)는 422이고, 승인 가능 여부는 `validate`가 따로 판정한다."""
    version = service.put_content(session, principal, project_id, version_id, expected, body, request_id_of(request))
    set_etag(response, version.row_version)
    return {"data": version}


@router.post("/layout-versions/{version_id}/validate", response_model=Single[LayoutValidationOut],
             responses=READ_ERRORS)
def validate_layout_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """승인 전 검증(저장하지 않음). 경로의 첫·끝 점이 출발·도착 포트의 점인지(오류), 배치되지 않은 자산의 포트·도면 밖·
    크기 모름(경고). 오류가 있어도 검증이 정상 수행되면 200이다."""
    return {"data": service.validate(session, principal, project_id, version_id)}


@router.post("/layout-versions/{version_id}/approve", response_model=Single[LayoutVersionOut],
             responses=CONFLICT_ERRORS)
def approve_layout_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    request: Request,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """draft → approved(project admin). 검증 오류가 있으면 422 LAYOUT_VALIDATION_FAILED. 승인 후 내용은 바꿀 수 없다."""
    version = service.approve_version(session, principal, project_id, version_id, expected, request_id_of(request))
    set_etag(response, version.row_version)
    return {"data": version}


@router.post("/layout-versions/{version_id}/paths", response_model=Single[list[PathOut]], responses=READ_ERRORS)
def layout_paths(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    body: PathsIn,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """포트 → 포트 경로(저장하지 않음, 최대 500쌍). 같은 출발·도착 포트로 저장된 고정 경로가 있으면 그것을(`source=fixed`),
    없으면 통로·고정 경로의 선분(양방향)으로 만든 길 그물의 최단 경로를 계산한다(`source=computed`). 점·통로를 고치면 다음
    조회부터 자동으로 바뀐다. 갈 수 없으면 `reachable=false`와 이유."""
    return {"data": service.paths(session, principal, project_id, version_id, body)}


@router.get("/layout-versions/{version_id}/process-links", response_model=Single[list[ProcessLinksOut]],
            responses=READ_ERRORS)
def layout_process_links(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    process_version_id: Annotated[list[uuid.UUID] | None, Query(max_length=50, description="공정 버전(반복). 생략하면 제품마다 현재 승인본")] = None,
    scenario_version_id: Annotated[uuid.UUID | None, Query(description="이 시나리오의 이동 설정(속도·상하차)을 쓴다. 생략하면 기본값")] = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """공정 ↔ 배치판 연결(저장 안 함). 공정의 이동 구간마다(공간 ↔ 설비 사람 이동, 운반 단계) 출발·도착 위치의 포트 쌍과
    배치판 경로(`/paths`와 같은 계산)·길이·이동 시간(길이 ÷ 속도, 운반은 + 상하차)을 준다. 속도 기본값 4 km/h(사람·운반 자원),
    상하차 1분. 공정·배치판·이동 설정을 고치면 다음 조회부터 자동으로 바뀐다."""
    return {"data": service.process_links(session, principal, project_id, version_id,
                                          process_version_ids=process_version_id, scenario_version_id=scenario_version_id)}
