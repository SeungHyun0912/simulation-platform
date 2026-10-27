"""BE-06b: 실행 이벤트·작업물 계보의 저장과 조회 API, 상태 요약(STATE_SNAPSHOT), 시도(attempt) 격리를 실제 PostgreSQL로 검증한다."""

import uuid

import pytest
from helpers import create_project
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import sessionmaker
from test_api_runs import approved_scenario, isolate, request_run, worker_settings  # noqa: F401
from test_api_scenarios import ctx, etag, new_scenario, ok, patch, version_of  # noqa: F401

from simulation_platform.worker import queue
from simulation_platform.worker.service import process_one

API = "/api/v1"


def finished_run(client, ctx, db, engine, worker_settings, arrivals=None):
    """시나리오를 승인하고 실행을 요청해 worker가 끝까지 돌린 run을 돌려준다."""
    version = approved_scenario(client, ctx)
    if arrivals is not None:
        draft = ok(client.post(f"{ctx['base']}/scenarios/{version['scenario_id']}/versions", json={}, headers=ctx["editor"]), 201)
        draft = ok(patch(client, ctx, draft, {"products": [{
            "product_id": ctx["product"], "process_version_id": ctx["process"], "arrivals": arrivals}]}))
        version = ok(client.post(f"{ctx['base']}/scenario-versions/{draft['id']}/approve",
                                 headers=etag(ctx, "admin", draft["row_version"])))
    run = ok(request_run(client, ctx, version["id"]), 202)
    isolate(db, ctx["pid"])
    assert process_one(sessionmaker(engine), worker_settings, "w-events") == "completed"
    return ok(client.get(f"{ctx['base']}/runs/{run['id']}", headers=ctx["viewer"]))


def events_of(client, ctx, run_id, **params):
    return client.get(f"{ctx['base']}/runs/{run_id}/events", params=params, headers=ctx["viewer"])


def all_events(client, ctx, run_id, **params):
    """cursor를 따라 끝까지 읽는다."""
    found, cursor = [], None
    while True:
        page = ok(events_of(client, ctx, run_id, limit=7, **({"cursor": cursor} if cursor else {}), **params), 200) \
            if False else events_of(client, ctx, run_id, limit=7, **({"cursor": cursor} if cursor else {}), **params)
        body = page.json()
        found.extend(body["data"])
        cursor = body["page"]["next_cursor"]
        if cursor is None:
            return found


@pytest.fixture
def run(client, ctx, db, engine, worker_settings):
    return finished_run(client, ctx, db, engine, worker_settings)


# --- 공식 결과가 있어야 조회 ---------------------------------------------------------------------------

def test_events_and_lineage_need_an_official_result(client, ctx):
    queued = ok(request_run(client, ctx, approved_scenario(client, ctx)["id"]), 202)
    for path in ("events", "items/item-0001/lineage"):
        r = client.get(f"{ctx['base']}/runs/{queued['id']}/{path}", headers=ctx["viewer"])
        assert r.status_code == 409 and r.json()["error"]["code"] == "RUN_RESULT_NOT_AVAILABLE", path


# --- 이벤트 ------------------------------------------------------------------------------------------

def test_the_worker_stores_every_event_in_order_and_the_api_pages_through_them(client, ctx, run):
    total = run["result"]["event_count"]
    assert total > 0
    found = all_events(client, ctx, run["id"])
    assert [e["event_seq"] for e in found] == list(range(1, total + 1))  # 빠짐·중복 없이 번호가 이어진다
    first, last = found[0], found[-1]
    assert first["event_type"] == "MATERIAL_ARRIVED" and first["sim_time"] == {"min": "0.000000", "exact": "0"}
    assert last["event_type"] == "RUN_TERMINATED" and last["sim_time"]["exact"] == "200/3"
    assert last["sim_time"]["min"] == "66.666667" and last["quantities"]["state"] == "completed"
    assert first["quantities"]["length_m"] == "1000.000000"  # 길이는 decimal 문자열
    page = ok_page(events_of(client, ctx, run["id"], limit=5))
    assert len(page["data"]) == 5 and page["page"]["next_cursor"]


def ok_page(response):
    assert response.status_code == 200, response.text
    return response.json()


