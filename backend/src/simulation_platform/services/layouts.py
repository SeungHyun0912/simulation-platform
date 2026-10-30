"""배치판 서비스. 기준: CR-backend-20261028-be18-layout-points-routes(BE-21, 사용자 지시 2026-10-28).

- 프로젝트당 초안은 하나다. 새 초안은 지정한 버전 또는 최근 승인본을 복사한다(점·배치·포트 매핑·경로 전부).
- 내용(점·배치·포트 매핑·경로)은 PUT으로 통째로 교체한다. 저장은 구조 오류만 막고(422), 승인 가능 여부는 검증이 판정한다.
- 승인은 project admin만, 검증 오류가 0일 때만. 승인 후 내용은 DB가 동결한다.
- 좌표·크기는 소수 첫째 자리로 반올림해 저장한다(사용자 확정).
"""

import uuid
from fractions import Fraction

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from simulation_platform.auth.principal import Principal
from simulation_platform.domain import layout as rules
from simulation_platform.domain import process_moves as moves_rules
from simulation_platform.domain import travel
from simulation_platform.domain.errors import (
    EditConflictError,
    ErrorDetail,
    LayoutDraftExistsError,
    LayoutValidationFailed,
    NotFoundError,
    ValidationFailed,
    VersionImmutableError,
)
from simulation_platform.domain.pagination import (
    DEFAULT_LIMIT,
    decode_cursor,
    encode_cursor,
    make_tag,
)
from simulation_platform.models import (
    Asset,
    AssetPlacement,
    AssetPort,
    EquipmentDetail,
    LayoutAisle,
    LayoutAislePoint,
    LayoutPoint,
    LayoutPortPoint,
    LayoutRoute,
    LayoutRoutePoint,
    LayoutVersion,
    ProcessVersion,
    Product,
    ScenarioVersion,
)
from simulation_platform.models.base import new_id
from simulation_platform.repositories import layouts as repo
from simulation_platform.repositories import process as process_repo
from simulation_platform.schemas.common import Page
from simulation_platform.schemas.layout import (
    AisleOut,
    LayoutContentIn,
    LayoutIssueOut,
    LayoutPointOut,
    LayoutValidationOut,
    LayoutVersionCreate,
    LayoutVersionListItem,
    LayoutVersionOut,
    LayoutVersionPatch,
    MovePairOut,
    PathOut,
    PathsIn,
    PlacementOut,
    PortPointOut,
    ProcessLinksOut,
    ProcessMoveOut,
    RouteOut,
)
from simulation_platform.services.projects import require_admin, require_project, require_write
from simulation_platform.services.unit_of_work import audit, transaction

VERSION_NOT_FOUND = "배치판을 찾을 수 없습니다."


def _draft_exists() -> LayoutDraftExistsError:
    return LayoutDraftExistsError("이미 초안인 배치판이 있습니다.", [ErrorDetail(
        message="프로젝트당 배치판 초안은 하나뿐입니다. 그 초안을 고치거나 승인하세요.")])


def _stale(current: int) -> EditConflictError:
    return EditConflictError("다른 곳에서 먼저 수정되었습니다.", [ErrorDetail(
        message=f"현재 버전은 {current}입니다.", field_path="/row_version")])


def _touch(row, principal: Principal) -> None:
    row.row_version = row.row_version + 1
    row.updated_at = func.now()
    row.updated_by = principal.user_id


def _version_or_404(session, project_id, version_id, for_update=False) -> LayoutVersion:
    version = repo.get_version(session, project_id, version_id, for_update=for_update)
    if version is None:
        raise NotFoundError(VERSION_NOT_FOUND)
    return version


def _reload(session: Session, project_id: uuid.UUID, version_id: uuid.UUID) -> LayoutVersion:
    session.expire_all()
    return _version_or_404(session, project_id, version_id)


def _editable(session, project_id, version_id, expected) -> LayoutVersion:
    version = _version_or_404(session, project_id, version_id, for_update=True)
    if version.status != "draft":
        raise VersionImmutableError("초안이 아닌 배치판은 수정할 수 없습니다.", [ErrorDetail(
            message=f"현재 상태는 {version.status}입니다. 새 초안을 만드세요.", field_path="/status")])
    if version.row_version != expected:
        raise _stale(version.row_version)
    return version


