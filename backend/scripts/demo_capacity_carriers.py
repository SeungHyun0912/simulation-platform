"""시연 프로젝트 `DEMO-WIRE-RUN`에 확정된 공간 용량과 운반 자원(지게차 3·AMR 2)을 넣고 다시 실행해 이전 실행과 비교한다.

사용자 확정(2026-10-28):
- 저장 공간 22곳의 용량(동시에 놓을 수 있는 보빈·롤 개수) — `CAPACITY`.
- 지게차 3대는 지게차 운반 경로들이, AMR 2대는 AMR 운반 경로들이 함께 쓴다. 한 번에 1제품, 이동 3분 + 상하차 1분.
- 운반 뒤 다음 명령이 없으면 목적지에서 기다린다. 다른 곳에서 일을 받으면 빈 차로 이동한다(시간은 이동과 같은 3분으로 가정).
- 그 밖의 공간 사이 이동은 사람이 시간 없이 옮긴다.
- 다음 공간이 가득 차면 설비는 산출을 쥐고 기다린다(설비별 OUT 정책이 없어 시나리오 가정 `out_release=hold`).

실행 중인 개발 API·worker를 쓴다. 기준정보는 API로만 바꾼다: 공간마다 자산 버전 승인, 운반 자원 설비 생성, 운반 단계가 있는
공정은 승인본을 복제해 운반 단계의 자원을 바꾼 뒤 승인, 시나리오는 새 초안 → 최신 승인으로 갱신 → 가정 → 승인 → 실행.
`DATABASE_URL`(개발 DB)과 `--yes`가 필요하다. production에서는 실행하지 않는다.
"""

import argparse
import os
import sys
import time
import uuid

import httpx
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

PROJECT_CODE, SCENARIO_CODE = "DEMO-WIRE-RUN", "S-MONTH-24"
CAPACITY = dict(zip([f"ST-{n:03d}" for n in range(1, 23)],
                    [150, 20, 1, 16, 48, 96, 204, 56, 48, 25, 90, 139, 108, 30, 40, 40, 24, 38, 120, 9, 1, 1], strict=True))
CARRIERS = {"지게차": [("FL-001", "지게차 1"), ("FL-002", "지게차 2"), ("FL-003", "지게차 3")],
            "AMR": [("AMR-001", "AMR 1"), ("AMR-002", "AMR 2")]}
EMPTY_MOVE_MIN = "3"
REASON = ("공간 용량은 2026-10-28 사용자 확정값. 단계 사이 직접 인계만 용량 제한 없이 가정하고, OUT 배출 정책이 없는 설비는 다음 공간이 "
          "가득 차면 산출을 쥐고 기다리며, 운반 자원은 다른 곳에서 일을 받으면 빈 차로 3분 이동하는 것으로 가정한다.")


class Api:
    def __init__(self, base: str, project: str, users: dict[str, str]) -> None:
        self.http, self.base, self.users = httpx.Client(timeout=120), f"{base.rstrip('/')}/api/v1/projects/{project}", users

    def call(self, method, path, who, body=None, etag=None, headers=None, expect=(200, 201, 202)):
        head = {"X-Debug-User": self.users[who], **(headers or {})}
        if etag is not None:
            head["If-Match"] = f'"{etag}"'
        response = self.http.request(method, f"{self.base}{path}", json=body, headers=head)
        if response.status_code not in expect:
            raise RuntimeError(f"{method} {path} -> {response.status_code}: {response.text[:1500]}")
        return response.json()["data"]

    def all(self, path, who="viewer", **params):
        rows, cursor = [], None
        while True:
            q = {"limit": 200, **params, **({"cursor": cursor} if cursor else {})}
            response = self.http.get(f"{self.base}{path}", params=q, headers={"X-Debug-User": self.users[who]})
            body = response.json()
            rows += body["data"]
            cursor = body["page"]["next_cursor"]
            if not cursor:
                return rows


def approve_revision(api: Api, asset_id: str, patch: dict) -> str:
    rev = api.call("POST", f"/assets/{asset_id}/revisions", "editor", expect=(201,))
    rev = api.call("PATCH", f"/asset-revisions/{rev['id']}", "editor", patch, etag=rev["row_version"])
    for action, who in (("submit", "editor"), ("approve", "admin")):
        rev = api.call("POST", f"/asset-revisions/{rev['id']}/{action}", who, etag=rev["row_version"])
    return rev["id"]


