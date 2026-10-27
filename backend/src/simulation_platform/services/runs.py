"""실행(run) 서비스. 기준: CR be08(DEC-008) be08a, ERD §6.

- 실행 요청은 승인된 시나리오 버전만, 사전검증(컴파일)을 통과해야 한다. 요청하는 순간 입력 스냅샷·run·job을 한 트랜잭션으로 만든다.
- Idempotency-Key: 같은 키·같은 본문이면 기존 run을 돌려주고, 같은 키·다른 본문이면 409다.
- 취소는 "요청"과 "실제 취소"를 구분한다: 아직 시작하지 않은 run은 바로 취소되고, 실행 중이면 worker가 확인해 멈춘다.
- 잠그는 순서는 worker와 같다(job → run). 서로 반대로 잠그면 교착이 생긴다.
"""

import uuid
from decimal import Decimal, InvalidOperation
from fractions import Fraction

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from simulation_platform.auth.principal import Principal
from simulation_platform.domain import bottleneck as bottleneck_rules
from simulation_platform.domain import comparison as compare_rules
from simulation_platform.domain import run as rules
from simulation_platform.domain.errors import (
    DomainError,
    ErrorDetail,
    IdempotencyConflict,
    JobCancelTooLate,
    NotFoundError,
    RunNotRunnable,
    RunResultNotAvailable,
    ValidationFailed,
)
from simulation_platform.domain.pagination import (
    DEFAULT_LIMIT,
    decode_cursor,
    encode_cursor,
    make_tag,
)
from simulation_platform.domain.scenario import precheck as scenario_precheck
from simulation_platform.models import (
    Asset,
    Job,
    Product,
    RunInputSnapshot,
    Scenario,
    SimulationRun,
)
from simulation_platform.models.base import new_id
from simulation_platform.repositories import runs as repo
from simulation_platform.repositories import scenarios as scenario_repo
from simulation_platform.schemas.common import Page
from simulation_platform.schemas.run import (
    AssetStateSegmentOut,
    AssetTimelineBucketOut,
    AssetTimelineOut,
    AssetUseOut,
    AttemptOut,
    BottleneckLocationOut,
    BottleneckOut,
    BottleneckSummaryOut,
    ComparisonBottlenecksOut,
    EventOut,
    InputChangeOut,
    LineageLinkOut,
    LineageOperationOut,
    LineageOut,
    MetricComparisonOut,
    MetricOut,
    MetricPairOut,
    MetricWindowOut,
    MinutesOut,
    ProductComparisonOut,
    RunComparisonOut,
    RunCreate,
    RunInputOut,
    RunListItem,
    RunOut,
    RunResultOut,
    WorkItemOut,
)
from simulation_platform.services.projects import require_project, require_write
from simulation_platform.services.scenarios import collect_inputs
from simulation_platform.services.unit_of_work import audit, transaction
from simulation_platform.settings import get_settings
from simulation_platform.simulation.metrics import windows as metric_windows
from simulation_platform.simulation.numbers import format_decimal

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
    if result is not None:
        _fill_product_names(session, run.project_id, result)
    return RunOut(
        **_item(run), requested_by=run.requested_by, engine_version=run.engine_version,
        cancel_requested_at=run.cancel_requested_at, termination_reason=run.termination_reason,
        attempts=[AttemptOut.model_validate(a) for a in attempts], result=result)


def _fill_product_names(session: Session, project_id: uuid.UUID, result: RunResultOut) -> None:
    """결과 요약에 제품 코드·이름이 없는 이전 run은 현재 제품 목록으로 보충한다(새 run은 요청 당시 값이 이미 들어 있다)."""
    missing = [p for p in result.products if p.product_code is None]
    if not missing:
        return
    try:
        ids = {uuid.UUID(p.product_id) for p in missing}
    except ValueError:
        return
    found = {str(p.id): p for p in session.scalars(select(Product).where(Product.project_id == project_id,
                                                                         Product.id.in_(ids)))}
    for product in missing:
        row = found.get(product.product_id)
        if row is not None:
            product.product_code, product.product_name = row.code, row.name


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


# --- 이벤트·계보 조회(공식 결과 = 선택된 시도의 기록) ---------------------------------------------------------
MAX_LINEAGE_ITEMS = 5000


