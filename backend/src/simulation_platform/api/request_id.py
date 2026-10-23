import re
import uuid

from fastapi import FastAPI, Request

HEADER = "X-Request-ID"
# 사용자 입력 request ID는 검증 후에만 채택한다(로그 주입 방지).
_VALID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def register_request_id(app: FastAPI) -> None:
    @app.middleware("http")
    async def _request_id(request: Request, call_next):
        supplied = request.headers.get(HEADER)
        rid = supplied if supplied and _VALID.match(supplied) else f"req-{uuid.uuid4().hex}"
        request.state.request_id = rid
        response = await call_next(request)
        response.headers[HEADER] = rid
        return response
