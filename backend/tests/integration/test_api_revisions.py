"""BE-02: 자산 버전·포트 정책 API를 실제 PostgreSQL로 검증한다(CR-backend-20261023-be02)."""

import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from helpers import create_project, equipment_body, headers, project_with_members, space_body

API = "/api/v1"
UNKNOWN = {"mode": "unknown", "value": None, "unit": None, "status": "unknown"}


def finite(value, unit="item"):
    return {"mode": "finite", "value": value, "unit": unit}


@pytest.fixture
def ctx(db, client, world):
    pid = project_with_members(db, client, world)
    users = world["users"]
    return {"pid": pid, "world": world, "admin": headers(users["admin"]),
            "editor": headers(users["editor"]), "viewer": headers(users["viewer"]),
            "outsider": headers(users["outsider"])}


def asset_url(ctx, *parts):
    return "/".join([f"{API}/projects/{ctx['pid']}/assets", *map(str, parts)])


def rev_url(ctx, rid, *parts):
    return "/".join([f"{API}/projects/{ctx['pid']}/asset-revisions", str(rid), *parts])


def new_asset(client, ctx, body):
    r = client.post(asset_url(ctx), json=body, headers=ctx["admin"])
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


def new_revision(client, ctx, asset_id, who="editor"):
    r = client.post(asset_url(ctx, asset_id, "revisions"), headers=ctx[who])
    assert r.status_code == 201, r.text
    return r.json()["data"]


def with_version(ctx, who, version):
    return {**ctx[who], "If-Match": f'"{version}"'}


@pytest.fixture
def equipment(client, ctx):
    asset_id = new_asset(client, ctx, equipment_body(f"EQ-{uuid.uuid4().hex[:6]}"))
    return asset_id, new_revision(client, ctx, asset_id)


@pytest.fixture
def space(client, ctx):
    asset_id = new_asset(client, ctx, space_body(f"ST-{uuid.uuid4().hex[:6]}"))
    return asset_id, new_revision(client, ctx, asset_id)


def advance(client, ctx, revision, steps):
    """submit/approve를 차례로 수행하고 최신 revision을 반환."""
    for step, who in steps:
        r = client.post(rev_url(ctx, revision["id"], step),
                        headers=with_version(ctx, who, revision["row_version"]))
        assert r.status_code == 200, r.text
        revision = r.json()["data"]
    return revision


# --- 생성 기본값 ---------------------------------------------------------------------

def test_equipment_revision_defaults_are_unknown_not_zero(client, equipment):
    _, rev = equipment
    assert rev["revision_no"] == 1 and rev["status"] == "draft" and rev["row_version"] == 1
    assert rev["storage_capacity"] is None and rev["schema_version"] == "1.0"
    assert [p["role"] for p in rev["ports"]] == ["IN", "OUT"]
    for port in rev["ports"]:
        assert port["buffer_capacity"] == UNKNOWN
        assert port["dispatch_rule"] == {"mode": "when_destination_available",
                                         "reservation": "unknown", "wait_at_in_if_busy": True}
        assert port["release_rule"] == {"mode": "when_destination_accepts",
                                        "block_machine_while_waiting": "unknown"}
    rules = sorted(i["rule_id"] for i in rev["issues"])
    assert rules == ["VAL-CAP-001"] * 2 + ["VAL-POLICY-001"] * 2 + ["VAL-POLICY-002"] * 2
    assert all(i["severity"] == "warning" and i["entity_id"] == rev["id"] for i in rev["issues"])
    assert rev["approved_at"] is None and rev["rejection_reason"] is None


def test_space_revision_has_storage_capacity_and_no_port_policies(space):
    _, rev = space
    assert rev["storage_capacity"] == UNKNOWN and rev["ports"] == []
    assert [i["rule_id"] for i in rev["issues"]] == ["VAL-CAP-001"]
    assert rev["issues"][0]["field_path"] == "/storage_capacity"


