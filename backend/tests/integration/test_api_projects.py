"""BE-01c: 인증·프로젝트 API를 실제 PostgreSQL로 검증한다(CR-backend-20261023-be01c)."""

import uuid

from helpers import create_project, headers, project_with_members

API = "/api/v1"


# --- 인증 -------------------------------------------------------------------

def test_missing_or_unknown_user_is_401(client, world):
    for h in ({}, {"X-Debug-User": "not-a-uuid"}, {"X-Debug-User": str(uuid.uuid4())}):
        r = client.get(f"{API}/me", headers=h)
        assert r.status_code == 401
        assert r.json()["error"]["code"] == "UNAUTHENTICATED"


def test_auth_disabled_without_local_mode(engine, world):
    from conftest import _app_with_engine
    from fastapi.testclient import TestClient

    from simulation_platform.settings import Settings, get_settings

    app = _app_with_engine(engine)
    app.dependency_overrides[get_settings] = lambda: Settings(
        app_env="test", auth_mode="", _env_file=None)
    r = TestClient(app).get(f"{API}/me", headers=headers(world["users"]["admin"]))
    assert r.status_code == 401


def test_me_lists_organizations_and_projects(client, db, world):
    pid, _ = create_project(client, world, code="ME-1")
    r = client.get(f"{API}/me", headers=headers(world["users"]["admin"]))
    data = r.json()["data"]
    assert data["user"]["id"] == str(world["users"]["admin"])
    assert [o["role"] for o in data["organizations"]] == ["admin"]
    assert {"id": str(pid), "organization_id": str(world["org"]), "code": "ME-1",
            "name": "프로젝트", "status": "active", "timezone": "Asia/Seoul",
            "role": "admin"} in data["projects"]


# --- 프로젝트 생성 ---------------------------------------------------------------

def test_create_project_returns_201_etag_location_and_audit(client, db, world):
    pid, r = create_project(client, world, code="NEW-1", description="설명")
    assert r.headers["ETag"] == '"1"'
    assert r.headers["Location"] == f"{API}/projects/{pid}"
    assert r.headers["X-Request-ID"]
    data = r.json()["data"]
    assert data["row_version"] == 1 and data["status"] == "active"
    assert data["description"] == "설명" and data["updated_at"] is None
    assert data["created_at"].endswith("Z")
    actions = db.scalar("select string_agg(action, ',') from audit_log where project_id = :p",
                        p=pid)
    assert actions == "project.create"


def test_create_project_requires_org_admin_and_membership(client, world):
    body = {"organization_id": str(world["org"]), "code": "X", "name": "n", "timezone": "Asia/Seoul"}
    forbidden = client.post(f"{API}/projects", json=body, headers=headers(world["users"]["editor"]))
    assert forbidden.status_code == 403 and forbidden.json()["error"]["code"] == "FORBIDDEN"
    # 조직 비멤버에게는 조직 존재를 드러내지 않는다.
    hidden = client.post(f"{API}/projects", json=body, headers=headers(world["users"]["outsider"]))
    assert hidden.status_code == 404 and hidden.json()["error"]["code"] == "NOT_FOUND"


def test_create_project_conflicts_and_validation(client, world):
    create_project(client, world, code="DUP")
    body = {"organization_id": str(world["org"]), "code": "DUP", "name": "n",
            "timezone": "Asia/Seoul"}
    h = headers(world["users"]["admin"])
    dup = client.post(f"{API}/projects", json=body, headers=h)
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "PROJECT_CODE_CONFLICT"
    bad_tz = client.post(f"{API}/projects", json={**body, "code": "TZ", "timezone": "Mars/Base"},
                         headers=h)
    assert bad_tz.status_code == 422
    assert bad_tz.json()["error"]["details"][0]["field_path"] == "/timezone"
    blank = client.post(f"{API}/projects", json={**body, "code": "  ", "timezone": "Asia/Seoul"},
                        headers=h)
    assert blank.status_code == 422 and blank.json()["error"]["code"] == "VALIDATION_ERROR"
    extra = client.post(f"{API}/projects", json={**body, "code": "E", "status": "archived"}, headers=h)
    assert extra.status_code == 422


def test_same_project_code_allowed_in_different_organizations(client, world):
    create_project(client, world, code="SAME")
    body = {"organization_id": str(world["other_org"]), "code": "SAME", "name": "n",
            "timezone": "Asia/Seoul"}
    r = client.post(f"{API}/projects", json=body, headers=headers(world["users"]["outsider"]))
    assert r.status_code == 201


# --- 프로젝트 조회·격리 ---------------------------------------------------------

