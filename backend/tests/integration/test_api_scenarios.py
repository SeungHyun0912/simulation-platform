"""BE-05a: 시나리오 버전·실행 사전검증 API를 실제 PostgreSQL로 검증한다(CR-backend-20261026-be07, DEC-007)."""

import itertools
import uuid

import pytest
from helpers import create_project, equipment_body, headers, project_with_members, space_body
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

API = "/api/v1"
RESTRICT, FK = "23001", "23503"


def uid():
    return str(uuid.uuid4())


def known(value):
    return {"mode": "known", "value": value}


def etag(ctx, who, version):
    return {**ctx[who], "If-Match": f'"{version}"'}


def ok(response, status=200):
    assert response.status_code == status, response.text
    return response.json()["data"]


@pytest.fixture
def ctx(db, client, world):
    pid = project_with_members(db, client, world)
    users = world["users"]
    c = {"pid": pid, "base": f"{API}/projects/{pid}", "admin": headers(users["admin"]),
         "editor": headers(users["editor"]), "viewer": headers(users["viewer"]),
         "outsider": headers(users["outsider"])}
    c["equipment"] = _asset(client, c, equipment_body(f"EQ-{uid()[:6]}"))
    c["storage"] = _asset(client, c, space_body(f"ST-{uid()[:6]}"))
    c["equipment_rev"] = _approved_revision(client, c, c["equipment"])
    c["storage_rev"] = _approved_revision(client, c, c["storage"],
                                          {"storage_capacity": {"mode": "finite", "value": "2", "unit": "item"}})
    c["product"], c["process"] = _approved_process(client, c)
    return c


def _asset(client, c, body):
    return ok(client.post(f"{c['base']}/assets", json=body, headers=c["admin"]), 201)["id"]


def _approved_revision(client, c, asset_id, patch=None):
    rev = ok(client.post(f"{c['base']}/assets/{asset_id}/revisions", headers=c["editor"]), 201)
    if patch:
        rev = ok(client.patch(f"{c['base']}/asset-revisions/{rev['id']}", json=patch,
                              headers=etag(c, "editor", rev["row_version"])))
    for step, who in (("submit", "editor"), ("approve", "admin")):
        rev = ok(client.post(f"{c['base']}/asset-revisions/{rev['id']}/{step}",
                             headers=etag(c, who, rev["row_version"])))
    return rev["id"]


def runnable_step(equipment_id):
    """실행에 필요한 값이 모두 확정된 통과 단계(시험 전용 입력)."""
    return {
        "operation_type": "pass_through_length", "handler_version": "1",
        "timing_rule": {
            "processing": {"kind": "output_speed", "speed_m_per_min": known("30"), "basis": "per_stream",
                           "output_schedule": "sequential_units", "parallel_streams": known(1)},
            "setup": {"duration_min": {"mode": "not_applicable"}, "trigger": "not_applicable"},
            "precondition_delay": {"duration_min": {"mode": "not_applicable"}, "trigger": "not_applicable",
                                   "occupancy": "unknown"}},
        "input_rule": {"acquire_scope": "per_operation", "consume_policy": "consume"},
        "output_rule": {"mode": "pass_through", "quantity_basis": "per_input_unit", "accounting_mode": "physical"},
        "handoff_rule": {"mode": "per_output_unit"},
        "resources": [{"role_key": "main", "candidates": [
            {"asset_id": equipment_id, "eligibility_status": "confirmed"}]}]}


def _approved_process(client, c, product_id=None, storage=None):
    if product_id is None:
        product_id = ok(client.post(f"{c['base']}/products", json={"code": f"P-{uid()[:6]}", "name": "제품"},
                                    headers=c["admin"]), 201)["id"]
    version = ok(client.post(f"{c['base']}/products/{product_id}/process-versions", headers=c["editor"]), 201)
    nodes = [{"id": uid(), "node_key": "src", "kind": "source", "label": "원자재"},
             {"id": uid(), "node_key": "wait", "kind": "buffer", "label": "대기",
              "asset_id": storage or c["storage"]},
             {"id": uid(), "node_key": "work", "kind": "operation", "label": "가공",
              "step": runnable_step(c["equipment"])},
             {"id": uid(), "node_key": "complete", "kind": "milestone", "label": "완제품"},
             {"id": uid(), "node_key": "sink", "kind": "sink", "label": "끝"}]
    edges = [{"id": uid(), "edge_key": f"{a['node_key']}-{b['node_key']}", "from_node_id": a["id"],
              "to_node_id": b["id"]} for a, b in itertools.pairwise(nodes)]
    graph = ok(client.put(f"{c['base']}/process-versions/{version['id']}/graph",
                          json={"nodes": nodes, "edges": edges, "completion_node_id": nodes[3]["id"]},
                          headers=etag(c, "editor", version["row_version"])))
    row = graph["row_version"]
    for step, who in (("submit", "editor"), ("approve", "admin")):
        row = ok(client.post(f"{c['base']}/process-versions/{version['id']}/{step}",
                             headers=etag(c, who, row)))["row_version"]
    return product_id, version["id"]


