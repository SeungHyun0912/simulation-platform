"""OpenAPI 후보가 CR-backend-20261023-be01c의 승인 범위와 일치하는지 확인한다(DB 불필요)."""

import hashlib
import json
from pathlib import Path

from simulation_platform.api.app import create_app
from simulation_platform.api.export_openapi import render

EXPECTED = {
    ("get", "/api/v1/health"),
    ("get", "/api/v1/me"),
    ("get", "/api/v1/projects"),
    ("post", "/api/v1/projects"),
    ("get", "/api/v1/projects/{project_id}"),
    ("patch", "/api/v1/projects/{project_id}"),
    ("get", "/api/v1/projects/{project_id}/assets"),
    ("post", "/api/v1/projects/{project_id}/assets"),
    ("get", "/api/v1/projects/{project_id}/assets/{asset_id}"),
    ("patch", "/api/v1/projects/{project_id}/assets/{asset_id}"),
    ("get", "/api/v1/projects/{project_id}/assets/{asset_id}/ports"),
    # scope asset-revisions (contract 0.2.0)
    ("get", "/api/v1/projects/{project_id}/assets/{asset_id}/revisions"),
    ("post", "/api/v1/projects/{project_id}/assets/{asset_id}/revisions"),
    ("get", "/api/v1/projects/{project_id}/asset-revisions/{revision_id}"),
    ("patch", "/api/v1/projects/{project_id}/asset-revisions/{revision_id}"),
    ("post", "/api/v1/projects/{project_id}/asset-revisions/{revision_id}/submit"),
    ("post", "/api/v1/projects/{project_id}/asset-revisions/{revision_id}/reject"),
    ("post", "/api/v1/projects/{project_id}/asset-revisions/{revision_id}/approve"),
    # scope products-materials (contract 0.3.0)
    ("get", "/api/v1/projects/{project_id}/products"),
    ("post", "/api/v1/projects/{project_id}/products"),
    ("get", "/api/v1/projects/{project_id}/products/{product_id}"),
    ("patch", "/api/v1/projects/{project_id}/products/{product_id}"),
    ("get", "/api/v1/projects/{project_id}/materials"),
    ("post", "/api/v1/projects/{project_id}/materials"),
    ("get", "/api/v1/projects/{project_id}/materials/{material_id}"),
    ("patch", "/api/v1/projects/{project_id}/materials/{material_id}"),
    # scope process-versions (contract 0.4.0)
    ("get", "/api/v1/projects/{project_id}/products/{product_id}/process-versions"),
    ("post", "/api/v1/projects/{project_id}/products/{product_id}/process-versions"),
    ("get", "/api/v1/projects/{project_id}/process-versions/{version_id}"),
    ("patch", "/api/v1/projects/{project_id}/process-versions/{version_id}"),
    ("get", "/api/v1/projects/{project_id}/process-versions/{version_id}/graph"),
    ("put", "/api/v1/projects/{project_id}/process-versions/{version_id}/graph"),
    ("patch", "/api/v1/projects/{project_id}/process-versions/{version_id}/steps/{step_id}"),
    ("post", "/api/v1/projects/{project_id}/process-versions/{version_id}/validate"),
    ("post", "/api/v1/projects/{project_id}/process-versions/{version_id}/submit"),
    ("post", "/api/v1/projects/{project_id}/process-versions/{version_id}/reject"),
    ("post", "/api/v1/projects/{project_id}/process-versions/{version_id}/approve"),
    # scope process-versions 확장 (contract 0.5.0)
    ("get", "/api/v1/projects/{project_id}/process-versions/{version_id}/diff"),
    ("get", "/api/v1/projects/{project_id}/process-versions/{version_id}/editor-state"),
    ("put", "/api/v1/projects/{project_id}/process-versions/{version_id}/editor-state"),
    # scope scenario-versions (contract 0.7.0)
    ("get", "/api/v1/projects/{project_id}/scenarios"),
    ("post", "/api/v1/projects/{project_id}/scenarios"),
    ("get", "/api/v1/projects/{project_id}/scenarios/{scenario_id}"),
    ("patch", "/api/v1/projects/{project_id}/scenarios/{scenario_id}"),
    ("get", "/api/v1/projects/{project_id}/scenarios/{scenario_id}/versions"),
    ("post", "/api/v1/projects/{project_id}/scenarios/{scenario_id}/versions"),
    ("get", "/api/v1/projects/{project_id}/scenario-versions/{version_id}"),
    ("patch", "/api/v1/projects/{project_id}/scenario-versions/{version_id}"),
    ("post", "/api/v1/projects/{project_id}/scenario-versions/{version_id}/validate"),
    ("post", "/api/v1/projects/{project_id}/scenario-versions/{version_id}/approve"),
    # scope runs (contract 0.9.0)
    ("get", "/api/v1/projects/{project_id}/runs"),
    ("post", "/api/v1/projects/{project_id}/runs"),
    ("get", "/api/v1/projects/{project_id}/runs/{run_id}"),
    ("get", "/api/v1/projects/{project_id}/runs/{run_id}/input"),
    ("post", "/api/v1/projects/{project_id}/runs/{run_id}/cancel"),
    # scope runs 확장 (contract 0.10.0)
    ("get", "/api/v1/projects/{project_id}/runs/{run_id}/events"),
    ("get", "/api/v1/projects/{project_id}/runs/{run_id}/items/{item_key}/lineage"),
    # scope runs 확장 (contract 0.11.0)
    ("get", "/api/v1/projects/{project_id}/runs/{run_id}/metrics"),
    ("get", "/api/v1/metric-definitions"),
    # scope runs 확장 (contract 0.12.0)
    ("get", "/api/v1/projects/{project_id}/runs/{run_id}/bottlenecks"),
    # scope runs 확장 (contract 0.13.0)
    ("get", "/api/v1/projects/{project_id}/runs/{run_id}/asset-timeline"),
    ("get", "/api/v1/projects/{project_id}/runs/{run_id}/assets/{asset_id}/states"),
    ("get", "/api/v1/projects/{project_id}/runs/{run_id}/compare/{other_run_id}"),
    ("get", "/api/v1/projects/{project_id}/runs/{run_id}/compare/{other_run_id}/metrics"),
    # scope process-versions·scenario-versions 확장 (contract 0.14.0)
    ("get", "/api/v1/projects/{project_id}/process-graphs"),
    ("get", "/api/v1/projects/{project_id}/assets/{asset_id}/uses"),
    ("post", "/api/v1/projects/{project_id}/scenario-versions/{version_id}/refresh"),
    # scope runs 확장 (contract 0.16.0)
    ("get", "/api/v1/projects/{project_id}/runs/{run_id}/report"),
}


