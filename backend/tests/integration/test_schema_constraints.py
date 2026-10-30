"""BE-01b: migration 0001의 제약을 실제 PostgreSQL에서 검증한다. ERD §13 게이트 일부 대응."""

import uuid

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from simulation_platform.models import Base

UNIQUE, FK, CHECK, RESTRICT = "23505", "23503", "23514", "23001"


def sqlstate(excinfo) -> str:
    return excinfo.value.orig.sqlstate


def test_head_and_no_model_drift(engine, alembic_cfg):
    with engine.connect() as conn:
        assert conn.execute(text("select version_num from alembic_version")).scalar() == "0012"
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    assert diff == []


def test_downgrade_and_upgrade_roundtrip(engine, alembic_cfg):
    command.downgrade(alembic_cfg, "base")
    with engine.connect() as conn:
        assert conn.execute(text("select to_regclass('asset')")).scalar() is None
    command.upgrade(alembic_cfg, "head")
    with engine.connect() as conn:
        assert conn.execute(text("select to_regclass('asset')")).scalar() == "asset"


# --- 프로젝트 격리 ----------------------------------------------------------

def test_same_asset_code_allowed_in_two_projects_but_not_twice_in_one(db):
    org = db.org()
    p1, p2 = db.project(org), db.project(org)
    db.asset(p1, code="EQ-001")
    db.asset(p2, code="EQ-001")
    with pytest.raises(DBAPIError) as e:
        db.asset(p1, code="EQ-001")
    assert sqlstate(e) == UNIQUE


def test_port_cannot_reference_asset_of_another_project(db):
    org = db.org()
    p1, p2 = db.project(org), db.project(org)
    a1 = db.asset(p1)
    with pytest.raises(DBAPIError) as e:
        db.run((("INSERT INTO asset_port (id,project_id,asset_id,asset_kind,port_key,role,label) "
                "VALUES (:id,:p,:a,'equipment','X','IN','l')"),
                {"id": uuid.uuid4(), "p": p2, "a": a1}))
    assert sqlstate(e) == FK


def test_detail_cannot_reference_asset_of_another_project(db):
    org = db.org()
    p1, p2 = db.project(org), db.project(org)
    aid, stmts = db.asset_stmts(p1, "equipment", "EQ-X", [("IN", "IN"), ("OUT", "OUT")])
    db.run(*stmts)
    with pytest.raises(DBAPIError) as e:
        db.run((("INSERT INTO equipment_detail (asset_id,project_id,equipment_type) "
                "VALUES (:a,:p,'t')"), {"a": aid, "p": p2}))
    assert sqlstate(e) in (FK, UNIQUE)


def test_project_member_must_belong_to_organization(db):
    org_a, org_b = db.org(), db.org()
    user = db.user()
    proj_b = db.project(org_b)
    db.run((("INSERT INTO organization_member (id,organization_id,user_id,role) "
            "VALUES (:i,:o,:u,'member')"), {"i": uuid.uuid4(), "o": org_a, "u": user}))
    # 조직 A 소속 사용자는 조직 B 프로젝트에 참여할 수 없다.
    with pytest.raises(DBAPIError) as e:
        db.run((("INSERT INTO project_member (id,organization_id,project_id,user_id,role) "
                "VALUES (:i,:o,:p,:u,'viewer')"),
                {"i": uuid.uuid4(), "o": org_b, "p": proj_b, "u": user}))
    assert sqlstate(e) == FK
    # 조직 A 프로젝트에는 참여 가능
    proj_a = db.project(org_a)
    db.run((("INSERT INTO project_member (id,organization_id,project_id,user_id,role) "
            "VALUES (:i,:o,:p,:u,'viewer')"),
            {"i": uuid.uuid4(), "o": org_a, "p": proj_a, "u": user}))


# --- 포트 불변식 ------------------------------------------------------------

def test_equipment_created_atomically_with_in_and_out(db):
    p = db.project(db.org())
    aid = db.asset(p, "equipment")
    roles = db.scalar("select string_agg(role, ',' order by role) from asset_port "
                      "where asset_id = :a", a=aid)
    assert roles == "IN,OUT"


