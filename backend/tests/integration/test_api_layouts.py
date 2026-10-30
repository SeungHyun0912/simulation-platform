"""BE-21(CR be18): 배치판(점·배치·포트 매핑·경로) API를 실제 PostgreSQL로 검증한다."""

import uuid
from decimal import Decimal

from helpers import create_project, equipment_body
from sqlalchemy.exc import DBAPIError
from test_api_scenarios import ctx, etag, ok  # noqa: F401

API = "/api/v1"


def ports_of(client, ctx, asset_id):
    asset = ok(client.get(f"{ctx['base']}/assets/{asset_id}", headers=ctx["viewer"]))
    return {p["role"]: p["id"] for p in asset["ports"]}


def new_draft(client, ctx, body=None):
    return ok(client.post(f"{ctx['base']}/layout-versions", json=body, headers=ctx["editor"]), 201)


def put(client, ctx, version, content, who="editor"):
    return client.put(f"{ctx['base']}/layout-versions/{version['id']}/content", json=content,
                      headers=etag(ctx, who, version["row_version"]))


def content(ctx, eq, st, *, route_points=("P1", "P2", "P3")):
    return {
        "points": [{"point_key": "P1", "x_m": "10.04", "y_m": "5"}, {"point_key": "P2", "x_m": "13.04", "y_m": "5"},
                   {"point_key": "P3", "x_m": "13.04", "y_m": "9.05", "attributes": {"note": "모퉁이"}}],
        "placements": [{"asset_id": ctx["equipment"], "x_m": "8.25", "y_m": "5", "width_m": "3.04", "height_m": "2",
                        "rotation_deg": "90"},
                       {"asset_id": ctx["storage"], "x_m": "13", "y_m": "11", "attributes": {"color": "#ccc"}}],
        "port_points": [{"port_id": eq["OUT"], "point_key": "P1"}, {"port_id": st["ACCESS"], "point_key": "P3"}],
        "routes": [{"route_key": "R1", "from_port_id": eq["OUT"], "to_port_id": st["ACCESS"], "mode": "forklift",
                    "points": list(route_points)}]}


def test_a_draft_layout_stores_points_placements_port_points_and_routes_rounded_to_one_decimal(client, ctx):
    eq, st = ports_of(client, ctx, ctx["equipment"]), ports_of(client, ctx, ctx["storage"])
    draft = new_draft(client, ctx)
    assert (draft["version_no"], draft["status"], draft["points"]) == (1, "draft", [])
    assert draft["coordinate_system"] == {"unit": "m", "origin": "top_left", "x_axis": "right", "y_axis": "down",
                                          "anchor": "center", "precision": "0.1"}
    r = put(client, ctx, draft, content(ctx, eq, st))
    saved = ok(r)
    assert r.headers["ETag"] == f'"{draft["row_version"] + 1}"'
    assert [(p["point_key"], p["x_m"], p["y_m"]) for p in saved["points"]] == [
        ("P1", "10.0", "5.0"), ("P2", "13.0", "5.0"), ("P3", "13.0", "9.1")]  # 9.05 → 9.1(반올림)
    machine = next(p for p in saved["placements"] if p["asset_id"] == ctx["equipment"])
    assert (machine["x_m"], machine["width_m"], machine["height_m"], machine["rotation_deg"]) == ("8.3", "3.0", "2.0", "90.0")
    space = next(p for p in saved["placements"] if p["asset_id"] == ctx["storage"])
    assert (space["width_m"], space["rotation_deg"], space["attributes"]) == (None, None, {"color": "#ccc"})
    assert {(m["role"], m["point_key"]) for m in saved["port_points"]} == {("OUT", "P1"), ("ACCESS", "P3")}
    [route] = saved["routes"]
    assert (route["points"], route["mode"], route["from_asset_id"], route["to_asset_id"]) == (
        ["P1", "P2", "P3"], "forklift", ctx["equipment"], ctx["storage"])
    assert Decimal(route["length_m"]) == Decimal("7.1")  # 3.0 + 4.1
    assert ok(client.get(f"{ctx['base']}/layout-versions/{draft['id']}", headers=ctx["viewer"])) == saved


def test_saving_rejects_broken_content_without_changing_the_draft(client, ctx):
    eq, st = ports_of(client, ctx, ctx["equipment"]), ports_of(client, ctx, ctx["storage"])
    draft = new_draft(client, ctx)
    broken = content(ctx, eq, st, route_points=("P1", "P9"))
    broken["points"].append({"point_key": "P1", "x_m": "1", "y_m": "1"})
    r = put(client, ctx, draft, broken)
    assert r.status_code == 422 and r.json()["error"]["code"] == "VALIDATION_ERROR"
    assert {d["rule_id"] for d in r.json()["error"]["details"]} >= {"LAY-SAVE-001", "LAY-SAVE-003"}
    foreign = content(ctx, eq, st)
    foreign["placements"][0]["asset_id"] = "00000000-0000-4000-8000-000000000001"
    assert {d["rule_id"] for d in put(client, ctx, draft, foreign).json()["error"]["details"]} == {"LAY-SAVE-004"}
    tiny = content(ctx, eq, st)
    tiny["placements"][0]["width_m"] = "0.04"
    assert {d["rule_id"] for d in put(client, ctx, draft, tiny).json()["error"]["details"]} == {"LAY-SAVE-010"}
    assert ok(client.get(f"{ctx['base']}/layout-versions/{draft['id']}", headers=ctx["viewer"]))["points"] == []


