"""승인 scope의 계약 예제를 실제 API 응답에서 생성한다(손으로 쓴 예제와 구현의 불일치 방지).

사용: python scripts/generate_contract_examples.py <출력 디렉터리>
대상 DB는 TEST_DATABASE_URL(기본: 로컬 simulation_platform_test, 이름이 `_test`로 끝나야 함).
스키마는 이미 head여야 한다(통합 테스트가 만든 상태). UUID·시각은 고정값으로 치환한다.
"""

import json
import os
import re
import sys
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from simulation_platform.api.app import create_app
from simulation_platform.db import get_session
from simulation_platform.settings import Settings, get_settings

DEFAULT_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/simulation_platform_test"
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
TS_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z")


class Normalizer:
    """등장 순서대로 UUID를 00000000-0000-4000-8000-0000000000NN으로 치환한다."""

    def __init__(self) -> None:
        self.map: dict[str, str] = {}

    def __call__(self, value):
        text_value = json.dumps(value, ensure_ascii=False)

        def uuid_sub(m):
            return self.map.setdefault(
                m.group(0), f"00000000-0000-4000-8000-{len(self.map) + 1:012d}")

        text_value = UUID_RE.sub(uuid_sub, text_value)
        text_value = TS_RE.sub("2026-10-23T00:00:00Z", text_value)
        text_value = re.sub(r'"req-[0-9a-f]{32}"', '"req-example"', text_value)
        text_value = re.sub(r'"next_cursor": "[^"]+"', '"next_cursor": "opaque-cursor-example"',
                            text_value)
        return json.loads(text_value)


def main(out_dir: Path) -> None:
    url = os.environ.get("TEST_DATABASE_URL", DEFAULT_URL)
    if not (make_url(url).database or "").endswith("_test"):
        raise SystemExit("테스트 DB(`_test`)만 사용할 수 있습니다.")
    engine = create_engine(url)
    org, admin = uuid.uuid4(), uuid.uuid4()
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO organization (id,name,code) VALUES (:i,'예시 조직',:c)"),
                     {"i": org, "c": f"example-{org}"})
        conn.execute(text("INSERT INTO app_user (id,auth_issuer,auth_subject,display_name) "
                          "VALUES (:i,'example',:s,'예시 사용자')"), {"i": admin, "s": str(admin)})
        conn.execute(text("INSERT INTO organization_member (id,organization_id,user_id,role) "
                          "VALUES (:i,:o,:u,'admin')"), {"i": uuid.uuid4(), "o": org, "u": admin})

    app = create_app()

    def _session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_settings] = lambda: Settings(
        app_env="test", auth_mode="local", _env_file=None)
    client = TestClient(app)
    base = {"X-Debug-User": str(admin)}
    norm = Normalizer()
    out_dir.mkdir(parents=True, exist_ok=True)
    api = "/api/v1"

    def record(name, method, path, response, request_body=None, request_headers=None):
        canonical = {"etag": "ETag", "location": "Location"}
        headers = {canonical[k]: v for k, v in response.headers.items() if k in canonical}
        example = {
            "request": {"method": method, "path": path,
                        **({"headers": request_headers} if request_headers else {}),
                        **({"body": request_body} if request_body is not None else {})},
            "response": {"status": response.status_code,
                         **({"headers": headers} if headers else {}),
                         "body": response.json()},
        }
        (out_dir / f"{name}.json").write_text(
            json.dumps(norm(example), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8", newline="\n")

    proj_body = {"organization_id": str(org), "code": "DEMO-WIRE", "name": "전선 공장 예제",
                 "timezone": "Asia/Seoul", "description": "예제 프로젝트"}
    r = client.post(f"{api}/projects", json=proj_body, headers=base)
    record("project.create", "POST", f"{api}/projects", r, proj_body)
    pid = r.json()["data"]["id"]
    assets = f"{api}/projects/{pid}/assets"

    eq_body = {"kind": "equipment", "code": "EQ-001", "name": "실리콘 절연 압출기",
               "sort_order": 10, "equipment": {"equipment_type": "extruder"}}
    r = client.post(assets, json=eq_body, headers=base)
    record("asset.create.equipment", "POST", assets, r, eq_body)
    eq_id = r.json()["data"]["id"]

    st_body = {"kind": "storage", "code": "ST-001", "name": "원자재 보관 공간",
               "sort_order": 20, "space": {"space_type": "storage"}}
    r = client.post(assets, json=st_body, headers=base)
    record("asset.create.storage", "POST", assets, r, st_body)

    r = client.get(f"{assets}?limit=1", headers=base)
    record("asset.list", "GET", f"{assets}?limit=1", r)

    patch_body = {"name": "실리콘 절연 압출기(수정)", "external_ref": "ERP-0001",
                  "equipment": {"model_name": "EX-100"}}
    target = f"{assets}/{eq_id}"
    r = client.patch(target, json=patch_body, headers={**base, "If-Match": '"1"'})
    record("asset.patch", "PATCH", target, r, patch_body, {"If-Match": '"1"'})

    r = client.patch(target, json={"name": "충돌"}, headers={**base, "If-Match": '"1"'})
    record("error.edit-conflict", "PATCH", target, r, {"name": "충돌"}, {"If-Match": '"1"'})
    r = client.patch(target, json={"name": "헤더 없음"}, headers=base)
    record("error.precondition-required", "PATCH", target, r, {"name": "헤더 없음"})
    dup = {**eq_body, "name": "중복 코드"}
    r = client.post(assets, json=dup, headers=base)
    record("error.asset-code-conflict", "POST", assets, r, dup)
    bad = {"kind": "equipment", "code": "EQ-002", "name": "상세 누락"}
    r = client.post(assets, json=bad, headers=base)
    record("error.validation", "POST", assets, r, bad)
    missing = f"{assets}/{uuid.uuid4()}"
    r = client.get(missing, headers=base)
    record("error.not-found", "GET", missing, r)
    print(f"{len(list(out_dir.glob('*.json')))} examples -> {out_dir}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
