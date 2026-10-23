"""개발용 시드가 멱등이고, 시드한 사용자로 실제 API가 동작하는지 확인한다."""

import sys
from pathlib import Path

from helpers import headers

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import seed_dev_data

API = "/api/v1"


def test_seed_is_idempotent_and_users_can_use_the_api(client, engine, db):
    first = seed_dev_data.seed(engine)
    second = seed_dev_data.seed(engine)
    assert first == second
    assert db.scalar("select count(*) from project_member where project_id = :p",
                     p=first["project_id"]) == 3

    admin, editor, viewer = (first["users"][n] for n in ("admin", "editor", "viewer"))
    me = client.get(f"{API}/me", headers=headers(admin)).json()["data"]
    assert [p["role"] for p in me["projects"] if p["id"] == str(first["project_id"])] == ["admin"]

    body = {"kind": "storage", "code": f"SEED-{first['project_id'].hex[:6]}", "name": "시드 확인",
            "space": {"space_type": "buffer"}}
    url = f"{API}/projects/{first['project_id']}/assets"
    created = client.post(url, json=body, headers=headers(editor))
    assert created.status_code in (201, 409)  # 이미 이전 실행에서 만들었다면 409
    assert client.post(url, json={**body, "code": "SEED-VIEWER"},
                       headers=headers(viewer)).status_code == 403


def test_seed_script_refuses_without_confirmation_or_in_production(monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@127.0.0.1:5432/x_test")
    assert seed_dev_data.main(["seed", ]) == 2  # --yes 없이는 실행하지 않는다
    monkeypatch.setenv("APP_ENV", "production")
    assert seed_dev_data.main(["seed", "--yes"]) == 2
    assert "production" in capsys.readouterr().err
