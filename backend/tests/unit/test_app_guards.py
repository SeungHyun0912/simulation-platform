import pytest

from simulation_platform.api.app import create_app
from simulation_platform.domain.errors import InvalidCursorError, ValidationFailed
from simulation_platform.domain.pagination import decode_cursor, encode_cursor, parse_sort
from simulation_platform.settings import get_settings


@pytest.fixture
def env(monkeypatch):
    def _set(**values):
        for key, value in values.items():
            monkeypatch.setenv(key, value)
        get_settings.cache_clear()

    yield _set
    monkeypatch.undo()
    get_settings.cache_clear()


def test_local_auth_is_refused_in_production(env):
    env(APP_ENV="production", AUTH_MODE="local")
    with pytest.raises(RuntimeError, match="production"):
        create_app()


def test_local_auth_allowed_outside_production(env):
    env(APP_ENV="development", AUTH_MODE="local")
    create_app()


def test_cursor_roundtrip_and_rejections():
    cursor = encode_cursor("t1", [1, "a"])
    assert decode_cursor(cursor, "t1", 2) == [1, "a"]
    for bad in (cursor, "###", "e30"):
        with pytest.raises(InvalidCursorError):
            decode_cursor(bad, "other" if bad == cursor else "t1", 2)
    with pytest.raises(InvalidCursorError):
        decode_cursor(cursor, "t1", 3)


def test_parse_sort():
    assert parse_sort(None, ("code", "name"), "code") == ("code", False)
    assert parse_sort("-name", ("code", "name"), "code") == ("name", True)
    with pytest.raises(ValidationFailed):
        parse_sort("bogus", ("code",), "code")
