"""엔진이 구현한 표준 handler(07 §2의 초기 범위 중 단일 흐름에 필요한 것). 모두 순수 계획 함수다.

- pass_through_length: 길이·수량을 유지하고 새 처리 상태로 전이(선속만 있는 단계는 길이 변화 없음)
- split_length: 원재료 길이에서 목표 단위로 분할(부모 소비·자식 생성이 한 작업 안에서 일어난다)
- inspection: 산출 단위당 고정 시간(작업자 무제한이어도 각 작업물에 시간이 걸린다)
- transport_manual: 시나리오가 명시한 이동 시간
- configured_yield: 투입을 한 번 확보하고 지정한 산출(단위 길이 × 개수)을 만든다(abstract_yield, 03 §5·07 §5)
- output_units_by_time: 투입 여러 개(예: 태신선 11개)를 한 번에 확보해 지정한 산출(단위 길이 또는 단위 무게 × 개수)을
  **순차로 하나씩** 만든다. 시간은 산출 단위마다(단위당 고정 시간 또는 단위 길이 ÷ 선속)이며 투입에 길이가 없어도 된다
- supply_delay: 투입 작업물들을 복제하지 않고 그대로 공급 상태로 바꾼다(03 §12). 대기 시간은 준비 대기(precondition_delay)
아직 없는 것: 산출을 동시에(병렬 스트림) 만드는 방식(컴파일이 TIMING_UNSUPPORTED로 막는다).
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


def _need_length(step: StepModel, item: WorkItem) -> None:
    """길이를 쓰는 단계에 길이 없는 작업물이 오면 0으로 계산하지 않고 실패시킨다(해당 없음 ≠ 0)."""
    if item.length_m is None:
        raise PlanError("INPUT_LENGTH_MISSING",
                        f"{step.key}: 이 단계는 길이로 계산하는데 작업물 {item.key}에 길이가 없습니다"
                        "(길이는 앞 단계의 산출이 정한다).")


def _offsets(step: StepModel, unit_length: Fraction | None, count: int) -> list[Fraction]:
    """산출 단위 k(1..count)가 준비되는 시각(가공 시작 기준). 선속 순차 산출: k × 단위 길이 / 선속."""
    timing = step.timing
    if timing.kind == "speed":
        if unit_length is None:
            raise PlanError("TIMING_LENGTH_MISSING", f"{step.key}: 선속으로 시간을 재려면 산출 길이가 필요합니다.")
        unit = unit_length / timing.speed_m_per_min
    elif timing.kind == "per_unit":
        unit = timing.unit_minutes
    elif timing.kind == "none":
        unit = Fraction(0)
    else:
        raise PlanError("TIMING_UNSUPPORTED", f"지원하지 않는 처리 시간 종류: {timing.kind}")
    return [unit * k for k in range(1, count + 1)]


def plan_split_length(step: StepModel, items: tuple[WorkItem, ...], carried: Fraction = Fraction(0)) -> OperationPlan:
    """이월받은 잔량(carried)은 투입 길이에 더해 같은 길이 풀로 다룬다(abstract_length_pool, 03 §6)."""
    item = items[0]
    _need_length(step, item)
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


def plan_pass_through_length(step: StepModel, items: tuple[WorkItem, ...], carried: Fraction = Fraction(0)) -> OperationPlan:
    # 선속은 입력 전체 길이가 지나가는 시간이다(길이 변화 없음). 단위당 시간이면 한 단위의 시간이다.
    item = items[0]
    _need_length(step, item)
    offset = _offsets(step, item.length_m, 1)[0]
    return OperationPlan("transform", (PlannedOutput(1, offset, item.length_m),))


def plan_inspection(step: StepModel, items: tuple[WorkItem, ...], carried: Fraction = Fraction(0)) -> OperationPlan:
    return OperationPlan("transform",
                         (PlannedOutput(1, step.timing.unit_minutes, items[0].length_m),))


def plan_transport_manual(step: StepModel, items: tuple[WorkItem, ...], carried: Fraction = Fraction(0)) -> OperationPlan:
    return OperationPlan("transform", (PlannedOutput(1, step.transport_minutes, items[0].length_m),))


def plan_configured_yield(step: StepModel, items: tuple[WorkItem, ...],
                          carried: Fraction = Fraction(0)) -> OperationPlan:
    """투입 길이에서 산출을 계산하지 않는다: 산출 수·단위 길이는 단계 설정값이다(abstract_yield, 물량 보존 검증 예외)."""
    unit, count = step.output.unit_length_m, step.output.unit_count
    outputs = tuple(PlannedOutput(k, offset, unit) for k, offset in
                    enumerate(_offsets(step, unit, count), start=1))
    return OperationPlan("yield", outputs)


def plan_output_units_by_time(step: StepModel, items: tuple[WorkItem, ...],
                              carried: Fraction = Fraction(0)) -> OperationPlan:
    """투입 전부를 한 번에 확보해 지정한 산출을 순차로 하나씩 만든다. 투입 길이·무게에서 산출을 계산하지 않는다
    (무게 ↔ 길이는 환산하지 않으므로 물량 보존을 주장하지 않는 `yield`)."""
    out = step.output
    count = out.unit_count
    if out.mode == "fixed_mass_units":
        length, weight = None, out.unit_weight_kg
    else:
        length, weight = out.unit_length_m, None
    outputs = tuple(PlannedOutput(k, offset, length, weight)
                    for k, offset in enumerate(_offsets(step, length, count), start=1))
    return OperationPlan("yield", outputs)


def plan_supply_delay(step: StepModel, items: tuple[WorkItem, ...],
                      carried: Fraction = Fraction(0)) -> OperationPlan:
    """공급 준비: 투입 작업물 k가 그대로 산출 k다(새 작업물을 만들지 않음). 대기는 runtime이 준비 대기로 처리한다."""
    return OperationPlan("supply", tuple(PlannedOutput(k, Fraction(0), item.length_m)
                                         for k, item in enumerate(items, start=1)))


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
    HandlerDef("configured_yield", "1", plan_configured_yield, output_modes=frozenset({"configured_units"}),
               timing_kinds=frozenset({"speed", "per_unit"}), needs_output_length=True, multiple_outputs=True,
               batch=True, consume_policies=frozenset({"consume", "transfer"}), abstract_yield_only=True),
    HandlerDef("output_units_by_time", "1", plan_output_units_by_time,
               output_modes=frozenset({"configured_units", "fixed_mass_units"}),
               timing_kinds=frozenset({"speed", "per_unit"}), multiple_outputs=True, batch=True,
               consume_policies=frozenset({"consume"})),
    HandlerDef("supply_delay", "1", plan_supply_delay, output_modes=frozenset({"pass_through"}),
               timing_kinds=frozenset({"none"}), batch=True, consume_policies=frozenset({"transfer"})),
)
