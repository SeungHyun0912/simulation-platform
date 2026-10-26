"""공정 그래프의 순수 규칙(HTTP/ORM 비의존). 기준: contracts/03 §4~8, ERD §5, CR be04.

그래프·규칙은 Pydantic `model_dump(mode="json")`을 거친 dict로 받는다. 미정은 오류가 아니라 경고이며
승인(knowledge)을 막지 않는다(ADR-017). 실행 가능 판정(run_template)에서만 필수 미정이 오류가 된다.
"""

from collections import defaultdict, deque
from dataclasses import replace

from simulation_platform.domain.errors import ErrorDetail

DRAFT, IN_REVIEW, APPROVED, SUPERSEDED = "draft", "in_review", "approved", "superseded"
TRANSITIONS: dict[str, frozenset[str]] = {
    DRAFT: frozenset({IN_REVIEW}),
    IN_REVIEW: frozenset({DRAFT, APPROVED}),
    APPROVED: frozenset({SUPERSEDED}),
    SUPERSEDED: frozenset(),
}

# 엔진 handler registry(07 §2). 등록은 문자열로 자유롭게 할 수 있고 실행 가능 여부만 run_template에서 막는다.
SUPPORTED_HANDLERS = frozenset({
    "pass_through_length", "split_length", "output_units_by_time", "configured_yield",
    "supply_delay", "inspection", "transport_manual"})
SUPPORTED_HANDLER_VERSIONS = frozenset({"1"})

# 실행(run_template)에서 오류로 승격되는 경고 규칙.
RUN_BLOCKING = frozenset({
    "VAL-TIME-001", "VAL-TIME-002", "VAL-TIME-003", "VAL-TIME-004", "VAL-TIME-005",
    "VAL-OUT-001", "VAL-OUT-002", "VAL-OUT-003", "VAL-RES-002", "VAL-RES-003", "VAL-RES-004",
    "VAL-GRAPH-011", "VAL-GRAPH-014", "VAL-INPUT-001", "VAL-HANDOFF-001", "VAL-HANDLER-001"})


def _issue(entity_id, path, rule, severity, message, resolution=None) -> ErrorDetail:
    return ErrorDetail(severity=severity, rule_id=rule, entity_id=str(entity_id), field_path=path,
                       message=message, resolution=resolution)


def _unknown(measure: dict | None) -> bool:
    return measure is None or measure.get("mode") == "unknown"


def _spec_keys(node: dict | None, direction: str) -> set[str]:
    step = (node or {}).get("step") or {}
    return {m["spec_key"] for m in step.get("material_specs", []) if m["direction"] == direction}


