"""설비 allocator. 같은 asset_id는 실행에 한 번만 생성하고 모든 단계가 공유한다(ADR-015).

단계마다 후보 설비 목록이 다르고 후보가 겹칠 수 있어(예: 같은 조사기를 1차·2차 조사에서 재방문), SimPy Resource를
단계별로 따로 만들지 않고 이 allocator가 전역 요청 순서(FIFO)로 하나씩 배정한다. 후보 선택은 스냅샷에 적힌 후보 순서
(안정된 동순위 처리 순서)에서 가장 먼저 비어 있는 설비다. 한 단계가 임의 순서로 설비를 하나씩 쥐고 기다리지 않는다.
"""

from dataclasses import dataclass

import simpy


@dataclass
class _Waiter:
    seq: int
    candidates: tuple[str, ...]
    event: simpy.Event


class EquipmentAllocator:
    def __init__(self, env: simpy.Environment) -> None:
        self.env = env
        self._busy: set[str] = set()
        self._waiters: list[_Waiter] = []
        self._seq = 0

    def acquire(self, candidates: tuple[str, ...]) -> simpy.Event:
        """후보 중 하나를 배정받는다. 이벤트 값은 배정된 asset id다."""
        event = self.env.event()
        self._seq += 1
        self._waiters.append(_Waiter(self._seq, candidates, event))
        self._dispatch()
        return event

    def release(self, asset_id: str) -> None:
        self._busy.discard(asset_id)
        self._dispatch()

    def is_busy(self, asset_id: str) -> bool:
        return asset_id in self._busy

    def _dispatch(self) -> None:
        for waiter in list(self._waiters):
            asset = next((a for a in waiter.candidates if a not in self._busy), None)
            if asset is None:
                continue
            self._busy.add(asset)
            self._waiters.remove(waiter)
            waiter.event.succeed(asset)
