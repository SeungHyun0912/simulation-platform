from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """환경변수 기반 설정. 실제 값은 backend/.env에만 두고 커밋하지 않는다."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    database_url: str = ""
    artifact_root: str = ""
    auth_mode: str = ""
    cors_allowed_origins: str = ""
    # 실행 플랫폼(CR be08). 이벤트 한도는 입력 스냅샷에 들어가 결과에 영향을 주므로 요청 때 고정되고,
    # 나머지는 worker의 운영 설정이다.
    run_event_limit: int = 2_000_000
    worker_poll_seconds: float = 2.0
    worker_lease_seconds: float = 60.0
    worker_heartbeat_seconds: float = 10.0
    worker_wall_timeout_seconds: float = 1800.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
