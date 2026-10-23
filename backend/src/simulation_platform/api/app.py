from fastapi import FastAPI

from simulation_platform.api.errors import register_exception_handlers
from simulation_platform.api.request_id import register_request_id
from simulation_platform.api.v1.health import router as health_router


def create_app() -> FastAPI:
    app = FastAPI(title="Simulation Platform API", version="0.0.0")
    register_request_id(app)
    register_exception_handlers(app)
    app.include_router(health_router, prefix="/api/v1")
    return app


app = create_app()
