"""배치판 규칙(CR be18, 사용자 확정 2026-10-28). HTTP·ORM에 의존하지 않는다.

- 좌표계: m, 도면 왼쪽 위 원점, x 오른쪽·y 아래쪽. 설비·공간의 x·y는 중심.
- 값은 소수 첫째 자리까지 저장하고 그 아래는 반올림(ROUND_HALF_UP)한다.
- 경로 = 점 순서 배열, 길이 = 연속한 점 사이 직선 거리의 합(소수 첫째 자리).
- 저장(`save_errors`)은 구조만 막고, 승인 가능 여부는 검증(`validate`)이 판정한다(초안 저장과 승인 판정을 구분).
"""

from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from itertools import pairwise

STEP = Decimal("0.1")
DEFINITION = {"unit": "m", "origin": "top_left", "x_axis": "right", "y_axis": "down", "anchor": "center",
              "precision": "0.1"}


def round_m(value: Decimal | str) -> Decimal:
    return Decimal(value).quantize(STEP, rounding=ROUND_HALF_UP)


def fmt(value: Decimal | None) -> str | None:
    return None if value is None else f"{value:.1f}"


def length(points: Sequence[tuple[Decimal, Decimal]]) -> Decimal:
    """점 순서를 따라 직선으로 이은 길이(m). 각 구간을 정확히 더한 뒤 마지막에 한 번 반올림한다."""
    total = Decimal(0)
    for (x1, y1), (x2, y2) in pairwise(points):
        total += ((x2 - x1) ** 2 + (y2 - y1) ** 2).sqrt()
    return round_m(total)


@dataclass(frozen=True)
class Issue:
    severity: str  # error | warning
    rule_id: str
    field_path: str
    message: str


def save_errors(*, points: Sequence[Mapping], placements: Sequence[Mapping], port_points: Sequence[Mapping],
                routes: Sequence[Mapping], known_assets: set, known_ports: set) -> list[Issue]:
    """저장을 막는 구조 오류. 값은 이미 반올림된 Decimal이다."""
    issues: list[Issue] = []

    def err(rule, path, message):
        issues.append(Issue("error", rule, path, message))

    keys = Counter(p["point_key"] for p in points)
    for i, p in enumerate(points):
        if keys[p["point_key"]] > 1:
            err("LAY-SAVE-001", f"/points/{i}/point_key", f"점 key {p['point_key']}가 중복됩니다.")
    assets = Counter(p["asset_id"] for p in placements)
    for i, p in enumerate(placements):
        if p["asset_id"] not in known_assets:
            err("LAY-SAVE-004", f"/placements/{i}/asset_id", "이 프로젝트의 자산이 아닙니다.")
        elif assets[p["asset_id"]] > 1:
            err("LAY-SAVE-006", f"/placements/{i}/asset_id", "같은 자산을 두 번 배치할 수 없습니다.")
        for name in ("width_m", "height_m"):
            if p.get(name) is not None and p[name] <= 0:
                err("LAY-SAVE-010", f"/placements/{i}/{name}", "반올림하면 0이 됩니다(0.1m 이상이어야 합니다).")
    mapped = Counter(m["port_id"] for m in port_points)
    for i, m in enumerate(port_points):
        if m["port_id"] not in known_ports:
            err("LAY-SAVE-005", f"/port_points/{i}/port_id", "이 프로젝트의 포트가 아닙니다.")
        elif mapped[m["port_id"]] > 1:
            err("LAY-SAVE-007", f"/port_points/{i}/port_id", "한 포트는 점 하나에만 매핑합니다.")
        if m["point_key"] not in keys:
            err("LAY-SAVE-003", f"/port_points/{i}/point_key", f"없는 점 {m['point_key']}입니다.")
    route_keys = Counter(r["route_key"] for r in routes)
    for i, r in enumerate(routes):
        if route_keys[r["route_key"]] > 1:
            err("LAY-SAVE-002", f"/routes/{i}/route_key", f"경로 key {r['route_key']}가 중복됩니다.")
        for name in ("from_port_id", "to_port_id"):
            if r[name] not in known_ports:
                err("LAY-SAVE-005", f"/routes/{i}/{name}", "이 프로젝트의 포트가 아닙니다.")
        if len(r["points"]) < 2:
            err("LAY-SAVE-008", f"/routes/{i}/points", "경로에는 점이 2개 이상 있어야 합니다.")
        for j, key in enumerate(r["points"]):
            if key not in keys:
                err("LAY-SAVE-003", f"/routes/{i}/points/{j}", f"없는 점 {key}입니다.")
            elif j and r["points"][j - 1] == key:
                err("LAY-SAVE-009", f"/routes/{i}/points/{j}", "같은 점이 연달아 있습니다.")
    return issues


def validate(*, canvas: tuple[Decimal | None, Decimal | None], points: Mapping[str, tuple[Decimal, Decimal]],
             placements: Sequence[Mapping], port_points: Mapping[str, str], port_assets: Mapping[str, str],
             routes: Sequence[Mapping]) -> list[Issue]:
    """승인 전 검증. points: key → (x, y), port_points: 포트 id → 점 key, port_assets: 포트 id → 자산 id."""
    issues: list[Issue] = []
    width, height = canvas

    def outside(x, y):
        return (width is not None and x > width) or (height is not None and y > height)

    for key, (x, y) in points.items():
        if outside(x, y):
            issues.append(Issue("warning", "LAY-005", f"/points/{key}", f"점 {key}가 도면 크기를 벗어납니다."))
    placed = set()
    for i, p in enumerate(placements):
        placed.add(p["asset_id"])
        if outside(p["x_m"], p["y_m"]):
            issues.append(Issue("warning", "LAY-005", f"/placements/{i}", "배치 중심이 도면 크기를 벗어납니다."))
        if p.get("width_m") is None or p.get("height_m") is None:
            issues.append(Issue("warning", "LAY-006", f"/placements/{i}", "가로·세로 크기를 모릅니다."))
    for port, key in sorted(port_points.items(), key=lambda kv: kv[1]):
        if port_assets.get(port) not in placed:
            issues.append(Issue("warning", "LAY-004", f"/port_points/{key}",
                                f"점 {key}에 매핑한 포트의 자산이 배치되지 않았습니다."))
    for i, r in enumerate(routes):
        path = f"/routes/{i}"
        if r["from_port_id"] == r["to_port_id"]:
            issues.append(Issue("error", "LAY-007", path, "출발 포트와 도착 포트가 같습니다."))
        for side, port, end, rule in (("출발", r["from_port_id"], r["points"][0], "LAY-001"),
                                      ("도착", r["to_port_id"], r["points"][-1], "LAY-002")):
            where = port_points.get(port)
            if where is None:
                issues.append(Issue("error", "LAY-003", path, f"{side} 포트가 점에 매핑되지 않았습니다."))
            elif where != end:
                issues.append(Issue("error", rule, path,
                                    f"경로의 {'첫' if rule == 'LAY-001' else '끝'} 점({end})이 {side} 포트의 점({where})과 다릅니다."))
    return issues
