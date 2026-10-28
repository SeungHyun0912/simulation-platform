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
from simulation_platform.schemas.run import (
    AssetStateSegmentOut,
    AssetTimelineOut,
    BottleneckSummaryOut,
    EventOut,
    LineageOut,
    MetricComparisonOut,
    MetricOut,
    MetricWindowKind,
    RunComparisonOut,
    RunCreate,
    RunInputOut,
    RunListItem,
    RunOut,
    RunReportOut,
    RunStatus,
)
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


@router.get("/runs/{run_id}/events", response_model=ListOut[EventOut], responses={**READ_ERRORS, 409: ERR})
def list_run_events(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    event_type: Annotated[str | None, Query(max_length=64, description="이벤트 종류(예: `STATE_SNAPSHOT`)")] = None,
    step_key: Annotated[str | None, Query(max_length=64)] = None,
    asset_key: Annotated[str | None, Query(max_length=64)] = None,
    item_key: Annotated[str | None, Query(max_length=64)] = None,
    from_min: Annotated[str | None, Query(description="가상 시간(분) 이상, decimal 문자열")] = None,
    to_min: Annotated[str | None, Query(description="가상 시간(분) 미만, decimal 문자열")] = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """공식 결과(선택된 시도)의 이벤트를 `event_seq` 순서로 돌려준다(cursor). 공식 결과가 아직 없으면 409
    `RUN_RESULT_NOT_AVAILABLE`. 하루·주·월 경계의 상태 요약은 `event_type=STATE_SNAPSHOT`으로 모아 본다."""
    items, page = service.list_events(
        session, principal, project_id, run_id, limit=limit, cursor=cursor, event_type=event_type,
        step_key=step_key, asset_key=asset_key, item_key=item_key, from_min=from_min, to_min=to_min)
    return {"data": items, "page": page}


@router.get("/runs/{run_id}/items/{item_key}/lineage", response_model=Single[LineageOut],
            responses={**READ_ERRORS, 409: ERR})
def get_item_lineage(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    item_key: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """작업물의 조상(어디서 왔나)과 후손(무엇이 되었나), 그 작업물을 만들거나 바꾼 작업과 길이 보존 값(잔량·이월·균형)."""
    return {"data": service.get_lineage(session, principal, project_id, run_id, item_key)}


@router.get("/runs/{run_id}/metrics", response_model=ListOut[MetricOut], responses={**READ_ERRORS, 409: ERR})
def list_run_metrics(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    metric_key: Annotated[str | None, Query(max_length=64, description="지표 key(`GET /metric-definitions` 참조)")] = None,
    window: Annotated[MetricWindowKind, Query(description="구간 종류: run(전체, 기본)·day·week·month")] = "run",
    process_version_id: Annotated[str | None, Query(max_length=64, description="공정 버전 차원 필터")] = None,
    asset_key: Annotated[str | None, Query(max_length=64, description="설비 차원 필터")] = None,
    node_key: Annotated[str | None, Query(max_length=64, description="대기 공간 차원 필터")] = None,
    step_key: Annotated[str | None, Query(max_length=64, description="단계 차원 필터(공정 버전 필터와 함께 쓰면 한 단계)")] = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """공식 결과(선택된 시도)의 지표를 구간별로 돌려준다. 값은 이벤트로만 계산했고 분모가 0이거나 해당 없으면 null이다.
    공식 결과가 아직 없으면 409 `RUN_RESULT_NOT_AVAILABLE`. 차원 필터는 함께 쓸 수 있다(모두 만족하는 행만)."""
    items, page = service.list_metrics(
        session, principal, project_id, run_id, limit=limit, cursor=cursor, metric_key=metric_key, window=window,
        process_version_id=process_version_id, asset_key=asset_key, node_key=node_key, step_key=step_key)
    return {"data": items, "page": page}


@router.get("/runs/{run_id}/bottlenecks", response_model=Single[BottleneckSummaryOut],
            responses={**READ_ERRORS, 409: ERR})
def get_run_bottlenecks(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    limit: Annotated[int, Query(ge=1, le=100, description="돌려줄 병목 후보 수(순위순)")] = 20,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """병목 요약: 다음 저장 공간 부족·다음 설비의 가동·대기 자재 적체로 **멈춰 있는 곳**을 종류·위치·근거와 함께 순위로
    돌려준다. 후보마다 막힘을 하류로 따라가 닿은 근본 원인(`root_cause`·`chain`)과 근본 원인별 묶음(`root_causes`)을 준다.
    공식 결과(전체 구간 지표)만 쓰며 없으면 409 `RUN_RESULT_NOT_AVAILABLE`. 한계(`limitations`)를 함께 보여야 한다."""
    return {"data": service.get_bottlenecks(session, principal, project_id, run_id, limit)}


@router.get("/runs/{run_id}/report", response_model=Single[RunReportOut], responses={**READ_ERRORS, 409: ERR})
def get_run_report(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """결과 리포트 묶음: 실행·시나리오·가정, 제품별 핵심 지표와 입력 부족, 병목 상위 10개와 근본 원인, 가동률 상위 설비,
    적체 상위 대기 공간, 규칙으로 만든 한국어 요약 문장, 한계. 저장된 값만 읽어 같은 run이면 같은 리포트다(LLM 없음).
    공식 결과가 없으면 409 `RUN_RESULT_NOT_AVAILABLE`."""
    return {"data": service.run_report(session, principal, project_id, run_id)}


@router.get("/runs/{run_id}/asset-timeline", response_model=ListOut[AssetTimelineOut], responses={**READ_ERRORS, 409: ERR})
def get_asset_timeline(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    window: Annotated[MetricWindowKind, Query(description="구간 종류: day(기본)·week·month·run")] = "day",
    asset_id: Annotated[uuid.UUID | None, Query(description="설비 하나만")] = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """설비마다 구간별 상태 시간 구성(처리·준비·예약·막힘·유휴·가동률). 공정이 후보로 둔 설비 전체를 보여 주며 쓰이지 않은
    설비는 `used=false`(전 구간 유휴)다. 설비 코드 순. 공식 결과가 없으면 409 `RUN_RESULT_NOT_AVAILABLE`."""
    items, page = service.asset_timeline(session, principal, project_id, run_id, window=window, asset_id=asset_id,
                                         limit=limit, cursor=cursor)
    return {"data": items, "page": page}


@router.get("/runs/{run_id}/assets/{asset_id}/states", response_model=ListOut[AssetStateSegmentOut],
            responses={**READ_ERRORS, 409: ERR})
def list_asset_states(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    asset_id: uuid.UUID,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    from_min: Annotated[str | None, Query(description="이 시각에 걸친 구간부터(가상 시간 분, decimal 문자열)")] = None,
    to_min: Annotated[str | None, Query(description="이 시각 전에 시작한 구간까지")] = None,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """설비 하나의 상태 구간(간트용): 상태·시작·끝·길이와 그때의 작업·단계·제품. 길이 0인 전이는 빼고 마지막 구간은 실행
    종료 시각까지. 공식 결과가 없으면 409 `RUN_RESULT_NOT_AVAILABLE`."""
    items, page = service.asset_states(session, principal, project_id, run_id, asset_id, from_min=from_min,
                                       to_min=to_min, limit=limit, cursor=cursor)
    return {"data": items, "page": page}


@router.get("/runs/{run_id}/compare/{other_run_id}", response_model=Single[RunComparisonOut],
            responses={**READ_ERRORS, 409: ERR})
def compare_runs(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    other_run_id: uuid.UUID,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """두 실행 비교 요약: 비교 가능 여부·주의, 입력 스냅샷 차이, 제품별 핵심 지표(기준·비교·차이·비율), 양쪽 병목 상위 5개.
    `run_id`가 기준, `other_run_id`가 비교 대상이다. 같은 프로젝트여야 하고 둘 다 공식 결과가 있어야 한다."""
    return {"data": service.compare_runs(session, principal, project_id, run_id, other_run_id)}


@router.get("/runs/{run_id}/compare/{other_run_id}/metrics", response_model=ListOut[MetricComparisonOut],
            responses={**READ_ERRORS, 409: ERR})
def compare_run_metrics(
    project_id: uuid.UUID,
    run_id: uuid.UUID,
    other_run_id: uuid.UUID,
    limit: LimitQuery = None,
    cursor: CursorQuery = None,
    metric_key: Annotated[str | None, Query(max_length=64, description="지표 하나만(일·주·월 구간이면 필수)")] = None,
    window: Annotated[MetricWindowKind, Query(description="구간 종류: run(기본)·day·week·month")] = "run",
    changed_only: Annotated[bool, Query(description="값이 다른 행만(한쪽에만 있는 행 포함)")] = False,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
):
    """지표별 기준값·비교값·차이(비교 − 기준)·비율(비교 ÷ 기준). 공정 버전이 달라도 같은 제품이면 맞춘다(차원의 공정 버전을
    제품 id로 바꿈). 한쪽에만 있는 행은 다른 쪽 값이 null이다."""
    items, page = service.compare_metrics(session, principal, project_id, run_id, other_run_id, metric_key=metric_key,
                                          window=window, changed_only=changed_only, limit=limit, cursor=cursor)
    return {"data": items, "page": page}
