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
