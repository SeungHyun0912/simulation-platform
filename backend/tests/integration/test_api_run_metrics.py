"""BE-06c: 지표의 저장과 조회 API, 지표 정의 목록을 실제 PostgreSQL로 검증한다."""

from fractions import Fraction

import pytest
from helpers import create_project
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import sessionmaker
from test_api_run_events import finished_run, ok_page
from test_api_runs import approved_scenario, request_run, worker_settings  # noqa: F401
from test_api_scenarios import ctx, etag, new_scenario, ok, patch, version_of  # noqa: F401

from simulation_platform.simulation.metrics import DEFINITIONS
from simulation_platform.worker import queue

API = "/api/v1"


def metrics_of(client, ctx, run_id, **params):
    return client.get(f"{ctx['base']}/runs/{run_id}/metrics", params=params, headers=ctx["viewer"])


def all_metrics(client, ctx, run_id, **params):
    found, cursor = [], None
    while True:
        body = ok_page(metrics_of(client, ctx, run_id, limit=40, **({"cursor": cursor} if cursor else {}), **params))
        found.extend(body["data"])
        cursor = body["page"]["next_cursor"]
        if cursor is None:
            return found


def by_key(rows, key):
    found = [r for r in rows if r["metric_key"] == key]
    assert len(found) == 1, (key, len(found))
    return found[0]


@pytest.fixture
def run(client, ctx, db, engine, worker_settings):
    return finished_run(client, ctx, db, engine, worker_settings)


# --- 정의 ---------------------------------------------------------------------------------------------

def test_metric_definitions_list_every_metric_with_unit_dimension_and_description(client, ctx):
    rows = ok(client.get(f"{API}/metric-definitions", headers=ctx["viewer"]))
    assert {r["metric_key"] for r in rows} == set(DEFINITIONS)
    wip = next(r for r in rows if r["metric_key"] == "wip_items")
    assert wip["dimension"] == "process_version_id" and wip["unit"] == "count" and wip["definition_version"] == "1"
    assert "설비 안" in wip["description"]  # 설비 안에서 처리 중인 재료를 재공품에 포함한다
    assert next(r for r in rows if r["metric_key"] == "utilization")["unit"] == "ratio"
    assert client.get(f"{API}/metric-definitions").status_code in (401, 403)


# --- 조회 ---------------------------------------------------------------------------------------------