def new_scenario(client, c, code=None):
    return ok(client.post(f"{c['base']}/scenarios", json={"code": code or f"S-{uid()[:6]}", "name": "시나리오"},
                          headers=c["editor"]), 201)


def version_of(client, c, scenario):
    return ok(client.get(f"{c['base']}/scenario-versions/{scenario['latest_version']['id']}", headers=c["viewer"]))


def patch(client, c, version, body, who="editor"):
    return client.patch(f"{c['base']}/scenario-versions/{version['id']}", json=body,
                        headers=etag(c, who, version["row_version"]))


def product_entry(c, **extra):
    return {"product_id": c["product"], "process_version_id": c["process"],
            "arrivals": [{"at_min": "0", "count": 2, "length_m": "1000"}], **extra}


def precheck(client, c, version):
    return ok(client.post(f"{c['base']}/scenario-versions/{version['id']}/validate", headers=c["viewer"]))


# --- 생성·조회 ---------------------------------------------------------------------------------

def test_create_scenario_with_an_empty_first_draft(client, ctx):
    scenario = new_scenario(client, ctx)
    assert scenario["latest_version"]["version_no"] == 1 and scenario["latest_version"]["status"] == "draft"
    version = version_of(client, ctx, scenario)
    assert version["products"] == [] and version["assets"] == [] and version["stopping_rule"] == {"mode": "drain"}
    listed = ok(client.get(f"{ctx['base']}/scenarios", headers=ctx["viewer"]))
    assert [s["id"] for s in listed] == [scenario["id"]]
    duplicate = client.post(f"{ctx['base']}/scenarios", json={"code": scenario["code"], "name": "x"},
                            headers=ctx["editor"])
    assert duplicate.status_code == 409 and duplicate.json()["error"]["code"] == "SCENARIO_CODE_CONFLICT"


def test_empty_draft_is_saved_but_not_runnable(client, ctx):
    result = precheck(client, ctx, version_of(client, ctx, new_scenario(client, ctx)))
    assert result["runnable"] is False
    assert [i["rule_id"] for i in result["issues"]] == ["SCN-PROD-001"]


# --- 내용 저장과 자산 버전 자동 고정 --------------------------------------------------------------------

def test_products_pin_the_current_approved_revisions_of_the_assets_they_use(client, ctx):
    version = version_of(client, ctx, new_scenario(client, ctx))
    saved = ok(patch(client, ctx, version, {"products": [product_entry(ctx)]}))
    assert {(a["asset_id"], a["asset_revision_id"]) for a in saved["assets"]} == {
        (ctx["equipment"], ctx["equipment_rev"]), (ctx["storage"], ctx["storage_rev"])}
    assert saved["products"][0]["arrivals"] == [
        {"at_min": "0", "count": 2, "length_m": "1000", "weight_kg": None, "lot": None}]
    assert saved["row_version"] == version["row_version"] + 1


def test_a_runnable_scenario_reports_the_engine_result_and_can_be_approved(client, ctx):
    version = version_of(client, ctx, new_scenario(client, ctx))
    version = ok(patch(client, ctx, version, {"products": [product_entry(ctx)],
                                              "stopping_rule": {"mode": "fixed_horizon", "horizon_min": "480"}}))
    result = precheck(client, ctx, version)
    assert result["runnable"] is True, result
    assert result["error_count"] == 0 and result["products"][0]["compiled"] is True
    assert result["products"][0]["assumptions_used"] == []  # 공간 용량은 고정한 자산 버전에서 왔다
    editor = client.post(f"{ctx['base']}/scenario-versions/{version['id']}/approve",
                         headers=etag(ctx, "editor", version["row_version"]))
    assert editor.status_code == 403
    approved = ok(client.post(f"{ctx['base']}/scenario-versions/{version['id']}/approve",
                              headers=etag(ctx, "admin", version["row_version"])))
    assert approved["status"] == "approved" and approved["approved_by"] is not None
    frozen = patch(client, ctx, approved, {"notes": "고침"})
    assert frozen.status_code == 409 and frozen.json()["error"]["code"] == "VERSION_IMMUTABLE"


