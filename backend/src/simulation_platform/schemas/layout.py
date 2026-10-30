"""배치판 DTO. 기준: CR-backend-20261028-be18-layout-points-routes(BE-21).

좌표·크기는 decimal 문자열(m)이다. 저장할 때 소수 첫째 자리로 반올림하고 응답도 소수 첫째 자리로 준다.
좌표계는 고정(`coordinate_system`): 도면 왼쪽 위 원점, x 오른쪽·y 아래쪽, 설비·공간의 x·y는 중심.
모르는 크기·회전은 null이다(0이 아니다).
"""

import re
import uuid
from decimal import Decimal
from typing import Annotated, ClassVar, Literal

from pydantic import AfterValidator, Field, JsonValue

from simulation_platform.schemas.common import (
    Code,
    FreeText,
    Name,
    Out,
    PatchIn,
    StrictIn,
    UtcDatetime,
)
from simulation_platform.schemas.scenario import NonNegativeDecimal, PositiveDecimal

_DEC = re.compile(r"^(0|[1-9][0-9]{0,6})(\.[0-9]{1,6})?$")


def _rotation(value: str) -> str:
    if not _DEC.match(value) or Decimal(value) >= 360:
        raise ValueError("0 이상 360 미만의 숫자 문자열이어야 합니다.")
    return value


Rotation = Annotated[str, AfterValidator(_rotation)]
Attributes = dict[str, JsonValue]
LayoutStatus = Literal["draft", "approved"]


class CoordinateSystemOut(Out):
    unit: Literal["m"] = "m"
    origin: Literal["top_left"] = Field(default="top_left", description="도면 왼쪽 위(11시 방향)")
    x_axis: Literal["right"] = "right"
    y_axis: Literal["down"] = Field(default="down", description="y는 아래쪽으로 커진다(이미지 좌표)")
    anchor: Literal["center"] = Field(default="center", description="설비·공간의 x·y는 중심")
    precision: Literal["0.1"] = Field(default="0.1", description="소수 첫째 자리까지, 그 아래는 반올림")


class LayoutVersionCreate(StrictIn):
    from_version_id: uuid.UUID | None = Field(
        default=None, description="복사할 배치판(모든 상태). 없으면 가장 최근 승인본, 그것도 없으면 빈 초안")


class LayoutVersionPatch(PatchIn):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("attributes",)

    name: Name | None = None
    notes: FreeText | None = None
    canvas_width_m: PositiveDecimal | None = Field(default=None, description="도면 가로(m). 모르면 null")
    canvas_height_m: PositiveDecimal | None = Field(default=None, description="도면 세로(m). 모르면 null")
    attributes: Attributes | None = Field(
        default=None, description="확장 속성. 통째로 교체. 약속 키 `background` = {url, width_px, height_px, m_per_px}(선택, 서버는 검사하지 않음)")


class LayoutPointIn(StrictIn):
    point_key: Code = Field(description="배치판 안에서 유일한 점 이름(예: P1)")
    x_m: NonNegativeDecimal
    y_m: NonNegativeDecimal
    attributes: Attributes = Field(default_factory=dict)


class PlacementIn(StrictIn):
    asset_id: uuid.UUID
    x_m: NonNegativeDecimal = Field(description="중심 x")
    y_m: NonNegativeDecimal = Field(description="중심 y")
    width_m: PositiveDecimal | None = Field(default=None, description="회전 전 가로(x 방향). 모르면 null")
    height_m: PositiveDecimal | None = Field(default=None, description="회전 전 세로(y 방향). 모르면 null")
    rotation_deg: Rotation | None = Field(
        default=None, description="중심 기준 회전(도, 0 이상 360 미만). y가 아래쪽인 화면에서 시계 방향이 +. 모르면 null(0으로 그림)")
    attributes: Attributes = Field(default_factory=dict)


class PortPointIn(StrictIn):
    port_id: uuid.UUID = Field(description="설비 IN/OUT 또는 공간 ACCESS 포트")
    point_key: Code


class RouteIn(StrictIn):
    route_key: Code
    from_port_id: uuid.UUID
    to_port_id: uuid.UUID
    mode: Code | None = Field(default=None, description="이동 수단(열린 목록, 예: forklift·amr·manual). 정하지 않으면 null")
    points: list[Code] = Field(description="지나는 점 key 순서(직선 구간의 이음). 첫 점 = 출발 포트의 점, 끝 점 = 도착 포트의 점")
    attributes: Attributes = Field(default_factory=dict)


