"""실행 결과 지표(07 §10). 이벤트로만 계산한다: 엔진 내부 상태를 직접 읽지 않고, 이벤트가 지나가는 동안 하루(1,440분)
단위로 누적한 뒤 하루·주(7일)·월(30일)·전체 구간으로 합산한다. DB·HTTP를 모른다(ADR-0002).

- 시간은 가상 시간(분)이며 근무 달력이 없어 24시간 연속 기준이다. 가동률의 분모는 "구간 길이"다(설비 가동 달력 없음).
- 분모가 0이거나 해당 없는 값(예: 길이가 없는 원자재의 길이 합)은 null이다. 0·Infinity로 바꾸지 않는다.
- 사용 기록이 없는 설비·공간은 행이 없다(0이 아니라 "기록 없음").
- 여러 공정(제품) 생산량을 합산한 값은 만들지 않는다. 지표는 공정 버전별이다(07 §10).
- 재공품(WIP)은 상태 요약 이벤트(`STATE_SNAPSHOT`)·종료 이벤트의 `wip_total`에서 읽는다(구간 끝 시점 값).
"""

import hashlib
import json
from collections import defaultdict
from dataclasses import dataclass
from fractions import Fraction

from simulation_platform.simulation.monitoring import events as ev
from simulation_platform.simulation.numbers import format_decimal

DEFINITION_VERSION = "1"
DAY = Fraction(1440)
WEEK_DAYS, MONTH_DAYS = 7, 30

