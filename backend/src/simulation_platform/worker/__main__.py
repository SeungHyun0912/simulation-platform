"""worker 실행: `python -m simulation_platform.worker [--once] [--worker-id ID]`.

DATABASE_URL이 가리키는 DB의 job 큐를 읽는다. API 서버와 별개 프로세스이며, 개발에서는 `scripts/run_dev_worker.ps1`로 띄운다.
"""

import argparse
import logging
import signal
import sys

from sqlalchemy.orm import sessionmaker

from simulation_platform.db import get_engine
from simulation_platform.settings import get_settings
from simulation_platform.worker.service import default_worker_id, process_one, run_forever


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="시뮬레이션 실행 worker")
    parser.add_argument("--once", action="store_true", help="job 하나만 처리하고 끝낸다(없으면 바로 끝)")
    parser.add_argument("--worker-id", default=None)
    args = parser.parse_args(argv[1:])
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = get_settings()
    sessions = sessionmaker(get_engine())
    worker_id = args.worker_id or default_worker_id()
    if args.once:
        status = process_one(sessions, settings, worker_id)
        print("처리할 job 없음" if status is None else f"run 상태: {status}")
        return 0
    stop = {"flag": False}
    signal.signal(signal.SIGINT, lambda *_: stop.update(flag=True))
    print(f"worker {worker_id} 시작(DB 큐를 {settings.worker_poll_seconds:g}초마다 확인, 중지: Ctrl+C)")
    run_forever(sessions, settings, worker_id, should_stop=lambda: stop["flag"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
