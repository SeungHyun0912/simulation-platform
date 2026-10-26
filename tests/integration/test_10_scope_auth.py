"""T2·T3: 프로젝트 간 격리와 역할 권한. 서버 판정이 정본이며 화면의 선택은 권한 검증이 아니다."""

from conftest import PROJECT_A, PROJECT_B, RUN, data, error_code


def _asset_id(admin, project, code):
    items = data(admin.get(f"/projects/{project}/assets", params={"q": code}))
    return next(a["id"] for a in items if a["code"] == code)


def test_t2_me_lists_only_member_projects(clients):
    codes = lambda u: {p["code"] for p in data(clients[u].get("/me"))["projects"]}
    assert {"DEMO-A", "DEMO-B"} <= codes("admin")
    # 시드는 같은 개발 사용자를 DEMO-WIRE·DEV-PROJECT에도 넣는다. 소속이 아닌 프로젝트만 보이지 않으면 된다.
    assert "DEMO-A" in codes("editor") and not codes("editor") & {"DEMO-B", "DEMO-C"}
    assert codes("other_org") == {"DEMO-C"}
    assert codes("nobody") == set()


def test_t2_project_b_does_not_expose_project_a_assets(admin):
    eq_a = _asset_id(admin, PROJECT_A, "EQ-001")
    # 같은 사용자가 두 프로젝트 모두의 admin이어도 프로젝트 경로가 다르면 접근할 수 없다.
    r = admin.get(f"/projects/{PROJECT_B}/assets/{eq_a}")
    assert r.status_code == 404 and error_code(r) == "NOT_FOUND"
    in_b = {a["id"] for a in data(admin.get(f"/projects/{PROJECT_B}/assets", params={"limit": 200}))}
    assert eq_a not in in_b


def test_t2_same_code_in_two_projects_is_separate_resources(admin):
    a = _asset_id(admin, PROJECT_A, "EQ-001")
    b = _asset_id(admin, PROJECT_B, "EQ-001")
    assert a != b


def test_t2_other_organization_cannot_tell_project_exists(clients):
    for project in (PROJECT_A, PROJECT_B):
        r = clients["other_org"].get(f"/projects/{project}/assets")
        assert r.status_code == 404 and error_code(r) == "NOT_FOUND"
    # 존재하지 않는 프로젝트와 접근 권한 없는 프로젝트는 같은 응답이다.
    missing = clients["other_org"].get("/projects/00000000-0000-4000-8000-00000000dead/assets")
    assert missing.status_code == 404 and error_code(missing) == "NOT_FOUND"


def test_t2_mixed_user_is_admin_in_a_but_viewer_in_b(clients):
    me = {p["code"]: p["role"] for p in data(clients["mixed"].get("/me"))["projects"]}
    assert me["DEMO-A"] == "admin" and me["DEMO-B"] == "viewer"
    code = f"INT{RUN}-MIX"
    ok = clients["mixed"].post(f"/projects/{PROJECT_A}/products", {"code": code, "name": "[INT] mixed A"})
    denied = clients["mixed"].post(f"/projects/{PROJECT_B}/products", {"code": code, "name": "[INT] mixed B"})
    assert ok.status_code == 201
    assert denied.status_code == 403 and error_code(denied) == "FORBIDDEN"


def test_t3_viewer_can_read_but_not_write(clients):
    viewer = clients["viewer"]
    assert viewer.get(f"/projects/{PROJECT_A}/assets").status_code == 200
    r = viewer.post(f"/projects/{PROJECT_A}/products", {"code": f"INT{RUN}-V", "name": "[INT] viewer"})
    assert r.status_code == 403 and error_code(r) == "FORBIDDEN"


def test_t3_nobody_gets_404_not_403(clients):
    r = clients["nobody"].get(f"/projects/{PROJECT_A}/products")
    assert r.status_code == 404


def test_t3_only_org_admin_creates_projects(clients):
    org = data(clients["admin"].get("/me"))["organizations"][0]["id"]
    body = {"organization_id": org, "code": f"INT{RUN}-PRJ", "name": "[INT] 권한 확인", "timezone": "Asia/Seoul"}
    denied = clients["editor"].post("/projects", body)
    assert denied.status_code == 403 and error_code(denied) == "FORBIDDEN"
    created = clients["admin"].post("/projects", body)
    assert created.status_code == 201
    dup = clients["admin"].post("/projects", body)
    assert dup.status_code == 409 and error_code(dup) == "PROJECT_CODE_CONFLICT"
