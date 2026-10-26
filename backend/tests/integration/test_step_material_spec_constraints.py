"""BE-04c: migration 0006(step_material_spec·간선 spec 연결·완제품 지정)의 제약을 API 없이 DB에서 검증한다."""

import json
import uuid

import pytest
from sqlalchemy.exc import DBAPIError
from test_process_constraints import CHECK, FK, RESTRICT, UNIQUE, World, set_status, sqlstate

QUANTITY = json.dumps({k: {"mode": "unknown", "value": None}
                       for k in ("length_m", "weight_kg", "unit_count", "strand_count")})
EMPTY = json.dumps({})


@pytest.fixture
def w(db):
    return World(db)


def spec(w, vid, node, key="in", direction="input", *, material=None, quantity=QUANTITY,
         basis="unknown", project=None):
    sid = uuid.uuid4()
    w.db.run((("INSERT INTO step_material_spec (id,project_id,process_version_id,step_node_id,spec_key,"
               "direction,material_definition_id,quantity,quantity_basis) VALUES "
               "(:i,:p,:v,:n,:k,:d,:m,CAST(:q AS jsonb),:b)"),
              {"i": sid, "p": project or w.project, "v": vid, "n": node, "k": key, "d": direction,
               "m": material, "q": quantity, "b": basis}))
    return sid


def operation(w, vid):
    node = w.node(vid, kind="operation")
    w.step(vid, node)
    return node


def link(w, vid, a, b, *, source=None, target=None, kind="material"):
    w.db.run((("INSERT INTO flow_edge (id,project_id,process_version_id,edge_key,from_node_id,to_node_id,"
               "edge_kind,movement_rule,source_output_spec_id,target_input_spec_id) VALUES "
               "(:i,:p,:v,:k,:a,:b,:kind,CAST(:m AS jsonb),:s,:t)"),
              {"i": uuid.uuid4(), "p": w.project, "v": vid, "k": f"e-{uuid.uuid4().hex[:6]}", "a": a,
               "b": b, "kind": kind, "m": EMPTY, "s": source, "t": target}))


def material(db, project):
    mid = uuid.uuid4()
    db.run((("INSERT INTO material_definition (id,project_id,code,name,form,default_spec) VALUES "
             "(:i,:p,:c,'m','roll',CAST(:s AS jsonb))"),
            {"i": mid, "p": project, "c": f"M-{mid}", "s": QUANTITY}))
    return mid


# --- step_material_spec ----------------------------------------------------------------------

def test_spec_key_is_unique_per_step_but_reusable_on_another_step(w):
    vid = w.version()
    a, b = operation(w, vid), operation(w, vid)
    spec(w, vid, a, "x", "input")
    with pytest.raises(DBAPIError) as e:
        spec(w, vid, a, "x", "output")  # 입력·출력이 key를 공유한다
    assert sqlstate(e) == UNIQUE
    spec(w, vid, b, "x", "input")


@pytest.mark.parametrize("override", [
    {"direction": "sideways"}, {"basis": "weekly"}, {"key": "  "}, {"quantity": "[]"},
])
def test_spec_checks(w, override):
    vid = w.version()
    node = operation(w, vid)
    with pytest.raises(DBAPIError) as e:
        spec(w, vid, node, **override)
    assert sqlstate(e) == CHECK


def test_spec_needs_a_step_and_a_material_of_the_same_project(w, db):
    vid = w.version()
    buffer = w.node(vid, kind="buffer", asset=w.storage, asset_kind="storage")
    with pytest.raises(DBAPIError) as e:
        spec(w, vid, buffer)  # operation 단계가 아닌 노드
    assert sqlstate(e) == FK
    node = operation(w, vid)
    spec(w, vid, node, "own", material=material(db, w.project))
    other_project = db.project(db.org())
    with pytest.raises(DBAPIError) as e:
        spec(w, vid, node, "foreign", material=material(db, other_project))  # 다른 프로젝트의 재료
    assert sqlstate(e) == FK


def test_spec_is_frozen_unless_the_version_is_draft(w, db):
    vid = w.version()
    node = operation(w, vid)
    sid = spec(w, vid, node)
    set_status(db, vid, "in_review")
    with pytest.raises(DBAPIError) as e:
        spec(w, vid, node, "late")
    assert sqlstate(e) == RESTRICT
    with pytest.raises(DBAPIError) as e:
        db.run(("UPDATE step_material_spec SET state_code = 'x' WHERE id = :i", {"i": sid}))
    assert sqlstate(e) == RESTRICT
    with pytest.raises(DBAPIError) as e:
        db.run(("DELETE FROM step_material_spec WHERE id = :i", {"i": sid}))
    assert sqlstate(e) == RESTRICT


