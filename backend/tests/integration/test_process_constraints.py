"""BE-04a: migration 0004(공정 버전·그래프)의 제약을 API를 거치지 않고 DB에서 검증한다."""

import json
import uuid

import pytest
from sqlalchemy.exc import DBAPIError

UNIQUE, FK, CHECK, RESTRICT = "23505", "23503", "23514", "23001"
EMPTY = json.dumps({})
SPEC = json.dumps({"length_m": {"mode": "unknown", "value": None}})


def sqlstate(excinfo) -> str:
    return excinfo.value.orig.sqlstate


class World:
    """프로젝트 하나와 제품·자산·공정 버전을 SQL로 만드는 헬퍼."""

    def __init__(self, db):
        self.db = db
        self.project = db.project(db.org())
        self.product = self.insert_product(self.project)
        self.equipment = db.asset(self.project, "equipment")
        self.storage = db.asset(self.project, "storage")

    def insert_product(self, project):
        pid = uuid.uuid4()
        self.db.run(("INSERT INTO product (id,project_id,code,name) VALUES (:i,:p,:c,'n')",
                     {"i": pid, "p": project, "c": f"P-{pid}"}))
        return pid

    def version(self, status="draft", no=1, product=None, project=None):
        vid = uuid.uuid4()
        approved = ", approved_at, approved_by" if status in ("approved", "superseded") else ""
        vals = ", now(), gen_random_uuid()" if approved else ""
        self.db.run((
            ("INSERT INTO process_version (id,project_id,product_id,version_no,status,"
            f"raw_unit_spec,finished_unit_spec{approved}) "
            f"VALUES (:i,:p,:pr,:n,:s,CAST(:sp AS jsonb),CAST(:sp AS jsonb){vals})"),
            {"i": vid, "p": project or self.project, "pr": product or self.product, "n": no,
             "s": status, "sp": SPEC}))
        return vid

    def node_stmt(self, version, kind="operation", key=None, asset=None, asset_kind=None,
                  project=None, node_id=None):
        nid = node_id or uuid.uuid4()
        return nid, (("INSERT INTO flow_node (id,project_id,process_version_id,node_key,kind,label,"
                     "asset_id,asset_kind) VALUES (:i,:p,:v,:k,:kind,'l',:a,:ak)"),
                     {"i": nid, "p": project or self.project, "v": version,
                      "k": key or f"n-{uuid.uuid4().hex[:6]}", "kind": kind, "a": asset,
                      "ak": asset_kind})

    def node(self, version, **kwargs):
        nid, stmt = self.node_stmt(version, **kwargs)
        self.db.run(stmt)
        return nid

    def step_stmt(self, version, node):
        return (("INSERT INTO process_step (node_id,project_id,process_version_id,timing_rule,"
                "input_rule,output_rule,handoff_rule,residual_rule) VALUES "
                "(:n,:p,:v,CAST(:r AS jsonb),CAST(:r AS jsonb),CAST(:r AS jsonb),"
                "CAST(:r AS jsonb),CAST(:r AS jsonb))"),
                {"n": node, "p": self.project, "v": version, "r": EMPTY})

    def step(self, version, node):
        self.db.run(self.step_stmt(version, node))

    def requirement_stmt(self, version, step, role="main", kind="equipment", cap="finite",
                         count=1, req_id=None):
        rid = req_id or uuid.uuid4()
        return rid, (("INSERT INTO resource_requirement (id,project_id,process_version_id,"
                     "step_node_id,role_key,resource_kind,selection_mode,required_count,"
                     "capacity_mode,allocation_rule) VALUES (:i,:p,:v,:s,:r,:k,'one_of',:c,:cm,"
                     "CAST(:ar AS jsonb))"),
                     {"i": rid, "p": self.project, "v": version, "s": step, "r": role, "k": kind,
                      "c": count, "cm": cap, "ar": EMPTY})

    def requirement(self, version, step, **kwargs):
        rid, stmt = self.requirement_stmt(version, step, **kwargs)
        self.db.run(stmt)
        return rid

    def candidate_stmt(self, version, requirement, asset, project=None, asset_kind="equipment"):
        return (("INSERT INTO requirement_candidate (id,project_id,process_version_id,"
                "requirement_id,asset_id,asset_kind) VALUES (:i,:p,:v,:r,:a,:k)"),
                {"i": uuid.uuid4(), "p": project or self.project, "v": version, "r": requirement,
                 "a": asset, "k": asset_kind})

    def edge_stmt(self, version, a, b, key=None):
        return (("INSERT INTO flow_edge (id,project_id,process_version_id,edge_key,from_node_id,"
                "to_node_id,edge_kind,movement_rule) VALUES (:i,:p,:v,:k,:a,:b,'material',"
                "CAST(:m AS jsonb))"),
                {"i": uuid.uuid4(), "p": self.project, "v": version,
                 "k": key or f"e-{uuid.uuid4().hex[:6]}", "a": a, "b": b, "m": EMPTY})


@pytest.fixture
def w(db):
    return World(db)


