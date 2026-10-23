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