def _official_attempt(session: Session, project_id: uuid.UUID, run_id: uuid.UUID) -> uuid.UUID:
    run = _reload(session, project_id, run_id)
    if run.selected_attempt_id is None:
        raise RunResultNotAvailable("이 실행에는 아직 공식 결과가 없습니다.", [ErrorDetail(
            message=f"현재 상태는 {run.status}입니다. 끝까지 실행된(completed·stalled·horizon_reached·limit_reached) "
                    "실행만 이벤트·계보를 조회할 수 있습니다.", field_path="/status")])
    return run.selected_attempt_id


def _parse_decimal(value: str | None, field: str) -> Decimal | None:
    if value is None:
        return None
    try:
        parsed = Decimal(value)
    except InvalidOperation:
        parsed = None
    if parsed is None or not parsed.is_finite() or parsed < 0:
        raise ValidationFailed(f"{field}는 0 이상의 숫자여야 합니다.", [ErrorDetail(
            message="숫자 형식이 맞지 않습니다.", field_path=f"/{field}")])
    return parsed


def _num(value: Decimal | None) -> str | None:
    return None if value is None else str(value)


def _event_out(row) -> EventOut:
    return EventOut(
        event_seq=row.event_seq, sim_time=MinutesOut(min=str(row.sim_time_min), exact=row.sim_time_exact),
        event_type=row.event_type, step_key=row.step_key, operation_id=row.operation_id, asset_key=row.asset_key,
        item_key=row.item_key, process_version_id=row.process_version_id, source=row.source,
        destination=row.destination, reason=row.reason, quantities=row.quantities)


def list_events(session: Session, principal: Principal, project_id: uuid.UUID, run_id: uuid.UUID, *,
                limit: int | None, cursor: str | None, event_type: str | None, step_key: str | None,
                asset_key: str | None, item_key: str | None, from_min: str | None,
                to_min: str | None) -> tuple[list[EventOut], Page]:
    require_project(session, principal, project_id)
    attempt_id = _official_attempt(session, project_id, run_id)
    limit = limit or DEFAULT_LIMIT
    lower, upper = _parse_decimal(from_min, "from_min"), _parse_decimal(to_min, "to_min")
    tag = make_tag("run-events", ("event_seq", False), {
        "run": run_id, "event_type": event_type, "step_key": step_key, "asset_key": asset_key,
        "item_key": item_key, "from_min": from_min, "to_min": to_min})
    values = decode_cursor(cursor, tag, 1) if cursor else None
    rows = repo.list_events(session, project_id, attempt_id, limit=limit, cursor_values=values,
                            event_type=event_type, step_key=step_key, asset_key=asset_key, item_key=item_key,
                            from_min=lower, to_min=upper)
    page_rows = rows[:limit]
    next_cursor = encode_cursor(tag, [page_rows[-1].event_seq]) if len(rows) > limit else None
    return [_event_out(r) for r in page_rows], Page(limit=limit, next_cursor=next_cursor)


def _item_out(row) -> WorkItemOut:
    return WorkItemOut(
        item_key=row.item_key, parent_key=row.parent_key, process_version_id=row.process_version_id,
        lot_key=row.lot_key, state_code=row.state_code, form=row.form, length_m=_num(row.length_m),
        weight_kg=_num(row.weight_kg), location_key=row.location_key, status=row.status,
        created_at=MinutesOut(min=str(row.created_at_min), exact=row.created_at_exact))


