"""배치판 규칙(CR be18, 사용자 확정 2026-10-28). HTTP·ORM에 의존하지 않는다.

- 좌표계: m, 도면 왼쪽 위 원점, x 오른쪽·y 아래쪽. 설비·공간의 x·y는 중심.
- 값은 소수 첫째 자리까지 저장하고 그 아래는 반올림(ROUND_HALF_UP)한다.
- 경로 = 점 순서 배열, 길이 = 연속한 점 사이 직선 거리의 합(소수 첫째 자리).
- 저장(`save_errors`)은 구조만 막고, 승인 가능 여부는 검증(`validate`)이 판정한다(초안 저장과 승인 판정을 구분).
- 통로(W, CR be19): 포트에 묶이지 않은 점 순서 배열, 양방향. 통로·고정 경로의 이웃한 점 쌍이 길 그물의 선분이고,
  포트 → 포트 경로는 그 그물의 최단 경로로 계산한다(저장하지 않음 → 점·통로를 고치면 자동으로 바뀐다).
"""

import heapq
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
                routes: Sequence[Mapping], known_assets: set, known_ports: set,
                aisles: Sequence[Mapping] = ()) -> list[Issue]:
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
        _sequence(err, f"/routes/{i}", r["points"], keys, "경로")
    aisle_keys = Counter(a["aisle_key"] for a in aisles)
    for i, a in enumerate(aisles):
        if aisle_keys[a["aisle_key"]] > 1:
            err("LAY-SAVE-011", f"/aisles/{i}/aisle_key", f"통로 key {a['aisle_key']}가 중복됩니다.")
        _sequence(err, f"/aisles/{i}", a["points"], keys, "통로")
    return issues


def _sequence(err, path: str, sequence: Sequence[str], keys, what: str) -> None:
    if len(sequence) < 2:
        err("LAY-SAVE-008", f"{path}/points", f"{what}에는 점이 2개 이상 있어야 합니다.")
    for j, key in enumerate(sequence):
        if key not in keys:
            err("LAY-SAVE-003", f"{path}/points/{j}", f"없는 점 {key}입니다.")
        elif j and sequence[j - 1] == key:
            err("LAY-SAVE-009", f"{path}/points/{j}", "같은 점이 연달아 있습니다.")


# --- 길 그물(CR be19) ----------------------------------------------------------------------------------
def segments(lines: Sequence[Sequence[str]]) -> set[tuple[str, str]]:
    """선(통로·고정 경로)의 이웃한 점 쌍. 양방향이므로 (작은 key, 큰 key)로 정규화한다."""
    return {tuple(sorted(pair)) for line in lines for pair in pairwise(line) if pair[0] != pair[1]}


def _distance(a: tuple[Decimal, Decimal], b: tuple[Decimal, Decimal]) -> Decimal:
    return ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2).sqrt()


def shortest_path(points: Mapping[str, tuple[Decimal, Decimal]], lines: Sequence[Sequence[str]], start: str,
                  end: str) -> tuple[list[str], Decimal] | None:
    """최단 경로(점 key 배열, 길이 m 소수 첫째 자리). 길이 같으면 점 key 순으로 정해져 늘 같은 답이다. 길이 없으면 None."""
    if start not in points or end not in points:
        return None
    neighbors: dict[str, list[str]] = {}
    for a, b in segments(lines):
        if a in points and b in points:
            neighbors.setdefault(a, []).append(b)
            neighbors.setdefault(b, []).append(a)
    best = {start: Decimal(0)}
    previous: dict[str, str] = {}
    queue = [(Decimal(0), start)]
    while queue:
        dist, key = heapq.heappop(queue)
        if key == end:
            break
        if dist > best.get(key, dist):
            continue
        for other in sorted(neighbors.get(key, ())):
            candidate = dist + _distance(points[key], points[other])
            if other not in best or candidate < best[other]:
                best[other], previous[other] = candidate, key
                heapq.heappush(queue, (candidate, other))
    if end not in best:
        return None
    path = [end]
    while path[-1] != start:
        path.append(previous[path[-1]])
    path.reverse()
    return path, round_m(best[end])


def _cross(o, a, b) -> Decimal:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _on(p, q, r) -> bool:
    return min(p[0], r[0]) <= q[0] <= max(p[0], r[0]) and min(p[1], r[1]) <= q[1] <= max(p[1], r[1])


