"""화면·연동 검증용 **시험 데이터** 시드(FE 요청 BE-REQ-006). 실제 기준정보가 아니다.

사용: DATABASE_URL=... python scripts/seed_demo_data.py --yes   (개발용 시드가 없으면 먼저 실행한다)
- 모든 이름에 "[시험]"을 붙인다. 설비 96대·공간 22곳 같은 미승인 도메인 값을 쓰지 않는다.
- 자산·버전은 **실제 API(서비스 계층)로 만든다**: 검증 규칙·감사 로그·상태 전이가 운영 경로와 같다.
- 프로젝트·사용자·멤버는 개발용 시드처럼 고정 UUID로 직접 넣는다(멱등). 이미 시험 자산이 있으면 자산 시드는 건너뛴다.
- 운영(APP_ENV=production)에서는 실행을 거부한다.

만드는 것 (프로젝트 A에 집중):
- 프로젝트 3개(시간대 다름, 조직 2개), 사용자 추가 3명(소속 없음 / 프로젝트별 역할이 다름 / 다른 조직 admin)
- 자산 60건(설비 25·저장 25·도킹 10) + 보관된 자산 1건 → 기본 limit 50에서 next_cursor가 나온다
- 버전 상태별 샘플(없음/draft/in_review/approved/approved+draft/superseded 이력/approved+in_review)과 용량·규칙 케이스
- 프로젝트 B에 같은 코드(EQ-001) 자산 1건(프로젝트 격리 확인)
- 제품 8건(규격 입력/미정 혼합)·재료 4건(default_spec 확정/미정/해당 없음 혼합), 프로젝트 B에 같은 코드(P-001) 제품 1건
"""

import argparse
import os
import sys
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parent))
import seed_dev_data

from simulation_platform.api.app import create_app
from simulation_platform.db import get_session
from simulation_platform.settings import Settings, get_settings

API = "/api/v1"
dev_id = seed_dev_data.dev_id


def fixed(name: str) -> uuid.UUID:
    return dev_id(f"demo:{name}")


def seed_fixtures(engine: Engine) -> dict:
    """프로젝트·사용자·멤버(고정 UUID, 멱등)."""
    base = seed_dev_data.seed(engine)
    org_a, org_b = base["organization_id"], fixed("org-b")
    users = dict(base["users"])
    for name in ("nobody", "mixed", "other-org-admin"):
        users[name] = fixed(f"user:{name}")
    projects = {"A": fixed("project-a"), "B": fixed("project-b"), "C": fixed("project-c")}
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO organization (id, name, code) VALUES (:i, '[시험] 다른 조직', "
                          "'demo-org-b') ON CONFLICT DO NOTHING"), {"i": org_b})
        for name in ("nobody", "mixed", "other-org-admin"):
            conn.execute(text(
                "INSERT INTO app_user (id, auth_issuer, auth_subject, display_name) "
                "VALUES (:i, 'local-dev', :s, :n) ON CONFLICT DO NOTHING"),
                {"i": users[name], "s": name, "n": f"[시험] {name}"})
        org_members = [(org_a, "mixed", "member"), (org_b, "other-org-admin", "admin")]
        for org, user, role in org_members:
            conn.execute(text(
                "INSERT INTO organization_member (id, organization_id, user_id, role) "
                "VALUES (:i, :o, :u, :r) ON CONFLICT DO NOTHING"),
                {"i": fixed(f"org-member:{user}"), "o": org, "u": users[user], "r": role})
        specs = [("A", org_a, "DEMO-A", "[시험] 프로젝트 A", "Asia/Seoul"),
                 ("B", org_a, "DEMO-B", "[시험] 프로젝트 B (UTC)", "UTC"),
                 ("C", org_b, "DEMO-C", "[시험] 다른 조직 프로젝트", "America/New_York")]
        for key, org, code, name, tz in specs:
            conn.execute(text(
                "INSERT INTO project (id, organization_id, code, name, timezone) "
                "VALUES (:i, :o, :c, :n, :t) ON CONFLICT DO NOTHING"),
                {"i": projects[key], "o": org, "c": code, "n": name, "t": tz})
        members = [("A", org_a, "admin", "admin"), ("A", org_a, "editor", "editor"),
                   ("A", org_a, "viewer", "viewer"), ("A", org_a, "mixed", "admin"),
                   ("B", org_a, "admin", "admin"), ("B", org_a, "mixed", "viewer"),
                   ("C", org_b, "other-org-admin", "admin")]
        for key, org, user, role in members:
            conn.execute(text(
                "INSERT INTO project_member (id, organization_id, project_id, user_id, role) "
                "VALUES (:i, :o, :p, :u, :r) ON CONFLICT DO NOTHING"),
                {"i": fixed(f"project-member:{key}:{user}"), "o": org, "p": projects[key],
                 "u": users[user], "r": role})
    return {"users": users, "projects": projects}


