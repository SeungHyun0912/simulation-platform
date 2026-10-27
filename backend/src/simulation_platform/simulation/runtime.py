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
from simulation_platform.simulation.resources import BatchPool, EquipmentAllocator, SpaceAllocator

COMPLETED, STALLED, HORIZON_REACHED = "completed", "stalled", "horizon_reached"
FAILED, LIMIT_REACHED = "failed", "limit_reached"


@dataclass(frozen=True)
class Arrival:
    """시나리오가 정한 원자재 도착. 길이·무게는 decimal 문자열·정수·Fraction(float는 받지 않는다).

    길이가 없는 원자재(예: P04·P05의 2t·3.3t 원자재)는 `length_m`을 비우고 `weight_kg`만 쓴다(해당 없음 ≠ 0).
    길이와 무게는 서로 환산하지 않는다."""

    length_m: object = None
    at: object = 0
    count: int = 1
    form: str | None = None
    state: str | None = None
    lot: str | None = None
    weight_kg: object = None


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
    # 실행 끝에 남은 잔량 풀: {pool, length_m, process_version_id, disposition(discarded|carried|unknown|open)}
    residuals: tuple[dict, ...] = ()
    # 입력 부족(stalled/INSUFFICIENT_INPUT)일 때 어느 단계가 몇 개를 기다리는데 몇 개가 필요한지: {step, pool, waiting, needed}
    shortfalls: tuple[dict, ...] = ()

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


def _carries(step: StepModel) -> bool:
    return (step.residual is not None and step.residual.mode == "carry_same_product"
            and step.handler == "split_length")


def _measures(item: WorkItem, **extra) -> dict:
    """이벤트에 싣는 작업물의 양. 길이·무게는 있는 것만 싣는다(없는 값을 0으로 채우지 않는다)."""
    found = {}
    if item.length_m is not None:
        found["length_m"] = item.length_m
    if item.weight_kg is not None:
        found["weight_kg"] = item.weight_kg
    return {**found, **extra}


@dataclass
class _PoolEntry:
    """잔량 풀의 한 덩어리. 어느 공정에서 나왔고 실행 종료 때 어떻게 처리할지를 함께 기억한다."""

    length_m: Fraction
    version: str
    on_run_end: str
    on_product_change: str = "unknown"


