"""BE-11: 설비 상태 타임라인 요약(구간별 상태 시간)과 설비 상태 구간(간트) API를 실제 PostgreSQL로 검증한다."""

import itertools

import pytest
from helpers import create_project, equipment_body
from sqlalchemy.orm import sessionmaker
from test_api_run_events import ok_page
from test_api_runs import approved_scenario, isolate, request_run, worker_settings  # noqa: F401
from test_api_scenarios import (  # noqa: F401
    ctx,
    etag,
    new_scenario,
    ok,
    patch,
    product_entry,
    runnable_step,
    uid,
    version_of,
)

from simulation_platform.worker.service import process_one

API = "/api/v1"
FOUR = [{"at_min": "0", "count": 4, "length_m": "1000"}]  # 1,000m 4개, 설비 한 대에서 100/3분씩 차례로


def run_with(client, ctx, db, engine, settings, process_version_id, arrivals, product_id=None):
    scenario = new_scenario(client, ctx)
    draft = version_of(client, ctx, scenario)
    draft = ok(patch(client, ctx, draft, {"products": [product_entry(
        ctx, product_id=product_id or ctx["product"], process_version_id=process_version_id, arrivals=arrivals)]}))
    approved = ok(client.post(f"{ctx['base']}/scenario-versions/{draft['id']}/approve",
                              headers=etag(ctx, "admin", draft["row_version"])))
    run = ok(request_run(client, ctx, approved["id"]), 202)
    isolate(db, ctx["pid"])
    assert process_one(sessionmaker(engine), settings, "w-timeline") == "completed"
    return ok(client.get(f"{ctx['base']}/runs/{run['id']}", headers=ctx["viewer"]))


@pytest.fixture
def run(client, ctx, db, engine, worker_settings):
    return run_with(client, ctx, db, engine, worker_settings, ctx["process"], FOUR)


def timeline(client, ctx, run_id, **params):
    return client.get(f"{ctx['base']}/runs/{run_id}/asset-timeline", params=params, headers=ctx["viewer"])


def states(client, ctx, run_id, asset_id, **params):
    return client.get(f"{ctx['base']}/runs/{run_id}/assets/{asset_id}/states", params=params, headers=ctx["viewer"])


def all_states(client, ctx, run_id, asset_id, **params):
    found, cursor = [], None
    while True:
        body = ok_page(states(client, ctx, run_id, asset_id, **params, **({"cursor": cursor} if cursor else {})))
        found += body["data"]
        cursor = body["page"]["next_cursor"]
        if cursor is None:
            return found


def test_timeline_and_states_need_an_official_result(client, ctx):
    queued = ok(request_run(client, ctx, approved_scenario(client, ctx)["id"]), 202)
    for r in (timeline(client, ctx, queued["id"]), states(client, ctx, queued["id"], ctx["equipment"])):
        assert r.status_code == 409 and r.json()["error"]["code"] == "RUN_RESULT_NOT_AVAILABLE"


def test_the_day_timeline_splits_the_machine_time_into_processing_and_idle(client, ctx, run):
    [machine] = ok_page(timeline(client, ctx, run["id"]))["data"]
    assert machine["asset_id"] == ctx["equipment"] and machine["used"] is True and machine["asset_code"]
    [use] = machine["uses"]
    assert (use["process_version_id"], use["step_key"], use["step_label"]) == (ctx["process"], "work", "가공")
    assert use["product_code"]
    [day] = machine["buckets"]  # 400/3분에 끝나 하루 구간 하나(종료 시각까지로 잘림)
    assert (day["start"]["exact"], day["end"]["exact"]) == ("0", "400/3")
    assert day["processing_min"] == "133.333333" and day["idle_min"] == "0.000000"
    assert (day["setup_min"], day["reserved_min"], day["blocked_min"]) == ("0.000000", "0.000000", "0.000000")
    assert day["utilization"] == "1.000000"
    for window in ("run", "week", "month"):
        [only] = ok_page(timeline(client, ctx, run["id"], window=window))["data"][0]["buckets"]
        assert only["processing_min"] == "133.333333"


def test_the_state_segments_of_a_machine_form_a_gantt_without_zero_length_transitions(client, ctx, run):
    segments = all_states(client, ctx, run["id"], ctx["equipment"], limit=2)  # 2건씩 넘겨도 이어진다
    assert [(s["state"], s["start"]["exact"], s["end"]["exact"]) for s in segments] == [
        ("PROCESSING", "0", "100/3"), ("PROCESSING", "100/3", "200/3"),
        ("PROCESSING", "200/3", "100"), ("PROCESSING", "100", "400/3")]
    assert [s["operation_id"] for s in segments] == ["work#1", "work#2", "work#3", "work#4"]
    assert all(s["duration_min"] == "33.333333" and s["step_key"] == "work" for s in segments)
    assert all(s["process_version_id"] == ctx["process"] and s["product_code"] for s in segments)
    later = all_states(client, ctx, run["id"], ctx["equipment"], from_min="50")
    assert [s["start"]["exact"] for s in later] == ["100/3", "200/3", "100"]  # 50분에 걸친 구간부터
    early = all_states(client, ctx, run["id"], ctx["equipment"], to_min="50")
    assert [s["start"]["exact"] for s in early] == ["0", "100/3"]  # 50분 전에 시작한 구간까지
    assert all_states(client, ctx, run["id"], "00000000-0000-4000-8000-000000000000") == []


