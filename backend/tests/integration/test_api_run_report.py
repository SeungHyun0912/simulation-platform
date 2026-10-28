"""BE-18(CR be17): 결과 리포트 묶음 API를 실제 PostgreSQL로 검증한다."""

from decimal import Decimal

from helpers import create_project
from test_api_run_bottlenecks import run  # noqa: F401
from test_api_runs import approved_scenario, request_run, worker_settings  # noqa: F401
from test_api_scenarios import ctx, ok  # noqa: F401

API = "/api/v1"


def report(client, ctx, run_id, who="viewer"):
    return client.get(f"{ctx['base']}/runs/{run_id}/report", headers=ctx[who])


def test_the_report_needs_an_official_result(client, ctx):
    queued = ok(request_run(client, ctx, approved_scenario(client, ctx)["id"]), 202)
    r = report(client, ctx, queued["id"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "RUN_RESULT_NOT_AVAILABLE"


def test_the_report_bundles_the_run_products_bottlenecks_and_summary(client, ctx, run):
    body = ok(report(client, ctx, run["id"]))
    assert body["definition_version"] == "1"
    head = body["run"]
    assert (head["run_id"], head["status"], head["quality_status"]) == (run["id"], "completed", "complete")
    assert head["observed"]["exact"] == "400/3" and head["engine_version"] == run["engine_version"]
    assert head["input_hash"] == run["input_hash"] and head["event_count"] > 0
    assert body["scenario"]["scenario_version_id"] == run["scenario_version_id"] and body["scenario"]["code"]
    [product] = body["products"]
    assert (product["product_id"], product["process_version_id"], product["completed_items"]) == (
        ctx["product"], ctx["process"], run["result"]["products"][0]["completed_items"])
    metrics = {m["metric_key"]: m for m in product["metrics"]}
    assert Decimal(metrics["arrived_items"]["value"]) == 4 and metrics["throughput_items_per_day"]["unit"] == "count/day"
    assert "completed_items" not in metrics  # 완료 수는 필드로 한 번만
    # 병목 묶음은 병목 API와 같은 내용(상위 10개)이다
    same = ok(client.get(f"{ctx['base']}/runs/{run['id']}/bottlenecks", params={"limit": 10}, headers=ctx["viewer"]))
    assert body["bottlenecks"] == same
    [machine] = body["top_assets"]
    assert machine["asset_id"] == ctx["equipment"] and Decimal(machine["utilization"]) == 1 and machine["code"]
    assert [s["node_key"] for s in body["top_spaces"]] == ["wait"] and body["top_spaces"][0]["node_label"]
    summary = body["summary"]
    assert summary[0].startswith("실행 결과: 끝까지 완료") and run["engine_version"] in summary[0]
    assert any(line.startswith(f"{product['product_code']}: 완료 ") for line in summary)
    assert same["headline"] in summary and any(line.startswith("고칠 곳 1:") for line in summary)
    assert any("가동률이 가장 높은 설비" in line and "100%" in line for line in summary)
    assert any("합산하지 않" in note for note in body["limitations"])
    assert not any("끝까지 실행된 결과가 아닙니다" in note for note in body["limitations"])
    assert ok(report(client, ctx, run["id"])) == body  # 같은 run이면 같은 리포트


def test_the_report_respects_project_permissions(client, ctx, run, world):
    assert report(client, ctx, run["id"], "outsider").status_code == 404
    other, _ = create_project(client, world)
    assert client.get(f"{API}/projects/{other}/runs/{run['id']}/report", headers=ctx["admin"]).status_code == 404
