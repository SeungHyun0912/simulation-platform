"""도메인/프레임워크 오류를 계약의 error envelope로 변환한다."""

from dataclasses import asdict

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from simulation_platform.domain.errors import DomainError


def _envelope(request: Request, code: str, message: str, details: list[dict]) -> dict:
    return {
        "error": {
            "code": code,
            "message": message,
            "request_id": getattr(request.state, "request_id", None),
            "details": details,
        }
    }


def _clean(detail: dict) -> dict:
    return {k: v for k, v in detail.items() if v is not None}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def _domain(request: Request, exc: DomainError) -> JSONResponse:
        details = [_clean(asdict(d)) for d in exc.details]
        return JSONResponse(
            _envelope(request, exc.code, exc.message, details), status_code=exc.status_code
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                "severity": "error",
                "field_path": "/" + "/".join(str(p) for p in err["loc"][1:]),
                "message": err["msg"],
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            _envelope(request, "VALIDATION_ERROR", "요청 형식이 올바르지 않습니다.", details),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
        return JSONResponse(
            _envelope(request, code, str(exc.detail), []), status_code=exc.status_code
        )