# (단위, 차원, 설명). 정본 정의는 이 표다(API `GET /metric-definitions`가 그대로 보여 준다).
DEFINITIONS: dict[str, tuple[str, str, str]] = {
    "arrived_items": ("count", "process_version_id", "구간에 입고된 원자재 작업물 수"),
    "arrived_length_m": ("m", "process_version_id", "구간에 입고된 길이 합. 길이 없는 원자재만 있는 공정은 null"),
    "arrived_weight_kg": ("kg", "process_version_id", "구간에 입고된 무게 합. 무게 없는 원자재만 있는 공정은 null"),
    "completed_items": ("count", "process_version_id", "구간에 완제품 milestone(completion)에 도달한 작업물 수(최종 작업물 기준)"),
    "completed_length_m": ("m", "process_version_id", "구간의 생산 완료 길이 합. 길이 없는 작업물만 있으면 null"),
    "completed_weight_kg": ("kg", "process_version_id", "구간의 생산 완료 무게 합. 무게 없는 작업물만 있으면 null"),
    "sunk_items": ("count", "process_version_id", "구간에 경로 끝(출고·적재)에 도달한 작업물 수"),
    "sunk_length_m": ("m", "process_version_id", "구간의 적재 완료 길이 합. 길이 없는 작업물만 있으면 null"),
    "discarded_length_m": ("m", "process_version_id", "구간의 폐기 길이 합(잔량 폐기 포함)"),
    "discarded_weight_kg": ("kg", "process_version_id", "구간의 폐기 무게 합. 폐기 무게 기록이 없으면 null"),
    "throughput_items_per_day": ("count/day", "process_version_id",
                                 "completed_items ÷ 관측 일수(구간 길이 ÷ 1,440분). 관측 시간이 0이면 null"),
    "lead_time_avg_min": ("min", "process_version_id",
                          "구간에 완료된 작업물의 (완료 시각 − 그 작업물의 원자재 입고 시각) 평균. 완료가 없으면 null"),
    "lead_time_max_min": ("min", "process_version_id", "위 리드타임의 최댓값. 완료가 없으면 null"),
    "wip_items": ("count", "process_version_id",
                  "구간 끝 시점의 미완료 작업물 수(설비 안에서 처리 중인 소비된 부모 포함. 단위가 다른 작업물을 섞어 센다)"),
    "wip_length_m": ("m", "process_version_id", "구간 끝 시점의 미완료 길이(설비 안 남은 길이 포함). 길이 없는 작업물만 있으면 null"),
    "wip_weight_kg": ("kg", "process_version_id", "구간 끝 시점의 미완료 무게. 무게 없는 작업물만 있으면 null"),
    "buffer_wait_avg_min": ("min", "node_key", "구간에 그 대기 공간을 떠난 작업물의 (떠난 시각 − 들어온 시각) 평균. 없으면 null"),
    "buffer_wait_max_min": ("min", "node_key", "위 대기 시간의 최댓값. 없으면 null"),
    "buffer_occupancy_avg_items": ("items", "node_key", "그 대기 공간에 머문 작업물 수의 시간 평균(시간적분 ÷ 구간 길이)"),
    "processing_time_min": ("min", "asset_key", "설비가 PROCESSING 상태였던 시간"),
    "setup_time_min": ("min", "asset_key", "설비가 SETUP 상태였던 시간"),
    "reserved_time_min": ("min", "asset_key", "설비가 RESERVED(배정됐으나 시작 전) 상태였던 시간"),
    "blocked_time_min": ("min", "asset_key", "배출 불가로 설비가 BLOCKED 상태였던 시간"),
    "utilization": ("ratio", "asset_key",
                    "processing_time_min ÷ 구간 길이(24시간 연속 기준, 가동 달력 없음). 0~1"),
    "step_operations": ("count", "step", "구간에 시작한 작업(operation) 수"),
    "step_processing_time_min": ("min", "step", "그 단계의 작업이 진행된 시간의 합(작업마다 시작~끝, 동시에 여러 작업이면 겹쳐 더함)"),
    "step_input_wait_item_min": ("item-min", "step", "입력 작업물이 대기 공간에서 작업에 확보되기까지 기다린 시간(작업물·분). 필요한 수가 모이길 기다린 시간"),
    "step_equipment_wait_item_min": ("item-min", "step",
                                     "입력을 확보한 뒤 설비를 배정받기까지 기다린 시간(작업물·분). 설비가 가동 중이라 멈춘 양 — 병목 판정 근거"),
    "step_equipment_wait_avg_min": ("min", "step", "설비 배정을 기다린 작업물의 평균 대기. 없으면 null"),
    "step_equipment_wait_max_min": ("min", "step", "설비 배정을 기다린 작업물의 최대 대기. 없으면 null"),
    "step_blocked_item_min": ("item-min", "step", "산출을 내보낼 공간이 없어 출력이 막혀 있던 시간(작업물·분). 공간 부족으로 멈춘 양 — 병목 판정 근거"),
    "step_peak_concurrency": ("count", "step",
                              "동시에 진행된 작업 수의 최댓값. 운반 단계(자원 무제한 가정)에서는 필요한 지게차·AMR 대수"),
    "space_wait_item_min": ("item-min", "node_key", "다음 공간 자리를 기다린 시간(작업물·분). 공간 여유 부족으로 멈춘 양 — 병목 판정 근거"),
    "space_wait_max_min": ("min", "node_key", "다음 공간 자리를 기다린 최대 시간. 없으면 null"),
    "buffer_item_min": ("item-min", "node_key", "그 대기 공간에 머문 작업물·분(시간적분). 적체 판정 근거"),
    "buffer_peak_items": ("items", "node_key", "그 대기 공간에 동시에 쌓인 작업물 수의 최댓값. 적체 판정 근거"),
}


_STATE_METRICS = {ev.PROCESSING: "processing_time_min", ev.SETUP: "setup_time_min", ev.RESERVED: "reserved_time_min",
                  ev.BLOCKED: "blocked_time_min"}


