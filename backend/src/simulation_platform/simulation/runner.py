"""실행 입력 스냅샷(JSON dict) → 엔진 실행 → 요약(JSON dict). DB·HTTP·ORM을 모른다(ADR-0002 결정 2).

worker의 자식 프로세스가 이 함수만 부른다. 스냅샷은 실행을 요청하는 순간 서비스가 조립해 불변으로 저장한 것이며, 여기서는
현재 master 상태를 읽지 않는다. 요약은 작은 JSON이고, 이벤트·작업물·계보는 `on_batch`로 배치마다 넘긴다(메모리에 이벤트
전체를 모으지 않는다. CR be08b).
"""

from collections import Counter, defaultdict
from collections.abc import Callable
from dataclasses import replace
from fractions import Fraction

from simulation_platform.simulation import ENGINE_VERSION
from simulation_platform.simulation.compiler import ProcessSnapshot, compile_snapshot
from simulation_platform.simulation.compiler.assumptions import assumptions_from_scenario
from simulation_platform.simulation.metrics import MetricCollector
from simulation_platform.simulation.numbers import format_decimal, to_fraction
from simulation_platform.simulation.runtime import Arrival, Lane, run_models
from simulation_platform.simulation.travel import TravelModel, carrier_gaps

DEFAULT_EVENT_LIMIT = 2_000_000
BATCH_SIZE = 2000

# on_batch(kind, rows): kind = "events" | "items" | "relations" | "metrics", rows = JSON으로 바꿀 수 있는 dict 목록
BatchSink = Callable[[str, list[dict]], None]


def _minutes(value: Fraction) -> dict:
    return {"min": format_decimal(value), "exact": str(value)}


def compile_products(snapshot: dict):
    """제품마다 컴파일한다. 하나라도 막히면 (None, 이유 목록)을 돌려준다(실행 요청 때 한 번, worker가 한 번 더 한다)."""
    lanes, problems = [], []
    travel = TravelModel.from_snapshot(snapshot)
    for index, product in enumerate(snapshot["products"]):
        process = ProcessSnapshot.from_api(product["process_version"], product["graph"], snapshot.get("assets"))
        # 스냅샷에 든 공정 버전은 승인됐던(동결된) 버전이라 엔진의 승인 확인은 넘긴다.
        assumptions = replace(assumptions_from_scenario(product.get("assumptions")), travel=travel)
        result = compile_snapshot(process, assumptions, allow_unapproved=True)
        if not result.ok:
            problems.extend({"product_index": index, "rule_id": i.rule_id, "node_key": i.node_key, "message": i.message}
                            for i in result.issues)
            continue
        arrivals = tuple(Arrival(length_m=a.get("length_m"), weight_kg=a.get("weight_kg"), at=a["at_min"],
                                 count=a["count"], lot=a.get("lot")) for a in product["arrivals"])
        lanes.append(Lane(result.require_model(), arrivals))
    if travel is not None and not problems:  # 운반 자원은 제품을 가로질러 다니므로 모든 공간 조합의 빈 차 경로를 확인한다
        problems.extend({"product_index": None, "rule_id": "LAYOUT_PATH_UNREACHABLE", "node_key": None, "message": gap}
                        for gap in carrier_gaps([lane.model for lane in lanes], travel))
    return (None, problems) if problems else (lanes, [])


class _Tally:
    """이벤트가 지나가는 동안 요약에 필요한 값만 센다(이벤트 전체를 보관하지 않는다)."""

    def __init__(self) -> None:
        self.completed, self.sunk = Counter(), Counter()
        self.length = defaultdict(lambda: Fraction(0))
        self.discarded = defaultdict(lambda: Fraction(0))
        self.first, self.last = {}, {}
        self.terminated = None

    def observe(self, event) -> None:
        version = event.process_version_id
        if event.event_type == "MILESTONE_REACHED" and event.reason == "completion":
            self.completed[version] += 1
            self.length[version] += event.quantities.get("length_m", Fraction(0))
            self.first.setdefault(version, event.sim_time)
            self.last[version] = event.sim_time
        elif event.event_type == "SINK_REACHED":
            self.sunk[version] += 1
        elif event.event_type == "RESIDUAL_DISCARDED":
            self.discarded[version] += event.quantities.get("length_m", Fraction(0))
        elif event.event_type == "RUN_TERMINATED":
            self.terminated = event