def _schema():
    return create_app().openapi()


def test_paths_match_approved_scope_exactly():
    got = {(m, p) for p, ops in _schema()["paths"].items() for m in ops}
    assert got == EXPECTED


def test_local_debug_auth_is_not_exposed():
    text = json.dumps(_schema())
    assert "X-Debug-User" not in text and "x-debug-user" not in text.lower()


REVISION = "/api/v1/projects/{project_id}/asset-revisions/{revision_id}"
PROCESS = "/api/v1/projects/{project_id}/process-versions/{version_id}"
SCENARIO_VERSION = "/api/v1/projects/{project_id}/scenario-versions/{version_id}"


def test_mutating_operations_declare_if_match_and_precondition_errors():
    paths = _schema()["paths"]
    targets = [
        ("patch", "/api/v1/projects/{project_id}"),
        ("patch", "/api/v1/projects/{project_id}/assets/{asset_id}"),
        ("patch", REVISION),
        ("post", f"{REVISION}/submit"),
        ("post", f"{REVISION}/reject"),
        ("post", f"{REVISION}/approve"),
        ("patch", "/api/v1/projects/{project_id}/products/{product_id}"),
        ("patch", "/api/v1/projects/{project_id}/materials/{material_id}"),
        ("patch", f"{PROCESS}"),
        ("put", f"{PROCESS}/graph"),
        ("patch", f"{PROCESS}/steps/{{step_id}}"),
        ("post", f"{PROCESS}/submit"),
        ("post", f"{PROCESS}/reject"),
        ("post", f"{PROCESS}/approve"),
        ("patch", "/api/v1/projects/{project_id}/scenarios/{scenario_id}"),
        ("patch", SCENARIO_VERSION),
        ("post", f"{SCENARIO_VERSION}/approve"),
    ]
    for method, path in targets:
        op = paths[path][method]
        assert any(p["name"] == "if-match" and p["in"] == "header" for p in op["parameters"]), path
        assert {"412", "428"} <= set(op["responses"]), path