def two_candidate_process(client, ctx):
    """후보 설비가 둘인 공정(시험 전용): 원자재가 하나면 코드 순 첫 설비만 쓰인다."""
    second = ok(client.post(f"{ctx['base']}/assets", json=equipment_body(f"EQ-Z{uid()[:5]}"), headers=ctx["admin"]), 201)
    product = ok(client.post(f"{ctx['base']}/products", json={"code": f"P-{uid()[:6]}", "name": "제품"},
                             headers=ctx["admin"]), 201)
    version = ok(client.post(f"{ctx['base']}/products/{product['id']}/process-versions", headers=ctx["editor"]), 201)
    step = runnable_step(ctx["equipment"])
    step["resources"][0]["candidates"].append({"asset_id": second["id"], "eligibility_status": "confirmed"})
    step["resources"][0]["allocation_rule"] = {"mode": "first_available"}  # 후보가 둘이면 선택 규칙이 필요하다
    nodes = [{"id": uid(), "node_key": "src", "kind": "source", "label": "원자재"},
             {"id": uid(), "node_key": "wait", "kind": "buffer", "label": "대기", "asset_id": ctx["storage"]},
             {"id": uid(), "node_key": "work", "kind": "operation", "label": "가공", "step": step},
             {"id": uid(), "node_key": "complete", "kind": "milestone", "label": "완제품"},
             {"id": uid(), "node_key": "sink", "kind": "sink", "label": "끝"}]
    edges = [{"id": uid(), "edge_key": f"{a['node_key']}-{b['node_key']}", "from_node_id": a["id"],
              "to_node_id": b["id"]} for a, b in itertools.pairwise(nodes)]
    graph = ok(client.put(f"{ctx['base']}/process-versions/{version['id']}/graph",
                          json={"nodes": nodes, "edges": edges, "completion_node_id": nodes[3]["id"]},
                          headers=etag(ctx, "editor", version["row_version"])))
    row = graph["row_version"]
    for action, who in (("submit", "editor"), ("approve", "admin")):
        row = ok(client.post(f"{ctx['base']}/process-versions/{version['id']}/{action}", headers=etag(ctx, who, row)))["row_version"]
    return product["id"], version["id"], second["id"]


def test_a_candidate_machine_that_was_never_used_appears_as_idle(client, ctx, db, engine, worker_settings):
    product, version, second = two_candidate_process(client, ctx)
    run = run_with(client, ctx, db, engine, worker_settings, version, [{"at_min": "0", "count": 1, "length_m": "1000"}],
                   product_id=product)
    machines = {m["asset_id"]: m for m in ok_page(timeline(client, ctx, run["id"]))["data"]}
    assert set(machines) == {ctx["equipment"], second}
    # 원자재가 하나라 후보 중 코드 순 첫 설비만 쓰인다(어느 쪽인지는 코드에 달려 있어 가정하지 않는다)
    [unused] = [m for m in machines.values() if not m["used"]]
    assert sum(m["used"] for m in machines.values()) == 1 and unused["uses"][0]["step_key"] == "work"
    [day] = unused["buckets"]
    assert day["processing_min"] == "0.000000" and day["idle_min"] == "33.333333" and day["utilization"] == "0.000000"
    assert all_states(client, ctx, run["id"], unused["asset_id"]) == []  # 쓰이지 않은 설비는 상태 구간이 없다
    only = ok_page(timeline(client, ctx, run["id"], asset_id=unused["asset_id"]))["data"]
    assert [m["asset_id"] for m in only] == [unused["asset_id"]]


def test_bad_queries_and_scope(client, ctx, run, world):
    assert timeline(client, ctx, run["id"], window="year").status_code == 422
    assert states(client, ctx, run["id"], ctx["equipment"], from_min="x").status_code == 422
    assert client.get(f"{ctx['base']}/runs/{run['id']}/asset-timeline", headers=ctx["outsider"]).status_code == 404
    other, _ = create_project(client, world)
    for path in ("asset-timeline", f"assets/{ctx['equipment']}/states"):
        assert client.get(f"{API}/projects/{other}/runs/{run['id']}/{path}", headers=ctx["admin"]).status_code == 404
