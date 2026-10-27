"""실행(run) 서비스. 기준: CR be08(DEC-008) be08a, ERD §6.

- 실행 요청은 승인된 시나리오 버전만, 사전검증(컴파일)을 통과해야 한다. 요청하는 순간 입력 스냅샷·run·job을 한 트랜잭션으로 만든다.
- Idempotency-Key: 같은 키·같은 본문이면 기존 run을 돌려주고, 같은 키·다른 본문이면 409다.
- 취소는 "요청"과 "실제 취소"를 구분한다: 아직 시작하지 않은 run은 바로 취소되고, 실행 중이면 worker가 확인해 멈춘다.
- 잠그는 순서는 worker와 같다(job → run). 서로 반대로 잠그면 교착이 생긴다.
"""

import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from simulation_platform.auth.principal import Principal
from simulation_platform.domain import run as rules
from simulation_platform.domain.errors import (
    DomainError,
    ErrorDetail,
    IdempotencyConflict,
    JobCancelTooLate,
    NotFoundError,
    RunNotRunnable,
)
from simulation_platform.domain.pagination import (
    DEFAULT_LIMIT,
    decode_cursor,
    encode_cursor,
    make_tag,
)
from simulation_platform.domain.scenario import precheck as scenario_precheck
from simulation_platform.models import Job, RunInputSnapshot, Scenario, SimulationRun
from simulation_platform.models.base import new_id
from simulation_platform.repositories import runs as repo
from simulation_platform.repositories import scenarios as scenario_repo
from simulation_platform.schemas.common import Page
from simulation_platform.schemas.run import (
    AttemptOut,
    RunCreate,
    RunInputOut,
    RunListItem,
    RunOut,
    RunResultOut,
)
from simulation_platform.services.projects import require_project, require_write
from simulation_platform.services.scenarios import collect_inputs
from simulation_platform.services.unit_of_work import audit, transaction
from simulation_platform.settings import get_settings

RUN_NOT_FOUND = "실행을 찾을 수 없습니다."


class _IdempotencyRace(DomainError):
    """같은 키의 요청이 동시에 들어와 다른 요청이 먼저 만들었다(내부용: 기존 run을 다시 읽어 돌려준다)."""

    code = "IDEMPOTENCY_RACE"
    status_code = 409


def _item(run: SimulationRun) -> dict:
    return {"id": run.id, "project_id": run.project_id, "scenario_version_id": run.scenario_version_id,
            "status": run.status, "requested_at": run.created_at, "started_at": run.started_at,
            "finished_at": run.finished_at, "seed": run.seed, "replicate_index": run.replicate_index,
            "input_hash": run.input_hash}


def _run_out(session: Session, run: SimulationRun) -> RunOut:
    attempts = repo.attempts_of(session, run.project_id, run.id)
    selected = next((a for a in attempts if a.id == run.selected_attempt_id), None)
    result = (RunResultOut.model_validate(selected.result_summary)
              if selected is not None and selected.result_summary else None)
    return RunOut(
        **_item(run), requested_by=run.requested_by, engine_version=run.engine_version,
        cancel_requested_at=run.cancel_requested_at, termination_reason=run.termination_reason,
        attempts=[AttemptOut.model_validate(a) for a in attempts], result=result)


def _reload(session: Session, project_id: uuid.UUID, run_id: uuid.UUID) -> SimulationRun:
    session.expire_all()
    run = repo.get_run(session, project_id, run_id)
    if run is None:
        raise NotFoundError(RUN_NOT_FOUND)
    return run


def _not_runnable(version, result) -> RunNotRunnable:
    details = [ErrorDetail(severity="error", rule_id=i.rule_id, field_path=i.field_path, message=i.message)
               for i in result.issues if i.severity == "error"]
    for index, product in enumerate(result.products):
        details.extend(ErrorDetail(severity="error", rule_id=i["rule_id"], field_path=f"/products/{index}",
                                   message=i["message"]) for i in product.compile_issues)
    return RunNotRunnable("실행할 수 없는 시나리오 버전입니다. 사전검증 오류를 먼저 해결하세요.", details)


