"""T4·T5·T6: 자산 생성·수정·재조회, 내부 ID와 표시 코드, unknown/0/무제한 보존, 수정 충돌."""

import pytest
from conftest import PROJECT_A, RUN, data, error_code


@pytest.fixture(scope="module")
def equipment(admin):
    resp = admin.post(
        f"/projects/{PROJECT_A}/assets",
        {"kind": "equipment", "code": f"INT{RUN}-EQ", "name": "[INT] 시험 설비", "equipment": {"equipment_type": "extruder"}},
    )
    return data(resp, 201), resp.headers["etag"]


def test_t4_equipment_creates_in_and_out_ports_atomically(equipment, db):
    asset, etag = equipment
    assert etag == '"1"'
    assert sorted(p["role"] for p in asset["ports"]) == ["IN", "OUT"]
    n = db.execute("select count(*) from asset_port where asset_id = %s", (asset["id"],)).fetchone()[0]
    assert n == 2


def test_t4_display_code_change_keeps_internal_identity(admin, equipment):
    asset, _ = equipment
    url = f"/projects/{PROJECT_A}/assets/{asset['id']}"
    etag = admin.get(url).headers["etag"]
    new_code = f"INT{RUN}-EQ-R"
    changed = data(admin.patch(url, {"code": new_code}, etag=etag))
    assert changed["id"] == asset["id"]
    assert changed["code"] == new_code
    assert {p["id"] for p in changed["ports"]} == {p["id"] for p in asset["ports"]}
    # 표시 코드로 찾아도 같은 내부 ID이다.
    found = data(admin.get(f"/projects/{PROJECT_A}/assets", params={"q": new_code}))
    assert [a["id"] for a in found] == [asset["id"]]


def test_t4_duplicate_code_in_project_is_409(admin, equipment):
    asset, _ = equipment
    current = data(admin.get(f"/projects/{PROJECT_A}/assets/{asset['id']}"))
    r = admin.post(f"/projects/{PROJECT_A}/assets", {"kind": "equipment", "code": current["code"], "name": "중복", "equipment": {"equipment_type": "extruder"}})
    assert r.status_code == 409 and error_code(r) == "ASSET_CODE_CONFLICT"


def test_t6_stale_if_match_returns_412_and_keeps_first_write(admin, equipment):
    asset, _ = equipment
    url = f"/projects/{PROJECT_A}/assets/{asset['id']}"
    etag = admin.get(url).headers["etag"]
    first = admin.patch(url, {"name": "[INT] 첫 수정"}, etag=etag)
    stale = admin.patch(url, {"name": "[INT] 늦은 수정"}, etag=etag)
    assert first.status_code == 200
    assert stale.status_code == 412 and error_code(stale) == "EDIT_CONFLICT"
    assert data(admin.get(url))["name"] == "[INT] 첫 수정"  # 마지막 저장 승리가 아니다.


def test_t6_missing_if_match_returns_428(admin, equipment):
    asset, _ = equipment
    r = admin.patch(f"/projects/{PROJECT_A}/assets/{asset['id']}", {"name": "x"})
    assert r.status_code == 428 and error_code(r) == "PRECONDITION_REQUIRED"


def test_t6_wildcard_if_match_is_rejected(admin, equipment):
    asset, _ = equipment
    r = admin.patch(f"/projects/{PROJECT_A}/assets/{asset['id']}", {"name": "x"}, etag="*")
    assert r.status_code == 422


def _new_revision(admin, asset_id):
    r = admin.post(f"/projects/{PROJECT_A}/assets/{asset_id}/revisions")
    return data(r, 201), r.headers["etag"]


def test_t5_capacity_unknown_unlimited_not_allowed_finite_are_distinct(admin, equipment, db):
    """미정·유한·무제한·허용 안 함이 저장 후 재조회에서 서로 다른 값으로 남는다(04 §3.2: 0은 용량이 아니다)."""
    asset, _ = equipment
    rev, etag = _new_revision(admin, asset["id"])
    in_port = next(p for p in rev["ports"] if p["role"] == "IN")
    out_port = next(p for p in rev["ports"] if p["role"] == "OUT")
    assert in_port["buffer_capacity"]["mode"] == "unknown"  # 초기값은 미정이며 0·무제한이 아니다.

    url = f"/projects/{PROJECT_A}/asset-revisions/{rev['id']}"
    zero = admin.patch(url, {"ports": [{"port_id": in_port["port_id"], "buffer_capacity": {"mode": "finite", "value": "0", "unit": "item"}}]}, etag=etag)
    assert zero.status_code == 422 and error_code(zero) == "VALIDATION_ERROR"  # 0은 용량이 될 수 없다.
    assert data(admin.get(url))["row_version"] == 1  # 거부된 요청은 아무것도 바꾸지 않는다.

    ok = admin.patch(
        url,
        {"ports": [
            {"port_id": in_port["port_id"], "buffer_capacity": {"mode": "finite", "value": "4", "unit": "item"}},
            {"port_id": out_port["port_id"], "buffer_capacity": {"mode": "unlimited"}},
        ]},
        etag=etag,
    )
    assert data(ok)["row_version"] == 2
    got = {p["role"]: p["buffer_capacity"] for p in data(admin.get(url))["ports"]}
    assert got["IN"]["mode"] == "finite" and str(got["IN"]["value"]) == "4" and got["IN"]["unit"] == "item"
    assert got["OUT"]["mode"] == "unlimited" and got["OUT"]["value"] is None

    etag2 = admin.get(url).headers["etag"]
    data(admin.patch(url, {"ports": [{"port_id": out_port["port_id"], "buffer_capacity": {"mode": "not_allowed"}}]}, etag=etag2))
    got = {p["role"]: p["buffer_capacity"] for p in data(admin.get(url))["ports"]}
    assert got["OUT"]["mode"] == "not_allowed" and got["OUT"]["value"] is None
    assert got["IN"]["mode"] == "finite"  # 보내지 않은 포트는 보존된다.
    modes = {m for (m,) in db.execute(
        "select buffer_capacity->>'mode' from port_policy where asset_revision_id = %s", (rev["id"],)).fetchall()}
    assert modes == {"finite", "not_allowed"}


def test_t5_finite_capacity_requires_value_and_unit(admin, equipment):
    asset, _ = equipment
    cur = data(admin.get(f"/projects/{PROJECT_A}/assets/{asset['id']}/revisions"))
    rev = next(r for r in cur if r["status"] == "draft")
    port = rev["ports"][0]["port_id"]
    etag = admin.get(f"/projects/{PROJECT_A}/asset-revisions/{rev['id']}").headers["etag"]
    r = admin.patch(f"/projects/{PROJECT_A}/asset-revisions/{rev['id']}", {"ports": [{"port_id": port, "buffer_capacity": {"mode": "finite", "value": "3"}}]}, etag=etag)
    assert r.status_code == 422 and error_code(r) == "VALIDATION_ERROR"
