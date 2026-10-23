import uuid


def headers(user, **extra) -> dict:
    return {"X-Debug-User": str(user), **extra}


def add_project_member(db, org, project, user, role):
    db.run((("INSERT INTO project_member (id,organization_id,project_id,user_id,role) "
            "VALUES (:i,:o,:p,:u,:r)"),
            {"i": uuid.uuid4(), "o": org, "p": project, "u": user, "r": role}))


def create_project(client, world, code=None, **extra):
    """admin이 API로 프로젝트를 만들고 (project_id, 응답)을 반환."""
    body = {"organization_id": str(world["org"]), "code": code or f"P-{uuid.uuid4().hex[:8]}",
            "name": "프로젝트", "timezone": "Asia/Seoul", **extra}
    r = client.post("/api/v1/projects", json=body, headers=headers(world["users"]["admin"]))
    assert r.status_code == 201, r.text
    return uuid.UUID(r.json()["data"]["id"]), r


def project_with_members(db, client, world):
    """admin이 만든 프로젝트에 editor/viewer를 각 역할로 추가."""
    pid, _ = create_project(client, world)
    add_project_member(db, world["org"], pid, world["users"]["editor"], "editor")
    add_project_member(db, world["org"], pid, world["users"]["viewer"], "viewer")
    return pid


def equipment_body(code, **extra):
    return {"kind": "equipment", "code": code, "name": f"설비 {code}",
            "equipment": {"equipment_type": "extruder"}, **extra}


def space_body(code, kind="storage", **extra):
    return {"kind": kind, "code": code, "name": f"공간 {code}",
            "space": {"space_type": "buffer"}, **extra}
