"""자산 버전(asset_revision)·포트 정책 서비스. 기준: CR-backend-20261023-be02-asset-revision-capacity."""

import copy
import uuid
from dataclasses import asdict

from sqlalchemy import func
from sqlalchemy.orm import Session

from simulation_platform.auth.principal import Principal
from simulation_platform.domain import revisions as rules
from simulation_platform.domain.errors import (
    EditConflictError,
    ErrorDetail,
    NotFoundError,
    RevisionDraftExistsError,
    ValidationFailed,
    VersionImmutableError,
)
from simulation_platform.domain.pagination import (
    DEFAULT_LIMIT,
    decode_cursor,
    encode_cursor,
    make_tag,
)
from simulation_platform.models import AssetRevision, PortPolicy
from simulation_platform.models.base import new_id
from simulation_platform.repositories import assets as asset_repo
from simulation_platform.repositories import revisions as repo
from simulation_platform.schemas.common import Page
from simulation_platform.schemas.revision import (
    AssetRevisionOut,
    IssueOut,
    PortPolicyOut,
    RejectBody,
    RevisionPatch,
)
from simulation_platform.services.projects import require_admin, require_project, require_write
from simulation_platform.services.unit_of_work import audit, transaction

ASSET_NOT_FOUND = "자산을 찾을 수 없습니다."
REVISION_NOT_FOUND = "자산 버전을 찾을 수 없습니다."


def _draft_exists() -> RevisionDraftExistsError:
    return RevisionDraftExistsError(
        "이미 진행 중인 버전이 있습니다.",
        [ErrorDetail(message="초안 또는 검토 중인 버전이 하나만 있을 수 있습니다. "
                             "그 버전을 먼저 승인하거나 반려하세요.")])


def _stale(current: int) -> EditConflictError:
    return EditConflictError(
        "다른 곳에서 먼저 수정되었습니다.",
        [ErrorDetail(message=f"현재 버전은 {current}입니다.", field_path="/row_version")])


def _to_out(revision: AssetRevision, policy_rows: list) -> AssetRevisionOut:
    ports = [
        PortPolicyOut(
            port_id=port.id, port_key=port.port_key, role=port.role,
            buffer_capacity=policy.buffer_capacity, dispatch_rule=policy.dispatch_rule,
            release_rule=policy.release_rule)
        for policy, port in policy_rows
    ]
    views = [rules.PolicyView(
        port_key=p.port_key, buffer_capacity=p.buffer_capacity.model_dump(mode="json"),
        dispatch_rule=p.dispatch_rule.model_dump(mode="json"),
        release_rule=p.release_rule.model_dump(mode="json")) for p in ports]
    issues = [IssueOut(**asdict(i)) for i in
              rules.compute_issues(str(revision.id), revision.storage_capacity, views)]
    return AssetRevisionOut(
        id=revision.id, project_id=revision.project_id, asset_id=revision.asset_id,
        revision_no=revision.revision_no, status=revision.status,
        schema_version=revision.schema_version, storage_capacity=revision.storage_capacity,
        ports=ports, notes=revision.notes, issues=issues, submitted_at=revision.submitted_at,
        submitted_by=revision.submitted_by, rejection_reason=revision.rejection_reason,
        rejected_at=revision.rejected_at, approved_at=revision.approved_at,
        approved_by=revision.approved_by, created_at=revision.created_at,
        updated_at=revision.updated_at, row_version=revision.row_version)


def _load_out(session: Session, project_id: uuid.UUID, revision_id: uuid.UUID) -> AssetRevisionOut:
    session.expire_all()
    revision = repo.get_revision(session, project_id, revision_id)
    if revision is None:
        raise NotFoundError(REVISION_NOT_FOUND)
    return _to_out(revision, repo.policies_with_ports(session, project_id, [revision.id])[revision.id])


def _touch(row, principal: Principal) -> None:
    row.row_version = row.row_version + 1
    row.updated_at = func.now()
    row.updated_by = principal.user_id


