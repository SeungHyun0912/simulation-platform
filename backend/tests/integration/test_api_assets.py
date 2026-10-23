"""BE-01c: 자산 API(원자 생성·격리·ETag·cursor)를 실제 PostgreSQL로 검증한다."""

import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from helpers import create_project, equipment_body, headers, project_with_members, space_body

API = "/api/v1"


def url(pid, *parts):
    return "/".join([f"{API}/projects/{pid}/assets", *map(str, parts)])


@pytest.fixture
def ctx(db, client, world):
    pid = project_with_members(db, client, world)
    users = world["users"]
    return {"pid": pid, "admin": headers(users["admin"]), "editor": headers(users["editor"]),
            "viewer": headers(users["viewer"]), "outsider": headers(users["outsider"]),
            "world": world}


# --- 원자 생성 --------------------------------------------------------------------

def test_equipment_created_with_detail_and_in_out_ports(client, ctx):
    r = client.post(url(ctx["pid"]), json=equipment_body("EQ-001", notes="메모"),
                    headers=ctx["editor"])
    assert r.status_code == 201, r.text
    assert r.headers["ETag"] == '"1"'
    d = r.json()["data"]
    assert d["kind"] == "equipment" and d["code"] == "EQ-001" and d["row_version"] == 1
    assert d["equipment"] == {"equipment_type": "extruder", "model_name": None}
    assert d["space"] is None and d["notes"] == "메모" and d["external_ref"] is None
    assert {(p["port_key"], p["role"], p["label"]) for p in d["ports"]} == {
        ("IN", "IN", "IN"), ("OUT", "OUT", "OUT")}
    assert r.headers["Location"] == f"{API}/projects/{ctx['pid']}/assets/{d['id']}"


@pytest.mark.parametrize("kind", ["storage", "dock"])
def test_space_created_with_single_access_port(client, ctx, kind):
    r = client.post(url(ctx["pid"]), json=space_body(f"ST-{kind}", kind), headers=ctx["admin"])
    assert r.status_code == 201, r.text
    d = r.json()["data"]
    assert d["space"] == {"space_type": "buffer"} and d["equipment"] is None
    assert [(p["port_key"], p["role"]) for p in d["ports"]] == [("ACCESS-01", "ACCESS")]


def test_create_validation_rules(client, ctx):
    h = ctx["editor"]
    bad_bodies = {
        "equipment without detail": {"kind": "equipment", "code": "A", "name": "n"},
        "equipment with space": {**equipment_body("B"), "space": {"space_type": "t"}},
        "storage with equipment": {**space_body("C"), "equipment": {"equipment_type": "t"}},
        "storage without detail": {"kind": "storage", "code": "D", "name": "n"},
        "ports in request": {**equipment_body("E"), "ports": [{"role": "IN"}]},
        "blank code": equipment_body("   "),
        "unknown kind": {**equipment_body("F"), "kind": "robot"},
        "negative sort": equipment_body("G", sort_order=-1),
        "empty external_ref": equipment_body("H", external_ref=""),
    }
    for label, body in bad_bodies.items():
        r = client.post(url(ctx["pid"]), json=body, headers=h)
        assert r.status_code == 422, label
        assert r.json()["error"]["code"] == "VALIDATION_ERROR", label
    assert client.get(url(ctx["pid"]), headers=h).json()["data"] == []  # 아무것도 저장되지 않음


def test_duplicate_code_conflicts_only_inside_one_project(client, db, ctx):
    assert client.post(url(ctx["pid"]), json=equipment_body("EQ-DUP"),
                       headers=ctx["admin"]).status_code == 201
    dup = client.post(url(ctx["pid"]), json=space_body("EQ-DUP"), headers=ctx["admin"])
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "ASSET_CODE_CONFLICT"
    # 충돌한 요청은 부분 저장을 남기지 않는다.
    assert db.scalar("select count(*) from asset where project_id = :p", p=ctx["pid"]) == 1
    other, _ = create_project(client, ctx["world"])
    ok = client.post(url(other), json=equipment_body("EQ-DUP"), headers=ctx["admin"])
    assert ok.status_code == 201


def test_create_requires_write_role_and_membership(client, ctx):
    assert client.post(url(ctx["pid"]), json=equipment_body("V"),
                       headers=ctx["viewer"]).status_code == 403
    assert client.post(url(ctx["pid"]), json=equipment_body("O"),
                       headers=ctx["outsider"]).status_code == 404
    assert client.post(url(ctx["pid"]), json=equipment_body("N")).status_code == 401


def test_create_writes_audit_row(client, db, ctx):
    r = client.post(url(ctx["pid"]), json=equipment_body("AUD"), headers=ctx["editor"])
    aid = r.json()["data"]["id"]
    row = db.scalar("select count(*) from audit_log where entity_id = :a and "
                    "action = 'asset.create' and project_id = :p", a=uuid.UUID(aid), p=ctx["pid"])
    assert row == 1


