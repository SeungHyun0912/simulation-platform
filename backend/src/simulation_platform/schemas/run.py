"""실행(run) DTO. 기준: CR be08(DEC-008) be08a.

결과 요약(`RunResultOut`)은 엔진 실행이 끝났을 때의 작은 요약이며 이벤트·지표는 후속 단계(be08b·be08c)에서 조회한다.
시각은 가상 시간(분)이고 decimal 문자열(`min`, 표시용)과 정확한 분수 문자열(`exact`)을 함께 준다.
"""

import uuid
from typing import Annotated, Literal

from pydantic import Field, JsonValue

from simulation_platform.schemas.common import Out, StrictIn, UtcDatetime
from simulation_platform.schemas.scenario import AssumptionUseOut

RunStatus = Literal["queued", "running", "completed", "stalled", "horizon_reached", "failed", "limit_reached",
                    "cancelled"]
Seed = Annotated[int, Field(ge=0, le=2_147_483_647, strict=True)]


class RunCreate(StrictIn):
    scenario_version_id: uuid.UUID = Field(description="승인된 시나리오 버전")
    seed: Seed = 0
    replicate_index: Seed = 0


class MinutesOut(Out):
    min: str = Field(description="가상 시간(분), 소수 6자리 decimal 문자열(표시용 반올림)")
    exact: str = Field(description="정확한 값(분수 문자열, 예: 100/3)")


class ProductResultOut(Out):
    product_id: str
    process_version_id: str
    product_code: str | None = Field(default=None, description="제품 표시 코드(실행 요청 당시 값, 이전 run은 현재 제품 목록으로 보충)")
    product_name: str | None = None
    completed_items: int = Field(description="완제품 milestone에 도달한 작업물 수")
    completed_length_m: str
    reached_sink: int
    discarded_length_m: str = Field(description="잔량 폐기 길이 합계(m)")
    first_completion: MinutesOut | None = None
    last_completion: MinutesOut | None = None


class ShortfallOut(Out):
    """입력 부족: 어느 단계가 몇 개를 기다리는데 몇 개가 필요한지."""

    process_version_id: str
    pool: str
    step: str | None = None
    waiting: int
    held: int
    needed: int


class ResidualOut(Out):
    pool: str
    length_m: str
    process_version_id: str
    disposition: str


class FailureOut(Out):
    reason: str
    step_key: str | None = None
    message: str | None = None


class CompileProblemOut(Out):
    product_index: int
    rule_id: str
    node_key: str | None = None
    message: str


class RunResultOut(Out):
    state: RunStatus
    reason: str | None = None
    censored: bool = Field(default=False, description="고정 지평선에서 끊긴 관측 중단")
    end_time: MinutesOut | None = None
    horizon: MinutesOut | None = None
    event_count: int = 0
    engine_version: str
    seed: int | None = None
    products: list[ProductResultOut] = Field(default_factory=list)
    assumptions: list[AssumptionUseOut] = Field(default_factory=list)
    shortfalls: list[ShortfallOut] = Field(default_factory=list)
    residuals: list[ResidualOut] = Field(default_factory=list)
    wip_items: int = 0
    failure: FailureOut | None = None
    compile_issues: list[CompileProblemOut] = Field(default_factory=list)


class AttemptOut(Out):
    attempt_no: int
    state: Literal["running", "finished", "failed", "cancelled", "abandoned"]
    worker_id: str
    started_at: UtcDatetime
    heartbeat_at: UtcDatetime | None
    finished_at: UtcDatetime | None
    termination_reason: str | None


class RunListItem(Out):
    id: uuid.UUID
    project_id: uuid.UUID
    scenario_version_id: uuid.UUID
    status: RunStatus
    requested_at: UtcDatetime
    started_at: UtcDatetime | None
    finished_at: UtcDatetime | None
    seed: int
    replicate_index: int
    input_hash: str


class RunOut(RunListItem):
    requested_by: uuid.UUID
    engine_version: str
    cancel_requested_at: UtcDatetime | None
    termination_reason: str | None
    attempts: list[AttemptOut]
    result: RunResultOut | None = Field(description="공식 결과 시도의 요약. 아직 끝나지 않았거나 취소·인프라 실패면 null")


class RunInputOut(Out):
    run_id: uuid.UUID
    schema_version: str
    sha256: str = Field(description="정규화 JSON의 SHA-256(= run.input_hash)")
    hash_verified: bool = Field(description="저장된 스냅샷을 다시 정규화해 해시가 맞는지 확인한 결과")
    snapshot: dict[str, JsonValue]


