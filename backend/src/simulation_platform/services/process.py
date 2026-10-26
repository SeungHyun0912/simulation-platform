"""공정 버전·그래프 서비스. 기준: CR-backend-20261023-be04-process-versions (BE-04a)."""

import uuid
from dataclasses import asdict

from sqlalchemy import func
from sqlalchemy.orm import Session

from simulation_platform.auth.principal import Principal
from simulation_platform.domain import process as rules
from simulation_platform.domain.errors import (
    EditConflictError,
    ErrorDetail,
    NotFoundError,
    ProcessDraftExistsError,
    ProcessValidationFailed,
    ValidationFailed,
    VersionImmutableError,
)
from simulation_platform.domain.pagination import (
    DEFAULT_LIMIT,
    decode_cursor,
    encode_cursor,
    make_tag,
)
from simulation_platform.domain.process_diff import diff_versions
from simulation_platform.domain.revisions import ensure_transition
from simulation_platform.models import (
    FlowEdge,
    FlowNode,
    ProcessEditorState,
    ProcessStep,
    ProcessVersion,
    Product,
    RequirementCandidate,
    ResourceRequirement,
    StepMaterialSpec,
)
from simulation_platform.models.base import new_id
from simulation_platform.repositories import catalog as catalog_repo
from simulation_platform.repositories import process as repo
from simulation_platform.schemas.catalog import DefaultSpec
from simulation_platform.schemas.common import Page
from simulation_platform.schemas.process import (
    EditorStateIn,
    EditorStateOut,
    GraphIn,
    GraphOut,
    IssueDto,
    MaterialSpecDto,
    ProcessVersionCreate,
    ProcessVersionListItem,
    ProcessVersionOut,
    ProcessVersionPatch,
    RequirementDto,
    StepDto,
    StepOut,
    StepPatch,
    ValidationOut,
    VersionDiffOut,
)
from simulation_platform.services.projects import require_admin, require_project, require_write
from simulation_platform.services.unit_of_work import audit, transaction

PRODUCT_NOT_FOUND = "제품을 찾을 수 없습니다."
VERSION_NOT_FOUND = "공정 버전을 찾을 수 없습니다."
STEP_NOT_FOUND = "단계를 찾을 수 없습니다."


def _draft_exists() -> ProcessDraftExistsError:
    return ProcessDraftExistsError(
        "이미 진행 중인 공정 버전이 있습니다.",
        [ErrorDetail(message="초안 또는 검토 중인 버전이 제품당 하나만 있을 수 있습니다. "
                             "그 버전을 먼저 승인하거나 반려하세요.")])


def _stale(current: int) -> EditConflictError:
    return EditConflictError(
        "다른 곳에서 먼저 수정되었습니다.",
        [ErrorDetail(message=f"현재 버전은 {current}입니다.", field_path="/row_version")])


def _immutable(status: str) -> VersionImmutableError:
    return VersionImmutableError(
        "초안이 아닌 공정 버전은 수정할 수 없습니다.",
        [ErrorDetail(message=f"현재 상태는 {status}입니다. 승인본을 고치려면 새 초안을 만드세요.",
                     field_path="/status")])


def _touch(row, principal: Principal) -> None:
    row.row_version = row.row_version + 1
    row.updated_at = func.now()
    row.updated_by = principal.user_id


def _issue_dtos(issues) -> list[IssueDto]:
    return [IssueDto(**asdict(i)) for i in issues]


def _lock(session: Session, project_id: uuid.UUID, version_id: uuid.UUID) -> ProcessVersion:
    version = repo.get_version(session, project_id, version_id, for_update=True)
    if version is None:
        raise NotFoundError(VERSION_NOT_FOUND)
    return version


def _editable(version: ProcessVersion, expected: int) -> None:
    """초안이고 If-Match 버전이 일치해야 수정할 수 있다(상태 → 버전 순으로 검사)."""
    if version.status != rules.DRAFT:
        raise _immutable(version.status)
    if version.row_version != expected:
        raise _stale(version.row_version)


