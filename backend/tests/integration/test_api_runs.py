"""BE-06a: 실행 요청·입력 스냅샷·취소 API와 DB 큐·worker를 실제 PostgreSQL로 검증한다(CR be08, DEC-008)."""

import uuid
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction

import pytest
from helpers import create_project
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, sessionmaker
from test_api_scenarios import ctx, etag, new_scenario, ok, patch, product_entry, version_of  # noqa: F401

from simulation_platform.settings import Settings
from simulation_platform.worker import queue
from simulation_platform.worker.service import process_one

API = "/api/v1"
RESTRICT = "23001"


def approved_scenario(client, ctx, **entry):
    version = version_of(client, ctx, new_scenario(client, ctx))
    version = ok(patch(client, ctx, version, {"products": [product_entry(ctx, **entry)]}))
    return ok(client.post(f"{ctx['base']}/scenario-versions/{version['id']}/approve",
                          headers=etag(ctx, "admin", version["row_version"])))


def request_run(client, ctx, version_id, key=None, who="editor", **body):
    return client.post(f"{ctx['base']}/runs", json={"scenario_version_id": version_id, **body},
                       headers={**ctx[who], "Idempotency-Key": key or f"k-{uuid.uuid4().hex}"})


def new_run(client, ctx, **body):
    version = approved_scenario(client, ctx)
    return ok(request_run(client, ctx, version["id"], **body), 202), version


@pytest.fixture
def worker_settings():
    return Settings(app_env="test", auth_mode="local", worker_heartbeat_seconds=1.0, worker_lease_seconds=30.0,
                    worker_wall_timeout_seconds=120.0, _env_file=None)


def isolate(db, project_id):
    """공유 시험 DB의 다른 시험이 남긴 대기 job을 worker가 가져가지 않게 이 프로젝트 것만 남긴다."""
    sql = ("UPDATE job SET state = 'cancelled', lease_token = NULL, lease_expires_at = NULL "
           "WHERE state IN ('queued', 'claimed') AND project_id <> :p")
    db.run((sql, {"p": project_id}))


# --- 요청 ---------------------------------------------------------------------------------------------

def test_a_run_is_requested_with_an_immutable_input_snapshot_and_a_queued_job(client, ctx, db):
    run, version = new_run(client, ctx, seed=7, replicate_index=2)
    assert run["status"] == "queued" and run["scenario_version_id"] == version["id"]
    assert (run["seed"], run["replicate_index"], run["result"], run["attempts"]) == (7, 2, None, [])
    assert run["engine_version"] and len(run["input_hash"]) == 64 and run["cancel_requested_at"] is None
    assert db.scalar("SELECT state FROM job WHERE run_id = :r", r=run["id"]) == "queued"

    stored = ok(client.get(f"{ctx['base']}/runs/{run['id']}/input", headers=ctx["viewer"]))
    assert stored["sha256"] == run["input_hash"] and stored["hash_verified"] is True
    snapshot = stored["snapshot"]
    assert snapshot["scenario"]["scenario_version_id"] == version["id"] and snapshot["seed"] == 7
    assert snapshot["engine"]["version"] == run["engine_version"] and snapshot["engine_options"]["event_limit"] > 0
    assert snapshot["products"][0]["arrivals"] == [
        {"at_min": "0", "count": 2, "length_m": "1000", "weight_kg": None, "lot": None}]
    assert snapshot["products"][0]["process_version"]["status"] == "approved"
    assert {ctx["equipment"], ctx["storage"]} == set(snapshot["assets"])  # 고정한 자산 버전(용량·포트 규칙)


def test_the_snapshot_cannot_be_changed_or_deleted_even_with_direct_sql(client, ctx, engine):
    run, _ = new_run(client, ctx)
    for sql in ("UPDATE run_input_snapshot SET schema_version = '9' WHERE run_id = :r",
                "DELETE FROM run_input_snapshot WHERE run_id = :r"):
        with pytest.raises(DBAPIError) as e, engine.begin() as conn:
            conn.execute(text(sql), {"r": run["id"]})
        assert e.value.orig.sqlstate == RESTRICT, sql


