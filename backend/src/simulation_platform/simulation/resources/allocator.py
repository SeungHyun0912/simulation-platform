"""설비 allocator. 같은 asset_id는 실행에 한 번만 생성하고 모든 단계가 공유한다(ADR-015).

단계마다 후보 설비 목록이 다르고 후보가 겹칠 수 있어(예: 같은 조사기를 1차·2차 조사에서 재방문), SimPy Resource를
단계별로 따로 만들지 않고 이 allocator가 전역 요청 순서(FIFO)로 하나씩 배정한다. 후보 선택은 스냅샷에 적힌 후보 순서
(안정된 동순위 처리 순서)에서 가장 먼저 비어 있는 설비다. 한 단계가 임의 순서로 설비를 하나씩 쥐고 기다리지 않는다.
"""

from collections import deque
from dataclasses import dataclass

import simpy


@dataclass
class _Waiter:
    candidates: tuple[str, ...]
    event: simpy.Event
    done: bool = False


class EquipmentAllocator:
    """배정이 끝날 때마다 "비어 있는 후보를 가진 대기자가 없다"는 상태가 유지된다. 그래서 설비 하나가 풀리면 그 설비를
    후보로 가진 가장 오래된 대기자 한 명만 보면 되고, 새 요청은 자기 후보만 보면 된다(대기열 전체를 훑지 않는다 —
    한 달치 입고처럼 대기열이 길어도 비용이 대기 길이에 비례해 늘지 않는다)."""

    def __init__(self, env: simpy.Environment) -> None:
        self.env = env
        self._busy: set[str] = set()
        self._queues: dict[str, deque[_Waiter]] = {}  # 설비 → 그 설비를 후보로 가진 대기자(요청 순서)

    def acquire(self, candidates: tuple[str, ...]) -> simpy.Event:
        """후보 중 하나를 배정받는다. 이벤트 값은 배정된 asset id다."""
        event = self.env.event()
        asset = next((a for a in candidates if a not in self._busy), None)
        if asset is not None:
            self._busy.add(asset)
            event.succeed(asset)
            return event
        waiter = _Waiter(candidates, event)
        for candidate in candidates:
            self._queues.setdefault(candidate, deque()).append(waiter)
        return event

    def release(self, asset_id: str) -> None:
        self._busy.discard(asset_id)
        queue = self._queues.get(asset_id)
        while queue:
            waiter = queue.popleft()
            if waiter.done:  # 다른 후보 설비로 이미 배정된 대기자
                continue
            waiter.done = True
            self._busy.add(asset_id)
            waiter.event.succeed(asset_id)
            return

    def is_busy(self, asset_id: str) -> bool:
        return asset_id in self._busy
