"""자산 조회. 모든 쿼리는 project_id 조건을 필수로 받는다."""

import uuid

from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session

from simulation_platform.models import Asset, AssetPort, EquipmentDetail, SpaceDetail
from simulation_platform.repositories.keyset import apply_keyset

SORT_COLUMNS = {"sort_order": Asset.sort_order, "code": Asset.code, "name": Asset.name}


def key_columns(sort_field: str) -> list:
    cols = [SORT_COLUMNS[sort_field]]
    if sort_field != "code":
        cols.append(Asset.code)
    cols.append(Asset.id)
    return cols


def _escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_assets(
    session: Session,
    project_id: uuid.UUID,
    *,
    kind: str | None,
    q: str | None,
    include_archived: bool,
    sort_field: str,
    desc: bool,
    limit: int,
    cursor_values: list | None,
) -> list[Asset]:
    """limit+1건을 반환한다(다음 페이지 존재 확인용)."""
    stmt: Select = select(Asset).where(Asset.project_id == project_id)
    if kind:
        stmt = stmt.where(Asset.kind == kind)
    if not include_archived:
        stmt = stmt.where(Asset.archived_at.is_(None))
    if q:
        pattern = f"%{_escape_like(q)}%"
        stmt = stmt.where(or_(Asset.code.ilike(pattern, escape="\\"),
                              Asset.name.ilike(pattern, escape="\\")))
    stmt = apply_keyset(stmt, key_columns(sort_field), desc, cursor_values).limit(limit + 1)
    return list(session.scalars(stmt))


def get_asset(session: Session, project_id: uuid.UUID, asset_id: uuid.UUID,
              for_update: bool = False) -> Asset | None:
    stmt = select(Asset).where(Asset.id == asset_id, Asset.project_id == project_id)
    if for_update:
        stmt = stmt.with_for_update()
    return session.scalars(stmt).one_or_none()


class Children:
    """자산 묶음의 상세·포트(자산 id별)."""

    def __init__(self, session: Session, project_id: uuid.UUID, ids: list[uuid.UUID]):
        self.equipment: dict[uuid.UUID, EquipmentDetail] = {}
        self.space: dict[uuid.UUID, SpaceDetail] = {}
        self.ports: dict[uuid.UUID, list[AssetPort]] = {i: [] for i in ids}
        if not ids:
            return
        for d in session.scalars(select(EquipmentDetail).where(
                EquipmentDetail.project_id == project_id, EquipmentDetail.asset_id.in_(ids))):
            self.equipment[d.asset_id] = d
        for d in session.scalars(select(SpaceDetail).where(
                SpaceDetail.project_id == project_id, SpaceDetail.asset_id.in_(ids))):
            self.space[d.asset_id] = d
        for p in session.scalars(select(AssetPort).where(
                AssetPort.project_id == project_id, AssetPort.asset_id.in_(ids))
                .order_by(AssetPort.port_key)):
            self.ports[p.asset_id].append(p)
