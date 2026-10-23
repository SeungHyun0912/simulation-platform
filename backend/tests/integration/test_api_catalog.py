"""BE-03: 제품·재료 API를 실제 PostgreSQL로 검증한다(CR-backend-20261023-be03)."""

import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from helpers import create_project, headers, project_with_members

API = "/api/v1"
KINDS = ("products", "materials")
CONFLICT_CODE = {"products": "PRODUCT_CODE_CONFLICT", "materials": "MATERIAL_CODE_CONFLICT"}
UNKNOWN_MEASURE = {"mode": "unknown", "value": None}


def body_for(kind, code, **extra):
    base = {"code": code, "name": f"[시험] {code}"}
    if kind == "materials":
        base["form"] = "롤"
    return {**base, **extra}


@pytest.fixture
def ctx(db, client, world):
    pid = project_with_members(db, client, world)
    users = world["users"]
    return {"pid": pid, "world": world, "admin": headers(users["admin"]),
            "editor": headers(users["editor"]), "viewer": headers(users["viewer"]),
            "outsider": headers(users["outsider"])}


def url(ctx, kind, *parts):
    return "/".join([f"{API}/projects/{ctx['pid']}/{kind}", *map(str, parts)])


def create(client, ctx, kind, code, who="editor", **extra):
    r = client.post(url(ctx, kind), json=body_for(kind, code, **extra), headers=ctx[who])
    assert r.status_code == 201, r.text
    return r.json()["data"]


def match(ctx, who, version):
    return {**ctx[who], "If-Match": f'"{version}"'}


# --- 생성 ---------------------------------------------------------------------------

@pytest.mark.parametrize("kind", KINDS)
def test_create_returns_201_etag_location_and_defaults(client, ctx, kind):
    r = client.post(url(ctx, kind), json=body_for(kind, "C-1"), headers=ctx["editor"])
    assert r.status_code == 201, r.text
    d = r.json()["data"]
    assert r.headers["ETag"] == '"1"' and d["row_version"] == 1
    assert r.headers["Location"] == f"{API}/projects/{ctx['pid']}/{kind}/{d['id']}"
    assert d["project_id"] == str(ctx["pid"]) and d["archived_at"] is None and d["notes"] is None
    if kind == "products":
        assert d["specification"] is None  # null = 입력 없음(미정)
    else:
        # 모든 수량 필드의 기본은 unknown이며 0이 아니다.
        assert d["default_spec"] == {"length_m": UNKNOWN_MEASURE, "weight_kg": UNKNOWN_MEASURE,
                                     "unit_count": UNKNOWN_MEASURE, "strand_count": UNKNOWN_MEASURE}
        assert d["form"] == "롤"


@pytest.mark.parametrize("kind", KINDS)
def test_create_validation_rejections(client, ctx, kind):
    bad = {
        "blank code": body_for(kind, "   "),
        "blank name": {**body_for(kind, "A"), "name": " "},
        "missing name": {k: v for k, v in body_for(kind, "A").items() if k != "name"},
        "extra field": body_for(kind, "B", project_id=str(ctx["pid"])),
        "empty notes": body_for(kind, "C", notes=""),
        "too long code": body_for(kind, "x" * 65),
    }
    if kind == "products":
        bad["empty specification"] = body_for(kind, "D", specification="")
    else:
        bad["missing form"] = {k: v for k, v in body_for(kind, "E").items() if k != "form"}
        bad["blank form"] = body_for(kind, "F", form="  ")
    for label, body in bad.items():
        r = client.post(url(ctx, kind), json=body, headers=ctx["editor"])
        assert r.status_code == 422, label
        assert r.json()["error"]["code"] == "VALIDATION_ERROR", label
    assert client.get(url(ctx, kind), headers=ctx["viewer"]).json()["data"] == []


