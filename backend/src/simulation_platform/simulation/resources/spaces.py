"""저장·대기 공간과 설비 OUT의 자리(작업물 개수). 같은 asset은 노드·공정이 달라도 하나의 용량을 공유한다(ADR-015).

자리 수가 None이면 제한이 없다. 자리를 기다리는 요청은 들어온 순서(FIFO)로 배정한다.
"""

from collections import deque

import simpy


class SpaceAllocator:
    def __init__(self, env: simpy.Environment, capacities: dict[str, int | None] | None = None) -> None:
        self.env = env
        self.capacity: dict[str, int | None] = dict(capacities or {})
        self.used: dict[str, int] = {}
        self._waiters: dict[str, deque] = {}

    def limited(self, key: str) -> bool:
        return self.capacity.get(key) is not None

    def try_take(self, key: str) -> bool:
        if not self.limited(key):
            return True
        if self._waiters.get(key) or self.used.get(key, 0) >= self.capacity[key]:
            return False  # 먼저 기다리는 요청이 있으면 끼어들지 않는다
        self.used[key] = self.used.get(key, 0) + 1
        return True

    def wait(self, key: str) -> simpy.Event:
        """자리가 나면 이 요청에 배정되는 이벤트(배정된 자리는 이미 차지한 상태)."""
        event = self.env.event()
        self._waiters.setdefault(key, deque()).append(event)
        self._grant(key)
        return event

    def release(self, key: str) -> None:
        if not self.limited(key):
            return
        self.used[key] -= 1
        self._grant(key)

    def _grant(self, key: str) -> None:
        queue = self._waiters.get(key)
        while queue and self.used.get(key, 0) < self.capacity[key]:
            self.used[key] = self.used.get(key, 0) + 1
            queue.popleft().succeed(key)