# --- 읽기 -------------------------------------------------------------------------------------
def _loaded(session: Session, version: LayoutVersion) -> dict:
    """내용 행과 표시에 필요한 자산·포트를 함께 읽는다."""
    rows = repo.content(session, version.project_id, version.id)
    ports = repo.ports(session, version.project_id, {m.port_id for m in rows["port_points"]}
                       | {r.from_port_id for r in rows["routes"]} | {r.to_port_id for r in rows["routes"]})
    assets = repo.assets(session, version.project_id, {p.asset_id for p in rows["placements"]}
                         | {p.asset_id for p in ports.values()})
    key_of = {p.id: p.point_key for p in rows["points"]}
    route_points: dict[uuid.UUID, list[str]] = {}
    for rp in rows["route_points"]:
        route_points.setdefault(rp.route_id, []).append(key_of[rp.point_id])
    aisle_points: dict[uuid.UUID, list[str]] = {}
    for ap in rows["aisle_points"]:
        aisle_points.setdefault(ap.aisle_id, []).append(key_of[ap.point_id])
    return {**rows, "ports": ports, "assets": assets, "key_of": key_of, "route_keys": route_points,
            "aisle_keys": aisle_points}


def _version_out(session: Session, version: LayoutVersion) -> LayoutVersionOut:
    data = _loaded(session, version)
    xy = {p.point_key: (p.x_m, p.y_m) for p in data["points"]}
    ports, assets = data["ports"], data["assets"]
    return LayoutVersionOut(
        id=version.id, project_id=version.project_id, version_no=version.version_no, status=version.status,
        name=version.name, base_version_id=version.base_version_id, approved_at=version.approved_at,
        created_at=version.created_at, updated_at=version.updated_at, row_version=version.row_version,
        notes=version.notes, canvas_width_m=rules.fmt(version.canvas_width_m),
        canvas_height_m=rules.fmt(version.canvas_height_m), attributes=version.attributes,
        approved_by=version.approved_by,
        points=[LayoutPointOut(point_key=p.point_key, x_m=rules.fmt(p.x_m), y_m=rules.fmt(p.y_m),
                               attributes=p.attributes) for p in data["points"]],
        placements=sorted((PlacementOut(
            asset_id=p.asset_id, asset_code=assets[p.asset_id].code, asset_name=assets[p.asset_id].name,
            asset_kind=assets[p.asset_id].kind, x_m=rules.fmt(p.x_m), y_m=rules.fmt(p.y_m),
            width_m=rules.fmt(p.width_m), height_m=rules.fmt(p.height_m), rotation_deg=rules.fmt(p.rotation_deg),
            attributes=p.attributes) for p in data["placements"]), key=lambda p: p.asset_code),
        port_points=sorted((PortPointOut(
            port_id=m.port_id, port_key=ports[m.port_id].port_key, role=ports[m.port_id].role,
            asset_id=ports[m.port_id].asset_id, asset_code=assets[ports[m.port_id].asset_id].code,
            point_key=data["key_of"][m.point_id]) for m in data["port_points"]),
            key=lambda m: (m.asset_code, m.role, m.port_key)),
        routes=[RouteOut(
            route_key=r.route_key, from_port_id=r.from_port_id, to_port_id=r.to_port_id,
            from_asset_id=ports[r.from_port_id].asset_id, to_asset_id=ports[r.to_port_id].asset_id, mode=r.mode,
            points=data["route_keys"].get(r.id, []),
            length_m=rules.fmt(rules.length([xy[k] for k in data["route_keys"].get(r.id, [])])),
            attributes=r.attributes) for r in data["routes"]],
        aisles=[AisleOut(
            aisle_key=a.aisle_key, points=data["aisle_keys"].get(a.id, []),
            length_m=rules.fmt(rules.length([xy[k] for k in data["aisle_keys"].get(a.id, [])])),
            attributes=a.attributes) for a in data["aisles"]])


