"""BE-10: 병목 요약 API·단계 지표 필터·결과의 제품 코드·이름을 실제 PostgreSQL로 검증한다."""

from decimal import Decimal

import pytest
from helpers import create_project
from test_api_run_events import finished_run, ok_page
from test_api_runs import approved_scenario, request_run, worker_settings  # noqa: F401
from test_api_scenarios import ctx, etag, new_scenario, ok, patch, version_of  # noqa: F401

API = "/api/v1"


@pytest.fixture
def run(client, ctx, db, engine, worker_settings):
    """원자재 4개(1,000m)가 동시에 들어오고 설비는 한 대: 작업은 100/3분씩 차례로 진행되어 둘째·셋째·넷째가 각각
    100/3·200/3·100분을 기다린다(합 200작업물·분)."""
    return finished_run(client, ctx, db, engine, worker_settings, arrivals=[
        {"at_min": "0", "count": 4, "length_m": "1000"}])


def bottlenecks(client, ctx, run_id, **params):
    return client.get(f"{ctx['base']}/runs/{run_id}/bottlenecks", params=params, headers=ctx["viewer"])


def test_bottlenecks_need_an_official_result(client, ctx):
    queued = ok(request_run(client, ctx, approved_scenario(client, ctx)["id"]), 202)
    r = bottlenecks(client, ctx, queued["id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "RUN_RESULT_NOT_AVAILABLE"


def test_an_item_waiting_for_the_only_machine_is_reported_as_an_equipment_busy_bottleneck(client, ctx, run):
    summary = ok(client.get(f"{ctx['base']}/runs/{run['id']}/bottlenecks", headers=ctx["viewer"]))
    assert summary["run_id"] == run["id"] and summary["quality_status"] == "complete"
    assert summary["observed"]["exact"] == "400/3" and summary["definition_version"] == "2"
    by_kind = {f["kind"]: f for f in summary["findings"]}
    finding = by_kind["equipment_busy"]
    # 둘째 작업물은 100/3분, 셋째(0분에 확보)는 200/3분, 넷째(100/3분에 공간에 들어와 확보)는 200/3분을 설비를 기다린다
    assert (finding["level"], finding["rank"], finding["rank_in_kind"]) == ("high", 1, 1)
    assert Decimal(finding["stalled_item_min"]) == Decimal("166.666667") and Decimal(finding["share"]) == 1
    location = finding["location"]
    assert (location["step_key"], location["step_label"], location["process_version_id"]) == ("work", "가공", ctx["process"])
    assert location["product_id"] == ctx["product"] and location["product_code"]  # 제품 코드가 붙는다
    evidence = finding["evidence"]
    assert Decimal(evidence["equipment_wait_max_min"]) == Decimal("66.666667")
    assert Decimal(evidence["equipment_wait_avg_min"]) == Decimal("41.666667")  # 작업물 4개 평균
    [machine] = evidence["assets"]
    assert machine["asset_id"] == ctx["equipment"] and machine["code"] and Decimal(machine["utilization"]) == 1
    assert finding["explanation"].startswith(location["product_code"]) and "가동 중" in finding["explanation"]
    assert summary["headline"].startswith("가장 큰 정체:") and summary["findings"][0]["kind"] == "equipment_busy"
    # 시험 공정의 대기 공간 용량이 유한해 넷째 작업물이 공간 밖에서 100/3분 기다렸다 → 공간 부족 후보(양이 작아 low)
    space = by_kind["space_full"]
    assert space["evidence"]["source"] == "space_wait" and space["location"]["node_key"] == "wait"
    assert Decimal(space["stalled_item_min"]) == Decimal("33.333333") and space["level"] == "low"
    assert any("대수를 모델링하지 않" in note for note in summary["limitations"])  # 운반 자원 한계는 항상 알린다
    assert summary["thresholds"]["pileup_min_peak_items"] == "3"
    # CR be17: 설비가 막히지 않았으니 설비 대기는 자기 자신이, 공간 대기는 그 공간을 비우는 가공 단계가 근본 원인이다
    assert [c["key"] for c in finding["chain"]] == ["work"] and finding["root_cause"]["step_key"] == "work"
    assert [(c["kind"], c["key"]) for c in space["chain"]] == [("space", "wait"), ("step", "work")]
    assert space["root_cause"]["assets"][0]["asset_id"] == ctx["equipment"]
    [root] = summary["root_causes"]
    assert (root["rank"], root["step_key"], root["findings"], root["product_id"]) == (1, "work", 2, ctx["product"])
    assert sorted(root["finding_ranks"]) == [1, 2] and Decimal(root["utilization"]) == 1


def test_the_bottleneck_limit_and_permissions(client, ctx, run, world):
    assert ok(client.get(f"{ctx['base']}/runs/{run['id']}/bottlenecks", params={"limit": 1}, headers=ctx["viewer"]))["findings"]
    assert bottlenecks(client, ctx, run["id"], limit=0).status_code == 422
    assert client.get(f"{ctx['base']}/runs/{run['id']}/bottlenecks", headers=ctx["outsider"]).status_code == 404
    other, _ = create_project(client, world)
    assert client.get(f"{API}/projects/{other}/runs/{run['id']}/bottlenecks", headers=ctx["admin"]).status_code == 404


def test_step_metrics_can_be_filtered_by_step_and_combined_with_the_process_version(client, ctx, run):
    base = f"{ctx['base']}/runs/{run['id']}/metrics"
    rows = ok_page(client.get(base, params={"metric_key": "step_operations", "step_key": "work"}, headers=ctx["viewer"]))["data"]
    assert [r["dimensions"] for r in rows] == [{"process_version_id": ctx["process"], "step_key": "work"}]
    assert Decimal(rows[0]["value"]) == 4 and rows[0]["unit"] == "count"
    none = ok_page(client.get(base, params={"step_key": "work", "process_version_id": "no-such"}, headers=ctx["viewer"]))
    assert none["data"] == []  # 필터를 함께 쓰면 모두 만족하는 행만
    wait = ok_page(client.get(base, params={"metric_key": "step_equipment_wait_item_min", "step_key": "work"},
                              headers=ctx["viewer"]))["data"][0]
    assert wait["unit"] == "item-min" and Decimal(wait["value"]) == Decimal("166.666667")
    definitions = {d["metric_key"]: d for d in ok(client.get(f"{API}/metric-definitions", headers=ctx["viewer"]))}
    assert definitions["step_equipment_wait_item_min"]["dimension"] == "step"


def test_the_result_carries_the_product_code_and_name_from_the_request_time_snapshot(client, ctx, run, db):
    product = run["result"]["products"][0]
    listed = ok(client.get(f"{ctx['base']}/products/{ctx['product']}", headers=ctx["viewer"]))
    assert (product["product_code"], product["product_name"]) == (listed["code"], listed["name"])
    stored = ok(client.get(f"{ctx['base']}/runs/{run['id']}/input", headers=ctx["viewer"]))["snapshot"]["products"][0]
    assert stored["product"] == {"code": listed["code"], "name": listed["name"]}  # 입력 스냅샷에 고정된 값


def test_a_run_without_stored_product_names_is_filled_from_the_current_product_list(client, ctx, run, db):
    """이전 run(요약에 제품 코드가 없음)도 응답에는 현재 제품 목록의 코드·이름이 보충된다."""
    strip = ("UPDATE run_attempt SET result_summary = jsonb_set(result_summary, '{products,0}', "
             "(result_summary->'products'->0) - 'product_code' - 'product_name') WHERE run_id = :r")
    db.run((strip, {"r": run["id"]}))
    product = ok(client.get(f"{ctx['base']}/runs/{run['id']}", headers=ctx["viewer"]))["result"]["products"][0]
    listed = ok(client.get(f"{ctx['base']}/products/{ctx['product']}", headers=ctx["viewer"]))
    assert (product["product_code"], product["product_name"]) == (listed["code"], listed["name"])