class _Lane:
    def __init__(self, env: simpy.Environment, lane: Lane) -> None:
        self.model, self.arrivals = lane.model, lane.arrivals
        self.version = lane.model.version_id
        # 단계 입력 pool(앞 노드 key). 저장공간이 여러 단계로 갈라지면 그 단계들이 같은 pool을 쓴다.
        self.pools = {i.pool: BatchPool(env) for step in lane.model.steps.values() for i in step.inputs}
        self.op_count = {key: 0 for key in lane.model.steps}
        self.pending = sum(a.count for a in lane.arrivals)
        self.partial: dict[str, list[WorkItem]] = {}  # 단계 → 입력 일부만 확보해 나머지를 기다리는 묶음


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
            for arrival in lane.arrivals:  # 정확한 값만: float·음수·0 양은 실행 전에 거부한다
                amounts = [to_fraction(v) for v in (arrival.length_m, arrival.weight_kg) if v is not None]
                if not amounts or any(a <= 0 for a in amounts) or to_fraction(arrival.at) < 0 or arrival.count < 1:
                    raise ValueError("도착에는 0보다 큰 길이 또는 무게가 있어야 하고 시각은 0 이상, 개수는 1 이상이어야 합니다.")
        self.env = simpy.Environment(initial_time=Fraction(0))
        self.log = EventLog(event_limit)
        self.factory = ItemFactory()
        self.items: list[WorkItem] = []
        self.lineage: list[LineageRecord] = []
        self.allocator = EquipmentAllocator(self.env)
        capacities: dict[str, int | None] = {}
        for lane in lanes:  # 같은 저장공간은 공정이 달라도 하나의 용량이다(ADR-015)
            for asset, capacity in lane.model.spaces.items():
                if asset in capacities and capacities[asset] != capacity:
                    raise ValueError(f"저장공간 {asset}의 용량이 공정마다 다릅니다(같은 자산 버전이어야 함).")
                capacities[asset] = capacity
        self.spaces = SpaceAllocator(self.env, capacities)
        self.out_spaces = SpaceAllocator(self.env)  # 설비 OUT 자리(release_after_out)
        self.in_space: dict[str, tuple[str, str | None]] = {}  # 작업물 → (머무는 buffer key, 공간 asset)
        self.lanes = [_Lane(self.env, lane) for lane in lanes]
        self.lane_of = {lane.version: lane for lane in self.lanes}
        self.came_from: dict[str, str] = {}  # 작업물 key → 대기하던 buffer key
        self.last_version: dict[str, str] = {}  # 설비 → 직전에 처리한 공정 버전(제품 전환 판단 기록용)
        self.in_progress = 0  # 시작했지만 끝나지 않은 작업 수(부모는 소비됐고 산출은 아직 없는 상태도 WIP이다)
        self.pools: dict[str, list[_PoolEntry]] = {}  # 잔량 풀(범위 key → 덩어리, 들어온 순서)
        self._residual_report: list[dict] = []
        self._shortfalls: list[dict] = []

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
            residuals = self._settle_residuals(state)
            self.emit(ev.RUN_TERMINATED, reason=reason, quantities={
                "residual_pools": len(residuals),
                "state": state, "wip_items": sum(1 for i in self.items if i.status == "active"),
                "operations_in_progress": self.in_progress})
        return RunResult(
            state=state, reason=reason, censored=state == HORIZON_REACHED, end_time=self.env.now,
            horizon=self.horizon, events=self.log.events, lineage=tuple(self.lineage),
            items=tuple(replace(i) for i in self.items),
            assumptions=tuple(a for lane in self.lanes for a in lane.model.assumptions),
            engine_version=ENGINE_VERSION, seed=self.seed,
            process_version_ids=tuple(lane.version for lane in self.lanes),
            residuals=tuple(self._residual_report), shortfalls=tuple(self._shortfalls))

    def _final_state(self) -> tuple[str, str | None]:
        wip = sum(1 for i in self.items if i.status == "active") + self.in_progress
        if not wip and not sum(lane.pending for lane in self.lanes):
            return COMPLETED, None
        if self.env.peek() == float("inf"):
            # 이벤트가 더 없는데 작업물이 남았다: 즉시 교착으로 단정하지 않고 진단 이유와 함께 stalled로 기록한다.
            self._shortfalls = self._input_shortfalls()
            return STALLED, "INSUFFICIENT_INPUT" if self._shortfalls else "WIP_REMAINING"
        return HORIZON_REACHED, "HORIZON"  # 지평선까지 끝나지 않은 관측 중단(censored)

    def _input_shortfalls(self) -> list[dict]:
        """멈춘 시점에 남은 작업물이 **모두** 입력 pool에 놓여 있거나 입력 일부만 확보한 묶음에 들어 있고 진행 중인 작업이
        없으면, 한 작업이 필요로 하는 수를 못 채워 기다리는 것(입력 부족)이다. 이때 부족한 단계 목록을 돌려준다.
        공간 자리나 설비 점유 등 다른 이유로 남은 작업물이 하나라도 있으면 입력 부족으로 단정하지 않는다."""
        starving, held = [], 0
        for lane in self.lanes:
            for key, pool in lane.pools.items():
                held += len(pool.items)
                found = pool.head()
                if found is None:
                    continue
                have, need, step = found
                partial = len(lane.partial.get(step, ()))
                if have or partial:
                    starving.append({"process_version_id": lane.version, "pool": key, "step": step,
                                     "waiting": have, "held": partial, "needed": need})
            held += sum(len(batch) for batch in lane.partial.values())
        active = sum(1 for i in self.items if i.status == "active")
        return starving if starving and held == active and self.in_progress == 0 else []

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
            item = self.factory.new(
                length_m=None if arrival.length_m is None else to_fraction(arrival.length_m),
                weight_kg=None if arrival.weight_kg is None else to_fraction(arrival.weight_kg),
                form=arrival.form, state=arrival.state, lot=arrival.lot, created_at=self.env.now,
                process_version_id=lane.version)
            self.items.append(item)
            lane.pending -= 1
            self.emit_for(lane, ev.MATERIAL_ARRIVED, item_key=item.key, destination=lane.model.source_key,
                          quantities=_measures(item))
            self._enter(lane, item, lane.model.source_key)

    def _enter(self, lane: _Lane, item: WorkItem, key: str, origin: str | None = None) -> None:
        node = lane.model.nodes[key]
        item.location = key
        if node.kind == "buffer":
            self.emit_for(lane, ev.BUFFER_ENTERED, item_key=item.key, destination=key,
                          asset_key=node.asset_id, quantities=_measures(item))
            self.in_space[item.key] = (key, node.asset_id)
            if node.next_keys and all(lane.model.nodes[f].kind == "operation" for f in node.next_keys):
                self.came_from[item.key] = key  # 다음 단계가 가져갈 때 공간을 떠난다(BUFFER_LEFT)
                lane.pools[key].put(item)  # 갈라지면 여러 단계가 이 공간에서 들어온 순서대로 가져간다
                return
        elif node.kind == "operation":
            lane.pools[origin].put(item)
            return
        elif node.kind == "milestone":
            self.emit_for(lane, ev.MILESTONE_REACHED, item_key=item.key, destination=key,
                          quantities=_measures(item),
                          reason="completion" if key == lane.model.completion_key else None)
        elif node.kind == "sink":
            item.status = "completed"
            self.emit_for(lane, ev.SINK_REACHED, item_key=item.key, destination=key,
                          quantities=_measures(item))
            return
        self._forward(lane, item, key)

    # --- 공간 자리(C0-05) -----------------------------------------------------------------------
    def _limited_space(self, lane: _Lane, key: str) -> str | None:
        node = lane.model.nodes[key]
        if node.kind == "buffer" and node.asset_id is not None and self.spaces.limited(node.asset_id):
            return node.asset_id
        return None

    def _leave_space(self, lane: _Lane, item: WorkItem) -> None:
        held = self.in_space.pop(item.key, None)
        if held is None:
            return
        key, asset = held
        self.emit_for(lane, ev.BUFFER_LEFT, item_key=item.key, source=key, asset_key=asset)
        if asset is not None:
            self.spaces.release(asset)

    def _forward(self, lane: _Lane, item: WorkItem, key: str) -> None:
        """설비가 아닌 위치(도착·공간·milestone)에서 다음 노드로. 다음 공간이 차 있으면 그 자리에서 기다린다."""
        following = lane.model.nodes[key].next_key
        if following is None:
            return
        space = self._limited_space(lane, following)
        if space is None or self.spaces.try_take(space):
            self._leave_space(lane, item)
            self._enter(lane, item, following, key)
            return
        self.emit_for(lane, ev.ENTRY_WAITING, item_key=item.key, source=key, destination=following,
                      asset_key=space)
        self.env.process(self._wait_and_enter(lane, item, space, following, key))

    def _wait_and_enter(self, lane: _Lane, item: WorkItem, space: str, following: str, origin: str):
        yield self.spaces.wait(space)
        self._leave_space(lane, item)
        self._enter(lane, item, following, origin)

    def _deliver(self, lane: _Lane, step: StepModel, op_id: str, asset: str | None, child: WorkItem,
                 resume: str | None):
        """산출을 다음 노드로 내보낸다. 다음 공간이 차 있으면 OUT 배출 정책(DEC-006)을 따른다.

        hold: 자리가 날 때까지 설비가 막힌다(BLOCKED). release_after_out: OUT에 놓고 설비를 계속 쓴다(OUT이 차면 막힌다).
        설비가 없는 단계(검사·운반)는 그 단계에서 기다린다. resume은 막힘이 풀린 뒤 돌아갈 설비 상태다.
        """
        following = lane.model.nodes[step.key].next_key
        if following is None:
            return
        space = self._limited_space(lane, following)
        if space is None or self.spaces.try_take(space):
            self._enter(lane, child, following, step.key)
            return
        policy = step.out_policies.get(asset) if asset is not None else None
        if policy is not None and policy.kind == "release_after_out":
            out_key = f"OUT:{asset}"
            self.out_spaces.capacity.setdefault(out_key, policy.out_capacity)
            if not self.out_spaces.try_take(out_key):
                yield from self._blocked(lane, step, op_id, asset, child, out_key, self.out_spaces.wait(out_key),
                                         resume)
            self.emit_for(lane, ev.OUT_STORED, step_key=step.key, operation_id=op_id, asset_key=asset,
                          item_key=child.key, destination=out_key)
            self.env.process(self._out_mover(lane, child, out_key, space, following, step.key))
            return
        yield from self._blocked(lane, step, op_id, asset, child, following, self.spaces.wait(space), resume)
        self._enter(lane, child, following, step.key)

    def _blocked(self, lane: _Lane, step: StepModel, op_id: str, asset: str | None, child: WorkItem,
                 destination: str, granted: simpy.Event, resume: str | None):
        self.emit_for(lane, ev.OUT_BLOCKED, step_key=step.key, operation_id=op_id, asset_key=asset,
                      item_key=child.key, destination=destination)
        self._asset_state(lane, step, op_id, asset, ev.BLOCKED)
        yield granted
        self.emit_for(lane, ev.OUT_UNBLOCKED, step_key=step.key, operation_id=op_id, asset_key=asset,
                      item_key=child.key, destination=destination)
        if resume is not None:
            self._asset_state(lane, step, op_id, asset, resume)

    def _out_mover(self, lane: _Lane, child: WorkItem, out_key: str, space: str, following: str, origin: str):
        if not self.spaces.try_take(space):
            yield self.spaces.wait(space)
        self.out_spaces.release(out_key)
        self.emit_for(lane, ev.BUFFER_LEFT, item_key=child.key, source=out_key)
        self._enter(lane, child, following, origin)

    # --- 단계 ------------------------------------------------------------------------------
    def _dispatcher(self, lane: _Lane, step: StepModel):
        """입력마다 필요한 수를 한꺼번에 확보하면 작업을 시작한다(07 §5). 설비는 작업이 따로 기다린다."""
        while True:
            batch: list[WorkItem] = []
            lane.partial[step.key] = batch
            for need in step.inputs:
                batch.extend((yield lane.pools[need.pool].get(need.count, step.key)))
            self.env.process(self._operate(lane, step, tuple(batch)))

    def _operate(self, lane: _Lane, step: StepModel, items: tuple[WorkItem, ...]):
        lane.op_count[step.key] += 1
        op_id = f"{step.key}#{lane.op_count[step.key]}"
        self.in_progress += 1
        for reserved in items:
            source = self.came_from.pop(reserved.key, step.key)
            self.emit_for(lane, ev.INPUT_RESERVED, step_key=step.key, operation_id=op_id, item_key=reserved.key,
                          source=source, quantities=_measures(reserved))
        item = items[0]
        carry = _carries(step)
        plan = None
        if not carry:  # 이월이 없으면 설비를 쥐기 전에 계획해 맞지 않는 입력을 일찍 실패시킨다
            plan = self._plan(lane, step, items, Fraction(0))
            self._reject_unhandled_residual(lane, step, plan)
        delay = step.delay
        if delay is not None and delay.occupancy == "releases_machine":
            yield from self._precondition_delay(lane, step, op_id, None, delay)  # 설비를 쥐지 않고 기다린다
        asset = None
        if step.candidates:
            asset = yield self.allocator.acquire(step.candidates)
            self._asset_state(lane, step, op_id, asset, ev.RESERVED)
            self._clear_foreign_residual(lane, step, op_id, asset)
        if delay is not None and delay.occupancy == "occupies_machine":
            yield from self._precondition_delay(lane, step, op_id, asset, delay)  # 설비를 쥔 채 기다린다
        pool_key = None
        if carry:  # 이월은 실제 시작 시점의 잔량 풀로 계획한다(기다리는 동안 풀이 바뀔 수 있다)
            pool_key = self._pool_key(lane, step, item, asset)
            carried = self._take_pool(lane, step, op_id, pool_key)
            plan = self._plan(lane, step, items, carried)
        for taken in items:
            self._leave_space(lane, taken)  # 기다리던 공간을 떠나며 자리를 돌려준다
        # 공급은 투입을 그대로 넘기고(소비 아님), 지정 산출의 transfer는 작업이 끝날 때 소비한다.
        consume_at_end = plan.relation == "yield" and step.consume_policy == "transfer"
        if plan.relation != "supply" and not consume_at_end:
            self._consume(lane, step, op_id, asset, items, plan.relation)
        if step.setup_minutes > 0 and (step.setup_trigger == "per_operation" or self._product_changed(lane, asset)):
            self._asset_state(lane, step, op_id, asset, ev.SETUP)
            self.emit_for(lane, ev.SETUP_STARTED, step_key=step.key, operation_id=op_id, asset_key=asset)
            yield self.env.timeout(step.setup_minutes)
            self.emit_for(lane, ev.SETUP_FINISHED, step_key=step.key, operation_id=op_id, asset_key=asset)
        self.emit_for(lane, ev.PROCESS_STARTED, step_key=step.key, operation_id=op_id, asset_key=asset,
                      item_key=item.key)
        self._asset_state(lane, step, op_id, asset, ev.PROCESSING)
        elapsed, children, held = Fraction(0), [], []
        for index, planned in enumerate(plan.outputs):
            yield self.env.timeout(planned.ready_offset - elapsed)
            elapsed = planned.ready_offset
            parent = items[planned.ordinal - 1] if plan.relation == "supply" else item
            child = self._make_output(lane, step, parent, plan.relation, planned.length_m, planned.weight_kg)
            children.append(child)
            self.emit_for(lane, ev.OUTPUT_UNIT_READY, step_key=step.key, operation_id=op_id,
                          asset_key=asset, item_key=child.key, source=parent.key,
                          quantities=_measures(child, ordinal=planned.ordinal))
            if step.handoff == "per_output_unit":  # 보빈별 인계: 이 산출은 지금 다음 단계가 쓸 수 있다
                more = index + 1 < len(plan.outputs)
                yield from self._deliver(lane, step, op_id, asset, child, ev.PROCESSING if more else None)
            else:
                held.append(child)  # total_batch: 모든 산출이 끝난 뒤 한 번에 인계
        self.emit_for(lane, ev.PROCESS_FINISHED, step_key=step.key, operation_id=op_id, asset_key=asset,
                      quantities={"output_units": len(children)})
        if consume_at_end:
            self._consume(lane, step, op_id, asset, items, plan.relation)
        self._record_lineage(lane, step, op_id, items, children, plan)
        if carry and plan.residual_m > 0:
            self.pools.setdefault(pool_key, []).append(
                _PoolEntry(plan.residual_m, lane.version, step.residual.on_run_end, step.residual.on_product_change))
            self.emit_for(lane, ev.RESIDUAL_CREATED, step_key=step.key, operation_id=op_id,
                          destination=pool_key, quantities={"length_m": plan.residual_m,
                                                            "scope": step.residual.scope})
        for child in held:  # 일괄 인계는 설비를 놓기 전에 내보낸다(막히면 설비가 점유된 채 기다림)
            yield from self._deliver(lane, step, op_id, asset, child, None)
        if asset is not None:
            self._asset_state(lane, step, op_id, asset, ev.IDLE)
            self.last_version[asset] = lane.version
            self.allocator.release(asset)
        self.in_progress -= 1

    def _product_changed(self, lane: _Lane, asset: str | None) -> bool:
        """설비의 직전 작업이 다른 제품(공정 버전)이었는가. 첫 작업(직전 작업 없음)은 준비 없이 시작한다."""
        previous = None if asset is None else self.last_version.get(asset)
        return previous is not None and previous != lane.version

    def _precondition_delay(self, lane: _Lane, step: StepModel, op_id: str, asset: str | None, delay):
        self.emit_for(lane, ev.PRECONDITION_DELAY_STARTED, step_key=step.key, operation_id=op_id, asset_key=asset,
                      quantities={"minutes": delay.minutes, "occupancy": delay.occupancy})
        yield self.env.timeout(delay.minutes)
        self.emit_for(lane, ev.PRECONDITION_DELAY_FINISHED, step_key=step.key, operation_id=op_id, asset_key=asset)

    def _consume(self, lane: _Lane, step: StepModel, op_id: str, asset: str | None,
                 items: tuple[WorkItem, ...], relation: str) -> None:
        for consumed in items:
            self.emit_for(lane, ev.INPUT_CONSUMED, step_key=step.key, operation_id=op_id, item_key=consumed.key,
                          asset_key=asset, quantities=_measures(consumed))
            if relation in ("split", "yield"):
                consumed.status = "consumed"

    def _record_lineage(self, lane: _Lane, step: StepModel, op_id: str, items: tuple[WorkItem, ...],
                        children: list[WorkItem], plan) -> None:
        if plan.relation == "supply":  # 같은 작업물이 공급 상태로 바뀐 것: 작업물마다 하나씩
            for moved in items:
                self.lineage.append(LineageRecord(
                    operation_id=op_id, step_key=step.key, relation="supply", parent_key=moved.key,
                    child_keys=(moved.key,), parent_length_m=moved.length_m, child_lengths_m=(moved.length_m,),
                    process_version_id=lane.version))
            return
        yielded = plan.relation == "yield"
        lengths = [i.length_m for i in items]
        self.lineage.append(LineageRecord(
            operation_id=op_id, step_key=step.key, relation=plan.relation, parent_key=items[0].key,
            child_keys=tuple(c.key for c in children),
            parent_length_m=None if any(n is None for n in lengths) else sum(lengths, Fraction(0)),
            child_lengths_m=tuple(c.length_m for c in children), residual_length_m=plan.residual_m,
            process_version_id=lane.version, carried_in_m=plan.carried_in_m,
            parent_keys=tuple(i.key for i in items) if yielded else (),
            accounting_mode="abstract_yield" if yielded else "physical"))

    # --- 잔량(03 §6, 07 §3 ResidualPool) ----------------------------------------------------------
    def _plan(self, lane: _Lane, step: StepModel, items: tuple[WorkItem, ...], carried: Fraction):
        try:
            return get_handler(step.handler, step.handler_version).plan(step, items, carried)
        except PlanError as error:
            raise RunFailure(error.reason, str(error), step.key, lane.version) from error

    def _reject_unhandled_residual(self, lane: _Lane, step: StepModel, plan) -> None:
        """이월하지 않는 단계에서 잔량이 생기면 성공으로 덮지 않는다."""
        if plan.residual_m <= 0:
            return
        reason = "RESIDUAL_UNEXPECTED" if step.residual_mode == "none" else "RESIDUAL_POLICY_UNKNOWN"
        raise RunFailure(reason, f"{step.key}: 잔량 {plan.residual_m}m가 남지만 잔량 정책({step.residual_mode})으로 "
                                 "처리할 수 없습니다(이월은 carry_same_product만).", step.key, lane.version)

    def _clear_foreign_residual(self, lane: _Lane, step: StepModel, op_id: str, asset: str) -> None:
        """다른 제품이 이 설비에서 일을 시작하면 설비에 남은 이전 제품의 잔량을 그 제품의 정책대로 처리한다.
        discard는 모두 폐기, carry는 그대로 두고, 정책이 미정이면 그 상황이 실제로 생겼으므로 실패시킨다."""
        key = f"machine:{asset}"
        entries = self.pools.get(key)
        if not entries:
            return
        kept = []
        for entry in entries:
            if entry.version == lane.version or entry.on_product_change == "carry":
                kept.append(entry)
            elif entry.on_product_change == "discard":
                self.emit_for(lane, ev.RESIDUAL_DISCARDED, step_key=step.key, operation_id=op_id, source=key,
                              reason="PRODUCT_CHANGE",
                              quantities={"length_m": entry.length_m, "from_process_version_id": entry.version})
            else:
                raise RunFailure("RESIDUAL_PRODUCT_CHANGE_POLICY_UNKNOWN",
                                 f"{step.key}: 설비에 다른 제품의 잔량 {entry.length_m}m가 남아 있는데 제품 전환 시 처리 "
                                 "정책이 미정입니다.", step.key, lane.version)
        self.pools[key] = kept

    def _pool_key(self, lane: _Lane, step: StepModel, item: WorkItem, asset: str | None) -> str:
        scope = step.residual.scope
        if scope == "machine":
            return f"machine:{asset}"
        if scope == "product":
            return f"product:{lane.version}"
        if scope == "operation":
            return f"operation:{lane.version}/{step.key}"
        if item.lot is None:
            raise RunFailure("RESIDUAL_LOT_UNKNOWN", f"{step.key}: lot별 잔량 범위인데 작업물에 lot이 없습니다.",
                             step.key, lane.version)
        return f"lot:{item.lot}"

    def _take_pool(self, lane: _Lane, step: StepModel, op_id: str, key: str) -> Fraction:
        """풀의 잔량을 이 작업에 잇는다. 다른 제품의 잔량이면 on_product_change 정책을 따른다."""
        carried = Fraction(0)
        for entry in self.pools.pop(key, []):
            if entry.version != lane.version:
                policy = step.residual.on_product_change
                if policy == "discard":
                    self.emit_for(lane, ev.RESIDUAL_DISCARDED, step_key=step.key, operation_id=op_id, source=key,
                                  reason="PRODUCT_CHANGE",
                                  quantities={"length_m": entry.length_m, "from_process_version_id": entry.version})
                    continue
                if policy != "carry":
                    raise RunFailure("RESIDUAL_PRODUCT_CHANGE_POLICY_UNKNOWN",
                                     f"{step.key}: 다른 제품의 잔량 {entry.length_m}m가 풀에 있는데 제품 전환 시 처리 정책이 "
                                     "미정입니다.", step.key, lane.version)
            carried += entry.length_m
            self.emit_for(lane, ev.RESIDUAL_CARRIED, step_key=step.key, operation_id=op_id, source=key,
                          quantities={"length_m": entry.length_m, "from_process_version_id": entry.version})
        return carried

    def _settle_residuals(self, state: str) -> list[dict]:
        """실행 끝에 남은 잔량. 완료된 실행에만 on_run_end를 적용하고(관측 중단·정체는 open) 결과에 보고한다."""
        for key, entries in self.pools.items():
            for entry in entries:
                disposition = "open"
                if state == COMPLETED:
                    disposition = {"discard": "discarded", "carry": "carried"}.get(entry.on_run_end, "unknown")
                    if disposition == "discarded":
                        self.emit(ev.RESIDUAL_DISCARDED, source=key, reason="RUN_END",
                                  process_version_id=entry.version, quantities={"length_m": entry.length_m})
                self._residual_report.append({"pool": key, "length_m": entry.length_m,
                                              "process_version_id": entry.version, "disposition": disposition})
        return self._residual_report

    def _make_output(self, lane: _Lane, step: StepModel, parent: WorkItem, relation: str,
                     length_m: Fraction | None, weight_kg: Fraction | None = None) -> WorkItem:
        form = step.output.form or parent.form
        state = step.output.state_code or parent.state
        if relation in ("transform", "supply"):
            parent.form, parent.state = form, state  # 같은 작업물의 상태 전환(새 작업물을 만들지 않는다)
            return parent
        # 지정 산출(yield)은 부모가 여럿이라 작업물에는 첫 번째 부모를 두고 전체는 계보(parent_keys)에 남긴다.
        child = self.factory.new(length_m=length_m, weight_kg=weight_kg, form=form, state=state,
                                 parent_key=parent.key,
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
