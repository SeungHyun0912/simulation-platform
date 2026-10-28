"""병목 요약(CR be10): 실행 지표에서 "멈춰 있는 곳"을 찾아 종류·위치·근거와 함께 순위를 매긴다. DB·HTTP를 모른다.

사용자가 정한 기준(2026-10-27): 병목은 아래 셋으로 **멈춰 있는** 곳이다.
1. `space_full`: 다음 저장 공간으로의 이동이 여유 공간 부족으로 멈춤(공간 대기·출력 막힘).
2. `equipment_busy`: 다음 생산 설비로의 이동이 그 설비의 가동으로 멈춤(입력을 확보한 뒤 설비를 배정받기까지 대기).
3. `queue_pileup`: AMR·지게차는 한 번에 1제품을 옮기므로 대기 중인 자재가 여러 개 쌓여 있는 곳.

멈춘 양은 작업물·분(item-min)으로 잰다. 종류가 다르면 겹치는 시간이 있어(대기 공간에 쌓인 시간에 설비 대기가 들어 있음)
합산하지 않고 종류 안에서 비율(`share`)로 level을 정한다. 기준값은 임시 휴리스틱이며 응답의 `thresholds`로 드러낸다.

원인 추적(CR be17, 2026-10-28): 하류 설비가 느리면 막힘이 상류로 번져 상류가 "멈춘 곳" 1위가 된다. 그래서 후보마다 막힘을 하류로
따라가 **막히지 않은 단계**(흐름을 제한하는 근본 원인)를 찾아 `root_cause`·`chain`으로 붙이고, 근본 원인별로 묶는다(규칙, LLM 없음).
"""

from collections.abc import Mapping
from decimal import Decimal

DEFINITION_VERSION = "3"  # 2: 원인 추적(root_cause·chain·root_causes) 추가, 3: root_causes 순위 = 묶인 후보의 최고 순위
MAX_TRACE = 20
THRESHOLDS = {"pileup_min_peak_items": 3, "level_high_share": Decimal("0.30"), "level_medium_share": Decimal("0.10"),
              "min_stalled_item_min": Decimal(60),
              "root_low_utilization": Decimal("0.5")}  # 멈춘 양이 작업물·1시간 미만이면 비율이 커도 low
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
    for finding in findings:
        chain, root = _trace(_start(finding), steps, graphs, assets, asset_names)
        finding["chain"], finding["root_cause"] = chain, root
        if root is not None:
            root["explanation"] = _root_text(chain, root)
    roots = _root_causes(findings)
    return {"findings": findings, "thresholds": {k: str(v) for k, v in THRESHOLDS.items()},
            "limitations": _limitations(assumption_codes, findings, nodes),
            "headline": _headline(findings), "root_causes": roots}


# --- 원인 추적 ------------------------------------------------------------------------------------------
def _start(finding: dict) -> tuple[str, str | None, str]:
    loc = finding["location"]
    if "step_key" in loc:  # 설비 대기·출력 막힘: 그 단계에서
        return "step", loc["process_version_id"], loc["step_key"]
    return "space", None, loc["node_key"]  # 공간 대기·적체: 그 공간에서


def _blocked(steps: Mapping, pv: str, key: str) -> bool:
    return _num(steps.get((pv, key), {}), "step_blocked_item_min") >= THRESHOLDS["min_stalled_item_min"]


def _trace(start, steps, graphs, assets, asset_names) -> tuple[list[dict], dict | None]:
    """막힌 곳에서 하류로 따라간다. 막힌 단계 → 다음 위치, 공간 → 꺼내 가는 단계 중 더 막힌(없으면 더 오래 일한) 단계.
    공간은 여러 제품이 함께 쓰므로 그 공간을 가진 모든 공정의 소비 단계에서 고른다(같은 값이면 실행 입력 순서).
    막히지 않은 단계에 닿으면 근본 원인이다. 같은 곳을 다시 지나거나 너무 길면 판정 불가(None)."""
    chain: list[dict] = []
    seen: set[tuple] = set()
    kind, pv, key = start
    for _ in range(MAX_TRACE):
        info = _node(graphs, pv, key)
        pv = info["process_version_id"]
        mark = (kind, pv if kind == "step" else None, key)  # 공간은 제품과 무관하게 하나
        if mark in seen or pv not in graphs:
            return chain, None
        seen.add(mark)
        chain.append({"kind": kind, "process_version_id": pv, "key": key, "label": info["label"]})
        nodes = graphs[pv]["nodes"]
        if kind == "step":
            if not _blocked(steps, pv, key):
                return chain, _root(pv, key, info, graphs, assets, asset_names, steps)
            following = [n for n in info["next"] if (nodes.get(n) or {}).get("kind") in ("operation", "buffer")]
            if not following:
                return chain, None
            key = following[0]
            kind = "step" if nodes[key]["kind"] == "operation" else "space"
        else:
            consumers = [(v, n) for v, graph in graphs.items() if key in graph["nodes"]
                         for n in graph["nodes"][key]["next"] if (graph["nodes"].get(n) or {}).get("kind") == "operation"]
            if not consumers:
                return chain, None
            pv, key = max(consumers, key=lambda vc: (_num(steps.get(vc, {}), "step_blocked_item_min"),
                                                     _num(steps.get(vc, {}), "step_processing_time_min")))
            kind = "step"
    return chain, None