def list_versions(session: Session, principal: Principal, project_id: uuid.UUID, *, limit: int | None,
                  cursor: str | None) -> tuple[list[LayoutVersionListItem], Page]:
    require_project(session, principal, project_id)
    limit = limit or DEFAULT_LIMIT
    tag = make_tag("layout-versions", ("version_no", True), {})
    values = decode_cursor(cursor, tag, 1) if cursor else None
    rows = repo.list_versions(session, project_id, limit=limit, cursor_values=values)
    page_rows = rows[:limit]
    next_cursor = encode_cursor(tag, [page_rows[-1].version_no]) if len(rows) > limit else None
    return [LayoutVersionListItem.model_validate(r) for r in page_rows], Page(limit=limit, next_cursor=next_cursor)


def get_version(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID) -> LayoutVersionOut:
    require_project(session, principal, project_id)
    return _version_out(session, _reload(session, project_id, version_id))


# --- 쓰기 -------------------------------------------------------------------------------------
def _write_content(session: Session, version: LayoutVersion, points: list[dict], placements: list[dict],
                   port_points: list[dict], routes: list[dict], user_id, aisles: list[dict] = ()) -> None:
    """반올림된 내용을 쓴다(점 key로 참조). 기존 내용은 먼저 지운다."""
    repo.delete_content(session, version.project_id, version.id)
    common = {"project_id": version.project_id, "layout_version_id": version.id, "created_by": user_id}
    ids: dict[str, uuid.UUID] = {}
    for p in points:
        ids[p["point_key"]] = new_id()
        session.add(LayoutPoint(id=ids[p["point_key"]], point_key=p["point_key"], x_m=p["x_m"], y_m=p["y_m"],
                                attributes=p["attributes"], **common))
    session.flush()
    for p in placements:
        session.add(AssetPlacement(id=new_id(), asset_id=p["asset_id"], x_m=p["x_m"], y_m=p["y_m"],
                                   width_m=p["width_m"], height_m=p["height_m"], rotation_deg=p["rotation_deg"],
                                   attributes=p["attributes"], **common))
    for m in port_points:
        session.add(LayoutPortPoint(id=new_id(), port_id=m["port_id"], point_id=ids[m["point_key"]], **common))
    session.flush()
    for r in routes:
        route = LayoutRoute(id=new_id(), route_key=r["route_key"], from_port_id=r["from_port_id"],
                            to_port_id=r["to_port_id"], mode=r["mode"], attributes=r["attributes"], **common)
        session.add(route)
        session.flush()
        for seq, key in enumerate(r["points"]):
            session.add(LayoutRoutePoint(route_id=route.id, seq=seq, point_id=ids[key], **common))
    for a in aisles:
        aisle = LayoutAisle(id=new_id(), aisle_key=a["aisle_key"], attributes=a["attributes"], **common)
        session.add(aisle)
        session.flush()
        for seq, key in enumerate(a["points"]):
            session.add(LayoutAislePoint(aisle_id=aisle.id, seq=seq, point_id=ids[key], **common))
    session.flush()


def _as_dicts(session: Session, version: LayoutVersion) -> dict[str, list[dict]]:
    """저장된 내용을 쓰기용 dict로(복사·검증이 같이 쓴다)."""
    data = _loaded(session, version)
    return {
        "points": [{"point_key": p.point_key, "x_m": p.x_m, "y_m": p.y_m, "attributes": p.attributes}
                   for p in data["points"]],
        "placements": [{"asset_id": p.asset_id, "x_m": p.x_m, "y_m": p.y_m, "width_m": p.width_m,
                        "height_m": p.height_m, "rotation_deg": p.rotation_deg, "attributes": p.attributes}
                       for p in data["placements"]],
        "port_points": [{"port_id": m.port_id, "point_key": data["key_of"][m.point_id]} for m in data["port_points"]],
        "routes": [{"route_key": r.route_key, "from_port_id": r.from_port_id, "to_port_id": r.to_port_id,
                    "mode": r.mode, "points": data["route_keys"].get(r.id, []), "attributes": r.attributes}
                   for r in data["routes"]],
        "aisles": [{"aisle_key": a.aisle_key, "points": data["aisle_keys"].get(a.id, []), "attributes": a.attributes}
                   for a in data["aisles"]],
        "port_assets": {p.id: p.asset_id for p in data["ports"].values()}}


