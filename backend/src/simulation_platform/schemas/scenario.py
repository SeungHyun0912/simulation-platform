"""시나리오 버전 DTO. 기준: CR-backend-20261026-be07-scenario-versions (BE-05a, DEC-007).

숫자는 decimal 문자열(시각·길이·분), 개수는 JSON 정수다. 미정 값을 0이나 무제한으로 채우지 않는다:
가정은 시나리오가 명시한 것만 엔진에 넘기고 사전검증 결과에 그대로 보고된다.
"""

import re
import uuid
from decimal import Decimal
from typing import Annotated, ClassVar, Literal

from pydantic import AfterValidator, Field, model_validator

from simulation_platform.schemas.common import (
    Code,
    FreeText,
    Name,
    Out,
    PatchIn,
    StrictIn,
    UtcDatetime,
)

_DEC = re.compile(r"^(0|[1-9][0-9]{0,17})(\.[0-9]{1,6})?$")


def _non_negative(value: str) -> str:
    if not _DEC.match(value):
        raise ValueError("0 이상의 숫자 문자열(소수 6자리까지)이어야 합니다.")
    return value


def _positive(value: str) -> str:
    if not _DEC.match(value) or Decimal(value) <= 0:
        raise ValueError("0보다 큰 숫자 문자열(소수 6자리까지)이어야 합니다.")
    return value


NonNegativeDecimal = Annotated[str, AfterValidator(_non_negative)]
PositiveDecimal = Annotated[str, AfterValidator(_positive)]
ResidualScope = Literal["machine", "product", "operation", "lot"]


class ArrivalDto(StrictIn):
    """지정 시각 도착(시나리오 시작 기준 분). 같은 시각에 count개가 도착한다.

    원자재에 길이가 없는 공정(예: 2t·3.3t 원자재)은 `length_m`을 비우고 `weight_kg`만 보낸다(해당 없음 ≠ 0, 0.8.0).
    길이와 무게는 서로 환산하지 않으며 둘 중 하나는 있어야 한다."""

    at_min: NonNegativeDecimal = "0"
    count: Annotated[int, Field(ge=1, le=100_000, strict=True)]
    length_m: PositiveDecimal | None = None
    weight_kg: PositiveDecimal | None = None
    lot: Code | None = None

    @model_validator(mode="after")
    def _has_an_amount(self):
        if self.length_m is None and self.weight_kg is None:
            raise ValueError("도착에는 길이(length_m) 또는 무게(weight_kg)가 있어야 합니다.")
        return self


class AssumptionsDto(StrictIn):
    """공정의 미정을 이 시나리오에서만 해소하는 가정(master 공정은 바뀌지 않는다, ADR-017).

    키는 그 공정 버전의 node_key다. 값이 하나라도 있으면 시나리오 버전의 `assumption_reason`이 필요하다.
    """

    equipment_hold: Literal["hold_for_operation"] | None = Field(
        default=None, description="한 작업이 여러 산출을 낼 때 설비 점유 정책(07 §13)")
    unbounded_buffers: bool = Field(
        default=False, description="용량을 모르는 대기 장소를 용량 제한 없이 대기하는 것으로 가정")
    manual_transport_minutes: dict[Code, NonNegativeDecimal] = Field(
        default_factory=dict, max_length=200, description="수동 운반 단계(node_key)별 이동 시간(분, 0도 명시해야 함)")
    residual_scope: dict[Code, ResidualScope] = Field(
        default_factory=dict, max_length=200, description="잔량 이월 단계(node_key)별 잔량 범위(공정에 미정일 때만)")
    out_release: Literal["hold"] | None = Field(
        default=None, description="다음 공간이 가득 찼을 때, 승인된 자산 버전에 OUT 배출 정책이 없는 설비는 산출을 쥐고 기다린다(0.15.0)")
    carrier_empty_move_minutes: NonNegativeDecimal | None = Field(
        default=None, description="운반 자원(지게차·AMR)이 다른 곳에서 일을 받으면 빈 차로 옮겨 가는 시간(분). 운반 단계에 "
                                  "설비 후보가 있으면 필요(0.15.0)")

    @property
    def used(self) -> bool:
        return (self.equipment_hold is not None or self.unbounded_buffers
                or bool(self.manual_transport_minutes) or bool(self.residual_scope)
                or self.out_release is not None or self.carrier_empty_move_minutes is not None)