def apply_capacities(api: Api) -> None:
    assets = {a["code"]: a for a in api.all("/assets")}
    for code, capacity in CAPACITY.items():
        asset = assets[code]
        if asset.get("current_revision"):  # 이미 같은 용량으로 승인돼 있으면 다시 만들지 않는다(다시 실행해도 안전)
            current = api.call("GET", f"/asset-revisions/{asset['current_revision']['id']}", "viewer")["storage_capacity"]
            if current and current["mode"] == "finite" and str(int(float(current["value"]))) == str(capacity):
                continue
        approve_revision(api, asset["id"], {"storage_capacity": {"mode": "finite", "value": str(capacity), "unit": "item"}})
    print(f"  공간 {len(CAPACITY)}곳 용량 승인")


def ensure_carriers(api: Api) -> dict[str, list[str]]:
    assets = {a["code"]: a for a in api.all("/assets")}
    ids = {}
    for kind, items in CARRIERS.items():
        ids[kind] = []
        for code, name in items:
            if code not in assets:
                assets[code] = api.call("POST", "/assets", "admin", {
                    "kind": "equipment", "code": code, "name": name,
                    "notes": f"운반 자원({kind}). 2026-10-28 사용자 확정: 같은 종류의 운반 경로들이 함께 쓴다.",
                    "equipment": {"equipment_type": kind}}, expect=(201,))
            ids[kind].append(assets[code]["id"])
    print(f"  운반 자원: 지게차 {len(ids['지게차'])}대, AMR {len(ids['AMR'])}대")
    return ids


def carrier_kind(label: str) -> str | None:
    return "지게차" if "지게차" in label else "AMR" if "AMR" in label else None


def update_transport_processes(api: Api, carriers: dict[str, list[str]]) -> None:
    for item in api.all("/process-graphs", mode="full", limit=50):
        if item["version"] is None:
            continue
        transports = [n for n in item["graph"]["nodes"] if (n.get("step") or {}).get("operation_type") == "transport_manual"]
        if not transports:
            continue
        wanted = {n["node_key"]: carriers[carrier_kind(n["label"])] for n in transports if carrier_kind(n["label"])}
        have = {n["node_key"]: [c["asset_id"] for r in n["step"]["resources"] for c in r["candidates"]] for n in transports}
        if all(sorted(have[k]) == sorted(v) for k, v in wanted.items()):
            continue  # 이미 반영됨
        draft = api.call("POST", f"/products/{item['product_id']}/process-versions", "editor",
                         {"base_version_id": item["version"]["id"]}, expect=(201,))
        graph = api.call("GET", f"/process-versions/{draft['id']}/graph", "editor")
        row = graph["row_version"]
        for node in graph["nodes"]:
            if node["node_key"] in wanted:
                out = api.call("PATCH", f"/process-versions/{draft['id']}/steps/{node['id']}", "editor", {"resources": [{
                    "role_key": "carrier", "resource_kind": "equipment", "selection_mode": "one_of", "required_count": 1,
                    "capacity_mode": "finite", "allocation_rule": {"mode": "first_available"},
                    "candidates": [{"asset_id": a, "eligibility_status": "confirmed"} for a in wanted[node["node_key"]]]}]},
                    etag=row)
                row = out["row_version"]
        for action, who in (("submit", "editor"), ("approve", "admin")):
            row = api.call("POST", f"/process-versions/{draft['id']}/{action}", who, etag=row)["row_version"]
        print(f"  {item['product_code']}: 운반 단계 {sorted(wanted)}에 운반 자원 지정 → 공정 v{draft['version_no']} 승인")


