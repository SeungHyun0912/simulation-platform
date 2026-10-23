import re
from typing import Annotated

from fastapi import Header, Query, Request, Response

from simulation_platform.domain.errors import (
    ErrorDetail,
    PreconditionRequiredError,
    ValidationFailed,
)
from simulation_platform.domain.pagination import MAX_LIMIT

_IF_MATCH = re.compile(r'^\s*(?:W/)?"?(\d+)"?\s*$')

LimitQuery = Annotated[int | None, Query(ge=1, le=MAX_LIMIT, description="기본 50, 최대 200")]
CursorQuery = Annotated[str | None, Query(description="서버가 발급한 불투명 cursor")]


def request_id_of(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def require_if_match(
    if_match: Annotated[str | None, Header(description='ETag 값. 예: "17"')] = None,
) -> int:
    """If-Match를 row_version 정수로 해석한다. 누락 428, 형식 오류 422."""
    if if_match is None:
        raise PreconditionRequiredError(
            "If-Match 헤더가 필요합니다.",
            [ErrorDetail(message="GET 응답의 ETag를 If-Match로 보내세요.")])
    match = _IF_MATCH.match(if_match)
    if match is None:
        raise ValidationFailed(
            "If-Match 형식이 올바르지 않습니다.",
            [ErrorDetail(message='예: If-Match: "17"', field_path="/if-match")])
    return int(match.group(1))


def set_etag(response: Response, row_version: int) -> None:
    response.headers["ETag"] = f'"{row_version}"'
