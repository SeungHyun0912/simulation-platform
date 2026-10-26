"""BE-04b: migration 0005(process_editor_state)의 제약을 API를 거치지 않고 DB에서 검증한다."""

import uuid

import pytest
from sqlalchemy.exc import DBAPIError
from test_process_constraints import CHECK, FK, UNIQUE, World, set_status, sqlstate


@pytest.fixture
def w(db):
    return World(db)


def editor_state(w, db, version, *, user=None, positions="{}", viewport=None, project=None):
    sid = uuid.uuid4()
    db.run((("INSERT INTO process_editor_state (id,project_id,process_version_id,user_id,"
             "node_positions,viewport) VALUES (:i,:p,:v,:u,CAST(:np AS jsonb),CAST(:vp AS jsonb))"),
            {"i": sid, "p": project or w.project, "v": version, "u": user, "np": positions,
             "vp": viewport}))
    return sid


def test_editor_state_is_unique_per_version_for_shared_and_per_user(w, db):
    vid = w.version()
    editor_state(w, db, vid)
    with pytest.raises(DBAPIError) as e:
        editor_state(w, db, vid)  # 공용(user_id NULL)은 버전당 하나
    assert sqlstate(e) == UNIQUE
    user = db.user()
    editor_state(w, db, vid, user=user)  # 사용자별 행은 공용과 공존한다(나중 확장용)
    with pytest.raises(DBAPIError) as e:
        editor_state(w, db, vid, user=user)
    assert sqlstate(e) == UNIQUE


def test_editor_state_json_shape_and_project_scope(w, db):
    vid = w.version()
    with pytest.raises(DBAPIError) as e:
        editor_state(w, db, vid, positions="[]")
    assert sqlstate(e) == CHECK
    with pytest.raises(DBAPIError) as e:
        editor_state(w, db, vid, viewport="[1]")
    assert sqlstate(e) == CHECK
    with pytest.raises(DBAPIError) as e:
        editor_state(w, db, vid, project=db.project(db.org()))  # 다른 프로젝트 + 이 버전
    assert sqlstate(e) == FK


def test_editor_state_is_not_frozen_with_the_version(w, db):
    """화면 좌표는 공정 내용이 아니므로 승인본·검토 중에도 쓰고 지울 수 있다."""
    vid = w.version()
    set_status(db, vid, "in_review")
    set_status(db, vid, "approved", approved=True)
    sid = editor_state(w, db, vid, positions='{"a": {"x": 1, "y": 2}}')
    db.run((("UPDATE process_editor_state SET node_positions = CAST(:p AS jsonb) "
             "WHERE id = :i"), {"p": '{"a": {"x": 3, "y": 4}}', "i": sid}))
    assert db.scalar("SELECT node_positions->'a'->>'x' FROM process_editor_state WHERE id = :i",
                     i=sid) == "3"
    db.run(("DELETE FROM process_editor_state WHERE id = :i", {"i": sid}))