def create_version(session: Session, principal: Principal, project_id: uuid.UUID, body: LayoutVersionCreate | None,
                   request_id: str | None) -> LayoutVersionOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    if repo.find_draft(session, project_id) is not None:
        raise _draft_exists()
    requested = None if body is None else body.from_version_id
    base = repo.latest_approved(session, project_id) if requested is None else repo.get_version(
        session, project_id, requested)
    if requested is not None and base is None:
        raise NotFoundError(VERSION_NOT_FOUND)
    with transaction(session, {"uq_layout_version_one_draft": _draft_exists, "uq_layout_version_no": _draft_exists}):
        version = LayoutVersion(
            id=new_id(), project_id=project_id, version_no=repo.next_version_no(session, project_id), status="draft",
            base_version_id=None if base is None else base.id, name=None if base is None else base.name,
            notes=None if base is None else base.notes,
            canvas_width_m=None if base is None else base.canvas_width_m,
            canvas_height_m=None if base is None else base.canvas_height_m,
            attributes={} if base is None else base.attributes, created_by=principal.user_id)
        session.add(version)
        session.flush()
        if base is not None:
            copied = _as_dicts(session, base)
            _write_content(session, version, copied["points"], copied["placements"], copied["port_points"],
                           copied["routes"], principal.user_id, copied["aisles"])
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="layout_version.create", entity_type="layout_version",
              entity_id=version.id, before=None,
              after={"version_no": version.version_no, "copied_from": None if base is None else str(base.id)},
              request_id=request_id)
    return _version_out(session, _reload(session, project_id, version.id))


def patch_version(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID,
                  expected: int, body: LayoutVersionPatch, request_id: str | None) -> LayoutVersionOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    version = _editable(session, project_id, version_id, expected)
    fields = sorted(body.model_fields_set)
    with transaction(session, {}):
        for name in fields:
            value = getattr(body, name)
            if name in ("canvas_width_m", "canvas_height_m") and value is not None:
                value = rules.round_m(value)
                if value <= 0:
                    raise ValidationFailed("도면 크기가 올바르지 않습니다.", [ErrorDetail(
                        rule_id="LAY-SAVE-010", field_path=f"/{name}", message="반올림하면 0이 됩니다(0.1m 이상).")])
            setattr(version, name, value)
        _touch(version, principal)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="layout_version.update", entity_type="layout_version",
              entity_id=version.id, before=None, after={"fields": fields}, request_id=request_id)
    return _version_out(session, _reload(session, project_id, version.id))


def _rounded(body: LayoutContentIn) -> dict[str, list[dict]]:
    def opt(value):
        return None if value is None else rules.round_m(value)

    return {
        "points": [{"point_key": p.point_key, "x_m": rules.round_m(p.x_m), "y_m": rules.round_m(p.y_m),
                    "attributes": p.attributes} for p in body.points],
        "placements": [{"asset_id": p.asset_id, "x_m": rules.round_m(p.x_m), "y_m": rules.round_m(p.y_m),
                        "width_m": opt(p.width_m), "height_m": opt(p.height_m),
                        "rotation_deg": None if p.rotation_deg is None else rules.round_m(p.rotation_deg) % 360,
                        "attributes": p.attributes} for p in body.placements],
        "port_points": [{"port_id": m.port_id, "point_key": m.point_key} for m in body.port_points],
        "routes": [{"route_key": r.route_key, "from_port_id": r.from_port_id, "to_port_id": r.to_port_id,
                    "mode": r.mode, "points": list(r.points), "attributes": r.attributes} for r in body.routes],
        "aisles": [{"aisle_key": a.aisle_key, "points": list(a.points), "attributes": a.attributes}
                   for a in body.aisles]}