def test_metrics_need_an_official_result(client, ctx):
    queued = ok(request_run(client, ctx, approved_scenario(client, ctx)["id"]), 202)
    r = metrics_of(client, ctx, queued["id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "RUN_RESULT_NOT_AVAILABLE"


def test_run_window_metrics_are_stored_and_match_the_result_summary(client, ctx, run):
    rows = all_metrics(client, ctx, run["id"])  # window 기본값 = run
    assert {r["window"]["kind"] for r in rows} == {"run"}
    assert {r["quality_status"] for r in rows} == {"complete"} and {r["definition_version"] for r in rows} == {"1"}
    done = by_key(rows, "completed_items")
    assert done["value"] == "2.000000" and done["unit"] == "count"
    assert done["dimensions"] == {"process_version_id": ctx["process"]}
    assert done["window"] == {"kind": "run", "start": {"min": "0.000000", "exact": "0"},
                              "end": {"min": "66.666667", "exact": "200/3"}}
    product = run["result"]["products"][0]
    assert Fraction(done["value"]) == product["completed_items"]  # 요약과 지표가 같은 값
    assert Fraction(by_key(rows, "completed_length_m")["value"]) == Fraction(product["completed_length_m"])
    assert by_key(rows, "lead_time_avg_min")["value"] == "50.000000"
    assert by_key(rows, "throughput_items_per_day")["value"] == "43.200000"
    assert by_key(rows, "utilization")["value"] == "1.000000"
    assert by_key(rows, "arrived_weight_kg")["value"] is None  # 해당 없음은 null, 0이 아니다
    assert by_key(rows, "wip_items")["value"] == "0.000000"


def test_metrics_can_be_filtered_by_key_dimension_and_paged(client, ctx, run):
    only = ok_page(metrics_of(client, ctx, run["id"], metric_key="completed_items"))["data"]
    assert [r["metric_key"] for r in only] == ["completed_items"]
    asset_rows = all_metrics(client, ctx, run["id"], asset_key=next(
        r["dimensions"]["asset_key"] for r in all_metrics(client, ctx, run["id"], metric_key="utilization")))
    assert {r["metric_key"] for r in asset_rows} == {"processing_time_min", "setup_time_min", "reserved_time_min",
                                                     "blocked_time_min", "utilization"}
    nodes = all_metrics(client, ctx, run["id"], node_key="wait")  # 시험 공정의 대기 공간 노드
    assert {r["metric_key"] for r in nodes} == {"buffer_wait_avg_min", "buffer_wait_max_min",
                                                "buffer_occupancy_avg_items"}
    page = ok_page(metrics_of(client, ctx, run["id"], limit=5))
    assert len(page["data"]) == 5 and page["page"]["next_cursor"]
    rest = ok_page(metrics_of(client, ctx, run["id"], limit=5, cursor=page["page"]["next_cursor"]))
    assert not {r["metric_key"] + str(r["dimensions"]) for r in page["data"]} & \
        {r["metric_key"] + str(r["dimensions"]) for r in rest["data"]}  # 페이지가 겹치지 않는다


def test_bad_metric_queries_are_rejected(client, ctx, run):
    both = metrics_of(client, ctx, run["id"], asset_key="a", node_key="b")
    assert both.status_code == 422  # 차원 필터는 하나만
    assert metrics_of(client, ctx, run["id"], window="year").status_code == 422
    cursor = ok_page(metrics_of(client, ctx, run["id"], limit=3))["page"]["next_cursor"]
    assert metrics_of(client, ctx, run["id"], cursor=cursor, metric_key="utilization").status_code == 422
    assert ok_page(metrics_of(client, ctx, run["id"], metric_key="no_such_metric"))["data"] == []


def test_day_week_and_month_windows_break_a_long_run_down(client, ctx, db, engine, worker_settings):
    # 입고가 4일째(5,760분)이고 처리에 200/3분이 더 걸려 5일째 초에 끝난다 → 일 5개, 주 1개, 월 1개
    run = finished_run(client, ctx, db, engine, worker_settings, arrivals=[
        {"at_min": "5760", "count": 2, "length_m": "1000"}])
    days = all_metrics(client, ctx, run["id"], window="day", metric_key="completed_items")
    assert [d["window"]["start"]["exact"] for d in days] == ["0", "1440", "2880", "4320", "5760"]
    assert [d["value"] for d in days] == ["0.000000"] * 4 + ["2.000000"]  # 관측했지만 완료가 없던 날은 0
    assert days[-1]["window"]["end"]["exact"] == "17480/3"  # 마지막 구간은 종료 시각까지로 잘린다
    for kind in ("week", "month"):
        window = all_metrics(client, ctx, run["id"], window=kind, metric_key="completed_items")
        assert len(window) == 1 and window[0]["value"] == "2.000000"
    lead = all_metrics(client, ctx, run["id"], window="day", metric_key="lead_time_avg_min")
    assert [d["value"] for d in lead] == [None] * 4 + ["50.000000"]  # 완료가 없는 날의 평균은 null
    wip = all_metrics(client, ctx, run["id"], window="day", metric_key="wip_items")
    assert [d["value"] for d in wip] == ["0.000000"] * 5


def test_permissions_and_project_scope_apply_to_metrics(client, ctx, run, world):
    assert metrics_of(client, ctx, run["id"]).status_code == 200
    assert client.get(f"{ctx['base']}/runs/{run['id']}/metrics", headers=ctx["outsider"]).status_code == 404
    other, _ = create_project(client, world)
    assert client.get(f"{API}/projects/{other}/runs/{run['id']}/metrics", headers=ctx["admin"]).status_code == 404


# --- DB ------------------------------------------------------------------------------------------------

def test_the_database_keeps_one_value_per_series_and_valid_windows(client, ctx, run, db, engine):
    attempt = db.scalar("SELECT id FROM run_attempt WHERE run_id = :r", r=run["id"])
    assert db.scalar("SELECT count(*) FROM metric_result WHERE attempt_id = :a", a=attempt) > 20
    insert = ("INSERT INTO metric_result (attempt_id, project_id, metric_key, dimensions, dimensions_hash, "
              "window_kind, window_start_min, window_start_exact, window_end_min, window_end_exact, value, unit, "
              "definition_version, quality_status) SELECT attempt_id, project_id, metric_key, dimensions, "
              "dimensions_hash, :kind, window_start_min, window_start_exact, window_end_min, window_end_exact, value, "
              "unit, definition_version, :quality FROM metric_result WHERE attempt_id = :a LIMIT 1")
    with pytest.raises(DBAPIError) as e, engine.begin() as conn:  # 같은 지표·차원·구간은 하나뿐
        conn.execute(text(insert), {"a": attempt, "kind": "run", "quality": "complete"})
    assert e.value.orig.sqlstate == "23505"
    with pytest.raises(DBAPIError) as e, engine.begin() as conn:
        conn.execute(text(insert), {"a": attempt, "kind": "year", "quality": "complete"})
    assert e.value.orig.sqlstate == "23514"
    with pytest.raises(DBAPIError) as e, engine.begin() as conn:
        conn.execute(text(insert), {"a": attempt, "kind": "day", "quality": "perfect"})
    assert e.value.orig.sqlstate == "23514"


def test_a_fenced_out_worker_cannot_write_metrics(client, ctx, db, engine):
    from test_api_run_events import expire
    from test_api_runs import isolate

    run = ok(request_run(client, ctx, approved_scenario(client, ctx)["id"]), 202)
    isolate(db, ctx["pid"])
    sessions = sessionmaker(engine)
    with sessions() as s:
        old = queue.claim_next(s, "w-old", 30)
    expire(db, run["id"])
    with sessions() as s:
        queue.claim_next(s, "w-new", 30)
    row = {"metric_key": "completed_items", "dimensions": {}, "dimensions_hash": "x", "window_kind": "run",
           "window_start_min": {"min": "0", "exact": "0"}, "window_end_min": {"min": "1", "exact": "1"},
           "value": "1", "unit": "count", "definition_version": "1", "quality_status": "complete"}
    with sessions() as s, pytest.raises(queue.LeaseLost):
        queue.write_batch(s, old, "metrics", [row], 30)
    assert db.scalar("SELECT count(*) FROM metric_result WHERE attempt_id = :a", a=old.attempt_id) == 0