def get_lineage(session: Session, principal: Principal, project_id: uuid.UUID, run_id: uuid.UUID,
                item_key: str) -> LineageOut:
    """작업물의 조상(어디서 왔나)과 후손(무엇이 되었나)을 모두 모아 돌려준다."""
    require_project(session, principal, project_id)
    attempt_id = _official_attempt(session, project_id, run_id)
    if repo.get_work_item(session, project_id, attempt_id, item_key) is None:
        raise NotFoundError("작업물을 찾을 수 없습니다.")
    seen, rows, truncated = {item_key}, {}, False
    for as_child in (True, False):  # 조상 방향, 후손 방향을 따로 넓힌다(형제로 번지지 않게)
        frontier = {item_key}
        while frontier and not truncated:
            found = repo.relations_of(session, project_id, attempt_id, frontier, as_child=as_child)
            frontier = set()
            for relation in found:
                rows[relation.seq] = relation
                for key in (relation.parent_key, relation.child_key):
                    if key is not None and key not in seen:
                        seen.add(key)
                        frontier.add(key)
            truncated = len(seen) > MAX_LINEAGE_ITEMS
    whole = {r.seq: r for r in repo.relations_of_operations(
        session, project_id, attempt_id, {r.operation_key for r in rows.values()})}
    seen.update(key for r in whole.values() for key in (r.parent_key, r.child_key) if key is not None)
    operations: dict[tuple, dict] = {}
    for relation in sorted(whole.values(), key=lambda r: r.seq):
        group = operations.setdefault((relation.operation_key, relation.relation_type), {
            "operation_key": relation.operation_key, "step_key": relation.step_key,
            "relation_type": relation.relation_type, "accounting_mode": relation.accounting_mode,
            "process_version_id": relation.process_version_id, "residual_length_m": _num(relation.residual_length_m),
            "carried_in_m": _num(relation.carried_in_m), "balanced": relation.balanced, "links": []})
        group["links"].append(LineageLinkOut(
            parent_key=relation.parent_key, child_key=relation.child_key,
            parent_length_m=_num(relation.parent_length_m), child_length_m=_num(relation.child_length_m)))
    items = repo.work_items(session, project_id, attempt_id, sorted(seen)[:MAX_LINEAGE_ITEMS + 1])
    return LineageOut(item_key=item_key, items=[_item_out(i) for i in items],
                      operations=[LineageOperationOut(**g) for g in operations.values()], truncated=truncated)


# --- 지표 조회 -------------------------------------------------------------------------------------
def _metric_out(row) -> MetricOut:
    return MetricOut(
        metric_key=row.metric_key, dimensions=row.dimensions, value=_num(row.value), unit=row.unit,
        definition_version=row.definition_version, quality_status=row.quality_status,
        window=MetricWindowOut(
            kind=row.window_kind, start=MinutesOut(min=str(row.window_start_min), exact=row.window_start_exact),
            end=MinutesOut(min=str(row.window_end_min), exact=row.window_end_exact)))


def list_metrics(session: Session, principal: Principal, project_id: uuid.UUID, run_id: uuid.UUID, *,
                 limit: int | None, cursor: str | None, metric_key: str | None, window: str,
                 process_version_id: str | None, asset_key: str | None, node_key: str | None,
                 step_key: str | None = None) -> tuple[list[MetricOut], Page]:
    require_project(session, principal, project_id)
    attempt_id = _official_attempt(session, project_id, run_id)
    chosen = [(name, value) for name, value in (("process_version_id", process_version_id), ("step_key", step_key),
                                                 ("asset_key", asset_key), ("node_key", node_key)) if value is not None]
    limit = limit or DEFAULT_LIMIT
    tag = make_tag("run-metrics", ("id", False), {"run": run_id, "metric_key": metric_key, "window": window,
                                                  "dimension": chosen})
    values = decode_cursor(cursor, tag, 1) if cursor else None
    rows = repo.list_metrics(session, project_id, attempt_id, limit=limit, cursor_values=values,
                             metric_key=metric_key, window_kind=window, dimensions=chosen)
    page_rows = rows[:limit]
    next_cursor = encode_cursor(tag, [page_rows[-1].id]) if len(rows) > limit else None
    return [_metric_out(r) for r in page_rows], Page(limit=limit, next_cursor=next_cursor)


# --- 병목 요약(CR be10) ----------------------------------------------------------------------------------
_BOTTLENECK_METRICS = (
    "step_equipment_wait_item_min", "step_equipment_wait_avg_min", "step_equipment_wait_max_min", "step_operations",
    "step_processing_time_min", "step_input_wait_item_min", "step_blocked_item_min", "step_peak_concurrency",
    "space_wait_item_min", "space_wait_max_min", "buffer_item_min", "buffer_peak_items", "buffer_wait_avg_min",
    "buffer_wait_max_min", "buffer_occupancy_avg_items", "utilization", "processing_time_min")


