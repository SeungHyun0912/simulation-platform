"""BE-02: migration 0002의 제약(복합 FK·상태 전이·불변·유일성)을 실제 PostgreSQL에서 검증한다."""

import json
import uuid

import pytest
from sqlalchemy.exc import DBAPIError

UNIQUE, FK, CHECK, RESTRICT = "23505", "23503", "23514", "23001"
UNKNOWN_CAP = json.dumps({"mode": "unknown", "value": None, "unit": None, "status": "unknown"})
RULE = json.dumps({"mode": "unknown"})


def sqlstate(excinfo) -> str:
    return excinfo.value.orig.sqlstate


def port_ids(db, asset_id):
    with db.engine.connect() as conn:
        from sqlalchemy import text

        rows = conn.execute(text("SELECT role, id FROM asset_port WHERE asset_id = :a"),
                            {"a": asset_id}).all()
    return {r: i for r, i in rows}


def revision_stmts(project, asset, kind, *, no=1, status="draft", policies="both", capacity=None):
    """revision + port_policy INSERT 문 목록(한 트랜잭션용). 반환: (revision_id, statements)."""
    rid = uuid.uuid4()
    if capacity is None:
        capacity = None if kind == "equipment" else UNKNOWN_CAP
    approved = ", approved_at, approved_by" if status in ("approved", "superseded") else ""
    approved_vals = ", now(), :user" if approved else ""
    stmts = [(
        ("INSERT INTO asset_revision (id,project_id,asset_id,asset_kind,revision_no,status,"
        f"storage_capacity{approved}) VALUES (:id,:p,:a,:k,:no,:st,CAST(:cap AS jsonb){approved_vals})"),
        {"id": rid, "p": project, "a": asset, "k": kind, "no": no, "st": status,
         "cap": capacity, "user": uuid.uuid4() if approved else None})]
    return rid, stmts


def policy_stmt(project, asset, rid, port_id, role):
    return (("INSERT INTO port_policy (id,project_id,asset_id,asset_revision_id,port_id,port_role,"
            "buffer_capacity,dispatch_rule,release_rule) VALUES "
            "(:id,:p,:a,:r,:port,:role,CAST(:cap AS jsonb),CAST(:rule AS jsonb),CAST(:rule AS jsonb))"),
            {"id": uuid.uuid4(), "p": project, "a": asset, "r": rid, "port": port_id, "role": role,
             "cap": UNKNOWN_CAP, "rule": RULE})


@pytest.fixture
def eq(db):
    """설비 하나와 (project, asset, {IN/OUT 포트 id})."""
    project = db.project(db.org())
    asset = db.asset(project, "equipment")
    return project, asset, port_ids(db, asset)


def make_equipment_revision(db, eq, **kwargs):
    project, asset, ports = eq
    rid, stmts = revision_stmts(project, asset, "equipment", **kwargs)
    stmts += [policy_stmt(project, asset, rid, ports[r], r) for r in ("IN", "OUT")]
    db.run(*stmts)
    return rid


# --- 생성 불변식 ----------------------------------------------------------------

def test_equipment_revision_requires_in_and_out_policies(db, eq):
    project, _, _ = eq
    make_equipment_revision(db, eq)  # 정상
    for missing in ([], ["IN"], ["OUT"]):
        # 자산마다 draft는 하나뿐이므로 반복마다 새 설비를 쓴다.
        asset = db.asset(project, "equipment")
        ports = port_ids(db, asset)
        rid, stmts = revision_stmts(project, asset, "equipment")
        stmts += [policy_stmt(project, asset, rid, ports[r], r) for r in missing]
        with pytest.raises(DBAPIError) as e:
            db.run(*stmts)
        assert sqlstate(e) == CHECK