def run_snapshot(snapshot: dict, on_batch: BatchSink | None = None) -> dict:
    """스냅샷을 실행하고 요약을 돌려준다. 입력이 컴파일되지 않으면 `failed / COMPILE_FAILED`와 이유를 담는다."""
    lanes, problems = compile_products(snapshot)
    if lanes is None:
        return {"state": "failed", "reason": "COMPILE_FAILED", "censored": False, "engine_version": ENGINE_VERSION,
                "compile_issues": problems, "products": [], "event_count": 0}
    rule = snapshot["scenario"]["stopping_rule"]
    horizon = to_fraction(rule["horizon_min"]) if rule["mode"] == "fixed_horizon" else None
    options = snapshot.get("engine_options") or {}
    tally, collector = _Tally(), MetricCollector()

    def sink(batch) -> None:
        for event in batch:
            tally.observe(event)
            collector.observe(event)
        if on_batch is not None:
            on_batch("events", [event.to_dict() for event in batch])

    result = run_models(lanes, horizon=horizon, seed=snapshot.get("seed", 0), travel=TravelModel.from_snapshot(snapshot),
                        event_limit=options.get("event_limit", DEFAULT_EVENT_LIMIT),
                        daily_snapshots=options.get("daily_snapshots", True), event_sink=sink,
                        retain_events=False, batch_size=BATCH_SIZE)
    if on_batch is not None:
        metrics = collector.finish(result.end_time, result.state)
        for kind, rows in (("items", item_rows(result)), ("relations", relation_rows(result)), ("metrics", metrics)):
            for start in range(0, len(rows), BATCH_SIZE):
                on_batch(kind, rows[start:start + BATCH_SIZE])
    return summarize(snapshot, result, tally)


def _amount(value: Fraction | None) -> str | None:
    return None if value is None else format_decimal(value)


def item_rows(result) -> list[dict]:
    return [{"item_key": i.key, "parent_key": i.parent_key, "process_version_id": i.process_version_id,
             "lot_key": i.lot, "state_code": i.state, "form": i.form, "length_m": _amount(i.length_m),
             "weight_kg": _amount(i.weight_kg), "location_key": i.location, "status": i.status,
             "created_at_min": _minutes(i.created_at)} for i in result.items]


def relation_rows(result) -> list[dict]:
    """작업(operation)마다 부모→자식 쌍으로 펼친다. 자식이 없으면(전부 잔량·폐기) 자식 없는 행 하나를 남긴다.
    길이 보존 값(잔량·이월·균형)은 작업 단위 값이라 그 작업의 모든 행에 같은 값이 들어간다."""
    rows = []
    for record in result.lineage:
        parents = record.parent_keys or (record.parent_key,)
        children = record.child_keys or (None,)
        lengths = dict(zip(record.child_keys, record.child_lengths_m, strict=True))
        for parent in parents:
            for child in children:
                rows.append({
                    "seq": len(rows) + 1, "operation_key": record.operation_id, "step_key": record.step_key,
                    "relation_type": record.relation, "accounting_mode": record.accounting_mode,
                    "process_version_id": record.process_version_id, "parent_key": parent, "child_key": child,
                    "parent_length_m": _amount(record.parent_length_m),
                    "child_length_m": None if child is None else _amount(lengths[child]),
                    "residual_length_m": _amount(record.residual_length_m),
                    "carried_in_m": _amount(record.carried_in_m), "balanced": record.balanced})
    return rows


def summarize(snapshot: dict, result, tally: _Tally) -> dict:
    by_version = {p["process_version"]["id"]: p for p in snapshot["products"]}
    terminated = tally.terminated
    summary = {
        "state": result.state, "reason": result.reason, "censored": result.censored,
        "end_time": _minutes(result.end_time),
        "horizon": None if result.horizon is None else _minutes(result.horizon),
        "event_count": result.event_count, "engine_version": result.engine_version, "seed": result.seed,
        "products": [{
            "product_id": by_version[v]["product_id"], "process_version_id": v,
            "product_code": (by_version[v].get("product") or {}).get("code"),
            "product_name": (by_version[v].get("product") or {}).get("name"),
            "completed_items": tally.completed[v], "completed_length_m": format_decimal(tally.length[v]),
            "reached_sink": tally.sunk[v], "discarded_length_m": format_decimal(tally.discarded[v]),
            "first_completion": None if v not in tally.first else _minutes(tally.first[v]),
            "last_completion": None if v not in tally.last else _minutes(tally.last[v]),
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