# --- 간선 spec 연결 ---------------------------------------------------------------------------

def test_edge_spec_links_enforce_step_membership_and_direction(w):
    vid = w.version()
    a, b, c = operation(w, vid), operation(w, vid), operation(w, vid)
    out_a = spec(w, vid, a, "out", "output")
    in_a = spec(w, vid, a, "in", "input")
    in_b = spec(w, vid, b, "in", "input")
    out_c = spec(w, vid, c, "out", "output")
    link(w, vid, a, b, source=out_a, target=in_b)  # 정상: from 단계의 output → to 단계의 input
    link(w, vid, a, b)  # 연결은 선택이다
    for kwargs in ({"source": in_a},           # 방향이 다른 spec(input)을 출력으로 연결
                   {"source": out_c},          # 다른 단계의 output
                   {"target": in_a},           # from 단계의 spec을 도착으로 연결
                   {"target": out_a}):         # output을 입력으로 연결
        with pytest.raises(DBAPIError) as e:
            link(w, vid, a, b, **kwargs)
        assert sqlstate(e) == FK, kwargs


def test_precedence_edges_cannot_carry_spec_links(w):
    vid = w.version()
    a, b = operation(w, vid), operation(w, vid)
    out_a = spec(w, vid, a, "out", "output")
    link(w, vid, a, b, kind="precedence")
    with pytest.raises(DBAPIError) as e:
        link(w, vid, a, b, kind="precedence", source=out_a)
    assert sqlstate(e) == CHECK
    link(w, vid, a, b, kind="supply", source=out_a)  # 공급 간선은 연결할 수 있다


def test_a_spec_that_an_edge_uses_cannot_be_deleted(w, db):
    vid = w.version()
    a, b = operation(w, vid), operation(w, vid)
    out_a = spec(w, vid, a, "out", "output")
    link(w, vid, a, b, source=out_a)
    with pytest.raises(DBAPIError) as e:
        db.run(("DELETE FROM step_material_spec WHERE id = :i", {"i": out_a}))
    assert sqlstate(e) in (FK, RESTRICT)


# --- 완제품 지정 -----------------------------------------------------------------------------

def set_completion(db, vid, node):
    db.run(("UPDATE process_version SET completion_node_id = :n WHERE id = :v", {"n": node, "v": vid}))


def test_completion_must_be_a_milestone_of_the_same_version(w, db):
    vid, other = w.version(), w.version(no=2, product=w.insert_product(w.project))
    milestone = w.node(vid, kind="milestone")
    set_completion(db, vid, milestone)
    assert db.scalar("select completion_node_id from process_version where id = :v", v=vid) == milestone
    for node in (w.node(vid, kind="operation"), w.node(vid, kind="sink")):
        with pytest.raises(DBAPIError) as e:
            set_completion(db, vid, node)  # milestone이 아닌 노드
        assert sqlstate(e) == FK
    with pytest.raises(DBAPIError) as e:
        set_completion(db, other, milestone)  # 다른 버전의 노드
    assert sqlstate(e) == FK
    set_completion(db, vid, None)


def test_completion_kind_is_fixed_and_the_node_cannot_be_deleted_while_referenced(w, db):
    vid = w.version()
    milestone = w.node(vid, kind="milestone")
    set_completion(db, vid, milestone)
    with pytest.raises(DBAPIError) as e:
        db.run(("UPDATE process_version SET completion_node_kind = 'sink' WHERE id = :v", {"v": vid}))
    assert sqlstate(e) == CHECK
    with pytest.raises(DBAPIError) as e:
        db.run(("DELETE FROM flow_node WHERE id = :n", {"n": milestone}))
    assert sqlstate(e) in (FK, RESTRICT)  # 완제품 지정을 먼저 풀어야 한다
    set_completion(db, vid, None)
    db.run(("DELETE FROM flow_node WHERE id = :n", {"n": milestone}))


def test_completion_is_frozen_with_the_version(w, db):
    vid = w.version()
    milestone = w.node(vid, kind="milestone")
    set_status(db, vid, "in_review")
    with pytest.raises(DBAPIError) as e:
        set_completion(db, vid, milestone)
    assert sqlstate(e) == RESTRICT