def test_storage_capacity_only_for_spaces(db):
    project = db.project(db.org())
    storage = db.asset(project, "storage")
    _, no_cap = revision_stmts(project, storage, "storage", capacity=None)
    # capacity=None이면 helper가 UNKNOWN을 채우므로 명시적으로 NULL을 넣는다.
    no_cap[0][1]["cap"] = None
    with pytest.raises(DBAPIError) as e:
        db.run(*no_cap)
    assert sqlstate(e) == CHECK
    _, ok = revision_stmts(project, storage, "storage")
    db.run(*ok)  # 공간은 정책 행 없이 생성 가능
    equipment = db.asset(project, "equipment")
    _, bad = revision_stmts(project, equipment, "equipment")
    bad[0][1]["cap"] = UNKNOWN_CAP
    with pytest.raises(DBAPIError) as e:
        db.run(*bad)
    assert sqlstate(e) == CHECK


def test_policy_cannot_reference_other_assets_or_non_buffer_ports(db, eq):
    project, asset, ports = eq
    other = db.asset(project, "equipment")
    other_ports = port_ids(db, other)
    space = db.asset(project, "storage")
    space_access = port_ids(db, space)["ACCESS"]
    rid, stmts = revision_stmts(project, asset, "equipment", no=5)
    stmts += [policy_stmt(project, asset, rid, ports["IN"], "IN"),
              policy_stmt(project, asset, rid, other_ports["OUT"], "OUT")]
    with pytest.raises(DBAPIError) as e:
        db.run(*stmts)
    assert sqlstate(e) == FK
    rid, stmts = revision_stmts(project, asset, "equipment", no=6)
    stmts += [policy_stmt(project, asset, rid, ports["IN"], "IN"),
              policy_stmt(project, asset, rid, space_access, "OUT")]
    with pytest.raises(DBAPIError) as e:
        db.run(*stmts)
    assert sqlstate(e) == FK


def test_revision_cannot_reference_asset_of_another_project(db):
    org = db.org()
    p1, p2 = db.project(org), db.project(org)
    asset = db.asset(p1, "storage")
    _, stmts = revision_stmts(p2, asset, "storage")
    with pytest.raises(DBAPIError) as e:
        db.run(*stmts)
    assert sqlstate(e) == FK


# --- 열린/승인 버전 유일성 ---------------------------------------------------------

def test_only_one_open_and_one_approved_revision_per_asset(db):
    project = db.project(db.org())
    asset = db.asset(project, "storage")
    _, first = revision_stmts(project, asset, "storage", no=1)
    db.run(*first)
    _, second = revision_stmts(project, asset, "storage", no=2)
    with pytest.raises(DBAPIError) as e:
        db.run(*second)  # draft가 이미 있음
    assert sqlstate(e) == UNIQUE
    asset2 = db.asset(project, "storage")
    _, a1 = revision_stmts(project, asset2, "storage", no=1, status="approved")
    db.run(*a1)
    _, a2 = revision_stmts(project, asset2, "storage", no=2, status="approved")
    with pytest.raises(DBAPIError) as e:
        db.run(*a2)
    assert sqlstate(e) == UNIQUE
    _, d = revision_stmts(project, asset2, "storage", no=2)  # 승인본이 있어도 새 draft는 가능
    db.run(*d)


# --- 상태 전이 ---------------------------------------------------------------------

@pytest.fixture
def storage_rev(db):
    project = db.project(db.org())
    asset = db.asset(project, "storage")
    rid, stmts = revision_stmts(project, asset, "storage")
    db.run(*stmts)
    return rid


def set_status(db, rid, status, extra=""):
    db.run((f"UPDATE asset_revision SET status = :s{extra} WHERE id = :r",
            {"s": status, "r": rid, "u": uuid.uuid4()}))


def test_legal_transitions(db, storage_rev):
    set_status(db, storage_rev, "in_review")
    set_status(db, storage_rev, "draft")
    set_status(db, storage_rev, "in_review")
    set_status(db, storage_rev, "approved", ", approved_at = now(), approved_by = :u")
    set_status(db, storage_rev, "superseded")


@pytest.mark.parametrize("path,illegal", [
    ([], "approved"),
    ([], "superseded"),
    (["in_review"], "superseded"),
    (["in_review", "approved"], "draft"),
    (["in_review", "approved"], "in_review"),
    (["in_review", "approved", "superseded"], "approved"),
    (["in_review", "approved", "superseded"], "draft"),
])
def test_illegal_transitions_rejected(db, storage_rev, path, illegal):
    for status in path:
        set_status(db, storage_rev, status,
                   ", approved_at = now(), approved_by = :u" if status == "approved" else "")
    with pytest.raises(DBAPIError) as e:
        set_status(db, storage_rev, illegal, ", approved_at = now(), approved_by = :u")
    assert sqlstate(e) in (RESTRICT, CHECK)