def create_run(session: Session, principal: Principal, project_id: uuid.UUID, body: RunCreate, key: str,
               request_id: str | None) -> tuple[RunOut, bool]:
    """실행을 요청한다. (run, 새로 만들었는가). 이미 같은 키·같은 본문의 run이 있으면 그것을 돌려준다(False)."""
    access = require_project(session, principal, project_id)
    require_write(access)
    fingerprint = rules.request_fingerprint(body.scenario_version_id, body.seed, body.replicate_index)
    existing = repo.find_by_key(session, project_id, principal.user_id, key)
    if existing is not None:
        return _replay(session, existing, fingerprint)

    version = scenario_repo.get_version(session, project_id, body.scenario_version_id)
    if version is None:
        raise NotFoundError("시나리오 버전을 찾을 수 없습니다.")
    if version.status != "approved":
        raise RunNotRunnable("승인된 시나리오 버전만 실행할 수 있습니다.", [ErrorDetail(
            severity="error", rule_id="RUN-SCN-001", field_path="/scenario_version_id",
            message=f"현재 상태는 {version.status}입니다. 사전검증을 통과해 승인한 뒤 실행하세요.")])
    inputs, pinned = collect_inputs(session, version)
    result = scenario_precheck(inputs, pinned, version.assumption_reason)
    if not result.runnable:
        raise _not_runnable(version, result)

    scenario = session.get(Scenario, version.scenario_id)
    snapshot = rules.build_snapshot(
        project_id=project_id, inputs=inputs, pinned_assets=pinned, seed=body.seed,
        replicate_index=body.replicate_index, event_limit=get_settings().run_event_limit,
        scenario={"scenario_id": str(scenario.id), "code": scenario.code, "scenario_version_id": str(version.id),
                  "version_no": version.version_no, "stopping_rule": version.stopping_rule,
                  "assumption_reason": version.assumption_reason})
    digest = rules.sha256_of(snapshot)
    run = SimulationRun(
        id=new_id(), project_id=project_id, scenario_version_id=version.id, status="queued",
        requested_by=principal.user_id, seed=body.seed, replicate_index=body.replicate_index,
        engine_version=snapshot["engine"]["version"], input_hash=digest, idempotency_key=key,
        request_hash=fingerprint, created_by=principal.user_id)
    try:
        with transaction(session, {"uq_simulation_run_idempotency": _IdempotencyRace}):
            session.add(run)
            session.flush()
            session.add(RunInputSnapshot(
                id=new_id(), project_id=project_id, run_id=run.id, schema_version=snapshot["schema_version"],
                snapshot=snapshot, sha256=digest, created_by=principal.user_id))
            session.add(Job(id=new_id(), project_id=project_id, run_id=run.id, kind="simulation_run",
                            state="queued", payload={"run_id": str(run.id)}, created_by=principal.user_id))
            audit(session, organization_id=access.project.organization_id, project_id=project_id,
                  actor_id=principal.user_id, action="run.create", entity_type="simulation_run", entity_id=run.id,
                  before=None, after={"scenario_version_id": str(version.id), "seed": body.seed,
                                      "replicate_index": body.replicate_index, "input_hash": digest},
                  request_id=request_id)
    except _IdempotencyRace:
        winner = repo.find_by_key(session, project_id, principal.user_id, key)
        return _replay(session, winner, fingerprint)
    return _run_out(session, _reload(session, project_id, run.id)), True


def _replay(session: Session, existing: SimulationRun, fingerprint: str) -> tuple[RunOut, bool]:
    if existing.request_hash != fingerprint:
        raise IdempotencyConflict("같은 Idempotency-Key로 다른 요청이 이미 있습니다.", [ErrorDetail(
            message="다른 실행을 요청하려면 새 Idempotency-Key를 쓰세요.", field_path="/idempotency-key")])
    return _run_out(session, existing), False


def get_run(session: Session, principal: Principal, project_id: uuid.UUID, run_id: uuid.UUID) -> RunOut:
    require_project(session, principal, project_id)
    return _run_out(session, _reload(session, project_id, run_id))


def list_runs(session: Session, principal: Principal, project_id: uuid.UUID, *, limit: int | None,
              cursor: str | None, status: str | None,
              scenario_version_id: uuid.UUID | None) -> tuple[list[RunListItem], Page]:
    require_project(session, principal, project_id)
    limit = limit or DEFAULT_LIMIT
    tag = make_tag("runs", ("seq", True), {"status": status, "scenario_version_id": scenario_version_id})
    values = decode_cursor(cursor, tag, 1) if cursor else None
    rows = repo.list_runs(session, project_id, limit=limit, cursor_values=values, status=status,
                          scenario_version_id=scenario_version_id)
    page_rows = rows[:limit]
    next_cursor = encode_cursor(tag, [page_rows[-1].seq]) if len(rows) > limit else None
    return [RunListItem.model_validate(_item(r)) for r in page_rows], Page(limit=limit, next_cursor=next_cursor)


def get_input(session: Session, principal: Principal, project_id: uuid.UUID, run_id: uuid.UUID) -> RunInputOut:
    require_project(session, principal, project_id)
    run = _reload(session, project_id, run_id)
    stored = repo.snapshot_of(session, project_id, run.id)
    if stored is None:
        raise NotFoundError(RUN_NOT_FOUND)
    return RunInputOut(run_id=run.id, schema_version=stored.schema_version, sha256=stored.sha256,
                       hash_verified=rules.sha256_of(stored.snapshot) == stored.sha256, snapshot=stored.snapshot)


def cancel_run(session: Session, principal: Principal, project_id: uuid.UUID, run_id: uuid.UUID,
               request_id: str | None) -> RunOut:
    """취소를 요청한다. 시작 전이면 바로 취소되고, 실행 중이면 요청만 기록하며 worker가 확인해 멈춘다. 끝난 run은 409."""
    access = require_project(session, principal, project_id)
    require_write(access)
    if repo.get_run(session, project_id, run_id) is None:
        raise NotFoundError(RUN_NOT_FOUND)
    job = repo.job_of(session, project_id, run_id, for_update=True)  # job → run 순서로 잠근다(worker와 같음)
    run = repo.get_run(session, project_id, run_id, for_update=True)
    session.refresh(run)
    if run.status not in ("queued", "running"):
        raise JobCancelTooLate("이미 끝난 실행은 취소할 수 없습니다.", [ErrorDetail(
            message=f"현재 상태는 {run.status}입니다.", field_path="/status")])
    with transaction(session, {}):
        if run.cancel_requested_at is None:
            run.cancel_requested_at, run.cancel_requested_by = func.now(), principal.user_id
        if run.status == "queued" and job is not None and job.state == "queued":
            job.state, run.status = "cancelled", "cancelled"
            run.finished_at, run.termination_reason = func.now(), "CANCELLED_BEFORE_START"
            action = "run.cancel"
        else:
            action = "run.cancel_request"
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action=action, entity_type="simulation_run", entity_id=run.id,
              before=None, after={"status": run.status}, request_id=request_id)
    return _run_out(session, _reload(session, project_id, run_id))
