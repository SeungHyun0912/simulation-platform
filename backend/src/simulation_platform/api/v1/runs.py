import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from simulation_platform.api.deps import (
    CursorQuery,
    LimitQuery,
    request_id_of,
    require_idempotency_key,
)
from simulation_platform.api.v1.common import ERR, READ_ERRORS, WRITE_ERRORS
from simulation_platform.auth.principal import Principal, get_principal
from simulation_platform.db import get_session
from simulation_platform.schemas.common import ListOut, Single
from simulation_platform.schemas.run import RunCreate, RunInputOut, RunListItem, RunOut, RunStatus
from simulation_platform.services import runs as service

router = APIRouter(prefix="/projects/{project_id}", tags=["runs"])

RUN_ERRORS = {**WRITE_ERRORS, 409: ERR, 428: ERR}


@router.post("/runs", status_code=202, response_model=Single[RunOut], responses=RUN_ERRORS)
def create_run(
    project_id: uuid.UUID,
    body: RunCreate,
    request: Request,
    response: Response,
    key: str = Depends(require_idempotency_key),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """실행을 요청한다(202). 승인된 시나리오 버전만, 사전검증을 통과해야 한다(422 `RUN_NOT_RUNNABLE`).

    요청하는 순간 입력 스냅샷·run·job이 한 트랜잭션으로 만들어지고 worker가 가져가 실행한다. `Idempotency-Key`가 필수이며
    같은 키·같은 본문이면 기존 run을 돌려주고(200), 같은 키·다른 본문이면 409 `IDEMPOTENCY_CONFLICT`다."""
    run, created = service.create_run(session, principal, project_id, body, key, request_id_of(request))
    response.status_code = 202 if created else 200
    response.headers["Location"] = f"/api/v1/projects/{project_id}/runs/{run.id}"
    return {"data": run}


@router.get("/runs", response_model=ListOut[RunListItem], responses=READ_ERRORS)
def list_runs(
    project_id: uuid.UUID,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    status: Annotated[RunStatus | None, Query(description="상태 필터")] = None,
    scenario_version_id: Annotated[uuid.UUID | None, Query(description="시나리오 버전 필터")] = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """실행 목록(최근 요청부터)."""
    items, page = service.list_runs(session, principal, project_id, limit=limit, cursor=cursor, status=status,
                                    scenario_version_id=scenario_version_id)
    return {"data": items, "page": page}


@router.get("/runs/{run_id}", response_model=Single[RunOut], responses=READ_ERRORS)
def get_run(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """상태·시도·종료 사유와, 끝났다면 공식 결과 요약. 상태는 엔진 종료 상태 그대로다(`completed`와 `stalled`를 구분)."""
    return {"data": service.get_run(session, principal, project_id, run_id)}


@router.get("/runs/{run_id}/input", response_model=Single[RunInputOut], responses=READ_ERRORS)
def get_run_input(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """실행을 요청한 당시의 입력 스냅샷(불변)과 해시. 과거 실행을 현재 설정이 아니라 이 입력으로 설명해야 한다."""
    return {"data": service.get_input(session, principal, project_id, run_id)}


@router.post("/runs/{run_id}/cancel", status_code=202, response_model=Single[RunOut],
             responses={**WRITE_ERRORS, 409: ERR})
def cancel_run(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """취소를 요청한다(202). 시작 전이면 바로 `cancelled`가 되고, 실행 중이면 `cancel_requested_at`만 기록되며 worker가
    확인해 멈춘 뒤 `cancelled`가 된다(요청과 실제 취소를 구분). 이미 끝났으면 409 `JOB_CANCEL_TOO_LATE`."""
    return {"data": service.cancel_run(session, principal, project_id, run_id, request_id_of(request))}
