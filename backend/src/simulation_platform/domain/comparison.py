"""두 실행의 비교(CR be12): 입력 스냅샷 차이와 지표 맞추기. DB·HTTP를 모른다.

실행 결과·입력 스냅샷은 불변이고 엔진은 결정적이라(같은 입력이면 같은 결과) 결과 차이는 입력 차이에서 온다.
지표 차원의 `process_version_id`는 공정 버전이 바뀌면 달라지므로, 같은 제품이면 맞도록 제품 id로 바꿔 짝을 짓는다.
"""

from collections.abc import Mapping
from decimal import Decimal


def product_index(snapshot: dict) -> dict[str, dict]:
    """제품 id → {code, name, process_version_id, order, arrivals, assumptions}."""
    out = {}
    for order, product in enumerate(snapshot["products"]):
        meta = product.get("product") or {}
        out[product["product_id"]] = {"code": meta.get("code"), "name": meta.get("name"),
                                      "process_version_id": product["process_version"]["id"], "order": order,
                                      "arrivals": product["arrivals"], "assumptions": product["assumptions"]}
    return out


def _change(path: str, base, other, note: str | None = None) -> dict:
    return {"path": path, "base": base, "other": other, "note": note}


def input_changes(base: dict, other: dict, codes: Mapping[str, str | None] | None = None) -> list[dict]:
    """입력 스냅샷의 차이. 제품은 제품 id로, 자산은 자산 id로 맞춘다. 같은 값이면 나오지 않는다."""
    codes = codes or {}
    changes = []
    for path, getter in (("seed", lambda s: s.get("seed")), ("replicate_index", lambda s: s.get("replicate_index")),
                         ("engine.version", lambda s: s["engine"]["version"]),
                         ("engine_options.event_limit", lambda s: (s.get("engine_options") or {}).get("event_limit")),
                         ("scenario.scenario_version_id", lambda s: s["scenario"]["scenario_version_id"]),
                         ("scenario.stopping_rule", lambda s: s["scenario"]["stopping_rule"]),
                         ("scenario.assumption_reason", lambda s: s["scenario"].get("assumption_reason"))):
        a, b = getter(base), getter(other)
        if a != b:
            changes.append(_change(path, a, b))
    left, right = product_index(base), product_index(other)

    def label(product_id: str) -> str:
        return (left.get(product_id) or right.get(product_id) or {}).get("code") or codes.get(product_id) or product_id

    for product_id in sorted(set(left) | set(right), key=label):
        a, b = left.get(product_id), right.get(product_id)
        name = f"products.{label(product_id)}"
        if a is None or b is None:
            changes.append(_change(name, None if a is None else "있음", None if b is None else "있음",
                                   "한쪽 실행에만 있는 제품이라 결과 비교에서 빠진다"))
            continue
        if a["process_version_id"] != b["process_version_id"]:
            changes.append(_change(f"{name}.process_version_id", a["process_version_id"], b["process_version_id"],
                                   "공정 내용 차이는 GET /process-versions/{v}/diff?against= 로 본다"))
        for key in ("arrivals", "assumptions"):
            if a[key] != b[key]:
                changes.append(_change(f"{name}.{key}", a[key], b[key]))
    order_a = [p for p, _ in sorted(left.items(), key=lambda kv: kv[1]["order"]) if p in right]
    order_b = [p for p, _ in sorted(right.items(), key=lambda kv: kv[1]["order"]) if p in left]
    if order_a != order_b:
        changes.append(_change("products.order", [label(p) for p in order_a], [label(p) for p in order_b],
                               "같은 시각의 처리 순서가 다르다"))
    assets_a, assets_b = base.get("assets") or {}, other.get("assets") or {}
    for asset in sorted(set(assets_a) | set(assets_b)):
        if assets_a.get(asset) != assets_b.get(asset):
            changes.append(_change(f"assets.{asset}", assets_a.get(asset), assets_b.get(asset),
                                   "고정한 자산 버전의 엔진 입력(용량·배출 규칙)이 다르다"))
    return changes


def warnings(base: dict, other: dict, base_state: str, other_state: str) -> tuple[bool, list[str]]:
    """비교 가능 여부와 주의 사항."""
    notes, comparable = [], True
    if base["engine"]["version"] != other["engine"]["version"]:
        comparable = False
        notes.append(f"엔진 버전이 다릅니다({base['engine']['version']} ↔ {other['engine']['version']}). "
                     "같은 입력이어도 결과가 다를 수 있어 차이를 입력 탓으로 볼 수 없습니다.")
    left, right = product_index(base), product_index(other)
    only = sorted(set(left) ^ set(right))
    if only:
        notes.append(f"한쪽 실행에만 있는 제품 {len(only)}개는 결과 비교에서 빠집니다.")
    for name, state in (("기준", base_state), ("비교", other_state)):
        if state != "completed":
            notes.append(f"{name} 실행이 끝까지 가지 못했습니다(상태 {state}). 관측 중단·미완료 결과끼리의 비교입니다.")
    if base["scenario"]["stopping_rule"] != other["scenario"]["stopping_rule"]:
        notes.append("종료 규칙이 달라 관측 기간이 다릅니다. 누적 값(완료 수 등)보다 비율·평균을 비교하세요.")
    return comparable, notes


def align_dimensions(dimensions: Mapping[str, str], pv_to_product: Mapping[str, str]) -> tuple:
    """지표 차원의 짝 키: 공정 버전은 제품 id로 바꾼다(같은 제품이면 버전이 달라도 맞춘다)."""
    return tuple(sorted(("product_id", pv_to_product.get(v, v)) if k == "process_version_id" else (k, v)
                        for k, v in dimensions.items()))


def delta(base: Decimal | None, other: Decimal | None) -> tuple[Decimal | None, Decimal | None]:
    """(차이 = 비교 − 기준, 비율 = 비교 ÷ 기준). 한쪽이 없거나 기준이 0이면 비율은 null."""
    if base is None or other is None:
        return None, None
    return other - base, (other / base if base != 0 else None)