def _version_out(session: Session, version: ProcessVersion) -> ProcessVersionOut:
    nodes, edges = repo.load_graph(session, version.project_id, version.id)
    issues = rules.graph_issues(version.id, version.raw_unit_spec, version.finished_unit_spec,
                                nodes, edges, version.completion_node_id)
    return ProcessVersionOut(
        id=version.id, project_id=version.project_id, product_id=version.product_id,
        version_no=version.version_no, status=version.status, base_version_id=version.base_version_id,
        submitted_at=version.submitted_at, approved_at=version.approved_at,
        created_at=version.created_at, updated_at=version.updated_at,
        row_version=version.row_version, schema_version=version.schema_version,
        raw_unit_spec=version.raw_unit_spec, finished_unit_spec=version.finished_unit_spec,
        notes=version.notes, completion_node_id=version.completion_node_id,
        issues=_issue_dtos(issues), submitted_by=version.submitted_by,
        rejection_reason=version.rejection_reason, rejected_at=version.rejected_at,
        approved_by=version.approved_by)


def _reload(session: Session, project_id: uuid.UUID, version_id: uuid.UUID) -> ProcessVersion:
    session.expire_all()
    version = repo.get_version(session, project_id, version_id)
    if version is None:
        raise NotFoundError(VERSION_NOT_FOUND)
    return version


def _graph_out(session: Session, version: ProcessVersion) -> GraphOut:
    nodes, edges = repo.load_graph(session, version.project_id, version.id)
    issues = rules.graph_issues(version.id, version.raw_unit_spec, version.finished_unit_spec,
                                nodes, edges, version.completion_node_id)
    return GraphOut(process_version_id=version.id, row_version=version.row_version,
                    nodes=nodes, edges=edges, completion_node_id=version.completion_node_id,
                    issues=_issue_dtos(issues))


# --- 그래프 저장 --------------------------------------------------------------------------

def _graph_dicts(graph: GraphIn) -> tuple[list[dict], list[dict]]:
    return ([n.model_dump(mode="json") for n in graph.nodes],
            [e.model_dump(mode="json") for e in graph.edges])


def _check_structure(nodes: list[dict], edges: list[dict], completion_node_id=None) -> None:
    errors = rules.structure_errors(nodes, edges, completion_node_id)
    if errors:
        raise ValidationFailed("그래프 구조가 올바르지 않습니다.", [
            ErrorDetail(severity="error", rule_id=rule, field_path=path, message=message)
            for path, rule, message in errors])


def _check_assets(session: Session, project_id: uuid.UUID,
                  refs: list[tuple[str, uuid.UUID, tuple[str, ...]]]) -> dict[uuid.UUID, str]:
    """참조한 자산이 이 프로젝트의 것이고 허용된 종류인지 확인한다. (경로, 자산 id, 허용 종류) 목록."""
    kinds = repo.asset_kinds(session, project_id, {asset_id for _, asset_id, _ in refs})
    errors = []
    for path, asset_id, allowed in refs:
        kind = kinds.get(asset_id)
        if kind is None:
            errors.append(ErrorDetail(severity="error", rule_id="VAL-REF-001", field_path=path,
                                      message="이 프로젝트의 자산이 아닙니다."))
        elif kind not in allowed:
            errors.append(ErrorDetail(
                severity="error", rule_id="VAL-REF-002", field_path=path,
                message=f"{'·'.join(allowed)} 자산이어야 합니다(현재 {kind})."))
    if errors:
        raise ValidationFailed("참조한 자산이 올바르지 않습니다.", errors)
    return kinds


def _check_materials(session: Session, project_id: uuid.UUID,
                     refs: list[tuple[str, uuid.UUID | None]]) -> None:
    """spec이 참조한 재료가 이 프로젝트의 것인지 확인한다. (경로, 재료 id) 목록."""
    wanted = {i for _, i in refs if i is not None}
    found = repo.material_ids(session, project_id, wanted)
    errors = [ErrorDetail(severity="error", rule_id="VAL-REF-006", field_path=path,
                          message="이 프로젝트의 재료가 아닙니다.")
              for path, i in refs if i is not None and i not in found]
    if errors:
        raise ValidationFailed("참조한 재료가 올바르지 않습니다.", errors)


def _graph_material_refs(graph: GraphIn):
    return [(f"/nodes/{i}/step/material_specs/{j}/material_definition_id", m.material_definition_id)
            for i, node in enumerate(graph.nodes) if node.step
            for j, m in enumerate(node.step.material_specs)]