def test_events_can_be_filtered_by_type_step_asset_item_and_time(client, ctx, run):
    everything = all_events(client, ctx, run["id"])
    done = all_events(client, ctx, run["id"], event_type="MILESTONE_REACHED")
    assert len(done) == 2 and {e["reason"] for e in done} == {"completion"}
    item = done[0]["item_key"]
    mine = all_events(client, ctx, run["id"], item_key=item)
    assert mine and {e["item_key"] for e in mine} == {item}
    assert [e["event_seq"] for e in mine] == sorted(e["event_seq"] for e in mine)
    step = next(e["step_key"] for e in everything if e["step_key"])
    assert {e["step_key"] for e in all_events(client, ctx, run["id"], step_key=step)} == {step}
    asset = next(e["asset_key"] for e in everything if e["asset_key"])
    assert {e["asset_key"] for e in all_events(client, ctx, run["id"], asset_key=asset)} == {asset}
    early = all_events(client, ctx, run["id"], to_min="50")  # [from, to) 구간
    assert early and all(float(e["sim_time"]["min"]) < 50 for e in early)
    late = all_events(client, ctx, run["id"], from_min="50")
    assert late and all(float(e["sim_time"]["min"]) >= 50 for e in late)
    assert len(early) + len(late) == len(everything)
    assert all_events(client, ctx, run["id"], event_type="NO_SUCH_EVENT") == []


def test_bad_event_queries_are_rejected(client, ctx, run):
    page = ok_page(events_of(client, ctx, run["id"], limit=3))
    cursor = page["page"]["next_cursor"]
    reused = events_of(client, ctx, run["id"], cursor=cursor, event_type="MATERIAL_ARRIVED")
    assert reused.status_code == 422  # 필터가 달라지면 cursor를 재사용할 수 없다
    assert events_of(client, ctx, run["id"], from_min="abc").status_code == 422
    assert events_of(client, ctx, run["id"], from_min="-1").status_code == 422
    assert events_of(client, ctx, run["id"], cursor="nonsense").status_code == 422


def test_daily_state_snapshots_are_stored_as_events(client, ctx, db, engine, worker_settings):
    # 1,000m 2개가 4일 뒤(5,760분)에 들어온다 → 하루 경계마다 상태 요약이 남는다
    run = finished_run(client, ctx, db, engine, worker_settings, arrivals=[
        {"at_min": "5760", "count": 2, "length_m": "1000"}])
    shots = all_events(client, ctx, run["id"], event_type="STATE_SNAPSHOT")
    assert [s["quantities"]["day_index"] for s in shots] == [1, 2, 3, 4]
    assert [s["sim_time"]["exact"] for s in shots] == ["1440", "2880", "4320", "5760"]
    assert shots[3]["quantities"]["periods"] == ["day"]
    assert shots[0]["quantities"]["wip"] == [] and shots[0]["quantities"]["busy_assets"] == []
    assert run["result"]["end_time"]["exact"] == "17480/3"  # 5,760 + 200/3


def test_permissions_and_project_scope_apply_to_events_and_lineage(client, ctx, run, world):
    assert events_of(client, ctx, run["id"]).status_code == 200
    outsider = client.get(f"{ctx['base']}/runs/{run['id']}/events", headers=ctx["outsider"])
    assert outsider.status_code == 404
    other, _ = create_project(client, world)
    for path in ("events", "items/item-0001/lineage"):
        assert client.get(f"{API}/projects/{other}/runs/{run['id']}/{path}", headers=ctx["admin"]).status_code == 404


# --- 계보 --------------------------------------------------------------------------------------------

def test_lineage_of_an_item_lists_its_items_and_the_operations_that_changed_it(client, ctx, run):
    done = all_events(client, ctx, run["id"], event_type="MILESTONE_REACHED")
    item = done[0]["item_key"]
    lineage = ok(client.get(f"{ctx['base']}/runs/{run['id']}/items/{item}/lineage", headers=ctx["viewer"]))
    assert lineage["item_key"] == item and lineage["truncated"] is False
    keys = {i["item_key"] for i in lineage["items"]}
    assert item in keys
    operation = lineage["operations"][0]
    assert operation["relation_type"] in ("transform", "supply", "split", "yield")
    assert operation["links"] and {link["parent_key"] for link in operation["links"]} <= keys
    stored = next(i for i in lineage["items"] if i["item_key"] == item)
    assert stored["length_m"] == "1000.000000" and stored["weight_kg"] is None  # 없는 값은 null
    assert stored["process_version_id"] == ctx["process"] and stored["created_at"]["exact"] == "0"
    missing = client.get(f"{ctx['base']}/runs/{run['id']}/items/item-9999/lineage", headers=ctx["viewer"])
    assert missing.status_code == 404


def test_every_relation_points_at_items_of_the_same_attempt(client, ctx, run, db):
    attempt = db.scalar("SELECT id FROM run_attempt WHERE run_id = :r", r=run["id"])
    assert db.scalar("SELECT count(*) FROM work_item WHERE attempt_id = :a", a=attempt) == 2
    assert db.scalar("SELECT count(*) FROM work_item_relation WHERE attempt_id = :a", a=attempt) >= 2
    assert db.scalar("SELECT count(*) FROM simulation_event WHERE attempt_id = :a", a=attempt) == \
        run["result"]["event_count"]