def put_content(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID, expected: int,
                body: LayoutContentIn, request_id: str | None) -> LayoutVersionOut:
    access = require_project(session, principal, project_id)
    require_write(access)
    version = _editable(session, project_id, version_id, expected)
    content = _rounded(body)
    port_ids = ({m["port_id"] for m in content["port_points"]} | {r["from_port_id"] for r in content["routes"]}
                | {r["to_port_id"] for r in content["routes"]})
    errors = rules.save_errors(
        **content, known_assets=set(repo.assets(session, project_id, {p["asset_id"] for p in content["placements"]})),
        known_ports=set(repo.ports(session, project_id, port_ids)))
    if errors:
        raise ValidationFailed("배치판 내용이 올바르지 않습니다.", [ErrorDetail(
            severity=i.severity, rule_id=i.rule_id, field_path=i.field_path, message=i.message) for i in errors])
    with transaction(session, {}):
        _write_content(session, version, content["points"], content["placements"], content["port_points"],
                       content["routes"], principal.user_id, content["aisles"])
        _touch(version, principal)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="layout_version.content", entity_type="layout_version",
              entity_id=version.id, before=None,
              after={k: len(v) for k, v in content.items()}, request_id=request_id)
    return _version_out(session, _reload(session, project_id, version.id))


# --- 검증·승인 ---------------------------------------------------------------------------------
def _issues(session: Session, version: LayoutVersion) -> list[rules.Issue]:
    data = _as_dicts(session, version)
    return rules.validate(
        canvas=(version.canvas_width_m, version.canvas_height_m),
        points={p["point_key"]: (p["x_m"], p["y_m"]) for p in data["points"]},
        placements=data["placements"],
        port_points={m["port_id"]: m["point_key"] for m in data["port_points"]},
        port_assets=data["port_assets"], routes=data["routes"], aisles=data["aisles"])


def validate(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID) -> LayoutValidationOut:
    require_project(session, principal, project_id)
    version = _reload(session, project_id, version_id)
    issues = _issues(session, version)
    errors = sum(1 for i in issues if i.severity == "error")
    return LayoutValidationOut(
        layout_version_id=version.id, approvable=errors == 0, error_count=errors,
        warning_count=len(issues) - errors,
        issues=[LayoutIssueOut(severity=i.severity, rule_id=i.rule_id, field_path=i.field_path, message=i.message)
                for i in issues])


def approve_version(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID,
                    expected: int, request_id: str | None) -> LayoutVersionOut:
    access = require_project(session, principal, project_id)
    require_admin(access, "배치판 승인은 project admin만 할 수 있습니다.")
    version = _editable(session, project_id, version_id, expected)
    errors = [i for i in _issues(session, version) if i.severity == "error"]
    if errors:
        raise LayoutValidationFailed("배치판 검증 오류가 있어 승인할 수 없습니다.", [ErrorDetail(
            severity="error", rule_id=i.rule_id, field_path=i.field_path, message=i.message) for i in errors])
    with transaction(session, {}):
        version.status = "approved"
        version.approved_at, version.approved_by = func.now(), principal.user_id
        _touch(version, principal)
        audit(session, organization_id=access.project.organization_id, project_id=project_id,
              actor_id=principal.user_id, action="layout_version.approve", entity_type="layout_version",
              entity_id=version.id, before={"status": "draft"},
              after={"status": "approved", "version_no": version.version_no}, request_id=request_id)
    return _version_out(session, _reload(session, project_id, version.id))


