"""BE-12: 두 실행 비교(요약·지표 차이)를 실제 PostgreSQL로 검증한다."""

from decimal import Decimal

import pytest
from helpers import create_project
from test_api_run_events import ok_page
from test_api_run_timeline import run_with
from test_api_runs import approved_scenario, request_run, worker_settings  # noqa: F401
from test_api_scenarios import ctx, etag, new_scenario, ok, patch, version_of  # noqa: F401

API = "/api/v1"
TWO = [{"at_min": "0", "count": 2, "length_m": "1000"}]
FOUR = [{"at_min": "0", "count": 4, "length_m": "1000"}]


@pytest.fixture
def runs(client, ctx, db, engine, worker_settings):
    """같은 공정에 원자재 2개(기준)와 4개(비교)를 넣은 두 실행."""
    base = run_with(client, ctx, db, engine, worker_settings, ctx["process"], TWO)
    other = run_with(client, ctx, db, engine, worker_settings, ctx["process"], FOUR)
    return base, other


def compare(client, ctx, a, b, suffix="", **params):
    return client.get(f"{ctx['base']}/runs/{a}/compare/{b}{suffix}", params=params, headers=ctx["viewer"])


def test_the_summary_shows_the_input_change_and_the_product_results_side_by_side(client, ctx, runs):
    base, other = runs
    summary = ok(compare(client, ctx, base["id"], other["id"]))
    assert (summary["base_run_id"], summary["other_run_id"]) == (base["id"], other["id"])
    assert summary["comparable"] is True and summary["warnings"] == []
    paths = {c["path"]: c for c in summary["input_changes"]}
    code = base["result"]["products"][0]["product_code"]
    assert paths[f"products.{code}.arrivals"]["base"][0]["count"] == 2
    assert paths[f"products.{code}.arrivals"]["other"][0]["count"] == 4
    assert "scenario.scenario_version_id" in paths  # 서로 다른 시나리오 버전에서 실행했다
    [product] = summary["products"]
    assert product["product_id"] == ctx["product"] and product["product_code"] == code
    assert product["base_process_version_id"] == product["other_process_version_id"] == ctx["process"]
    done = next(m for m in product["metrics"] if m["metric_key"] == "completed_items")
    assert (done["base"], done["other"], done["delta"], done["ratio"]) == ("2.000000", "4.000000", "2.000000", "2.000000")
    assert (summary["base_end_time"]["exact"], summary["other_end_time"]["exact"]) == ("200/3", "400/3")
    assert summary["bottlenecks"]["other"][0]["kind"] in ("equipment_busy", "space_full", "queue_pileup")


def test_metric_differences_can_be_filtered_to_what_changed(client, ctx, runs):
    base, other = runs
    rows = ok_page(compare(client, ctx, base["id"], other["id"], "/metrics", changed_only="true", limit=200))["data"]
    keys = {r["metric_key"] for r in rows}
    assert {"completed_items", "processing_time_min"} <= keys
    done = next(r for r in rows if r["metric_key"] == "completed_items")
    assert done["dimensions"] == {"product_id": ctx["product"], "product_code": base["result"]["products"][0]["product_code"]}
    assert done["base_process_version_id"] == done["other_process_version_id"] == ctx["process"]
    assert Decimal(done["delta"]) == 2 and done["window"]["kind"] == "run"
    assert all(r["delta"] is None or Decimal(r["delta"]) != 0 for r in rows)  # 같은 값은 빠졌다
    every = ok_page(compare(client, ctx, base["id"], other["id"], "/metrics", limit=200))
    assert len(every["data"]) > len(rows) or every["page"]["next_cursor"]
    page = ok_page(compare(client, ctx, base["id"], other["id"], "/metrics", limit=5))
    rest = ok_page(compare(client, ctx, base["id"], other["id"], "/metrics", limit=5, cursor=page["page"]["next_cursor"]))
    assert len(page["data"]) == 5 and page["data"] != rest["data"]


def test_a_run_compared_with_an_identical_run_has_no_changes(client, ctx, db, engine, worker_settings):
    first = run_with(client, ctx, db, engine, worker_settings, ctx["process"], TWO)
    again = ok(request_run(client, ctx, first["scenario_version_id"]), 202)  # 같은 시나리오 버전·seed로 다시
    from sqlalchemy.orm import sessionmaker
    from test_api_runs import isolate

    from simulation_platform.worker.service import process_one

    isolate(db, ctx["pid"])
    assert process_one(sessionmaker(engine), worker_settings, "w-again") == "completed"
    summary = ok(compare(client, ctx, first["id"], again["id"]))
    assert summary["input_changes"] == []  # 입력이 같다
    assert all(m["delta"] in (None, "0.000000") for m in summary["products"][0]["metrics"])  # 결정적: 결과도 같다
    assert ok_page(compare(client, ctx, first["id"], again["id"], "/metrics", changed_only="true"))["data"] == []


def test_bad_comparisons_are_rejected(client, ctx, runs, world):
    base, other = runs
    assert compare(client, ctx, base["id"], base["id"]).status_code == 422
    assert compare(client, ctx, base["id"], other["id"], "/metrics", window="day").status_code == 422  # 지표 필수
    day = ok_page(compare(client, ctx, base["id"], other["id"], "/metrics", window="day", metric_key="completed_items"))
    assert day["data"] and day["data"][0]["window"]["kind"] == "day"
    queued = ok(request_run(client, ctx, approved_scenario(client, ctx)["id"]), 202)
    r = compare(client, ctx, base["id"], queued["id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "RUN_RESULT_NOT_AVAILABLE"
    assert compare(client, ctx, base["id"], "00000000-0000-4000-8000-000000000000").status_code == 404
    assert client.get(f"{ctx['base']}/runs/{base['id']}/compare/{other['id']}", headers=ctx["outsider"]).status_code == 404
    project, _ = create_project(client, world)
    assert client.get(f"{API}/projects/{project}/runs/{base['id']}/compare/{other['id']}",
                      headers=ctx["admin"]).status_code == 404
