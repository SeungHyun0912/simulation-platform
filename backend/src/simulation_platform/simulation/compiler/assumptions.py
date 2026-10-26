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