def test_create_returns_etag_and_location(client, ctx):
    aid = new_asset(client, ctx, space_body("ST-LOC"))
    r = client.post(asset_url(ctx, aid, "revisions"), headers=ctx["admin"])
    assert r.status_code == 201 and r.headers["ETag"] == '"1"'
    assert r.headers["Location"].endswith(f"/asset-revisions/{r.json()['data']['id']}")


def test_create_permissions_and_scope(client, ctx):
    aid = new_asset(client, ctx, space_body("ST-PERM"))
    url = asset_url(ctx, aid, "revisions")
    assert client.post(url, headers=ctx["viewer"]).status_code == 403
    assert client.post(url, headers=ctx["outsider"]).status_code == 404
    assert client.post(url).status_code == 401
    other, _ = create_project(client, ctx["world"])
    cross = f"{API}/projects/{other}/assets/{aid}/revisions"
    assert client.post(cross, headers=ctx["admin"]).status_code == 404
    assert client.post(asset_url(ctx, uuid.uuid4(), "revisions"),
                       headers=ctx["admin"]).status_code == 404


def test_only_one_open_revision_per_asset(client, ctx, space):
    aid, _ = space
    dup = client.post(asset_url(ctx, aid, "revisions"), headers=ctx["editor"])
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "REVISION_DRAFT_EXISTS"
    other = new_asset(client, ctx, space_body("ST-OTHER"))
    assert client.post(asset_url(ctx, other, "revisions"), headers=ctx["editor"]).status_code == 201


# --- 수정과 용량 검증 -------------------------------------------------------------------

def test_patch_storage_capacity_and_notes(client, ctx, space):
    _, rev = space
    r = client.patch(rev_url(ctx, rev["id"]), headers=with_version(ctx, "editor", 1),
                     json={"storage_capacity": finite("12"), "notes": "메모"})
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert r.headers["ETag"] == '"2"' and data["row_version"] == 2
    assert data["storage_capacity"] == {"mode": "finite", "value": "12", "unit": "item",
                                        "status": "confirmed"}
    assert data["notes"] == "메모" and data["issues"] == []  # 미정 경고가 사라짐
    cleared = client.patch(rev_url(ctx, rev["id"]), headers=with_version(ctx, "editor", 2),
                           json={"notes": None})
    assert cleared.json()["data"]["notes"] is None


def test_patch_ports_merges_by_port_id_and_keeps_others(client, ctx, equipment):
    _, rev = equipment
    port_in, port_out = rev["ports"]
    r = client.patch(rev_url(ctx, rev["id"]), headers=with_version(ctx, "editor", 1), json={
        "ports": [{"port_id": port_in["port_id"], "buffer_capacity": finite("4"),
                   "release_rule": {"mode": "when_destination_accepts",
                                    "block_machine_while_waiting": "yes"}}]})
    assert r.status_code == 200, r.text
    ports = {p["role"]: p for p in r.json()["data"]["ports"]}
    assert ports["IN"]["buffer_capacity"]["value"] == "4"
    assert ports["IN"]["release_rule"]["block_machine_while_waiting"] == "yes"
    assert ports["IN"]["dispatch_rule"] == port_in["dispatch_rule"]  # 보내지 않은 필드는 유지
    assert ports["OUT"] == port_out  # 보내지 않은 포트는 그대로
    paths = {i["field_path"] for i in r.json()["data"]["issues"]}
    assert "/ports/0/buffer_capacity" not in paths and "/ports/1/buffer_capacity" in paths


