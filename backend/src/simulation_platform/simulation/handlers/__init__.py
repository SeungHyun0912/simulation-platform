"""명시 handler registry(ADR-011). 이름·버전으로만 선택하고 코드 문자열을 실행하지 않는다."""

from simulation_platform.simulation.handlers.base import HandlerDef
from simulation_platform.simulation.handlers.standard import STANDARD_HANDLERS

REGISTRY: dict[tuple[str, str], HandlerDef] = {(h.name, h.version): h for h in STANDARD_HANDLERS}


def get_handler(name: str | None, version: str | None) -> HandlerDef | None:
    return REGISTRY.get((name or "", version or "1"))