def _graph_info(snapshot: dict, names: dict[str, tuple[str, str]]) -> dict[str, dict]:
    """스냅샷의 공정 그래프에서 병목 설명에 필요한 것(노드 이름·종류·후보 설비·다음 노드)만 뽑는다."""
    graphs = {}
    for product in snapshot["products"]:
        nodes = product["graph"]["nodes"]
        by_id = {n["id"]: n["node_key"] for n in nodes}
        following: dict[str, list[str]] = {}
        for edge in product["graph"]["edges"]:
            following.setdefault(by_id.get(edge["from_node_id"]), []).append(by_id.get(edge["to_node_id"]))
        info = {}
        for node in nodes:
            step = node.get("step") or {}
            assets = [str(c["asset_id"]) for r in step.get("resources", []) for c in r.get("candidates", [])]
            info[node["node_key"]] = {"label": node.get("label") or node["node_key"], "kind": node.get("kind"),
                                      "operation_type": step.get("operation_type"), "assets": assets,
                                      "next": [k for k in following.get(node["node_key"], []) if k]}
        meta = product.get("product") or {}
        code, name = meta.get("code"), meta.get("name")
        if code is None and product["product_id"] in names:
            code, name = names[product["product_id"]]
        graphs[product["process_version"]["id"]] = {
            "product": {"id": product["product_id"], "code": code, "name": name}, "nodes": info}
    return graphs


def _jsonable(value):
    if isinstance(value, Decimal):
        return f"{value:.6f}"
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    return value


def get_bottlenecks(session: Session, principal: Principal, project_id: uuid.UUID, run_id: uuid.UUID,
                    limit: int) -> BottleneckSummaryOut:
    """공식 결과의 전체 구간 지표로 병목(멈춰 있는 곳)을 종류·위치·근거와 함께 순위를 매겨 돌려준다."""
    require_project(session, principal, project_id)
    attempt_id = _official_attempt(session, project_id, run_id)
    run = _reload(session, project_id, run_id)
    attempt = next(a for a in repo.attempts_of(session, project_id, run_id) if a.id == attempt_id)
    result = attempt.result_summary or {}
    snapshot = repo.snapshot_of(session, project_id, run_id).snapshot
    products = {str(p.id): (p.code, p.name) for p in session.scalars(select(Product).where(Product.project_id == project_id))}
    graphs = _graph_info(snapshot, products)
    steps: dict[tuple[str, str], dict] = {}
    nodes: dict[str, dict] = {}
    assets: dict[str, dict] = {}
    for row in repo.run_window_metrics(session, project_id, attempt_id, _BOTTLENECK_METRICS):
        dims = row.dimensions
        target = (steps.setdefault((dims["process_version_id"], dims["step_key"]), {}) if "step_key" in dims
                  else nodes.setdefault(dims["node_key"], {}) if "node_key" in dims
                  else assets.setdefault(dims["asset_key"], {}) if "asset_key" in dims else None)
        if target is not None:
            target[row.metric_key] = row.value
    asset_ids = {uuid.UUID(a) for info in graphs.values() for n in info["nodes"].values() for a in n["assets"]}
    asset_names = {str(a.id): {"code": a.code, "name": a.name} for a in session.scalars(select(Asset).where(
        Asset.project_id == project_id, Asset.id.in_(asset_ids)))} if asset_ids else {}
    observed = Decimal(result["end_time"]["min"]) if result.get("end_time") else Decimal(0)
    codes = {a["code"] for a in result.get("assumptions", [])}
    found = bottleneck_rules.analyze(steps=steps, nodes=nodes, assets=assets, graphs=graphs, asset_names=asset_names,
                                     observed_min=observed, assumption_codes=codes)
    out = []
    for f in found["findings"][:limit]:
        loc = dict(f["location"])
        pv = loc.get("process_version_id")
        if pv in graphs:
            loc.update(product_id=graphs[pv]["product"]["id"], product_code=graphs[pv]["product"]["code"],
                       product_name=graphs[pv]["product"]["name"])
        out.append(BottleneckOut(
            rank=f["rank"], rank_in_kind=f["rank_in_kind"], kind=f["kind"], level=f["level"],
            stalled_item_min=f"{f['stalled']:.6f}", share=f"{f['share']:.6f}", location=BottleneckLocationOut(**loc),
            explanation=f["explanation"], evidence=_jsonable(f["evidence"])))
    state = result.get("state", run.status)
    quality = {"completed": "complete", "horizon_reached": "censored"}.get(state, "incomplete")
    return BottleneckSummaryOut(
        run_id=run.id, quality_status=quality, observed=MinutesOut(**result["end_time"]) if result.get("end_time")
        else MinutesOut(min="0.000000", exact="0"), definition_version=bottleneck_rules.DEFINITION_VERSION,
        headline=found["headline"], findings=out, limitations=found["limitations"], thresholds=found["thresholds"])