def _spec_quantity(spec: MaterialSpecDto) -> dict:
    return {name: getattr(spec, name).model_dump(mode="json")
            for name in ("length_m", "weight_kg", "unit_count", "strand_count")}


def _fill_spec(row: StepMaterialSpec, spec: MaterialSpecDto) -> None:
    row.direction, row.material_definition_id = spec.direction, spec.material_definition_id
    row.state_code, row.form = spec.state_code, spec.form
    row.quantity, row.quantity_basis = _spec_quantity(spec), spec.quantity_basis


def _add_specs(session: Session, version: ProcessVersion, node_id: uuid.UUID,
               specs: list[MaterialSpecDto], user_id: uuid.UUID) -> dict[str, uuid.UUID]:
    ids: dict[str, uuid.UUID] = {}
    for spec in specs:
        row = StepMaterialSpec(id=new_id(), project_id=version.project_id,
                               process_version_id=version.id, step_node_id=node_id,
                               spec_key=spec.spec_key, created_by=user_id)
        _fill_spec(row, spec)
        session.add(row)
        ids[spec.spec_key] = row.id
    session.flush()
    return ids


def _graph_asset_refs(graph: GraphIn):
    refs: list[tuple[str, uuid.UUID, tuple[str, ...]]] = []
    for i, node in enumerate(graph.nodes):
        if node.asset_id is not None:
            refs.append((f"/nodes/{i}/asset_id", node.asset_id, ("storage", "dock")))
        for j, req in enumerate(node.step.resources if node.step else []):
            for k, cand in enumerate(req.candidates):
                refs.append((f"/nodes/{i}/step/resources/{j}/candidates/{k}/asset_id",
                             cand.asset_id, ("equipment",)))
    return refs


def _rules(step: StepDto) -> dict:
    return {name: getattr(step, name).model_dump(mode="json")
            for name in ("timing_rule", "input_rule", "output_rule", "handoff_rule",
                         "residual_rule")}


def _add_requirements(session: Session, version: ProcessVersion, node_id: uuid.UUID,
                      resources: list[RequirementDto], user_id: uuid.UUID) -> None:
    for req in resources:
        requirement = ResourceRequirement(
            id=new_id(), project_id=version.project_id, process_version_id=version.id,
            step_node_id=node_id, role_key=req.role_key, resource_kind=req.resource_kind,
            selection_mode=req.selection_mode, required_count=req.required_count,
            capacity_mode=req.capacity_mode,
            allocation_rule=req.allocation_rule.model_dump(mode="json"), created_by=user_id)
        session.add(requirement)
        session.flush()
        for cand in req.candidates:
            session.add(RequirementCandidate(
                id=new_id(), project_id=version.project_id, process_version_id=version.id,
                requirement_id=requirement.id, asset_id=cand.asset_id, asset_kind="equipment",
                eligibility_status=cand.eligibility_status, created_by=user_id))
    session.flush()


def _insert_graph(session: Session, version: ProcessVersion, graph: GraphIn,
                  kinds: dict[uuid.UUID, str], user_id: uuid.UUID) -> None:
    for node in graph.nodes:
        session.add(FlowNode(
            id=node.id, project_id=version.project_id, process_version_id=version.id,
            node_key=node.node_key, kind=node.kind, label=node.label, asset_id=node.asset_id,
            asset_kind=None if node.asset_id is None else kinds[node.asset_id],
            display_order=node.display_order, created_by=user_id))
    session.flush()
    for node in graph.nodes:
        if node.step is None:
            continue
        session.add(ProcessStep(
            node_id=node.id, project_id=version.project_id, process_version_id=version.id,
            node_kind="operation", operation_type=node.step.operation_type,
            handler_version=node.step.handler_version, created_by=user_id, **_rules(node.step)))
    session.flush()
    spec_ids: dict[uuid.UUID, dict[str, uuid.UUID]] = {}
    for node in graph.nodes:
        if node.step is not None:
            _add_requirements(session, version, node.id, node.step.resources, user_id)
            spec_ids[node.id] = _add_specs(session, version, node.id, node.step.material_specs,
                                           user_id)
    for edge in graph.edges:
        source, target = edge.source_output_spec_key, edge.target_input_spec_key
        session.add(FlowEdge(
            id=edge.id, project_id=version.project_id, process_version_id=version.id,
            edge_key=edge.edge_key, from_node_id=edge.from_node_id, to_node_id=edge.to_node_id,
            edge_kind=edge.edge_kind, movement_rule=edge.movement_rule.model_dump(mode="json"),
            source_output_spec_id=None if source is None else spec_ids[edge.from_node_id][source],
            target_input_spec_id=None if target is None else spec_ids[edge.to_node_id][target],
            created_by=user_id))
    session.flush()
    version.completion_node_id = graph.completion_node_id
    session.flush()


