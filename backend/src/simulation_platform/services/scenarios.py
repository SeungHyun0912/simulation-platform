"""시나리오·시나리오 버전 서비스. 기준: CR-backend-20261026-be07-scenario-versions (BE-05a, DEC-007).

- 시나리오를 만들면 첫 초안(version 1)도 함께 만든다. 시나리오당 초안은 하나다.
- 초안은 저장할 때 참조만 검사하고(제품·공정 버전·자산 버전이 이 프로젝트의 동결된 버전인지), 실행 가능 여부는
  사전검증(`precheck`)이 따로 판정한다(초안 저장과 실행 가능 판정을 구분, AGENTS §5).
- 승인은 project admin만, 사전검증 오류가 0일 때만 한다(DEC-007 결정 2). 승인 후 내용은 DB가 동결한다.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from simulation_platform.auth.principal import Principal
from simulation_platform.domain import scenario as rules
from simulation_platform.domain.errors import (
    EditConflictError,
    ErrorDetail,
    NotFoundError,
    ScenarioCodeConflict,
    ScenarioDraftExistsError,
    ScenarioNotRunnable,
    ValidationFailed,
    VersionImmutableError,
)
from simulation_platform.domain.pagination import (
    DEFAULT_LIMIT,
    decode_cursor,
    encode_cursor,
    make_tag,
)
from simulation_platform.models import (
    Asset,
    Product,
    Scenario,
    ScenarioAsset,
    ScenarioProduct,
    ScenarioVersion,
)
from simulation_platform.models.base import new_id
from simulation_platform.repositories import catalog as catalog_repo
from simulation_platform.repositories import process as process_repo
from simulation_platform.repositories import scenarios as repo
from simulation_platform.schemas.common import Page
from simulation_platform.schemas.scenario import (
    AssetPinChangeOut,
    AssumptionUseOut,
    CompileIssueOut,
    PrecheckIssue,
    PrecheckOut,
    ProcessChangeOut,
    ProductPrecheck,
    ScenarioAssetDto,
    ScenarioCreate,
    ScenarioOut,
    ScenarioPatch,
    ScenarioProductDto,
    ScenarioRefreshIn,
    ScenarioRefreshOut,
    ScenarioVersionCreate,
    ScenarioVersionListItem,
    ScenarioVersionOut,
    ScenarioVersionPatch,
    ScenarioVersionSummary,
)
from simulation_platform.services.projects import require_admin, require_project, require_write
from simulation_platform.services.unit_of_work import audit, transaction

SCENARIO_NOT_FOUND = "시나리오를 찾을 수 없습니다."
VERSION_NOT_FOUND = "시나리오 버전을 찾을 수 없습니다."
DRAIN = {"mode": "drain"}


def _draft_exists() -> ScenarioDraftExistsError:
    return ScenarioDraftExistsError(
        "이미 초안인 시나리오 버전이 있습니다.",
        [ErrorDetail(message="시나리오당 초안은 하나뿐입니다. 그 초안을 고치거나 승인하세요.")])


def _code_conflict() -> ScenarioCodeConflict:
    return ScenarioCodeConflict("같은 프로젝트에 동일한 시나리오 코드가 이미 있습니다.",
                                [ErrorDetail(message="이미 사용 중인 코드입니다.", field_path="/code")])


def _stale(current: int) -> EditConflictError:
    return EditConflictError(
        "다른 곳에서 먼저 수정되었습니다.",
        [ErrorDetail(message=f"현재 버전은 {current}입니다.", field_path="/row_version")])


def _touch(row, principal: Principal) -> None:
    row.row_version = row.row_version + 1
    row.updated_at = func.now()
    row.updated_by = principal.user_id


def _scenario_or_404(session, project_id, scenario_id, for_update=False) -> Scenario:
    scenario = repo.get_scenario(session, project_id, scenario_id, for_update=for_update)
    if scenario is None:
        raise NotFoundError(SCENARIO_NOT_FOUND)
    return scenario


def _version_or_404(session, project_id, version_id, for_update=False) -> ScenarioVersion:
    version = repo.get_version(session, project_id, version_id, for_update=for_update)
    if version is None:
        raise NotFoundError(VERSION_NOT_FOUND)
    return version


def _scenario_out(scenario: Scenario, latest: ScenarioVersion | None) -> ScenarioOut:
    return ScenarioOut(
        id=scenario.id, project_id=scenario.project_id, code=scenario.code, name=scenario.name,
        description=scenario.description,
        latest_version=None if latest is None else ScenarioVersionSummary.model_validate(latest),
        created_at=scenario.created_at, updated_at=scenario.updated_at, row_version=scenario.row_version)


def _version_out(session: Session, version: ScenarioVersion) -> ScenarioVersionOut:
    products = [ScenarioProductDto(product_id=p.product_id, process_version_id=p.process_version_id,
                                   priority=p.priority, arrivals=p.arrivals, assumptions=p.assumptions)
                for p in repo.products_of(session, version.project_id, version.id)]
    assets = [ScenarioAssetDto(asset_id=a.asset_id, asset_revision_id=a.asset_revision_id)
              for a in repo.assets_of(session, version.project_id, version.id)]
    return ScenarioVersionOut(
        id=version.id, project_id=version.project_id, scenario_id=version.scenario_id,
        version_no=version.version_no, status=version.status, base_version_id=version.base_version_id,
        approved_at=version.approved_at, created_at=version.created_at, updated_at=version.updated_at,
        row_version=version.row_version, products=products, assets=assets,
        stopping_rule=version.stopping_rule, assumption_reason=version.assumption_reason,
        notes=version.notes, approved_by=version.approved_by)


def _reload(session: Session, project_id: uuid.UUID, version_id: uuid.UUID) -> ScenarioVersion:
    session.expire_all()
    return _version_or_404(session, project_id, version_id)


# --- 참조 검사(저장 시) ------------------------------------------------------------------------

def _check_products(session: Session, project_id: uuid.UUID, products: list[ScenarioProductDto]) -> None:
    """제품이 이 프로젝트의 것이고, 공정 버전이 그 제품의 승인됐던(동결된) 버전인지."""
    versions = repo.process_versions(session, project_id, {p.process_version_id for p in products})
    errors: list[ErrorDetail] = []
    for i, item in enumerate(products):
        if catalog_repo.get_item(session, Product, project_id, item.product_id) is None:
            errors.append(ErrorDetail(severity="error", rule_id="SCN-REF-001",
                                      field_path=f"/products/{i}/product_id", message="이 프로젝트의 제품이 아닙니다."))
            continue
        version = versions.get(item.process_version_id)
        if version is None or version.product_id != item.product_id:
            errors.append(ErrorDetail(severity="error", rule_id="SCN-REF-001",
                                      field_path=f"/products/{i}/process_version_id",
                                      message="그 제품의 공정 버전이 아닙니다."))
        elif version.status not in rules.FROZEN_PROCESS_STATUSES:
            errors.append(ErrorDetail(
                severity="error", rule_id="SCN-REF-002", field_path=f"/products/{i}/process_version_id",
                message=f"승인된 공정 버전만 시나리오에 넣을 수 있습니다(현재 {version.status})."))
    if errors:
        raise ValidationFailed("시나리오의 제품·공정 버전 참조가 올바르지 않습니다.", errors)


def _check_assets(session: Session, project_id: uuid.UUID, assets: list[ScenarioAssetDto]) -> None:
    revisions = repo.asset_revisions(session, project_id, {a.asset_revision_id for a in assets})
    errors: list[ErrorDetail] = []
    for i, item in enumerate(assets):
        revision = revisions.get(item.asset_revision_id)
        if revision is None or revision.asset_id != item.asset_id:
            errors.append(ErrorDetail(severity="error", rule_id="SCN-REF-003",
                                      field_path=f"/assets/{i}/asset_revision_id",
                                      message="이 프로젝트에서 그 자산의 자산 버전이 아닙니다."))
        elif revision.status not in rules.FROZEN_REVISION_STATUSES:
            errors.append(ErrorDetail(
                severity="error", rule_id="SCN-REF-004", field_path=f"/assets/{i}/asset_revision_id",
                message=f"승인된 자산 버전만 고정할 수 있습니다(현재 {revision.status})."))
    if errors:
        raise ValidationFailed("시나리오의 자산 버전 참조가 올바르지 않습니다.", errors)


def _write_products(session, version: ScenarioVersion, products: list[ScenarioProductDto], user_id) -> None:
    repo.replace_products(session, version.id)
    session.flush()
    for position, item in enumerate(products):
        session.add(ScenarioProduct(
            id=new_id(), project_id=version.project_id, scenario_version_id=version.id,
            product_id=item.product_id, process_version_id=item.process_version_id, position=position,
            priority=item.priority, arrivals=[a.model_dump(mode="json") for a in item.arrivals],
            assumptions=item.assumptions.model_dump(mode="json"), created_by=user_id))
    session.flush()


def _write_assets(session, version: ScenarioVersion, assets: list[tuple[uuid.UUID, uuid.UUID]], user_id) -> None:
    repo.replace_assets(session, version.id)
    session.flush()
    for asset_id, revision_id in assets:
        session.add(ScenarioAsset(id=new_id(), project_id=version.project_id, scenario_version_id=version.id,
                                  asset_id=asset_id, asset_revision_id=revision_id, created_by=user_id))
    session.flush()


def _new_version(session, scenario: Scenario, base: ScenarioVersion | None, user_id) -> ScenarioVersion:
    version = ScenarioVersion(
        id=new_id(), project_id=scenario.project_id, scenario_id=scenario.id,
        version_no=repo.next_version_no(session, scenario.id), status="draft",
        base_version_id=None if base is None else base.id,
        stopping_rule=dict(DRAIN) if base is None else base.stopping_rule,
        assumption_reason=None if base is None else base.assumption_reason,
        notes=None if base is None else base.notes, created_by=user_id)
    session.add(version)
    session.flush()
    if base is not None:
        for p in repo.products_of(session, scenario.project_id, base.id):
            session.add(ScenarioProduct(
                id=new_id(), project_id=scenario.project_id, scenario_version_id=version.id,
                product_id=p.product_id, process_version_id=p.process_version_id, position=p.position,
                priority=p.priority, arrivals=p.arrivals, assumptions=p.assumptions, created_by=user_id))
        _write_assets(session, version, [(a.asset_id, a.asset_revision_id)
                                         for a in repo.assets_of(session, scenario.project_id, base.id)], user_id)
    session.flush()
    return version


# --- 시나리오 ----------------------------------------------------------------------------------

def list_scenarios(session: Session, principal: Principal, project_id: uuid.UUID, *, limit: int | None,
                   cursor: str | None) -> tuple[list[ScenarioOut], Page]:
    require_project(session, principal, project_id)
    limit = limit or DEFAULT_LIMIT
    tag = make_tag("scenarios", ("code", False), {})
    values = decode_cursor(cursor, tag, 1) if cursor else None
    rows = repo.list_scenarios(session, project_id, limit=limit, cursor_values=values)
    page_rows = rows[:limit]
    latest = repo.latest_versions(session, project_id, [s.id for s in page_rows])
    next_cursor = encode_cursor(tag, [page_rows[-1].code]) if len(rows) > limit else None
    return ([_scenario_out(s, latest.get(s.id)) for s in page_rows], Page(limit=limit, next_cursor=next_cursor))


def create_scenario(session: Session, principal: Principal, project_id: uuid.UUID, body: ScenarioCreate,
                    request_id: str | None) -> ScenarioOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    scenario = Scenario(id=new_id(), project_id=project_id, code=body.code, name=body.name,
                        description=body.description, created_by=principal.user_id)
    with transaction(session, {"uq_scenario_project_code": _code_conflict}):
        session.add(scenario)
        session.flush()
        version = _new_version(session, scenario, None, principal.user_id)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="scenario.create", entity_type="scenario",
              entity_id=scenario.id, before=None,
              after={"code": body.code, "name": body.name, "first_version_id": str(version.id)},
              request_id=request_id)
    session.expire_all()
    scenario = _scenario_or_404(session, project_id, scenario.id)
    return _scenario_out(scenario, repo.latest_versions(session, project_id, [scenario.id]).get(scenario.id))


def get_scenario(session: Session, principal: Principal, project_id: uuid.UUID,
                 scenario_id: uuid.UUID) -> ScenarioOut:
    require_project(session, principal, project_id)
    scenario = _scenario_or_404(session, project_id, scenario_id)
    return _scenario_out(scenario, repo.latest_versions(session, project_id, [scenario.id]).get(scenario.id))


def patch_scenario(session: Session, principal: Principal, project_id: uuid.UUID, scenario_id: uuid.UUID,
                   expected: int, body: ScenarioPatch, request_id: str | None) -> ScenarioOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    scenario = _scenario_or_404(session, project_id, scenario_id, for_update=True)
    if scenario.row_version != expected:
        raise _stale(scenario.row_version)
    before, after = {}, {}
    with transaction(session, {}):
        for name in body.model_fields_set:
            before[name], after[name] = getattr(scenario, name), getattr(body, name)
            setattr(scenario, name, after[name])
        _touch(scenario, principal)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="scenario.update", entity_type="scenario",
              entity_id=scenario.id, before=before, after=after, request_id=request_id)
    return get_scenario(session, principal, project_id, scenario_id)


# --- 시나리오 버전 ------------------------------------------------------------------------------

def list_versions(session: Session, principal: Principal, project_id: uuid.UUID, scenario_id: uuid.UUID, *,
                  limit: int | None, cursor: str | None) -> tuple[list[ScenarioVersionListItem], Page]:
    require_project(session, principal, project_id)
    _scenario_or_404(session, project_id, scenario_id)
    limit = limit or DEFAULT_LIMIT
    tag = make_tag("scenario-versions", ("version_no", True), {"scenario": str(scenario_id)})
    values = decode_cursor(cursor, tag, 1) if cursor else None
    rows = repo.list_versions(session, project_id, scenario_id, limit=limit, cursor_values=values)
    page_rows = rows[:limit]
    next_cursor = encode_cursor(tag, [page_rows[-1].version_no]) if len(rows) > limit else None
    return ([ScenarioVersionListItem.model_validate(r) for r in page_rows],
            Page(limit=limit, next_cursor=next_cursor))


def create_version(session: Session, principal: Principal, project_id: uuid.UUID, scenario_id: uuid.UUID,
                   body: ScenarioVersionCreate | None, request_id: str | None) -> ScenarioVersionOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    scenario = _scenario_or_404(session, project_id, scenario_id, for_update=True)
    if repo.find_draft(session, project_id, scenario_id) is not None:
        raise _draft_exists()
    requested = None if body is None else body.from_version_id
    if requested is None:
        base = repo.latest_approved(session, project_id, scenario_id)
    else:
        base = repo.get_version(session, project_id, requested)
        if base is None or base.scenario_id != scenario_id:
            raise NotFoundError(VERSION_NOT_FOUND)
    with transaction(session, {"uq_scenario_version_one_draft": _draft_exists}):
        version = _new_version(session, scenario, base, principal.user_id)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="scenario_version.create", entity_type="scenario_version",
              entity_id=version.id, before=None,
              after={"scenario_id": str(scenario_id), "version_no": version.version_no,
                     "copied_from": None if base is None else str(base.id)}, request_id=request_id)
    return _version_out(session, _reload(session, project_id, version.id))


def get_version(session: Session, principal: Principal, project_id: uuid.UUID,
                version_id: uuid.UUID) -> ScenarioVersionOut:
    require_project(session, principal, project_id)
    return _version_out(session, _reload(session, project_id, version_id))


def patch_version(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID,
                  expected: int, body: ScenarioVersionPatch, request_id: str | None) -> ScenarioVersionOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    version = _version_or_404(session, project_id, version_id, for_update=True)
    if version.status != "draft":
        raise VersionImmutableError("초안이 아닌 시나리오 버전은 수정할 수 없습니다.", [ErrorDetail(
            message=f"현재 상태는 {version.status}입니다. 새 초안을 만드세요.", field_path="/status")])
    if version.row_version != expected:
        raise _stale(version.row_version)
    fields = body.model_fields_set
    if "products" in fields:
        _check_products(session, project_id, body.products)
    if "assets" in fields:
        _check_assets(session, project_id, body.assets)
    changed: list[str] = sorted(fields)
    with transaction(session, {}):
        if "products" in fields:
            _write_products(session, version, body.products, principal.user_id)
        if "assets" in fields:
            _write_assets(session, version, [(a.asset_id, a.asset_revision_id) for a in body.assets],
                          principal.user_id)
        elif "products" in fields:  # 공정이 쓰는 자산 중 아직 고정하지 않은 것을 현재 승인 버전으로 채운다
            pinned = {a.asset_id: a.asset_revision_id for a in repo.assets_of(session, project_id, version.id)}
            used = repo.assets_used_by(session, project_id, {p.process_version_id for p in body.products})
            for asset_id, revision in repo.approved_revisions(session, project_id, used - set(pinned)).items():
                pinned[asset_id] = revision.id
            _write_assets(session, version, sorted(pinned.items()), principal.user_id)
            changed.append("assets(auto)")
        if "stopping_rule" in fields:
            version.stopping_rule = body.stopping_rule.model_dump(mode="json")
        if "assumption_reason" in fields:
            version.assumption_reason = body.assumption_reason
        if "notes" in fields:
            version.notes = body.notes
        _touch(version, principal)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="scenario_version.update", entity_type="scenario_version",
              entity_id=version.id, before=None, after={"fields": changed}, request_id=request_id)
    return _version_out(session, _reload(session, project_id, version.id))


# --- 사전검증·승인 --------------------------------------------------------------------------------

def collect_inputs(session: Session, version: ScenarioVersion) -> tuple[list[rules.ProductInput], dict[str, dict]]:
    """시나리오 버전이 고른 공정 버전·그래프·고정한 자산 버전을 엔진 입력 모양으로 읽는다(사전검증·실행 요청이 같이 쓴다)."""
    project_id = version.project_id
    rows = repo.products_of(session, project_id, version.id)
    versions = repo.process_versions(session, project_id, {p.process_version_id for p in rows})
    inputs = []
    names = {p.id: p for p in session.scalars(select(Product).where(
        Product.project_id == project_id, Product.id.in_({r.product_id for r in rows})))}
    for row in rows:
        pv = versions[row.process_version_id]
        nodes, edges = process_repo.load_graph(session, project_id, pv.id)
        inputs.append(rules.ProductInput(
            product_id=str(row.product_id),
            version={"id": str(pv.id), "project_id": str(pv.project_id), "status": pv.status,
                     "schema_version": pv.schema_version, "raw_unit_spec": pv.raw_unit_spec,
                     "finished_unit_spec": pv.finished_unit_spec},
            graph={"nodes": nodes, "edges": edges,
                   "completion_node_id": None if pv.completion_node_id is None else str(pv.completion_node_id)},
            arrivals=row.arrivals, assumptions=row.assumptions,
            product={"code": names[row.product_id].code, "name": names[row.product_id].name}))
    pinned = repo.assets_of(session, project_id, version.id)
    revisions = repo.asset_revisions(session, project_id, {a.asset_revision_id for a in pinned})
    engine_assets = repo.revision_engine_data(session, project_id, [revisions[a.asset_revision_id] for a in pinned])
    return inputs, engine_assets


def _run_precheck(session: Session, version: ScenarioVersion) -> rules.PrecheckResult:
    inputs, engine_assets = collect_inputs(session, version)
    return rules.precheck(inputs, engine_assets, version.assumption_reason)


def _precheck_out(version: ScenarioVersion, result: rules.PrecheckResult) -> PrecheckOut:
    return PrecheckOut(
        scenario_version_id=version.id, runnable=result.runnable, error_count=result.error_count,
        warning_count=result.warning_count, engine_version=result.engine_version,
        issues=[PrecheckIssue(severity=i.severity, rule_id=i.rule_id, field_path=i.field_path, message=i.message)
                for i in result.issues],
        products=[ProductPrecheck(
            product_id=p.product_id, process_version_id=p.process_version_id, compiled=p.compiled,
            compile_issues=[CompileIssueOut(**i) for i in p.compile_issues],
            assumptions_used=[AssumptionUseOut(**a) for a in p.assumptions_used],
            waived=[CompileIssueOut(**i) for i in p.waived]) for p in result.products])


def precheck(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID) -> PrecheckOut:
    require_project(session, principal, project_id)
    version = _reload(session, project_id, version_id)
    return _precheck_out(version, _run_precheck(session, version))


def approve_version(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID,
                    expected: int, request_id: str | None) -> ScenarioVersionOut:
    access = require_project(session, principal, project_id)
    require_admin(access, "시나리오 버전의 승인은 project admin만 할 수 있습니다.")
    version = _version_or_404(session, project_id, version_id, for_update=True)
    if version.status != "draft":
        raise VersionImmutableError("이미 승인된 시나리오 버전입니다.", [ErrorDetail(
            message=f"현재 상태는 {version.status}입니다.", field_path="/status")])
    if version.row_version != expected:
        raise _stale(version.row_version)
    result = _run_precheck(session, version)
    if not result.runnable:
        details = [ErrorDetail(severity=i.severity, rule_id=i.rule_id, field_path=i.field_path, message=i.message)
                   for i in result.issues if i.severity == "error"]
        for index, product in enumerate(result.products):
            details.extend(ErrorDetail(severity="error", rule_id=i["rule_id"],
                                       field_path=f"/products/{index}", message=i["message"])
                           for i in product.compile_issues)
        raise ScenarioNotRunnable("실행 사전검증 오류가 있어 승인할 수 없습니다.", details)
    with transaction(session, {}):
        version.status = "approved"
        version.approved_at, version.approved_by = func.now(), principal.user_id
        _touch(version, principal)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="scenario_version.approve", entity_type="scenario_version",
              entity_id=version.id, before={"status": "draft"},
              after={"status": "approved", "version_no": version.version_no}, request_id=request_id)
    return _version_out(session, _reload(session, project_id, version.id))


# --- 최신 승인 공정으로 갱신(CR be14) ------------------------------------------------------------------------

def refresh_version(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID,
                    expected: int, body: ScenarioRefreshIn | None, request_id: str | None) -> ScenarioRefreshOut:
    """초안의 제품별 공정 버전을 그 제품의 현재 승인본으로 바꾸고 자산 고정을 맞춘다. 도착·가정·순서는 그대로."""
    body = body or ScenarioRefreshIn()
    access = require_project(session, principal, project_id)
    require_write(access)
    version = _version_or_404(session, project_id, version_id, for_update=True)
    if version.status != "draft":
        raise VersionImmutableError("초안이 아닌 시나리오 버전은 갱신할 수 없습니다.", [ErrorDetail(
            message=f"현재 상태는 {version.status}입니다. 새 초안을 만든 뒤 갱신하세요.", field_path="/status")])
    if version.row_version != expected:
        raise _stale(version.row_version)
    rows = repo.products_of(session, project_id, version.id)
    wanted = None if body.product_ids is None else set(body.product_ids)
    summaries = process_repo.summaries_for_products(session, project_id, [r.product_id for r in rows])
    before_versions = repo.process_versions(session, project_id, {r.process_version_id for r in rows})
    codes = {p.id: p.code for p in session.scalars(select(Product).where(
        Product.project_id == project_id, Product.id.in_({r.product_id for r in rows})))}
    process_changes = []
    for row in rows:
        current = summaries[row.product_id][1]
        before = before_versions.get(row.process_version_id)
        if wanted is not None and row.product_id not in wanted:
            status, target = "not_requested", before
        elif current is None:
            status, target = "no_approved_version", before
        elif current.id == row.process_version_id:
            status, target = "unchanged", current
        else:
            status, target = "changed", current
        process_changes.append(ProcessChangeOut(
            product_id=row.product_id, product_code=codes.get(row.product_id),
            from_process_version_id=row.process_version_id, from_version_no=None if before is None else before.version_no,
            to_process_version_id=target.id if target is not None else row.process_version_id,
            to_version_no=None if target is None else target.version_no, status=status))
    pinned = {a.asset_id: a.asset_revision_id for a in repo.assets_of(session, project_id, version.id)}
    new_versions = {c.to_process_version_id for c in process_changes}
    used = repo.assets_used_by(session, project_id, new_versions)
    if body.assets == "latest":
        target_pins = {a: r.id for a, r in repo.approved_revisions(session, project_id, used).items()}
    else:
        target_pins = dict(pinned)
        target_pins.update({a: r.id for a, r in repo.approved_revisions(session, project_id, used - set(pinned)).items()})
    asset_codes = {a.id: a.code for a in session.scalars(select(Asset).where(
        Asset.project_id == project_id, Asset.id.in_(set(pinned) | set(target_pins))))} if pinned or target_pins else {}
    asset_changes = []
    for asset in sorted(set(pinned) | set(target_pins), key=lambda a: (asset_codes.get(a) or "", str(a))):
        old, new = pinned.get(asset), target_pins.get(asset)
        if old == new:
            continue
        change = "pinned" if old is None else "removed" if new is None else "updated"
        asset_changes.append(AssetPinChangeOut(asset_id=asset, asset_code=asset_codes.get(asset),
                                               from_revision_id=old, to_revision_id=new, change=change))
    with transaction(session, {}):
        for row, item in zip(rows, process_changes, strict=True):
            if item.status == "changed":
                row.process_version_id = item.to_process_version_id
        if asset_changes:
            _write_assets(session, version, sorted(target_pins.items()), principal.user_id)
        _touch(version, principal)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="scenario_version.refresh", entity_type="scenario_version",
              entity_id=version.id, before=None,
              after={"processes": [{"product_id": str(c.product_id), "from": str(c.from_process_version_id),
                                    "to": str(c.to_process_version_id), "status": c.status} for c in process_changes],
                     "assets": [{"asset_id": str(c.asset_id), "change": c.change} for c in asset_changes],
                     "mode": body.assets}, request_id=request_id)
    return ScenarioRefreshOut(version=_version_out(session, _reload(session, project_id, version.id)),
                              process_changes=process_changes, asset_changes=asset_changes)
