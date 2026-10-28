"""결과 리포트의 한국어 요약 문장(CR be17). 저장된 값만으로 규칙에 따라 만든다(LLM 없음, 같은 입력이면 같은 문장).

입력은 서비스가 모은 일반 dict이다. 수치는 Decimal이고 없으면 None(해당 없음 ≠ 0)이며 None인 항목은 문장에서 뺀다.
제품끼리 생산량을 합산하지 않는다.
"""

from collections.abc import Mapping, Sequence
from decimal import Decimal

DEFINITION_VERSION = "1"
MINUTES_PER_DAY = Decimal(1440)
MAX_ROOT_LINES = 3
MAX_SHORTFALLS = 3

STATUS_TEXT = {"completed": "끝까지 완료", "stalled": "더 진행할 수 없어 멈춤", "horizon_reached": "지정한 기간에서 끊음",
               "limit_reached": "한도에 닿아 멈춤", "failed": "실패"}


def _days(minutes: Decimal | None) -> str | None:
    return None if minutes is None else f"{minutes / MINUTES_PER_DAY:,.1f}일"


def _plain(value: Decimal) -> str:
    text = f"{value:,.1f}"
    return text.removesuffix(".0")


def summary_lines(*, status: str, termination_reason: str | None, observed_min: Decimal, engine_version: str,
                  products: Sequence[Mapping], headline: str, root_causes: Sequence[Mapping],
                  top_asset: Mapping | None) -> list[str]:
    """products: code·completed_items·throughput·lead_avg_min·wip_items·last_completion_min·shortfalls(dict 목록)."""
    state = STATUS_TEXT.get(status, status)
    reason = f"({termination_reason})" if termination_reason and termination_reason != status else ""
    lines = [f"실행 결과: {state}{reason}, 가상 {_days(observed_min)} 관측, 엔진 {engine_version}."]
    for product in products:
        parts = [f"완료 {product['completed_items']:,}개"]
        if product.get("throughput") is not None:
            parts.append(f"하루 {_plain(product['throughput'])}개")
        if product.get("lead_avg_min") is not None:
            parts.append(f"평균 리드타임 {_days(product['lead_avg_min'])}")
        if product.get("wip_items"):
            parts.append(f"미완료 {_plain(product['wip_items'])}개")
        if product.get("last_completion_min") is not None:
            parts.append(f"마지막 완료 {_days(product['last_completion_min'])}")
        lines.append(f"{product['code']}: {', '.join(parts)}.")
    lines.append(headline)
    for root in root_causes[:MAX_ROOT_LINES]:
        lines.append(f"고칠 곳 {root['rank']}: {root['explanation']}")
    if top_asset is not None:
        lines.append(f"가동률이 가장 높은 설비: {top_asset['code']} {_plain(top_asset['utilization'] * 100)}%.")
    shortfalls = [(p["code"], s) for p in products for s in p.get("shortfalls", [])]
    if shortfalls:
        shown = ", ".join(f"{code} {s.get('step') or s['pool']}(필요 {s['needed']}, 보유 {s['held']})"
                          for code, s in shortfalls[:MAX_SHORTFALLS])
        more = f" 외 {len(shortfalls) - MAX_SHORTFALLS}곳" if len(shortfalls) > MAX_SHORTFALLS else ""
        lines.append(f"입력이 모자라 기다리는 단계: {shown}{more}.")
    return lines


def limitations(*, quality_status: str, status: str, bottleneck_limitations: Sequence[str]) -> list[str]:
    notes = []
    if quality_status != "complete":
        notes.append(f"끝까지 실행된 결과가 아닙니다({STATUS_TEXT.get(status, status)}). 지표는 관측한 기간까지의 값입니다.")
    notes.append("제품마다 단위·공정이 달라 생산량을 제품끼리 합산하지 않습니다.")
    notes.extend(bottleneck_limitations)
    return notes