def structure_errors(nodes: list[dict], edges: list[dict],
                     completion_node_id: str | None = None) -> list[tuple[str, str, str]]:
    """저장 불가능한 구조 오류. (body field_path, rule_id, message) 목록. PUT이 422로 거부한다."""
    errors: list[tuple[str, str, str]] = []
    by_id = {n["id"]: n for n in nodes}
    if completion_node_id is not None and by_id.get(str(completion_node_id), {}).get("kind") != "milestone":
        errors.append(("/completion_node_id", "VAL-GRAPH-005",
                       "완제품 지정 노드는 같은 그래프의 milestone 노드여야 합니다."))
    for i, edge in enumerate(edges):
        source, target = edge.get("source_output_spec_key"), edge.get("target_input_spec_key")
        if edge["edge_kind"] == "precedence":
            for field, key in (("source_output_spec_key", source), ("target_input_spec_key", target)):
                if key is not None:
                    errors.append((f"/edges/{i}/{field}", "VAL-SPEC-004",
                                   "precedence(완료 의존) 간선에는 재료 spec을 연결할 수 없습니다."))
            continue
        if source is not None and source not in _spec_keys(by_id.get(edge["from_node_id"]), "output"):
            errors.append((f"/edges/{i}/source_output_spec_key", "VAL-SPEC-002",
                           f"from 노드 단계에 output spec '{source}'가 없습니다."))
        if target is not None and target not in _spec_keys(by_id.get(edge["to_node_id"]), "input"):
            errors.append((f"/edges/{i}/target_input_spec_key", "VAL-SPEC-003",
                           f"to 노드 단계에 input spec '{target}'이(가) 없습니다."))
    for i, edge in enumerate(edges):
        for end in ("from_node_id", "to_node_id"):
            if edge[end] not in by_id:
                errors.append((f"/edges/{i}/{end}", "VAL-GRAPH-001",
                               "간선이 그래프에 없는 노드를 가리킵니다. 노드를 함께 보내거나 간선을 제거하세요."))
        if edge["from_node_id"] == edge["to_node_id"]:
            errors.append((f"/edges/{i}/to_node_id", "VAL-GRAPH-003", "간선이 자기 자신을 가리킵니다."))
        if edge["edge_kind"] == "material" and edge["from_node_id"] in by_id \
                and edge["to_node_id"] in by_id:
            if by_id[edge["from_node_id"]]["kind"] == "sink":
                errors.append((f"/edges/{i}/from_node_id", "VAL-GRAPH-004",
                               "sink 노드에서 나가는 물류(material) 간선은 둘 수 없습니다."))
            if by_id[edge["to_node_id"]]["kind"] == "source":
                errors.append((f"/edges/{i}/to_node_id", "VAL-GRAPH-004",
                               "source 노드로 들어오는 물류(material) 간선은 둘 수 없습니다."))
    for i, node in enumerate(nodes):
        for j, req in enumerate((node.get("step") or {}).get("resources", [])):
            count = len(req["candidates"])
            if req["resource_kind"] == "equipment" and req["selection_mode"] == "one_of" \
                    and count and req["required_count"] > count:
                errors.append((f"/nodes/{i}/step/resources/{j}/required_count", "VAL-RES-001",
                               f"필요 수({req['required_count']})가 후보 수({count})보다 큽니다."))
            if req["selection_mode"] == "all_of" and req["resource_kind"] == "equipment" and count \
                    and req["required_count"] != 1:
                errors.append((f"/nodes/{i}/step/resources/{j}/required_count", "VAL-RES-001",
                               "all_of(필수 구성 자원 모두 확보)에서는 required_count를 1로 둡니다."))
    return errors


def _has_cycle(nodes: list[dict], edges: list[dict]) -> bool:
    ids = {n["id"] for n in nodes}
    indegree = {i: 0 for i in ids}
    out = defaultdict(list)
    for e in edges:
        if e["edge_kind"] == "material" and e["from_node_id"] in ids and e["to_node_id"] in ids:
            out[e["from_node_id"]].append(e["to_node_id"])
            indegree[e["to_node_id"]] += 1
    queue = deque(i for i, d in indegree.items() if d == 0)
    seen = 0
    while queue:
        current = queue.popleft()
        seen += 1
        for nxt in out[current]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                queue.append(nxt)
    return seen != len(ids)


