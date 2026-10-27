from fastapi import FastAPI

from simulation_platform.api.errors import register_exception_handlers
from simulation_platform.api.request_id import register_request_id
from simulation_platform.api.v1 import (
    assets,
    health,
    materials,
    me,
    metrics,
    process_versions,
    products,
    projects,
    revisions,
    runs,
    scenarios,
)
from simulation_platform.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    if settings.app_env == "production" and settings.auth_mode == "local":
        raise RuntimeError("AUTH_MODE=local은 production에서 사용할 수 없습니다.")
    app = FastAPI(title="Simulation Platform API", version="0.0.0")
    register_request_id(app)
    register_exception_handlers(app)
    for module in (health, me, projects, assets, revisions, products, materials, process_versions,
                   scenarios, runs, metrics):
        app.include_router(module.router, prefix="/api/v1")
    return app


app = create_app()