def _id_conflict() -> ValidationFailed:
    return ValidationFailed("이미 다른 공정 버전에서 쓰는 id가 있습니다.", [ErrorDetail(
        severity="error", rule_id="VAL-REF-003", field_path="/nodes",
        message="노드·간선 id는 새로 생성한 UUID여야 하며 다른 버전의 id와 겹칠 수 없습니다.")])


# 다른 버전이 이미 쓰는 노드·간선 id를 보내면 PK가 충돌한다. 제약 이름은 migration이 만든 pk_<table>이다.
ID_CONFLICTS = {"pk_flow_node": _id_conflict, "pk_flow_edge": _id_conflict}


def _copy_editor_state(session: Session, base: ProcessVersion, version: ProcessVersion,
                       node_ids: dict[str, str], principal: Principal) -> None:
    """기준 버전의 화면 좌표를 새 노드 id로 옮겨 복사한다(없는 노드의 좌표는 버린다)."""
    state = repo.get_editor_state(session, base.project_id, base.id)
    if state is None:
        return
    positions = {node_ids[k]: v for k, v in state.node_positions.items() if k in node_ids}
    session.add(ProcessEditorState(
        id=new_id(), project_id=version.project_id, process_version_id=version.id, user_id=None,
        node_positions=positions, viewport=state.viewport, created_by=principal.user_id))
    session.flush()


# --- 공개 함수 ---------------------------------------------------------------------------

def list_versions(session: Session, principal: Principal, project_id: uuid.UUID,
                  product_id: uuid.UUID, *, limit: int | None,
                  cursor: str | None) -> tuple[list[ProcessVersionListItem], Page]:
    require_project(session, principal, project_id)
    if catalog_repo.get_item(session, Product, project_id, product_id) is None:
        raise NotFoundError(PRODUCT_NOT_FOUND)
    limit = limit or DEFAULT_LIMIT
    tag = make_tag("process-versions", ("version_no", True), {"product": str(product_id)})
    values = decode_cursor(cursor, tag, 1) if cursor else None
    rows = repo.list_versions(session, project_id, product_id, limit=limit, cursor_values=values)
    page_rows = rows[:limit]
    next_cursor = encode_cursor(tag, [page_rows[-1].version_no]) if len(rows) > limit else None
    return ([ProcessVersionListItem.model_validate(r) for r in page_rows],
            Page(limit=limit, next_cursor=next_cursor))


