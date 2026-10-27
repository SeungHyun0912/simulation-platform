"""병목 요약(CR be10): 실행 지표에서 "멈춰 있는 곳"을 찾아 종류·위치·근거와 함께 순위를 매긴다. DB·HTTP를 모른다.

사용자가 정한 기준(2026-10-27): 병목은 아래 셋으로 **멈춰 있는** 곳이다.
1. `space_full`: 다음 저장 공간으로의 이동이 여유 공간 부족으로 멈춤(공간 대기·출력 막힘).
2. `equipment_busy`: 다음 생산 설비로의 이동이 그 설비의 가동으로 멈춤(입력을 확보한 뒤 설비를 배정받기까지 대기).
3. `queue_pileup`: AMR·지게차는 한 번에 1제품을 옮기므로 대기 중인 자재가 여러 개 쌓여 있는 곳.

멈춘 양은 작업물·분(item-min)으로 잰다. 종류가 다르면 겹치는 시간이 있어(대기 공간에 쌓인 시간에 설비 대기가 들어 있음)
합산하지 않고 종류 안에서 비율(`share`)로 level을 정한다. 기준값은 임시 휴리스틱이며 응답의 `thresholds`로 드러낸다.
"""

from collections.abc import Mapping
from decimal import Decimal

DEFINITION_VERSION = "1"
THRESHOLDS = {"pileup_min_peak_items": 3, "level_high_share": Decimal("0.30"), "level_medium_share": Decimal("0.10"),
              "min_stalled_item_min": Decimal(60)}  # 멈춘 양이 작업물·1시간 미만이면 비율이 커도 low
KINDS = ("space_full", "equipment_busy", "queue_pileup")
LEVEL_ORDER = {"high": 0, "medium": 1, "low": 2}
ZERO = Decimal(0)


def _num(values: Mapping, key: str) -> Decimal:
    value = values.get(key)
    return ZERO if value is None else Decimal(value)


def _fmt(value: Decimal, places: int = 1) -> str:
    return f"{value:,.{places}f}"


def _level(share: Decimal) -> str:
    if share >= THRESHOLDS["level_high_share"]:
        return "high"
    return "medium" if share >= THRESHOLDS["level_medium_share"] else "low"


def _product_text(graph: dict | None, pv: str) -> str:
    product = (graph or {}).get("product") or {}
    return product.get("code") or product.get("name") or f"공정 버전 {pv[:8]}"


def _node(graphs: Mapping[str, dict], pv: str | None, key: str) -> dict:
    """노드 정보. 공정 버전을 모르면(대기 공간 지표는 노드 key만 가진다) 그 key를 가진 첫 그래프를 쓴다."""
    for version in ([pv] if pv in graphs else []) + [v for v in graphs if v != pv]:
        node = graphs[version]["nodes"].get(key)
        if node is not None:
            return {"process_version_id": version, **node}
    return {"process_version_id": pv, "label": key, "kind": None, "operation_type": None, "assets": [], "next": []}