@pytest.mark.parametrize("spec,label", [
    ({"length_m": {"mode": "known"}}, "known without value"),
    ({"length_m": {"mode": "known", "value": "0"}}, "zero length"),
    ({"length_m": {"mode": "known", "value": ".5"}}, "no leading digit"),
    ({"length_m": {"mode": "known", "value": "1.1234567"}}, "7 decimals"),
    ({"length_m": {"mode": "known", "value": 1000}}, "number instead of string"),
    ({"weight_kg": {"mode": "unknown", "value": "5"}}, "unknown with value"),
    ({"weight_kg": {"mode": "not_applicable", "value": "5"}}, "n/a with value"),
    ({"unit_count": {"mode": "known", "value": 0}}, "zero count"),
    ({"unit_count": {"mode": "known", "value": "3"}}, "count as string"),
    ({"unit_count": {"mode": "known", "value": 1.5}}, "fractional count"),
    ({"strand_count": {"mode": "known", "value": True}}, "boolean count"),
    ({"strand_count": {"mode": "unknown", "value": 3}}, "unknown count with value"),
    ({"length_m": {"mode": "infinite"}}, "bad mode"),
    ({"volume_m3": {"mode": "unknown"}}, "unknown field"),
    ({"length_m": {"mode": "known", "value": "5", "unit": "m"}}, "extra key"),
])
def test_invalid_default_spec_rejected(client, ctx, spec, label):
    r = client.post(url(ctx, "materials"), json=body_for("materials", "SPEC", default_spec=spec),
                    headers=ctx["editor"])
    assert r.status_code == 422, label
    assert r.json()["error"]["code"] == "VALIDATION_ERROR", label


def test_default_spec_keeps_length_weight_and_counts_separate(client, ctx):
    spec = {"length_m": {"mode": "known", "value": "3000"},
            "weight_kg": {"mode": "known", "value": "2000.500000"},
            "unit_count": {"mode": "not_applicable"},
            "strand_count": {"mode": "known", "value": 12}}
    d = create(client, ctx, "materials", "SPEC-OK", default_spec=spec)
    assert d["default_spec"] == {"length_m": {"mode": "known", "value": "3000"},
                                 "weight_kg": {"mode": "known", "value": "2000.500000"},
                                 "unit_count": {"mode": "not_applicable", "value": None},
                                 "strand_count": {"mode": "known", "value": 12}}


@pytest.mark.parametrize("kind", KINDS)
def test_duplicate_code_conflicts_only_inside_one_project(client, ctx, kind):
    create(client, ctx, kind, "DUP")
    dup = client.post(url(ctx, kind), json=body_for(kind, "DUP"), headers=ctx["editor"])
    assert dup.status_code == 409 and dup.json()["error"]["code"] == CONFLICT_CODE[kind]
    assert dup.json()["error"]["details"][0]["field_path"] == "/code"
    other, _ = create_project(client, ctx["world"])
    ok = client.post(f"{API}/projects/{other}/{kind}", json=body_for(kind, "DUP"),
                     headers=ctx["admin"])
    assert ok.status_code == 201


def test_product_and_material_codes_are_independent(client, ctx):
    create(client, ctx, "products", "SHARED")
    create(client, ctx, "materials", "SHARED")  # 서로 다른 기준정보라 같은 코드 허용


# --- 권한·격리 -----------------------------------------------------------------------

@pytest.mark.parametrize("kind", KINDS)
def test_permissions_and_project_isolation(client, ctx, kind):
    item = create(client, ctx, kind, "ISO")
    assert client.post(url(ctx, kind), json=body_for(kind, "V"), headers=ctx["viewer"]).status_code == 403
    assert client.post(url(ctx, kind), json=body_for(kind, "O"), headers=ctx["outsider"]).status_code == 404
    assert client.post(url(ctx, kind), json=body_for(kind, "N")).status_code == 401
    assert client.get(url(ctx, kind, item["id"]), headers=ctx["viewer"]).status_code == 200
    assert client.get(url(ctx, kind, item["id"]), headers=ctx["outsider"]).status_code == 404
    other, _ = create_project(client, ctx["world"])  # 같은 admin이 멤버인 다른 프로젝트
    cross = f"{API}/projects/{other}/{kind}/{item['id']}"
    assert client.get(cross, headers=ctx["admin"]).status_code == 404
    assert client.patch(cross, json={"name": "x"}, headers={**ctx["admin"], "If-Match": '"1"'}
                        ).status_code == 404
    assert client.get(f"{API}/projects/{other}/{kind}", headers=ctx["admin"]).json()["data"] == []
    assert client.get(url(ctx, kind, uuid.uuid4()), headers=ctx["viewer"]).status_code == 404


def test_product_id_is_not_reachable_through_materials_path(client, ctx):
    product = create(client, ctx, "products", "ONLY-PRODUCT")
    assert client.get(url(ctx, "materials", product["id"]), headers=ctx["viewer"]).status_code == 404


# --- 수정 ---------------------------------------------------------------------------

