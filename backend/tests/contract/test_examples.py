"""contracts/examples/first-scope의 예제가 구현 DTO와 일치하는지 확인한다(DB 불필요).

예제는 scripts/generate_contract_examples.py가 실제 API 응답에서 생성한다.
"""

import json
from pathlib import Path

import pytest

from simulation_platform.schemas.asset import AssetCreate, AssetOut, AssetPatch
from simulation_platform.schemas.catalog import (
    MaterialCreate,
    MaterialOut,
    MaterialPatch,
    ProductCreate,
    ProductOut,
    ProductPatch,
)
from simulation_platform.schemas.common import ErrorEnvelope, ListOut, Single
from simulation_platform.schemas.me import MeOut
from simulation_platform.schemas.process import (
    EditorStateIn,
    EditorStateOut,
    GraphIn,
    GraphOut,
    ProcessVersionCreate,
    ProcessVersionListItem,
    ProcessVersionOut,
    StepOut,
    StepPatch,
    ValidationOut,
    VersionDiffOut,
)
from simulation_platform.schemas.project import ProjectCreate, ProjectOut
from simulation_platform.schemas.revision import AssetRevisionOut, RejectBody, RevisionPatch
from simulation_platform.schemas.scenario import (
    PrecheckOut,
    ScenarioCreate,
    ScenarioOut,
    ScenarioVersionOut,
    ScenarioVersionPatch,
)

EXAMPLES = Path(__file__).resolve().parents[3] / "contracts" / "examples" / "first-scope"

ASSET = Single[AssetOut]
REVISION = Single[AssetRevisionOut]
ERROR = ErrorEnvelope

# 파일 이름 → (요청 모델 또는 None, 응답 모델, 기대 상태 코드)
EXPECTED = {
    "project.create": (ProjectCreate, Single[ProjectOut], 201),
    "asset.create.equipment": (AssetCreate, ASSET, 201),
    "asset.create.storage": (AssetCreate, ASSET, 201),
    "asset.get": (None, ASSET, 200),
    "asset.list": (None, ListOut[AssetOut], 200),
    "asset.patch": (AssetPatch, ASSET, 200),
    "revision.create.equipment": (None, REVISION, 201),
    "revision.create.storage": (None, REVISION, 201),
    "revision.patch.equipment": (RevisionPatch, REVISION, 200),
    "revision.submit": (None, REVISION, 200),
    "revision.reject": (RejectBody, REVISION, 200),
    "revision.approve": (None, REVISION, 200),
    "revision.list": (None, ListOut[AssetRevisionOut], 200),
    "error.edit-conflict": (None, ERROR, 412),
    "error.precondition-required": (None, ERROR, 428),
    "error.asset-code-conflict": (None, ERROR, 409),
    "error.validation": (None, ERROR, 422),
    "error.not-found": (None, ERROR, 404),
    "error.revision-draft-exists": (None, ERROR, 409),
    "error.validation-capacity": (None, ERROR, 422),
    "error.version-immutable": (None, ERROR, 409),
    "error.invalid-state-transition": (None, ERROR, 409),
    # contract 0.3.0
    "me.get": (None, Single[MeOut], 200),
    "product.create": (ProductCreate, Single[ProductOut], 201),
    "product.list": (None, ListOut[ProductOut], 200),
    "product.patch": (ProductPatch, Single[ProductOut], 200),
    "material.create": (MaterialCreate, Single[MaterialOut], 201),
    "material.patch": (MaterialPatch, Single[MaterialOut], 200),
    "error.product-code-conflict": (None, ERROR, 409),
    "error.validation-default-spec": (None, ERROR, 422),
    # contract 0.4.0
    "product.get": (None, Single[ProductOut], 200),
    "process-version.create": (None, Single[ProcessVersionOut], 201),
    "process-version.list": (None, ListOut[ProcessVersionListItem], 200),
    "process-version.submit": (None, Single[ProcessVersionOut], 200),
    "process-version.approve": (None, Single[ProcessVersionOut], 200),
    "process-graph.put": (GraphIn, Single[GraphOut], 200),
    "process-step.patch": (StepPatch, Single[StepOut], 200),
    "process-validate.run-template": (None, Single[ValidationOut], 200),
    "error.process-draft-exists": (None, ERROR, 409),
    "error.graph-invalid": (None, ERROR, 422),
    # contract 0.5.0
    "process-version.create-from-base": (ProcessVersionCreate, Single[ProcessVersionOut], 201),
    "process-version.diff": (None, Single[VersionDiffOut], 200),
    "process-editor-state.get": (None, Single[EditorStateOut], 200),
    "process-editor-state.put": (EditorStateIn, Single[EditorStateOut], 200),
    # contract 0.6.0
    "process-graph.put-with-specs": (GraphIn, Single[GraphOut], 200),
    "process-step.patch-material-specs": (StepPatch, Single[StepOut], 200),
    "error.spec-link-invalid": (None, ERROR, 422),
    # contract 0.7.0
    "scenario.create": (ScenarioCreate, Single[ScenarioOut], 201),
    "scenario-version.patch": (ScenarioVersionPatch, Single[ScenarioVersionOut], 200),
    "scenario-version.validate": (None, Single[PrecheckOut], 200),
    "error.scenario-not-runnable": (None, ERROR, 422),
    # contract 0.9.0
    "error.run-not-runnable": (None, ERROR, 422),
}


