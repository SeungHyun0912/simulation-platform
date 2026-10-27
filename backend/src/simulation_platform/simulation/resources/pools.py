"""단계 입력 pool. 작업 한 번이 필요한 수를 한꺼번에 가져간다(07 §5: 부족하면 일부만 가져가지 않는다).

요청은 들어온 순서(FIFO)로 처리하며 앞 요청이 채워지기 전에는 뒤 요청이 끼어들지 않는다. 저장공간이 여러 단계로
갈라지면 그 단계들이 하나의 pool을 함께 쓰므로 각 단계의 요청이 번갈아 채워진다.
"""

from collections import deque

import simpy


class BatchPool:
    def __init__(self, env: simpy.Environment) -> None:
        self.env = env
        self.items: deque = deque()
        self._waiters: deque = deque()

    def put(self, item) -> None:
        self.items.append(item)
        self._grant()

    def get(self, count: int, who: str | None = None) -> simpy.Event:
        """작업물 count개가 모이면 그 묶음(tuple)으로 성공하는 이벤트. `who`는 진단에 쓰는 요청 단계 이름이다."""
        event = self.env.event()
        self._waiters.append((count, event, who))
        self._grant()
        return event

    def head(self) -> tuple[int, int, str | None] | None:
        """가장 앞 요청이 필요한 수를 못 채워 기다리고 있으면 (모인 수, 필요한 수, 요청 단계), 아니면 None."""
        if self._waiters and len(self.items) < self._waiters[0][0]:
            return len(self.items), self._waiters[0][0], self._waiters[0][2]
        return None

    def _grant(self) -> None:
        while self._waiters and len(self.items) >= self._waiters[0][0]:
            count, event, _who = self._waiters.popleft()
            event.succeed(tuple(self.items.popleft() for _ in range(count)))
