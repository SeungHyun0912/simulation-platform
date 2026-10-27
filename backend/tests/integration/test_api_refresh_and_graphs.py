"""BE-14·BE-13: 시나리오를 최신 승인 공정·자산 버전으로 갱신, 공정 일괄 조회·자산 사용처를 실제 PostgreSQL로 검증한다."""

import uuid

import pytest
from sqlalchemy.orm import sessionmaker
from test_api_run_events import ok_page
from test_api_runs import approved_scenario, isolate, request_run, worker_settings  # noqa: F401
from test_api_scenarios import _approved_revision, ctx, etag, new_scenario, ok, patch, version_of  # noqa: F401

from simulation_platform.worker.service import process_one

API = "/api/v1"


def new_approved_process_version(client, ctx):
    """현재 승인본을 복제해 새 초안을 만들고 승인한다(승인본은 superseded가 된다)."""
    draft = ok(client.post(f"{ctx['base']}/products/{ctx['product']}/process-versions",
                           json={"base_version_id": ctx["process"]}, headers=ctx["editor"]), 201)
    row = draft["row_version"]
    for action, who in (("submit", "editor"), ("approve", "admin")):
        row = ok(client.post(f"{ctx['base']}/process-versions/{draft['id']}/{action}", headers=etag(ctx, who, row)))["row_version"]
    return draft


def new_draft(client, ctx, scenario_id):
    return ok(client.post(f"{ctx['base']}/scenarios/{scenario_id}/versions", headers=ctx["editor"]), 201)


def refresh(client, ctx, version, body=None, who="editor"):
    return client.post(f"{ctx['base']}/scenario-versions/{version['id']}/refresh", json=body,
                       headers=etag(ctx, who, version["row_version"]))


# --- 시나리오 갱신 ------------------------------------------------------------------------------------

def test_refresh_moves_the_draft_to_the_current_approved_process_and_keeps_arrivals(client, ctx):
    old = approved_scenario(client, ctx)
    v2 = new_approved_process_version(client, ctx)
    draft = new_draft(client, ctx, old["scenario_id"])
    assert draft["products"][0]["process_version_id"] == ctx["process"]  # 복사본은 옛 공정을 가리킨다
    r = refresh(client, ctx, draft)
    out = ok(r)
    [change] = out["process_changes"]
    assert (change["status"], change["from_process_version_id"], change["to_process_version_id"]) == (
        "changed", ctx["process"], v2["id"])
    assert (change["from_version_no"], change["to_version_no"]) == (1, 2) and change["product_code"]
    product = out["version"]["products"][0]
    assert product["process_version_id"] == v2["id"] and product["arrivals"] == draft["products"][0]["arrivals"]
    assert out["asset_changes"] == []  # 같은 자산·같은 승인 버전
    assert r.headers["ETag"] == f'"{out["version"]["row_version"]}"'
    again = ok(refresh(client, ctx, out["version"]))
    assert [c["status"] for c in again["process_changes"]] == ["unchanged"]
    skipped = ok(refresh(client, ctx, again["version"], {"product_ids": [str(uuid.uuid4())]}))
    assert [c["status"] for c in skipped["process_changes"]] == ["not_requested"]


def test_refresh_repins_assets_to_their_current_approved_revision_or_keeps_them(client, ctx):
    old = approved_scenario(client, ctx)
    new_rev = _approved_revision(client, ctx, ctx["storage"],
                                 {"storage_capacity": {"mode": "finite", "value": "5", "unit": "item"}})
    kept = ok(refresh(client, ctx, new_draft(client, ctx, old["scenario_id"]), {"assets": "keep"}))
    assert kept["asset_changes"] == []  # keep: 이미 고정한 자산 버전은 그대로
    latest = ok(refresh(client, ctx, kept["version"]))
    [change] = latest["asset_changes"]
    assert (change["asset_id"], change["change"], change["to_revision_id"]) == (ctx["storage"], "updated", new_rev)
    assert change["from_revision_id"] == ctx["storage_rev"] and change["asset_code"]
    pins = {a["asset_id"]: a["asset_revision_id"] for a in latest["version"]["assets"]}
    assert pins[ctx["storage"]] == new_rev and pins[ctx["equipment"]] == ctx["equipment_rev"]


def test_refresh_is_for_drafts_and_editors_only(client, ctx):
    approved = approved_scenario(client, ctx)
    r = refresh(client, ctx, approved)
    assert r.status_code == 409 and r.json()["error"]["code"] == "VERSION_IMMUTABLE"
    draft = new_draft(client, ctx, approved["scenario_id"])
    assert client.post(f"{ctx['base']}/scenario-versions/{draft['id']}/refresh", headers=ctx["editor"]).status_code == 428
    assert refresh(client, ctx, draft, who="viewer").status_code == 403
    assert refresh(client, ctx, {**draft, "row_version": draft["row_version"] + 5}).status_code == 412
    assert refresh(client, ctx, draft, {"assets": "everything"}).status_code == 422