def test_approval_requires_approver_and_time(db, storage_rev):
    set_status(db, storage_rev, "in_review")
    with pytest.raises(DBAPIError) as e:
        set_status(db, storage_rev, "approved")
    assert sqlstate(e) == CHECK


# --- 불변성 ------------------------------------------------------------------------

def test_content_is_frozen_outside_draft(db, storage_rev):
    def capacity(mode):
        return ("UPDATE asset_revision SET storage_capacity = CAST(:c AS jsonb) WHERE id = :r",
                {"c": json.dumps({"mode": mode, "value": None, "unit": None,
                                  "status": "confirmed"}), "r": storage_rev})

    db.run(capacity("unlimited"))  # draft는 수정 가능
    set_status(db, storage_rev, "in_review")
    update_cap = capacity("not_allowed")  # 현재 값과 다른 값만 '변경'으로 거부된다
    for stmt in (update_cap, ("UPDATE asset_revision SET notes = 'x' WHERE id = :r",
                              {"r": storage_rev})):
        with pytest.raises(DBAPIError) as e:
            db.run(stmt)
        assert sqlstate(e) == RESTRICT
    set_status(db, storage_rev, "approved", ", approved_at = now(), approved_by = :u")
    with pytest.raises(DBAPIError) as e:
        db.run(update_cap)
    assert sqlstate(e) == RESTRICT
    with pytest.raises(DBAPIError) as e:
        db.run(("DELETE FROM asset_revision WHERE id = :r", {"r": storage_rev}))
    assert sqlstate(e) == RESTRICT


def test_revision_identity_is_immutable(db, storage_rev):
    for sql in ("UPDATE asset_revision SET revision_no = 9 WHERE id = :r",
                "UPDATE asset_revision SET project_id = gen_random_uuid() WHERE id = :r"):
        with pytest.raises(DBAPIError) as e:
            db.run((sql, {"r": storage_rev}))
        assert sqlstate(e) in (RESTRICT, FK)


@pytest.mark.parametrize("status", ["in_review", "approved"])
def test_port_policy_frozen_unless_revision_is_draft(db, eq, status):
    _project, _asset, _ports = eq
    rid = make_equipment_revision(db, eq)
    update = (("UPDATE port_policy SET buffer_capacity = CAST(:c AS jsonb) "
              "WHERE asset_revision_id = :r AND port_role = 'IN'"),
              {"c": json.dumps({"mode": "not_allowed", "value": None, "unit": None,
                                "status": "confirmed"}), "r": rid})
    db.run(update)  # draft에서는 수정 가능
    set_status(db, rid, "in_review")
    if status == "approved":
        set_status(db, rid, "approved", ", approved_at = now(), approved_by = :u")
    with pytest.raises(DBAPIError) as e:
        db.run(update)
    assert sqlstate(e) == RESTRICT
    with pytest.raises(DBAPIError) as e:
        db.run(("DELETE FROM port_policy WHERE asset_revision_id = :r", {"r": rid}))
    assert sqlstate(e) == RESTRICT


def test_draft_revision_can_be_deleted_with_its_policies(db, eq):
    rid = make_equipment_revision(db, eq)
    db.run(("DELETE FROM port_policy WHERE asset_revision_id = :r", {"r": rid}),
           ("DELETE FROM asset_revision WHERE id = :r", {"r": rid}))
    assert db.scalar("select count(*) from asset_revision where id = :r", r=rid) == 0


def test_removing_a_policy_from_draft_fails_at_commit(db, eq):
    rid = make_equipment_revision(db, eq)
    with pytest.raises(DBAPIError) as e:
        db.run(("DELETE FROM port_policy WHERE asset_revision_id = :r AND port_role = 'OUT'",
                {"r": rid}))
    assert sqlstate(e) == CHECK
