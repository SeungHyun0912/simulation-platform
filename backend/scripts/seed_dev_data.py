"""로컬 개발용 최소 시드: 조직 1, 사용자 3(admin/editor/viewer), 프로젝트 1.

프런트엔드가 실제 API 모드로 개발할 때 `X-Debug-User`에 넣을 사용자 id를 얻기 위한 스크립트다.
설비·공간 같은 업무 데이터는 만들지 않는다(화면·API로 직접 등록). 같은 id를 쓰므로 여러 번 실행해도 안전하다.

사용: DATABASE_URL=... python scripts/seed_dev_data.py --yes
운영(APP_ENV=production)에서는 실행을 거부한다. 대상 DB에는 migration이 이미 적용되어 있어야 한다.
"""

import argparse
import os
import sys
import uuid

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

# 고정 namespace: 같은 이름은 항상 같은 UUID가 된다(멱등 시드).
NAMESPACE = uuid.UUID("7f1c0d6e-5b7e-4e65-9a64-0c5f3f0d2a10")
ROLES = {"admin": ("admin", "admin"), "editor": ("member", "editor"), "viewer": ("member", "viewer")}


def dev_id(name: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, name)


def seed(engine: Engine) -> dict:
    org, project = dev_id("organization"), dev_id("project")
    users = {name: dev_id(f"user:{name}") for name in ROLES}
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO organization (id, name, code) VALUES (:i, '개발용 조직', 'dev-org') "
                          "ON CONFLICT DO NOTHING"), {"i": org})
        for name, user_id in users.items():
            org_role, _ = ROLES[name]
            conn.execute(text(
                "INSERT INTO app_user (id, auth_issuer, auth_subject, display_name) "
                "VALUES (:i, 'local-dev', :s, :n) ON CONFLICT DO NOTHING"),
                {"i": user_id, "s": name, "n": f"개발용 {name}"})
            conn.execute(text(
                "INSERT INTO organization_member (id, organization_id, user_id, role) "
                "VALUES (:i, :o, :u, :r) ON CONFLICT DO NOTHING"),
                {"i": dev_id(f"org-member:{name}"), "o": org, "u": user_id, "r": org_role})
        conn.execute(text(
            "INSERT INTO project (id, organization_id, code, name, timezone) "
            "VALUES (:i, :o, 'DEV-PROJECT', '개발용 프로젝트', 'Asia/Seoul') ON CONFLICT DO NOTHING"),
            {"i": project, "o": org})
        for name, user_id in users.items():
            _, project_role = ROLES[name]
            conn.execute(text(
                "INSERT INTO project_member (id, organization_id, project_id, user_id, role) "
                "VALUES (:i, :o, :p, :u, :r) ON CONFLICT DO NOTHING"),
                {"i": dev_id(f"project-member:{name}"), "o": org, "p": project, "u": user_id,
                 "r": project_role})
    return {"organization_id": org, "project_id": project, "users": users}


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
    print(f"project_id={result['project_id']}")
    for name, user_id in result["users"].items():
        print(f"X-Debug-User ({name}) = {user_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