def test_only_an_approved_runnable_scenario_version_can_be_run(client, ctx):
    draft = version_of(client, ctx, new_scenario(client, ctx))
    r = request_run(client, ctx, draft["id"])
    assert r.status_code == 422 and r.json()["error"]["code"] == "RUN_NOT_RUNNABLE"
    assert r.json()["error"]["details"][0]["rule_id"] == "RUN-SCN-001"
    missing = request_run(client, ctx, str(uuid.uuid4()))
    assert missing.status_code == 404


def test_idempotency_key_returns_the_same_run_and_rejects_a_different_body(client, ctx):
    version = approved_scenario(client, ctx)
    first = request_run(client, ctx, version["id"], key="same-key", seed=1)
    again = request_run(client, ctx, version["id"], key="same-key", seed=1)
    assert (first.status_code, again.status_code) == (202, 200)
    assert first.json()["data"]["id"] == again.json()["data"]["id"]
    conflict = request_run(client, ctx, version["id"], key="same-key", seed=2)
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"
    other_user = request_run(client, ctx, version["id"], key="same-key", seed=1, who="admin")
    assert other_user.status_code == 202 and other_user.json()["data"]["id"] != first.json()["data"]["id"]
    assert ok(client.get(f"{ctx['base']}/runs", headers=ctx["viewer"]))  # 중복 요청이 run을 늘리지 않았다


def test_the_idempotency_key_is_required_and_validated(client, ctx):
    version = approved_scenario(client, ctx)
    body = {"scenario_version_id": version["id"]}
    assert client.post(f"{ctx['base']}/runs", json=body, headers=ctx["editor"]).status_code == 428
    long_key = client.post(f"{ctx['base']}/runs", json=body, headers={**ctx["editor"], "Idempotency-Key": "x" * 129})
    assert long_key.status_code == 422
    assert request_run(client, ctx, version["id"], seed=-1).status_code == 422
    assert request_run(client, ctx, version["id"], seed=1.5).status_code == 422
    assert client.post(f"{ctx['base']}/runs", json={**body, "extra": 1},
                       headers={**ctx["editor"], "Idempotency-Key": "k"}).status_code == 422


def test_permissions_and_project_scope(client, ctx, world):
    version = approved_scenario(client, ctx)
    assert request_run(client, ctx, version["id"], who="viewer").status_code == 403
    assert request_run(client, ctx, version["id"], who="outsider").status_code == 404
    run = ok(request_run(client, ctx, version["id"]), 202)
    assert ok(client.get(f"{ctx['base']}/runs/{run['id']}", headers=ctx["viewer"]))["id"] == run["id"]
    assert client.get(f"{ctx['base']}/runs/{run['id']}", headers=ctx["outsider"]).status_code == 404
    other, _ = create_project(client, world)
    for path in (f"{API}/projects/{other}/runs/{run['id']}", f"{API}/projects/{other}/runs/{run['id']}/input"):
        assert client.get(path, headers=ctx["admin"]).status_code == 404  # 다른 프로젝트의 run은 보이지 않는다
    cross = client.post(f"{API}/projects/{other}/runs", json={"scenario_version_id": version["id"]},
                        headers={**ctx["admin"], "Idempotency-Key": "k"})
    assert cross.status_code == 404  # 다른 프로젝트의 시나리오 버전으로 실행할 수 없다
    assert client.post(f"{ctx['base']}/runs/{run['id']}/cancel", headers=ctx["viewer"]).status_code == 403


def test_list_filters_and_pages_newest_first(client, ctx):
    version = approved_scenario(client, ctx)
    runs = [ok(request_run(client, ctx, version["id"], seed=i), 202) for i in range(3)]
    listed = ok(client.get(f"{ctx['base']}/runs", params={"scenario_version_id": version["id"]}, headers=ctx["viewer"]))
    assert [r["id"] for r in listed] == [r["id"] for r in reversed(runs)]
    page = client.get(f"{ctx['base']}/runs", params={"scenario_version_id": version["id"], "limit": 2},
                      headers=ctx["viewer"]).json()
    assert len(page["data"]) == 2 and page["page"]["next_cursor"]
    rest = client.get(f"{ctx['base']}/runs", params={"scenario_version_id": version["id"], "limit": 2,
                                                     "cursor": page["page"]["next_cursor"]}, headers=ctx["viewer"]).json()
    assert [r["id"] for r in rest["data"]] == [runs[0]["id"]] and rest["page"]["next_cursor"] is None
    assert client.get(f"{ctx['base']}/runs", params={"status": "completed"}, headers=ctx["viewer"]).json()["data"] == []
    reused = client.get(f"{ctx['base']}/runs", params={"cursor": page["page"]["next_cursor"]}, headers=ctx["viewer"])
    assert reused.status_code == 422  # 필터가 달라지면 cursor를 재사용할 수 없다
    assert client.get(f"{ctx['base']}/runs", params={"status": "bogus"}, headers=ctx["viewer"]).status_code == 422


