"""worker 자식 프로세스 시험용 대역(느리거나 비정상인 자식을 흉내 낸다). spawn이 이름으로 불러오므로 모듈 최상위에 둔다."""

import os
import time


def sleeps_forever(snapshot, conn):
    time.sleep(600)


def crashes(snapshot, conn):
    os._exit(3)


def raises(snapshot, conn):
    try:
        raise RuntimeError("엔진 내부 오류 흉내")
    except RuntimeError as exc:
        conn.send(("engine_error", f"{type(exc).__name__}: {exc}"))
        conn.close()
