from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from simulation_platform.api.app import create_app
from simulation_platform.domain.errors import EditConflictError, ErrorDetail


def _client() -> TestClient:
    app: FastAPI = create_app()

    class Body(BaseModel):
        n: int

    @app.post("/_t/validate")
    async def _validate(body: Body) -> dict:
        return {}

    @app.get("/_t/conflict")
    async def _conflict() -> dict:
        raise EditConflictError(
            "버전 충돌", [ErrorDetail(message="row_version 불일치", field_path="/row_version")]
        )

    return TestClient(app)


def test_health_ok_and_request_id_generated():
    r = _client().get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"data": {"status": "ok"}}
    assert r.headers["X-Request-ID"].startswith("req-")


def test_valid_request_id_is_echoed_and_invalid_replaced():
    c = _client()
    assert c.get("/api/v1/health", headers={"X-Request-ID": "abc-1"}).headers["X-Request-ID"] == "abc-1"
    bad = c.get("/api/v1/health", headers={"X-Request-ID": "bad id\twith space"})
    assert bad.headers["X-Request-ID"].startswith("req-")


def test_domain_error_uses_envelope_without_null_fields():
    r = _client().get("/_t/conflict", headers={"X-Request-ID": "rid-9"})
    assert r.status_code == 412
    err = r.json()["error"]
    assert err["code"] == "EDIT_CONFLICT"
    assert err["request_id"] == "rid-9"
    assert err["details"] == [
        {"message": "row_version 불일치", "severity": "error", "field_path": "/row_version"}
    ]


def test_framework_validation_error_converted_to_envelope():
    r = _client().post("/_t/validate", json={"n": "x"})
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["code"] == "VALIDATION_ERROR"
    assert err["details"][0]["field_path"] == "/n"


def test_unknown_route_uses_envelope():
    r = _client().get("/api/v1/nope")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "NOT_FOUND"
