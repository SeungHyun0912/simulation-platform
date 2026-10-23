"""BE-03: migration 0003(product, material_definition)의 제약을 API를 거치지 않고 DB에서 검증한다."""

import json
import uuid

import pytest
from sqlalchemy.exc import DBAPIError

UNIQUE, FK, CHECK, NOT_NULL = "23505", "23503", "23514", "23502"
SPEC = json.dumps({"length_m": {"mode": "unknown", "value": None}})


def sqlstate(excinfo) -> str:
    return excinfo.value.orig.sqlstate


def product(project, code="P-1", name="n"):
    return ("INSERT INTO product (id,project_id,code,name) VALUES (:i,:p,:c,:n)",
            {"i": uuid.uuid4(), "p": project, "c": code, "n": name})


def material(project, code="M-1", name="n", form="롤", spec=SPEC):
    return (("INSERT INTO material_definition (id,project_id,code,name,form,default_spec) "
            "VALUES (:i,:p,:c,:n,:f,CAST(:s AS jsonb))"),
            {"i": uuid.uuid4(), "p": project, "c": code, "n": name, "f": form, "s": spec})


def test_same_code_allowed_in_two_projects_but_not_twice_in_one(db):
    org = db.org()
    p1, p2 = db.project(org), db.project(org)
    for make in (product, material):
        db.run(make(p1, "X"))
        db.run(make(p2, "X"))
        with pytest.raises(DBAPIError) as e:
            db.run(make(p1, "X"))
        assert sqlstate(e) == UNIQUE


def test_product_and_material_codes_do_not_collide(db):
    project = db.project(db.org())
    db.run(product(project, "SAME"), material(project, "SAME"))


@pytest.mark.parametrize("make", [product, material])
def test_blank_code_and_name_rejected(db, make):
    project = db.project(db.org())
    for kwargs in ({"code": "  "}, {"name": ""}):
        with pytest.raises(DBAPIError) as e:
            db.run(make(project, **kwargs))
        assert sqlstate(e) == CHECK


def test_material_form_must_not_be_blank_and_spec_must_exist(db):
    project = db.project(db.org())
    with pytest.raises(DBAPIError) as e:
        db.run(material(project, "F", form="   "))
    assert sqlstate(e) == CHECK
    with pytest.raises(DBAPIError) as e:
        db.run((("INSERT INTO material_definition (id,project_id,code,name,form) "
                "VALUES (:i,:p,'NS','n','롤')"), {"i": uuid.uuid4(), "p": project}))
    assert sqlstate(e) == NOT_NULL  # default_spec을 비워 두고 저장할 수 없다(미정은 unknown 객체)


@pytest.mark.parametrize("make", [product, material])
def test_project_must_exist(db, make):
    with pytest.raises(DBAPIError) as e:
        db.run(make(uuid.uuid4()))
    assert sqlstate(e) == FK


def test_project_with_catalog_rows_cannot_be_deleted(db):
    project = db.project(db.org())
    db.run(product(project), material(project))
    with pytest.raises(DBAPIError) as e:
        db.run(("DELETE FROM project WHERE id = :p", {"p": project}))
    assert sqlstate(e) in (FK, "23001")  # 참조된 기준정보는 hard delete 금지(ERD §11)