def create_version(session: Session, principal: Principal, project_id: uuid.UUID,
                   product_id: uuid.UUID, body: ProcessVersionCreate | None,
                   request_id: str | None) -> ProcessVersionOut:
    """새 초안. 기준 버전(`base_version_id`, 같은 제품의 모든 상태)이나 승인본의 내용(그래프 포함)을
    새 id로 복사하고, 둘 다 없으면 빈 그래프·미정 단위로 시작한다. 승인·제출 기록은 복사하지 않는다."""
    access = require_project(session, principal, project_id)
    require_write(access)
    product = catalog_repo.get_item(session, Product, project_id, product_id, for_update=True)
    if product is None:
        raise NotFoundError(PRODUCT_NOT_FOUND)
    if repo.find_open(session, project_id, product_id) is not None:
        raise _draft_exists()

    requested = None if body is None else body.base_version_id
    if requested is None:
        base = repo.find_approved(session, project_id, product_id)
    else:
        base = repo.get_version(session, project_id, requested)
        if base is None or base.product_id != product_id:
            raise NotFoundError(VERSION_NOT_FOUND)
    empty = DefaultSpec().model_dump(mode="json")
    version = ProcessVersion(
        id=new_id(), project_id=project_id, product_id=product_id,
        version_no=repo.next_version_no(session, product_id), status=rules.DRAFT,
        base_version_id=None if base is None else base.id,
        raw_unit_spec=empty if base is None else base.raw_unit_spec,
        finished_unit_spec=empty if base is None else base.finished_unit_spec,
        notes=None if base is None else base.notes, created_by=principal.user_id)
    graph = None
    node_ids: dict[str, str] = {}
    kinds: dict[uuid.UUID, str] = {}
    if base is not None:
        nodes, edges = repo.load_graph(session, project_id, base.id)
        node_ids.update({n["id"]: str(new_id()) for n in nodes})
        graph = GraphIn.model_validate({
            "completion_node_id": (None if base.completion_node_id is None
                                   else node_ids[str(base.completion_node_id)]),
            "nodes": [{**n, "id": node_ids[n["id"]]} for n in nodes],
            "edges": [{**e, "id": str(new_id()), "from_node_id": node_ids[e["from_node_id"]],
                       "to_node_id": node_ids[e["to_node_id"]]} for e in edges]})
        kinds = _check_assets(session, project_id, _graph_asset_refs(graph))
        _check_materials(session, project_id, _graph_material_refs(graph))
    with transaction(session, {"uq_process_version_one_open": _draft_exists}):
        session.add(version)
        session.flush()
        if graph is not None:
            _insert_graph(session, version, graph, kinds, principal.user_id)
            _copy_editor_state(session, base, version, node_ids, principal)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="process_version.create",
              entity_type="process_version", entity_id=version.id, before=None,
              after={"product_id": str(product_id), "version_no": version.version_no,
                     "copied_from": None if base is None else str(base.id)},
              request_id=request_id)
    return _version_out(session, _reload(session, project_id, version.id))


def get_version(session: Session, principal: Principal, project_id: uuid.UUID,
                version_id: uuid.UUID) -> ProcessVersionOut:
    require_project(session, principal, project_id)
    return _version_out(session, _reload(session, project_id, version_id))


def patch_version(session: Session, principal: Principal, project_id: uuid.UUID,
                  version_id: uuid.UUID, expected: int, body: ProcessVersionPatch,
                  request_id: str | None) -> ProcessVersionOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    version = _lock(session, project_id, version_id)
    _editable(version, expected)
    before: dict = {}
    after: dict = {}
    with transaction(session, {}):
        for name in ("raw_unit_spec", "finished_unit_spec"):
            if name in body.model_fields_set:
                patch = getattr(body, name)
                before[name] = getattr(version, name)
                merged = {**before[name], **{k: getattr(patch, k).model_dump(mode="json")
                                             for k in patch.model_fields_set}}
                after[name] = merged
                setattr(version, name, merged)
        if "notes" in body.model_fields_set:
            before["notes"], after["notes"] = version.notes, body.notes
            version.notes = body.notes
        _touch(version, principal)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="process_version.update",
              entity_type="process_version", entity_id=version.id, before=before, after=after,
              request_id=request_id)
    return _version_out(session, _reload(session, project_id, version.id))


def get_graph(session: Session, principal: Principal, project_id: uuid.UUID,
              version_id: uuid.UUID) -> GraphOut:
    require_project(session, principal, project_id)
    return _graph_out(session, _reload(session, project_id, version_id))


def put_graph(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID,
              expected: int, graph: GraphIn, request_id: str | None) -> GraphOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    version = _lock(session, project_id, version_id)
    _editable(version, expected)
    nodes, edges = _graph_dicts(graph)
    _check_structure(nodes, edges, graph.completion_node_id)
    kinds = _check_assets(session, project_id, _graph_asset_refs(graph))
    _check_materials(session, project_id, _graph_material_refs(graph))
    with transaction(session, ID_CONFLICTS):
        version.completion_node_id = None  # 노드를 지우기 전에 완제품 지정을 먼저 푼다(FK)
        session.flush()
        repo.delete_graph(session, version.id)
        _insert_graph(session, version, graph, kinds, principal.user_id)
        _touch(version, principal)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="process_version.graph",
              entity_type="process_version", entity_id=version.id, before=None,
              after={"nodes": len(graph.nodes), "edges": len(graph.edges),
                     "completion_node_id": (None if graph.completion_node_id is None
                                            else str(graph.completion_node_id))},
              request_id=request_id)
    return _graph_out(session, _reload(session, project_id, version.id))