def test_validation_gates_approval_and_an_approved_layout_is_frozen(client, ctx, db):
    eq, st = ports_of(client, ctx, ctx["equipment"]), ports_of(client, ctx, ctx["storage"])
    draft = new_draft(client, ctx)
    draft = ok(put(client, ctx, draft, content(ctx, eq, st, route_points=("P2", "P3"))))  # 첫 점이 출발 포트의 점(P1)이 아님
    check = ok(client.post(f"{ctx['base']}/layout-versions/{draft['id']}/validate", headers=ctx["viewer"]))
    assert (check["approvable"], [i["rule_id"] for i in check["issues"] if i["severity"] == "error"]) == (False, ["LAY-001"])
    assert any(i["rule_id"] == "LAY-006" for i in check["issues"])  # 공간 크기 모름: 경고
    approve = client.post(f"{ctx['base']}/layout-versions/{draft['id']}/approve",
                          headers=etag(ctx, "admin", draft["row_version"]))
    assert approve.status_code == 422 and approve.json()["error"]["code"] == "LAYOUT_VALIDATION_FAILED"
    draft = ok(put(client, ctx, draft, content(ctx, eq, st)))
    assert client.post(f"{ctx['base']}/layout-versions/{draft['id']}/approve",
                       headers=etag(ctx, "editor", draft["row_version"])).status_code == 403  # admin만
    approved = ok(client.post(f"{ctx['base']}/layout-versions/{draft['id']}/approve",
                              headers=etag(ctx, "admin", draft["row_version"])))
    assert approved["status"] == "approved" and approved["approved_by"]
    r = put(client, ctx, approved, content(ctx, eq, st))
    assert r.status_code == 409 and r.json()["error"]["code"] == "VERSION_IMMUTABLE"
    try:  # DB도 승인본의 하위 행을 막는다
        db.run(("UPDATE layout_point SET x_m = 1 WHERE layout_version_id = :v", {"v": approved["id"]}))
        raise AssertionError("approved layout_point must be immutable")
    except DBAPIError as error:
        assert error.orig.sqlstate == "23001"
    # 새 초안은 최근 승인본을 통째로 복사한다
    copy = new_draft(client, ctx)
    assert (copy["version_no"], copy["base_version_id"]) == (2, approved["id"])
    assert [p["point_key"] for p in copy["points"]] == ["P1", "P2", "P3"] and copy["routes"][0]["length_m"] == "7.1"
    again = client.post(f"{ctx['base']}/layout-versions", headers=ctx["editor"])
    assert again.status_code == 409 and again.json()["error"]["code"] == "LAYOUT_DRAFT_EXISTS"
    listed = ok(client.get(f"{ctx['base']}/layout-versions", headers=ctx["viewer"]))
    assert [v["version_no"] for v in listed] == [2, 1]
    assert db.scalar("SELECT count(*) FROM layout_route_point WHERE layout_version_id = :v", v=copy["id"]) == 3


def test_patch_header_and_permissions(client, ctx, world):
    draft = new_draft(client, ctx)
    patched = ok(client.patch(f"{ctx['base']}/layout-versions/{draft['id']}",
                              json={"name": "1공장 1층", "canvas_width_m": "120.06", "canvas_height_m": "80",
                                    "attributes": {"background": "floor1.png"}},
                              headers=etag(ctx, "editor", draft["row_version"])))
    assert (patched["name"], patched["canvas_width_m"], patched["canvas_height_m"], patched["attributes"]) == (
        "1공장 1층", "120.1", "80.0", {"background": "floor1.png"})
    stale = client.patch(f"{ctx['base']}/layout-versions/{draft['id']}", json={"notes": "x"},
                         headers=etag(ctx, "editor", draft["row_version"]))
    assert stale.status_code == 412
    assert client.patch(f"{ctx['base']}/layout-versions/{draft['id']}", json={"notes": "x"},
                        headers=ctx["editor"]).status_code == 428
    assert client.put(f"{ctx['base']}/layout-versions/{draft['id']}/content", json={},
                      headers=etag(ctx, "viewer", patched["row_version"])).status_code == 403
    assert client.get(f"{ctx['base']}/layout-versions/{draft['id']}", headers=ctx["outsider"]).status_code == 404
    other, _ = create_project(client, world)
    assert client.get(f"{API}/projects/{other}/layout-versions/{draft['id']}", headers=ctx["admin"]).status_code == 404