def test_revision_transitions_document_conflict_errors():
    paths = _schema()["paths"]
    for action in ("submit", "reject", "approve"):
        assert {"403", "404", "409", "412", "428"} <= set(paths[f"{REVISION}/{action}"]["post"]["responses"])
    assert "409" in paths[REVISION]["patch"]["responses"]


def test_capacity_schema_is_closed_and_uses_contract_units():
    schemas = _schema()["components"]["schemas"]
    capacity = schemas["Capacity"]
    assert capacity.get("additionalProperties") is False
    assert capacity["properties"]["mode"]["enum"] == ["unknown", "finite", "unlimited", "not_allowed"]
    unit = capacity["properties"]["unit"]
    units = next(x for x in unit.get("anyOf", [unit]) if "enum" in x)["enum"]
    assert units == ["item", "bobbin_slot", "pallet_slot", "kg", "m2"]
    # master 값에는 가정(assumed)·해당 없음을 쓸 수 없다.
    status = capacity["properties"]["status"]
    assert next(x for x in status.get("anyOf", [status]) if "enum" in x)["enum"] == [
        "unknown", "confirmed"]


def test_default_spec_schema_is_closed_and_keeps_measures_separate():
    schemas = _schema()["components"]["schemas"]
    spec = schemas["DefaultSpec"]
    assert spec.get("additionalProperties") is False
    assert set(spec["properties"]) == {"length_m", "weight_kg", "unit_count", "strand_count"}
    for name in ("DecimalMeasure", "CountMeasure"):
        measure = schemas[name]
        assert measure.get("additionalProperties") is False
        assert measure["properties"]["mode"]["enum"] == ["unknown", "known", "not_applicable"]
    # 길이·중량은 decimal 문자열, 개수는 정수로 서로 다른 형식이다.
    decimal = schemas["DecimalMeasure"]["properties"]["value"]
    assert any(x.get("type") == "string" for x in decimal.get("anyOf", [decimal]))
    count = schemas["CountMeasure"]["properties"]["value"]
    assert any(x.get("type") == "integer" for x in count.get("anyOf", [count]))


def test_me_projects_include_status_and_timezone():
    schemas = _schema()["components"]["schemas"]
    assert {"status", "timezone"} <= set(schemas["MeProject"]["properties"])


def test_product_gains_process_version_summaries_without_breaking_0_3_fields():
    props = _schema()["components"]["schemas"]["ProductOut"]["properties"]
    assert {"current_process_version", "latest_process_version"} <= set(props)
    assert {"id", "project_id", "code", "name", "specification", "row_version"} <= set(props)


def test_process_rule_schemas_are_closed_and_discriminated():
    schemas = _schema()["components"]["schemas"]
    for name in ("GraphIn", "GraphNode", "GraphEdge", "StepDto", "TimingRule", "RequirementDto",
                 "OutputRule", "OutputSpeed", "Setup", "PreconditionDelay"):
        assert schemas[name].get("additionalProperties") is False, name
    processing = schemas["TimingRule"]["properties"]["processing"]
    assert processing["discriminator"]["propertyName"] == "kind"
    assert set(processing["discriminator"]["mapping"]) == {
        "unknown", "none", "output_speed", "per_output_unit", "per_reference_length"}
    # 준비·대기 시간은 0이 유효해야 해서 처리 시간 값과 다른 스키마를 쓴다.
    assert "DurationMeasure" in schemas and "DecimalMeasure" in schemas


