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
}


def _schema():
    return create_app().openapi()


def test_paths_match_approved_scope_exactly():
    got = {(m, p) for p, ops in _schema()["paths"].items() for m in ops}
    assert got == EXPECTED


def test_local_debug_auth_is_not_exposed():
    text = json.dumps(_schema())
    assert "X-Debug-User" not in text and "x-debug-user" not in text.lower()


def test_patch_operations_declare_if_match_and_precondition_errors():
    paths = _schema()["paths"]
    for path in ("/api/v1/projects/{project_id}", "/api/v1/projects/{project_id}/assets/{asset_id}"):
        op = paths[path]["patch"]
        assert any(p["name"] == "if-match" and p["in"] == "header" for p in op["parameters"])
        assert {"412", "428"} <= set(op["responses"])


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
    assert status["approved_scopes"] == ["project-assets-ports"]