def create_revision(session: Session, principal: Principal, project_id: uuid.UUID,
                    asset_id: uuid.UUID, request_id: str | None) -> AssetRevisionOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    asset = asset_repo.get_asset(session, project_id, asset_id, for_update=True)
    if asset is None:
        raise NotFoundError(ASSET_NOT_FOUND)
    if repo.find_open(session, project_id, asset_id) is not None:
        raise _draft_exists()

    # 승인본이 있으면 그 설정을 복사하고, 없으면 용량을 모두 '미정'으로 시작한다.
    base = repo.find_approved(session, project_id, asset_id)
    base_policies = {}
    if base is not None:
        base_policies = {p.port_id: p for p, _ in
                         repo.policies_with_ports(session, project_id, [base.id])[base.id]}
    if asset.kind == "equipment":
        storage_capacity = None
        ports = asset_repo.Children(session, project_id, [asset.id]).ports[asset.id]
    else:
        storage_capacity = copy.deepcopy(base.storage_capacity if base is not None
                                         else rules.UNKNOWN_CAPACITY)
        ports = []

    revision = AssetRevision(
        id=new_id(), project_id=project_id, asset_id=asset_id, asset_kind=asset.kind,
        revision_no=repo.next_revision_no(session, asset_id), status=rules.DRAFT,
        storage_capacity=storage_capacity, notes=None if base is None else base.notes,
        created_by=principal.user_id)
    with transaction(session, {"uq_asset_revision_one_open": _draft_exists}):
        session.add(revision)
        session.flush()
        for port in ports:
            source = base_policies.get(port.id)
            session.add(PortPolicy(
                id=new_id(), project_id=project_id, asset_id=asset_id,
                asset_revision_id=revision.id, port_id=port.id, port_role=port.role,
                buffer_capacity=copy.deepcopy(
                    source.buffer_capacity if source else rules.UNKNOWN_CAPACITY),
                dispatch_rule=copy.deepcopy(
                    source.dispatch_rule if source else rules.DEFAULT_DISPATCH_RULE),
                release_rule=copy.deepcopy(
                    source.release_rule if source else rules.DEFAULT_RELEASE_RULE),
                created_by=principal.user_id))
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="asset_revision.create",
              entity_type="asset_revision", entity_id=revision.id, before=None,
              after={"asset_id": str(asset_id), "revision_no": revision.revision_no,
                     "copied_from": None if base is None else str(base.id)},
              request_id=request_id)
    return _load_out(session, project_id, revision.id)


def get_revision(session: Session, principal: Principal, project_id: uuid.UUID,
                 revision_id: uuid.UUID) -> AssetRevisionOut:
    require_project(session, principal, project_id)
    return _load_out(session, project_id, revision_id)


def list_revisions(session: Session, principal: Principal, project_id: uuid.UUID,
                   asset_id: uuid.UUID, *, limit: int | None,
                   cursor: str | None) -> tuple[list[AssetRevisionOut], Page]:
    require_project(session, principal, project_id)
    if asset_repo.get_asset(session, project_id, asset_id) is None:
        raise NotFoundError(ASSET_NOT_FOUND)
    limit = limit or DEFAULT_LIMIT
    tag = make_tag("revisions", ("revision_no", True), {"asset": str(asset_id)})
    values = decode_cursor(cursor, tag, 1) if cursor else None
    rows = repo.list_revisions(session, project_id, asset_id, limit=limit, cursor_values=values)
    page_rows = rows[:limit]
    next_cursor = encode_cursor(tag, [page_rows[-1].revision_no]) if len(rows) > limit else None
    policies = repo.policies_with_ports(session, project_id, [r.id for r in page_rows])
    return [_to_out(r, policies[r.id]) for r in page_rows], Page(limit=limit, next_cursor=next_cursor)


def _lock_revision(session: Session, project_id: uuid.UUID, revision_id: uuid.UUID) -> AssetRevision:
    revision = repo.get_revision(session, project_id, revision_id, for_update=True)
    if revision is None:
        raise NotFoundError(REVISION_NOT_FOUND)
    return revision


