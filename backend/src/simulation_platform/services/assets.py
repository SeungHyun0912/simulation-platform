import uuid

from sqlalchemy import func
from sqlalchemy.orm import Session

from simulation_platform.auth.principal import Principal
from simulation_platform.domain.errors import (
    AssetCodeConflict,
    EditConflictError,
    ErrorDetail,
    NotFoundError,
    ValidationFailed,
)
from simulation_platform.domain.pagination import (
    DEFAULT_LIMIT,
    decode_cursor,
    encode_cursor,
    make_tag,
    parse_sort,
)
from simulation_platform.models import Asset, AssetPort, EquipmentDetail, SpaceDetail
from simulation_platform.models.base import new_id
from simulation_platform.repositories import assets as asset_repo
from simulation_platform.repositories import revisions as revision_repo
from simulation_platform.schemas.asset import (
    AssetCreate,
    AssetOut,
    AssetPatch,
    EquipmentOut,
    PortOut,
    SpaceOut,
)
from simulation_platform.schemas.common import Page
from simulation_platform.schemas.revision import RevisionSummary
from simulation_platform.services.projects import require_project, require_write
from simulation_platform.services.unit_of_work import audit, transaction

SORT_FIELDS = ("sort_order", "code", "name")
DEFAULT_SORT = "sort_order"
NOT_FOUND_MESSAGE = "자산을 찾을 수 없습니다."


def _code_conflict() -> AssetCodeConflict:
    return AssetCodeConflict(
        "같은 프로젝트에 동일한 자산 코드가 이미 있습니다.",
        [ErrorDetail(message="이미 사용 중인 코드입니다.", field_path="/code")])


CONFLICTS = {"uq_asset_project_code": _code_conflict}


def _default_ports(kind: str) -> list[tuple[str, str]]:
    """kind별 기본 포트 (port_key, role). 설비는 IN/OUT, 공간은 ACCESS-01."""
    if kind == "equipment":
        return [("IN", "IN"), ("OUT", "OUT")]
    return [("ACCESS-01", "ACCESS")]


def _summary(revision) -> RevisionSummary | None:
    return None if revision is None else RevisionSummary.model_validate(revision)


def _to_out(asset: Asset, children: asset_repo.Children, summaries: dict) -> AssetOut:
    eq, sp = children.equipment.get(asset.id), children.space.get(asset.id)
    latest, current = summaries.get(asset.id, (None, None))
    return AssetOut(
        id=asset.id, project_id=asset.project_id, kind=asset.kind, code=asset.code,
        name=asset.name, sort_order=asset.sort_order, external_ref=asset.external_ref,
        notes=asset.notes, archived_at=asset.archived_at,
        equipment=None if eq is None else EquipmentOut.model_validate(eq),
        space=None if sp is None else SpaceOut.model_validate(sp),
        ports=[PortOut.model_validate(p) for p in children.ports.get(asset.id, [])],
        current_revision=_summary(current), latest_revision=_summary(latest),
        created_at=asset.created_at, updated_at=asset.updated_at, row_version=asset.row_version)


def _load_out(session: Session, project_id: uuid.UUID, asset_id: uuid.UUID) -> AssetOut:
    session.expire_all()
    asset = asset_repo.get_asset(session, project_id, asset_id)
    if asset is None:
        raise NotFoundError(NOT_FOUND_MESSAGE)
    return _to_out(asset, asset_repo.Children(session, project_id, [asset.id]),
                   revision_repo.summaries_for_assets(session, project_id, [asset.id]))


def create_asset(session: Session, principal: Principal, project_id: uuid.UUID,
                 body: AssetCreate, request_id: str | None) -> AssetOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    asset = Asset(
        id=new_id(), project_id=project_id, kind=body.kind, code=body.code, name=body.name,
        sort_order=body.sort_order, external_ref=body.external_ref, notes=body.notes,
        created_by=principal.user_id)
    with transaction(session, CONFLICTS):
        session.add(asset)
        session.flush()
        if body.kind == "equipment":
            session.add(EquipmentDetail(
                asset_id=asset.id, project_id=project_id, asset_kind="equipment",
                equipment_type=body.equipment.equipment_type,
                model_name=body.equipment.model_name, created_by=principal.user_id))
        else:
            session.add(SpaceDetail(
                asset_id=asset.id, project_id=project_id, asset_kind=body.kind,
                space_type=body.space.space_type, created_by=principal.user_id))
        session.flush()
        for key, role in _default_ports(body.kind):
            session.add(AssetPort(
                id=new_id(), project_id=project_id, asset_id=asset.id, asset_kind=body.kind,
                port_key=key, role=role, label=key, created_by=principal.user_id))
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="asset.create", entity_type="asset",
              entity_id=asset.id, before=None,
              after={"kind": body.kind, "code": body.code, "name": body.name},
              request_id=request_id)
    return _load_out(session, project_id, asset.id)