class AisleIn(StrictIn):
    """통로(W): 포트에 묶이지 않은 다닐 수 있는 선(양방향). 꺾임은 점을 더 넣고, 갈림길·교차로는 같은 점을 공유해 잇는다."""

    aisle_key: Code = Field(description="배치판 안에서 유일한 통로 이름(예: W1)")
    points: list[Code] = Field(description="지나는 점 key 순서(2개 이상, 연속한 점 사이는 직선)")
    attributes: Attributes = Field(default_factory=dict)


class LayoutContentIn(StrictIn):
    """배치판 내용 전체(보낸 내용으로 통째로 교체). 보내지 않은 목록은 빈 목록으로 저장된다."""

    points: list[LayoutPointIn] = Field(default_factory=list)
    placements: list[PlacementIn] = Field(default_factory=list)
    port_points: list[PortPointIn] = Field(default_factory=list)
    routes: list[RouteIn] = Field(default_factory=list)
    aisles: list[AisleIn] = Field(default_factory=list, description="통로(0.18.0). 응답의 aisles를 그대로 다시 보내야 지워지지 않는다")


class LayoutPointOut(Out):
    point_key: str
    x_m: str
    y_m: str
    attributes: Attributes


class PlacementOut(Out):
    asset_id: uuid.UUID
    asset_code: str
    asset_name: str
    asset_kind: str
    x_m: str
    y_m: str
    width_m: str | None = None
    height_m: str | None = None
    rotation_deg: str | None = None
    attributes: Attributes


class PortPointOut(Out):
    port_id: uuid.UUID
    port_key: str
    role: str = Field(description="IN·OUT(설비) 또는 ACCESS(공간)")
    asset_id: uuid.UUID
    asset_code: str
    point_key: str


class RouteOut(Out):
    route_key: str
    from_port_id: uuid.UUID
    to_port_id: uuid.UUID
    from_asset_id: uuid.UUID
    to_asset_id: uuid.UUID
    mode: str | None = None
    points: list[str]
    length_m: str = Field(description="연속한 점 사이 직선 거리의 합(소수 첫째 자리, 계산값)")
    attributes: Attributes


class AisleOut(Out):
    aisle_key: str
    points: list[str]
    length_m: str = Field(description="연속한 점 사이 직선 거리의 합(소수 첫째 자리, 계산값)")
    attributes: Attributes


class LayoutVersionListItem(Out):
    id: uuid.UUID
    project_id: uuid.UUID
    version_no: int
    status: LayoutStatus
    name: str | None = None
    base_version_id: uuid.UUID | None = None
    approved_at: UtcDatetime | None = None
    created_at: UtcDatetime
    updated_at: UtcDatetime | None = None
    row_version: int


class LayoutVersionOut(LayoutVersionListItem):
    coordinate_system: CoordinateSystemOut = Field(default_factory=CoordinateSystemOut)
    notes: str | None = None
    canvas_width_m: str | None = None
    canvas_height_m: str | None = None
    attributes: Attributes
    approved_by: uuid.UUID | None = None
    points: list[LayoutPointOut]
    placements: list[PlacementOut]
    port_points: list[PortPointOut]
    routes: list[RouteOut]
    aisles: list[AisleOut] = Field(default_factory=list)


class PathPairIn(StrictIn):
    from_port_id: uuid.UUID
    to_port_id: uuid.UUID


class PathsIn(StrictIn):
    pairs: list[PathPairIn] = Field(min_length=1, max_length=500, description="출발 포트 → 도착 포트 쌍(최대 500)")


class PathOut(Out):
    from_port_id: uuid.UUID
    to_port_id: uuid.UUID
    reachable: bool
    source: Literal["fixed", "computed"] | None = Field(
        default=None, description="fixed: 저장된 고정 경로(우선), computed: 통로·고정 경로의 선분으로 계산한 최단 경로")
    route_key: str | None = Field(default=None, description="고정 경로면 그 key")
    points: list[str] = Field(default_factory=list, description="지나는 점 key 순서(출발 포트의 점 → 도착 포트의 점)")
    length_m: str | None = Field(default=None, description="길이(m, 소수 첫째 자리). 갈 수 없으면 null")
    reason: str | None = Field(default=None, description="갈 수 없는 이유(포트가 점에 매핑되지 않음·길이 없음 등)")


class LayoutIssueOut(Out):
    severity: Literal["error", "warning"]
    rule_id: str
    field_path: str
    message: str


class LayoutValidationOut(Out):
    layout_version_id: uuid.UUID
    approvable: bool = Field(description="오류가 0이면 승인할 수 있다(경고는 막지 않는다)")
    error_count: int
    warning_count: int
    issues: list[LayoutIssueOut]