def _touch(p1, p2, q1, q2) -> bool:
    d1, d2, d3, d4 = _cross(q1, q2, p1), _cross(q1, q2, p2), _cross(p1, p2, q1), _cross(p1, p2, q2)
    if ((d1 > 0 > d2) or (d1 < 0 < d2)) and ((d3 > 0 > d4) or (d3 < 0 < d4)):
        return True
    return ((d1 == 0 and _on(q1, p1, q2)) or (d2 == 0 and _on(q1, p2, q2))
            or (d3 == 0 and _on(p1, q1, p2)) or (d4 == 0 and _on(p1, q2, p2)))


def unjoined_crossings(points: Mapping[str, tuple[Decimal, Decimal]],
                       lines: Sequence[Sequence[str]]) -> list[tuple[tuple[str, str], tuple[str, str]]]:
    """겹치거나 만나는데 공유하는 점이 없는 선분 쌍(이어지지 않은 교차). 공유 점이 있으면 이어진 것으로 본다."""
    segs = sorted(s for s in segments(lines) if s[0] in points and s[1] in points)
    boxes = []
    for a, b in segs:
        (x1, y1), (x2, y2) = points[a], points[b]
        boxes.append((min(x1, x2), max(x1, x2), min(y1, y2), max(y1, y2)))
    found = []
    for i, (a, b) in enumerate(segs):
        for j in range(i + 1, len(segs)):
            c, d = segs[j]
            if {a, b} & {c, d}:
                continue
            bi, bj = boxes[i], boxes[j]
            if bi[1] < bj[0] or bj[1] < bi[0] or bi[3] < bj[2] or bj[3] < bi[2]:
                continue
            if _touch(points[a], points[b], points[c], points[d]):
                found.append(((a, b), (c, d)))
    return found


def validate(*, canvas: tuple[Decimal | None, Decimal | None], points: Mapping[str, tuple[Decimal, Decimal]],
             placements: Sequence[Mapping], port_points: Mapping[str, str], port_assets: Mapping[str, str],
             routes: Sequence[Mapping], aisles: Sequence[Mapping] = ()) -> list[Issue]:
    """승인 전 검증. points: key → (x, y), port_points: 포트 id → 점 key, port_assets: 포트 id → 자산 id.

    field_path는 순번이 아니라 key 기준이다(응답 순서와 무관하게 화면이 대상을 찾도록): `/points/{point_key}`,
    `/placements/{asset_id}`, `/port_points/{port_id}`, `/routes/{route_key}`, `/aisles/{aisle_key}`."""
    issues: list[Issue] = []
    width, height = canvas

    def outside(x, y):
        return (width is not None and x > width) or (height is not None and y > height)

    for key, (x, y) in points.items():
        if outside(x, y):
            issues.append(Issue("warning", "LAY-005", f"/points/{key}", f"점 {key}가 도면 크기를 벗어납니다."))
    placed = set()
    for p in placements:
        placed.add(p["asset_id"])
        path = f"/placements/{p['asset_id']}"
        if outside(p["x_m"], p["y_m"]):
            issues.append(Issue("warning", "LAY-005", path, "배치 중심이 도면 크기를 벗어납니다."))
        if p.get("width_m") is None or p.get("height_m") is None:
            issues.append(Issue("warning", "LAY-006", path, "가로·세로 크기를 모릅니다."))
    for port, key in sorted(port_points.items(), key=lambda kv: (kv[1], str(kv[0]))):
        if port_assets.get(port) not in placed:
            issues.append(Issue("warning", "LAY-004", f"/port_points/{port}",
                                f"점 {key}에 매핑한 포트의 자산이 배치되지 않았습니다."))
    for r in routes:
        path = f"/routes/{r['route_key']}"
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
    lines = [a["points"] for a in aisles] + [r["points"] for r in routes]
    touched = {k for seg in segments(lines) for k in seg}
    for port, key in sorted(port_points.items(), key=lambda kv: (kv[1], str(kv[0]))):
        if key not in touched:
            issues.append(Issue("warning", "LAY-009", f"/port_points/{port}",
                                f"점 {key}(포트)이 어떤 통로·경로에도 닿지 않아 갈 수 없습니다."))
    for (a, b), (c, d) in unjoined_crossings(points, lines):
        issues.append(Issue("warning", "LAY-008", f"/points/{a}",
                            f"선분 {a}–{b}와 {c}–{d}가 만나는데 공유하는 점이 없어 이어지지 않습니다."))
    return issues