# --- 설비 상태 타임라인(CR be11) ---------------------------------------------------------------------------
_STATE_FIELDS = {"processing_time_min": "processing_min", "setup_time_min": "setup_min",
                 "reserved_time_min": "reserved_min", "blocked_time_min": "blocked_min"}


def _official_result(session: Session, project_id: uuid.UUID, run_id: uuid.UUID):
    attempt_id = _official_attempt(session, project_id, run_id)
    attempt = next(a for a in repo.attempts_of(session, project_id, run_id) if a.id == attempt_id)
    snapshot = repo.snapshot_of(session, project_id, run_id).snapshot
    return attempt_id, attempt.result_summary or {}, snapshot


def _asset_uses(snapshot: dict) -> tuple[dict[str, list[AssetUseOut]], dict[str, str | None]]:
    """스냅샷의 공정 그래프에서 설비 → (제품·단계) 목록과 공정 버전 → 제품 코드."""
    uses: dict[str, list[AssetUseOut]] = {}
    codes: dict[str, str | None] = {}
    for product in snapshot["products"]:
        pv = product["process_version"]["id"]
        codes[pv] = (product.get("product") or {}).get("code")
        for node in product["graph"]["nodes"]:
            step = node.get("step") or {}
            for requirement in step.get("resources", []):
                for candidate in requirement.get("candidates", []):
                    uses.setdefault(str(candidate["asset_id"]), []).append(AssetUseOut(
                        process_version_id=pv, product_code=codes[pv], step_key=node["node_key"],
                        step_label=node.get("label")))
    return uses, codes


def _fill_codes(session: Session, project_id: uuid.UUID, snapshot: dict, codes: dict[str, str | None]) -> None:
    """이전 run(스냅샷에 제품 코드가 없음)은 현재 제품 목록으로 보충한다."""
    if all(codes.values()):
        return
    current = {str(p.id): p.code for p in session.scalars(select(Product).where(Product.project_id == project_id))}
    for product in snapshot["products"]:
        pv = product["process_version"]["id"]
        if codes.get(pv) is None:
            codes[pv] = current.get(product["product_id"])


def _dec6(value) -> str:
    return f"{Decimal(value):.6f}"


