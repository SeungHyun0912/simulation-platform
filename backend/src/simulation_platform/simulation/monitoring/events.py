"""엔진 이벤트 표준(07 §9). event_seq는 실행 안에서 1부터 안정적으로 증가한다."""

from dataclasses import dataclass, field
from fractions import Fraction
from typing import Any

from simulation_platform.simulation.numbers import format_decimal

MATERIAL_ARRIVED = "MATERIAL_ARRIVED"
INPUT_RESERVED = "INPUT_RESERVED"
INPUT_CONSUMED = "INPUT_CONSUMED"
SETUP_STARTED = "SETUP_STARTED"
SETUP_FINISHED = "SETUP_FINISHED"
PROCESS_STARTED = "PROCESS_STARTED"
OUTPUT_UNIT_READY = "OUTPUT_UNIT_READY"
PROCESS_FINISHED = "PROCESS_FINISHED"
BUFFER_ENTERED = "BUFFER_ENTERED"
BUFFER_LEFT = "BUFFER_LEFT"
MILESTONE_REACHED = "MILESTONE_REACHED"
SINK_REACHED = "SINK_REACHED"  # 07 §9의 최소 목록 밖: 경로 끝(출고)에 도달한 작업물
ASSET_STATE_CHANGED = "ASSET_STATE_CHANGED"  # 가동률 계산용 설비 상태 전이(IDLE/RESERVED/SETUP/PROCESSING)
RUN_TERMINATED = "RUN_TERMINATED"
RESIDUAL_CREATED = "RESIDUAL_CREATED"
RESIDUAL_CARRIED = "RESIDUAL_CARRIED"
RESIDUAL_DISCARDED = "RESIDUAL_DISCARDED"

# 설비의 배타적 상태(07 §9). IN 대기는 작업물 상태이며 설비 상태와 별도다.
IDLE, RESERVED, SETUP, PROCESSING = "IDLE", "RESERVED", "SETUP", "PROCESSING"


@dataclass(frozen=True)
class Event:
    event_seq: int
    sim_time: Fraction
    event_type: str
    step_key: str | None = None
    operation_id: str | None = None
    asset_key: str | None = None
    item_key: str | None = None
    source: str | None = None
    destination: str | None = None
    quantities: dict[str, Any] = field(default_factory=dict)
    reason: str | None = None
    process_version_id: str | None = None  # 여러 공정이 한 실행을 공유할 때 이벤트가 속한 공정 버전

    def to_dict(self, places: int = 6) -> dict:
        """JSON 직렬화용. 시각·길이는 decimal 문자열(표시용 반올림)과 정확한 분수 문자열을 함께 낸다."""
        def convert(value):
            return format_decimal(value, places) if isinstance(value, Fraction) else value
        return {
            "event_seq": self.event_seq, "sim_time_min": convert(self.sim_time),
            "sim_time_exact": str(self.sim_time), "event_type": self.event_type,
            "step_key": self.step_key, "operation_id": self.operation_id, "asset_key": self.asset_key,
            "item_key": self.item_key, "source": self.source, "destination": self.destination,
            "quantities": {k: convert(v) for k, v in self.quantities.items()}, "reason": self.reason,
            "process_version_id": self.process_version_id}


class EventLimitReached(Exception):
    """이벤트 수가 안전 한도를 넘었다(성공이 아니라 limit_reached로 끝난다)."""


class EventLog:
    def __init__(self, limit: int | None = None) -> None:
        self._events: list[Event] = []
        self._limit = limit

    def emit(self, sim_time: Fraction, event_type: str, **fields) -> Event:
        if self._limit is not None and len(self._events) >= self._limit:
            raise EventLimitReached(self._limit)
        event = Event(event_seq=len(self._events) + 1, sim_time=sim_time, event_type=event_type, **fields)
        self._events.append(event)
        return event

    @property
    def events(self) -> tuple[Event, ...]:
        return tuple(self._events)
