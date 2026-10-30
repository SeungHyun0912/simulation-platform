"""이동 속도와 이동 시간(CR be20, 사용자 지시 2026-10-30). HTTP·ORM에 의존하지 않는다.

- 속도는 km/h이고 키는 이동 수단이다: 사람은 `person`, 운반 자원은 그 설비의 종류(equipment_type) 문자열 그대로.
  예제 이름을 코드에 넣지 않으려고 종류 문자열을 데이터에서 읽는다.
- 시나리오가 정하지 않은 속도는 사용자 기본값 4 km/h, 운반 상하차 시간은 사용자 확정 1분을 쓴다(사용한 가정으로 보고).
- 이동 시간(분) = 경로 길이(m) ÷ (속도 km/h × 1000 / 60). 정확한 분수로 계산하고 표시할 때만 반올림한다.
"""

from collections.abc import Mapping
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

PERSON = "person"
DEFAULT_SPEED_KMH = Decimal(4)  # 사용자 기본값(2026-10-30): 사람·지게차·AMR 모두
DEFAULT_HANDLING_MIN = Decimal(1)  # 사용자 확정(2026-10-28): 운반 1건 상하차 1분


def speed_kmh(rule: Mapping, key: str | None) -> tuple[Decimal, bool]:
    """(속도, 기본값을 썼는가)."""
    value = (rule.get("speeds_kmh") or {}).get(key or PERSON)
    return (DEFAULT_SPEED_KMH, True) if value is None else (Decimal(str(value)), False)


def handling_minutes(rule: Mapping) -> tuple[Decimal, bool]:
    value = rule.get("carrier_handling_minutes")
    return (DEFAULT_HANDLING_MIN, True) if value is None else (Decimal(str(value)), False)


def travel_minutes(length_m: Decimal | Fraction, kmh: Decimal) -> Fraction:
    """길이(m)를 속도(km/h)로 가는 시간(분, 정확한 분수)."""
    return Fraction(str(length_m)) * 60 / (Fraction(str(kmh)) * 1000)


def fmt_minutes(value: Fraction) -> str:
    return str((Decimal(value.numerator) / Decimal(value.denominator)).quantize(Decimal("0.01"), ROUND_HALF_UP))
