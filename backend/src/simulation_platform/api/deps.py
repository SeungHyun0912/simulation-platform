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


def require_idempotency_key(
    idempotency_key: Annotated[str | None, Header(
        description="실행 요청마다 클라이언트가 만든 고유 값(1~128자). 같은 키·같은 본문이면 기존 결과를 돌려준다.")] = None,
) -> str:
    """Idempotency-Key를 읽는다. 누락 428, 길이·문자 오류 422."""
    if idempotency_key is None:
        raise PreconditionRequiredError(
            "Idempotency-Key 헤더가 필요합니다.",
            [ErrorDetail(message="재시도해도 실행이 두 번 만들어지지 않도록 요청마다 고유한 값을 보내세요.")])
    key = idempotency_key.strip()
    if not 1 <= len(key) <= 128 or not key.isprintable():
        raise ValidationFailed(
            "Idempotency-Key 형식이 올바르지 않습니다.",
            [ErrorDetail(message="1~128자의 출력 가능한 문자여야 합니다.", field_path="/idempotency-key")])
    return key


def set_etag(response: Response, row_version: int) -> None:
    response.headers["ETag"] = f'"{row_version}"'