def test_capacity_modes_not_allowed_unlimited_and_other_units(client, ctx, equipment):
    _, rev = equipment
    pin, pout = (p["port_id"] for p in rev["ports"])
    r = client.patch(rev_url(ctx, rev["id"]), headers=with_version(ctx, "editor", 1), json={
        "ports": [{"port_id": pin, "buffer_capacity": {"mode": "not_allowed"}},
                  {"port_id": pout, "buffer_capacity": finite("12.5", "kg")}]})
    assert r.status_code == 200, r.text
    ports = {p["role"]: p for p in r.json()["data"]["ports"]}
    assert ports["IN"]["buffer_capacity"] == {"mode": "not_allowed", "value": None,
                                              "unit": None, "status": "confirmed"}
    assert ports["OUT"]["buffer_capacity"]["value"] == "12.5"
    rules = [i["rule_id"] for i in r.json()["data"]["issues"]]
    assert "VAL-CAP-002" in rules  # kg는 등록 가능하지만 엔진 미지원 경고


@pytest.mark.parametrize("capacity,label", [
    ({"mode": "finite"}, "finite without value"),
    ({"mode": "finite", "value": "4"}, "finite without unit"),
    (finite("0"), "zero"),
    (finite("1.5"), "decimal item"),
    (finite("007"), "leading zeros"),
    (finite("-3"), "negative"),
    (finite("0.000000", "kg"), "zero kg"),
    (finite("1.1234567", "kg"), "too many decimals"),
    (finite("4", "bobbin"), "unsupported unit"),
    ({"mode": "unknown", "value": "1"}, "unknown with value"),
    ({"mode": "unlimited", "unit": "item"}, "unlimited with unit"),
    ({"mode": "not_allowed", "value": "0", "unit": "item"}, "not_allowed with zero"),
    ({"mode": "unknown", "status": "confirmed"}, "status mismatch"),
    ({**finite("4"), "status": "assumed"}, "assumed in master"),
    ({"mode": "not_applicable"}, "not_applicable mode"),
    ({**finite("4"), "extra": 1}, "extra field"),
])
def test_invalid_capacity_is_rejected(client, ctx, space, capacity, label):
    _, rev = space
    r = client.patch(rev_url(ctx, rev["id"]), headers=with_version(ctx, "editor", 1),
                     json={"storage_capacity": capacity})
    assert r.status_code == 422, label
    assert r.json()["error"]["code"] == "VALIDATION_ERROR", label
    stored = client.get(rev_url(ctx, rev["id"]), headers=ctx["viewer"]).json()["data"]
    assert stored["storage_capacity"] == UNKNOWN and stored["row_version"] == 1, label


def test_patch_structural_rejections(client, ctx, equipment, space):
    _, eq = equipment
    _, sp = space
    h = with_version(ctx, "editor", 1)
    foreign = {"ports": [{"port_id": str(uuid.uuid4()), "buffer_capacity": finite("1")}]}
    for url, body, label in [
        (rev_url(ctx, eq["id"]), {"storage_capacity": finite("1")}, "capacity on equipment"),
        (rev_url(ctx, sp["id"]), {"ports": [{"port_id": eq["ports"][0]["port_id"],
                                             "buffer_capacity": finite("1")}]}, "ports on space"),
        (rev_url(ctx, eq["id"]), foreign, "unknown port id"),
        (rev_url(ctx, eq["id"]), {}, "empty body"),
        (rev_url(ctx, eq["id"]), {"ports": []}, "empty ports"),
        (rev_url(ctx, eq["id"]), {"ports": [{"port_id": eq["ports"][0]["port_id"]}]}, "no change"),
        (rev_url(ctx, eq["id"]), {"ports": [{"port_id": eq["ports"][0]["port_id"],
                                             "dispatch_rule": {"mode": "teleport"}}]}, "bad rule"),
        (rev_url(ctx, eq["id"]), {"status": "approved"}, "status in body"),
        (rev_url(ctx, eq["id"]), {"storage_capacity": None}, "null capacity"),
    ]:
        r = client.patch(url, json=body, headers=h)
        assert r.status_code == 422, label