# --- 취소 ---------------------------------------------------------------------------------------------

def test_cancel_before_the_run_starts_cancels_it_right_away(client, ctx, db):
    run, _ = new_run(client, ctx)
    cancelled = client.post(f"{ctx['base']}/runs/{run['id']}/cancel", headers=ctx["editor"])
    assert cancelled.status_code == 202
    data = cancelled.json()["data"]
    assert data["status"] == "cancelled" and data["termination_reason"] == "CANCELLED_BEFORE_START"
    assert data["cancel_requested_at"] and data["finished_at"]
    assert db.scalar("SELECT state FROM job WHERE run_id = :r", r=run["id"]) == "cancelled"
    late = client.post(f"{ctx['base']}/runs/{run['id']}/cancel", headers=ctx["editor"])
    assert late.status_code == 409 and late.json()["error"]["code"] == "JOB_CANCEL_TOO_LATE"


def test_cancel_while_running_is_a_request_the_worker_then_carries_out(client, ctx, db, engine, worker_settings):
    run, _ = new_run(client, ctx)
    isolate(db, ctx["pid"])
    sessions = sessionmaker(engine)
    with sessions() as s:
        claim = queue.claim_next(s, "w-1", 30)
    assert claim is not None and claim.run_id == uuid.UUID(run["id"])
    requested = ok(client.post(f"{ctx['base']}/runs/{run['id']}/cancel", headers=ctx["editor"]), 202)
    assert requested["status"] == "running" and requested["cancel_requested_at"]  # 요청과 실제 취소를 구분한다
    assert requested["attempts"][0]["state"] == "running"
    with sessions() as s:
        assert queue.heartbeat(s, claim, 30) is True  # worker가 heartbeat에서 취소 요청을 본다
    with sessions() as s:
        assert queue.finish(s, claim, outcome="cancelled") == "cancelled"
    final = ok(client.get(f"{ctx['base']}/runs/{run['id']}", headers=ctx["viewer"]))
    assert final["status"] == "cancelled" and final["termination_reason"] == "CANCELLED"
    assert final["attempts"][0]["state"] == "cancelled" and final["result"] is None


# --- worker가 실제로 실행(자식 프로세스) ------------------------------------------------------------------

def test_the_worker_runs_the_snapshot_in_a_child_process_and_records_the_result(client, ctx, db, engine, worker_settings):
    run, _ = new_run(client, ctx)
    isolate(db, ctx["pid"])
    assert process_one(sessionmaker(engine), worker_settings, "w-e2e") == "completed"
    done = ok(client.get(f"{ctx['base']}/runs/{run['id']}", headers=ctx["viewer"]))
    assert done["status"] == "completed" and done["termination_reason"] is None and done["finished_at"]
    assert [(a["attempt_no"], a["state"], a["worker_id"]) for a in done["attempts"]] == [(1, "finished", "w-e2e")]
    result = done["result"]
    assert (result["state"], result["censored"], result["engine_version"]) == ("completed", False, run["engine_version"])
    # 1,000m 2개가 한 설비에서 30m/min로 차례로 처리된다: 100/3분, 200/3분
    assert result["end_time"]["exact"] == str(Fraction(200, 3)) and result["end_time"]["min"] == "66.666667"
    product = result["products"][0]
    assert (product["completed_items"], product["reached_sink"], product["completed_length_m"]) == (2, 2, "2000.000000")
    assert product["first_completion"]["exact"] == "100/3" and product["last_completion"]["exact"] == "200/3"
    assert result["event_count"] > 0 and result["shortfalls"] == [] and result["failure"] is None
    assert db.scalar("SELECT state FROM job WHERE run_id = :r", r=run["id"]) == "done"
    assert db.scalar("SELECT selected_attempt_id IS NOT NULL FROM simulation_run WHERE id = :r", r=run["id"])
    assert process_one(sessionmaker(engine), worker_settings, "w-e2e") is None  # 더 가져갈 job이 없다