def _day(t: Fraction) -> int:
    return int(t // DAY)


def _last_day(end: Fraction) -> int:
    """[0, end)에 걸치는 마지막 날 번호(end가 경계면 그 전날). end가 0이면 -1."""
    return int(-((-end) // DAY)) - 1


@dataclass
class _OpTrace:
    """진행 중인 작업 하나: 입력을 확보한 시각, 설비를 배정받았는가, 처리 시작 시각."""

    version: str
    step: str
    reserved_at: Fraction
    items: int = 0
    acquired: bool = False
    started_at: Fraction | None = None


def dimensions_hash(dimensions: dict) -> str:
    return hashlib.sha256(json.dumps(dimensions, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:32]


class MetricCollector:
    """이벤트를 하나씩 받아 누적하고, 끝나면 구간별 지표 행을 만든다."""

    def __init__(self) -> None:
        # (지표 key, 차원 값) → {일 번호: 누적}. 합산 가능한 값(수·길이·시간·적분)만 일 단위로 쌓는다.
        self._add: dict[tuple[str, str], dict[int, Fraction]] = defaultdict(lambda: defaultdict(Fraction))
        self._wait_n: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
        self._wait_max: dict[str, dict[int, Fraction]] = defaultdict(dict)
        self._lead_n: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
        self._lead_max: dict[str, dict[int, Fraction]] = defaultdict(dict)
        self._applicable: set[tuple[str, str]] = set()  # 값이 한 번이라도 있었던 (지표, 차원) — 없으면 null
        self._versions: set[str] = set()
        self._nodes: set[str] = set()
        self._assets: set[str] = set()
        self._origin: dict[str, Fraction] = {}
        self._op_parents: dict[str, list[str]] = defaultdict(list)
        self._op_children: dict[str, list[str]] = defaultdict(list)
        self._entered: dict[str, tuple[Fraction, str]] = {}
        self._occupancy: dict[str, tuple[int, Fraction]] = {}  # 대기 공간 → (현재 수, 마지막 변화 시각)
        self._asset_state: dict[str, tuple[str, Fraction]] = {}
        self._wip: dict[Fraction, dict[str, dict]] = {}  # 시각 → 공정 버전 → wip_total 항목
        self._final_wip: dict[str, dict] | None = None
        # 단계(공정 버전 + 단계 key) 지표용
        self._steps: set[tuple[str, str]] = set()
        self._ops: dict[str, _OpTrace] = {}
        self._blocked: dict[tuple[str, str], Fraction] = {}  # (작업, 작업물) → 출력이 막히기 시작한 시각
        self._entry_wait: dict[str, tuple[Fraction, str]] = {}  # 작업물 → (다음 공간을 기다리기 시작한 시각, 그 공간 노드)
        self._eq_n: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
        self._eq_max: dict[str, dict[int, Fraction]] = defaultdict(dict)
        self._space_max: dict[str, dict[int, Fraction]] = defaultdict(dict)
        self._levels: dict[tuple[str, str], tuple[int, Fraction]] = {}  # (지표, 차원) → (현재 수준, 마지막 변화 시각)
        self._peak: dict[tuple[str, str], dict[int, int]] = defaultdict(dict)

    # --- 누적 -----------------------------------------------------------------------------------
    def _spread(self, key: str, dim: str, start: Fraction, end: Fraction, weight: int | Fraction = 1) -> None:
        """[start, end) 구간의 길이 × weight를 걸친 날마다 나눠 더한다."""
        if end <= start:
            return
        series = self._add[(key, dim)]
        for day in range(_day(start), _last_day(end) + 1):
            lo, hi = max(start, day * DAY), min(end, (day + 1) * DAY)
            if hi > lo:
                series[day] += (hi - lo) * weight

    def _count(self, key: str, dim: str, at: Fraction, amount: int | Fraction) -> None:
        self._add[(key, dim)][_day(at)] += amount
        self._applicable.add((key, dim))

    def observe(self, event) -> None:
        kind, t, version = event.event_type, event.sim_time, event.process_version_id
        q = event.quantities
        if version is not None:
            self._versions.add(version)
        if kind == ev.MATERIAL_ARRIVED:
            self._origin[event.item_key] = t
            self._count("arrived_items", version, t, 1)
            self._amounts("arrived", version, t, q)
        elif kind == ev.MILESTONE_REACHED and event.reason == "completion":
            self._count("completed_items", version, t, 1)
            self._amounts("completed", version, t, q)
            origin = self._origin.get(event.item_key)
            if origin is not None:
                lead = t - origin
                self._count("lead_time_sum", version, t, lead)
                self._lead_n[version][_day(t)] += 1
                day_max = self._lead_max[version]
                day_max[_day(t)] = max(day_max.get(_day(t), lead), lead)
        elif kind == ev.SINK_REACHED:
            self._count("sunk_items", version, t, 1)
            self._amounts("sunk", version, t, q)
        elif kind == ev.RESIDUAL_DISCARDED:
            self._amounts("discarded", version, t, q)
        elif kind == ev.INPUT_CONSUMED and event.operation_id:
            self._op_parents[event.operation_id].append(event.item_key)
            self._resolve_origin(event.operation_id)
        elif kind == ev.OUTPUT_UNIT_READY and event.operation_id:
            self._op_children[event.operation_id].append(event.item_key)
            self._resolve_origin(event.operation_id)
        elif kind == ev.INPUT_RESERVED and event.operation_id:
            op = self._ops.get(event.operation_id)
            if op is None:
                op = self._ops[event.operation_id] = _OpTrace(version, event.step_key, t)
            op.items += 1
            entered = self._entered.get(event.item_key)
            if entered is not None:
                self._count("step_input_wait_item_min", self._step(version, event.step_key), t, t - entered[0])
        elif kind == ev.PROCESS_STARTED and event.operation_id in self._ops:
            op = self._ops[event.operation_id]
            op.started_at, step = t, self._step(op.version, op.step)
            self._count("step_operations", step, t, 1)
            self._level_change("step_peak_concurrency", step, t, +1)
        elif kind == ev.PROCESS_FINISHED and event.operation_id in self._ops:
            op = self._ops.pop(event.operation_id)
            if op.started_at is not None:
                step = self._step(op.version, op.step)
                self._spread("step_processing_time_min", step, op.started_at, t)
                self._level_change("step_peak_concurrency", step, t, -1)
        elif kind == ev.OUT_BLOCKED and event.operation_id:
            self._blocked[(event.operation_id, event.item_key)] = t
        elif kind == ev.OUT_UNBLOCKED and event.operation_id:
            since = self._blocked.pop((event.operation_id, event.item_key), None)
            if since is not None:
                self._count("step_blocked_item_min", self._step(version, event.step_key), t, t - since)
        elif kind == ev.ENTRY_WAITING and event.item_key:
            self._entry_wait[event.item_key] = (t, event.destination)
            self._nodes.add(event.destination)
        elif kind == ev.BUFFER_ENTERED and event.item_key:
            node = event.destination
            self._nodes.add(node)
            waiting = self._entry_wait.pop(event.item_key, None)
            if waiting is not None:  # 다음 공간의 자리가 날 때까지 기다린 시간
                self._count("space_wait_item_min", node, t, t - waiting[0])
                day_max = self._space_max[node]
                day_max[_day(t)] = max(day_max.get(_day(t), t - waiting[0]), t - waiting[0])
            self._entered[event.item_key] = (t, node)
            self._occupancy_change(node, t, +1)
        elif kind == ev.BUFFER_LEFT and event.item_key:
            entered = self._entered.pop(event.item_key, None)
            if entered is not None:
                start, node = entered
                self._count("buffer_wait_sum", node, t, t - start)
                self._wait_n[node][_day(t)] += 1
                day_max = self._wait_max[node]
                day_max[_day(t)] = max(day_max.get(_day(t), t - start), t - start)
                self._occupancy_change(node, t, -1)
        elif kind == ev.ASSET_STATE_CHANGED and event.asset_key:
            if q["state"] == ev.RESERVED:
                self._equipment_acquired(event.operation_id, t)
            self._asset_changed(event.asset_key, q["state"], t)
        elif kind == ev.STATE_SNAPSHOT:
            self._wip[t] = {w["process_version_id"]: w for w in q["wip_total"]}
        elif kind == ev.RUN_TERMINATED and "wip_total" in q:
            self._final_wip = {w["process_version_id"]: w for w in q["wip_total"]}

    def _amounts(self, prefix: str, version: str, t: Fraction, q: dict) -> None:
        for field, suffix in (("length_m", "length_m"), ("weight_kg", "weight_kg")):
            if field in q and q[field] is not None:
                self._count(f"{prefix}_{suffix}", version, t, q[field])

    def _resolve_origin(self, op: str) -> None:
        """작업 산출물의 원자재 입고 시각 = 그 작업이 소비한 부모 중 가장 이른 입고 시각(분할·합류를 따라 전파)."""
        known = [self._origin[p] for p in self._op_parents.get(op, ()) if p in self._origin]
        if not known:
            return
        earliest = min(known)
        for child in self._op_children.get(op, ()):
            self._origin.setdefault(child, earliest)

    def _step(self, version: str, step: str) -> str:
        self._steps.add((version, step))
        return f"{version}|{step}"

    def _equipment_acquired(self, op_id: str | None, t: Fraction) -> None:
        """입력을 확보한 뒤 설비를 배정받기까지 기다린 시간(그 작업의 작업물 수만큼)."""
        op = self._ops.get(op_id) if op_id else None
        if op is None or op.acquired:
            return
        op.acquired = True
        step, wait = self._step(op.version, op.step), t - op.reserved_at
        self._count("step_equipment_wait_item_min", step, t, wait * op.items)
        self._eq_n[step][_day(t)] += op.items
        day_max = self._eq_max[step]
        day_max[_day(t)] = max(day_max.get(_day(t), wait), wait)

    def _level_change(self, metric: str, dim: str, t: Fraction, delta: int) -> None:
        """동시에 있는 수(대기 공간의 작업물·단계의 진행 작업)의 일별 최댓값을 갱신한다. 변화 없는 날도 직전 수준을 반영한다."""
        count, last = self._levels.get((metric, dim), (0, t))
        peaks = self._peak[(metric, dim)]
        for day in range(_day(last), _day(t) + 1):
            peaks[day] = max(peaks.get(day, 0), count)
        count += delta
        peaks[_day(t)] = max(peaks.get(_day(t), 0), count)
        self._levels[(metric, dim)] = (count, t)

    def _occupancy_change(self, node: str, t: Fraction, delta: int) -> None:
        self._level_change("buffer_peak_items", node, t, delta)
        count, since = self._occupancy.get(node, (0, t))
        self._spread("occupancy_integral", node, since, t, count)
        self._add[("occupancy_integral", node)]  # 행이 생기도록 계열을 만든다
        self._occupancy[node] = (count + delta, t)

    def _asset_changed(self, asset: str, state: str, t: Fraction) -> None:
        self._assets.add(asset)
        previous = self._asset_state.get(asset)
        if previous is not None and previous[0] in _STATE_METRICS:
            self._spread(_STATE_METRICS[previous[0]], asset, previous[1], t)
        for name in _STATE_METRICS.values():
            self._add[(name, asset)]  # 기록이 있는 설비는 0도 관측값이다
        self._asset_state[asset] = (state, t)

    # --- 구간별 지표 행 ---------------------------------------------------------------------------
    def finish(self, end_time: Fraction, run_state: str) -> list[dict]:
        for node, (count, since) in self._occupancy.items():
            self._spread("occupancy_integral", node, since, end_time, count)
        for asset, (state, since) in self._asset_state.items():
            if state in _STATE_METRICS:
                self._spread(_STATE_METRICS[state], asset, since, end_time)
        for (metric, dim), (count, last) in self._levels.items():
            peaks = self._peak[(metric, dim)]
            for day in range(_day(last), _last_day(end_time) + 1):
                peaks[day] = max(peaks.get(day, 0), count)
        quality = {"completed": "complete", "horizon_reached": "censored"}.get(run_state, "incomplete")
        rows = []
        for kind, start, end, days in self._windows(end_time):
            rows.extend(self._window_rows(kind, start, end, days, end_time, quality))
        return rows

    def _windows(self, end_time: Fraction):
        yield "run", Fraction(0), end_time, range(_day(end_time) + 1)
        last = _last_day(end_time)
        for size, kind in ((1, "day"), (WEEK_DAYS, "week"), (MONTH_DAYS, "month")):
            for first in range(0, last + 1, size):
                start, end = first * DAY, min((first + size) * DAY, end_time)
                if end > start:
                    yield kind, start, end, range(first, min(first + size, last + 1))

    def _sum(self, key: str, dim: str, days) -> Fraction:
        series = self._add.get((key, dim))
        return Fraction(0) if series is None else sum((series.get(d, 0) for d in days), Fraction(0))

    def _peak_over(self, metric: str, dim: str, days) -> int:
        peaks = self._peak.get((metric, dim), {})
        return max((v for d, v in peaks.items() if d in days), default=0)

    def _wip_at(self, at: Fraction, end_time: Fraction) -> dict[str, dict] | None:
        return self._final_wip if at == end_time else self._wip.get(at)

    def _window_rows(self, kind: str, start: Fraction, end: Fraction, days, end_time: Fraction, quality: str):
        observed = end - start
        rows = []

        def emit(key: str, dims: dict, value: Fraction | int | None) -> None:
            unit = DEFINITIONS[key][0]
            rows.append({
                "metric_key": key, "dimensions": dims, "dimensions_hash": dimensions_hash(dims), "window_kind": kind,
                "window_start_min": {"min": format_decimal(start), "exact": str(start)},
                "window_end_min": {"min": format_decimal(end), "exact": str(end)},
                "value": None if value is None else format_decimal(Fraction(value)), "unit": unit,
                "definition_version": DEFINITION_VERSION, "quality_status": quality})

        def known(key: str, dim: str, value: Fraction) -> Fraction | None:
            return value if (key, dim) in self._applicable else None  # 한 번도 없었던 양은 해당 없음(null)

        wip = self._wip_at(end, end_time)
        for version in sorted(self._versions):
            dims = {"process_version_id": version}
            sums = {k: self._sum(k, version, days) for k in (
                "arrived_items", "arrived_length_m", "arrived_weight_kg", "completed_items", "completed_length_m",
                "completed_weight_kg", "sunk_items", "sunk_length_m", "discarded_length_m", "discarded_weight_kg")}
            for key, value in sums.items():  # 수와 폐기 길이는 기록이 없으면 0(관측한 0), 그 밖의 양은 해당 없으면 null
                emit(key, dims, value if key.endswith("_items") or key == "discarded_length_m"
                     else known(key, version, value))
            emit("throughput_items_per_day", dims,
                 None if observed <= 0 else sums["completed_items"] / (observed / DAY))
            lead_n = sum(self._lead_n[version].get(d, 0) for d in days)
            lead_max = [m for d, m in self._lead_max[version].items() if d in days]
            emit("lead_time_avg_min", dims,
                 None if not lead_n else self._sum("lead_time_sum", version, days) / lead_n)
            emit("lead_time_max_min", dims, max(lead_max) if lead_max else None)
            entry = None if wip is None else wip.get(version)
            for key, field in (("wip_items", "items"), ("wip_length_m", "length_m"), ("wip_weight_kg", "weight_kg")):
                raw = None if entry is None else entry[field]
                emit(key, dims, None if raw is None else Fraction(str(raw)))
        for node in sorted(self._nodes):
            dims = {"node_key": node}
            waits = sum(self._wait_n[node].get(d, 0) for d in days)
            maxima = [m for d, m in self._wait_max[node].items() if d in days]
            emit("buffer_wait_avg_min", dims, None if not waits else self._sum("buffer_wait_sum", node, days) / waits)
            emit("buffer_wait_max_min", dims, max(maxima) if maxima else None)
            emit("buffer_occupancy_avg_items", dims,
                 None if observed <= 0 else self._sum("occupancy_integral", node, days) / observed)
            emit("buffer_item_min", dims, self._sum("occupancy_integral", node, days))
            emit("buffer_peak_items", dims, self._peak_over("buffer_peak_items", node, days))
            space_max = [m for d, m in self._space_max[node].items() if d in days]
            emit("space_wait_item_min", dims, self._sum("space_wait_item_min", node, days))
            emit("space_wait_max_min", dims, max(space_max) if space_max else None)
        for version, step_key in sorted(self._steps):
            dims, step = {"process_version_id": version, "step_key": step_key}, f"{version}|{step_key}"
            emit("step_operations", dims, self._sum("step_operations", step, days))
            emit("step_processing_time_min", dims, self._sum("step_processing_time_min", step, days))
            emit("step_input_wait_item_min", dims, self._sum("step_input_wait_item_min", step, days))
            waited = self._sum("step_equipment_wait_item_min", step, days)
            n = sum(self._eq_n[step].get(d, 0) for d in days)
            maxima = [m for d, m in self._eq_max[step].items() if d in days]
            emit("step_equipment_wait_item_min", dims, waited)
            emit("step_equipment_wait_avg_min", dims, None if not n else waited / n)
            emit("step_equipment_wait_max_min", dims, max(maxima) if maxima else None)
            emit("step_blocked_item_min", dims, self._sum("step_blocked_item_min", step, days))
            emit("step_peak_concurrency", dims, self._peak_over("step_peak_concurrency", step, days))
        for asset in sorted(self._assets):
            dims = {"asset_key": asset}
            for name in _STATE_METRICS.values():
                emit(name, dims, self._sum(name, asset, days))
            emit("utilization", dims, None if observed <= 0 else self._sum("processing_time_min", asset, days) / observed)
        return rows