class Seeder:
    def __init__(self, engine: Engine, admin: uuid.UUID):
        app = create_app()

        def _session():
            with Session(engine) as session:
                yield session

        app.dependency_overrides[get_session] = _session
        app.dependency_overrides[get_settings] = lambda: Settings(
            app_env="test", auth_mode="local", _env_file=None)
        self.client = TestClient(app)
        self.headers = {"X-Debug-User": str(admin)}

    def post(self, url, json=None, version=None):
        headers = dict(self.headers)
        if version is not None:
            headers["If-Match"] = f'"{version}"'
        response = self.client.post(url, json=json, headers=headers)
        if response.status_code >= 300:
            raise RuntimeError(f"POST {url} -> {response.status_code}: {response.text}")
        return response.json()["data"]

    def patch(self, url, json, version):
        response = self.client.patch(url, json=json, headers={
            **self.headers, "If-Match": f'"{version}"'})
        if response.status_code >= 300:
            raise RuntimeError(f"PATCH {url} -> {response.status_code}: {response.text}")
        return response.json()["data"]

    def exists(self, project_id, code) -> bool:
        response = self.client.get(f"{API}/projects/{project_id}/assets?q={code}"
                                   "&include_archived=true", headers=self.headers)
        return any(a["code"] == code for a in response.json()["data"])


def capacity(mode, value=None, unit=None):
    return {"mode": mode, **({"value": value, "unit": unit} if mode == "finite" else {})}


def seed_assets(seeder: Seeder, project_a: uuid.UUID, project_b: uuid.UUID, engine: Engine) -> dict:
    if seeder.exists(project_a, "EQ-001"):
        return {"skipped": True}
    a = f"{API}/projects/{project_a}"
    ids: dict[str, str] = {}

    def asset(code, kind, order, **detail):
        body = {"kind": kind, "code": code, "name": f"[시험] {code}", "sort_order": order}
        body["equipment" if kind == "equipment" else "space"] = detail or (
            {"equipment_type": "시험 설비"} if kind == "equipment" else {"space_type": "시험 공간"})
        ids[code] = seeder.post(f"{a}/assets", body)["id"]

    for n in range(1, 26):
        asset(f"EQ-{n:03d}", "equipment", n * 10)
    for n in range(1, 26):
        asset(f"ST-{n:03d}", "storage", 1000 + n * 10)
    for n in range(1, 11):
        asset(f"DK-{n:03d}", "dock", 2000 + n * 10)
    asset("EQ-ARCH", "equipment", 9999)
    with engine.begin() as conn:
        conn.execute(text("UPDATE asset SET archived_at = now() WHERE id = :i"),
                     {"i": uuid.UUID(ids["EQ-ARCH"])})

    def revision(code):
        return seeder.post(f"{a}/assets/{ids[code]}/revisions")

    def step(rev, action, body=None):
        return seeder.post(f"{a}/asset-revisions/{rev['id']}/{action}", body, rev["row_version"])

    def edit(rev, body):
        return seeder.patch(f"{a}/asset-revisions/{rev['id']}", body, rev["row_version"])

    def ports(rev):
        return {p["role"]: p["port_id"] for p in rev["ports"]}

    def port_edit(rev, **by_role):
        pid = ports(rev)
        return edit(rev, {"ports": [{"port_id": pid[role], **fields}
                                    for role, fields in by_role.items()]})

    # 버전 상태 샘플 ①~⑦ (EQ-001은 버전 없음)
    revision("EQ-002")                                                         # ② draft만
    r = port_edit(revision("EQ-003"), IN={"buffer_capacity": capacity("finite", "3", "item")})
    step(r, "submit")                                                          # ③ in_review
    r = port_edit(revision("EQ-004"), IN={"buffer_capacity": capacity("finite", "4", "item")},
                  OUT={"buffer_capacity": capacity("not_allowed")})
    step(step(r, "submit"), "approve")                                         # ④ approved만
    r = port_edit(revision("EQ-005"), IN={"buffer_capacity": capacity("finite", "2", "item")},
                  OUT={"buffer_capacity": capacity("unlimited")})
    step(step(r, "submit"), "approve")
    revision("EQ-005")                                                         # ⑤ approved + 새 draft
    r = port_edit(revision("EQ-006"), IN={"buffer_capacity": capacity("finite", "1", "item")},
                  OUT={"buffer_capacity": capacity("finite", "1", "item")})
    step(step(r, "submit"), "approve")
    r = port_edit(revision("EQ-006"), IN={"buffer_capacity": capacity("finite", "5", "item")},
                  OUT={"buffer_capacity": capacity("finite", "5", "item")})
    step(step(r, "submit"), "approve")                                         # ⑥ rev1 superseded
    r = port_edit(revision("EQ-007"), IN={"buffer_capacity": capacity("finite", "2", "item")},
                  OUT={"buffer_capacity": capacity("finite", "2", "item")})
    step(step(r, "submit"), "approve")
    step(revision("EQ-007"), "submit")                                         # ⑦ approved + in_review

    # 용량·규칙 케이스 (draft)
    port_edit(revision("EQ-008"), IN={"buffer_capacity": capacity("finite", "12", "item")},
              OUT={"buffer_capacity": capacity("unlimited")})
    port_edit(revision("EQ-009"), IN={"buffer_capacity": capacity("finite", "12.5", "kg")},
              OUT={"buffer_capacity": capacity("finite", "3.25", "m2")})   # item 외 단위 경고
    port_edit(revision("EQ-010"), IN={"buffer_capacity": capacity("not_allowed")},
              OUT={"buffer_capacity": capacity("finite", "6", "bobbin_slot")})
    port_edit(revision("EQ-011"), IN={"dispatch_rule": {"mode": "unknown"},
                                      "release_rule": {"mode": "unknown"}},
              OUT={"dispatch_rule": {"mode": "unknown"}, "release_rule": {"mode": "unknown"}})
    port_edit(revision("EQ-012"),
              IN={"dispatch_rule": {"mode": "when_destination_available",
                                    "reservation": "reserve", "wait_at_in_if_busy": True}},
              OUT={"release_rule": {"mode": "when_destination_accepts",
                                    "block_machine_while_waiting": "yes"}})
    # 공간·도킹
    edit(revision("ST-001"), {"storage_capacity": capacity("finite", "200", "item")})
    revision("ST-002")                                                         # unknown
    r = edit(revision("ST-003"), {"storage_capacity": capacity("unlimited")})
    step(step(r, "submit"), "approve")
    revision("DK-001")                                                         # 도킹은 무제한으로 가정하지 않음
    r = edit(revision("DK-002"), {"storage_capacity": capacity("not_allowed")})
    step(step(r, "submit"), "approve")

    # 프로젝트 B: 같은 코드(EQ-001) 자산(격리 확인)
    seeder.post(f"{API}/projects/{project_b}/assets", {
        "kind": "equipment", "code": "EQ-001", "name": "[시험] B의 EQ-001",
        "equipment": {"equipment_type": "시험 설비"}})
    return {"skipped": False, "assets": len(ids)}