@pytest.mark.parametrize("kind", KINDS)
def test_patch_etag_flow_and_clearing(client, ctx, kind):
    item = create(client, ctx, kind, "PA", notes="메모")
    target = url(ctx, kind, item["id"])
    assert client.patch(target, json={"name": "n"}, headers=ctx["editor"]).status_code == 428
    stale = client.patch(target, json={"name": "n"}, headers=match(ctx, "editor", 9))
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "EDIT_CONFLICT"
    assert client.patch(target, json={"name": "n"}, headers=match(ctx, "viewer", 1)).status_code == 403
    ok = client.patch(target, json={"name": "새 이름", "notes": None}, headers=match(ctx, "editor", 1))
    assert ok.status_code == 200 and ok.headers["ETag"] == '"2"'
    d = ok.json()["data"]
    assert d["name"] == "새 이름" and d["notes"] is None and d["updated_at"] and d["code"] == "PA"
    again = client.patch(target, json={"name": "덮어쓰기"}, headers=match(ctx, "editor", 1))
    assert again.status_code == 412
    assert client.get(target, headers=ctx["viewer"]).json()["data"]["name"] == "새 이름"


@pytest.mark.parametrize("kind", KINDS)
def test_patch_rejections(client, ctx, kind):
    item = create(client, ctx, kind, "PR")
    create(client, ctx, kind, "TAKEN")
    target = url(ctx, kind, item["id"])
    h = match(ctx, "editor", 1)
    for label, body in {"empty": {}, "null name": {"name": None}, "null code": {"code": None},
                        "extra": {"project_id": str(ctx["pid"])},
                        "blank": {"name": "  "}}.items():
        assert client.patch(target, json=body, headers=h).status_code == 422, label
    conflict = client.patch(target, json={"code": "TAKEN"}, headers=h)
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == CONFLICT_CODE[kind]
    assert client.get(target, headers=h).headers["ETag"] == '"1"'  # 거부된 요청은 버전을 올리지 않는다


def test_product_specification_can_be_set_and_cleared(client, ctx):
    item = create(client, ctx, "products", "SPEC")
    target = url(ctx, "products", item["id"])
    r = client.patch(target, json={"specification": "규격 텍스트"}, headers=match(ctx, "editor", 1))
    assert r.json()["data"]["specification"] == "규격 텍스트"
    r = client.patch(target, json={"specification": None}, headers=match(ctx, "editor", 2))
    assert r.json()["data"]["specification"] is None
    assert client.patch(target, json={"specification": ""}, headers=match(ctx, "editor", 3)
                        ).status_code == 422


def test_material_default_spec_patch_merges_only_sent_fields(client, ctx):
    item = create(client, ctx, "materials", "MERGE", default_spec={
        "weight_kg": {"mode": "known", "value": "2000"}})
    target = url(ctx, "materials", item["id"])
    r = client.patch(target, headers=match(ctx, "editor", 1), json={
        "default_spec": {"length_m": {"mode": "known", "value": "3000"}}})
    assert r.status_code == 200, r.text
    spec = r.json()["data"]["default_spec"]
    assert spec["length_m"] == {"mode": "known", "value": "3000"}
    assert spec["weight_kg"] == {"mode": "known", "value": "2000"}  # 보내지 않은 필드는 유지
    assert spec["unit_count"] == UNKNOWN_MEASURE
    back = client.patch(target, headers=match(ctx, "editor", 2), json={
        "default_spec": {"length_m": {"mode": "unknown"}}}).json()["data"]["default_spec"]
    assert back["length_m"] == UNKNOWN_MEASURE  # 확정값을 다시 미정으로 되돌릴 수 있다(0이 아님)
    for label, spec_body in {"null spec": None, "empty spec": {},
                             "null field": {"length_m": None},
                             "bad value": {"length_m": {"mode": "known", "value": "0"}},
                             "count string": {"unit_count": {"mode": "known", "value": "2"}}}.items():
        r = client.patch(target, json={"default_spec": spec_body}, headers=match(ctx, "editor", 3))
        assert r.status_code == 422, label


@pytest.mark.parametrize("kind", KINDS)
def test_concurrent_patches_only_one_wins(make_client, client, ctx, kind):
    item = create(client, ctx, kind, "RACE")
    clients = [make_client() for _ in range(4)]

    def attempt(i):
        return clients[i].patch(url(ctx, kind, item["id"]), json={"name": f"n{i}"},
                                headers=match(ctx, "editor", 1)).status_code

    with ThreadPoolExecutor(4) as pool:
        assert sorted(pool.map(attempt, range(4))) == [200, 412, 412, 412]