def set_status(db, vid, status, approved=False):
    extra = ", approved_at = now(), approved_by = gen_random_uuid()" if approved else ""
    db.run((f"UPDATE process_version SET status = :s{extra} WHERE id = :v", {"s": status, "v": vid}))


# --- 버전 --------------------------------------------------------------------------

def test_only_one_open_and_one_approved_version_per_product(w):
    w.version("draft", 1)
    with pytest.raises(DBAPIError) as e:
        w.version("draft", 2)
    assert sqlstate(e) == UNIQUE
    other = w.insert_product(w.project)
    w.version("approved", 1, product=other)
    with pytest.raises(DBAPIError) as e:
        w.version("approved", 2, product=other)
    assert sqlstate(e) == UNIQUE
    w.version("draft", 2, product=other)  # 승인본이 있어도 새 draft는 가능


def test_version_cannot_reference_product_of_another_project(w, db):
    other_project = db.project(db.org())
    with pytest.raises(DBAPIError) as e:
        w.version("draft", 1, project=other_project)  # w.product는 다른 프로젝트 제품
    assert sqlstate(e) == FK


def test_legal_status_transitions_and_frozen_content(w, db):
    vid = w.version()
    set_status(db, vid, "in_review")
    set_status(db, vid, "draft")
    set_status(db, vid, "in_review")
    with pytest.raises(DBAPIError) as e:
        db.run(("UPDATE process_version SET notes = 'x' WHERE id = :v", {"v": vid}))
    assert sqlstate(e) == RESTRICT  # 검토 중에는 내용 동결
    set_status(db, vid, "approved", approved=True)
    with pytest.raises(DBAPIError) as e:
        db.run(("UPDATE process_version SET raw_unit_spec = CAST(:s AS jsonb) WHERE id = :v",
                {"s": json.dumps({"changed": 1}), "v": vid}))
    assert sqlstate(e) == RESTRICT
    set_status(db, vid, "superseded")


@pytest.mark.parametrize("path,illegal", [
    ([], "approved"), ([], "superseded"), (["in_review"], "superseded"),
    (["in_review", "approved"], "draft"), (["in_review", "approved"], "in_review"),
])
def test_illegal_status_transitions_rejected(w, db, path, illegal):
    vid = w.version()
    for status in path:
        set_status(db, vid, status, approved=status == "approved")
    with pytest.raises(DBAPIError) as e:
        set_status(db, vid, illegal, approved=True)
    assert sqlstate(e) in (RESTRICT, CHECK)


def test_version_identity_immutable_and_only_draft_deletable(w, db):
    vid = w.version()
    with pytest.raises(DBAPIError) as e:
        db.run(("UPDATE process_version SET version_no = 9 WHERE id = :v", {"v": vid}))
    assert sqlstate(e) == RESTRICT
    set_status(db, vid, "in_review")
    with pytest.raises(DBAPIError) as e:
        db.run(("DELETE FROM process_version WHERE id = :v", {"v": vid}))
    assert sqlstate(e) == RESTRICT


# --- 자식 동결 -------------------------------------------------------------------------

def build_graph(w, vid):
    op = w.node(vid, kind="operation")
    buf = w.node(vid, kind="buffer", asset=w.storage, asset_kind="storage")
    w.step(vid, op)
    req = w.requirement(vid, op)
    w.db.run(w.candidate_stmt(vid, req, w.equipment))
    w.db.run(w.edge_stmt(vid, op, buf))
    return op, buf, req


@pytest.mark.parametrize("target", ["in_review", "approved"])
def test_children_are_frozen_unless_version_is_draft(w, db, target):
    vid = w.version()
    op, buf, req = build_graph(w, vid)
    set_status(db, vid, "in_review")
    if target == "approved":
        set_status(db, vid, "approved", approved=True)
    attempts = [
        w.node_stmt(vid)[1],
        w.step_stmt(vid, op),
        w.requirement_stmt(vid, op, role="extra")[1],
        w.candidate_stmt(vid, req, w.equipment),
        w.edge_stmt(vid, buf, op),
        ("UPDATE flow_node SET label = 'changed' WHERE id = :n", {"n": op}),
        ("DELETE FROM flow_edge WHERE process_version_id = :v", {"v": vid}),
        ("DELETE FROM requirement_candidate WHERE process_version_id = :v", {"v": vid}),
        ("UPDATE process_step SET operation_type = 'x' WHERE node_id = :n", {"n": op}),
    ]
    for stmt in attempts:
        with pytest.raises(DBAPIError) as e:
            db.run(stmt)
        assert sqlstate(e) in (RESTRICT, UNIQUE), stmt[0]  # 동결 또는 중복 키가 먼저 걸림


# --- 노드·단계 -------------------------------------------------------------------------