def _load(name):
    return json.loads((EXAMPLES / f"{name}.json").read_text(encoding="utf-8"))


def test_every_example_file_is_covered():
    assert {p.stem for p in EXAMPLES.glob("*.json")} == set(EXPECTED)


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_example_matches_dto(name):
    request_model, response_model, status = EXPECTED[name]
    example = _load(name)
    assert example["response"]["status"] == status
    response_model.model_validate(example["response"]["body"])
    if request_model is not None:
        request_model.model_validate(example["request"]["body"])


def test_success_examples_carry_etag_and_errors_do_not_expose_internals():
    assert _load("asset.create.equipment")["response"]["headers"]["ETag"] == '"1"'
    assert _load("asset.patch")["response"]["headers"]["ETag"] == '"2"'
    assert _load("revision.create.equipment")["response"]["headers"]["ETag"] == '"1"'
    assert _load("revision.approve")["response"]["headers"]["ETag"] == '"4"'
    for name in (n for n in EXPECTED if n.startswith("error.")):
        body = _load(name)["response"]["body"]["error"]
        assert body["request_id"] == "req-example"
        assert "Traceback" not in json.dumps(body)


def test_catalog_examples_show_unknown_vs_value_and_separate_units():
    me = _load("me.get")["response"]["body"]["data"]
    assert {p["status"] for p in me["projects"]} == {"active"}
    assert {p["timezone"] for p in me["projects"]} == {"Asia/Seoul"}
    material =_load("material.create")["response"]["body"]["data"]["default_spec"]
    assert material["length_m"] == {"mode": "known", "value": "3000"}
    assert material["unit_count"] == {"mode": "unknown", "value": None}  # 미정은 0이 아니다
    patched = _load("material.patch")["response"]["body"]["data"]["default_spec"]
    assert patched["unit_count"] == {"mode": "known", "value": 10}  # 개수는 JSON 정수
    assert patched["length_m"]["value"] == "3000"  # 보내지 않은 필드는 유지
    product = _load("product.patch")["response"]["body"]["data"]
    assert product["specification"] is None and product["row_version"] == 2
    listing = _load("product.list")["response"]["body"]
    assert listing["page"]["next_cursor"] == "opaque-cursor-example"


