"""자산 버전 조회. 모든 쿼리는 project_id 조건을 필수로 받는다."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from simulation_platform.domain.revisions import ROLE_ORDER
from simulation_platform.models import AssetPort, AssetRevision, PortPolicy
from simulation_platform.repositories.keyset import apply_keyset


def get_revision(session: Session, project_id: uuid.UUID, revision_id: uuid.UUID,
                 for_update: bool = False) -> AssetRevision | None:
    stmt = select(AssetRevision).where(
        AssetRevision.id == revision_id, AssetRevision.project_id == project_id)
    if for_update:
        stmt = stmt.with_for_update()
    return session.scalars(stmt).one_or_none()


def list_revisions(session: Session, project_id: uuid.UUID, asset_id: uuid.UUID, *, limit: int,
                   cursor_values: list | None) -> list[AssetRevision]:
    """최신 버전부터. limit+1건 반환."""
    stmt = select(AssetRevision).where(
        AssetRevision.project_id == project_id, AssetRevision.asset_id == asset_id)
    stmt = apply_keyset(stmt, [AssetRevision.revision_no], True, cursor_values)
    return list(session.scalars(stmt.limit(limit + 1)))


def next_revision_no(session: Session, asset_id: uuid.UUID) -> int:
    latest = session.scalar(
        select(AssetRevision.revision_no).where(AssetRevision.asset_id == asset_id)
        .order_by(AssetRevision.revision_no.desc()).limit(1))
    return (latest or 0) + 1


def find_open(session: Session, project_id: uuid.UUID, asset_id: uuid.UUID) -> AssetRevision | None:
    return session.scalars(select(AssetRevision).where(
        AssetRevision.project_id == project_id, AssetRevision.asset_id == asset_id,
        AssetRevision.status.in_(("draft", "in_review")))).one_or_none()


def find_approved(session: Session, project_id: uuid.UUID, asset_id: uuid.UUID,
                  for_update: bool = False) -> AssetRevision | None:
    stmt = select(AssetRevision).where(
        AssetRevision.project_id == project_id, AssetRevision.asset_id == asset_id,
        AssetRevision.status == "approved")
    if for_update:
        stmt = stmt.with_for_update()
    return session.scalars(stmt).one_or_none()


def policies_with_ports(session: Session, project_id: uuid.UUID,
                        revision_ids: list[uuid.UUID]) -> dict[uuid.UUID, list]:
    """revision id → [(PortPolicy, AssetPort)] (IN, OUT 순)."""
    result: dict[uuid.UUID, list] = {rid: [] for rid in revision_ids}
    if not revision_ids:
        return result
    rows = session.execute(
        select(PortPolicy, AssetPort)
        .join(AssetPort, (AssetPort.id == PortPolicy.port_id)
              & (AssetPort.project_id == PortPolicy.project_id))
        .where(PortPolicy.project_id == project_id,
               PortPolicy.asset_revision_id.in_(revision_ids))
    ).all()
    for policy, port in rows:
        result[policy.asset_revision_id].append((policy, port))
    for items in result.values():
        items.sort(key=lambda pair: ROLE_ORDER[pair[1].role])
    return result


def summaries_for_assets(session: Session, project_id: uuid.UUID, asset_ids: list[uuid.UUID]):
    """asset id → (가장 최근 버전, 현재 승인본). 없으면 None."""
    latest: dict[uuid.UUID, AssetRevision] = {}
    current: dict[uuid.UUID, AssetRevision] = {}
    if asset_ids:
        for rev in session.scalars(
            select(AssetRevision)
            .where(AssetRevision.project_id == project_id,
                   AssetRevision.asset_id.in_(asset_ids))
            .order_by(AssetRevision.asset_id, AssetRevision.revision_no)
        ):
            latest[rev.asset_id] = rev  # revision_no 오름차순이므로 마지막이 최신
            if rev.status == "approved":
                current[rev.asset_id] = rev
    return {a: (latest.get(a), current.get(a)) for a in asset_ids}
