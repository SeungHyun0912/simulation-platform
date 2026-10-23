"""인증 주체. 운영 인증 adapter(TECH-002)는 미결이라 local 테스트 주체만 제공한다.

local 모드(AUTH_MODE=local)는 APP_ENV=production에서 허용하지 않으며 OpenAPI에 노출하지 않는다.
"""

import uuid
from dataclasses import dataclass

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from simulation_platform.db import get_session
from simulation_platform.domain.errors import UnauthenticatedError
from simulation_platform.models import AppUser
from simulation_platform.settings import Settings, get_settings


@dataclass(frozen=True)
class Principal:
    user_id: uuid.UUID
    display_name: str


def local_auth_enabled(settings: Settings) -> bool:
    return settings.auth_mode == "local" and settings.app_env != "production"


def get_principal(
    x_debug_user: str | None = Header(default=None, include_in_schema=False),
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> Principal:
    if not local_auth_enabled(settings):
        raise UnauthenticatedError("인증 adapter가 구성되지 않았습니다.")
    try:
        user_id = uuid.UUID(x_debug_user or "")
    except ValueError:
        raise UnauthenticatedError("인증이 필요합니다.") from None
    user = session.get(AppUser, user_id)
    if user is None or user.status != "active":
        raise UnauthenticatedError("인증이 필요합니다.")
    return Principal(user_id=user.id, display_name=user.display_name)
