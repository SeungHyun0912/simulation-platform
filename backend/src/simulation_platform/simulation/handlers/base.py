"""handler 계약. handler는 SimPy를 모르는 **순수 계획 함수**다: 입력 작업물과 단계 모델로
(준비 시간, 산출 단위별 준비 시각, 잔량)을 계산한다. SimPy 실행(자원 확보·시간 경과·이벤트)은 runtime이 맡는다.

임의 `eval`·코드 문자열 실행·LLM 생성 코드 실행은 하지 않는다(07 §2). handler는 등록된 이름·버전으로만 선택한다.
"""

from collections.abc import Callable
from dataclasses import dataclass
from fractions import Fraction

from simulation_platform.simulation.compiler.model import StepModel
from simulation_platform.simulation.items import WorkItem


class PlanError(Exception):
    """입력 작업물이 이 단계에 맞지 않아 계획을 세울 수 없다(실행을 실패로 끝낸다)."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


@dataclass(frozen=True)
class PlannedOutput:
    ordinal: int
    ready_offset: Fraction  # 가공 시작(준비 이후)부터 이 산출이 준비되는 시간(분)
    length_m: Fraction | None  # None = 길이 없음(무게 단위 산출 등)
    weight_kg: Fraction | None = None


@dataclass(frozen=True)
class OperationPlan:
    # split(부모를 소비하고 자식을 만든다) | transform(같은 작업물의 상태·위치만 바뀐다)
    # supply(투입 작업물들이 그대로 공급 상태가 된다, 03 §12) | yield(투입을 소비하고 지정 산출을 만든다, abstract_yield)
    relation: str
    outputs: tuple[PlannedOutput, ...]
    residual_m: Fraction = Fraction(0)
    carried_in_m: Fraction = Fraction(0)  # 잔량 풀에서 이어 받은 길이(길이 풀, 물리 접속 아님)

    @property
    def finish_offset(self) -> Fraction:
        return self.outputs[-1].ready_offset if self.outputs else Fraction(0)


@dataclass(frozen=True)
class HandlerDef:
    name: str
    version: str
    plan: Callable[[StepModel, tuple[WorkItem, ...], Fraction], OperationPlan]  # (단계, 투입들, 이월받은 길이)
    output_modes: frozenset[str]  # 허용하는 output_rule.mode
    timing_kinds: frozenset[str]  # 허용하는 처리 시간 종류
    needs_output_length: bool = False
    needs_equipment: bool = True
    multiple_outputs: bool = False  # 한 작업이 여러 산출을 낼 수 있어 설비 점유 정책이 필요하다
    batch: bool = False  # 작업 한 번에 여러 작업물·여러 입력을 받는다(아니면 작업물 하나)
    consume_policies: frozenset[str] = frozenset()  # batch handler가 실행하는 input_rule.consume_policy
    abstract_yield_only: bool = False  # 투입과 맞추는 물리 규칙이 없어 abstract_yield로만 실행(configured_yield)