def test_node_asset_rules(w):
    vid = w.version()
    w.node(vid, kind="buffer", asset=w.storage, asset_kind="storage")  # 정상
    w.node(vid, kind="buffer")  # 위치 미정(asset 없음)도 허용
    with pytest.raises(DBAPIError) as e:
        w.node(vid, kind="operation", asset=w.storage, asset_kind="storage")
    assert sqlstate(e) == CHECK  # operation은 설비/공간을 직접 박지 않는다
    with pytest.raises(DBAPIError) as e:
        w.node(vid, kind="buffer", asset=w.equipment, asset_kind="equipment")
    assert sqlstate(e) == CHECK  # buffer는 저장·도킹 공간만
    with pytest.raises(DBAPIError) as e:
        w.node(vid, kind="buffer", asset=w.equipment, asset_kind="storage")
    assert sqlstate(e) == FK  # 선언한 종류가 실제 자산과 다름
    with pytest.raises(DBAPIError) as e:
        w.node(vid, kind="buffer", asset=w.storage, asset_kind=None)
    assert sqlstate(e) == CHECK  # asset_id와 asset_kind는 함께


def test_node_cannot_reference_asset_of_another_project(w, db):
    other = db.asset(db.project(db.org()), "storage")
    vid = w.version()
    with pytest.raises(DBAPIError) as e:
        w.node(vid, kind="buffer", asset=other, asset_kind="storage")
    assert sqlstate(e) == FK


def test_node_key_unique_per_version_and_step_only_for_operation(w):
    vid, other = w.version(), w.version(no=1, product=w.insert_product(w.project))
    w.node(vid, key="same")
    with pytest.raises(DBAPIError) as e:
        w.node(vid, key="same")
    assert sqlstate(e) == UNIQUE
    w.node(other, key="same")  # 다른 버전은 같은 키 가능
    buf = w.node(vid, kind="buffer")
    with pytest.raises(DBAPIError) as e:
        w.step(vid, buf)
    assert sqlstate(e) == FK  # 단계는 operation 노드에만


def test_node_cannot_be_used_across_versions(w):
    v1, v2 = w.version(), w.version(no=1, product=w.insert_product(w.project))
    op1 = w.node(v1)
    with pytest.raises(DBAPIError) as e:
        w.step(v2, op1)  # v1의 노드를 v2의 단계로 만들 수 없다(복합 FK)
    assert sqlstate(e) == FK


# --- 자원 요구·후보·간선 ----------------------------------------------------------------

def test_requirement_rules(w):
    vid = w.version()
    op = w.node(vid)
    w.step(vid, op)
    w.requirement(vid, op, role="worker-role", kind="worker", cap="unlimited")  # 노동자 무제한
    for kwargs, label in [({"kind": "equipment", "cap": "unlimited", "role": "a"}, "equipment unlimited"),
                          ({"count": 0, "role": "b"}, "zero count"),
                          ({"role": "  "}, "blank role")]:
        with pytest.raises(DBAPIError) as e:
            w.requirement(vid, op, **kwargs)
        assert sqlstate(e) == CHECK, label
    w.requirement(vid, op, role="main")
    with pytest.raises(DBAPIError) as e:
        w.requirement(vid, op, role="main")
    assert sqlstate(e) == UNIQUE


def test_candidate_rules(w, db):
    vid = w.version()
    op = w.node(vid)
    w.step(vid, op)
    req = w.requirement(vid, op)
    db.run(w.candidate_stmt(vid, req, w.equipment))
    with pytest.raises(DBAPIError) as e:
        db.run(w.candidate_stmt(vid, req, w.equipment))
    assert sqlstate(e) == UNIQUE
    with pytest.raises(DBAPIError) as e:
        db.run(w.candidate_stmt(vid, req, w.storage, asset_kind="storage"))
    assert sqlstate(e) == CHECK  # 후보는 설비만
    with pytest.raises(DBAPIError) as e:
        db.run(w.candidate_stmt(vid, req, w.storage))
    assert sqlstate(e) == FK
    foreign = db.asset(db.project(db.org()), "equipment")
    with pytest.raises(DBAPIError) as e:
        db.run(w.candidate_stmt(vid, req, foreign))
    assert sqlstate(e) == FK  # 다른 프로젝트 설비 불가


def test_requirement_cannot_attach_to_step_of_another_version(w):
    v1, v2 = w.version(), w.version(no=1, product=w.insert_product(w.project))
    op1 = w.node(v1)
    w.step(v1, op1)
    with pytest.raises(DBAPIError) as e:
        w.requirement(v2, op1)
    assert sqlstate(e) == FK


def test_edge_rules(w, db):
    v1, v2 = w.version(), w.version(no=1, product=w.insert_product(w.project))
    a, b = w.node(v1), w.node(v1)
    other = w.node(v2)
    db.run(w.edge_stmt(v1, a, b, key="e1"))
    for stmt, code in [(w.edge_stmt(v1, a, a), CHECK),            # 자기 자신 연결 금지
                       (w.edge_stmt(v1, a, b, key="e1"), UNIQUE),  # 버전 안에서 edge_key 유일
                       (w.edge_stmt(v1, a, other), FK)]:           # 다른 버전 노드와 연결 금지
        with pytest.raises(DBAPIError) as e:
            db.run(stmt)
        assert sqlstate(e) == code
