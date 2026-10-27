"""여러 제품의 공정 그래프 일괄 조회와 자산 사용처(CR be13). 읽기 전용이다.

제품마다 `GET /process-versions/{v}/graph`를 따로 부르지 않고, 기준(현재 승인본·가장 최근 버전) 또는 버전 id 목록으로
한 번에 읽는다. 기본은 노드·간선 요약이라 응답이 작다. 한 번에 최대 50개.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from simulation_platform.auth.principal import Principal
from simulation_platform.domain.errors import ErrorDetail, NotFoundError, ValidationFailed
from simulation_platform.domain.pagination import decode_cursor, encode_cursor, make_tag
from simulation_platform.models import (
    Asset,
    FlowNode,
    ProcessVersion,
    Product,
    RequirementCandidate,
    ResourceRequirement,
)
from simulation_platform.repositories import process as repo
from simulation_platform.schemas.catalog import ProcessVersionSummary
from simulation_platform.schemas.common import Page
from simulation_platform.schemas.process import (
    AssetUseOut,
    GraphSummaryEdge,
    GraphSummaryNode,
    GraphSummaryOut,
    ProcessGraphItem,
)
from simulation_platform.services.process import _graph_out
from simulation_platform.services.projects import require_project

MAX_BATCH = 50


def _chosen(session: Session, project_id: uuid.UUID, products: list[Product], basis: str) -> dict:
    """제품 id → 기준에 맞는 공정 버전(없으면 None). approved = 현재 승인본, latest = 가장 최근 버전."""
    summaries = repo.summaries_for_products(session, project_id, [p.id for p in products])
    return {p.id: summaries[p.id][1 if basis == "approved" else 0] for p in products}


def _summary(session: Session, version: ProcessVersion) -> GraphSummaryOut:
    nodes, edges = repo.load_graph(session, version.project_id, version.id)
    return GraphSummaryOut(
        nodes=[GraphSummaryNode(
            id=n["id"], node_key=n["node_key"], kind=n["kind"], label=n["label"], asset_id=n.get("asset_id"),
            operation_type=(n.get("step") or {}).get("operation_type"),
            candidate_asset_ids=[c["asset_id"] for r in (n.get("step") or {}).get("resources", [])
                                 for c in r.get("candidates", [])]) for n in nodes],
        edges=[GraphSummaryEdge(id=e["id"], edge_key=e["edge_key"], from_node_id=e["from_node_id"],
                                to_node_id=e["to_node_id"], edge_kind=e.get("edge_kind", "material")) for e in edges],
        completion_node_id=version.completion_node_id)


def _item(session: Session, product: Product, version: ProcessVersion | None, mode: str) -> ProcessGraphItem:
    if version is None:
        return ProcessGraphItem(product_id=product.id, product_code=product.code, product_name=product.name,
                                version=None, etag=None)
    return ProcessGraphItem(
        product_id=product.id, product_code=product.code, product_name=product.name,
        version=ProcessVersionSummary.model_validate(version), etag=f'"{version.row_version}"',
        graph=_graph_out(session, version) if mode == "full" else None,
        summary=_summary(session, version) if mode == "summary" else None)


def batch_graphs(session: Session, principal: Principal, project_id: uuid.UUID, *, basis: str,
                 product_ids: list[uuid.UUID] | None, version_ids: list[uuid.UUID] | None, mode: str,
                 limit: int, cursor: str | None) -> tuple[list[ProcessGraphItem], Page]:
    require_project(session, principal, project_id)
    if version_ids:
        if len(version_ids) > MAX_BATCH:
            raise ValidationFailed(f"공정 버전은 한 번에 {MAX_BATCH}개까지 조회할 수 있습니다.", [ErrorDetail(
                message=f"{len(version_ids)}개를 보냈습니다.", field_path="/version_id")])
        versions = {v.id: v for v in session.scalars(select(ProcessVersion).where(
            ProcessVersion.project_id == project_id, ProcessVersion.id.in_(set(version_ids))))}
        missing = [str(v) for v in version_ids if v not in versions]
        if missing:
            raise NotFoundError("이 프로젝트에 없는 공정 버전이 있습니다.", [ErrorDetail(
                message=f"없는 공정 버전: {', '.join(missing)}", field_path="/version_id")])
        products = {p.id: p for p in session.scalars(select(Product).where(
            Product.project_id == project_id, Product.id.in_({v.product_id for v in versions.values()})))}
        items = [_item(session, products[versions[v].product_id], versions[v], mode) for v in dict.fromkeys(version_ids)]
        return items, Page(limit=len(items), next_cursor=None)
    stmt = select(Product).where(Product.project_id == project_id)
    if product_ids:
        stmt = stmt.where(Product.id.in_(set(product_ids)))
    tag = make_tag("process-graphs", ("code", False), {"basis": basis, "products": sorted(map(str, product_ids or []))})
    if cursor:
        stmt = stmt.where(Product.code > decode_cursor(cursor, tag, 1)[0])
    rows = list(session.scalars(stmt.order_by(Product.code).limit(limit + 1)))
    page = rows[:limit]
    chosen = _chosen(session, project_id, page, basis)
    items = [_item(session, p, chosen[p.id], mode) for p in page]
    return items, Page(limit=limit, next_cursor=encode_cursor(tag, [page[-1].code]) if len(rows) > limit else None)


def asset_uses(session: Session, principal: Principal, project_id: uuid.UUID, asset_id: uuid.UUID,
               basis: str) -> list[AssetUseOut]:
    """그 자산을 쓰는 제품·공정 버전·노드(공간 노드, 또는 단계의 후보 설비). 제품마다 기준에 맞는 버전 하나만 본다."""
    require_project(session, principal, project_id)
    if session.scalars(select(Asset).where(Asset.project_id == project_id, Asset.id == asset_id)).one_or_none() is None:
        raise NotFoundError("자산을 찾을 수 없습니다.")
    products = list(session.scalars(select(Product).where(Product.project_id == project_id)))
    versions = _chosen(session, project_id, products, basis)
    chosen = {versions[p.id].id: (p, versions[p.id]) for p in products if versions[p.id] is not None}
    if not chosen:
        return []
    uses: list[AssetUseOut] = []
    for node in session.scalars(select(FlowNode).where(
            FlowNode.project_id == project_id, FlowNode.process_version_id.in_(set(chosen)), FlowNode.asset_id == asset_id)):
        product, version = chosen[node.process_version_id]
        uses.append(_use(product, version, node, "space", None))
    rows = session.execute(
        select(RequirementCandidate, ResourceRequirement, FlowNode)
        .join(ResourceRequirement, ResourceRequirement.id == RequirementCandidate.requirement_id)
        .join(FlowNode, FlowNode.id == ResourceRequirement.step_node_id)
        .where(RequirementCandidate.project_id == project_id, RequirementCandidate.asset_id == asset_id,
               RequirementCandidate.process_version_id.in_(set(chosen))))
    for candidate, requirement, node in rows:
        product, version = chosen[candidate.process_version_id]
        uses.append(_use(product, version, node, "equipment_candidate", requirement.role_key))
    return sorted(uses, key=lambda u: (u.product_code, u.node_key, u.use))


def _use(product: Product, version: ProcessVersion, node: FlowNode, use: str, role: str | None) -> AssetUseOut:
    return AssetUseOut(product_id=product.id, product_code=product.code, product_name=product.name,
                       process_version=ProcessVersionSummary.model_validate(version), node_id=node.id,
                       node_key=node.node_key, node_label=node.label, use=use, role_key=role)