def _check_spec_replacement(session: Session, version: ProcessVersion, node_id: uuid.UUID,
                            specs: list[MaterialSpecDto]) -> None:
    """간선이 연결한 spec은 지우거나 방향을 바꿀 수 없다(그래프 PUT으로 간선 연결을 먼저 풀어야 한다)."""
    referenced = repo.referenced_spec_ids(session, version.id)
    wanted = {m.spec_key: m for m in specs}
    errors = []
    for row in repo.step_specs(session, version.id, node_id):
        if row.id not in referenced:
            continue
        new = wanted.get(row.spec_key)
        if new is None:
            errors.append(f"간선이 연결한 spec '{row.spec_key}'은(는) 제거할 수 없습니다.")
        elif new.direction != row.direction:
            errors.append(f"간선이 연결한 spec '{row.spec_key}'의 방향({row.direction})은 바꿀 수 없습니다.")
    if errors:
        raise ValidationFailed("간선이 연결한 재료 spec을 바꿀 수 없습니다.", [
            ErrorDetail(severity="error", rule_id="VAL-SPEC-005", field_path="/material_specs",
                        message=message) for message in errors])


def _replace_specs(session: Session, version: ProcessVersion, node_id: uuid.UUID,
                   specs: list[MaterialSpecDto], user_id: uuid.UUID) -> None:
    """spec_key로 맞춰 갱신한다(같은 key는 id를 유지해 간선 연결이 끊기지 않는다)."""
    existing = {row.spec_key: row for row in repo.step_specs(session, version.id, node_id)}
    wanted = {m.spec_key for m in specs}
    for key, row in existing.items():
        if key not in wanted:
            session.delete(row)
    session.flush()
    for spec in specs:
        row = existing.get(spec.spec_key)
        if row is None:
            _add_specs(session, version, node_id, [spec], user_id)
        else:
            _fill_spec(row, spec)
    session.flush()


def patch_step(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID,
               step_id: uuid.UUID, expected: int, body: StepPatch,
               request_id: str | None) -> StepOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    version = _lock(session, project_id, version_id)
    _editable(version, expected)
    node = session.get(FlowNode, step_id)
    step = session.get(ProcessStep, step_id)
    if (node is None or step is None or node.process_version_id != version.id
            or node.project_id != project_id):
        raise NotFoundError(STEP_NOT_FOUND)
    if body.resources is not None:
        # 후보 종류는 DB 복합 FK도 강제한다. 이 검사는 친절한 422를 위한 것이다.
        _check_assets(session, project_id, [
            (f"/resources/{j}/candidates/{k}/asset_id", cand.asset_id, ("equipment",))
            for j, req in enumerate(body.resources) for k, cand in enumerate(req.candidates)])
    if body.material_specs is not None:
        _check_materials(session, project_id, [
            (f"/material_specs/{j}/material_definition_id", m.material_definition_id)
            for j, m in enumerate(body.material_specs)])
        _check_spec_replacement(session, version, step.node_id, body.material_specs)

    changed: dict = {}
    with transaction(session, {}):
        if "label" in body.model_fields_set:
            node.label = body.label
            changed["label"] = body.label
        for name in ("operation_type", "handler_version"):
            if name in body.model_fields_set:
                setattr(step, name, getattr(body, name))
                changed[name] = getattr(body, name)
        for name in ("timing_rule", "input_rule", "output_rule", "handoff_rule", "residual_rule"):
            if name in body.model_fields_set:
                value = getattr(body, name).model_dump(mode="json")
                setattr(step, name, value)
                changed[name] = value
        if body.resources is not None:
            repo.delete_step_resources(session, version.id, step.node_id)
            _add_requirements(session, version, step.node_id, body.resources, principal.user_id)
            changed["resources"] = [r.model_dump(mode="json") for r in body.resources]
        if body.material_specs is not None:
            _replace_specs(session, version, step.node_id, body.material_specs, principal.user_id)
            changed["material_specs"] = [m.model_dump(mode="json") for m in body.material_specs]
        _touch(version, principal)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="process_version.step",
              entity_type="process_version", entity_id=version.id, before=None,
              after={"step_id": str(step_id), "changed": sorted(changed)}, request_id=request_id)
    session.expire_all()
    version = repo.get_version(session, project_id, version_id)
    nodes, _ = repo.load_graph(session, project_id, version_id)
    current = next(n for n in nodes if n["id"] == str(step_id))
    return StepOut(id=step_id, label=current["label"], row_version=version.row_version,
                   step=current["step"])