def test_patch_etag_and_permissions(client, ctx, space):
    _, rev = space
    url = rev_url(ctx, rev["id"])
    body = {"storage_capacity": finite("3")}
    assert client.patch(url, json=body, headers=ctx["editor"]).status_code == 428
    stale = client.patch(url, json=body, headers=with_version(ctx, "editor", 9))
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "EDIT_CONFLICT"
    assert client.patch(url, json=body, headers=with_version(ctx, "viewer", 1)).status_code == 403
    assert client.patch(url, json=body, headers=with_version(ctx, "outsider", 1)).status_code == 404
    assert client.patch(url, json=body, headers=with_version(ctx, "editor", 1)).status_code == 200


def test_concurrent_patches_only_one_wins(make_client, client, ctx, space):
    _, rev = space
    clients = [make_client() for _ in range(4)]

    def attempt(i):
        return clients[i].patch(rev_url(ctx, rev["id"]), json={"storage_capacity": finite(str(i + 1))},
                                headers=with_version(ctx, "editor", 1)).status_code

    with ThreadPoolExecutor(4) as pool:
        assert sorted(pool.map(attempt, range(4))) == [200, 412, 412, 412]


# --- 승인 흐름 -------------------------------------------------------------------------

def test_submit_freezes_content_and_reject_returns_to_draft_with_reason(client, ctx, space):
    _, rev = space
    submitted = advance(client, ctx, rev, [("submit", "editor")])
    assert submitted["status"] == "in_review" and submitted["submitted_at"]
    assert submitted["submitted_by"] == str(ctx["world"]["users"]["editor"])
    frozen = client.patch(rev_url(ctx, rev["id"]), json={"notes": "x"},
                          headers=with_version(ctx, "editor", submitted["row_version"]))
    assert frozen.status_code == 409 and frozen.json()["error"]["code"] == "VERSION_IMMUTABLE"

    version = submitted["row_version"]
    no_reason = client.post(rev_url(ctx, rev["id"], "reject"), json={},
                            headers=with_version(ctx, "admin", version))
    assert no_reason.status_code == 422
    by_editor = client.post(rev_url(ctx, rev["id"], "reject"), json={"reason": "r"},
                            headers=with_version(ctx, "editor", version))
    assert by_editor.status_code == 403
    rejected = client.post(rev_url(ctx, rev["id"], "reject"), json={"reason": "  용량 근거 필요  "},
                           headers=with_version(ctx, "admin", version))
    assert rejected.status_code == 200
    data = rejected.json()["data"]
    assert data["status"] == "draft" and data["rejection_reason"] == "용량 근거 필요"
    assert data["rejected_at"] and data["submitted_at"] is None
    again = client.patch(rev_url(ctx, rev["id"]), json={"storage_capacity": finite("5")},
                         headers=with_version(ctx, "editor", data["row_version"]))
    assert again.status_code == 200  # 반려 후 다시 수정 가능
    resubmitted = advance(client, ctx, again.json()["data"], [("submit", "editor")])
    assert resubmitted["rejection_reason"] is None  # 다시 제출하면 반려 사유를 비운다


def test_approve_requires_admin_and_records_approver(client, ctx, space):
    aid, rev = space
    in_review = advance(client, ctx, rev, [("submit", "editor")])
    url = rev_url(ctx, rev["id"], "approve")
    version = in_review["row_version"]
    assert client.post(url, headers=with_version(ctx, "editor", version)).status_code == 403
    assert client.post(url, headers=with_version(ctx, "viewer", version)).status_code == 403
    assert client.post(url, headers=ctx["admin"]).status_code == 428
    approved = client.post(url, headers=with_version(ctx, "admin", version))
    assert approved.status_code == 200, approved.text
    data = approved.json()["data"]
    assert data["status"] == "approved" and data["approved_at"]
    assert data["approved_by"] == str(ctx["world"]["users"]["admin"])
    # 미정 용량이 있어도 승인은 막지 않는다(경고만)
    assert [i["rule_id"] for i in data["issues"]] == ["VAL-CAP-001"]
    asset = client.get(asset_url(ctx, aid), headers=ctx["viewer"]).json()["data"]
    assert asset["current_revision"]["id"] == rev["id"]
    assert asset["latest_revision"]["status"] == "approved"