def test_process_examples_show_graph_version_workflow_and_unknown_defaults():
    created = _load("process-version.create")["response"]["body"]["data"]
    assert created["status"] == "draft" and created["base_version_id"] is None
    assert all(v["mode"] == "unknown" for v in created["raw_unit_spec"].values())  # 0이 아니다
    saved = _load("process-graph.put")["response"]
    assert saved["headers"]["ETag"] == '"2"'
    graph = saved["body"]["data"]
    assert [n["kind"] for n in graph["nodes"]] == ["source", "operation", "buffer", "operation", "sink"]
    assert next(n for n in graph["nodes"] if n["kind"] == "buffer")["asset_id"]
    patched = _load("process-step.patch")["response"]
    assert patched["headers"]["ETag"] == '"3"'
    assert patched["body"]["data"]["step"]["timing_rule"]["processing"] == {"kind": "none"}
    validation = _load("process-validate.run-template")["response"]["body"]["data"]
    assert validation["scope"] == "run_template"
    # timing_rule을 통째로 교체해 setup·precondition_delay가 unknown으로 돌아간 단계는 실행(run_template)에서
    # 오류이지만 승인(knowledge)은 막지 않는다(이 예제는 그 직후 승인된다).
    # 이 그래프에는 완제품 milestone이 없어 완제품 판정 시점(VAL-GRAPH-014)도 실행에서는 오류다(contract 0.6.0).
    errors = [i for i in validation["issues"] if i["severity"] == "error"]
    assert {i["rule_id"] for i in errors} == {"VAL-TIME-004", "VAL-TIME-005", "VAL-GRAPH-014"}
    assert {i["entity_id"] for i in errors if i["rule_id"].startswith("VAL-TIME")} == {
        patched["body"]["data"]["id"]}
    assert {i["rule_id"] for i in validation["issues"] if i["severity"] == "warning"} == {
        "VAL-VER-001", "VAL-VER-002"}
    approved = _load("process-version.approve")["response"]
    assert approved["headers"]["ETag"] == '"5"' and approved["body"]["data"]["status"] == "approved"
    product = _load("product.get")["response"]["body"]["data"]
    assert product["current_process_version"]["status"] == "approved"
    invalid = _load("error.graph-invalid")["response"]["body"]["error"]["details"][0]
    assert invalid["rule_id"] == "VAL-GRAPH-001" and invalid["field_path"].startswith("/edges/")


def test_revision_examples_show_the_documented_workflow():
    created = _load("revision.create.equipment")["response"]["body"]["data"]
    assert created["status"] == "draft" and created["storage_capacity"] is None
    assert all(p["buffer_capacity"]["mode"] == "unknown" for p in created["ports"])
    approved = _load("revision.approve")["response"]["body"]["data"]
    assert approved["status"] == "approved" and approved["approved_by"]
    rejected = _load("revision.reject")["response"]["body"]["data"]
    assert rejected["status"] == "draft" and rejected["rejection_reason"]
    asset = _load("asset.get")["response"]["body"]["data"]
    assert asset["current_revision"]["status"] == "approved"
    assert asset["latest_revision"]["revision_no"] == 2


def test_clone_diff_and_editor_state_examples_show_the_documented_behavior():
    approved = _load("process-version.approve")["response"]["body"]["data"]
    created = _load("process-version.create-from-base")
    assert created["request"]["body"] == {"base_version_id": approved["id"]}
    draft = created["response"]["body"]["data"]
    assert draft["status"] == "draft" and draft["base_version_id"] == approved["id"]
    assert draft["approved_at"] is None and draft["submitted_at"] is None  # 승인 기록은 복사하지 않는다
    diff = _load("process-version.diff")["response"]["body"]["data"]
    assert diff["target_version_id"] == draft["id"] and diff["against_version_id"] == approved["id"]
    assert [f["field_path"] for f in diff["header"]] == ["/notes"]
    assert diff["nodes"]["added"] == [] and diff["edges"]["removed"] == []
    assert diff["steps"]["changed"], "단계 규칙 변경이 JSON Pointer 경로로 나온다"
    assert all(f["field_path"].startswith("/") for c in diff["steps"]["changed"] for f in c["fields"])
    assert diff["summary"]["identical"] is False
    empty = _load("process-editor-state.get")["response"]
    assert empty["headers"]["ETag"] == '"0"' and empty["body"]["data"]["node_positions"] == {}
    saved = _load("process-editor-state.put")["response"]
    assert saved["headers"]["ETag"] == '"1"' and len(saved["body"]["data"]["node_positions"]) == 5
    # 승인본에도 저장됐고 공정 버전의 ETag(승인 후 5)에는 영향이 없다.
    assert approved["status"] == "approved"