def test_aisles_make_a_network_and_paths_are_computed_to_each_candidate_machine(client, ctx):
    """CR be19: 저장공간 → 후보 설비 2대(택1). 통로를 한 번 그리고 포트는 짧게 이으면 서버가 쌍마다 최단 경로를 계산한다.
    같은 출발·도착 포트로 저장한 고정 경로가 있으면 그것을 먼저 쓴다."""
    other = ok(client.post(f"{ctx['base']}/assets", json=equipment_body(f"EQ-{uuid.uuid4().hex[:6]}"),
                           headers=ctx["admin"]), 201)["id"]
    st, eq1, eq2 = ports_of(client, ctx, ctx["storage"]), ports_of(client, ctx, ctx["equipment"]), ports_of(client, ctx, other)
    body = {
        "points": [{"point_key": k, "x_m": x, "y_m": y} for k, x, y in (
            ("P1", "2", "0"), ("P2", "10", "0"), ("P3", "20", "0"), ("P4", "10", "5"), ("P5", "20", "5"),
            ("P6", "40", "40"))],
        "port_points": [{"port_id": st["ACCESS"], "point_key": "P1"}, {"port_id": eq1["IN"], "point_key": "P4"},
                        {"port_id": eq2["IN"], "point_key": "P5"}, {"port_id": eq1["OUT"], "point_key": "P6"}],
        "aisles": [{"aisle_key": "W1", "points": ["P1", "P2", "P3"]}, {"aisle_key": "W2", "points": ["P2", "P4"]},
                   {"aisle_key": "W3", "points": ["P3", "P5"], "attributes": {"note": "편조기 줄"}}],
        "routes": []}
    draft = new_draft(client, ctx)
    saved = ok(put(client, ctx, draft, body))
    assert [(a["aisle_key"], a["points"], a["length_m"]) for a in saved["aisles"]] == [
        ("W1", ["P1", "P2", "P3"], "18.0"), ("W2", ["P2", "P4"], "5.0"), ("W3", ["P3", "P5"], "5.0")]
    paths_url = f"{ctx['base']}/layout-versions/{draft['id']}/paths"
    pairs = [{"from_port_id": st["ACCESS"], "to_port_id": eq1["IN"]}, {"from_port_id": st["ACCESS"], "to_port_id": eq2["IN"]},
             {"from_port_id": eq1["IN"], "to_port_id": st["ACCESS"]}, {"from_port_id": eq1["OUT"], "to_port_id": eq2["IN"]},
             {"from_port_id": eq2["OUT"], "to_port_id": eq1["IN"]}]
    got = ok(client.post(paths_url, json={"pairs": pairs}, headers=ctx["viewer"]))
    assert [(p["reachable"], p["source"], p["points"], p["length_m"]) for p in got[:3]] == [
        (True, "computed", ["P1", "P2", "P4"], "13.0"), (True, "computed", ["P1", "P2", "P3", "P5"], "23.0"),
        (True, "computed", ["P4", "P2", "P1"], "13.0")]  # 양방향
    assert (got[3]["reachable"], got[3]["length_m"]) == (False, None) and "이어진" in got[3]["reason"]  # 고립된 점
    assert got[4]["reachable"] is False and "매핑되지 않았" in got[4]["reason"]
    check = ok(client.post(f"{ctx['base']}/layout-versions/{draft['id']}/validate", headers=ctx["viewer"]))
    assert {(i["rule_id"], i["field_path"]) for i in check["issues"] if i["rule_id"] == "LAY-009"} == {
        ("LAY-009", f"/port_points/{eq1['OUT']}")}
    # 고정 경로를 저장하면 그 쌍은 고정 경로가 우선이다. 통로를 고치면 계산 경로가 다음 조회부터 바로 바뀐다.
    body["routes"] = [{"route_key": "R1", "from_port_id": st["ACCESS"], "to_port_id": eq2["IN"], "points": ["P1", "P5"]}]
    body["points"][1]["y_m"] = "3"  # P2를 옮긴다
    saved = ok(put(client, ctx, saved, body))
    got = ok(client.post(paths_url, json={"pairs": pairs[:2]}, headers=ctx["viewer"]))
    assert (got[1]["source"], got[1]["route_key"], got[1]["points"], got[1]["length_m"]) == ("fixed", "R1", ["P1", "P5"], "18.7")
    assert (got[0]["source"], got[0]["length_m"]) == ("computed", "10.5")  # √(8²+3²) + 2 = 8.54 + 2.0
    assert client.post(paths_url, json={"pairs": []}, headers=ctx["viewer"]).status_code == 422
    # 복사한 새 초안에도 통로가 따라온다
    approved = ok(client.post(f"{ctx['base']}/layout-versions/{draft['id']}/approve",
                              headers=etag(ctx, "admin", saved["row_version"])))
    copy = new_draft(client, ctx)
    assert [a["aisle_key"] for a in copy["aisles"]] == ["W1", "W2", "W3"] and copy["base_version_id"] == approved["id"]
    bad = put(client, ctx, copy, {"points": body["points"], "aisles": [{"aisle_key": "W1", "points": ["P1", "P9"]}]})
    assert bad.status_code == 422 and {d["rule_id"] for d in bad.json()["error"]["details"]} == {"LAY-SAVE-003"}