# --- 프로젝트 격리 ------------------------------------------------------------------

def test_asset_is_invisible_through_another_project(client, ctx):
    created = client.post(url(ctx["pid"]), json=equipment_body("ISO"), headers=ctx["admin"])
    aid = created.json()["data"]["id"]
    other, _ = create_project(client, ctx["world"])  # 같은 admin이 멤버인 다른 프로젝트
    for path in (url(other, aid), url(other, aid, "ports")):
        r = client.get(path, headers=ctx["admin"])
        assert r.status_code == 404, path
    patch = client.patch(url(other, aid), json={"name": "x"},
                         headers={**ctx["admin"], "If-Match": '"1"'})
    assert patch.status_code == 404
    assert client.get(url(other), headers=ctx["admin"]).json()["data"] == []
    # 비멤버는 올바른 URL이어도 404
    assert client.get(url(ctx["pid"], aid), headers=ctx["outsider"]).status_code == 404


# --- 조회 --------------------------------------------------------------------------

def test_get_asset_and_ports(client, ctx):
    aid = client.post(url(ctx["pid"]), json=equipment_body("GET-1"),
                      headers=ctx["admin"]).json()["data"]["id"]
    got = client.get(url(ctx["pid"], aid), headers=ctx["viewer"])
    assert got.status_code == 200 and got.headers["ETag"] == '"1"'
    ports = client.get(url(ctx["pid"], aid, "ports"), headers=ctx["viewer"]).json()["data"]
    assert sorted(p["role"] for p in ports) == ["IN", "OUT"]
    assert client.get(url(ctx["pid"], uuid.uuid4()), headers=ctx["viewer"]).status_code == 404


# --- 수정(If-Match) --------------------------------------------------------------------

def _create(client, ctx, body):
    r = client.post(url(ctx["pid"]), json=body, headers=ctx["admin"])
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


def test_patch_asset_flow(client, db, ctx):
    aid = _create(client, ctx, equipment_body("PA-1", external_ref="REF"))
    target = url(ctx["pid"], aid)
    h = ctx["editor"]
    assert client.patch(target, json={"name": "n"}, headers=h).status_code == 428
    stale = client.patch(target, json={"name": "n"}, headers={**h, "If-Match": '"5"'})
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "EDIT_CONFLICT"
    ok = client.patch(
        target, headers={**h, "If-Match": '"1"'},
        json={"name": "새 이름", "sort_order": 7, "external_ref": None,
              "equipment": {"equipment_type": "braider", "model_name": "M-1"}})
    assert ok.status_code == 200, ok.text
    assert ok.headers["ETag"] == '"2"'
    d = ok.json()["data"]
    assert d["name"] == "새 이름" and d["sort_order"] == 7 and d["external_ref"] is None
    assert d["equipment"] == {"equipment_type": "braider", "model_name": "M-1"}
    assert d["updated_at"] and d["code"] == "PA-1" and len(d["ports"]) == 2
    again = client.patch(target, json={"name": "덮어쓰기"}, headers={**h, "If-Match": '"1"'})
    assert again.status_code == 412
    assert client.get(target, headers=h).json()["data"]["name"] == "새 이름"
    assert db.scalar("select count(*) from audit_log where entity_id = :a and "
                     "action = 'asset.update'", a=uuid.UUID(aid)) == 1


def test_patch_asset_rejections(client, ctx):
    eq = _create(client, ctx, equipment_body("PR-EQ"))
    st = _create(client, ctx, space_body("PR-ST"))
    _create(client, ctx, equipment_body("PR-TAKEN"))
    h = {**ctx["editor"], "If-Match": '"1"'}
    cases = {
        "kind change": (eq, {"kind": "storage"}),
        "ports": (eq, {"ports": []}),
        "empty": (eq, {}),
        "null name": (eq, {"name": None}),
        "equipment on storage": (st, {"equipment": {"equipment_type": "x"}}),
        "space on equipment": (eq, {"space": {"space_type": "x"}}),
        "null equipment_type": (eq, {"equipment": {"equipment_type": None}}),
        "empty equipment patch": (eq, {"equipment": {}}),
    }
    for label, (aid, body) in cases.items():
        r = client.patch(url(ctx["pid"], aid), json=body, headers=h)
        assert r.status_code == 422, label
    conflict = client.patch(url(ctx["pid"], eq), json={"code": "PR-TAKEN"}, headers=h)
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "ASSET_CODE_CONFLICT"
    viewer = client.patch(url(ctx["pid"], eq), json={"name": "n"},
                          headers={**ctx["viewer"], "If-Match": '"1"'})
    assert viewer.status_code == 403
    # 거부된 요청 후에도 버전은 그대로
    assert client.get(url(ctx["pid"], eq), headers=h).headers["ETag"] == '"1"'


