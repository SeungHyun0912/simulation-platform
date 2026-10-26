"""통합 검증(INT) 공통 fixture. 실제 HTTP API와 실제 PostgreSQL을 사용한다(Mock 없음).

대상은 통합 검증 전용 환경이다. 기본값은 다음과 같다.
- API: http://127.0.0.1:8100/api/v1 (INT_API 로 변경)
- DB : simulation_platform_int_test (INT_DATABASE_URL 로 변경, 읽기 전용 검증에만 사용)

안전장치: 공유 개발 API(포트 8000)와 이름이 `_int_test`로 끝나지 않는 DB는 거부한다.
시험 데이터 코드는 모두 `INT<실행ID>-` 접두사를 쓰고 기존 시드 데이터는 수정하지 않는다.
"""

import os
import uuid
from urllib.parse import urlparse

import httpx
import psycopg
import pytest

API = os.environ.get("INT_API", "http://127.0.0.1:8100/api/v1").rstrip("/")
DB_URL = os.environ.get(
    "INT_DATABASE_URL",
    "postgresql://postgres:postgres@127.0.0.1:5432/simulation_platform_int_test",
)
RUN = uuid.uuid4().hex[:6]

# 시드 스크립트가 만드는 개발 전용 식별자(비밀값이 아니다).
USERS = {
    "admin": "e5a11d34-ddab-5412-bf1b-a0daeb2bb81a",  # DEMO-A·B·WIRE admin
    "editor": "be97ba06-d557-541d-a215-60d98b14de06",  # A editor
    "viewer": "2628054b-3888-5d81-ad9d-05cd7e1829c2",  # A viewer
    "mixed": "13832011-3005-5d5f-9fe6-401d162c2a00",  # A admin, B viewer
    "nobody": "1afa5603-8a7e-56c2-b626-1e4b28d162bd",  # 소속 없음
    "other_org": "e64d894b-9649-5c64-af56-d4fcc7d52997",  # 다른 조직 C만
}
PROJECT_A = "9985bf99-c375-58b0-a776-5a1cc5053585"
PROJECT_B = "c649e3ed-2918-5229-a63e-67aef6b4308b"
PROJECT_C = "b9757982-01f1-5c3e-9190-8195282e6362"
PROJECT_WIRE = "b16c84ae-4033-5315-bd1d-a562b2e9e180"


def pytest_configure(config):
    if urlparse(API).port == 8000:
        pytest.exit("INT_API가 공유 개발 서버(8000)를 가리킵니다. 통합 검증은 전용 서버에서만 실행합니다.", 2)
    dbname = urlparse(DB_URL).path.lstrip("/")
    if not dbname.endswith("_int_test"):
        pytest.exit(f"INT 전용 DB 이름은 '_int_test'로 끝나야 합니다: {dbname!r}", 2)


class Client:
    """역할별 호출 도우미. 사용한 If-Match는 호출자가 명시한다(자동 재시도·자동 갱신 없음)."""

    def __init__(self, user: str | None):
        headers = {"X-Debug-User": USERS[user]} if user else {}
        self.http = httpx.Client(base_url=API, headers=headers, timeout=30)

    def get(self, path, **kw):
        return self.http.get(path, **kw)

    def post(self, path, json=None, etag=None, **kw):
        return self.http.post(path, json=json, headers=_if_match(etag), **kw)

    def patch(self, path, json, etag=None, **kw):
        return self.http.patch(path, json=json, headers=_if_match(etag), **kw)

    def put(self, path, json, etag=None, **kw):
        return self.http.put(path, json=json, headers=_if_match(etag), **kw)


def _if_match(etag):
    return {"If-Match": etag} if etag is not None else {}


def data(resp, status=None):
    """응답을 검사하고 data를 돌려준다. 실패 시 본문과 request id를 메시지에 남긴다."""
    ok = resp.status_code == status if status else resp.is_success
    assert ok, f"{resp.request.method} {resp.request.url} -> {resp.status_code} {resp.text[:600]} rid={resp.headers.get('x-request-id')}"
    return resp.json()["data"]


def error_code(resp):
    return resp.json()["error"]["code"]


@pytest.fixture(scope="session")
def run_id() -> str:
    return RUN


@pytest.fixture(scope="session")
def clients() -> dict[str, Client]:
    return {name: Client(name) for name in USERS} | {"anon": Client(None)}


@pytest.fixture(scope="session")
def admin(clients) -> Client:
    return clients["admin"]


@pytest.fixture(scope="session", autouse=True)
def server_reachable(admin):
    try:
        admin.get("/me")
    except httpx.HTTPError as exc:
        pytest.exit(f"전용 API({API})에 연결할 수 없습니다: {exc}", 2)


@pytest.fixture(scope="session")
def db():
    """전용 DB 읽기 전용 연결(검증용 조회만 한다)."""
    conn = psycopg.connect(DB_URL, autocommit=True)
    conn.execute("set default_transaction_read_only = on")
    yield conn
    conn.close()