def test_unknown_capacity_needs_an_explicit_assumption_with_a_reason(client, ctx):
    version = version_of(client, ctx, new_scenario(client, ctx))
    version = ok(patch(client, ctx, version, {"products": [product_entry(ctx)], "assets": []}))  # 고정 안 함
    result = precheck(client, ctx, version)
    assert result["runnable"] is False
    assert {i["rule_id"] for i in result["issues"]} == {"SCN-ASSET-001"}  # 경고
    assert {i["rule_id"] for i in result["products"][0]["compile_issues"]} == {"BUFFER_POLICY_UNKNOWN"}
    refilled = ok(patch(client, ctx, version, {"products": [product_entry(ctx)]}))
    assert len(refilled["assets"]) == 2  # products만 보내면 고정하지 않은 자산을 현재 승인 버전으로 채운다
    assumed = ok(patch(client, ctx, refilled, {
        "products": [product_entry(ctx, assumptions={"unbounded_buffers": True})], "assets": []}))
    assert assumed["assets"] == []  # assets를 함께 보내면 그대로(빈 목록 = 고정 안 함)
    no_reason = precheck(client, ctx, assumed)
    assert "SCN-ASM-001" in {i["rule_id"] for i in no_reason["issues"]}
    reasoned = ok(patch(client, ctx, assumed, {"assumption_reason": "현장 확인 전 임시 가정"}))
    result = precheck(client, ctx, reasoned)
    assert result["runnable"] is True, result
    assert [a["code"] for a in result["products"][0]["assumptions_used"]] == ["UNBOUNDED_BUFFERS"]


def test_rejected_approval_lists_the_reasons(client, ctx):
    version = version_of(client, ctx, new_scenario(client, ctx))
    r = client.post(f"{ctx['base']}/scenario-versions/{version['id']}/approve",
                    headers=etag(ctx, "admin", version["row_version"]))
    assert r.status_code == 422 and r.json()["error"]["code"] == "SCENARIO_NOT_RUNNABLE"
    assert [d["rule_id"] for d in r.json()["error"]["details"]] == ["SCN-PROD-001"]


# --- 참조 검사 --------------------------------------------------------------------------------------

def test_only_frozen_process_versions_of_the_same_product_can_be_used(client, ctx):
    version = version_of(client, ctx, new_scenario(client, ctx))
    draft = ok(client.post(f"{ctx['base']}/products/{ctx['product']}/process-versions", headers=ctx["editor"]), 201)
    r = patch(client, ctx, version, {"products": [product_entry(ctx, process_version_id=draft["id"])]})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["rule_id"] == "SCN-REF-002"
    other_product, _ = _approved_process(client, ctx)
    r = patch(client, ctx, version, {"products": [product_entry(ctx, product_id=other_product)]})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["rule_id"] == "SCN-REF-001"
    r = patch(client, ctx, version, {"assets": [{"asset_id": ctx["equipment"],
                                                 "asset_revision_id": ctx["storage_rev"]}]})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["rule_id"] == "SCN-REF-003"
    stored = version_of(client, ctx, {"latest_version": {"id": version["id"]}})
    assert stored["row_version"] == version["row_version"] and stored["products"] == []  # 아무것도 저장 안 됨


def test_unknown_fields_bad_numbers_and_duplicates_are_rejected(client, ctx):
    version = version_of(client, ctx, new_scenario(client, ctx))
    bad = [
        {"products": [product_entry(ctx, arrivals=[{"count": 1, "length_m": "0"}])]},
        {"products": [product_entry(ctx, arrivals=[{"count": 1, "length_m": 1000}])]},
        {"products": [product_entry(ctx), product_entry(ctx)]},
        {"stopping_rule": {"mode": "fixed_horizon", "horizon_min": "0"}},
        {"products": [product_entry(ctx, assumptions={"guess": True})]},
        {"products": None},
    ]
    for body in bad:
        assert patch(client, ctx, version, body).status_code == 422, body


# --- 권한·격리·동시성 -----------------------------------------------------------------------------

def test_permissions_and_project_scope(client, ctx, db, world):
    scenario = new_scenario(client, ctx)
    version = version_of(client, ctx, scenario)
    assert patch(client, ctx, version, {"notes": "x"}, who="viewer").status_code == 403
    assert client.get(f"{ctx['base']}/scenarios/{scenario['id']}", headers=ctx["outsider"]).status_code == 404
    other, _ = create_project(client, world)
    cross = client.get(f"{API}/projects/{other}/scenario-versions/{version['id']}", headers=ctx["admin"])
    assert cross.status_code == 404
    stale = client.patch(f"{ctx['base']}/scenario-versions/{version['id']}", json={"notes": "x"},
                         headers=etag(ctx, "editor", version["row_version"] + 5))
    assert stale.status_code == 412
    missing = client.patch(f"{ctx['base']}/scenario-versions/{version['id']}", json={"notes": "x"},
                           headers=ctx["editor"])
    assert missing.status_code == 428