class EventOut(Out):
    event_seq: int
    sim_time: MinutesOut
    event_type: str
    step_key: str | None = None
    operation_id: str | None = None
    asset_key: str | None = None
    item_key: str | None = None
    process_version_id: str | None = None
    source: str | None = None
    destination: str | None = None
    reason: str | None = None
    quantities: dict[str, JsonValue] = Field(
        default_factory=dict, description="양·상태. 길이·무게는 decimal 문자열이며 `STATE_SNAPSHOT`은 상태 요약을 담는다")


class WorkItemOut(Out):
    item_key: str
    parent_key: str | None = None
    process_version_id: str | None = None
    lot_key: str | None = None
    state_code: str | None = None
    form: str | None = None
    length_m: str | None = Field(default=None, description="없으면 null(해당 없음 ≠ 0)")
    weight_kg: str | None = None
    location_key: str | None = None
    status: Literal["active", "consumed", "completed"]
    created_at: MinutesOut


class LineageLinkOut(Out):
    parent_key: str
    child_key: str | None = Field(default=None, description="자식이 없으면(전부 잔량·폐기) null")
    parent_length_m: str | None = None
    child_length_m: str | None = None


class LineageOperationOut(Out):
    operation_key: str
    step_key: str
    relation_type: Literal["split", "transform", "supply", "yield"]
    accounting_mode: Literal["physical", "abstract_yield"] = Field(
        description="`abstract_yield`는 물량 보존 검증 대상이 아니다(03 §5)")
    process_version_id: str | None = None
    residual_length_m: str | None = Field(default=None, description="이 작업이 남긴 잔량(작업 단위 값)")
    carried_in_m: str | None = Field(default=None, description="이 작업이 잔량 풀에서 이어 받은 길이")
    balanced: bool | None = Field(default=None, description="자식 길이 합 + 잔량 = 부모 길이. 검증 대상이 아니면 null")
    links: list[LineageLinkOut]


class LineageOut(Out):
    item_key: str
    items: list[WorkItemOut] = Field(description="계보에 나온 작업물(조상·후손 전부)")
    operations: list[LineageOperationOut] = Field(description="그 작업물을 만들거나 바꾼 작업, 이벤트 순서")
    truncated: bool = Field(default=False, description="작업물이 너무 많아 일부만 담았다")


MetricWindowKind = Literal["run", "day", "week", "month"]
MetricQuality = Literal["complete", "censored", "incomplete"]


class MetricWindowOut(Out):
    kind: MetricWindowKind = Field(description="run: 실행 전체, day: 1,440분, week: 7일, month: 30일(24시간 연속 기준)")
    start: MinutesOut
    end: MinutesOut = Field(description="마지막 구간은 실행이 끝난 시각까지로 잘린다(관측 시간 = end − start)")


class MetricOut(Out):
    metric_key: str
    dimensions: dict[str, str] = Field(
        description="차원: `process_version_id`(공정 버전별) 또는 `asset_key`(설비) 또는 `node_key`(대기 공간)")
    window: MetricWindowOut
    value: str | None = Field(description="decimal 문자열. 분모가 0이거나 해당 없으면 null(0이 아니다)")
    unit: str
    definition_version: str
    quality_status: MetricQuality = Field(
        description="complete: 끝까지 실행, censored: 고정 지평선에서 끊긴 관측, incomplete: 입력 부족·한도 등으로 끝나지 못함")


class MetricDefinitionOut(Out):
    metric_key: str
    unit: str
    dimension: Literal["process_version_id", "asset_key", "node_key", "step"] = Field(
        description="`step`은 공정 버전과 단계를 함께(`process_version_id`+`step_key`) 가리킨다")
    description: str
    definition_version: str


class BottleneckLocationOut(Out):
    process_version_id: str | None = None
    product_id: str | None = None
    product_code: str | None = None
    product_name: str | None = None
    step_key: str | None = None
    step_label: str | None = None
    node_key: str | None = None
    node_label: str | None = None


class BottleneckOut(Out):
    rank: int = Field(description="전체 순위(level → 종류 순서 → 멈춘 양)")
    rank_in_kind: int = Field(description="같은 종류 안에서의 순위(멈춘 양 큰 순)")
    kind: Literal["space_full", "equipment_busy", "queue_pileup"] = Field(
        description="space_full: 다음 저장 공간 부족으로 멈춤, equipment_busy: 다음 설비의 가동으로 멈춤, "
                    "queue_pileup: 대기 자재가 쌓임(운반이 1제품씩이라는 기준)")
    level: Literal["high", "medium", "low"] = Field(description="같은 종류 안의 비율(`share`)과 멈춘 양으로 정한 정도(임시 기준값)")
    stalled_item_min: str = Field(description="멈춘 양(작업물·분). 종류가 다르면 겹치므로 합산하지 않는다")
    share: str = Field(description="같은 종류의 멈춘 양 합계 대비 비율(0~1)")
    location: BottleneckLocationOut
    explanation: str = Field(description="한국어 한 줄 설명(수치 포함)")
    evidence: dict[str, JsonValue] = Field(description="근거 수치(종류마다 다름). 숫자는 decimal 문자열")