def test_rerunning_after_a_refresh_shows_the_change_in_the_comparison(client, ctx, db, engine, worker_settings):
    """공정·공간 용량을 고친 뒤 시나리오를 갱신해 다시 실행하고 비교하는 흐름 전체(CR be14 §3)."""
    sessions = sessionmaker(engine)
    first_version = approved_scenario(client, ctx)
    first = ok(request_run(client, ctx, first_version["id"]), 202)
    isolate(db, ctx["pid"])
    assert process_one(sessions, worker_settings, "w-refresh") == "completed"
    v2 = new_approved_process_version(client, ctx)
    roomy = _approved_revision(client, ctx, ctx["storage"],
                               {"storage_capacity": {"mode": "finite", "value": "10", "unit": "item"}})
    draft = ok(refresh(client, ctx, new_draft(client, ctx, first_version["scenario_id"])))["version"]
    approved = ok(client.post(f"{ctx['base']}/scenario-versions/{draft['id']}/approve",
                              headers=etag(ctx, "admin", draft["row_version"])))
    second = ok(request_run(client, ctx, approved["id"]), 202)
    isolate(db, ctx["pid"])
    assert process_one(sessions, worker_settings, "w-refresh") == "completed"
    summary = ok(client.get(f"{ctx['base']}/runs/{first['id']}/compare/{second['id']}", headers=ctx["viewer"]))
    paths = {c["path"]: c for c in summary["input_changes"]}
    code = summary["products"][0]["product_code"]
    assert paths[f"products.{code}.process_version_id"]["other"] == v2["id"]
    assert paths[f"assets.{ctx['storage']}"]["other"]["storage_capacity"]["value"] == "10"
    assert summary["comparable"] is True and roomy


# --- 공정 일괄 조회 --------------------------------------------------------------------------------------

def graphs(client, ctx, **params):
    return client.get(f"{ctx['base']}/process-graphs", params=params, headers=ctx["viewer"])


def test_batch_graphs_return_each_products_approved_process_as_a_summary(client, ctx):
    bare = ok(client.post(f"{ctx['base']}/products", json={"code": "ZZ-NOPROC", "name": "공정 없음"},
                          headers=ctx["admin"]), 201)
    items = {i["product_id"]: i for i in ok_page(graphs(client, ctx))["data"]}
    mine = items[ctx["product"]]
    assert mine["version"]["id"] == ctx["process"] and mine["version"]["status"] == "approved"
    single = client.get(f"{ctx['base']}/process-versions/{ctx['process']}/graph", headers=ctx["viewer"])
    assert mine["etag"] == single.headers["ETag"] and mine["graph"] is None
    summary = mine["summary"]
    assert [n["node_key"] for n in summary["nodes"]] == [n["node_key"] for n in single.json()["data"]["nodes"]]
    work = next(n for n in summary["nodes"] if n["node_key"] == "work")
    assert work["operation_type"] == "pass_through_length" and work["candidate_asset_ids"] == [ctx["equipment"]]
    wait = next(n for n in summary["nodes"] if n["node_key"] == "wait")
    assert wait["asset_id"] == ctx["storage"] and len(summary["edges"]) == 4
    assert items[bare["id"]]["version"] is None and items[bare["id"]]["summary"] is None  # 승인본 없음


def test_batch_graphs_full_mode_latest_basis_version_ids_and_paging(client, ctx):
    draft = ok(client.post(f"{ctx['base']}/products/{ctx['product']}/process-versions",
                           json={"base_version_id": ctx["process"]}, headers=ctx["editor"]), 201)
    latest = ok_page(graphs(client, ctx, basis="latest", product_id=ctx["product"]))["data"]
    assert [i["version"]["id"] for i in latest] == [draft["id"]]  # 가장 최근 버전 = 새 초안
    approved = ok_page(graphs(client, ctx, product_id=ctx["product"], mode="full"))["data"][0]
    assert approved["version"]["id"] == ctx["process"] and approved["graph"]["nodes"] and approved["summary"] is None
    by_ids = ok_page(graphs(client, ctx, version_id=[draft["id"], ctx["process"]]))["data"]
    assert [i["version"]["id"] for i in by_ids] == [draft["id"], ctx["process"]]  # 보낸 순서대로
    missing = graphs(client, ctx, version_id=[str(uuid.uuid4())])
    assert missing.status_code == 404
    assert graphs(client, ctx, version_id=[str(uuid.uuid4()) for _ in range(51)]).status_code == 422
    ok(client.post(f"{ctx['base']}/products", json={"code": "ZZ-2", "name": "둘째"}, headers=ctx["admin"]), 201)
    page = ok_page(graphs(client, ctx, limit=1))
    assert len(page["data"]) == 1 and page["page"]["next_cursor"]
    rest = ok_page(graphs(client, ctx, limit=1, cursor=page["page"]["next_cursor"]))
    assert rest["data"][0]["product_code"] > page["data"][0]["product_code"]
    assert graphs(client, ctx, limit=51).status_code == 422


def test_asset_uses_list_the_products_and_nodes_that_use_an_asset(client, ctx, world):
    [machine] = ok_page(client.get(f"{ctx['base']}/assets/{ctx['equipment']}/uses", headers=ctx["viewer"]))["data"]
    assert (machine["product_id"], machine["node_key"], machine["use"]) == (ctx["product"], "work", "equipment_candidate")
    assert machine["process_version"]["id"] == ctx["process"] and machine["role_key"] and machine["node_label"] == "가공"
    [space] = ok_page(client.get(f"{ctx['base']}/assets/{ctx['storage']}/uses", headers=ctx["viewer"]))["data"]
    assert (space["node_key"], space["use"], space["role_key"]) == ("wait", "space", None)
    assert client.get(f"{ctx['base']}/assets/{uuid.uuid4()}/uses", headers=ctx["viewer"]).status_code == 404
    assert client.get(f"{ctx['base']}/assets/{ctx['equipment']}/uses", headers=ctx["outsider"]).status_code == 404


@pytest.mark.parametrize("path", ["process-graphs", "assets/{asset}/uses"])
def test_other_projects_cannot_read_graphs_or_uses(client, ctx, world, path):
    from helpers import create_project

    other, _ = create_project(client, world)
    r = client.get(f"{API}/projects/{other}/{path.format(asset=ctx['equipment'])}", headers=ctx["admin"])
    assert r.status_code == 404 or ok_page(r)["data"] == []  # 다른 프로젝트의 자산·공정은 보이지 않는다
