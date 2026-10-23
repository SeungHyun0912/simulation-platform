"""keyset(cursor) 페이지네이션 SQL 헬퍼. 모든 키 컬럼에 같은 정렬 방향을 적용한다."""

import uuid

from sqlalchemy import Select, literal, tuple_

from simulation_platform.domain.errors import ErrorDetail, InvalidCursorError


def _coerce(value, column):
    py = column.type.python_type
    if py is uuid.UUID:
        return uuid.UUID(str(value))
    if py is int:
        if isinstance(value, bool) or not isinstance(value, int):
            raise TypeError(value)
        return value
    if not isinstance(value, str):
        raise TypeError(value)
    return value


def apply_keyset(stmt: Select, columns: list, desc: bool, cursor_values: list | None) -> Select:
    if cursor_values is not None:
        try:
            typed = [literal(_coerce(v, c), c.type) for v, c in zip(cursor_values, columns)]
        except (ValueError, TypeError):
            raise InvalidCursorError(
                "cursor가 올바르지 않습니다.",
                [ErrorDetail(message="cursor 값 형식이 맞지 않습니다.", field_path="/cursor")],
            ) from None
        keys = tuple_(*columns)
        stmt = stmt.where(keys < tuple_(*typed) if desc else keys > tuple_(*typed))
    ordering = [c.desc() if desc else c.asc() for c in columns]
    return stmt.order_by(*ordering)