def test_new_draft_copies_the_latest_approved_version(client, ctx):
    scenario = new_scenario(client, ctx)
    version = version_of(client, ctx, scenario)
    second = client.post(f"{ctx['base']}/scenarios/{scenario['id']}/versions", headers=ctx["editor"])
    assert second.status_code == 409 and second.json()["error"]["code"] == "SCENARIO_DRAFT_EXISTS"
    version = ok(patch(client, ctx, version, {"products": [product_entry(ctx)], "notes": "기준"}))
    ok(client.post(f"{ctx['base']}/scenario-versions/{version['id']}/approve",
                   headers=etag(ctx, "admin", version["row_version"])))
    copy = ok(client.post(f"{ctx['base']}/scenarios/{scenario['id']}/versions", headers=ctx["editor"]), 201)
    assert copy["version_no"] == 2 and copy["base_version_id"] == version["id"] and copy["status"] == "draft"
    assert copy["products"] == version["products"] and copy["assets"] == version["assets"]
    assert copy["notes"] == "기준"
    versions = ok(client.get(f"{ctx['base']}/scenarios/{scenario['id']}/versions", headers=ctx["viewer"]))
    assert [v["version_no"] for v in versions] == [2, 1]


# --- DB가 강제하는 불변·참조 ---------------------------------------------------------------------------

def test_database_freezes_approved_versions_and_their_children(client, ctx, engine):
    version = version_of(client, ctx, new_scenario(client, ctx))
    version = ok(patch(client, ctx, version, {"products": [product_entry(ctx)]}))
    ok(client.post(f"{ctx['base']}/scenario-versions/{version['id']}/approve",
                   headers=etag(ctx, "admin", version["row_version"])))
    for sql in ("UPDATE scenario_product SET priority = 9 WHERE scenario_version_id = :v",
                "DELETE FROM scenario_asset WHERE scenario_version_id = :v",
                "UPDATE scenario_version SET notes = 'x' WHERE id = :v",
                "UPDATE scenario_version SET status = 'draft' WHERE id = :v",
                "DELETE FROM scenario_version WHERE id = :v"):
        with pytest.raises(DBAPIError) as e, engine.begin() as conn:
            conn.execute(text(sql), {"v": version["id"]})
        assert e.value.orig.sqlstate == RESTRICT, sql


def test_database_rejects_a_process_version_of_another_product(client, ctx, engine):
    version = version_of(client, ctx, new_scenario(client, ctx))
    other_product, _ = _approved_process(client, ctx)
    with pytest.raises(DBAPIError) as e, engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO scenario_product (id, project_id, scenario_version_id, product_id, process_version_id,"
            " position, arrivals, assumptions) VALUES (:i, :p, :v, :prod, :pv, 0, '[]', '{}')"),
            {"i": uid(), "p": str(ctx["pid"]), "v": version["id"], "prod": other_product, "pv": ctx["process"]})
    assert e.value.orig.sqlstate == FK


# --- 계약 0.8.0: 도착은 길이 또는 무게 ---------------------------------------------------------------------

def test_arrivals_may_have_weight_instead_of_length_for_raw_material_without_length(client, ctx):
    version = version_of(client, ctx, new_scenario(client, ctx))
    weight_only = {"at_min": "0", "count": 24, "weight_kg": "3300"}
    saved = ok(patch(client, ctx, version, {"products": [product_entry(ctx, arrivals=[weight_only])]}))
    assert saved["products"][0]["arrivals"] == [
        {"at_min": "0", "count": 24, "length_m": None, "weight_kg": "3300", "lot": None}]  # 길이를 0으로 채우지 않는다
    both = {"at_min": "10", "count": 1, "length_m": "2000", "weight_kg": "2000"}  # 둘 다 있어도 된다(서로 환산하지 않음)
    again = ok(patch(client, ctx, saved, {"products": [product_entry(ctx, arrivals=[weight_only, both])]}))
    assert [a["weight_kg"] for a in again["products"][0]["arrivals"]] == ["3300", "2000"]


def test_an_arrival_with_neither_length_nor_weight_or_a_zero_amount_is_rejected(client, ctx):
    version = version_of(client, ctx, new_scenario(client, ctx))
    for arrival in ({"count": 1}, {"count": 1, "weight_kg": "0"}, {"count": 1, "length_m": None, "weight_kg": None},
                    {"count": 1, "weight_kg": 3300}):  # 숫자(JSON number)는 decimal 문자열이 아니다
        r = patch(client, ctx, version, {"products": [product_entry(ctx, arrivals=[arrival])]})
        assert r.status_code == 422, arrival
