"""제품·재료 조회. 모든 쿼리는 project_id 조건을 필수로 받는다."""

import uuid

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from simulation_platform.repositories.keyset import apply_keyset


def key_columns(model, sort_field: str) -> list:
    cols = [getattr(model, sort_field)]
    if sort_field != "code":
        cols.append(model.code)
    cols.append(model.id)
    return cols


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_items(session: Session, model, project_id: uuid.UUID, *, q: str | None,
               include_archived: bool, sort_field: str, desc: bool, limit: int,
               cursor_values: list | None) -> list:
    """limit+1건을 반환한다(다음 페이지 존재 확인용)."""
    stmt: Select = select(model).where(model.project_id == project_id)
    if not include_archived:
        stmt = stmt.where(model.archived_at.is_(None))
    if q:
        pattern = f"%{_escape_like(q)}%"
        stmt = stmt.where(or_(model.code.ilike(pattern, escape="\\"),
                              model.name.ilike(pattern, escape="\\")))
    stmt = apply_keyset(stmt, key_columns(model, sort_field), desc, cursor_values).limit(limit + 1)
    return list(session.scalars(stmt))


def get_item(session: Session, model, project_id: uuid.UUID, item_id: uuid.UUID,
             for_update: bool = False):
    stmt = select(model).where(model.id == item_id, model.project_id == project_id)
    if for_update:
        stmt = stmt.with_for_update()
    return session.scalars(stmt).one_or_none()
