"""엔진의 이동 모델(CR be20, BE-24). 실행 입력 스냅샷의 `travel`(배치판·이동 설정)만 읽는다(DB·HTTP 모름).

- 경로 길이: 포트 → 포트. 같은 출발·도착 포트의 고정 경로가 있으면 그것, 없으면 통로·고정 경로 선분(양방향)의 최단 경로
  (계약 0.18.0 `/paths`와 같은 계산, 소수 첫째 자리 m).
- 이동 시간(분) = 길이 ÷ 속도. 속도·상하차는 시나리오 이동 설정, 없으면 사용자 기본값(4 km/h, 1분).
"""

from collections.abc import Mapping
from decimal import Decimal
from fractions import Fraction

from simulation_platform.domain import layout as layout_rules
from simulation_platform.domain import travel as travel_rules

ACCESS, IN, OUT = "ACCESS", "IN", "OUT"


class TravelModel:
    def __init__(self, data: Mapping) -> None:
        self.layout_version_id = data.get("layout_version_id")
        self.points = {k: (Decimal(str(x)), Decimal(str(y))) for k, (x, y) in data.get("points", {}).items()}
        self.lines = [list(line) for line in data.get("lines", [])]
        self.fixed = {(f["from_port_id"], f["to_port_id"]): list(f["points"]) for f in data.get("fixed", [])}
        self.port_points: dict[str, str] = dict(data.get("port_points", {}))
        self.ports: dict[str, dict[str, list[str]]] = {a: {r: list(p) for r, p in roles.items()}
                                                       for a, roles in data.get("ports", {}).items()}
        self.kinds: dict[str, str] = dict(data.get("kinds", {}))
        self.rule: dict = dict(data.get("rule") or {})
        self._lengths: dict[tuple, Decimal | None] = {}

    @classmethod
    def from_snapshot(cls, snapshot: Mapping) -> "TravelModel | None":
        data = snapshot.get("travel")
        return None if not data else cls(data)

    def speed_key(self, carriers) -> str:
        """운반 자원 후보가 있으면 첫 후보의 종류, 없으면 사람."""
        for asset in carriers or ():
            if self.kinds.get(asset):
                return self.kinds[asset]
        return travel_rules.PERSON

    def speed(self, key: str) -> tuple[Decimal, bool]:
        return travel_rules.speed_kmh(self.rule, key)

    def handling(self) -> tuple[Decimal, bool]:
        return travel_rules.handling_minutes(self.rule)

    def port(self, asset: str | None, role: str) -> str | None:
        found = self.ports.get(asset or "", {}).get(role) or []
        return found[0] if found else None

    def length(self, from_asset: str | None, from_role: str, to_asset: str | None, to_role: str) -> Decimal | None:
        """두 위치 사이 경로 길이(m). 포트가 없거나 점에 매핑되지 않았거나 길이 없으면 None."""
        key = (from_asset, from_role, to_asset, to_role)
        if key not in self._lengths:
            self._lengths[key] = self._length(self.port(from_asset, from_role), self.port(to_asset, to_role))
        return self._lengths[key]

    def _length(self, from_port: str | None, to_port: str | None) -> Decimal | None:
        if from_port is None or to_port is None:
            return None
        if (from_port, to_port) in self.fixed:
            return layout_rules.length([self.points[k] for k in self.fixed[(from_port, to_port)]])
        start, end = self.port_points.get(from_port), self.port_points.get(to_port)
        if start is None or end is None:
            return None
        found = layout_rules.shortest_path(self.points, self.lines, start, end)
        return None if found is None else found[1]

    def minutes(self, length: Decimal, key: str) -> Fraction:
        return travel_rules.travel_minutes(length, self.speed(key)[0])

    def space_minutes(self, from_space: str, to_space: str, key: str) -> Fraction | None:
        """운반 자원의 빈 차 이동: 공간 ACCESS → 공간 ACCESS."""
        length = self.length(from_space, ACCESS, to_space, ACCESS)
        return None if length is None else self.minutes(length, key)


def carrier_gaps(models, travel: TravelModel) -> list[str]:
    """운반 자원이 내려놓을 수 있는 공간에서 일을 받을 수 있는 공간까지 길이 없는 조합(제품을 가로질러 본다)."""
    drops: dict[str, set[str]] = {}
    pickups: dict[str, set[str]] = {}
    keys: dict[str, str] = {}
    for model in models:
        for step in model.steps.values():
            if step.carrier_travel is None:
                continue
            for asset in step.candidates:
                drops.setdefault(asset, set()).add(step.drop_asset)
                pickups.setdefault(asset, set()).add(step.pickup_asset)
                keys[asset] = step.carrier_travel
    gaps = []
    for asset in sorted(drops):
        for a in sorted(drops[asset]):
            for b in sorted(pickups[asset]):
                if a != b and travel.space_minutes(a, b, keys[asset]) is None:
                    gaps.append(f"운반 자원 {asset}: 공간 {a}에서 {b}까지 빈 차로 갈 경로가 배치판에 없습니다.")
    return gaps
