"""공정 버전·그래프 조회/삭제. 모든 쿼리는 project_id 조건을 필수로 받는다."""

import uuid

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from simulation_platform.models import (
    Asset,
    FlowEdge,
    FlowNode,
    ProcessStep,
    ProcessVersion,
    RequirementCandidate,
    ResourceRequirement,
)
from simulation_platform.repositories.keyset import apply_keyset


def get_version(session: Session, project_id: uuid.UUID, version_id: uuid.UUID,
                for_update: bool = False) -> ProcessVersion | None:
    stmt = select(ProcessVersion).where(
        ProcessVersion.id == version_id, ProcessVersion.project_id == project_id)
    if for_update:
        stmt = stmt.with_for_update()
    return session.scalars(stmt).one_or_none()


def list_versions(session: Session, project_id: uuid.UUID, product_id: uuid.UUID, *, limit: int,
                  cursor_values: list | None) -> list[ProcessVersion]:
    stmt = select(ProcessVersion).where(
        ProcessVersion.project_id == project_id, ProcessVersion.product_id == product_id)
    stmt = apply_keyset(stmt, [ProcessVersion.version_no], True, cursor_values)
    return list(session.scalars(stmt.limit(limit + 1)))


def next_version_no(session: Session, product_id: uuid.UUID) -> int:
    latest = session.scalar(
        select(ProcessVersion.version_no).where(ProcessVersion.product_id == product_id)
        .order_by(ProcessVersion.version_no.desc()).limit(1))
    return (latest or 0) + 1


def find_open(session: Session, project_id: uuid.UUID, product_id: uuid.UUID):
    return session.scalars(select(ProcessVersion).where(
        ProcessVersion.project_id == project_id, ProcessVersion.product_id == product_id,
        ProcessVersion.status.in_(("draft", "in_review")))).one_or_none()


def find_approved(session: Session, project_id: uuid.UUID, product_id: uuid.UUID,
                  for_update: bool = False):
    stmt = select(ProcessVersion).where(
        ProcessVersion.project_id == project_id, ProcessVersion.product_id == product_id,
        ProcessVersion.status == "approved")
    if for_update:
        stmt = stmt.with_for_update()
    return session.scalars(stmt).one_or_none()


def summaries_for_products(session: Session, project_id: uuid.UUID, product_ids: list[uuid.UUID]):
    """product id → (가장 최근 버전, 현재 승인본). 없으면 None."""
    latest: dict[uuid.UUID, ProcessVersion] = {}
    current: dict[uuid.UUID, ProcessVersion] = {}
    if product_ids:
        for version in session.scalars(
            select(ProcessVersion)
            .where(ProcessVersion.project_id == project_id,
                   ProcessVersion.product_id.in_(product_ids))
            .order_by(ProcessVersion.product_id, ProcessVersion.version_no)
        ):
            latest[version.product_id] = version
            if version.status == "approved":
                current[version.product_id] = version
    return {p: (latest.get(p), current.get(p)) for p in product_ids}


def asset_kinds(session: Session, project_id: uuid.UUID, ids: set[uuid.UUID]) -> dict[uuid.UUID, str]:
    """이 프로젝트의 자산 id → kind. 없는 id(또는 다른 프로젝트의 자산)는 포함되지 않는다."""
    if not ids:
        return {}
    rows = session.execute(select(Asset.id, Asset.kind).where(
        Asset.project_id == project_id, Asset.id.in_(ids))).all()
    return {i: k for i, k in rows}


def load_graph(session: Session, project_id: uuid.UUID, version_id: uuid.UUID):
    """버전의 그래프를 GraphNode/GraphEdge JSON 모양의 dict로 읽는다."""
    nodes = list(session.scalars(
        select(FlowNode).where(FlowNode.project_id == project_id,
                               FlowNode.process_version_id == version_id)
        .order_by(FlowNode.display_order, FlowNode.node_key)))
    steps = {s.node_id: s for s in session.scalars(
        select(ProcessStep).where(ProcessStep.project_id == project_id,
                                  ProcessStep.process_version_id == version_id))}
    requirements: dict[uuid.UUID, list[ResourceRequirement]] = {}
    for req in session.scalars(
        select(ResourceRequirement).where(ResourceRequirement.project_id == project_id,
                                          ResourceRequirement.process_version_id == version_id)
        .order_by(ResourceRequirement.role_key)):
        requirements.setdefault(req.step_node_id, []).append(req)
    candidates: dict[uuid.UUID, list[tuple[str, RequirementCandidate]]] = {}
    for cand, code in session.execute(
        select(RequirementCandidate, Asset.code)
        .join(Asset, (Asset.id == RequirementCandidate.asset_id)
              & (Asset.project_id == RequirementCandidate.project_id))
        .where(RequirementCandidate.project_id == project_id,
               RequirementCandidate.process_version_id == version_id)
        .order_by(Asset.code)):
        candidates.setdefault(cand.requirement_id, []).append((code, cand))

    def step_dict(step: ProcessStep) -> dict:
        return {
            "operation_type": step.operation_type, "handler_version": step.handler_version,
            "timing_rule": step.timing_rule, "input_rule": step.input_rule,
            "output_rule": step.output_rule, "handoff_rule": step.handoff_rule,
            "residual_rule": step.residual_rule,
            "resources": [{
                "role_key": r.role_key, "resource_kind": r.resource_kind,
                "selection_mode": r.selection_mode, "required_count": r.required_count,
                "capacity_mode": r.capacity_mode, "allocation_rule": r.allocation_rule,
                "candidates": [{"asset_id": str(c.asset_id),
                                "eligibility_status": c.eligibility_status}
                               for _, c in candidates.get(r.id, [])],
            } for r in requirements.get(step.node_id, [])],
        }

    node_dicts = [{
        "id": str(n.id), "node_key": n.node_key, "kind": n.kind, "label": n.label,
        "asset_id": None if n.asset_id is None else str(n.asset_id),
        "display_order": n.display_order,
        "step": step_dict(steps[n.id]) if n.id in steps else None,
    } for n in nodes]
    edge_dicts = [{
        "id": str(e.id), "edge_key": e.edge_key, "from_node_id": str(e.from_node_id),
        "to_node_id": str(e.to_node_id), "edge_kind": e.edge_kind, "movement_rule": e.movement_rule,
    } for e in session.scalars(
        select(FlowEdge).where(FlowEdge.project_id == project_id,
                               FlowEdge.process_version_id == version_id)
        .order_by(FlowEdge.edge_key))]
    return node_dicts, edge_dicts


def delete_graph(session: Session, version_id: uuid.UUID) -> None:
    """버전의 그래프를 자식부터 모두 지운다(부모 버전이 draft일 때만 DB가 허용)."""
    for model in (RequirementCandidate, ResourceRequirement, ProcessStep, FlowEdge, FlowNode):
        session.execute(delete(model).where(model.process_version_id == version_id))


def delete_step_resources(session: Session, version_id: uuid.UUID, node_id: uuid.UUID) -> None:
    req_ids = select(ResourceRequirement.id).where(
        ResourceRequirement.process_version_id == version_id,
        ResourceRequirement.step_node_id == node_id)
    session.execute(delete(RequirementCandidate).where(
        RequirementCandidate.process_version_id == version_id,
        RequirementCandidate.requirement_id.in_(req_ids)))
    session.execute(delete(ResourceRequirement).where(
        ResourceRequirement.process_version_id == version_id,
        ResourceRequirement.step_node_id == node_id))