class ScenarioProductDto(StrictIn):
    """제품 하나 = 실행의 공정 하나. 목록 순서가 같은 시각 동순위의 처리 순서다."""

    product_id: uuid.UUID
    process_version_id: uuid.UUID = Field(description="그 제품의 승인된(또는 승인 후 대체된) 공정 버전")
    priority: Annotated[int, Field(ge=1, le=1000, strict=True)] = 1
    arrivals: list[ArrivalDto] = Field(default_factory=list, max_length=1000)
    assumptions: AssumptionsDto = Field(default_factory=AssumptionsDto)


class ScenarioAssetDto(StrictIn):
    asset_id: uuid.UUID
    asset_revision_id: uuid.UUID = Field(description="그 자산의 승인된(또는 승인 후 대체된) 자산 버전")


class DrainRule(StrictIn):
    """모든 작업물이 소진될 때까지(또는 더 진행할 사건이 없을 때까지)."""

    mode: Literal["drain"]


class FixedHorizonRule(StrictIn):
    """고정 지평선 `[0, H)`: H 시각의 사건은 처리하지 않는다(07 §11)."""

    mode: Literal["fixed_horizon"]
    horizon_min: PositiveDecimal


StoppingRule = Annotated[DrainRule | FixedHorizonRule, Field(discriminator="mode")]


class TravelRule(StrictIn):
    """이동 설정(0.19.0, CR be20). 비워 두면 사용자 기본값(속도 4 km/h, 상하차 1분)을 쓰고 사용한 가정으로 보고한다."""

    speeds_kmh: dict[Code, PositiveDecimal] = Field(
        default_factory=dict,
        description="이동 수단별 속도(km/h). 키: 사람 `person`, 운반 자원은 그 설비의 종류(equipment_type, 예: 지게차·AMR). "
                    "없는 키는 4 km/h")
    carrier_handling_minutes: NonNegativeDecimal | None = Field(
        default=None, description="운반(지게차·AMR) 1건의 상하차 시간(분). null이면 1분")


def _unique(values: list, message: str) -> None:
    if len(set(values)) != len(values):
        raise ValueError(message)


# --- 시나리오 ------------------------------------------------------------------------------

class ScenarioCreate(StrictIn):
    code: Code
    name: Name
    description: FreeText | None = None


class ScenarioPatch(PatchIn):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("name",)

    name: Name | None = None
    description: FreeText | None = None


class ScenarioVersionSummary(Out):
    id: uuid.UUID
    version_no: int
    status: Literal["draft", "approved"]


class ScenarioOut(Out):
    id: uuid.UUID
    project_id: uuid.UUID
    code: str
    name: str
    description: str | None
    latest_version: ScenarioVersionSummary | None
    created_at: UtcDatetime
    updated_at: UtcDatetime | None
    row_version: int


# --- 시나리오 버전 ---------------------------------------------------------------------------

class ScenarioVersionCreate(StrictIn):
    from_version_id: uuid.UUID | None = Field(
        default=None, description="복사할 같은 시나리오의 버전(모든 상태). 생략하면 가장 최근 승인 버전, 없으면 빈 초안")


class ScenarioVersionListItem(Out):
    id: uuid.UUID
    project_id: uuid.UUID
    scenario_id: uuid.UUID
    version_no: int
    status: Literal["draft", "approved"]
    base_version_id: uuid.UUID | None
    approved_at: UtcDatetime | None
    created_at: UtcDatetime
    updated_at: UtcDatetime | None
    row_version: int


class ScenarioVersionOut(ScenarioVersionListItem):
    products: list[ScenarioProductDto]
    assets: list[ScenarioAssetDto]
    stopping_rule: StoppingRule
    assumption_reason: str | None
    notes: str | None
    approved_by: uuid.UUID | None
    layout_version_id: uuid.UUID | None = Field(default=None, description="실행에 쓰는 배치판(승인본). null이면 배치판 없음")
    travel_rule: TravelRule = Field(default_factory=TravelRule)