def patch_revision(session: Session, principal: Principal, project_id: uuid.UUID,
                   revision_id: uuid.UUID, version: int, body: RevisionPatch,
                   request_id: str | None) -> AssetRevisionOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    revision = _lock_revision(session, project_id, revision_id)
    if revision.status != rules.DRAFT:
        raise VersionImmutableError(
            "초안이 아닌 버전은 수정할 수 없습니다.",
            [ErrorDetail(message=f"현재 상태는 {revision.status}입니다. 승인본을 고치려면 새 초안을 만드세요.",
                         field_path="/status")])
    if revision.row_version != version:
        raise _stale(revision.row_version)

    is_equipment = revision.asset_kind == "equipment"
    if "storage_capacity" in body.model_fields_set and is_equipment:
        raise ValidationFailed("설비 버전에는 저장 용량이 없습니다.", [ErrorDetail(
            message="storage_capacity는 공간(storage/dock) 버전에서만 설정합니다.",
            field_path="/storage_capacity")])
    if "ports" in body.model_fields_set and not is_equipment:
        raise ValidationFailed("공간 버전에는 포트 정책이 없습니다.", [ErrorDetail(
            message="포트별 정책은 설비 버전에서만 설정합니다.", field_path="/ports")])
    policies = {p.port_id: (p, port) for p, port in
                repo.policies_with_ports(session, project_id, [revision.id])[revision.id]}
    for index, item in enumerate(body.ports or []):
        if item.port_id not in policies:
            raise ValidationFailed("이 버전의 포트가 아닙니다.", [ErrorDetail(
                message="이 자산의 IN/OUT 포트 id가 아닙니다.", field_path=f"/ports/{index}/port_id")])

    before: dict = {}
    after: dict = {}
    with transaction(session, {}):
        if "storage_capacity" in body.model_fields_set:
            before["storage_capacity"] = revision.storage_capacity
            after["storage_capacity"] = body.storage_capacity.model_dump(mode="json")
            revision.storage_capacity = after["storage_capacity"]
        if "notes" in body.model_fields_set:
            before["notes"], after["notes"] = revision.notes, body.notes
            revision.notes = body.notes
        for item in body.ports or []:
            policy, port = policies[item.port_id]
            for name in item.model_fields_set - {"port_id"}:
                key = f"ports.{port.port_key}.{name}"
                before[key] = getattr(policy, name)
                after[key] = getattr(item, name).model_dump(mode="json")
                setattr(policy, name, after[key])
            _touch(policy, principal)
        _touch(revision, principal)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="asset_revision.update",
              entity_type="asset_revision", entity_id=revision.id, before=before, after=after,
              request_id=request_id)
    return _load_out(session, project_id, revision.id)


def _transition(session: Session, principal: Principal, project_id: uuid.UUID,
                revision_id: uuid.UUID, version: int, target: str, request_id: str | None,
                reason: str | None = None) -> AssetRevisionOut:
    access = require_project(session, principal, project_id)
    if target == rules.IN_REVIEW:
        require_write(access)
    else:
        require_admin(access, "버전의 승인·반려는 project admin만 할 수 있습니다.")
    revision = _lock_revision(session, project_id, revision_id)
    if revision.row_version != version:
        raise _stale(revision.row_version)
    previous = revision.status
    rules.ensure_transition(previous, target)

    after: dict = {"from": previous, "to": target, "revision_no": revision.revision_no}
    with transaction(session, {}):
        if target == rules.IN_REVIEW:
            revision.submitted_at, revision.submitted_by = func.now(), principal.user_id
            revision.rejection_reason = revision.rejected_at = revision.rejected_by = None
        elif target == rules.DRAFT:
            revision.rejection_reason = reason
            revision.rejected_at, revision.rejected_by = func.now(), principal.user_id
            revision.submitted_at = revision.submitted_by = None
            after["reason"] = reason
        else:  # approved
            superseded = repo.find_approved(session, project_id, revision.asset_id, for_update=True)
            if superseded is not None:
                superseded.status = rules.SUPERSEDED
                _touch(superseded, principal)
                session.flush()  # 승인본은 자산당 하나이므로 새 승인 전에 먼저 내린다
                after["superseded_revision_id"] = str(superseded.id)
            revision.approved_at, revision.approved_by = func.now(), principal.user_id
        revision.status = target
        _touch(revision, principal)
        action = {rules.IN_REVIEW: "submit", rules.DRAFT: "reject", rules.APPROVED: "approve"}[target]
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action=f"asset_revision.{action}",
              entity_type="asset_revision", entity_id=revision.id,
              before={"status": previous}, after=after, request_id=request_id)
    return _load_out(session, project_id, revision.id)


def submit_revision(session, principal, project_id, revision_id, version, request_id):
    return _transition(session, principal, project_id, revision_id, version, rules.IN_REVIEW,
                       request_id)


def reject_revision(session, principal, project_id, revision_id, version, body: RejectBody,
                    request_id):
    return _transition(session, principal, project_id, revision_id, version, rules.DRAFT,
                       request_id, reason=body.reason)


def approve_revision(session, principal, project_id, revision_id, version, request_id):
    return _transition(session, principal, project_id, revision_id, version, rules.APPROVED,
                       request_id)
