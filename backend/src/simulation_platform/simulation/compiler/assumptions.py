"""시나리오 가정(승인된 미정 해소). 엔진은 미정을 스스로 채우지 않고 이 객체로 명시된 값만 쓴다.

가정은 master 공정을 바꾸지 않고(ADR-017) 컴파일 결과의 `assumptions`에 사용 내역으로 남는다.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from fractions import Fraction

HOLD_FOR_OPERATION = "hold_for_operation"  # 07 §13: 모든 산출이 끝날 때까지 설비를 점유한다
SUPPORTED_EQUIPMENT_HOLD = frozenset({HOLD_FOR_OPERATION})
# 잔량을 모아 두는 범위(03 §6): 설비별·제품별·단계별·lot별
RESIDUAL_SCOPES = frozenset({"machine", "product", "operation", "lot"})


@dataclass(frozen=True)
class ScenarioAssumptions:
    # 한 작업이 여러 산출을 낼 때 설비를 언제 놓는지. 사용자 자료의 "보빈별 인계"는 이 정책을 확정하지 않는다.
    equipment_hold: str | None = None
    # 저장·대기 공간의 용량이 snapshot에 없다. True면 용량 제한 없이 대기할 수 있다고 시나리오가 명시한 것이다.
    unbounded_buffers: bool = False
    # 수동 운반 단계(node_key)별 명시 이동 시간(분). 0분은 이 가정으로 명시했을 때만 가능하다.
    manual_transport_minutes: Mapping[str, Fraction] = field(default_factory=dict)
    # 잔량 이월 단계(node_key)별 잔량 범위. 공정에 scope가 미정일 때만 쓰며 사용자가 승인한 가정이어야 한다.
    residual_scope: Mapping[str, str] = field(default_factory=dict)
    # 다음 공간이 가득 찼을 때 설비의 OUT 배출 정책이 승인된 자산 버전에 없으면 쓰는 값. "hold" = 산출을 쥐고 설비가 기다린다.
    out_release: str | None = None
    # 운반 자원(지게차·AMR)이 일을 받은 곳이 지금 있는 곳과 다를 때 빈 차로 옮겨 가는 시간(분). 운반 단계에 설비 후보가 있으면 필요.
    carrier_empty_move_minutes: Fraction | None = None


def assumptions_from_scenario(data: Mapping | None) -> ScenarioAssumptions:
    """시나리오 버전이 제품별로 저장한 가정(dict)을 엔진 가정으로 바꾼다. 값은 decimal 문자열이라 정확한 분수로 읽는다.

    `equipment_hold`는 사용자가 사실로 확정했다(2026-10-27: "같은 설비에 입력이 더 들어오면 안 된다" = 작업이 끝날 때까지
    설비를 독점)이므로 시나리오가 말하지 않아도 `hold_for_operation`이 기본값이다. `out_release`도 사용자가 사실로
    확정했다(2026-10-28: 다음 공간이 가득 차면 설비가 산출을 쥐고 기다린다)이므로 기본값이 `hold`다. 다른 값(공간 용량
    무제한 등)은 시나리오가 명시해야 한다."""
    from simulation_platform.simulation.numbers import to_fraction

    data = data or {}
    return ScenarioAssumptions(
        equipment_hold=data.get("equipment_hold") or HOLD_FOR_OPERATION,
        unbounded_buffers=bool(data.get("unbounded_buffers")),
        manual_transport_minutes={k: to_fraction(v) for k, v in (data.get("manual_transport_minutes") or {}).items()},
        residual_scope=dict(data.get("residual_scope") or {}),
        out_release=data.get("out_release") or "hold",
        carrier_empty_move_minutes=(None if data.get("carrier_empty_move_minutes") is None
                                    else to_fraction(data["carrier_empty_move_minutes"])))