def test_invalid_transitions_and_stale_versions(client, ctx, space):
    _, rev = space
    approve = rev_url(ctx, rev["id"], "approve")
    draft_approve = client.post(approve, headers=with_version(ctx, "admin", 1))
    assert draft_approve.status_code == 409
    assert draft_approve.json()["error"]["code"] == "INVALID_STATE_TRANSITION"
    reject = client.post(rev_url(ctx, rev["id"], "reject"), json={"reason": "x"},
                         headers=with_version(ctx, "admin", 1))
    assert reject.status_code == 409
    submitted = advance(client, ctx, rev, [("submit", "editor")])
    resubmit = client.post(rev_url(ctx, rev["id"], "submit"),
                           headers=with_version(ctx, "editor", submitted["row_version"]))
    assert resubmit.status_code == 409
    # 검토 도중 반려로 버전이 바뀌면 이전 화면의 승인은 거부된다(승인 직전 수정 방지)
    rejected = client.post(rev_url(ctx, rev["id"], "reject"), json={"reason": "다시"},
                           headers=with_version(ctx, "admin", submitted["row_version"]))
    assert rejected.status_code == 200
    stale = client.post(approve, headers=with_version(ctx, "admin", submitted["row_version"]))
    assert stale.status_code == 412


def test_new_revision_copies_approved_values_and_supersedes_on_approval(client, ctx, equipment):
    aid, rev = equipment
    pin, pout = (p["port_id"] for p in rev["ports"])
    patched = client.patch(rev_url(ctx, rev["id"]), headers=with_version(ctx, "editor", 1), json={
        "ports": [{"port_id": pin, "buffer_capacity": finite("4")},
                  {"port_id": pout, "buffer_capacity": {"mode": "unlimited"}}]}).json()["data"]
    first = advance(client, ctx, patched, [("submit", "editor"), ("approve", "admin")])
    assert first["status"] == "approved"
    # 승인본은 수정할 수 없고, 새 초안을 만들면 승인본 값을 복사한다.
    immutable = client.patch(rev_url(ctx, first["id"]), json={"notes": "x"},
                             headers=with_version(ctx, "editor", first["row_version"]))
    assert immutable.status_code == 409 and immutable.json()["error"]["code"] == "VERSION_IMMUTABLE"
    second = new_revision(client, ctx, aid)
    assert second["revision_no"] == 2 and second["status"] == "draft"
    copied = {p["role"]: p["buffer_capacity"] for p in second["ports"]}
    assert copied["IN"]["value"] == "4" and copied["OUT"]["mode"] == "unlimited"
    asset = client.get(asset_url(ctx, aid), headers=ctx["viewer"]).json()["data"]
    assert asset["current_revision"]["revision_no"] == 1  # 새 초안은 아직 현재 승인본이 아니다
    assert asset["latest_revision"]["revision_no"] == 2

    done = advance(client, ctx, second, [("submit", "editor"), ("approve", "admin")])
    listing = client.get(asset_url(ctx, aid, "revisions"), headers=ctx["viewer"]).json()["data"]
    assert [(r["revision_no"], r["status"]) for r in listing] == [(2, "approved"), (1, "superseded")]
    asset = client.get(asset_url(ctx, aid), headers=ctx["viewer"]).json()["data"]
    assert asset["current_revision"]["id"] == done["id"]
    still_frozen = client.get(rev_url(ctx, first["id"]), headers=ctx["viewer"]).json()["data"]
    assert still_frozen["status"] == "superseded" and still_frozen["approved_at"]