def validate(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID,
             scope: str) -> ValidationOut:
    require_project(session, principal, project_id)
    version = _reload(session, project_id, version_id)
    nodes, edges = repo.load_graph(session, project_id, version_id)
    issues = rules.graph_issues(version.id, version.raw_unit_spec, version.finished_unit_spec,
                                nodes, edges, version.completion_node_id)
    if scope == "run_template":
        issues = rules.for_run_template(issues, nodes)
    return ValidationOut(
        scope=scope, error_count=sum(i.severity == "error" for i in issues),
        warning_count=sum(i.severity == "warning" for i in issues), issues=_issue_dtos(issues))


def _transition(session: Session, principal: Principal, project_id: uuid.UUID,
                version_id: uuid.UUID, expected: int, target: str, request_id: str | None,
                reason: str | None = None) -> ProcessVersionOut:
    access = require_project(session, principal, project_id)
    if target == rules.IN_REVIEW:
        require_write(access)
    else:
        require_admin(access, "공정 버전의 승인·반려는 project admin만 할 수 있습니다.")
    version = _lock(session, project_id, version_id)
    if version.row_version != expected:
        raise _stale(version.row_version)
    previous = version.status
    ensure_transition(previous, target)

    if target in (rules.IN_REVIEW, rules.APPROVED):
        nodes, edges = repo.load_graph(session, project_id, version.id)
        errors = [i for i in rules.graph_issues(version.id, version.raw_unit_spec,
                                                version.finished_unit_spec, nodes, edges,
                                                version.completion_node_id)
                  if i.severity == "error"]
        if errors:
            raise ProcessValidationFailed("구조 오류가 있어 제출·승인할 수 없습니다.", errors)

    after: dict = {"from": previous, "to": target, "version_no": version.version_no}
    with transaction(session, {}):
        if target == rules.IN_REVIEW:
            version.submitted_at, version.submitted_by = func.now(), principal.user_id
            version.rejection_reason = version.rejected_at = version.rejected_by = None
        elif target == rules.DRAFT:
            version.rejection_reason = reason
            version.rejected_at, version.rejected_by = func.now(), principal.user_id
            version.submitted_at = version.submitted_by = None
            after["reason"] = reason
        else:
            superseded = repo.find_approved(session, project_id, version.product_id,
                                            for_update=True)
            if superseded is not None:
                superseded.status = rules.SUPERSEDED
                _touch(superseded, principal)
                session.flush()
                after["superseded_version_id"] = str(superseded.id)
            version.approved_at, version.approved_by = func.now(), principal.user_id
        version.status = target
        _touch(version, principal)
        action = {rules.IN_REVIEW: "submit", rules.DRAFT: "reject", rules.APPROVED: "approve"}[target]
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action=f"process_version.{action}",
              entity_type="process_version", entity_id=version.id,
              before={"status": previous}, after=after, request_id=request_id)
    return _version_out(session, _reload(session, project_id, version.id))


def submit_version(session, principal, project_id, version_id, expected, request_id):
    return _transition(session, principal, project_id, version_id, expected, rules.IN_REVIEW,
                       request_id)


def reject_version(session, principal, project_id, version_id, expected, reason, request_id):
    return _transition(session, principal, project_id, version_id, expected, rules.DRAFT,
                       request_id, reason=reason)


def approve_version(session, principal, project_id, version_id, expected, request_id):
    return _transition(session, principal, project_id, version_id, expected, rules.APPROVED,
                       request_id)


# --- 비교 (CR be05 §2-2) ------------------------------------------------------------------

def _snapshot(session: Session, version: ProcessVersion) -> dict:
    nodes, edges = repo.load_graph(session, version.project_id, version.id)
    completion = next((n["node_key"] for n in nodes
                       if version.completion_node_id is not None
                       and n["id"] == str(version.completion_node_id)), None)
    return {"header": {"raw_unit_spec": version.raw_unit_spec,
                       "finished_unit_spec": version.finished_unit_spec, "notes": version.notes,
                       "completion_node_key": completion},
            "nodes": nodes, "edges": edges}


