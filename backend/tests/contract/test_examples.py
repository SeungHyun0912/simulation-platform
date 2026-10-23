"""contracts/examples/first-scope의 예제가 구현 DTO와 일치하는지 확인한다(DB 불필요).

예제는 scripts/generate_contract_examples.py가 실제 API 응답에서 생성한다.
"""

import json
from pathlib import Path

import pytest

from simulation_platform.schemas.asset import AssetCreate, AssetOut, AssetPatch
from simulation_platform.schemas.common import ErrorEnvelope, ListOut, Single
from simulation_platform.schemas.project import ProjectCreate, ProjectOut

EXAMPLES = Path(__file__).resolve().parents[3] / "contracts" / "examples" / "first-scope"

# 파일 이름 → (요청 모델 또는 None, 응답 모델)
EXPECTED = {
    "project.create": (ProjectCreate, Single[ProjectOut]),
    "asset.create.equipment": (AssetCreate, Single[AssetOut]),
    "asset.create.storage": (AssetCreate, Single[AssetOut]),
    "asset.list": (None, ListOut[AssetOut]),
    "asset.patch": (AssetPatch, Single[AssetOut]),
    "error.edit-conflict": (None, ErrorEnvelope),
    "error.precondition-required": (None, ErrorEnvelope),
    "error.asset-code-conflict": (None, ErrorEnvelope),
    "error.validation": (None, ErrorEnvelope),
    "error.not-found": (None, ErrorEnvelope),
}
STATUS = {"project.create": 201, "asset.create.equipment": 201, "asset.create.storage": 201,
          "asset.list": 200, "asset.patch": 200, "error.edit-conflict": 412,
          "error.precondition-required": 428, "error.asset-code-conflict": 409,
          "error.validation": 422, "error.not-found": 404}


def _load(name):
    return json.loads((EXAMPLES / f"{name}.json").read_text(encoding="utf-8"))


def test_every_example_file_is_covered():
    assert {p.stem for p in EXAMPLES.glob("*.json")} == set(EXPECTED)


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_example_matches_dto(name):
    request_model, response_model = EXPECTED[name]
    example = _load(name)
    response = example["response"]
    assert response["status"] == STATUS[name]
    response_model.model_validate(response["body"])
    if request_model is not None:
        request_model.model_validate(example["request"]["body"])


def test_success_examples_carry_etag_and_errors_do_not_expose_internals():
    assert _load("asset.create.equipment")["response"]["headers"]["ETag"] == '"1"'
    assert _load("asset.patch")["response"]["headers"]["ETag"] == '"2"'
    for name in (n for n in EXPECTED if n.startswith("error.")):
        body = _load(name)["response"]["body"]["error"]
        assert body["request_id"] == "req-example"
        assert "Traceback" not in json.dumps(body)