def seed_catalog(seeder: Seeder, project_a: uuid.UUID, project_b: uuid.UUID) -> dict:
    """제품·재료 시험 데이터(프로젝트 A, 같은 코드 한 쌍은 B). 이미 있으면 건너뛴다."""
    products = f"{API}/projects/{project_a}/products"
    response = seeder.client.get(f"{products}?q=P-001", headers=seeder.headers)
    if any(p["code"] == "P-001" for p in response.json()["data"]):
        return {"skipped": True}
    for n in range(1, 9):
        body = {"code": f"P-{n:03d}", "name": f"[시험] 제품 {n}"}
        if n % 2:  # 홀수는 규격 입력, 짝수는 미정(null)
            body["specification"] = f"[시험] 규격 텍스트 {n}"
        seeder.post(products, body)
    materials = f"{API}/projects/{project_a}/materials"
    known = {"mode": "known"}
    samples = [
        ("M-001", "[시험] 원자재 롤", "롤", {"length_m": {**known, "value": "3000"},
                                          "weight_kg": {**known, "value": "2000"}}),
        ("M-002", "[시험] 보빈 반제품", "보빈", {"length_m": {**known, "value": "1000"},
                                           "unit_count": {**known, "value": 3},
                                           "weight_kg": {"mode": "not_applicable"}}),
        ("M-003", "[시험] 모두 미정", "롤", {}),
        ("M-004", "[시험] 가닥 수만 확정", "다발", {"strand_count": {**known, "value": 12}}),
    ]
    for code, name, form, spec in samples:
        seeder.post(materials, {"code": code, "name": name, "form": form, "default_spec": spec})
    seeder.post(f"{API}/projects/{project_b}/products", {"code": "P-001", "name": "[시험] B의 P-001"})
    return {"skipped": False, "products": 8, "materials": len(samples)}


def seed(engine: Engine) -> dict:
    fixtures = seed_fixtures(engine)
    seeder = Seeder(engine, fixtures["users"]["admin"])
    projects = fixtures["projects"]
    result = seed_assets(seeder, projects["A"], projects["B"], engine)
    catalog = seed_catalog(seeder, projects["A"], projects["B"])
    return {**fixtures, "assets": result, "catalog": catalog}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--yes", action="store_true", help="대상 DB를 확인했으며 시드를 실행한다")
    args = parser.parse_args(argv[1:])
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        print("DATABASE_URL이 필요합니다.", file=sys.stderr)
        return 2
    if os.environ.get("APP_ENV") == "production":
        print("production에서는 실행할 수 없습니다.", file=sys.stderr)
        return 2
    target = make_url(url)
    print(f"대상 DB: {target.host}:{target.port}/{target.database}")
    if not args.yes:
        print("--yes를 붙여야 실행합니다.", file=sys.stderr)
        return 2
    result = seed(create_engine(url))
    for key, project_id in result["projects"].items():
        print(f"project {key} = {project_id}")
    for name, user_id in result["users"].items():
        print(f"X-Debug-User ({name}) = {user_id}")
    print(f"assets: {result['assets']}")
    print(f"catalog: {result['catalog']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
