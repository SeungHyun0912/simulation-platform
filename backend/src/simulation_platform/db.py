from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from simulation_platform.settings import get_settings


@lru_cache
def get_engine() -> Engine:
    url = get_settings().database_url
    if not url:
        raise RuntimeError("DATABASE_URL이 설정되지 않았습니다.")
    return create_engine(url, pool_pre_ping=True)


def get_session() -> Iterator[Session]:
    """요청당 하나의 Session. 커밋은 서비스가 하고, 예외 시 close가 롤백한다."""
    with Session(get_engine()) as session:
        yield session
