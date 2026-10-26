"""엔진이 구현한 표준 handler(07 §2의 초기 범위 중 단일 흐름에 필요한 것). 모두 순수 계획 함수다.

- pass_through_length: 길이·수량을 유지하고 새 처리 상태로 전이(선속만 있는 단계는 길이 변화 없음)
- split_length: 원재료 길이에서 목표 단위로 분할(부모 소비·자식 생성이 한 작업 안에서 일어난다)
- inspection: 산출 단위당 고정 시간(작업자 무제한이어도 각 작업물에 시간이 걸린다)
- transport_manual: 시나리오가 명시한 이동 시간
아직 없는 것: output_units_by_time, configured_yield, supply_delay(별도 단계, 컴파일이 ENGINE_HANDLER_NOT_AVAILABLE로 알린다).
"""

from fractions import Fraction

from simulation_platform.simulation.compiler.model import StepModel
from simulation_platform.simulation.handlers.base import (
    HandlerDef,
    OperationPlan,
    PlanError,
    PlannedOutput,
)
from simulation_platform.simulation.items import WorkItem


def _offsets(step: StepModel, unit_length: Fraction, count: int) -> list[Fraction]:
    """산출 단위 k(1..count)가 준비되는 시각(가공 시작 기준). 선속 순차 산출: k × 단위 길이 / 선속."""
    timing = step.timing
    if timing.kind == "speed":
        unit = unit_length / timing.speed_m_per_min
    elif timing.kind == "per_unit":
        unit = timing.unit_minutes
    elif timing.kind == "none":
        unit = Fraction(0)
    else:
        raise PlanError("TIMING_UNSUPPORTED", f"지원하지 않는 처리 시간 종류: {timing.kind}")
    return [unit * k for k in range(1, count + 1)]


def plan_split_length(step: StepModel, item: WorkItem, carried: Fraction = Fraction(0)) -> OperationPlan:
    """이월받은 잔량(carried)은 투입 길이에 더해 같은 길이 풀로 다룬다(abstract_length_pool, 03 §6)."""
    unit = step.output.unit_length_m
    available = item.length_m + carried
    target = step.output.unit_count if step.output.quantity_basis == "per_input_unit" else None
    count = target if target is not None else int(available // unit)
    if count < 1 or unit * count > available:
        raise PlanError(
            "INPUT_LENGTH_INCOMPATIBLE",
            f"투입 {available}m로 {unit}m 단위를 {max(count, 1)}개 만들 수 없습니다.")
    outputs = tuple(PlannedOutput(k, offset, unit) for k, offset in
                    enumerate(_offsets(step, unit, count), start=1))
    return OperationPlan("split", outputs, residual_m=available - unit * count, carried_in_m=carried)


def plan_pass_through_length(step: StepModel, item: WorkItem, carried: Fraction = Fraction(0)) -> OperationPlan:
    # 선속은 입력 전체 길이가 지나가는 시간이다(길이 변화 없음). 단위당 시간이면 한 단위의 시간이다.
    offset = _offsets(step, item.length_m, 1)[0]
    return OperationPlan("transform", (PlannedOutput(1, offset, item.length_m),))


def plan_inspection(step: StepModel, item: WorkItem, carried: Fraction = Fraction(0)) -> OperationPlan:
    return OperationPlan("transform",
                         (PlannedOutput(1, step.timing.unit_minutes, item.length_m),))


def plan_transport_manual(step: StepModel, item: WorkItem, carried: Fraction = Fraction(0)) -> OperationPlan:
    return OperationPlan("transform", (PlannedOutput(1, step.transport_minutes, item.length_m),))


STANDARD_HANDLERS = (
    HandlerDef("pass_through_length", "1", plan_pass_through_length,
               output_modes=frozenset({"pass_through"}), timing_kinds=frozenset({"speed", "per_unit"})),
    HandlerDef("split_length", "1", plan_split_length, output_modes=frozenset({"split_length"}),
               timing_kinds=frozenset({"speed", "per_unit"}), needs_output_length=True,
               multiple_outputs=True),
    HandlerDef("inspection", "1", plan_inspection, output_modes=frozenset({"pass_through"}),
               timing_kinds=frozenset({"per_unit"}), needs_equipment=False),
    HandlerDef("transport_manual", "1", plan_transport_manual, output_modes=frozenset({"pass_through"}),
               timing_kinds=frozenset({"none"}), needs_equipment=False),
)