def analyze(*, steps: Mapping[tuple[str, str], Mapping], nodes: Mapping[str, Mapping], assets: Mapping[str, Mapping],
            graphs: Mapping[str, dict], asset_names: Mapping[str, dict], observed_min: Decimal,
            assumption_codes: set[str]) -> dict:
    """지표 값(전체 구간)으로 병목 후보를 만든다. 반환: findings(순위 포함)·limitations·thresholds·headline."""
    raw: list[dict] = []

    # --- 2. 설비 가동으로 멈춤: 단계별 설비 대기 ---------------------------------------------------------------
    for (pv, step_key), m in steps.items():
        stalled = _num(m, "step_equipment_wait_item_min")
        if stalled <= 0:
            continue
        info = _node(graphs, pv, step_key)
        used = [{"asset_id": a, **asset_names.get(a, {}), "utilization": _num(assets.get(a, {}), "utilization"),
                 "processing_time_min": _num(assets.get(a, {}), "processing_time_min")}
                for a in info["assets"] if a in assets]
        used.sort(key=lambda a: -a["utilization"])
        product = _product_text(graphs.get(pv), pv)
        avg, peak = _num(m, "step_equipment_wait_avg_min"), _num(m, "step_equipment_wait_max_min")
        best = used[0] if used else None
        text = (f"{product} · {info['label']}: 설비가 가동 중이라 작업물이 평균 {_fmt(avg)}분(최대 {_fmt(peak)}분) 기다렸습니다"
                f"(총 {_fmt(stalled)}작업물·분)")
        if best is not None:
            text += f". 후보 설비 중 가동률이 가장 높은 설비는 {best.get('code', best['asset_id'][:8])} {_fmt(best['utilization'] * 100)}%입니다"
        raw.append({
            "kind": "equipment_busy", "stalled": stalled, "explanation": text + ".",
            "location": {"process_version_id": pv, "step_key": step_key, "step_label": info["label"]},
            "evidence": {"equipment_wait_avg_min": avg, "equipment_wait_max_min": peak,
                         "operations": _num(m, "step_operations"), "processing_time_min": _num(m, "step_processing_time_min"),
                         "input_wait_item_min": _num(m, "step_input_wait_item_min"), "assets": used}})

    # --- 1. 공간 부족으로 멈춤: 다음 공간 자리 대기, 출력 막힘 ---------------------------------------------------
    for node_key, m in nodes.items():
        stalled = _num(m, "space_wait_item_min")
        if stalled <= 0:
            continue
        info = _node(graphs, None, node_key)
        text = (f"{info['label']}: 다음 공간에 자리가 없어 작업물이 최대 {_fmt(_num(m, 'space_wait_max_min'))}분 기다렸습니다"
                f"(총 {_fmt(stalled)}작업물·분)")
        raw.append({"kind": "space_full", "stalled": stalled, "explanation": text + ".",
                    "location": {"node_key": node_key, "node_label": info["label"]},
                    "evidence": {"source": "space_wait", "space_wait_max_min": _num(m, "space_wait_max_min"),
                                 "peak_items": _num(m, "buffer_peak_items")}})
    for (pv, step_key), m in steps.items():
        stalled = _num(m, "step_blocked_item_min")
        if stalled <= 0:
            continue
        info = _node(graphs, pv, step_key)
        text = (f"{_product_text(graphs.get(pv), pv)} · {info['label']}: 산출을 내보낼 다음 공간이 가득 차 출력이 막혔습니다"
                f"(총 {_fmt(stalled)}작업물·분)")
        raw.append({"kind": "space_full", "stalled": stalled, "explanation": text + ".",
                    "location": {"process_version_id": pv, "step_key": step_key, "step_label": info["label"]},
                    "evidence": {"source": "output_blocked"}})

    # --- 3. 적체: 대기 자재가 여러 개 쌓임(운반이 1제품씩이라는 사용자 기준) ----------------------------------------
    for node_key, m in nodes.items():
        peak = _num(m, "buffer_peak_items")
        if peak < THRESHOLDS["pileup_min_peak_items"]:
            continue
        info = _node(graphs, None, node_key)
        transport = [n for n in info["next"] if (graphs[info["process_version_id"]]["nodes"].get(n) or {}).get("operation_type")
                     == "transport_manual"] if info["process_version_id"] in graphs else []
        carriers = []
        for n in transport:
            sm = steps.get((info["process_version_id"], n), {})
            carriers.append({"step_key": n, "step_label": graphs[info["process_version_id"]]["nodes"][n]["label"],
                             "peak_concurrent_trips": _num(sm, "step_peak_concurrency"),
                             "average_concurrent_trips": (_num(sm, "step_processing_time_min") / observed_min
                                                          if observed_min > 0 else None)})
        text = f"{info['label']}: 대기 자재가 최대 {_fmt(peak, 0)}개 쌓였습니다(평균 대기 {_fmt(_num(m, 'buffer_wait_avg_min'))}분)"
        if carriers:
            text += "; 다음 운반 " + ", ".join(
                f"{c['step_label']}이(가) 동시에 최대 {_fmt(c['peak_concurrent_trips'], 0)}건 필요" for c in carriers)
        raw.append({"kind": "queue_pileup", "stalled": _num(m, "buffer_item_min"), "explanation": text + ".",
                    "location": {"node_key": node_key, "node_label": info["label"]},
                    "evidence": {"peak_items": peak, "average_items": _num(m, "buffer_occupancy_avg_items"),
                                 "wait_avg_min": m.get("buffer_wait_avg_min"), "wait_max_min": m.get("buffer_wait_max_min"),
                                 "transport_related": bool(carriers), "carriers": carriers}})

    findings = _rank(raw)
    return {"findings": findings, "thresholds": {k: str(v) for k, v in THRESHOLDS.items()},
            "limitations": _limitations(assumption_codes, findings, nodes),
            "headline": _headline(findings)}


def _rank(raw: list[dict]) -> list[dict]:
    for kind in KINDS:
        group = sorted((f for f in raw if f["kind"] == kind), key=lambda f: -f["stalled"])
        total = sum((f["stalled"] for f in group), ZERO)
        for index, finding in enumerate(group, start=1):
            finding["rank_in_kind"] = index
            finding["share"] = finding["stalled"] / total if total > 0 else ZERO
            finding["level"] = ("low" if finding["stalled"] < THRESHOLDS["min_stalled_item_min"]
                                else _level(finding["share"]))
    ordered = sorted(raw, key=lambda f: (LEVEL_ORDER[f["level"]], KINDS.index(f["kind"]), -f["stalled"]))
    for index, finding in enumerate(ordered, start=1):
        finding["rank"] = index
    return ordered


def _limitations(assumption_codes: set[str], findings: list[dict], nodes: Mapping) -> list[str]:
    notes = []
    if "UNBOUNDED_BUFFERS" in assumption_codes:
        notes.append("대기 공간 용량을 무제한으로 가정한 실행이라 공간 부족(space_full)으로 멈춘 곳은 평가되지 않습니다. "
                     "공간 용량을 확정한 뒤 다시 실행해야 합니다.")
    notes.append("지게차·AMR 같은 운반 자원은 엔진이 대수를 모델링하지 않습니다(운반 자원 무제한 가정). 운반 병목은 "
                 "대기 자재의 적체와 운반 단계의 동시 운반 수(필요한 대수)로만 추정합니다. 동시 운반 수는 공정 단계별 값이라 "
                 "같은 지게차·AMR을 여러 공정이 쓰면 합쳐서 봐야 합니다.")
    notes.append("가동 달력이 없어 24시간 연속 기준이며, 멈춘 양은 작업물·분이고 종류가 다르면 겹치므로 합산하지 않습니다.")
    if not findings:
        notes.append("멈춘 곳이 관측되지 않았습니다.")
    return notes


def _headline(findings: list[dict]) -> str:
    if not findings:
        return "병목으로 판단할 정체가 관측되지 않았습니다."
    top = findings[0]
    return f"가장 큰 정체: {top['explanation']}"
