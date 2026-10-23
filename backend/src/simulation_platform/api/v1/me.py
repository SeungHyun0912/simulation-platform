from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from simulation_platform.api.v1.common import ERR
from simulation_platform.auth.principal import Principal, get_principal
from simulation_platform.db import get_session
from simulation_platform.schemas.common import Single
from simulation_platform.schemas.me import MeOut
from simulation_platform.services import me as me_service

router = APIRouter(tags=["me"])


@router.get("/me", response_model=Single[MeOut], responses={401: ERR})
def get_me(principal: Principal = Depends(get_principal),
           session: Session = Depends(get_session)):
    """인증 사용자와 허용된 조직·프로젝트."""
    return {"data": me_service.get_me(session, principal)}