def test_concurrent_patches_with_same_version_only_one_wins(make_client, client, ctx):
    aid = _create(client, ctx, equipment_body("RACE"))
    target = url(ctx["pid"], aid)
    clients = [make_client() for _ in range(4)]

    def attempt(i):
        return clients[i].patch(target, json={"name": f"n{i}"},
                                headers={**ctx["editor"], "If-Match": '"1"'}).status_code

    with ThreadPoolExecutor(4) as pool:
        codes = sorted(pool.map(attempt, range(4)))
    assert codes == [200, 412, 412, 412]
    assert client.get(target, headers=ctx["editor"]).headers["ETag"] == '"2"'


# --- 목록·cursor·필터 -----------------------------------------------------------------

def _seed_list(client, ctx):
    for i, code in enumerate(["B-02", "A-01", "C-03", "A-10", "B-20"]):
        client.post(url(ctx["pid"]), headers=ctx["admin"], json=equipment_body(code, sort_order=i))
    client.post(url(ctx["pid"]), headers=ctx["admin"], json=space_body("S-1", sort_order=9))


def _walk(client, ctx, query, limit=2):
    seen, cursor = [], None
    while True:
        extra = f"&cursor={cursor}" if cursor else ""
        body = client.get(f"{url(ctx['pid'])}?limit={limit}&{query}{extra}",
                          headers=ctx["viewer"]).json()
        seen += [a["code"] for a in body["data"]]
        cursor = body["page"]["next_cursor"]
        if not cursor:
            return seen


def test_list_default_sort_and_pagination(client, ctx):
    _seed_list(client, ctx)
    assert _walk(client, ctx, "") == ["B-02", "A-01", "C-03", "A-10", "B-20", "S-1"]
    assert _walk(client, ctx, "sort=code") == ["A-01", "A-10", "B-02", "B-20", "C-03", "S-1"]
    assert _walk(client, ctx, "sort=-code") == ["S-1", "C-03", "B-20", "B-02", "A-10", "A-01"]
    assert _walk(client, ctx, "sort=-sort_order") == ["S-1", "B-20", "A-10", "C-03", "A-01", "B-02"]


def test_list_filters(client, ctx):
    _seed_list(client, ctx)
    assert _walk(client, ctx, "kind=storage") == ["S-1"]
    assert _walk(client, ctx, "q=a-", limit=10) == ["A-01", "A-10"]
    assert _walk(client, ctx, "q=%25", limit=10) == []  # '%'는 와일드카드가 아니라 문자
    ports = client.get(f"{url(ctx['pid'])}?kind=equipment&limit=1", headers=ctx["viewer"]).json()
    assert len(ports["data"][0]["ports"]) == 2


def test_list_hides_archived_unless_requested(client, db, ctx):
    aid = _create(client, ctx, equipment_body("ARCH"))
    db.run(("UPDATE asset SET archived_at = now() WHERE id = :a", {"a": uuid.UUID(aid)}))
    assert client.get(url(ctx["pid"]), headers=ctx["viewer"]).json()["data"] == []
    shown = client.get(f"{url(ctx['pid'])}?include_archived=true", headers=ctx["viewer"]).json()
    assert [a["code"] for a in shown["data"]] == ["ARCH"] and shown["data"][0]["archived_at"]


def test_list_query_validation_and_cursor_reuse(client, ctx):
    _seed_list(client, ctx)
    h = ctx["viewer"]
    assert client.get(f"{url(ctx['pid'])}?sort=model", headers=h).status_code == 422
    assert client.get(f"{url(ctx['pid'])}?limit=201", headers=h).status_code == 422
    assert client.get(f"{url(ctx['pid'])}?kind=robot", headers=h).status_code == 422
    cursor = client.get(f"{url(ctx['pid'])}?limit=2&sort=code", headers=h
                        ).json()["page"]["next_cursor"]
    for query in ("sort=-code", "sort=name", "kind=equipment", ""):
        r = client.get(f"{url(ctx['pid'])}?limit=2&{query}&cursor={cursor}", headers=h)
        assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_CURSOR", query
    assert client.get(f"{url(ctx['pid'])}?limit=2&sort=code&cursor={cursor}",
                      headers=h).status_code == 200
    # 다른 프로젝트에서 발급한 cursor는 재사용할 수 없다.
    other, _ = create_project(client, ctx["world"])
    assert client.get(f"{url(other)}?limit=2&sort=code&cursor={cursor}",
                      headers=ctx["admin"]).status_code == 422