def _step_issues(node: dict) -> list[ErrorDetail]:
    nid, step = node["id"], node["step"]
    issues: list[ErrorDetail] = []

    def add(path, rule, message, resolution=None, severity="warning"):
        issues.append(_issue(nid, path, rule, severity, f"{node['label']}: {message}", resolution))

    if not step["operation_type"]:
        add("/operation_type", "VAL-HANDLER-001", "공정 종류(operation_type)가 미정입니다.",
            "엔진 handler 이름을 지정하세요(실행 전 필수).")
    proc = step["timing_rule"]["processing"]
    kind = proc["kind"]
    if kind == "unknown":
        add("/timing_rule/processing", "VAL-TIME-001", "처리 방식이 미정입니다.",
            "처리 방식을 확정하거나 미정으로 두고 실행 전에 해소하세요.")
    elif kind == "output_speed":
        if _unknown(proc["speed_m_per_min"]):
            add("/timing_rule/processing/speed_m_per_min", "VAL-TIME-002", "산출 선속이 미정입니다.")
        if proc["basis"] == "unknown" or proc["output_schedule"] == "unknown" \
                or _unknown(proc["parallel_streams"]):
            add("/timing_rule/processing", "VAL-TIME-003",
                "산출 방식(basis·output_schedule·parallel_streams)이 미정입니다. 둘 중 하나를 자동 선택하지 않으며 실행이 차단됩니다.",
                "스트림별 병렬/합계 순차 등 산출 방식을 확정하세요(03 §4.1).")
    elif kind == "per_output_unit":
        if _unknown(proc["duration_min"]):
            add("/timing_rule/processing/duration_min", "VAL-TIME-002", "산출 단위당 시간이 미정입니다.")
        if proc["output_schedule"] == "unknown":
            add("/timing_rule/processing/output_schedule", "VAL-TIME-003", "산출 스케줄이 미정입니다.")
    elif kind == "per_reference_length":
        if _unknown(proc["reference_length_m"]) or _unknown(proc["duration_min"]):
            add("/timing_rule/processing", "VAL-TIME-002", "기준 길이 또는 기준 길이당 시간이 미정입니다.")
        if proc["scaling"] == "unknown" or proc["includes_setup"] == "unknown":
            add("/timing_rule/processing", "VAL-TIME-005",
                "비례 여부(scaling) 또는 준비 포함 여부(includes_setup)가 미정이라 다른 길이로 환산하지 않습니다.")
    setup = step["timing_rule"]["setup"]
    if setup["trigger"] == "unknown" or (setup["trigger"] != "not_applicable"
                                         and _unknown(setup["duration_min"])):
        add("/timing_rule/setup", "VAL-TIME-004", "준비 시점 또는 시간이 미정입니다(0이 아님).",
            "준비가 없으면 not_applicable을 선택하세요.")
    delay = step["timing_rule"]["precondition_delay"]
    if delay["trigger"] == "unknown" or (delay["trigger"] != "not_applicable"
                                         and (_unknown(delay["duration_min"])
                                              or delay["occupancy"] == "unknown")):
        add("/timing_rule/precondition_delay", "VAL-TIME-005",
            "공급 대기의 발생 시점·시간·설비 점유 여부가 미정입니다.",
            "대기가 없으면 not_applicable을 선택하세요.")

    out = step["output_rule"]
    if out["mode"] == "unknown":
        add("/output_rule/mode", "VAL-OUT-001", "산출 방식이 미정입니다.")
    else:
        needs = {"configured_units": ("length_m", "unit_count"), "split_length": ("length_m",),
                 "fixed_mass_units": ("weight_kg", "unit_count")}.get(out["mode"], ())
        for field in needs:
            if _unknown(out[field]):
                add(f"/output_rule/{field}", "VAL-OUT-002", f"산출 {field} 값이 미정입니다.")
        if out["mode"] == "configured_units" and out["quantity_basis"] == "unknown":
            add("/output_rule/quantity_basis", "VAL-OUT-003",
                "산출 수량의 기준(작업당/총 계획 등)이 미정입니다. 작업 한 번의 산출량과 총 생산 목표는 다릅니다.")
        if out["accounting_mode"] == "abstract_yield":
            add("/output_rule/accounting_mode", "VAL-OUT-004",
                "abstract_yield: 물량 보존 검증 예외이며 원가·원자재 효율 지표에 경고가 붙습니다.")
    if step["input_rule"]["acquire_scope"] == "unknown" or step["input_rule"]["consume_policy"] == "unknown":
        add("/input_rule", "VAL-INPUT-001", "투입 확보 범위 또는 소비 시점이 미정입니다.")
    if step["handoff_rule"]["mode"] == "unknown":
        add("/handoff_rule/mode", "VAL-HANDOFF-001", "다음 단계로의 인계 방식이 미정입니다.")

    for j, spec in enumerate(step.get("material_specs", [])):
        if all(_unknown(spec[f]) for f in ("length_m", "weight_kg", "unit_count", "strand_count")):
            add(f"/material_specs/{j}", "VAL-SPEC-001",
                f"{spec['spec_key']}({spec['direction']}): 길이·중량·단위 수·가닥 수가 모두 미정입니다.")
    if not step["resources"]:
        add("/resources", "VAL-RES-002", "자원 요구가 없습니다. 실행 전에 설비 또는 작업자를 지정해야 합니다.")
    for j, req in enumerate(step["resources"]):
        if req["resource_kind"] == "equipment":
            if not req["candidates"]:
                add(f"/resources/{j}/candidates", "VAL-RES-003", f"{req['role_key']}: 설비 후보가 없습니다.")
            for k, cand in enumerate(req["candidates"]):
                if cand["eligibility_status"] == "unknown":
                    add(f"/resources/{j}/candidates/{k}/eligibility_status", "VAL-RES-004",
                        f"{req['role_key']}: 후보 설비의 사용 가능 여부가 미확인입니다(OPEN-001).",
                        "확정하거나 시나리오에서 가정으로 승인하세요.")
    return issues