def asset_timeline(session: Session, principal: Principal, project_id: uuid.UUID, run_id: uuid.UUID, *,
                   window: str, asset_id: uuid.UUID | None, limit: int | None,
                   cursor: str | None) -> tuple[list[AssetTimelineOut], Page]:
    """설비마다 구간별 상태 시간 구성(처리·준비·예약·막힘·유휴). 공정의 후보 설비 전체를 보여 준다(쓰이지 않았으면 used=false)."""
    require_project(session, principal, project_id)
    attempt_id, result, snapshot = _official_result(session, project_id, run_id)
    end_time = Fraction(result["end_time"]["exact"]) if result.get("end_time") else Fraction(0)
    spans = [(start, end) for kind, start, end, _ in metric_windows(end_time) if kind == window]
    uses, codes = _asset_uses(snapshot)
    _fill_codes(session, project_id, snapshot, codes)
    for items in uses.values():
        for use in items:
            use.product_code = use.product_code or codes.get(use.process_version_id)
    values: dict[tuple[str, str], dict[str, Decimal]] = {}
    for row in repo.asset_state_metrics(session, project_id, attempt_id, window):
        values.setdefault((row.dimensions["asset_key"], row.window_start_exact), {})[row.metric_key] = row.value
    used = {asset for asset, _ in values}
    ids = set(uses) | used
    if asset_id is not None:
        ids &= {str(asset_id)}
    names = {str(a.id): a for a in session.scalars(select(Asset).where(
        Asset.project_id == project_id, Asset.id.in_({uuid.UUID(i) for i in ids})))} if ids else {}
    ordered = sorted(ids, key=lambda i: ((names[i].code if i in names else "~"), i))
    limit = limit or DEFAULT_LIMIT
    tag = make_tag("asset-timeline", ("code", False), {"run": run_id, "window": window, "asset": asset_id})
    if cursor:
        last = decode_cursor(cursor, tag, 1)[0]
        ordered = ordered[ordered.index(last) + 1:] if last in ordered else []
    page, more = ordered[:limit], len(ordered) > limit
    out = []
    for asset in page:
        buckets = []
        for start, end in spans:
            m = values.get((asset, str(start)), {})
            parts = {field: Decimal(m.get(metric) or 0) for metric, field in _STATE_FIELDS.items()}
            length = Decimal(format_decimal(end - start))
            idle = max(length - sum(parts.values(), Decimal(0)), Decimal(0))
            buckets.append(AssetTimelineBucketOut(
                start=MinutesOut(min=format_decimal(start), exact=str(start)),
                end=MinutesOut(min=format_decimal(end), exact=str(end)),
                **{k: _dec6(v) for k, v in parts.items()}, idle_min=_dec6(idle),
                utilization=None if length <= 0 else _dec6(parts["processing_min"] / length)))
        row = names.get(asset)
        out.append(AssetTimelineOut(asset_id=asset, asset_code=None if row is None else row.code,
                                    asset_name=None if row is None else row.name, used=asset in used,
                                    uses=uses.get(asset, []), buckets=buckets))
    next_cursor = encode_cursor(tag, [page[-1]]) if more and page else None
    return out, Page(limit=limit, next_cursor=next_cursor)


def asset_states(session: Session, principal: Principal, project_id: uuid.UUID, run_id: uuid.UUID,
                 asset_id: uuid.UUID, *, from_min: str | None, to_min: str | None, limit: int | None,
                 cursor: str | None) -> tuple[list[AssetStateSegmentOut], Page]:
    """설비 하나의 상태 구간(간트). 길이 0인 전이는 빼고 마지막 구간은 실행 종료 시각까지다."""
    require_project(session, principal, project_id)
    attempt_id, result, snapshot = _official_result(session, project_id, run_id)
    lower, upper = _parse_decimal(from_min, "from_min"), _parse_decimal(to_min, "to_min")
    end_exact = result["end_time"]["exact"] if result.get("end_time") else "0"
    _, codes = _asset_uses(snapshot)
    _fill_codes(session, project_id, snapshot, codes)
    key, limit = str(asset_id), limit or DEFAULT_LIMIT
    tag = make_tag("asset-states", ("event_seq", False), {"run": run_id, "asset": key, "from": from_min, "to": to_min})
    after = decode_cursor(cursor, tag, 1)[0] if cursor else None
    start_seq = None
    if after is None and lower is not None:
        start_seq = repo.last_state_change_at_or_before(session, project_id, attempt_id, key, lower)
    events = repo.asset_state_events(session, project_id, attempt_id, key, after_seq=after,
                                     from_seq=start_seq, limit=limit + 1)
    segments, last_seq = [], None
    for index, event in enumerate(events[:limit]):
        if upper is not None and event.sim_time_min >= upper:
            events = []  # 구간 끝을 넘었다: 더 볼 것이 없다
            break
        end = events[index + 1] if index + 1 < len(events) else None
        end_min, end_exact_value = ((end.sim_time_min, end.sim_time_exact) if end is not None
                                    else (Decimal(result["end_time"]["min"]), end_exact))
        last_seq = event.event_seq
        if Fraction(end_exact_value) == Fraction(event.sim_time_exact):
            continue  # 같은 시각의 연속 전이(예: 배정 직후 처리 시작)는 길이가 없다
        segments.append(AssetStateSegmentOut(
            state=event.quantities.get("state"), start=MinutesOut(min=str(event.sim_time_min), exact=event.sim_time_exact),
            end=MinutesOut(min=str(end_min), exact=end_exact_value),
            duration_min=format_decimal(Fraction(end_exact_value) - Fraction(event.sim_time_exact)),
            operation_id=event.operation_id, step_key=event.step_key, process_version_id=event.process_version_id,
            product_code=codes.get(event.process_version_id)))
    more = len(events) > limit and last_seq is not None
    return segments, Page(limit=limit, next_cursor=encode_cursor(tag, [last_seq]) if more else None)