def test_non_member_and_missing_project_get_identical_404(client, world):
    pid, _ = create_project(client, world)
    hidden = client.get(f"{API}/projects/{pid}", headers=headers(world["users"]["outsider"]))
    missing = client.get(f"{API}/projects/{uuid.uuid4()}", headers=headers(world["users"]["admin"]))
    assert hidden.status_code == missing.status_code == 404
    strip = lambda r: {k: v for k, v in r.json()["error"].items() if k != "request_id"}
    assert strip(hidden) == strip(missing)


def test_get_project_for_member_has_etag(client, world):
    pid, _ = create_project(client, world)
    r = client.get(f"{API}/projects/{pid}", headers=headers(world["users"]["admin"]))
    assert r.status_code == 200 and r.headers["ETag"] == '"1"'


# --- 프로젝트 수정(If-Match) ----------------------------------------------------

def test_patch_project_etag_flow(client, db, world):
    pid, _ = create_project(client, world)
    admin = world["users"]["admin"]
    url = f"{API}/projects/{pid}"
    no_header = client.patch(url, json={"name": "새 이름"}, headers=headers(admin))
    assert no_header.status_code == 428
    assert no_header.json()["error"]["code"] == "PRECONDITION_REQUIRED"
    stale = client.patch(url, json={"name": "새 이름"}, headers=headers(admin, **{"If-Match": '"9"'}))
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "EDIT_CONFLICT"
    ok = client.patch(url, json={"name": "새 이름", "description": "d"},
                      headers=headers(admin, **{"If-Match": '"1"'}))
    assert ok.status_code == 200 and ok.headers["ETag"] == '"2"'
    assert ok.json()["data"]["name"] == "새 이름" and ok.json()["data"]["updated_at"]
    # 같은 버전으로 다시 보내면 충돌(마지막 저장 승리 금지)
    again = client.patch(url, json={"name": "덮어쓰기"}, headers=headers(admin, **{"If-Match": '"1"'}))
    assert again.status_code == 412
    assert db.scalar("select name from project where id = :p", p=pid) == "새 이름"
    assert db.scalar("select count(*) from audit_log where project_id = :p and "
                     "action = 'project.update'", p=pid) == 1


def test_patch_project_validation_and_permissions(client, db, world):
    pid = project_with_members(db, client, world)
    url = f"{API}/projects/{pid}"
    if_match = {"If-Match": '"1"'}
    editor = client.patch(url, json={"name": "x"}, headers=headers(world["users"]["editor"], **if_match))
    assert editor.status_code == 403
    admin = world["users"]["admin"]
    for body in ({}, {"name": None}, {"code": "NEW"}, {"timezone": "Nope/Zone"}):
        r = client.patch(url, json=body, headers=headers(admin, **if_match))
        assert r.status_code == 422, body
    cleared = client.patch(url, json={"description": None}, headers=headers(admin, **if_match))
    assert cleared.status_code == 200 and cleared.json()["data"]["description"] is None
    bad_header = client.patch(url, json={"name": "n"}, headers=headers(admin, **{"If-Match": "abc"}))
    assert bad_header.status_code == 422


# --- 프로젝트 목록·cursor -------------------------------------------------------

def test_project_list_only_members_with_cursor_pagination(client, world):
    codes = [f"L-{i}" for i in range(5)]
    for code in codes:
        create_project(client, world, code=code)
    admin = headers(world["users"]["admin"])
    first = client.get(f"{API}/projects?limit=2&q=L-", headers=admin).json()
    assert [p["code"] for p in first["data"]] == codes[:2]
    assert first["page"]["limit"] == 2 and first["page"]["next_cursor"]
    seen = [p["code"] for p in first["data"]]
    cursor = first["page"]["next_cursor"]
    while cursor:
        page = client.get(f"{API}/projects?limit=2&q=L-&cursor={cursor}", headers=admin).json()
        seen += [p["code"] for p in page["data"]]
        cursor = page["page"]["next_cursor"]
    assert seen == codes
    # 다른 사용자는 해당 프로젝트를 목록에서 볼 수 없다.
    assert client.get(f"{API}/projects?q=L-", headers=headers(world["users"]["outsider"])
                      ).json()["data"] == []


def test_invalid_cursor_and_limit_rejected(client, world):
    h = headers(world["users"]["admin"])
    for cursor in ("garbage", "e30"):
        r = client.get(f"{API}/projects?cursor={cursor}", headers=h)
        assert r.status_code == 422 and r.json()["error"]["code"] == "INVALID_CURSOR"
    assert client.get(f"{API}/projects?limit=201", headers=h).status_code == 422
    assert client.get(f"{API}/projects?limit=0", headers=h).status_code == 422
