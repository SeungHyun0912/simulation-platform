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

    def get(self, count: int) -> simpy.Event:
        """작업물 count개가 모이면 그 묶음(tuple)으로 성공하는 이벤트."""
        event = self.env.event()
        self._waiters.append((count, event))
        self._grant()
        return event

    def _grant(self) -> None:
        while self._waiters and len(self.items) >= self._waiters[0][0]:
            count, event = self._waiters.popleft()
            event.succeed(tuple(self.items.popleft() for _ in range(count)))