def _root(pv: str, key: str, info: dict, graphs, assets, asset_names, steps) -> dict:
    used = sorted(({"asset_id": a, **asset_names.get(a, {}), "utilization": _num(assets.get(a, {}), "utilization")}
                   for a in info["assets"] if a in assets), key=lambda a: -a["utilization"])
    product = (graphs.get(pv) or {}).get("product") or {}
    return {"process_version_id": pv, "product_code": product.get("code"), "step_key": key, "step_label": info["label"],
            "utilization": used[0]["utilization"] if used else None, "assets": used[:3],
            "input_wait_item_min": steps.get((pv, key), {}).get("step_input_wait_item_min")}


def _root_note(root: dict) -> str:
    """가동률이 낮은 근본 원인은 설비 속도보다 투입 조건(묶음 투입·입력 대기)이 흐름을 막았을 수 있다."""
    if root["utilization"] is None or root["utilization"] >= THRESHOLDS["root_low_utilization"]:
        return ""
    wait = root.get("input_wait_item_min")
    detail = f"(입력 대기 {_fmt(wait)}작업물·분)" if wait else ""
    return f" 다만 가동률이 낮아 설비 속도보다 투입 조건{detail}을 먼저 확인하세요."


def _root_name(root: dict) -> str:
    who = f"{root['product_code'] or '공정 ' + root['process_version_id'][:8]} · {root['step_label']}"
    if root["assets"]:
        best = root["assets"][0]
        who += f"({best.get('code', best['asset_id'][:8])} 가동률 {_fmt(best['utilization'] * 100)}%)"
    return who


def _root_text(chain: list[dict], root: dict) -> str:
    if len(chain) == 1:
        return f"이 단계가 흐름을 제한합니다: {_root_name(root)}.{_root_note(root)}"
    path = " → ".join(c["label"] for c in chain)
    return f"막힘이 {path} 순서로 번졌고, 근본 원인은 {_root_name(root)}입니다.{_root_note(root)}"


def _root_causes(findings: list[dict]) -> list[dict]:
    """근본 원인별로 후보를 묶는다. 순위: 묶인 후보 중 가장 높은 전체 순위(정의 버전 3). 그래서 1위 묶음은 늘 병목 1위
    후보의 근본 원인이고 headline과 같다. 묶인 후보 수로 매기면 낮음이 많은 묶음이 높음이 있는 묶음을 앞지른다(정의 버전 2의 결함)."""
    groups: dict[tuple, dict] = {}
    for finding in findings:
        root = finding["root_cause"]
        if root is None:
            continue
        group = groups.setdefault((root["process_version_id"], root["step_key"]), {
            **{k: root[k] for k in ("process_version_id", "product_code", "step_key", "step_label", "utilization", "assets",
                                    "input_wait_item_min")},
            "findings": 0, "levels": {"high": 0, "medium": 0, "low": 0}, "stalled_item_min": ZERO, "finding_ranks": []})
        group["findings"] += 1
        group["levels"][finding["level"]] += 1
        group["stalled_item_min"] += finding["stalled"]
        group["finding_ranks"].append(finding["rank"])
    ordered = sorted(groups.values(), key=lambda g: min(g["finding_ranks"]))
    for index, group in enumerate(ordered, start=1):
        group["rank"] = index
        group["explanation"] = (f"{_root_name(group)}: 병목 후보 {group['findings']}건(높음 {group['levels']['high']}·"
                                f"중간 {group['levels']['medium']}·낮음 {group['levels']['low']})의 근본 원인입니다.{_root_note(group)}")
    return ordered


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
    if "CARRIER_EMPTY_MOVE" in assumption_codes:
        notes.append("운반 자원(지게차·AMR)은 지정된 대수와 위치로 계산했습니다(다음 명령이 없으면 목적지에서 기다리고, 다른 곳의 일은 "
                     "빈 차 이동 시간을 시나리오 가정으로 더함). 운반 자원이 지정되지 않은 운반 단계는 무제한입니다. 운반을 기다린 "
                     "시간은 운반 단계의 설비 대기(equipment_busy)로 나타납니다.")
    else:
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
    text = f"가장 큰 정체: {top['explanation']}"
    root = top.get("root_cause")
    if root is not None and len(top.get("chain") or []) > 1:
        text += f" 근본 원인: {_root_name(root)}."
    return text