# --- 포트 → 포트 경로(CR be19) ---------------------------------------------------------------------------
def _resolver(data: dict):
    """포트 → 포트 경로 계산기. 같은 출발·도착 포트로 저장된 고정 경로를 먼저 쓰고, 없으면 통로·고정 경로의 선분(양방향)으로
    만든 길 그물에서 최단 경로를 계산한다. 반환: dict(reachable, source, route_key, points, length(Decimal|None), reason…)."""
    xy = {p["point_key"]: (p["x_m"], p["y_m"]) for p in data["points"]}
    mapped = {m["port_id"]: m["point_key"] for m in data["port_points"]}
    fixed = {}
    for r in sorted(data["routes"], key=lambda r: r["route_key"]):
        fixed.setdefault((r["from_port_id"], r["to_port_id"]), r)
    lines = [a["points"] for a in data["aisles"]] + [r["points"] for r in data["routes"]]
    cache: dict[tuple, dict] = {}

    def resolve(from_port, to_port) -> dict:
        if (from_port, to_port) in cache:
            return cache[(from_port, to_port)]
        route = fixed.get((from_port, to_port))
        if route is not None:
            result = {"reachable": True, "source": "fixed", "route_key": route["route_key"], "points": route["points"],
                      "length": rules.length([xy[k] for k in route["points"]])}
        else:
            start, end = mapped.get(from_port), mapped.get(to_port)
            if start is None or end is None:
                which = "출발" if start is None else "도착"
                result = {"reachable": False, "reason_code": "PORT_NOT_MAPPED",
                          "reason": f"{which} 포트가 이 배치판의 점에 매핑되지 않았습니다."}
            else:
                found = rules.shortest_path(xy, lines, start, end)
                result = ({"reachable": False, "reason_code": "NO_CONNECTION",
                           "reason": f"점 {start}에서 {end}까지 이어진 통로·경로가 없습니다."} if found is None else
                          {"reachable": True, "source": "computed", "points": found[0], "length": found[1]})
        cache[(from_port, to_port)] = result
        return result

    return resolve


def _path_fields(result: dict) -> dict:
    out = {k: v for k, v in result.items() if k != "length"}
    out["length_m"] = rules.fmt(result.get("length"))
    return out


def paths(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID,
          body: PathsIn) -> list[PathOut]:
    """쌍마다 고정 경로(같은 출발·도착 포트로 저장된 경로)를 먼저 쓰고, 없으면 통로·고정 경로의 선분으로 만든 길 그물에서
    최단 경로를 계산한다(저장하지 않음 → 점·통로를 고치면 다음 조회부터 자동으로 바뀐다)."""
    require_project(session, principal, project_id)
    version = _reload(session, project_id, version_id)
    resolve = _resolver(_as_dicts(session, version))
    return [PathOut(from_port_id=p.from_port_id, to_port_id=p.to_port_id, **_path_fields(resolve(p.from_port_id, p.to_port_id)))
            for p in body.pairs]


# --- 공정 ↔ 배치판 연결(CR be20) ----------------------------------------------------------------------
MAX_PAIRS_PER_MOVE = 200


def _ends(node: dict, ports: dict, *, outgoing: bool) -> list[tuple[uuid.UUID, AssetPort]]:
    """이동의 한쪽 끝 포트: 공간은 ACCESS, 설비는 후보마다 OUT(출발)·IN(도착)."""
    space = node["kind"] in moves_rules.SPACE_KINDS
    role = "ACCESS" if space else ("OUT" if outgoing else "IN")
    assets = [node["asset_id"]] if space else moves_rules.candidates(node)
    return [(uuid.UUID(a), p) for a in assets for p in ports.get(uuid.UUID(a), {}).get(role, [])]


