"""SimPy 실행(07 §3~§11). 컴파일된 RuntimeModel과 도착 계획만으로 실행하며 DB·HTTP를 읽지 않는다.

- 시각은 Fraction(분)이라 같은 시각의 이벤트 순서가 float 오차로 흔들리지 않는다.
- 고정 지평선은 `[0, H)`다: H 시각의 이벤트는 처리하지 않는다. SimPy의 `run(until=숫자)`는 float로 바꿔 경계가
  어긋나므로(정확한 H 이벤트가 처리됨) 정확한 분수 시각의 URGENT 이벤트를 직접 예약한다.
- 작업 도중 입력이 맞지 않으면 성공으로 덮지 않고 `failed`와 이유로 끝낸다. 종료 상태는 completed·stalled·
  horizon_reached(관측 중단, censored)·failed·limit_reached로 구분한다.
- 같은 모델·도착·seed면 같은 이벤트가 나온다(안정된 key·동순위 처리 순서, 전역 random 미사용).
"""

import random
from dataclasses import dataclass, replace
from fractions import Fraction

import simpy
from simpy.events import URGENT

from simulation_platform.simulation import ENGINE_VERSION
from simulation_platform.simulation.compiler.model import AssumptionUse, RuntimeModel, StepModel
from simulation_platform.simulation.handlers import get_handler
from simulation_platform.simulation.handlers.base import PlanError
from simulation_platform.simulation.items import ItemFactory, LineageRecord, WorkItem
from simulation_platform.simulation.monitoring import events as ev
from simulation_platform.simulation.monitoring.events import Event, EventLimitReached, EventLog
from simulation_platform.simulation.numbers import to_fraction
from simulation_platform.simulation.resources import EquipmentAllocator

COMPLETED, STALLED, HORIZON_REACHED = "completed", "stalled", "horizon_reached"
FAILED, LIMIT_REACHED = "failed", "limit_reached"


@dataclass(frozen=True)
class Arrival:
    """시나리오가 정한 원자재 도착. 길이는 decimal 문자열·정수·Fraction(float는 받지 않는다)."""

    length_m: object
    at: object = 0
    count: int = 1
    form: str | None = None
    state: str | None = None
    lot: str | None = None


@dataclass(frozen=True)
class RunResult:
    state: str
    reason: str | None
    censored: bool
    end_time: Fraction
    horizon: Fraction | None
    events: tuple[Event, ...]
    lineage: tuple[LineageRecord, ...]
    items: tuple[WorkItem, ...]
    assumptions: tuple[AssumptionUse, ...]
    engine_version: str
    seed: int
    process_version_ids: tuple[str, ...] = ()

    def of_type(self, event_type: str) -> list[Event]:
        return [e for e in self.events if e.event_type == event_type]


class RunFailure(Exception):
    """작업 도중 계속할 수 없는 상태. SimPy는 실패한 프로세스의 예외를 `type(exc)(*exc.args)`로 다시 만들어
    던지므로 args에 생성 인자를 모두 보존한다."""

    def __init__(self, reason: str, message: str, step_key: str | None = None,
                 version_id: str | None = None) -> None:
        super().__init__(reason, message, step_key, version_id)
        self.reason, self.message, self.step_key, self.version_id = reason, message, step_key, version_id

    def __str__(self) -> str:
        return self.message


class _Horizon(simpy.Event):
    """정확한 분수 시각에 URGENT로 처리되는 종료 이벤트(같은 시각의 일반 이벤트보다 먼저)."""

    def __init__(self, env: simpy.Environment, delay: Fraction) -> None:
        super().__init__(env)
        self._ok = True
        self._value = None
        env.schedule(self, URGENT, delay)


@dataclass(frozen=True)
class Lane:
    """한 공정 버전(제품)과 그 원자재 도착. 여러 Lane은 같은 설비를 공유하며 경쟁한다."""

    model: RuntimeModel
    arrivals: tuple[Arrival, ...]


def run_model(model: RuntimeModel, arrivals: list[Arrival] | tuple[Arrival, ...], *,
              horizon=None, seed: int = 0, event_limit: int | None = 200_000) -> RunResult:
    return run_models([Lane(model, tuple(arrivals))], horizon=horizon, seed=seed, event_limit=event_limit)