def test_process_validate_scope_is_a_closed_enum_and_graph_put_documents_errors():
    paths = _schema()["paths"]
    scope = next(p for p in paths[f"{PROCESS}/validate"]["post"]["parameters"] if p["name"] == "scope")
    assert scope["schema"]["enum"] == ["knowledge", "run_template"]
    assert {"409", "412", "428", "422"} <= set(paths[f"{PROCESS}/graph"]["put"]["responses"])


def test_asset_response_adds_revision_summaries_without_breaking_0_1_fields():
    asset = _schema()["components"]["schemas"]["AssetOut"]["properties"]
    assert {"current_revision", "latest_revision"} <= set(asset)
    assert {"id", "project_id", "kind", "code", "name", "ports", "row_version"} <= set(asset)


def test_asset_create_request_has_no_ports_and_forbids_extra_fields():
    schemas = _schema()["components"]["schemas"]
    create = schemas["AssetCreate"]
    assert "ports" not in create["properties"]
    assert create.get("additionalProperties") is False
    assert set(schemas["AssetPatch"]["properties"]) == {
        "code", "name", "sort_order", "external_ref", "notes", "equipment", "space"}


def test_render_is_deterministic():
    assert render() == render()


REPO = Path(__file__).resolve().parents[3]


def test_approved_snapshot_matches_current_code():
    """코드가 바뀌어 승인 스냅샷과 달라지면 실패한다. 의도한 변경은 CR→재승격 절차로 갱신한다."""
    snapshot = (REPO / "contracts" / "openapi.json").read_bytes()
    assert snapshot == render().encode("utf-8"), (
        "contracts/openapi.json이 현재 코드의 OpenAPI와 다릅니다. "
        "계약 변경이면 CR 승인 후 export_openapi로 재생성·재승격하고 contract-status.json의 해시를 갱신하세요.")


def test_contract_status_hash_matches_snapshot():
    status = json.loads((REPO / "contracts" / "contract-status.json").read_text(encoding="utf-8"))
    digest = hashlib.sha256((REPO / "contracts" / "openapi.json").read_bytes()).hexdigest()
    assert status["openapi_sha256"] == digest
    assert status["status"] == "PARTIALLY_APPROVED"
    assert status["approved_scopes"] == ["project-assets-ports", "asset-revisions",
                                         "products-materials", "process-versions", "scenario-versions", "runs"]
    assert status["contract_version"] == "0.16.2"


def test_process_0_5_0_additions_are_compatible_and_closed():
    """0.4.0 클라이언트와 호환: 복제 본문은 선택, 새 스키마는 닫힌 객체, 비교 기준은 against 쿼리."""
    doc = _schema()
    paths, schemas = doc["paths"], doc["components"]["schemas"]
    create = paths["/api/v1/projects/{project_id}/products/{product_id}/process-versions"]["post"]
    assert create["requestBody"].get("required", False) is False  # 본문 없이 0.4.0처럼 호출 가능
    assert schemas["ProcessVersionCreate"]["additionalProperties"] is False
    assert set(schemas["ProcessVersionCreate"]["properties"]) == {"base_version_id"}
    diff = paths[f"{PROCESS}/diff"]["get"]
    assert [p["name"] for p in diff["parameters"] if p["in"] == "query"] == ["against"]
    assert next(p for p in diff["parameters"] if p["name"] == "against")["required"] is False
    put = paths[f"{PROCESS}/editor-state"]["put"]
    assert {"404", "412", "422", "428"} <= set(put["responses"])
    assert any(p["name"] == "if-match" for p in put.get("parameters", [])) or "If-Match" in str(put)
    for name in ("NodePosition", "Viewport", "EditorStateIn"):
        assert schemas[name]["additionalProperties"] is False
    assert schemas["EditorStateOut"]["properties"]["row_version"]["type"] == "integer"
    assert set(schemas["DiffField"]["properties"]["change"]["enum"]) == {"added", "removed", "changed"}


