"""실행 입력 스냅샷(JSON dict) → 엔진 실행 → 요약(JSON dict). DB·HTTP·ORM을 모른다(ADR-0002 결정 2).

worker의 자식 프로세스가 이 함수만 부른다. 스냅샷은 실행을 요청하는 순간 서비스가 조립해 불변으로 저장한 것이며, 여기서는
현재 master 상태를 읽지 않는다. 요약은 작은 JSON이다(이벤트 전체 저장은 CR be08b).
"""

from collections import Counter, defaultdict
from fractions import Fraction

from simulation_platform.simulation import ENGINE_VERSION
from simulation_platform.simulation.compiler import ProcessSnapshot, compile_snapshot
from simulation_platform.simulation.compiler.assumptions import assumptions_from_scenario
from simulation_platform.simulation.numbers import format_decimal, to_fraction
from simulation_platform.simulation.runtime import Arrival, Lane, run_models

DEFAULT_EVENT_LIMIT = 2_000_000


def _minutes(value: Fraction) -> dict:
    return {"min": format_decimal(value), "exact": str(value)}


def compile_products(snapshot: dict):
    """제품마다 컴파일한다. 하나라도 막히면 (None, 이유 목록)을 돌려준다(실행 요청 때 한 번, worker가 한 번 더 한다)."""
    lanes, problems = [], []
    for index, product in enumerate(snapshot["products"]):
        process = ProcessSnapshot.from_api(product["process_version"], product["graph"], snapshot.get("assets"))
        # 스냅샷에 든 공정 버전은 승인됐던(동결된) 버전이라 엔진의 승인 확인은 넘긴다.
        result = compile_snapshot(process, assumptions_from_scenario(product.get("assumptions")), allow_unapproved=True)
        if not result.ok:
            problems.extend({"product_index": index, "rule_id": i.rule_id, "node_key": i.node_key, "message": i.message}
                            for i in result.issues)
            continue
        arrivals = tuple(Arrival(length_m=a.get("length_m"), weight_kg=a.get("weight_kg"), at=a["at_min"],
                                 count=a["count"], lot=a.get("lot")) for a in product["arrivals"])
        lanes.append(Lane(result.require_model(), arrivals))
    return (None, problems) if problems else (lanes, [])


def run_snapshot(snapshot: dict) -> dict:
    """스냅샷을 실행하고 요약을 돌려준다. 입력이 컴파일되지 않으면 `failed / COMPILE_FAILED`와 이유를 담는다."""
    lanes, problems = compile_products(snapshot)
    if lanes is None:
        return {"state": "failed", "reason": "COMPILE_FAILED", "censored": False, "engine_version": ENGINE_VERSION,
                "compile_issues": problems, "products": [], "event_count": 0}
    rule = snapshot["scenario"]["stopping_rule"]
    horizon = to_fraction(rule["horizon_min"]) if rule["mode"] == "fixed_horizon" else None
    options = snapshot.get("engine_options") or {}
    result = run_models(lanes, horizon=horizon, seed=snapshot.get("seed", 0),
                        event_limit=options.get("event_limit", DEFAULT_EVENT_LIMIT))
    return summarize(snapshot, result)


def summarize(snapshot: dict, result) -> dict:
    by_version = {p["process_version"]["id"]: p for p in snapshot["products"]}
    completed, length, first, last = Counter(), defaultdict(lambda: Fraction(0)), {}, {}
    sunk = Counter()
    for event in result.events:
        version = event.process_version_id
        if event.event_type == "MILESTONE_REACHED" and event.reason == "completion":
            completed[version] += 1
            length[version] += event.quantities.get("length_m", Fraction(0))
            first.setdefault(version, event.sim_time)
            last[version] = event.sim_time
        elif event.event_type == "SINK_REACHED":
            sunk[version] += 1
    discarded = defaultdict(lambda: Fraction(0))
    for event in result.events:
        if event.event_type == "RESIDUAL_DISCARDED":
            discarded[event.process_version_id] += event.quantities.get("length_m", Fraction(0))
    terminated = next((e for e in reversed(result.events) if e.event_type == "RUN_TERMINATED"), None)
    summary = {
        "state": result.state, "reason": result.reason, "censored": result.censored,
        "end_time": _minutes(result.end_time),
        "horizon": None if result.horizon is None else _minutes(result.horizon),
        "event_count": len(result.events), "engine_version": result.engine_version, "seed": result.seed,
        "products": [{
            "product_id": by_version[v]["product_id"], "process_version_id": v,
            "completed_items": completed[v], "completed_length_m": format_decimal(length[v]),
            "reached_sink": sunk[v], "discarded_length_m": format_decimal(discarded[v]),
            "first_completion": None if v not in first else _minutes(first[v]),
            "last_completion": None if v not in last else _minutes(last[v]),
        } for v in result.process_version_ids],
        "assumptions": [{"code": a.code, "node_key": a.node_key, "message": a.message} for a in result.assumptions],
        "shortfalls": list(result.shortfalls),
        "residuals": [{**r, "length_m": format_decimal(r["length_m"])} for r in result.residuals],
        "wip_items": sum(1 for i in result.items if i.status == "active"),
    }
    if result.state == "failed" and terminated is not None:
        summary["failure"] = {"reason": result.reason, "step_key": terminated.step_key,
                              "message": terminated.quantities.get("message")}
    return summary