def get_asset(session: Session, principal: Principal, project_id: uuid.UUID,
              asset_id: uuid.UUID) -> AssetOut:
    require_project(session, principal, project_id)
    return _load_out(session, project_id, asset_id)


def get_ports(session: Session, principal: Principal, project_id: uuid.UUID,
              asset_id: uuid.UUID) -> list[PortOut]:
    return get_asset(session, principal, project_id, asset_id).ports


def list_assets(session: Session, principal: Principal, project_id: uuid.UUID, *,
                kind: str | None, q: str | None, include_archived: bool, sort: str | None,
                limit: int | None, cursor: str | None) -> tuple[list[AssetOut], Page]:
    require_project(session, principal, project_id)
    limit = limit or DEFAULT_LIMIT
    field, desc = parse_sort(sort, SORT_FIELDS, DEFAULT_SORT)
    tag = make_tag("assets", (field, desc),
                   {"kind": kind, "q": q, "archived": include_archived, "p": str(project_id)})
    columns = asset_repo.key_columns(field)
    values = decode_cursor(cursor, tag, len(columns)) if cursor else None
    rows = asset_repo.list_assets(
        session, project_id, kind=kind, q=q, include_archived=include_archived,
        sort_field=field, desc=desc, limit=limit, cursor_values=values)
    page_rows = rows[:limit]
    next_cursor = None
    if len(rows) > limit:
        last = page_rows[-1]
        next_cursor = encode_cursor(
            tag, [v if isinstance(v, int) else str(v)
                  for v in (getattr(last, c.key) for c in columns)])
    ids = [a.id for a in page_rows]
    children = asset_repo.Children(session, project_id, ids)
    summaries = revision_repo.summaries_for_assets(session, project_id, ids)
    return ([_to_out(a, children, summaries) for a in page_rows],
            Page(limit=limit, next_cursor=next_cursor))


def patch_asset(session: Session, principal: Principal, project_id: uuid.UUID,
                asset_id: uuid.UUID, version: int, body: AssetPatch,
                request_id: str | None) -> AssetOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    asset = asset_repo.get_asset(session, project_id, asset_id, for_update=True)
    if asset is None:
        raise NotFoundError(NOT_FOUND_MESSAGE)
    if asset.row_version != version:
        raise EditConflictError(
            "다른 곳에서 먼저 수정되었습니다.",
            [ErrorDetail(message=f"현재 버전은 {asset.row_version}입니다.",
                         field_path="/row_version")])
    if "equipment" in body.model_fields_set and asset.kind != "equipment":
        raise ValidationFailed("이 자산은 설비가 아닙니다.", [ErrorDetail(
            message="설비가 아닌 자산에는 equipment를 수정할 수 없습니다.",
            field_path="/equipment")])
    if "space" in body.model_fields_set and asset.kind == "equipment":
        raise ValidationFailed("이 자산은 공간이 아닙니다.", [ErrorDetail(
            message="설비에는 space를 수정할 수 없습니다.", field_path="/space")])

    before: dict = {}
    after: dict = {}
    with transaction(session, CONFLICTS):
        for name in ("code", "name", "sort_order", "external_ref", "notes"):
            if name in body.model_fields_set:
                before[name] = getattr(asset, name)
                after[name] = getattr(body, name)
                setattr(asset, name, after[name])
        for key, patch, detail_cls in (("equipment", body.equipment, EquipmentDetail),
                                       ("space", body.space, SpaceDetail)):
            if patch is None:
                continue
            detail = session.get(detail_cls, asset.id)
            for name in patch.model_fields_set:
                before[f"{key}.{name}"] = getattr(detail, name)
                after[f"{key}.{name}"] = getattr(patch, name)
                setattr(detail, name, after[f"{key}.{name}"])
            detail.updated_at = func.now()
            detail.updated_by = principal.user_id
        # 하위 상세까지 포함한 자산 단위 버전(ETag)을 올린다.
        asset.row_version = asset.row_version + 1
        asset.updated_at = func.now()
        asset.updated_by = principal.user_id
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="asset.update", entity_type="asset",
              entity_id=asset.id, before=before, after=after, request_id=request_id)
    return _load_out(session, project_id, asset.id)