def test_process_0_6_0_additions_are_optional_and_closed():
    """0.5.0 클라이언트와 호환: 요청 쪽 새 필드는 모두 선택, 새 스키마는 닫힌 객체."""
    schemas = _schema()["components"]["schemas"]
    spec = schemas["MaterialSpecDto"]
    assert spec["additionalProperties"] is False and set(spec["required"]) == {"spec_key", "direction"}
    assert spec["properties"]["direction"]["enum"] == ["input", "output"]
    assert set(spec["properties"]["quantity_basis"]["enum"]) == {
        "unknown", "per_operation", "per_input_unit", "per_lot", "total_plan"}
    for field in ("length_m", "weight_kg", "unit_count", "strand_count"):  # 단위를 섞지 않는 별개 값 객체
        assert field in spec["properties"]
    assert "material_specs" in schemas["StepDto"]["properties"]
    assert "material_specs" not in schemas["StepDto"].get("required", [])
    assert "material_specs" in schemas["StepPatch"]["properties"]
    for field in ("source_output_spec_key", "target_input_spec_key"):
        assert field in schemas["GraphEdge"]["properties"] and field not in schemas["GraphEdge"]["required"]
    assert "completion_node_id" in schemas["GraphIn"]["properties"]
    assert "completion_node_id" not in schemas["GraphIn"].get("required", [])
    assert "completion_node_id" in schemas["GraphOut"]["required"]  # 응답에는 항상 있다(null 가능)
    assert "completion_node_id" in schemas["ProcessVersionOut"]["properties"]


def test_scenario_0_7_0_schemas_are_closed_and_keep_units_and_unknowns_explicit():
    """시나리오 요청 DTO는 닫힌 객체, 숫자는 decimal 문자열·개수는 정수, 종료 규칙은 판별자 객체."""
    doc = _schema()
    schemas, paths = doc["components"]["schemas"], doc["paths"]
    for name in ("ScenarioCreate", "ScenarioPatch", "ScenarioVersionCreate", "ScenarioVersionPatch",
                 "ScenarioProductDto", "ScenarioAssetDto", "ArrivalDto", "AssumptionsDto", "DrainRule",
                 "FixedHorizonRule"):
        assert schemas[name].get("additionalProperties") is False, name
    arrival = schemas["ArrivalDto"]["properties"]
    assert arrival["count"]["type"] == "integer"
    for field in ("length_m", "weight_kg"):  # 0.8.0: 길이 또는 무게(해당 없음 ≠ 0), 둘 다 decimal 문자열 또는 null
        kinds = {x.get("type") for x in arrival[field]["anyOf"]}
        assert kinds == {"string", "null"}, field
        assert field not in schemas["ArrivalDto"].get("required", [])
    stopping = schemas["ScenarioVersionOut"]["properties"]["stopping_rule"]
    assert set(stopping["discriminator"]["mapping"]) == {"drain", "fixed_horizon"}
    create = paths["/api/v1/projects/{project_id}/scenarios/{scenario_id}/versions"]["post"]
    assert create["requestBody"].get("required", False) is False
    assert {"403", "409", "412", "422", "428"} <= set(paths[f"{SCENARIO_VERSION}/approve"]["post"]["responses"])
    assert set(schemas["PrecheckOut"]["properties"]) >= {"runnable", "issues", "products", "engine_version"}


def test_process_0_8_0_residual_rule_gains_discard_and_stays_compatible():
    """0.7.0 클라이언트와 호환: 잔량 모드에 값 하나(discard)가 더해지고 기존 값은 그대로다."""
    modes = _schema()["components"]["schemas"]["ResidualRule"]["properties"]["mode"]["enum"]
    assert modes == ["unknown", "none", "carry_same_product", "discard"]