# --- 목록 ---------------------------------------------------------------------------

def _walk(client, ctx, kind, query, limit=2):
    seen, cursor = [], None
    while True:
        extra = f"&cursor={cursor}" if cursor else ""
        body = client.get(f"{url(ctx, kind)}?limit={limit}&{query}{extra}", headers=ctx["viewer"]).json()
        seen += [i["code"] for i in body["data"]]
        cursor = body["page"]["next_cursor"]
        if not cursor:
            return seen


@pytest.mark.parametrize("kind", KINDS)
def test_list_sort_filter_and_pagination(client, ctx, kind):
    for code, name in [("B-02", "나"), ("A-01", "다"), ("C-03", "가"), ("A-10", "라"), ("B-20", "마")]:
        create(client, ctx, kind, code, name=name)
    assert _walk(client, ctx, kind, "") == ["A-01", "A-10", "B-02", "B-20", "C-03"]  # 기본 code
    assert _walk(client, ctx, kind, "sort=-code") == ["C-03", "B-20", "B-02", "A-10", "A-01"]
    assert _walk(client, ctx, kind, "sort=name") == ["C-03", "B-02", "A-01", "A-10", "B-20"]
    assert _walk(client, ctx, kind, "q=a-", limit=10) == ["A-01", "A-10"]
    assert _walk(client, ctx, kind, "q=%25", limit=10) == []  # '%'는 와일드카드가 아니라 문자
    assert _walk(client, ctx, kind, "q=%5F", limit=10) == []  # '_'도 문자


@pytest.mark.parametrize("kind", KINDS)
def test_list_hides_archived_unless_requested(client, db, ctx, kind):
    item = create(client, ctx, kind, "ARCH")
    table = "product" if kind == "products" else "material_definition"
    db.run((f"UPDATE {table} SET archived_at = now() WHERE id = :i", {"i": uuid.UUID(item["id"])}))
    assert client.get(url(ctx, kind), headers=ctx["viewer"]).json()["data"] == []
    shown = client.get(f"{url(ctx, kind)}?include_archived=true", headers=ctx["viewer"]).json()
    assert [i["code"] for i in shown["data"]] == ["ARCH"] and shown["data"][0]["archived_at"]


@pytest.mark.parametrize("kind", KINDS)
def test_list_query_validation_and_cursor_scope(client, ctx, kind):
    for code in ("L-1", "L-2", "L-3"):
        create(client, ctx, kind, code)
    h = ctx["viewer"]
    assert client.get(f"{url(ctx, kind)}?sort=form", headers=h).status_code == 422
    assert client.get(f"{url(ctx, kind)}?limit=201", headers=h).status_code == 422
    cursor = client.get(f"{url(ctx, kind)}?limit=1&sort=code", headers=h).json()["page"]["next_cursor"]
    for query in ("sort=-code", "sort=name", "q=L"):
        r = client.get(f"{url(ctx, kind)}?limit=1&{query}&cursor={cursor}", headers=h)
        assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_CURSOR", query
    # 기본 정렬이 code이므로 sort를 생략해도 같은 조건이라 cursor가 유효하다.
    for query in ("sort=code", ""):
        assert client.get(f"{url(ctx, kind)}?limit=1&{query}&cursor={cursor}",
                          headers=h).status_code == 200, query
    other, _ = create_project(client, ctx["world"])
    assert client.get(f"{API}/projects/{other}/{kind}?limit=1&sort=code&cursor={cursor}",
                      headers=ctx["admin"]).status_code == 422


# --- 감사·/me -------------------------------------------------------------------------

@pytest.mark.parametrize("kind,prefix", [("products", "product"), ("materials", "material")])
def test_create_and_update_are_audited(client, db, ctx, kind, prefix):
    item = create(client, ctx, kind, "AUD")
    client.patch(url(ctx, kind, item["id"]), json={"name": "수정"}, headers=match(ctx, "editor", 1))
    actions = db.scalar("select string_agg(action, ',' order by action) from audit_log "
                        "where entity_id = :e", e=uuid.UUID(item["id"]))
    assert actions == f"{prefix}.create,{prefix}.update"


def test_me_projects_include_status(client, ctx):
    me = client.get(f"{API}/me", headers=ctx["admin"]).json()["data"]
    assert {p["status"] for p in me["projects"]} == {"active"}
