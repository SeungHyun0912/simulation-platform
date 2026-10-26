"""시나리오·시나리오 버전 조회/삭제. 모든 쿼리는 project_id 조건을 필수로 받는다."""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from simulation_platform.models import (
    AssetRevision,
    FlowNode,
    PortPolicy,
    ProcessVersion,
    RequirementCandidate,
    Scenario,
    ScenarioAsset,
    ScenarioProduct,
    ScenarioVersion,
)
from simulation_platform.repositories.keyset import apply_keyset


def get_scenario(session: Session, project_id: uuid.UUID, scenario_id: uuid.UUID,
                 for_update: bool = False) -> Scenario | None:
    stmt = select(Scenario).where(Scenario.id == scenario_id, Scenario.project_id == project_id)
    if for_update:
        stmt = stmt.with_for_update()
    return session.scalars(stmt).one_or_none()


def list_scenarios(session: Session, project_id: uuid.UUID, *, limit: int,
                   cursor_values: list | None) -> list[Scenario]:
    stmt = select(Scenario).where(Scenario.project_id == project_id)
    stmt = apply_keyset(stmt, [Scenario.code], False, cursor_values)
    return list(session.scalars(stmt.limit(limit + 1)))


def latest_versions(session: Session, project_id: uuid.UUID,
                    scenario_ids: list[uuid.UUID]) -> dict[uuid.UUID, ScenarioVersion]:
    latest: dict[uuid.UUID, ScenarioVersion] = {}
    if scenario_ids:
        for version in session.scalars(
            select(ScenarioVersion)
            .where(ScenarioVersion.project_id == project_id,
                   ScenarioVersion.scenario_id.in_(scenario_ids))
            .order_by(ScenarioVersion.scenario_id, ScenarioVersion.version_no)
        ):
            latest[version.scenario_id] = version
    return latest


def get_version(session: Session, project_id: uuid.UUID, version_id: uuid.UUID,
                for_update: bool = False) -> ScenarioVersion | None:
    stmt = select(ScenarioVersion).where(
        ScenarioVersion.id == version_id, ScenarioVersion.project_id == project_id)
    if for_update:
        stmt = stmt.with_for_update()
    return session.scalars(stmt).one_or_none()


def list_versions(session: Session, project_id: uuid.UUID, scenario_id: uuid.UUID, *, limit: int,
                  cursor_values: list | None) -> list[ScenarioVersion]:
    stmt = select(ScenarioVersion).where(
        ScenarioVersion.project_id == project_id, ScenarioVersion.scenario_id == scenario_id)
    stmt = apply_keyset(stmt, [ScenarioVersion.version_no], True, cursor_values)
    return list(session.scalars(stmt.limit(limit + 1)))


def next_version_no(session: Session, scenario_id: uuid.UUID) -> int:
    latest = session.scalar(
        select(ScenarioVersion.version_no).where(ScenarioVersion.scenario_id == scenario_id)
        .order_by(ScenarioVersion.version_no.desc()).limit(1))
    return (latest or 0) + 1


def find_draft(session: Session, project_id: uuid.UUID, scenario_id: uuid.UUID):
    return session.scalars(select(ScenarioVersion).where(
        ScenarioVersion.project_id == project_id, ScenarioVersion.scenario_id == scenario_id,
        ScenarioVersion.status == "draft")).one_or_none()


def latest_approved(session: Session, project_id: uuid.UUID, scenario_id: uuid.UUID):
    return session.scalars(select(ScenarioVersion).where(
        ScenarioVersion.project_id == project_id, ScenarioVersion.scenario_id == scenario_id,
        ScenarioVersion.status == "approved").order_by(ScenarioVersion.version_no.desc())
        .limit(1)).one_or_none()


