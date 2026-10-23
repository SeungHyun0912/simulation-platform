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


@lru_cache
def get_settings() -> Settings:
    return Settings()