# --- 시도(attempt) 격리 · fencing ----------------------------------------------------------------------

def one_event(seq=1):
    return {"event_seq": seq, "sim_time_min": "0.000000", "sim_time_exact": "0", "event_type": "MATERIAL_ARRIVED",
            "step_key": None, "operation_id": None, "asset_key": None, "item_key": "item-0001", "source": None,
            "destination": "src", "reason": None, "process_version_id": None, "quantities": {}}


def expire(db, run_id):
    db.run(("UPDATE job SET lease_expires_at = now() - interval '1 minute' WHERE run_id = :r", {"r": run_id}))


def test_a_fenced_out_worker_cannot_write_and_abandoned_attempts_are_not_official(client, ctx, db, engine):
    run = ok(request_run(client, ctx, approved_scenario(client, ctx)["id"]), 202)
    isolate(db, ctx["pid"])
    sessions = sessionmaker(engine)
    with sessions() as s:
        old = queue.claim_next(s, "w-old", 30)
    with sessions() as s:
        assert queue.write_batch(s, old, "events", [one_event()], 30) is False
    expire(db, run["id"])
    with sessions() as s:
        new = queue.claim_next(s, "w-new", 30)
    with sessions() as s, pytest.raises(queue.LeaseLost):
        queue.write_batch(s, old, "events", [one_event(2)], 30)  # 옛 worker는 쓰지 못한다
    assert db.scalar("SELECT count(*) FROM simulation_event WHERE attempt_id = :a", a=old.attempt_id) == 1
    with sessions() as s:
        queue.finish(s, new, outcome="finished", summary={"state": "completed", "reason": None, "engine_version": "x"})
    # 공식 결과는 새 시도뿐이라 버려진 시도가 남긴 이벤트는 보이지 않는다
    assert ok_page(events_of(client, ctx, run["id"]))["data"] == []
    assert db.scalar("SELECT count(*) FROM simulation_event WHERE attempt_id = :a", a=new.attempt_id) == 0


def test_a_cancel_request_is_seen_when_a_batch_is_written(client, ctx, db, engine):
    run = ok(request_run(client, ctx, approved_scenario(client, ctx)["id"]), 202)
    isolate(db, ctx["pid"])
    sessions = sessionmaker(engine)
    with sessions() as s:
        claim = queue.claim_next(s, "w", 30)
    ok(client.post(f"{ctx['base']}/runs/{run['id']}/cancel", headers=ctx["editor"]), 202)
    with sessions() as s:
        assert queue.write_batch(s, claim, "events", [one_event()], 30) is True  # worker가 멈출 수 있다


# --- DB 제약 ------------------------------------------------------------------------------------------

def test_the_database_keeps_events_and_lineage_inside_one_attempt_and_project(client, ctx, db, engine, world):
    run = ok(request_run(client, ctx, approved_scenario(client, ctx)["id"]), 202)
    isolate(db, ctx["pid"])
    with sessionmaker(engine)() as s:
        claim = queue.claim_next(s, "w", 30)
    other, _ = create_project(client, world)
    insert = ("INSERT INTO simulation_event (attempt_id, project_id, event_seq, sim_time_min, sim_time_exact, "
              "event_type, quantities) VALUES (:a, :p, :s, 0, '0', 'X', '{}')")
    with pytest.raises(DBAPIError) as e, engine.begin() as conn:  # 다른 프로젝트 번호로는 이 시도에 붙일 수 없다
        conn.execute(text(insert), {"a": claim.attempt_id, "p": str(other), "s": 1})
    assert e.value.orig.sqlstate == "23503"
    with engine.begin() as conn:
        conn.execute(text(insert), {"a": claim.attempt_id, "p": claim.project_id, "s": 1})
    with pytest.raises(DBAPIError) as e, engine.begin() as conn:  # (attempt_id, event_seq)는 유일하다
        conn.execute(text(insert), {"a": claim.attempt_id, "p": claim.project_id, "s": 1})
    assert e.value.orig.sqlstate == "23505"
    with pytest.raises(DBAPIError) as e, engine.begin() as conn:  # 없는 작업물을 계보에 올릴 수 없다
        conn.execute(text(
            "INSERT INTO work_item_relation (attempt_id, project_id, seq, operation_key, step_key, relation_type, "
            "accounting_mode, parent_key) VALUES (:a, :p, 1, 'op', 'st', 'split', 'physical', 'item-0001')"),
            {"a": claim.attempt_id, "p": claim.project_id})
    assert e.value.orig.sqlstate == "23503"
    assert run["id"]  # 시도가 속한 run
    _ = uuid
