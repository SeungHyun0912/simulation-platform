"""제품·재료 서비스. 둘은 버전이 없는 기준정보라 구조가 같아 공통 로직을 쓰고 엔티티별 설정만 다르다."""

import uuid
from dataclasses import dataclass

from sqlalchemy import func
from sqlalchemy.orm import Session

from simulation_platform.auth.principal import Principal
from simulation_platform.domain.errors import (
    DomainError,
    EditConflictError,
    ErrorDetail,
    MaterialCodeConflict,
    NotFoundError,
    ProductCodeConflict,
)
from simulation_platform.domain.pagination import (
    DEFAULT_LIMIT,
    decode_cursor,
    encode_cursor,
    make_tag,
    parse_sort,
)
from simulation_platform.models import MaterialDefinition, Product
from simulation_platform.models.base import new_id
from simulation_platform.repositories import catalog as repo
from simulation_platform.schemas.catalog import MaterialOut, ProductOut
from simulation_platform.schemas.common import Page
from simulation_platform.services.projects import require_project, require_write
from simulation_platform.services.unit_of_work import audit, transaction

SORT_FIELDS = ("code", "name")
DEFAULT_SORT = "code"


@dataclass(frozen=True)
class Entity:
    kind: str                       # 감사 로그 entity_type 접두와 태그
    model: type
    out: type
    conflict: type[DomainError]
    constraint: str
    not_found: str
    label: str


PRODUCT = Entity("product", Product, ProductOut, ProductCodeConflict, "uq_product_project_code",
                 "제품을 찾을 수 없습니다.", "제품")
MATERIAL = Entity("material", MaterialDefinition, MaterialOut, MaterialCodeConflict,
                  "uq_material_project_code", "재료를 찾을 수 없습니다.", "재료")


def _conflicts(entity: Entity) -> dict:
    return {entity.constraint: lambda: entity.conflict(
        f"같은 프로젝트에 동일한 {entity.label} 코드가 이미 있습니다.",
        [ErrorDetail(message="이미 사용 중인 코드입니다.", field_path="/code")])}


def create(entity: Entity, session: Session, principal: Principal, project_id: uuid.UUID,
           body, request_id: str | None):
    access = require_project(session, principal, project_id)
    require_write(access)
    row = entity.model(id=new_id(), project_id=project_id, created_by=principal.user_id,
                       **body.model_dump(mode="json"))
    with transaction(session, _conflicts(entity)):
        session.add(row)
        session.flush()
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action=f"{entity.kind}.create",
              entity_type=entity.kind, entity_id=row.id, before=None,
              after={"code": row.code, "name": row.name}, request_id=request_id)
    session.refresh(row)
    return entity.out.model_validate(row)


def get(entity: Entity, session: Session, principal: Principal, project_id: uuid.UUID,
        item_id: uuid.UUID):
    require_project(session, principal, project_id)
    row = repo.get_item(session, entity.model, project_id, item_id)
    if row is None:
        raise NotFoundError(entity.not_found)
    return entity.out.model_validate(row)


def list_page(entity: Entity, session: Session, principal: Principal, project_id: uuid.UUID, *,
              q: str | None, include_archived: bool, sort: str | None, limit: int | None,
              cursor: str | None):
    require_project(session, principal, project_id)
    limit = limit or DEFAULT_LIMIT
    field, desc = parse_sort(sort, SORT_FIELDS, DEFAULT_SORT)
    tag = make_tag(f"{entity.kind}s", (field, desc),
                   {"q": q, "archived": include_archived, "p": str(project_id)})
    columns = repo.key_columns(entity.model, field)
    values = decode_cursor(cursor, tag, len(columns)) if cursor else None
    rows = repo.list_items(session, entity.model, project_id, q=q,
                           include_archived=include_archived, sort_field=field, desc=desc,
                           limit=limit, cursor_values=values)
    page_rows = rows[:limit]
    next_cursor = None
    if len(rows) > limit:
        last = page_rows[-1]
        next_cursor = encode_cursor(tag, [str(getattr(last, c.key)) for c in columns])
    return ([entity.out.model_validate(r) for r in page_rows],
            Page(limit=limit, next_cursor=next_cursor))


def patch(entity: Entity, session: Session, principal: Principal, project_id: uuid.UUID,
          item_id: uuid.UUID, version: int, body, request_id: str | None):
    access = require_project(session, principal, project_id)
    require_write(access)
    row = repo.get_item(session, entity.model, project_id, item_id, for_update=True)
    if row is None:
        raise NotFoundError(entity.not_found)
    if row.row_version != version:
        raise EditConflictError(
            "다른 곳에서 먼저 수정되었습니다.",
            [ErrorDetail(message=f"현재 버전은 {row.row_version}입니다.", field_path="/row_version")])

    before: dict = {}
    after: dict = {}
    with transaction(session, _conflicts(entity)):
        for name in body.model_fields_set:
            before[name] = getattr(row, name)
            value = getattr(body, name)
            if name == "default_spec":
                # 보낸 필드만 교체하고 나머지는 유지한다.
                value = {**row.default_spec,
                         **{k: getattr(value, k).model_dump(mode="json")
                            for k in value.model_fields_set}}
            after[name] = value
            setattr(row, name, value)
        row.row_version = row.row_version + 1
        row.updated_at = func.now()
        row.updated_by = principal.user_id
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action=f"{entity.kind}.update",
              entity_type=entity.kind, entity_id=row.id, before=before, after=after,
              request_id=request_id)
    session.refresh(row)
    return entity.out.model_validate(row)