class BottleneckSummaryOut(Out):
    run_id: uuid.UUID
    quality_status: MetricQuality
    observed: MinutesOut = Field(description="관측한 가상 시간(실행 종료 시각)")
    definition_version: str
    headline: str
    findings: list[BottleneckOut]
    limitations: list[str] = Field(description="이 판정의 한계(가정·모델링하지 않은 것). 화면에 함께 보여야 한다")
    thresholds: dict[str, str] = Field(description="판정에 쓴 기준값(임시 휴리스틱)")


class AssetUseOut(Out):
    process_version_id: str
    product_code: str | None = None
    step_key: str
    step_label: str | None = None


class AssetTimelineBucketOut(Out):
    start: MinutesOut
    end: MinutesOut
    processing_min: str
    setup_min: str
    reserved_min: str
    blocked_min: str
    idle_min: str = Field(description="구간 길이 − (처리+준비+예약+막힘). 가동 달력이 없어 24시간 기준")
    utilization: str | None = Field(description="처리 ÷ 구간 길이(0~1). 구간 길이가 0이면 null")


class AssetTimelineOut(Out):
    asset_id: str
    asset_code: str | None = None
    asset_name: str | None = None
    used: bool = Field(description="이 실행에서 한 번이라도 배정됐는가. false면 후보였지만 쓰이지 않아 전 구간 유휴")
    uses: list[AssetUseOut] = Field(description="이 설비를 후보로 가진 제품·단계")
    buckets: list[AssetTimelineBucketOut]


class AssetStateSegmentOut(Out):
    state: str = Field(description="IDLE·RESERVED·SETUP·PROCESSING·BLOCKED(열린 목록)")
    start: MinutesOut
    end: MinutesOut
    duration_min: str
    operation_id: str | None = None
    step_key: str | None = None
    process_version_id: str | None = None
    product_code: str | None = None


class InputChangeOut(Out):
    path: str = Field(description="바뀐 입력의 위치(예: `products.P04.arrivals`, `assets.{asset_id}`, `seed`)")
    base: JsonValue = None
    other: JsonValue = None
    note: str | None = None


class MetricPairOut(Out):
    metric_key: str
    unit: str | None = None
    base: str | None = None
    other: str | None = None
    delta: str | None = Field(default=None, description="비교 − 기준. 한쪽이 없으면 null")
    ratio: str | None = Field(default=None, description="비교 ÷ 기준. 한쪽이 없거나 기준이 0이면 null")


class ProductComparisonOut(Out):
    product_id: str
    product_code: str | None = None
    product_name: str | None = None
    base_process_version_id: str
    other_process_version_id: str
    metrics: list[MetricPairOut]
    base_last_completion: MinutesOut | None = None
    other_last_completion: MinutesOut | None = None


class ComparisonBottlenecksOut(Out):
    base: list[BottleneckOut]
    other: list[BottleneckOut]


class RunComparisonOut(Out):
    base_run_id: uuid.UUID
    other_run_id: uuid.UUID
    comparable: bool = Field(description="엔진 버전이 같아 결과 차이를 입력 차이로 설명할 수 있는가")
    warnings: list[str]
    base_status: str
    other_status: str
    base_end_time: MinutesOut | None = None
    other_end_time: MinutesOut | None = None
    input_changes: list[InputChangeOut]
    products: list[ProductComparisonOut] = Field(description="두 실행에 모두 있는 제품(제품 id로 맞춤)의 핵심 지표 비교")
    bottlenecks: ComparisonBottlenecksOut = Field(description="양쪽 병목 요약 상위 5개")


class MetricComparisonOut(Out):
    metric_key: str
    unit: str | None = None
    dimensions: dict[str, str] = Field(description="공정 버전 대신 `product_id`(+`product_code`)로 맞춘 차원")
    base_process_version_id: str | None = None
    other_process_version_id: str | None = None
    window: MetricWindowOut
    base: str | None = None
    other: str | None = None
    delta: str | None = None
    ratio: str | None = None
