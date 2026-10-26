"""T0·T1: 계약 정합과 환경 격리(실제 서버 대상, Mock 없음)."""

import hashlib
import json
from pathlib import Path

import pytest

from conftest import API, PROJECT_A, RUN, data

ROOT = Path(__file__).resolve().parents[2]
METHODS = {"get", "post", "put", "patch", "delete"}


def _ops(spec: dict) -> set[tuple[str, str]]:
    return {(m.upper(), p) for p, item in spec["paths"].items() for m in item if m in METHODS}


def test_t0_openapi_hash_matches_contract_status():
    status = json.loads((ROOT / "contracts/contract-status.json").read_text(encoding="utf-8"))
    digest = hashlib.sha256((ROOT / "contracts/openapi.json").read_bytes()).hexdigest()
    assert digest == status["openapi_sha256"]
    assert status["contract_version"] == "0.6.0"


def test_t0_server_operations_equal_approved_contract(admin):
    """서버가 실제로 제공하는 operation 집합이 승인된 정식 스냅샷과 같다."""
    contract = json.loads((ROOT / "contracts/openapi.json").read_text(encoding="utf-8"))
    base = API.rsplit("/api/v1", 1)[0]
    live = admin.http.get(f"{base}/openapi.json").json()
    assert _ops(live) == _ops(contract)


def test_t0_server_schemas_cover_contract_schemas(admin):
    """승인 계약의 요청·응답 schema 이름이 서버에서 사라지거나 바뀌지 않았다(필드 단위 비교는 후속)."""
    contract = json.loads((ROOT / "contracts/openapi.json").read_text(encoding="utf-8"))
    base = API.rsplit("/api/v1", 1)[0]
    live = admin.http.get(f"{base}/openapi.json").json()
    assert set(contract["components"]["schemas"]) <= set(live["components"]["schemas"])


@pytest.mark.xfail(
    reason="알려진 제한(사용자 결정 2026-10-26): 프런트엔드 생성 클라이언트가 계약 0.4.0 기준이다. "
    "0.6.0으로 올리기 전까지의 상태를 기록하며, 올리면 이 xfail은 XPASS가 된다.",
    strict=False,
)
def test_t0_frontend_client_uses_current_contract():
    fe = json.loads((ROOT / "frontend/src/shared/api/generated/CONTRACT.json").read_text(encoding="utf-8"))
    status = json.loads((ROOT / "contracts/contract-status.json").read_text(encoding="utf-8"))
    assert fe["openapi_sha256"] == status["openapi_sha256"]


def test_t1_server_is_isolated_db(db):
    assert db.execute("select current_database()").fetchone()[0].endswith("_int_test")
    head = db.execute("select version_num from alembic_version").fetchone()[0]
    assert head == "0006"


def test_t1_api_write_lands_in_isolated_db(admin, db):
    """API로 만든 제품이 같은 전용 DB에 실제로 저장된다(API→DB 연결 증명)."""
    code = f"INT{RUN}-T1"
    created = data(admin.post(f"/projects/{PROJECT_A}/products", {"code": code, "name": "[INT] 격리 확인"}), 201)
    row = db.execute("select project_id::text, code from product where id = %s", (created["id"],)).fetchone()
    assert row == (PROJECT_A, code)


def test_t1_unauthenticated_request_is_rejected(clients):
    r = clients["anon"].get("/me")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "UNAUTHENTICATED"