def _bad_against(message: str) -> ValidationFailed:
    return ValidationFailed("비교할 버전을 정할 수 없습니다.", [ErrorDetail(
        severity="error", rule_id="VAL-REF-004", field_path="/against", message=message)])


def diff_version(session: Session, principal: Principal, project_id: uuid.UUID,
                 version_id: uuid.UUID, against_id: uuid.UUID | None) -> VersionDiffOut:
    """target(=version)을 against(기본: base_version_id, 없으면 현재 승인본)와 비교한다. 읽기 전용."""
    require_project(session, principal, project_id)
    target = _reload(session, project_id, version_id)
    if against_id is None:
        against_id = target.base_version_id
    if against_id is None:
        current = repo.find_approved(session, project_id, target.product_id)
        against_id = None if current is None else current.id
    if against_id is None:
        raise _bad_against("비교 기준이 없습니다. against로 비교할 버전을 지정하세요.")
    against = repo.get_version(session, project_id, against_id)
    if against is None:
        raise NotFoundError(VERSION_NOT_FOUND)
    if against.product_id != target.product_id:
        raise _bad_against("같은 제품의 공정 버전끼리만 비교할 수 있습니다.")
    result = diff_versions(_snapshot(session, target), _snapshot(session, against))
    return VersionDiffOut.model_validate(
        {"target_version_id": target.id, "against_version_id": against.id, **result})


# --- 편집기 상태 (CR be05 §2-3: 버전 공용, 어떤 상태에서도 저장 가능) ---------------------------------

def _stale_editor(current: int) -> EditConflictError:
    return EditConflictError(
        "다른 곳에서 먼저 저장되었습니다.",
        [ErrorDetail(message=f"현재 편집기 상태 버전은 {current}입니다.", field_path="/row_version")])


def _editor_out(version_id: uuid.UUID, state: ProcessEditorState | None) -> EditorStateOut:
    if state is None:
        return EditorStateOut(process_version_id=version_id, node_positions={}, viewport=None,
                              row_version=0, updated_at=None, updated_by=None)
    return EditorStateOut(
        process_version_id=version_id, node_positions=state.node_positions, viewport=state.viewport,
        row_version=state.row_version, updated_at=state.updated_at or state.created_at,
        updated_by=state.updated_by or state.created_by)


def get_editor_state(session: Session, principal: Principal, project_id: uuid.UUID,
                     version_id: uuid.UUID) -> EditorStateOut:
    require_project(session, principal, project_id)
    version = _reload(session, project_id, version_id)
    return _editor_out(version.id, repo.get_editor_state(session, project_id, version.id))


def put_editor_state(session: Session, principal: Principal, project_id: uuid.UUID,
                     version_id: uuid.UUID, expected: int, body: EditorStateIn) -> EditorStateOut:
    """좌표 전체 교체. 공정 버전의 row_version·상태·승인에 영향이 없고 감사 로그도 남기지 않는다."""
    access = require_project(session, principal, project_id)
    require_write(access)
    version = _lock(session, project_id, version_id)  # 같은 버전의 동시 저장을 직렬화한다
    known = repo.node_ids(session, project_id, version.id)
    unknown = sorted(str(k) for k in body.node_positions if k not in known)
    if unknown:
        raise ValidationFailed("이 버전에 없는 노드의 좌표가 있습니다.", [ErrorDetail(
            severity="error", rule_id="VAL-REF-005", field_path=f"/node_positions/{k}",
            message="이 공정 버전의 노드 id가 아닙니다.") for k in unknown])
    state = repo.get_editor_state(session, project_id, version.id)
    current = 0 if state is None else state.row_version
    if current != expected:
        raise _stale_editor(current)
    positions = {str(k): v.model_dump(mode="json") for k, v in body.node_positions.items()}
    viewport = None if body.viewport is None else body.viewport.model_dump(mode="json")
    with transaction(session, {"uq_process_editor_state_shared": lambda: _stale_editor(current)}):
        if state is None:
            session.add(ProcessEditorState(
                id=new_id(), project_id=project_id, process_version_id=version.id, user_id=None,
                node_positions=positions, viewport=viewport, created_by=principal.user_id))
        else:
            state.node_positions, state.viewport = positions, viewport
            _touch(state, principal)
    session.expire_all()
    return _editor_out(version.id, repo.get_editor_state(session, project_id, version.id))
