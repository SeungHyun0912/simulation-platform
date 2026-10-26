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
    errors = [i for i in validation["issues"] if i["severity"] == "error"]
    assert {i["rule_id"] for i in errors} == {"VAL-TIME-004", "VAL-TIME-005"}
    assert {i["entity_id"] for i in errors} == {patched["body"]["data"]["id"]}
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
