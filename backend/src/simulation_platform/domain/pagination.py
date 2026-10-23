"""cursor 페이지네이션의 순수 로직(HTTP/ORM 비의존). 계약: CR-backend-20261023-be01c §2."""

import base64
import binascii
import hashlib
import json

from simulation_platform.domain.errors import ErrorDetail, InvalidCursorError, ValidationFailed

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def parse_sort(sort: str | None, allowed: tuple[str, ...], default: str) -> tuple[str, bool]:
    """`field` 또는 `-field`를 (field, descending)으로 해석한다. 단일 필드만 지원."""
    raw = sort or default
    desc = raw.startswith("-")
    field = raw[1:] if desc else raw
    if field not in allowed:
        raise ValidationFailed(
            "허용되지 않은 정렬 필드입니다.",
            [ErrorDetail(message=f"sort는 {', '.join(allowed)} 중 하나여야 합니다.",
                         field_path="/sort")],
        )
    return field, desc


def make_tag(resource: str, sort: tuple[str, bool], filters: dict) -> str:
    """정렬·필터가 바뀐 요청에 이전 cursor가 재사용되는 것을 막기 위한 식별 문자열."""
    digest = hashlib.sha256(json.dumps(filters, sort_keys=True, default=str).encode()).hexdigest()
    return f"{resource}:{sort[0]}:{'d' if sort[1] else 'a'}:{digest[:12]}"


def encode_cursor(tag: str, values: list) -> str:
    raw = json.dumps({"t": tag, "v": values}, separators=(",", ":"), default=str).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str, tag: str, size: int) -> list:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded.encode()))
        values = data["v"]
        ok = data["t"] == tag and isinstance(values, list) and len(values) == size
    except (binascii.Error, ValueError, KeyError, TypeError):
        ok = False
    if not ok:
        raise InvalidCursorError(
            "cursor가 올바르지 않습니다.",
            [ErrorDetail(message="cursor를 해석할 수 없거나 정렬·필터 조건과 맞지 않습니다.",
                         field_path="/cursor")],
        )
    return values
