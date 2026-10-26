"""시간·길이 계산은 정확한 유리수(Fraction)로 한다.

예: 1,000m를 30m/min로 산출하면 100/3분이다. float로 누적하면 같은 시각의 이벤트 순서가 흔들릴 수 있어
엔진 내부는 Fraction을 쓰고, API의 decimal 문자열(ADR-010)은 경계에서 한 번만 변환한다.
"""

from decimal import ROUND_HALF_EVEN, Decimal
from fractions import Fraction


def to_fraction(value) -> Fraction:
    """decimal 문자열·정수·Decimal·Fraction을 정확한 Fraction으로 바꾼다(float는 받지 않는다)."""
    if isinstance(value, Fraction):
        return value
    if isinstance(value, (bool, float)):
        raise TypeError("float·bool은 정확한 값이 아니라 변환하지 않는다.")
    if isinstance(value, int):
        return Fraction(value)
    return Fraction(Decimal(str(value)))


def format_decimal(value: Fraction, places: int = 6) -> str:
    """표시용 decimal 문자열(반올림 half-even). 내부 값은 바뀌지 않는다."""
    quantum = Decimal(1).scaleb(-places)
    return str((Decimal(value.numerator) / Decimal(value.denominator)).quantize(
        quantum, rounding=ROUND_HALF_EVEN))
