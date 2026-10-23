"""실제 PostgreSQL 통합 테스트 fixture.

대상은 TEST_DATABASE_URL(기본: 로컬 compose의 simulation_platform_test)이다.
DB 이름이 `_test`로 끝나지 않으면 거부한다(개발/운영 DB를 지우지 않기 위한 안전장치).
세션 시작 시 downgrade base → upgrade head로 스키마를 새로 만든다.
DB에 연결할 수 없으면 건너뛰지만(skip), REQUIRE_DB=1이면 실패로 처리한다.
"""

import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/simulation_platform_test"


def _alembic_config(url: str) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


@pytest.fixture(scope="session")
def db_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL", DEFAULT_URL)
    name = make_url(url).database or ""
    if not name.endswith("_test"):
        pytest.fail(f"테스트 DB 이름은 '_test'로 끝나야 합니다: {name!r}")
    return url


@pytest.fixture(scope="session")
def engine(db_url):
    eng = create_engine(db_url)
    try:
        with eng.connect() as conn:
            conn.execute(text("select 1"))
    except Exception as exc:  # noqa: BLE001
        if os.environ.get("REQUIRE_DB") == "1":
            pytest.fail(f"PostgreSQL 연결 실패: {exc}")
        pytest.skip(f"PostgreSQL에 연결할 수 없어 통합 테스트를 건너뜁니다: {exc}")
    cfg = _alembic_config(db_url)
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture(scope="session")
def alembic_cfg(db_url) -> Config:
    return _alembic_config(db_url)


class Db:
    """테스트용 얇은 SQL 헬퍼. 모든 호출은 독립 트랜잭션으로 커밋한다."""

    def __init__(self, engine):
        self.engine = engine

    def run(self, *statements):
        """(sql, params) 목록을 한 트랜잭션으로 실행하고 커밋한다."""
        with self.engine.begin() as conn:
            for sql, params in statements:
                conn.execute(text(sql), params)

    def scalar(self, sql, **params):
        with self.engine.connect() as conn:
            return conn.execute(text(sql), params).scalar()

    # 시드 헬퍼 ------------------------------------------------------------
    def org(self):
        oid = uuid.uuid4()
        self.run(("INSERT INTO organization (id,name,code) VALUES (:i,'o',:c)",
                  {"i": oid, "c": f"o-{oid}"}))
        return oid

    def user(self):
        uid = uuid.uuid4()
        self.run((("INSERT INTO app_user (id,auth_issuer,auth_subject,display_name) "
                  "VALUES (:i,'test',:s,'u')"), {"i": uid, "s": str(uid)}))
        return uid

    def project(self, org, code=None):
        pid = uuid.uuid4()
        self.run((("INSERT INTO project (id,organization_id,code,name,timezone) "
                  "VALUES (:i,:o,:c,'p','Asia/Seoul')"),
                  {"i": pid, "o": org, "c": code or f"p-{pid}"}))
        return pid

    def asset_stmts(self, project, kind, code, ports):
        """asset + 상세 + 포트 INSERT 문 목록. ports는 (port_key, role) 목록."""
        aid = uuid.uuid4()
        stmts = [("INSERT INTO asset (id,project_id,kind,code,name) VALUES (:i,:p,:k,:c,'n')",
                  {"i": aid, "p": project, "k": kind, "c": code})]
        if kind == "equipment":
            stmts.append((("INSERT INTO equipment_detail (asset_id,project_id,equipment_type) "
                          "VALUES (:i,:p,'t')"), {"i": aid, "p": project}))
        else:
            stmts.append((("INSERT INTO space_detail (asset_id,project_id,asset_kind,space_type) "
                          "VALUES (:i,:p,:k,'t')"), {"i": aid, "p": project, "k": kind}))
        for key, role in ports:
            stmts.append((("INSERT INTO asset_port (id,project_id,asset_id,asset_kind,port_key,"
                          "role,label) VALUES (:id,:p,:a,:k,:key,:r,'l')"),
                          {"id": uuid.uuid4(), "p": project, "a": aid, "k": kind,
                           "key": key, "r": role}))
        return aid, stmts

    def asset(self, project, kind="equipment", code=None, ports=None):
        if ports is None:
            ports = [("IN", "IN"), ("OUT", "OUT")] if kind == "equipment" else [("ACCESS-01", "ACCESS")]
        aid, stmts = self.asset_stmts(project, kind, code or f"a-{uuid.uuid4()}", ports)
        self.run(*stmts)
        return aid


@pytest.fixture
def db(engine) -> Db:
    return Db(engine)


# --- API(TestClient) -----------------------------------------------------------

def _app_with_engine(engine):
    from sqlalchemy.orm import Session

    from simulation_platform.api.app import create_app
    from simulation_platform.db import get_session
    from simulation_platform.settings import Settings, get_settings

    app = create_app()

    def _session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_settings] = lambda: Settings(
        app_env="test", auth_mode="local", _env_file=None)
    return app


@pytest.fixture
def make_client(engine):
    """독립된 TestClient 팩토리(동시 요청 테스트에서 여러 개 사용)."""
    from fastapi.testclient import TestClient

    return lambda: TestClient(_app_with_engine(engine))


@pytest.fixture
def client(make_client):
    return make_client()


@pytest.fixture
def world(db):
    """조직 하나와 역할별 사용자. admin만 조직 admin, 나머지는 조직 member, outsider는 다른 조직."""
    org = db.org()
    other_org = db.org()
    users = {name: db.user() for name in ("admin", "editor", "viewer", "outsider")}
    for name in ("admin", "editor", "viewer"):
        db.run((("INSERT INTO organization_member (id,organization_id,user_id,role) "
                "VALUES (:i,:o,:u,:r)"), {"i": uuid.uuid4(), "o": org, "u": users[name],
                                         "r": "admin" if name == "admin" else "member"}))
    db.run((("INSERT INTO organization_member (id,organization_id,user_id,role) "
            "VALUES (:i,:o,:u,'admin')"), {"i": uuid.uuid4(), "o": other_org,
                                          "u": users["outsider"]}))
    return {"org": org, "other_org": other_org, "users": users}