def test_concurrent_approvals_only_one_wins(make_client, client, ctx, space):
    _, rev = space
    in_review = advance(client, ctx, rev, [("submit", "editor")])
    clients = [make_client() for _ in range(3)]

    def attempt(i):
        return clients[i].post(rev_url(ctx, rev["id"], "approve"),
                               headers=with_version(ctx, "admin", in_review["row_version"])).status_code

    with ThreadPoolExecutor(3) as pool:
        assert sorted(pool.map(attempt, range(3))) == [200, 412, 412]


def test_concurrent_submit_and_patch_never_both_apply(make_client, client, ctx, space):
    _, rev = space
    a, b = make_client(), make_client()

    def submit():
        return a.post(rev_url(ctx, rev["id"], "submit"), headers=with_version(ctx, "editor", 1))

    def patch():
        return b.patch(rev_url(ctx, rev["id"]), json={"storage_capacity": finite("9")},
                       headers=with_version(ctx, "editor", 1))

    with ThreadPoolExecutor(2) as pool:
        f1, f2 = pool.submit(submit), pool.submit(patch)
        codes = sorted([f1.result().status_code, f2.result().status_code])
    assert codes[0] == 200 and codes[1] in (409, 412)  # 정확히 하나만 성공
    final = client.get(rev_url(ctx, rev["id"]), headers=ctx["viewer"]).json()["data"]
    if final["status"] == "in_review":
        assert final["storage_capacity"] in (UNKNOWN, {"mode": "finite", "value": "9",
                                                       "unit": "item", "status": "confirmed"})


# --- 조회·목록·격리·감사 --------------------------------------------------------------------

def test_list_revisions_pagination_and_cursor_scope(client, ctx, space):
    aid, rev = space
    advance(client, ctx, rev, [("submit", "editor"), ("approve", "admin")])
    new_revision(client, ctx, aid)
    first = client.get(f"{asset_url(ctx, aid, 'revisions')}?limit=1", headers=ctx["viewer"]).json()
    assert [r["revision_no"] for r in first["data"]] == [2] and first["page"]["next_cursor"]
    second = client.get(f"{asset_url(ctx, aid, 'revisions')}?limit=1&cursor={first['page']['next_cursor']}",
                        headers=ctx["viewer"]).json()
    assert [r["revision_no"] for r in second["data"]] == [1] and second["page"]["next_cursor"] is None
    other = new_asset(client, ctx, space_body("ST-OTHER2"))
    reuse = client.get(f"{asset_url(ctx, other, 'revisions')}?cursor={first['page']['next_cursor']}",
                       headers=ctx["viewer"])
    assert reuse.status_code == 422 and reuse.json()["error"]["code"] == "INVALID_CURSOR"


def test_revision_is_invisible_through_another_project_or_user(client, ctx, space):
    _, rev = space
    other, _ = create_project(client, ctx["world"])
    cross = f"{API}/projects/{other}/asset-revisions/{rev['id']}"
    assert client.get(cross, headers=ctx["admin"]).status_code == 404
    assert client.patch(cross, json={"notes": "x"}, headers=with_version(ctx, "admin", 1)).status_code == 404
    assert client.post(f"{cross}/submit", headers=with_version(ctx, "admin", 1)).status_code == 404
    assert client.get(rev_url(ctx, rev["id"]), headers=ctx["outsider"]).status_code == 404
    assert client.get(rev_url(ctx, uuid.uuid4()), headers=ctx["viewer"]).status_code == 404


def test_workflow_is_audited(client, db, ctx, space):
    _, rev = space
    patched = client.patch(rev_url(ctx, rev["id"]), json={"storage_capacity": finite("2")},
                           headers=with_version(ctx, "editor", 1)).json()["data"]
    advance(client, ctx, patched, [("submit", "editor"), ("approve", "admin")])
    actions = db.scalar(
        "select string_agg(action, ',' order by created_at, action) from audit_log "
        "where entity_id = :e and entity_type = 'asset_revision'", e=uuid.UUID(rev["id"]))
    assert set(actions.split(",")) == {"asset_revision.create", "asset_revision.update",
                                       "asset_revision.submit", "asset_revision.approve"}