def test_a_snapshot_that_no_longer_matches_its_hash_is_not_run(client, ctx, db, engine, worker_settings):
    """저장소가 불변이어야 하므로 해시가 다른 입력은 실행하지 않는다(트리거를 잠시 끄고 변조를 흉내 낸다)."""
    run, _ = new_run(client, ctx)
    isolate(db, ctx["pid"])
    tamper = "UPDATE run_input_snapshot SET snapshot = jsonb_set(snapshot, '{seed}', '99') WHERE run_id = :r"
    db.run(("ALTER TABLE run_input_snapshot DISABLE TRIGGER trg_run_input_snapshot_guard", {}),
           (tamper, {"r": run["id"]}),
           ("ALTER TABLE run_input_snapshot ENABLE TRIGGER trg_run_input_snapshot_guard", {}))
    assert process_one(sessionmaker(engine), worker_settings, "w-tamper") == "failed"
    failed = ok(client.get(f"{ctx['base']}/runs/{run['id']}", headers=ctx["viewer"]))
    assert failed["status"] == "failed" and failed["termination_reason"] == "SNAPSHOT_HASH_MISMATCH"
    assert failed["result"] is None
    assert ok(client.get(f"{ctx['base']}/runs/{run['id']}/input", headers=ctx["viewer"]))["hash_verified"] is False


# --- 큐: 동시 claim · 임대 만료 · fencing -----------------------------------------------------------------

def expire_lease(db, run_id):
    db.run(("UPDATE job SET lease_expires_at = now() - interval '1 minute' WHERE run_id = :r", {"r": run_id}))


def test_only_one_worker_gets_a_job_when_many_claim_at_once(client, ctx, db, engine):
    new_run(client, ctx)
    isolate(db, ctx["pid"])
    sessions = sessionmaker(engine)

    def attempt(i):
        with sessions() as s:
            return queue.claim_next(s, f"w-{i}", 30)

    with ThreadPoolExecutor(8) as pool:
        got = [c for c in pool.map(attempt, range(8)) if c is not None]
    assert len(got) == 1 and got[0].fencing_token == 1


def test_an_expired_lease_is_taken_over_and_the_old_worker_is_fenced_out(client, ctx, db, engine):
    run, _ = new_run(client, ctx)
    isolate(db, ctx["pid"])
    sessions = sessionmaker(engine)
    with sessions() as s:
        old = queue.claim_next(s, "w-old", 30)
    with sessions() as s:
        assert queue.claim_next(s, "w-new", 30) is None  # 임대가 살아 있으면 다른 worker가 가져가지 못한다
    expire_lease(db, run["id"])
    with sessions() as s:
        new = queue.claim_next(s, "w-new", 30)
    assert new is not None and new.fencing_token == 2 and new.lease_token != old.lease_token
    # 옛 worker가 뒤늦게 돌아와도 아무것도 쓰지 못한다
    with sessions() as s, pytest.raises(queue.LeaseLost):
        queue.heartbeat(s, old, 30)
    with sessions() as s, pytest.raises(queue.LeaseLost):
        queue.finish(s, old, outcome="finished", summary={"state": "completed", "reason": None})
    assert db.scalar("SELECT status FROM simulation_run WHERE id = :r", r=run["id"]) == "running"
    with sessions() as s:
        assert queue.finish(s, new, outcome="finished", summary={"state": "completed", "reason": None,
                                                                    "engine_version": "x"}) == "completed"
    states = [row[0] for row in db.engine.connect().execute(text(
        "SELECT state FROM run_attempt WHERE run_id = :r ORDER BY attempt_no"), {"r": run["id"]})]
    assert states == ["abandoned", "finished"]
    assert db.scalar("SELECT termination_reason FROM run_attempt WHERE run_id = :r AND attempt_no = 1",
                     r=run["id"]) == "LEASE_EXPIRED"


