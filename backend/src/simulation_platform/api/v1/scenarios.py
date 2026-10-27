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
from simulation_platform.schemas.scenario import (
    PrecheckOut,
    ScenarioCreate,
    ScenarioOut,
    ScenarioPatch,
    ScenarioRefreshIn,
    ScenarioRefreshOut,
    ScenarioVersionCreate,
    ScenarioVersionListItem,
    ScenarioVersionOut,
    ScenarioVersionPatch,
)
from simulation_platform.services import scenarios as service

router = APIRouter(prefix="/projects/{project_id}", tags=["scenarios"])

CONFLICT_ERRORS = {**PATCH_ERRORS, 409: ERR}


@router.get("/scenarios", response_model=ListOut[ScenarioOut], responses=READ_ERRORS)
def list_scenarios(
    project_id: uuid.UUID,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """시나리오 목록(code 순). 각 시나리오의 가장 최근 버전 요약을 함께 준다."""
    items, page = service.list_scenarios(session, principal, project_id, limit=limit, cursor=cursor)
    return {"data": items, "page": page}


@router.post("/scenarios", status_code=201, response_model=Single[ScenarioOut],
             responses={**WRITE_ERRORS, 409: ERR})
def create_scenario(
    project_id: uuid.UUID,
    body: ScenarioCreate,
    request: Request,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """시나리오와 첫 초안(version 1, 비어 있음·종료 규칙 drain)을 함께 만든다. 코드 중복은 409 SCENARIO_CODE_CONFLICT."""
    scenario = service.create_scenario(session, principal, project_id, body, request_id_of(request))
    set_etag(response, scenario.row_version)
    response.headers["Location"] = f"/api/v1/projects/{project_id}/scenarios/{scenario.id}"
    return {"data": scenario}


@router.get("/scenarios/{scenario_id}", response_model=Single[ScenarioOut], responses=READ_ERRORS)
def get_scenario(
    project_id: uuid.UUID,
    scenario_id: uuid.UUID,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    scenario = service.get_scenario(session, principal, project_id, scenario_id)
    set_etag(response, scenario.row_version)
    return {"data": scenario}


@router.patch("/scenarios/{scenario_id}", response_model=Single[ScenarioOut], responses=PATCH_ERRORS)
def patch_scenario(
    project_id: uuid.UUID,
    scenario_id: uuid.UUID,
    body: ScenarioPatch,
    request: Request,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """이름·설명 수정. If-Match는 시나리오의 row_version이다(버전 내용과 무관)."""
    scenario = service.patch_scenario(session, principal, project_id, scenario_id, expected, body,
                                      request_id_of(request))
    set_etag(response, scenario.row_version)
    return {"data": scenario}


@router.get("/scenarios/{scenario_id}/versions", response_model=ListOut[ScenarioVersionListItem],
            responses=READ_ERRORS)
def list_scenario_versions(
    project_id: uuid.UUID,
    scenario_id: uuid.UUID,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """시나리오 버전 목록(최신 version_no부터)."""
    items, page = service.list_versions(session, principal, project_id, scenario_id, limit=limit,
                                        cursor=cursor)
    return {"data": items, "page": page}


@router.post("/scenarios/{scenario_id}/versions", status_code=201, response_model=Single[ScenarioVersionOut],
             responses={**WRITE_ERRORS, 409: ERR})
def create_scenario_version(
    project_id: uuid.UUID,
    scenario_id: uuid.UUID,
    request: Request,
    response: Response,
    body: ScenarioVersionCreate | None = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """새 초안. `from_version_id`(같은 시나리오의 모든 상태) 또는 가장 최근 승인 버전의 내용을 복사하고, 둘 다 없으면
    빈 초안이다. 시나리오당 초안은 하나뿐이다(409 SCENARIO_DRAFT_EXISTS)."""
    version = service.create_version(session, principal, project_id, scenario_id, body, request_id_of(request))
    set_etag(response, version.row_version)
    response.headers["Location"] = f"/api/v1/projects/{project_id}/scenario-versions/{version.id}"
    return {"data": version}


@router.get("/scenario-versions/{version_id}", response_model=Single[ScenarioVersionOut],
            responses=READ_ERRORS)
def get_scenario_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    response: Response,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    version = service.get_version(session, principal, project_id, version_id)
    set_etag(response, version.row_version)
    return {"data": version}


@router.patch("/scenario-versions/{version_id}", response_model=Single[ScenarioVersionOut],
              responses=CONFLICT_ERRORS)
def patch_scenario_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    body: ScenarioVersionPatch,
    request: Request,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """초안 수정(보낸 최상위 필드를 통째로 교체). 참조 오류는 422(SCN-REF-001~004)이고, 실행 가능 여부는 사전검증이
    따로 판정한다(미정이 있어도 초안은 저장된다). `products`만 보내면 고정하지 않은 자산을 현재 승인 버전으로 채운다."""
    version = service.patch_version(session, principal, project_id, version_id, expected, body,
                                    request_id_of(request))
    set_etag(response, version.row_version)
    return {"data": version}


@router.post("/scenario-versions/{version_id}/validate", response_model=Single[PrecheckOut],
             responses=READ_ERRORS)
def precheck_scenario_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """실행 사전검증(저장하지 않음). 시나리오 수준 검사(SCN-*)와, 제품마다 엔진 컴파일 결과(오류·사용한 가정·
    가정으로 면제한 항목)를 번역하지 않고 돌려준다. 오류가 있어도 검증이 정상 수행되면 200이다."""
    return {"data": service.precheck(session, principal, project_id, version_id)}


@router.post("/scenario-versions/{version_id}/approve", response_model=Single[ScenarioVersionOut],
             responses=CONFLICT_ERRORS)
def approve_scenario_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    request: Request,
    response: Response,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """draft → approved(project admin). 사전검증 오류가 있으면 422 SCENARIO_NOT_RUNNABLE. 승인 후 내용은 바꿀 수 없다."""
    version = service.approve_version(session, principal, project_id, version_id, expected,
                                      request_id_of(request))
    set_etag(response, version.row_version)
    return {"data": version}


@router.post("/scenario-versions/{version_id}/refresh", response_model=Single[ScenarioRefreshOut],
             responses=CONFLICT_ERRORS)
def refresh_scenario_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    request: Request,
    response: Response,
    body: ScenarioRefreshIn | None = None,
    expected: int = Depends(require_if_match),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """초안의 제품별 공정 버전을 그 제품의 **현재 승인본**으로 바꾸고 자산 고정을 맞춘다(도착·가정·순서는 그대로).
    본문은 선택: `product_ids`(일부 제품만), `assets`(latest 기본 | keep). 바뀐 내용은 `process_changes`·`asset_changes`로
    돌려준다. 승인본은 409 `VERSION_IMMUTABLE`(새 초안을 먼저 만든다)."""
    out = service.refresh_version(session, principal, project_id, version_id, expected, body, request_id_of(request))
    set_etag(response, out.version.row_version)
    return {"data": out}