def test_material_spec_examples_show_specs_links_completion_and_the_link_error():
    saved = _load("process-graph.put-with-specs")
    graph = saved["response"]["body"]["data"]
    assert saved["request"]["body"]["completion_node_id"] == graph["completion_node_id"]
    keys = {n["node_key"]: n for n in graph["nodes"]}
    assert graph["completion_node_id"] == keys["complete"]["id"] and keys["complete"]["kind"] == "milestone"
    insulate = keys["insulate"]["step"]["material_specs"]
    assert [m["spec_key"] for m in insulate] == ["raw", "bobbin"]  # 입력이 먼저
    raw, bobbin = insulate
    assert raw["weight_kg"] == {"mode": "known", "value": "3300"} and raw["unit_count"]["value"] == 11
    assert raw["length_m"]["mode"] == "unknown" and bobbin["length_m"]["value"] == "1000"  # 단위를 섞지 않는다
    strands = keys["sheath"]["step"]["material_specs"][1]
    assert strands["strand_count"]["value"] == 12 and strands["unit_count"]["mode"] == "unknown"
    links = {e["edge_key"]: (e["source_output_spec_key"], e["target_input_spec_key"]) for e in graph["edges"]}
    assert links["src-insulate"] == (None, "raw") and links["insulate-wait"] == ("bobbin", None)
    patched = _load("process-step.patch-material-specs")["response"]
    assert patched["headers"]["ETag"] == '"3"'
    assert {m["spec_key"] for m in patched["body"]["data"]["step"]["material_specs"]} == {
        "raw", "bobbin", "scrap"}
    error = _load("error.spec-link-invalid")["response"]["body"]["error"]["details"][0]
    assert error["rule_id"] == "VAL-SPEC-002" and error["field_path"] == "/edges/1/source_output_spec_key"


def test_scenario_examples_show_draft_saving_precheck_and_the_approval_gate():
    created = _load("scenario.create")["response"]["body"]["data"]
    assert created["latest_version"] == {**created["latest_version"], "version_no": 1, "status": "draft"}
    patched = _load("scenario-version.patch")["response"]
    assert patched["headers"]["ETag"] == '"2"'
    version = patched["body"]["data"]
    assert version["products"][0]["arrivals"][0] == {
        "at_min": "0", "count": 2, "length_m": "2000", "weight_kg": None, "lot": "LOT-1"}
    assert version["stopping_rule"] == {"mode": "fixed_horizon", "horizon_min": "960"}
    precheck = _load("scenario-version.validate")["response"]["body"]["data"]
    assert precheck["runnable"] is False  # 미정·엔진 미구현이 남은 초안도 저장은 된다
    compile_rules = {i["rule_id"] for i in precheck["products"][0]["compile_issues"]}
    # 도메인 실행 검증(VAL-*)과 엔진 컴파일 코드를 번역하지 않고 그대로 담는다
    assert "INPUT_COUNT_UNKNOWN" in compile_rules  # 0.9.0: 설비 점유는 시나리오 기본값(hold_for_operation)이라 더는 미정이 아니다
    assert "EQUIPMENT_HOLD_POLICY_REQUIRED" not in compile_rules
    assert any(r.startswith("VAL-") for r in compile_rules)
    used = {a["code"] for a in precheck["products"][0]["assumptions_used"]}
    assert used == {"UNBOUNDED_BUFFERS", "EQUIPMENT_HOLD_FOR_OPERATION"}  # 설비 점유 기본값도 사용한 가정으로 보인다
    error = _load("error.scenario-not-runnable")["response"]["body"]["error"]
    assert error["code"] == "SCENARIO_NOT_RUNNABLE" and error["details"]


def test_run_example_shows_that_only_approved_versions_run():
    example = _load("error.run-not-runnable")
    assert example["request"]["headers"]["Idempotency-Key"]
    error = example["response"]["body"]["error"]
    assert error["code"] == "RUN_NOT_RUNNABLE" and error["details"][0]["rule_id"] == "RUN-SCN-001"