class ScenarioVersionPatch(PatchIn):
    """보낸 최상위 필드를 통째로 교체한다(초안만). `products`만 보내고 `assets`를 보내지 않으면, 공정이 참조하는
    자산 가운데 아직 고정되지 않은 것을 그 자산의 현재 승인 버전으로 채운다(이미 고정한 것은 그대로)."""

    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("products", "assets", "stopping_rule", "travel_rule")

    products: list[ScenarioProductDto] | None = Field(default=None, max_length=50)
    assets: list[ScenarioAssetDto] | None = Field(default=None, max_length=2000)
    stopping_rule: StoppingRule | None = None
    assumption_reason: FreeText | None = None
    notes: FreeText | None = None
    layout_version_id: uuid.UUID | None = Field(default=None, description="이 프로젝트의 승인된 배치판. null로 지운다")
    travel_rule: TravelRule | None = None

    @model_validator(mode="after")
    def _unique_refs(self):
        if self.products is not None:
            _unique([p.process_version_id for p in self.products], "같은 공정 버전을 두 번 넣을 수 없습니다.")
        if self.assets is not None:
            _unique([a.asset_id for a in self.assets], "같은 자산을 두 번 고정할 수 없습니다.")
        return self


# --- 사전검증 -------------------------------------------------------------------------------

class PrecheckIssue(Out):
    severity: Literal["error", "warning"]
    rule_id: str
    field_path: str | None = None
    message: str


class CompileIssueOut(Out):
    """엔진 컴파일 결과를 번역하지 않고 그대로 담는다(rule_id = 엔진 코드 또는 도메인 실행 검증 코드)."""

    rule_id: str
    node_key: str | None = None
    field_path: str | None = None
    message: str


class AssumptionUseOut(Out):
    code: str
    node_key: str | None = None
    message: str


class ProductPrecheck(Out):
    product_id: uuid.UUID
    process_version_id: uuid.UUID
    compiled: bool
    compile_issues: list[CompileIssueOut]
    assumptions_used: list[AssumptionUseOut]
    waived: list[CompileIssueOut]


class PrecheckOut(Out):
    scenario_version_id: uuid.UUID
    runnable: bool
    error_count: int
    warning_count: int
    issues: list[PrecheckIssue]
    products: list[ProductPrecheck]
    engine_version: str


# --- 최신 승인 공정으로 갱신(CR be14, 0.14.0) -------------------------------------------------------------

class ScenarioRefreshIn(StrictIn):
    product_ids: list[uuid.UUID] | None = Field(default=None, description="일부 제품만 갱신(생략하면 전부)")
    assets: Literal["latest", "keep"] = Field(
        default="latest", description="latest: 쓰는 자산을 현재 승인 버전으로 다시 고정하고 안 쓰는 고정은 뺀다, "
                                      "keep: 기존 고정은 두고 새로 쓰는 자산만 채운다")
    layout: Literal["latest", "keep"] = Field(
        default="latest", description="(0.19.0) latest: 배치판을 고른 초안이면 그 프로젝트의 최근 승인 배치판으로 바꾼다, keep: 그대로")


class ProcessChangeOut(Out):
    product_id: uuid.UUID
    product_code: str | None = None
    from_process_version_id: uuid.UUID
    from_version_no: int | None = None
    to_process_version_id: uuid.UUID
    to_version_no: int | None = None
    status: Literal["changed", "unchanged", "no_approved_version", "not_requested"]


class AssetPinChangeOut(Out):
    asset_id: uuid.UUID
    asset_code: str | None = None
    from_revision_id: uuid.UUID | None = None
    to_revision_id: uuid.UUID | None = None
    change: Literal["pinned", "updated", "removed"]


class LayoutChangeOut(Out):
    from_layout_version_id: uuid.UUID
    to_layout_version_id: uuid.UUID
    to_version_no: int


class ScenarioRefreshOut(Out):
    version: ScenarioVersionOut
    process_changes: list[ProcessChangeOut]
    asset_changes: list[AssetPinChangeOut]
    layout_change: LayoutChangeOut | None = Field(default=None, description="(0.19.0) 배치판을 바꿨으면 이전·새 버전")
