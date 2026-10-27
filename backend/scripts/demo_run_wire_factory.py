"""실제 공정 6종(P01~P06)을 API로 승인·실행해 결과 지표를 보여 주는 개발용 시연 스크립트.

DEMO-WIRE의 draft 공정은 건드리지 않는다: 같은 기준정보를 별도 프로젝트 `DEMO-WIRE-RUN`에 시드(멱등)하고 그 프로젝트에서
공정 6개 승인 → 시나리오 작성·승인 → 실행(`POST /runs`) → 결과 조회(`/runs/{id}`·`/metrics`)를 **실행 중인 개발 API와
worker**로 한다(`run_dev_api.ps1`, `run_dev_worker.ps1` 필요). 시나리오 값(입고 수량·가정)은 사용자 확정 기본값이며 바꿔 가며
반복할 시험값이다.

사용: DATABASE_URL(개발 DB)과 `--api http://127.0.0.1:8000`을 주고 `--yes`로 실행한다. production에서는 실행하지 않는다.
"""

import argparse
import json
import os
import sys
import time
import uuid
from pathlib import Path

import httpx
import seed_wire_factory
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

PROJECT_CODE = "DEMO-WIRE-RUN"
SCENARIO_CODE = "S-MONTH-24"
# 제품 순서 = 같은 시각 처리 순서(ST-001을 P01→P02→P03→P06이 이 순서로 공유한다, 사용자 확정)
ORDER = ["P01", "P02", "P03", "P06", "P04", "P05"]
RAW = {"P01": ("length_m", "3000"), "P02": ("length_m", "4000"), "P03": ("length_m", "5000"),
       "P06": ("length_m", "2000"), "P04": ("weight_kg", "2000"), "P05": ("weight_kg", "3300")}
COUNT = 24  # 월 1회 월초 24개(사용자 지정 기본값)
REASON = ("공간 용량은 자산 버전이 승인되기 전이라 무제한으로 가정한다(시연용 임시 가정, 실제 용량 확정 시 교체).")


class Api:
    def __init__(self, base: str, users: dict[str, str], project: str) -> None:
        self.http, self.base, self.users, self.project = httpx.Client(timeout=60), base.rstrip("/"), users, project

    def call(self, method: str, path: str, who: str, body=None, etag=None, headers=None, expect=(200, 201, 202)):
        head = {"X-Debug-User": self.users[who], **(headers or {})}
        if etag is not None:
            head["If-Match"] = f'"{etag}"'
        url = f"{self.base}/api/v1/projects/{self.project}{path}"
        response = self.http.request(method, url, json=body, headers=head)
        if response.status_code not in expect:
            raise RuntimeError(f"{method} {path} -> {response.status_code}: {response.text[:1500]}")
        return response.json()

    def data(self, *args, **kwargs):
        return self.call(*args, **kwargs)["data"]


def approve_processes(api: Api) -> dict[str, dict]:
    """제품마다 현재 draft 공정 버전을 제출·승인한다(이미 승인됐으면 그대로)."""
    products = {p["code"]: p for p in api.data("GET", "/products?limit=100", "admin")}
    chosen = {}
    for code in ORDER:
        version = api.data("GET", f"/process-versions/{products[code]['latest_process_version']['id']}", "admin")
        if version["status"] == "draft":
            version = api.data("POST", f"/process-versions/{version['id']}/submit", "editor", etag=version["row_version"])
            version = api.data("POST", f"/process-versions/{version['id']}/approve", "admin", etag=version["row_version"])
        chosen[code] = {"product_id": products[code]["id"], "version": version}
        print(f"  {code} 공정 v{version['version_no']} = {version['status']}")
    return chosen


def build_scenario(api: Api, chosen: dict[str, dict]) -> dict:
    scenarios = {s["code"]: s for s in api.data("GET", "/scenarios?limit=100", "admin")}
    scenario = scenarios.get(SCENARIO_CODE) or api.data("POST", "/scenarios", "editor", {
        "code": SCENARIO_CODE, "name": "한 달치 입고(24개) 6공정 동시 실행", "description": "시연용: 월초 24개 입고, 공간 용량 무제한 가정"})
    versions = api.data("GET", f"/scenarios/{scenario['id']}/versions", "admin")
    latest = versions[0]
    if latest["status"] == "approved":
        print(f"  시나리오 {SCENARIO_CODE} v{latest['version_no']}는 이미 승인됨")
        return latest
    products = [{"product_id": chosen[code]["product_id"], "process_version_id": chosen[code]["version"]["id"],
                 "priority": index + 1,
                 "arrivals": [{"at_min": "0", "count": COUNT, RAW[code][0]: RAW[code][1], "lot": f"{code}-MONTH"}],
                 "assumptions": {"unbounded_buffers": True}} for index, code in enumerate(ORDER)]
    full = api.data("GET", f"/scenario-versions/{latest['id']}", "editor")
    patched = api.data("PATCH", f"/scenario-versions/{latest['id']}", "editor", {
        "products": products, "stopping_rule": {"mode": "drain"}, "assumption_reason": REASON}, etag=full["row_version"])
    check = api.data("POST", f"/scenario-versions/{patched['id']}/validate", "viewer")
    print(f"  사전검증: runnable={check['runnable']} 오류 {check['error_count']} 경고 {check['warning_count']}")
    for issue in check["issues"]:
        print("   -", issue["severity"], issue["rule_id"], issue["message"][:100])
    for product in check["products"]:
        for issue in product.get("compile_issues", []):
            print("   - 컴파일", issue["rule_id"], issue["message"][:100])
    return api.data("POST", f"/scenario-versions/{patched['id']}/approve", "admin", etag=patched["row_version"])