def graph_issues(version_id, raw_unit_spec: dict, finished_unit_spec: dict, nodes: list[dict],
                 edges: list[dict], completion_node_id=None) -> list[ErrorDetail]:
    """knowledge 범위의 검증 항목(오류+경고). 정렬: 오류 먼저, 이후 입력 순서."""
    issues: list[ErrorDetail] = []
    for path, rule, message in structure_errors(nodes, edges, completion_node_id):
        issues.append(_issue(version_id, path, rule, "error", message))
    if all(_unknown(v) for v in raw_unit_spec.values()):
        issues.append(_issue(version_id, "/raw_unit_spec", "VAL-VER-001", "warning",
                             "원자재 기본 단위가 미정입니다."))
    if all(_unknown(v) for v in finished_unit_spec.values()):
        issues.append(_issue(version_id, "/finished_unit_spec", "VAL-VER-002", "warning",
                             "완제품 단위가 미정입니다."))
    operations = [n for n in nodes if n["kind"] == "operation"]
    if not operations:
        issues.append(_issue(version_id, "/nodes", "VAL-GRAPH-010", "warning",
                             "operation(단계) 노드가 없습니다."))
    if operations and completion_node_id is None:
        issues.append(_issue(version_id, "/completion_node_id", "VAL-GRAPH-014", "warning",
                             "완제품 판정 시점(완제품 milestone)이 미정입니다.",
                             "완제품으로 판정하는 milestone 노드를 지정하세요(실행 전 필수)."))
    if _has_cycle(nodes, edges):
        issues.append(_issue(version_id, "/edges", "VAL-GRAPH-011", "warning",
                             "물류 간선에 순환(재작업)이 있습니다. 등록은 가능하지만 초기 엔진은 지원하지 않아 실행이 차단됩니다."))
    touched = {e[end] for e in edges if e["edge_kind"] == "material"
               for end in ("from_node_id", "to_node_id")}
    for node in nodes:
        if node["kind"] == "operation":
            if len(nodes) > 1 and node["id"] not in touched:
                issues.append(_issue(node["id"], "/", "VAL-GRAPH-012", "warning",
                                     f"{node['label']}: 물류 간선으로 연결되지 않은 단계입니다."))
            issues.extend(_step_issues(node))
        elif node["kind"] == "buffer" and node["asset_id"] is None:
            issues.append(_issue(node["id"], "/asset_id", "VAL-GRAPH-013", "warning",
                                 f"{node['label']}: 대기 위치(저장·도킹 공간)가 미정입니다."))
    issues.sort(key=lambda i: i.severity != "error")
    return issues


def for_run_template(issues: list[ErrorDetail], nodes: list[dict]) -> list[ErrorDetail]:
    """실행 가능성 판정: 필수 미정을 오류로 승격하고 handler 지원 여부를 검사한다."""
    result = [
        replace(i, severity="error", resolution=i.resolution or "실행 전에 확정해야 합니다.")
        if i.severity == "warning" and i.rule_id in RUN_BLOCKING else i
        for i in issues
    ]
    for node in nodes:
        step = node.get("step")
        if node["kind"] != "operation" or not step["operation_type"]:
            continue
        version = step["handler_version"] or "1"
        if step["operation_type"] not in SUPPORTED_HANDLERS or version not in SUPPORTED_HANDLER_VERSIONS:
            result.append(_issue(
                node["id"], "/operation_type", "UNSUPPORTED_HANDLER", "error",
                f"{node['label']}: 지원하지 않는 handler({step['operation_type']} v{version})입니다. "
                "등록은 가능하지만 실행할 수 없습니다.",
                "엔진이 지원하는 handler를 선택하세요."))
    result.sort(key=lambda i: i.severity != "error")
    return result