def test_a_job_whose_workers_keep_disappearing_ends_as_failed_after_the_attempt_limit(client, ctx, db, engine):
    run, _ = new_run(client, ctx)
    isolate(db, ctx["pid"])
    db.run(("UPDATE job SET max_attempts = 2 WHERE run_id = :r", {"r": run["id"]}))
    sessions = sessionmaker(engine)
    for _ in range(2):
        with sessions() as s:
            assert queue.claim_next(s, "w", 30) is not None
        expire_lease(db, run["id"])
    with sessions() as s:
        assert queue.claim_next(s, "w", 30) is None
    final = ok(client.get(f"{ctx['base']}/runs/{run['id']}", headers=ctx["viewer"]))
    assert final["status"] == "failed" and final["termination_reason"] == "WORKER_LOST"
    assert [a["state"] for a in final["attempts"]] == ["abandoned", "abandoned"]
    assert db.scalar("SELECT state FROM job WHERE run_id = :r", r=run["id"]) == "failed"


def test_a_crashed_attempt_is_retried_but_an_engine_error_is_not(client, ctx, db, engine):
    run, _ = new_run(client, ctx)
    isolate(db, ctx["pid"])
    sessions = sessionmaker(engine)
    with sessions() as s:
        first = queue.claim_next(s, "w", 30)
    with sessions() as s:
        assert queue.finish(s, first, outcome="failed", reason="WORKER_CRASH", retry=True,
                            retry_after_seconds=0) == "queued"
    with sessions() as s:
        second = queue.claim_next(s, "w", 30)
    assert second.fencing_token == 2
    with sessions() as s:
        assert queue.finish(s, second, outcome="failed", reason="ENGINE_ERROR", retry=False) == "failed"
    final = ok(client.get(f"{ctx['base']}/runs/{run['id']}", headers=ctx["viewer"]))
    assert final["status"] == "failed" and final["termination_reason"] == "ENGINE_ERROR"
    assert [a["state"] for a in final["attempts"]] == ["failed", "failed"]


def test_heartbeat_extends_the_lease(client, ctx, db, engine):
    run, _ = new_run(client, ctx)
    isolate(db, ctx["pid"])
    sessions = sessionmaker(engine)
    with sessions() as s:
        claim = queue.claim_next(s, "w", 5)
    before = db.scalar("SELECT lease_expires_at FROM job WHERE run_id = :r", r=run["id"])
    with sessions() as s:
        assert queue.heartbeat(s, claim, 600) is False
    after = db.scalar("SELECT lease_expires_at FROM job WHERE run_id = :r", r=run["id"])
    assert (after - before).total_seconds() > 500
    assert db.scalar("SELECT heartbeat_at IS NOT NULL FROM run_attempt WHERE run_id = :r", r=run["id"])


def test_a_cancel_requested_before_the_job_is_claimed_cancels_it_at_claim_time(client, ctx, db, engine):
    run, _ = new_run(client, ctx)
    isolate(db, ctx["pid"])
    db.run(("UPDATE simulation_run SET cancel_requested_at = now() WHERE id = :r", {"r": run["id"]}))
    with sessionmaker(engine)() as s:
        assert queue.claim_next(s, "w", 30) is None
    assert ok(client.get(f"{ctx['base']}/runs/{run['id']}", headers=ctx["viewer"]))["status"] == "cancelled"


def test_cross_project_references_are_rejected_by_the_database(client, ctx, db, world, engine):
    """run의 시나리오 버전·job·snapshot·attempt는 같은 프로젝트의 것이어야 한다(복합 FK)."""
    run, _ = new_run(client, ctx)
    other, _ = create_project(client, world)
    with pytest.raises(DBAPIError) as e, engine.begin() as conn:
        conn.execute(text("INSERT INTO job (id, project_id, run_id, kind, state, payload) "
                          "VALUES (:i, :p, :r, 'other', 'queued', '{}')"),
                     {"i": uuid.uuid4(), "p": str(other), "r": run["id"]})
    assert e.value.orig.sqlstate == "23503"
    with pytest.raises(DBAPIError) as e, engine.begin() as conn:
        conn.execute(text("UPDATE job SET state = 'claimed' WHERE run_id = :r"), {"r": run["id"]})  # 임대 없이 claimed
    assert e.value.orig.sqlstate == "23514"


def test_session_factory_is_the_only_db_access_the_worker_needs(engine):
    assert isinstance(sessionmaker(engine)(), Session)