# --- 두 실행 비교(CR be12) -------------------------------------------------------------------------------
_PRODUCT_KEYS = ("completed_items", "completed_length_m", "throughput_items_per_day", "lead_time_avg_min",
                 "lead_time_max_min", "wip_items", "discarded_length_m")


def _pair_sides(session: Session, principal: Principal, project_id: uuid.UUID, run_id: uuid.UUID,
                other_id: uuid.UUID):
    require_project(session, principal, project_id)
    if run_id == other_id:
        raise ValidationFailed("같은 실행끼리는 비교할 수 없습니다.", [ErrorDetail(
            message="다른 실행을 고르세요.", field_path="/other_run_id")])
    sides = []
    for rid in (run_id, other_id):
        attempt_id, result, snapshot = _official_result(session, project_id, rid)
        _fill_snapshot_codes(session, project_id, snapshot)
        sides.append((_reload(session, project_id, rid), attempt_id, result, snapshot))
    return sides


def _fill_snapshot_codes(session: Session, project_id: uuid.UUID, snapshot: dict) -> None:
    """이전 run(스냅샷에 제품 코드가 없음)은 현재 제품 목록으로 보충한다(응답용, 저장된 스냅샷은 바꾸지 않는다)."""
    if all(p.get("product") for p in snapshot["products"]):
        return
    current = {str(p.id): p for p in session.scalars(select(Product).where(Product.project_id == project_id))}
    for product in snapshot["products"]:
        if not product.get("product") and product["product_id"] in current:
            row = current[product["product_id"]]
            product["product"] = {"code": row.code, "name": row.name}


def _num_out(value: Decimal | None) -> str | None:
    return None if value is None else f"{value:.6f}"


def compare_runs(session: Session, principal: Principal, project_id: uuid.UUID, run_id: uuid.UUID,
                 other_id: uuid.UUID) -> RunComparisonOut:
    """두 실행의 입력 차이·제품별 핵심 지표·병목을 나란히 놓는다(저장 없이, 불변 입력·지표만 읽음)."""
    (run_a, attempt_a, result_a, snap_a), (run_b, attempt_b, result_b, snap_b) = _pair_sides(
        session, principal, project_id, run_id, other_id)
    comparable, notes = compare_rules.warnings(snap_a, snap_b, run_a.status, run_b.status)
    changes = compare_rules.input_changes(snap_a, snap_b)
    left, right = compare_rules.product_index(snap_a), compare_rules.product_index(snap_b)

    def by_product(attempt_id, index):
        pv_to_product = {info["process_version_id"]: pid for pid, info in index.items()}
        values: dict[str, dict] = {}  # 제품 id → 지표 key → 지표 행
        for row in repo.run_window_metrics(session, project_id, attempt_id, _PRODUCT_KEYS):
            pid = pv_to_product.get(row.dimensions.get("process_version_id"))
            if pid is not None and set(row.dimensions) == {"process_version_id"}:
                values.setdefault(pid, {})[row.metric_key] = row
        return values

    values_a, values_b = by_product(attempt_a, left), by_product(attempt_b, right)
    last_a = {p.get("product_id"): p.get("last_completion") for p in result_a.get("products", [])}
    last_b = {p.get("product_id"): p.get("last_completion") for p in result_b.get("products", [])}
    products = []
    for pid in sorted(set(left) & set(right), key=lambda p: left[p]["order"]):
        pairs = []
        for key in _PRODUCT_KEYS:
            a, b = values_a.get(pid, {}).get(key), values_b.get(pid, {}).get(key)
            d, r = compare_rules.delta(None if a is None else a.value, None if b is None else b.value)
            pairs.append(MetricPairOut(metric_key=key, unit=(a or b).unit if (a or b) else None,
                                       base=_num_out(None if a is None else a.value),
                                       other=_num_out(None if b is None else b.value),
                                       delta=_num_out(d), ratio=_num_out(r)))
        products.append(ProductComparisonOut(
            product_id=pid, product_code=left[pid]["code"] or right[pid]["code"],
            product_name=left[pid]["name"] or right[pid]["name"],
            base_process_version_id=left[pid]["process_version_id"],
            other_process_version_id=right[pid]["process_version_id"], metrics=pairs,
            base_last_completion=last_a.get(pid), other_last_completion=last_b.get(pid)))
    top = ComparisonBottlenecksOut(
        base=get_bottlenecks(session, principal, project_id, run_id, 5).findings,
        other=get_bottlenecks(session, principal, project_id, other_id, 5).findings)
    return RunComparisonOut(
        base_run_id=run_a.id, other_run_id=run_b.id, comparable=comparable, warnings=notes,
        base_status=run_a.status, other_status=run_b.status,
        base_end_time=result_a.get("end_time"), other_end_time=result_b.get("end_time"),
        input_changes=[InputChangeOut(**c) for c in changes], products=products, bottlenecks=top)