def run_models(lanes: list[Lane] | tuple[Lane, ...], *, horizon=None, seed: int = 0,
               event_limit: int | None = 200_000) -> RunResult:
    """여러 공정을 한 가상 시간에서 실행한다. 같은 asset_id는 실행에 한 번만 생성되어 공정끼리 경쟁한다(ADR-015).

    같은 시각의 동순위는 `lanes` 순서(그 안에서는 도착 순서)로 결정한다. 설비 교체 시간은 더하지 않는다.
    """
    return _Run(list(lanes), horizon, seed, event_limit).execute()


class _Lane:
    def __init__(self, env: simpy.Environment, lane: Lane) -> None:
        self.model, self.arrivals = lane.model, lane.arrivals
        self.version = lane.model.version_id
        self.stores = {key: simpy.Store(env) for key in lane.model.steps}
        self.op_count = {key: 0 for key in lane.model.steps}
        self.pending = sum(a.count for a in lane.arrivals)


class _Run:
    def __init__(self, lanes: list[Lane], horizon, seed: int, event_limit: int | None) -> None:
        self.seed = seed
        self.horizon = None if horizon is None else to_fraction(horizon)
        if self.horizon is not None and self.horizon <= 0:
            raise ValueError("horizon은 0보다 커야 합니다(고정 지평선은 [0,H)).")
        if not lanes:
            raise ValueError("실행할 공정이 없습니다.")
        versions = [lane.model.version_id for lane in lanes]
        if len(set(versions)) != len(versions):
            raise ValueError("같은 공정 버전을 한 실행에 두 번 넣을 수 없습니다.")
        projects = {lane.model.project_id for lane in lanes}
        if len(projects) > 1:
            raise ValueError("서로 다른 프로젝트의 공정은 설비를 공유해 한 실행에서 경쟁할 수 없습니다(ADR-015).")
        for lane in lanes:
            for arrival in lane.arrivals:  # 정확한 값만: float·음수·0 길이는 실행 전에 거부한다
                if to_fraction(arrival.length_m) <= 0 or to_fraction(arrival.at) < 0 or arrival.count < 1:
                    raise ValueError("도착의 길이는 0보다 크고 시각은 0 이상이며 개수는 1 이상이어야 합니다.")
        self.env = simpy.Environment(initial_time=Fraction(0))
        self.log = EventLog(event_limit)
        self.factory = ItemFactory()
        self.items: list[WorkItem] = []
        self.lineage: list[LineageRecord] = []
        self.allocator = EquipmentAllocator(self.env)
        self.lanes = [_Lane(self.env, lane) for lane in lanes]
        self.lane_of = {lane.version: lane for lane in self.lanes}
        self.came_from: dict[str, str] = {}  # 작업물 key → 대기하던 buffer key
        self.last_version: dict[str, str] = {}  # 설비 → 직전에 처리한 공정 버전(제품 전환 판단 기록용)
        self.in_progress = 0  # 시작했지만 끝나지 않은 작업 수(부모는 소비됐고 산출은 아직 없는 상태도 WIP이다)

    def random_stream(self, name: str) -> random.Random:
        """확률 요소마다 독립된 stream(전역 random 금지, 07 §12). 이번 범위의 handler는 확률 요소가 없다."""
        return random.Random(f"{self.seed}:{name}")

    # --- 실행 -------------------------------------------------------------------------------
    def execute(self) -> RunResult:
        for lane in self.lanes:
            for step in lane.model.steps.values():
                self.env.process(self._dispatcher(lane, step))
        for lane in self.lanes:
            order = sorted(range(len(lane.arrivals)), key=lambda i: (to_fraction(lane.arrivals[i].at), i))
            for index in order:
                self.env.process(self._arrive(lane, lane.arrivals[index]))
        state, reason = COMPLETED, None
        try:
            if self.horizon is None:
                self.env.run()
            else:
                self.env.run(until=_Horizon(self.env, self.horizon))
            state, reason = self._final_state()
        except RunFailure as failure:
            state, reason = FAILED, failure.reason
            self.emit(ev.RUN_TERMINATED, step_key=failure.step_key, reason=failure.reason,
                      process_version_id=failure.version_id,
                      quantities={"state": FAILED, "message": str(failure)})
        except EventLimitReached:
            state, reason = LIMIT_REACHED, "EVENT_LIMIT"
        else:
            self.emit(ev.RUN_TERMINATED, reason=reason, quantities={
                "state": state, "wip_items": sum(1 for i in self.items if i.status == "active"),
                "operations_in_progress": self.in_progress})
        return RunResult(
            state=state, reason=reason, censored=state == HORIZON_REACHED, end_time=self.env.now,
            horizon=self.horizon, events=self.log.events, lineage=tuple(self.lineage),
            items=tuple(replace(i) for i in self.items),
            assumptions=tuple(a for lane in self.lanes for a in lane.model.assumptions),
            engine_version=ENGINE_VERSION, seed=self.seed,
            process_version_ids=tuple(lane.version for lane in self.lanes))

    def _final_state(self) -> tuple[str, str | None]:
        wip = sum(1 for i in self.items if i.status == "active") + self.in_progress
        if not wip and not sum(lane.pending for lane in self.lanes):
            return COMPLETED, None
        if self.env.peek() == float("inf"):
            # 이벤트가 더 없는데 작업물이 남았다: 즉시 교착으로 단정하지 않고 진단 이유와 함께 stalled로 기록한다.
            return STALLED, "WIP_REMAINING"
        return HORIZON_REACHED, "HORIZON"  # 지평선까지 끝나지 않은 관측 중단(censored)

    def emit(self, event_type: str, **fields) -> Event:
        return self.log.emit(self.env.now, event_type, **fields)

    def emit_for(self, lane: _Lane, event_type: str, **fields) -> Event:
        return self.log.emit(self.env.now, event_type, process_version_id=lane.version, **fields)

    # --- 흐름 -------------------------------------------------------------------------------
    def _arrive(self, lane: _Lane, arrival: Arrival):
        at = to_fraction(arrival.at)
        if at > 0:
            yield self.env.timeout(at)
        for _ in range(arrival.count):
            item = self.factory.new(length_m=to_fraction(arrival.length_m), form=arrival.form,
                                    state=arrival.state, lot=arrival.lot, created_at=self.env.now,
                                    process_version_id=lane.version)
            self.items.append(item)
            lane.pending -= 1
            self.emit_for(lane, ev.MATERIAL_ARRIVED, item_key=item.key, destination=lane.model.source_key,
                          quantities={"length_m": item.length_m})
            self._enter(lane, item, lane.model.source_key)

    def _enter(self, lane: _Lane, item: WorkItem, key: str) -> None:
        node = lane.model.nodes[key]
        item.location = key
        if node.kind == "buffer":
            self.emit_for(lane, ev.BUFFER_ENTERED, item_key=item.key, destination=key,
                          asset_key=node.asset_id, quantities={"length_m": item.length_m})
            following = lane.model.nodes.get(node.next_key) if node.next_key else None
            if following is not None and following.kind == "operation":
                self.came_from[item.key] = key  # 다음 단계가 가져갈 때 BUFFER_LEFT
            else:
                self.emit_for(lane, ev.BUFFER_LEFT, item_key=item.key, source=key, asset_key=node.asset_id)
        elif node.kind == "operation":
            lane.stores[key].put(item)
            return
        elif node.kind == "milestone":
            self.emit_for(lane, ev.MILESTONE_REACHED, item_key=item.key, destination=key,
                          quantities={"length_m": item.length_m},
                          reason="completion" if key == lane.model.completion_key else None)
        elif node.kind == "sink":
            item.status = "completed"
            self.emit_for(lane, ev.SINK_REACHED, item_key=item.key, destination=key,
                          quantities={"length_m": item.length_m})
            return
        self._advance(lane, item, key)

    def _advance(self, lane: _Lane, item: WorkItem, key: str) -> None:
        following = lane.model.nodes[key].next_key
        if following is not None:
            self._enter(lane, item, following)

    # --- 단계 ------------------------------------------------------------------------------
    def _dispatcher(self, lane: _Lane, step: StepModel):
        while True:
            item = yield lane.stores[step.key].get()
            self.env.process(self._operate(lane, step, item))

    def _operate(self, lane: _Lane, step: StepModel, item: WorkItem):
        handler = get_handler(step.handler, step.handler_version)
        lane.op_count[step.key] += 1
        op_id = f"{step.key}#{lane.op_count[step.key]}"
        self.in_progress += 1
        source = self.came_from.pop(item.key, step.key)
        self.emit_for(lane, ev.INPUT_RESERVED, step_key=step.key, operation_id=op_id, item_key=item.key,
                      source=source, quantities={"length_m": item.length_m})
        try:
            plan = handler.plan(step, item)
        except PlanError as error:
            raise RunFailure(error.reason, str(error), step.key, lane.version) from error
        if plan.residual_m > 0:
            # 잔량 처리(이월·폐기·scope)는 별도 단계(C0-06)에서 구현한다. 모르는 채로 성공으로 덮지 않는다.
            reason = {"none": "RESIDUAL_UNEXPECTED", "carry_same_product": "RESIDUAL_CARRY_NOT_IMPLEMENTED"}.get(
                step.residual_mode, "RESIDUAL_POLICY_UNKNOWN")
            raise RunFailure(reason, f"{step.key}: 잔량 {plan.residual_m}m가 남지만 잔량 정책({step.residual_mode})을 "
                                     "이번 엔진 범위에서 처리할 수 없습니다.", step.key, lane.version)
        asset = None
        if step.candidates:
            asset = yield self.allocator.acquire(step.candidates)
            self._asset_state(lane, step, op_id, asset, ev.RESERVED)
        if source != step.key:
            self.emit_for(lane, ev.BUFFER_LEFT, item_key=item.key, source=source,
                          asset_key=lane.model.nodes[source].asset_id)
        self.emit_for(lane, ev.INPUT_CONSUMED, step_key=step.key, operation_id=op_id, item_key=item.key,
                      asset_key=asset, quantities={"length_m": item.length_m})
        if plan.relation == "split":
            item.status = "consumed"
        if step.setup_minutes > 0:
            self._asset_state(lane, step, op_id, asset, ev.SETUP)
            self.emit_for(lane, ev.SETUP_STARTED, step_key=step.key, operation_id=op_id, asset_key=asset)
            yield self.env.timeout(step.setup_minutes)
            self.emit_for(lane, ev.SETUP_FINISHED, step_key=step.key, operation_id=op_id, asset_key=asset)
        self.emit_for(lane, ev.PROCESS_STARTED, step_key=step.key, operation_id=op_id, asset_key=asset,
                      item_key=item.key)
        self._asset_state(lane, step, op_id, asset, ev.PROCESSING)
        elapsed, children, held = Fraction(0), [], []
        for planned in plan.outputs:
            yield self.env.timeout(planned.ready_offset - elapsed)
            elapsed = planned.ready_offset
            child = self._make_output(lane, step, item, plan.relation, planned.length_m)
            children.append(child)
            self.emit_for(lane, ev.OUTPUT_UNIT_READY, step_key=step.key, operation_id=op_id,
                          asset_key=asset, item_key=child.key, source=item.key,
                          quantities={"length_m": child.length_m, "ordinal": planned.ordinal})
            if step.handoff == "per_output_unit":
                self._advance(lane, child, step.key)  # 보빈별 인계: 이 산출은 지금 다음 단계가 쓸 수 있다
            else:
                held.append(child)  # total_batch: 모든 산출이 끝난 뒤 한 번에 인계
        self.emit_for(lane, ev.PROCESS_FINISHED, step_key=step.key, operation_id=op_id, asset_key=asset,
                      quantities={"output_units": len(children)})
        self.lineage.append(LineageRecord(
            operation_id=op_id, step_key=step.key, relation=plan.relation, parent_key=item.key,
            child_keys=tuple(c.key for c in children), parent_length_m=item.length_m,
            child_lengths_m=tuple(c.length_m for c in children), residual_length_m=plan.residual_m,
            process_version_id=lane.version))
        if asset is not None:
            self._asset_state(lane, step, op_id, asset, ev.IDLE)
            self.last_version[asset] = lane.version
            self.allocator.release(asset)
        for child in held:
            self._advance(lane, child, step.key)
        self.in_progress -= 1

    def _make_output(self, lane: _Lane, step: StepModel, parent: WorkItem, relation: str,
                     length_m: Fraction) -> WorkItem:
        form = step.output.form or parent.form
        state = step.output.state_code or parent.state
        if relation == "transform":
            parent.form, parent.state = form, state  # 같은 작업물의 상태 전환(새 작업물을 만들지 않는다)
            return parent
        child = self.factory.new(length_m=length_m, form=form, state=state, parent_key=parent.key,
                                 lot=parent.lot, created_at=self.env.now,
                                 process_version_id=lane.version)
        self.items.append(child)
        return child

    def _asset_state(self, lane: _Lane, step: StepModel, op_id: str, asset: str | None, state: str) -> None:
        if asset is None:
            return
        quantities = {"state": state}
        if state == ev.RESERVED:
            # 제품 전환 판단은 실제 선택된 설비의 직전 작업 제품 기준으로 기록한다(07 §13). 교체 시간은 더하지 않는다.
            quantities["previous_process_version_id"] = self.last_version.get(asset)
        self.emit_for(lane, ev.ASSET_STATE_CHANGED, step_key=step.key, operation_id=op_id, asset_key=asset,
                      quantities=quantities)