def products_of(session: Session, project_id: uuid.UUID, version_id: uuid.UUID) -> list[ScenarioProduct]:
    return list(session.scalars(select(ScenarioProduct).where(
        ScenarioProduct.project_id == project_id, ScenarioProduct.scenario_version_id == version_id)
        .order_by(ScenarioProduct.position)))


def assets_of(session: Session, project_id: uuid.UUID, version_id: uuid.UUID) -> list[ScenarioAsset]:
    return list(session.scalars(select(ScenarioAsset).where(
        ScenarioAsset.project_id == project_id, ScenarioAsset.scenario_version_id == version_id)
        .order_by(ScenarioAsset.asset_id)))


def replace_products(session: Session, version_id: uuid.UUID) -> None:
    session.execute(delete(ScenarioProduct).where(ScenarioProduct.scenario_version_id == version_id))


def replace_assets(session: Session, version_id: uuid.UUID) -> None:
    session.execute(delete(ScenarioAsset).where(ScenarioAsset.scenario_version_id == version_id))


def process_versions(session: Session, project_id: uuid.UUID,
                     ids: set[uuid.UUID]) -> dict[uuid.UUID, ProcessVersion]:
    if not ids:
        return {}
    return {v.id: v for v in session.scalars(select(ProcessVersion).where(
        ProcessVersion.project_id == project_id, ProcessVersion.id.in_(ids)))}


def asset_revisions(session: Session, project_id: uuid.UUID,
                    ids: set[uuid.UUID]) -> dict[uuid.UUID, AssetRevision]:
    if not ids:
        return {}
    return {r.id: r for r in session.scalars(select(AssetRevision).where(
        AssetRevision.project_id == project_id, AssetRevision.id.in_(ids)))}


def approved_revisions(session: Session, project_id: uuid.UUID,
                       asset_ids: set[uuid.UUID]) -> dict[uuid.UUID, AssetRevision]:
    """asset id → 현재 승인된 자산 버전(없는 자산은 빠진다)."""
    if not asset_ids:
        return {}
    return {r.asset_id: r for r in session.scalars(select(AssetRevision).where(
        AssetRevision.project_id == project_id, AssetRevision.asset_id.in_(asset_ids),
        AssetRevision.status == "approved"))}


def assets_used_by(session: Session, project_id: uuid.UUID,
                   process_version_ids: set[uuid.UUID]) -> set[uuid.UUID]:
    """공정 버전들이 참조하는 자산(공간 노드의 asset_id, 단계 자원 후보 설비)."""
    if not process_version_ids:
        return set()
    spaces = session.scalars(select(FlowNode.asset_id).where(
        FlowNode.project_id == project_id, FlowNode.process_version_id.in_(process_version_ids),
        FlowNode.asset_id.is_not(None)))
    equipment = session.scalars(select(RequirementCandidate.asset_id).where(
        RequirementCandidate.project_id == project_id,
        RequirementCandidate.process_version_id.in_(process_version_ids)))
    return set(spaces) | set(equipment)


def revision_engine_data(session: Session, project_id: uuid.UUID,
                         revisions: list[AssetRevision]) -> dict[str, dict]:
    """asset id → 엔진이 읽는 자산 버전 data(계약 0.2.0 자산 버전 응답의 storage_capacity·ports 모양)."""
    ports: dict[uuid.UUID, list[dict]] = {r.id: [] for r in revisions}
    if revisions:
        for policy in session.scalars(select(PortPolicy).where(
                PortPolicy.project_id == project_id,
                PortPolicy.asset_revision_id.in_([r.id for r in revisions]))
                .order_by(PortPolicy.port_role)):
            ports[policy.asset_revision_id].append({
                "port_id": str(policy.port_id), "role": policy.port_role,
                "buffer_capacity": policy.buffer_capacity, "dispatch_rule": policy.dispatch_rule,
                "release_rule": policy.release_rule})
    return {str(r.asset_id): {"storage_capacity": r.storage_capacity, "ports": ports[r.id]}
            for r in revisions}