def rerun(api: Api, timeout: float) -> tuple[dict, dict | None]:
    scenarios = {s["code"]: s for s in api.all("/scenarios")}
    scenario = scenarios[SCENARIO_CODE]
    previous = [r for r in api.all("/runs") if r["status"] not in ("queued", "running", "cancelled", "failed")]
    base = previous[0] if previous else None
    versions = api.all(f"/scenarios/{scenario['id']}/versions")
    draft = next((v for v in versions if v["status"] == "draft"), None)
    if draft is None:
        draft = api.call("POST", f"/scenarios/{scenario['id']}/versions", "editor", expect=(201,))
    draft = api.call("GET", f"/scenario-versions/{draft['id']}", "editor")
    refreshed = api.call("POST", f"/scenario-versions/{draft['id']}/refresh", "editor", {"assets": "latest"},
                         etag=draft["row_version"])
    changed = [c for c in refreshed["process_changes"] if c["status"] == "changed"]
    print(f"  시나리오 갱신: 공정 {len(changed)}개 변경({', '.join(c['product_code'] for c in changed)}), "
          f"자산 고정 {len(refreshed['asset_changes'])}건 변경")
    version = refreshed["version"]
    products = [{**p, "assumptions": {**p["assumptions"], "unbounded_buffers": True, "out_release": "hold",
                                      "carrier_empty_move_minutes": EMPTY_MOVE_MIN}} for p in version["products"]]
    version = api.call("PATCH", f"/scenario-versions/{version['id']}", "editor",
                       {"products": products, "assumption_reason": REASON}, etag=version["row_version"])
    check = api.call("POST", f"/scenario-versions/{version['id']}/validate", "viewer")
    print(f"  사전검증: runnable={check['runnable']} 오류 {check['error_count']} 경고 {check['warning_count']}")
    for product in check["products"]:
        for issue in product["compile_issues"]:
            print("   - 컴파일", issue["rule_id"], issue["message"][:140])
    version = api.call("POST", f"/scenario-versions/{version['id']}/approve", "admin", etag=version["row_version"])
    run = api.call("POST", "/runs", "editor", {"scenario_version_id": version["id"], "seed": 0},
                   headers={"Idempotency-Key": f"capacity-{uuid.uuid4().hex[:12]}"})
    started = time.monotonic()
    while run["status"] in ("queued", "running"):
        if time.monotonic() - started > timeout:
            raise TimeoutError(f"run {run['id']}이 끝나지 않았습니다(worker 확인)")
        time.sleep(3)
        run = api.call("GET", f"/runs/{run['id']}", "viewer")
    return run, base


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--yes", action="store_true")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--timeout", type=float, default=900)
    args = parser.parse_args(argv[1:])
    url = os.environ.get("DATABASE_URL", "")
    if not url or os.environ.get("APP_ENV") == "production" or not args.yes:
        print("개발 DB DATABASE_URL과 --yes가 필요합니다(production 불가).", file=sys.stderr)
        return 2
    print(f"대상 DB: {make_url(url).host}/{make_url(url).database}, API: {args.api}")
    with create_engine(url).connect() as c:
        project = c.execute(text("select id from project where code = :c"), {"c": PROJECT_CODE}).scalar()
    import seed_dev_data  # 개발 시드 사용자(관리자·편집자·조회자)

    roles = {name: str(seed_dev_data.dev_id(f"user:{name}")) for name in seed_dev_data.ROLES}
    api = Api(args.api, str(project), roles)
    print("공간 용량:")
    apply_capacities(api)
    print("운반 자원:")
    carriers = ensure_carriers(api)
    update_transport_processes(api, carriers)
    print("시나리오·실행:")
    run, base = rerun(api, args.timeout)
    result = run["result"]
    print(f"\n== run {run['id']}: {run['status']} ({run['termination_reason']}), 가상 종료 {result['end_time']['min']}분, "
          f"이벤트 {result['event_count']:,}건")
    for product in result["products"]:
        print(f"  {product['product_code']}: 완료 {product['completed_items']}개, 마지막 완료 "
              f"{None if product['last_completion'] is None else round(float(product['last_completion']['min']) / 1440, 1)}일")
    if base:
        compare = api.call("GET", f"/runs/{base['id']}/compare/{run['id']}", "viewer")
        print(f"\n== 비교(기준 {base['id']} → 새 {run['id']}), comparable={compare['comparable']}")
        print("  입력 차이:", [c["path"] for c in compare["input_changes"]][:30])
        for product in compare["products"]:
            m = {x["metric_key"]: x for x in product["metrics"]}
            last_a = product["base_last_completion"]["min"] if product["base_last_completion"] else None
            last_b = product["other_last_completion"]["min"] if product["other_last_completion"] else None
            print(f"  {product['product_code']}: 완료 {m['completed_items']['base']}→{m['completed_items']['other']}, "
                  f"리드타임 평균 {m['lead_time_avg_min']['base']}→{m['lead_time_avg_min']['other']}분, 마지막 완료 "
                  f"{None if last_a is None else round(float(last_a) / 1440, 1)}→{None if last_b is None else round(float(last_b) / 1440, 1)}일")
    bottlenecks = api.call("GET", f"/runs/{run['id']}/bottlenecks", "viewer", expect=(200,))
    print(f"\n== 병목: {bottlenecks['headline']}")
    for finding in bottlenecks["findings"][:10]:
        print(f"  #{finding['rank']} [{finding['kind']}/{finding['level']}] {finding['explanation'][:200]}")
    for note in bottlenecks["limitations"]:
        print("  한계:", note[:160])
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