def process_links(session: Session, principal: Principal, project_id: uuid.UUID, version_id: uuid.UUID, *,
                  process_version_ids: list[uuid.UUID] | None, scenario_version_id: uuid.UUID | None
                  ) -> list[ProcessLinksOut]:
    """공정의 이동 구간(공간 ↔ 설비, 운반 단계)마다 출발·도착 위치의 포트 쌍과 배치판 경로·길이·이동 시간을 계산한다(저장 안 함).
    속도는 시나리오(`scenario_version_id`)의 이동 설정, 없으면 기본값 4 km/h, 상하차 1분."""
    require_project(session, principal, project_id)
    version = _reload(session, project_id, version_id)
    rule: dict = {}
    if scenario_version_id is not None:
        scenario = session.get(ScenarioVersion, scenario_version_id)
        if scenario is None or scenario.project_id != project_id:
            raise NotFoundError("시나리오 버전을 찾을 수 없습니다.")
        rule = scenario.travel_rule or {}
    if process_version_ids:
        versions = {v.id: v for v in session.scalars(select(ProcessVersion).where(
            ProcessVersion.project_id == project_id, ProcessVersion.id.in_(process_version_ids)))}
        if len(versions) != len(set(process_version_ids)):
            raise NotFoundError("공정 버전을 찾을 수 없습니다.")
        chosen = [versions[i] for i in dict.fromkeys(process_version_ids)]
    else:  # 지정하지 않으면 제품마다 현재 승인본
        products = list(session.scalars(select(Product).where(Product.project_id == project_id).order_by(Product.code)))
        current = process_repo.summaries_for_products(session, project_id, [p.id for p in products])
        chosen = [current[p.id][1] for p in products if current[p.id][1] is not None]
    resolve = _resolver(_as_dicts(session, version))
    product_codes = {p.id: p.code for p in session.scalars(select(Product).where(
        Product.project_id == project_id, Product.id.in_({v.product_id for v in chosen})))} if chosen else {}
    asset_rows = {a.id: a for a in session.scalars(select(Asset).where(Asset.project_id == project_id))}
    kinds = {d.asset_id: d.equipment_type for d in session.scalars(select(EquipmentDetail).where(
        EquipmentDetail.project_id == project_id))}
    ports: dict[uuid.UUID, dict[str, list[AssetPort]]] = {}
    for port in session.scalars(select(AssetPort).where(AssetPort.project_id == project_id).order_by(AssetPort.port_key)):
        ports.setdefault(port.asset_id, {}).setdefault(port.role, []).append(port)
    out = []
    for pv in chosen:
        nodes, edges = process_repo.load_graph(session, project_id, pv.id)
        by_id = {n["id"]: n for n in nodes}
        moves = []
        for move in moves_rules.derive_moves(nodes, edges):
            a, b = by_id[move.from_node], by_id[move.to_node]
            step = by_id.get(move.step_node) if move.step_node else None
            carriers = moves_rules.candidates(step) if step else []
            key = (kinds.get(uuid.UUID(carriers[0])) if carriers else None) or travel.PERSON
            kmh, kmh_default = travel.speed_kmh(rule, key)
            handling, handling_default = travel.handling_minutes(rule) if step else (None, None)
            starts, finishes = _ends(a, ports, outgoing=True), _ends(b, ports, outgoing=False)
            pairs = []
            for (fa, fp) in starts:
                for (ta, tp) in finishes:
                    if len(pairs) >= MAX_PAIRS_PER_MOVE:
                        break
                    result = resolve(fp.id, tp.id)
                    minutes = None if not result["reachable"] else travel.travel_minutes(result["length"], kmh)
                    total = None if minutes is None else minutes + (Fraction(str(handling)) if handling is not None else 0)
                    pairs.append(MovePairOut(
                        from_asset_id=fa, from_asset_code=asset_rows[fa].code, from_port_id=fp.id, from_role=fp.role,
                        to_asset_id=ta, to_asset_code=asset_rows[ta].code, to_port_id=tp.id, to_role=tp.role,
                        travel_min=None if minutes is None else travel.fmt_minutes(minutes),
                        total_min=None if total is None else travel.fmt_minutes(total), **_path_fields(result)))
            note = None
            if not starts or not finishes:
                note = f"{'출발' if not starts else '도착'} 위치에 {'OUT·ACCESS' if not starts else 'IN·ACCESS'} 포트가 없어 경로를 만들 수 없습니다."
            elif len(starts) * len(finishes) > MAX_PAIRS_PER_MOVE:
                note = f"포트 쌍이 많아 앞 {MAX_PAIRS_PER_MOVE}쌍만 계산했습니다."
            moves.append(ProcessMoveOut(
                kind=move.kind, from_node_key=a["node_key"], from_label=a["label"], to_node_key=b["node_key"],
                to_label=b["label"], step_key=None if step is None else step["node_key"],
                step_label=None if step is None else step["label"], edge_keys=move.edge_keys,
                movement_mode=move.movement_mode,
                carrier_asset_codes=[asset_rows[uuid.UUID(c)].code for c in carriers],
                speed_key=key, speed_kmh=str(kmh), speed_defaulted=kmh_default,
                handling_min=None if handling is None else str(handling), handling_defaulted=handling_default,
                pairs=pairs, note=note))
        out.append(ProcessLinksOut(process_version_id=pv.id, product_id=pv.product_id,
                                   product_code=product_codes.get(pv.product_id), process_version_no=pv.version_no,
                                   moves=moves))
    return out