@pytest.mark.parametrize("ports", [[], [("IN", "IN")], [("OUT", "OUT")]])
def test_equipment_without_both_in_and_out_fails_at_commit(db, ports):
    p = db.project(db.org())
    _, stmts = db.asset_stmts(p, "equipment", f"EQ-{uuid.uuid4()}", ports)
    with pytest.raises(DBAPIError) as e:
        db.run(*stmts)
    assert sqlstate(e) == CHECK


def test_equipment_cannot_have_second_in_port(db):
    p = db.project(db.org())
    _, stmts = db.asset_stmts(p, "equipment", f"EQ-{uuid.uuid4()}",
                              [("IN", "IN"), ("IN-2", "IN"), ("OUT", "OUT")])
    with pytest.raises(DBAPIError) as e:
        db.run(*stmts)
    assert sqlstate(e) == UNIQUE


def test_equipment_cannot_have_access_port_and_space_cannot_have_in(db):
    p = db.project(db.org())
    _, s1 = db.asset_stmts(p, "equipment", f"EQ-{uuid.uuid4()}",
                           [("IN", "IN"), ("OUT", "OUT"), ("ACCESS-01", "ACCESS")])
    with pytest.raises(DBAPIError) as e:
        db.run(*s1)
    assert sqlstate(e) == CHECK
    _, s2 = db.asset_stmts(p, "storage", f"ST-{uuid.uuid4()}", [("IN", "IN")])
    with pytest.raises(DBAPIError) as e:
        db.run(*s2)
    assert sqlstate(e) == CHECK


def test_space_requires_access_port_and_supports_multiple(db):
    p = db.project(db.org())
    _, empty = db.asset_stmts(p, "dock", f"ST-{uuid.uuid4()}", [])
    with pytest.raises(DBAPIError) as e:
        db.run(*empty)
    assert sqlstate(e) == CHECK
    aid = db.asset(p, "storage", ports=[("ACCESS-01", "ACCESS"), ("ACCESS-02", "ACCESS")])
    assert db.scalar("select count(*) from asset_port where asset_id = :a", a=aid) == 2


def test_removing_required_port_fails_at_commit(db):
    p = db.project(db.org())
    aid = db.asset(p, "equipment")
    with pytest.raises(DBAPIError) as e:
        db.run(("DELETE FROM asset_port WHERE asset_id = :a AND role = 'OUT'", {"a": aid}))
    assert sqlstate(e) == CHECK


def test_equipment_detail_requires_equipment_kind(db):
    p = db.project(db.org())
    storage = db.asset(p, "storage")
    with pytest.raises(DBAPIError) as e:
        db.run((("INSERT INTO equipment_detail (asset_id,project_id,equipment_type) "
                "VALUES (:a,:p,'t')"), {"a": storage, "p": p}))
    assert sqlstate(e) in (FK, CHECK)


def test_asset_kind_cannot_change_while_subtype_exists(db):
    p = db.project(db.org())
    aid = db.asset(p, "equipment")
    with pytest.raises(DBAPIError) as e:
        db.run(("UPDATE asset SET kind = 'storage' WHERE id = :a", {"a": aid}))
    assert sqlstate(e) == FK


def test_invalid_enum_values_rejected(db):
    org = db.org()
    with pytest.raises(DBAPIError) as e:
        db.run((("INSERT INTO project (id,organization_id,code,name,timezone,status) "
                "VALUES (:i,:o,'x','n','Asia/Seoul','bogus')"), {"i": uuid.uuid4(), "o": org}))
    assert sqlstate(e) == CHECK


# --- 감사 로그 ---------------------------------------------------------------

def test_audit_log_is_append_only(db):
    org = db.org()
    lid = uuid.uuid4()
    db.run((("INSERT INTO audit_log (id,organization_id,action,entity_type) "
            "VALUES (:i,:o,'create','project')"), {"i": lid, "o": org}))
    for sql in ("UPDATE audit_log SET action = 'x' WHERE id = :i",
                "DELETE FROM audit_log WHERE id = :i"):
        with pytest.raises(DBAPIError) as e:
            db.run((sql, {"i": lid}))
        assert sqlstate(e) == RESTRICT
    with pytest.raises(DBAPIError) as e:
        db.run(("TRUNCATE audit_log", {}))
    assert sqlstate(e) == RESTRICT