def wait_for(api: Api, run_id: str, timeout: float) -> dict:
    started = time.monotonic()
    while time.monotonic() - started < timeout:
        run = api.data("GET", f"/runs/{run_id}", "viewer")
        if run["status"] not in ("queued", "running"):
            return run
        time.sleep(2)
    raise TimeoutError(f"run {run_id}이 {timeout:g}초 안에 끝나지 않았습니다(worker가 실행 중인지 확인).")


def paged(api: Api, path: str, params: str = "") -> list[dict]:
    rows, cursor = [], None
    while True:
        extra = f"&cursor={cursor}" if cursor else ""
        body = api.call("GET", f"{path}?limit=200{params}{extra}", "viewer")
        rows += body["data"]
        cursor = body["page"]["next_cursor"]
        if not cursor:
            return rows


def report(api: Api, run: dict, names: dict[str, str]) -> dict:
    result = run["result"]
    print(f"\n== run {run['id']}\n상태 {run['status']} ({run['termination_reason']}), 가상 종료 시각 {result['end_time']['min']}분 "
          f"= {float(result['end_time']['exact'].split('/')[0]) / float(result['end_time']['exact'].split('/')[1] if '/' in result['end_time']['exact'] else 1) / 1440:.1f}일, "
          f"이벤트 {result['event_count']:,}건")
    metrics = paged(api, f"/runs/{run['id']}/metrics", "&window=run")
    by_version = {}
    for row in metrics:
        if "process_version_id" in row["dimensions"]:
            by_version.setdefault(row["dimensions"]["process_version_id"], {})[row["metric_key"]] = row["value"]
    summary = {}
    for product in result["products"]:
        code = names[product["process_version_id"]]
        m = by_version[product["process_version_id"]]
        summary[code] = {k: m[k] for k in ("completed_items", "completed_length_m", "discarded_length_m", "throughput_items_per_day",
                                           "lead_time_avg_min", "lead_time_max_min", "wip_items")}
        print(f"  {code}: 완료 {m['completed_items']} 보빈 / {m['completed_length_m']} m, 폐기 {m['discarded_length_m']} m, "
              f"리드타임 평균 {m['lead_time_avg_min']}분, 남은 재공품 {m['wip_items']}")
    for item in result["shortfalls"]:
        print(f"  입력 부족: {names[item['process_version_id']]} {item['step']} {item['waiting']}/{item['needed']}")
    util = sorted(((r["dimensions"]["asset_key"], float(r["value"])) for r in metrics
                   if r["metric_key"] == "utilization" and r["value"] is not None), key=lambda x: -x[1])[:8]
    print("  가동률 상위 설비:", ", ".join(f"{a[:8]}…={v:.2f}" for a, v in util))
    return {"summary": summary, "utilization_top": util, "quality": metrics[0]["quality_status"] if metrics else None}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--yes", action="store_true", help="대상 DB를 확인했으며 실행한다")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--timeout", type=float, default=900)
    parser.add_argument("--out", type=Path, help="결과 요약을 JSON으로 저장할 경로")
    args = parser.parse_args(argv[1:])
    url = os.environ.get("DATABASE_URL", "")
    if not url or os.environ.get("APP_ENV") == "production":
        print("개발 DB의 DATABASE_URL이 필요하며 production에서는 실행할 수 없습니다.", file=sys.stderr)
        return 2
    print(f"대상 DB: {make_url(url).host}/{make_url(url).database}, API: {args.api}")
    if not args.yes:
        print("--yes를 붙여야 실행합니다.", file=sys.stderr)
        return 2
    seed_wire_factory.PROJECT_CODE = PROJECT_CODE  # DEMO-WIRE의 draft는 그대로 두고 별도 프로젝트에서 시연한다
    seeded = seed_wire_factory.seed(create_engine(url))
    api = Api(args.api, {k: str(v) for k, v in seeded["users"].items()}, str(seeded["project"]))
    print(f"project {PROJECT_CODE} = {seeded['project']}\n공정 승인:")
    chosen = approve_processes(api)
    print("시나리오:")
    version = build_scenario(api, chosen)
    key = f"demo-{uuid.uuid4().hex[:12]}"
    run = api.data("POST", "/runs", "editor", {"scenario_version_id": version["id"], "seed": 0},
                   headers={"Idempotency-Key": key})
    print(f"실행 요청: run {run['id']} ({run['status']}), 입력 해시 {run['input_hash'][:12]}…")
    run = wait_for(api, run["id"], args.timeout)
    names = {c["version"]["id"]: code for code, c in chosen.items()}
    out = report(api, run, names)
    if args.out:
        args.out.write_text(json.dumps({"run_id": run["id"], "status": run["status"], "reason": run["termination_reason"],
                                        "result": run["result"], **out}, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