def compare_metrics(session: Session, principal: Principal, project_id: uuid.UUID, run_id: uuid.UUID,
                    other_id: uuid.UUID, *, metric_key: str | None, window: str, changed_only: bool,
                    limit: int | None, cursor: str | None) -> tuple[list[MetricComparisonOut], Page]:
    """같은 지표·차원·구간끼리 기준값·비교값·차이·비율. 공정 버전이 달라도 같은 제품이면 맞춘다."""
    if window != "run" and metric_key is None:
        raise ValidationFailed("일·주·월 구간 비교는 지표를 하나 골라야 합니다.", [ErrorDetail(
            message="metric_key를 보내세요(행이 많아 구간 비교는 지표 하나씩 본다).", field_path="/metric_key")])
    (_, attempt_a, _, snap_a), (_, attempt_b, _, snap_b) = _pair_sides(session, principal, project_id, run_id, other_id)
    left, right = compare_rules.product_index(snap_a), compare_rules.product_index(snap_b)
    map_a = {info["process_version_id"]: pid for pid, info in left.items()}
    map_b = {info["process_version_id"]: pid for pid, info in right.items()}
    codes = {pid: (left.get(pid) or right.get(pid))["code"] for pid in set(left) | set(right)}
    merged: dict[tuple, list] = {}
    for side, attempt_id, mapping in ((0, attempt_a, map_a), (1, attempt_b, map_b)):
        for row in repo.window_metrics(session, project_id, attempt_id, window, metric_key):
            key = (row.metric_key, compare_rules.align_dimensions(row.dimensions, mapping), row.window_start_exact)
            merged.setdefault(key, [None, None])[side] = row
    out = []
    for key in sorted(merged, key=lambda k: (k[0], k[1], Fraction(k[2]))):
        a, b = merged[key]
        d, r = compare_rules.delta(None if a is None else a.value, None if b is None else b.value)
        if changed_only and a is not None and b is not None and a.value == b.value:
            continue  # 같은 값(둘 다 null인 '해당 없음' 포함)은 바뀌지 않은 것이다
        either = a or b
        dims = dict(key[1])
        if "product_id" in dims:
            dims["product_code"] = codes.get(dims["product_id"]) or ""
        out.append(MetricComparisonOut(
            metric_key=key[0], unit=either.unit, dimensions={k: str(v) for k, v in dims.items()},
            base_process_version_id=None if a is None else a.dimensions.get("process_version_id"),
            other_process_version_id=None if b is None else b.dimensions.get("process_version_id"),
            window=MetricWindowOut(kind=either.window_kind,
                                   start=MinutesOut(min=str(either.window_start_min), exact=either.window_start_exact),
                                   end=MinutesOut(min=str(either.window_end_min), exact=either.window_end_exact)),
            base=_num_out(None if a is None else a.value), other=_num_out(None if b is None else b.value),
            delta=_num_out(d), ratio=_num_out(r)))
    limit = limit or DEFAULT_LIMIT
    tag = make_tag("run-compare", ("order", False), {"run": run_id, "other": other_id, "metric_key": metric_key,
                                                      "window": window, "changed_only": changed_only})
    offset = decode_cursor(cursor, tag, 1)[0] if cursor else 0
    if not isinstance(offset, int) or offset < 0:
        offset = 0
    page = out[offset:offset + limit]
    next_cursor = encode_cursor(tag, [offset + limit]) if offset + limit < len(out) else None
    return page, Page(limit=limit, next_cursor=next_cursor)
