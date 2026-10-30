"""배치판 조회·삭제. 모든 쿼리는 project_id 조건을 필수로 받는다."""

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from simulation_platform.models import (
    Asset,
    AssetPlacement,
    AssetPort,
    LayoutAisle,
    LayoutAislePoint,
    LayoutPoint,
    LayoutPortPoint,
    LayoutRoute,
    LayoutRoutePoint,
    LayoutVersion,
)
from simulation_platform.repositories.keyset import apply_keyset

CONTENT_TABLES = (LayoutAislePoint, LayoutAisle, LayoutRoutePoint, LayoutRoute, LayoutPortPoint, AssetPlacement,
                  LayoutPoint)  # 지우는 순서(FK)


def get_version(session: Session, project_id: uuid.UUID, version_id: uuid.UUID,
                for_update: bool = False) -> LayoutVersion | None:
    stmt = select(LayoutVersion).where(LayoutVersion.id == version_id, LayoutVersion.project_id == project_id)
    if for_update:
        stmt = stmt.with_for_update()
    return session.scalars(stmt).one_or_none()


def list_versions(session: Session, project_id: uuid.UUID, *, limit: int,
                  cursor_values: list | None) -> list[LayoutVersion]:
    stmt = select(LayoutVersion).where(LayoutVersion.project_id == project_id)
    stmt = apply_keyset(stmt, [LayoutVersion.version_no], True, cursor_values)
    return list(session.scalars(stmt.limit(limit + 1)))


def next_version_no(session: Session, project_id: uuid.UUID) -> int:
    latest = session.scalar(select(func.max(LayoutVersion.version_no)).where(LayoutVersion.project_id == project_id))
    return (latest or 0) + 1


def find_draft(session: Session, project_id: uuid.UUID) -> LayoutVersion | None:
    return session.scalars(select(LayoutVersion).where(
        LayoutVersion.project_id == project_id, LayoutVersion.status == "draft")).one_or_none()


def latest_approved(session: Session, project_id: uuid.UUID) -> LayoutVersion | None:
    return session.scalars(select(LayoutVersion).where(
        LayoutVersion.project_id == project_id, LayoutVersion.status == "approved")
        .order_by(LayoutVersion.version_no.desc()).limit(1)).one_or_none()


def content(session: Session, project_id: uuid.UUID, version_id: uuid.UUID) -> dict[str, list]:
    def rows(model, *order):
        return list(session.scalars(select(model).where(
            model.project_id == project_id, model.layout_version_id == version_id).order_by(*order)))

    return {"points": rows(LayoutPoint, LayoutPoint.point_key),
            "placements": rows(AssetPlacement, AssetPlacement.asset_id),
            "port_points": rows(LayoutPortPoint, LayoutPortPoint.port_id),
            "routes": rows(LayoutRoute, LayoutRoute.route_key),
            "route_points": rows(LayoutRoutePoint, LayoutRoutePoint.route_id, LayoutRoutePoint.seq),
            "aisles": rows(LayoutAisle, LayoutAisle.aisle_key),
            "aisle_points": rows(LayoutAislePoint, LayoutAislePoint.aisle_id, LayoutAislePoint.seq)}


def delete_content(session: Session, project_id: uuid.UUID, version_id: uuid.UUID) -> None:
    for model in CONTENT_TABLES:
        session.execute(delete(model).where(model.project_id == project_id, model.layout_version_id == version_id))
        session.flush()


def assets(session: Session, project_id: uuid.UUID, ids: set[uuid.UUID]) -> dict[uuid.UUID, Asset]:
    if not ids:
        return {}
    return {a.id: a for a in session.scalars(select(Asset).where(Asset.project_id == project_id, Asset.id.in_(ids)))}


def ports(session: Session, project_id: uuid.UUID, ids: set[uuid.UUID]) -> dict[uuid.UUID, AssetPort]:
    if not ids:
        return {}
    return {p.id: p for p in session.scalars(select(AssetPort).where(
        AssetPort.project_id == project_id, AssetPort.id.in_(ids)))}
