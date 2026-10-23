"""공정 버전·그래프 DTO. 기준: contracts/03 §4~8, CR-backend-20261023-be04-process-versions (BE-04a).

모든 규칙은 판별자(kind/mode)를 가진 닫힌 객체이며 알 수 없는 키는 거부한다. 값은 unknown이 기본이고 0이 아니다.
숫자 값은 03이 이름에 단위를 넣은 필드(speed_m_per_min, duration_min …)에 `{mode, value}`로 담는다.
"""

import re
import uuid
from decimal import Decimal
from typing import Annotated, ClassVar, Literal

from pydantic import Field, StringConstraints, model_validator

from simulation_platform.schemas.catalog import (
    CountMeasure,
    DecimalMeasure,
    DefaultSpec,
    DefaultSpecPatch,
)
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
MeasureMode = Literal["unknown", "known", "not_applicable"]
NodeKind = Literal["source", "buffer", "operation", "join", "milestone", "sink"]
EdgeKind = Literal["material", "precedence", "supply"]
TypeKey = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
SetupTrigger = Literal[
    "unknown", "not_applicable", "per_operation", "per_input_replacement",
    "per_output_replacement", "on_product_change", "on_shift_start", "once_per_run"]
OutputSchedule = Literal["unknown", "sequential_units", "parallel_streams"]


class DurationMeasure(StrictIn):
    """시간(분). 준비·대기 시간은 0이 유효한 값이므로 known은 0 이상을 허용한다(처리 시간과 다름)."""

    mode: MeasureMode = "unknown"
    value: str | None = None

    @model_validator(mode="after")
    def _consistent(self):
        if self.mode == "known":
            if self.value is None:
                raise ValueError("known에는 value가 필요합니다.")
            if not _DEC.match(self.value) or Decimal(self.value) < 0:
                raise ValueError("value는 0 이상의 숫자 문자열(소수 6자리까지)이어야 합니다.")
        elif self.value is not None:
            raise ValueError(f"{self.mode}에는 value를 보낼 수 없습니다.")
        return self


# --- timing_rule ------------------------------------------------------------------------

class ProcessingUnknown(StrictIn):
    kind: Literal["unknown"]


class ProcessingNone(StrictIn):
    kind: Literal["none"]


class OutputSpeed(StrictIn):
    """선속 기준. basis·output_schedule·parallel_streams가 미정이면 실행 차단(03 §4.1)."""

    kind: Literal["output_speed"]
    speed_m_per_min: DecimalMeasure = Field(default_factory=DecimalMeasure)
    basis: Literal["unknown", "per_stream", "aggregate_output"] = "unknown"
    output_schedule: OutputSchedule = "unknown"
    parallel_streams: CountMeasure = Field(default_factory=CountMeasure)


class PerOutputUnit(StrictIn):
    kind: Literal["per_output_unit"]
    duration_min: DecimalMeasure = Field(default_factory=DecimalMeasure)
    output_schedule: OutputSchedule = "unknown"


class PerReferenceLength(StrictIn):
    """기준 길이당 시간. scaling=linear를 확인하기 전에는 다른 길이로 비례 계산하지 않는다."""

    kind: Literal["per_reference_length"]
    reference_length_m: DecimalMeasure = Field(default_factory=DecimalMeasure)
    duration_min: DecimalMeasure = Field(default_factory=DecimalMeasure)
    scaling: Literal["unknown", "linear"] = "unknown"
    includes_setup: Literal["unknown", "yes", "no"] = "unknown"


Processing = Annotated[
    ProcessingUnknown | ProcessingNone | OutputSpeed | PerOutputUnit | PerReferenceLength,
    Field(discriminator="kind")]


class Setup(StrictIn):
    duration_min: DurationMeasure = Field(default_factory=DurationMeasure)
    trigger: SetupTrigger = "unknown"


class PreconditionDelay(StrictIn):
    """공급 대기(예: AL 싱글-12의 120분). 설비 점유 여부(occupancy)는 미정일 수 있다."""

    duration_min: DurationMeasure = Field(default_factory=DurationMeasure)
    trigger: SetupTrigger = "unknown"
    occupancy: Literal["unknown", "occupies_machine", "releases_machine"] = "unknown"


class TimingRule(StrictIn):
    processing: Processing = Field(default_factory=lambda: ProcessingUnknown(kind="unknown"))
    setup: Setup = Field(default_factory=Setup)
    precondition_delay: PreconditionDelay = Field(default_factory=PreconditionDelay)


# --- 그 밖의 단계 규칙 -----------------------------------------------------------------------

class InputRule(StrictIn):
    acquire_scope: Literal["unknown", "per_operation", "per_lot"] = "unknown"
    consume_policy: Literal["unknown", "reserve", "consume", "transfer"] = "unknown"


class OutputRule(StrictIn):
    """길이·중량·단위 수·가닥 수를 섞지 않는다. 총 계획 수량과 작업 한 번의 산출량은 quantity_basis로 구분."""

    mode: Literal["unknown", "configured_units", "split_length", "pass_through", "merge_strands",
                  "fixed_mass_units"] = "unknown"
    unit_form: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1,
                                                max_length=50)] | None = None
    length_m: DecimalMeasure = Field(default_factory=DecimalMeasure)
    weight_kg: DecimalMeasure = Field(default_factory=DecimalMeasure)
    unit_count: CountMeasure = Field(default_factory=CountMeasure)
    quantity_basis: Literal["unknown", "per_operation", "per_input_unit", "per_lot",
                            "total_plan"] = "unknown"
    schedule: Literal["unknown", "sequential_units"] = "unknown"
    accounting_mode: Literal["unknown", "physical", "abstract_yield"] = "unknown"


class HandoffRule(StrictIn):
    mode: Literal["unknown", "per_output_unit", "total_batch"] = "unknown"


class ResidualRule(StrictIn):
    mode: Literal["unknown", "none", "carry_same_product"] = "unknown"
    on_product_change: Literal["unknown", "discard", "carry"] = "unknown"
    on_run_end: Literal["unknown", "discard", "carry"] = "unknown"
    scope: Literal["unknown", "machine", "product", "operation", "lot"] = "unknown"
    physical_join_mode: Literal["unknown", "abstract_length_pool"] = "unknown"


class AllocationRule(StrictIn):
    mode: Literal["unknown", "fifo", "priority", "first_available"] = "unknown"


class MovementRule(StrictIn):
    mode: Literal["unknown", "manual_duration", "network_route", "direct_feed"] = "unknown"
    duration_min: DurationMeasure = Field(default_factory=DurationMeasure)


# --- 자원 요구·단계·노드·간선 ------------------------------------------------------------------

class CandidateDto(StrictIn):
    asset_id: uuid.UUID
    eligibility_status: Literal["confirmed", "unknown"] = "unknown"


class RequirementDto(StrictIn):
    role_key: Code
    resource_kind: Literal["equipment", "worker"] = "equipment"
    selection_mode: Literal["one_of", "all_of"] = "one_of"
    required_count: Annotated[int, Field(ge=1, le=1000, strict=True)] = 1
    capacity_mode: Literal["finite", "unlimited"] = "finite"
    allocation_rule: AllocationRule = Field(default_factory=AllocationRule)
    candidates: list[CandidateDto] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def _consistent(self):
        if self.resource_kind == "worker" and self.candidates:
            raise ValueError("worker 요구에는 설비 후보를 둘 수 없습니다.")
        if self.capacity_mode == "unlimited" and self.resource_kind != "worker":
            raise ValueError("capacity_mode=unlimited는 worker에만 쓸 수 있습니다.")
        ids = [c.asset_id for c in self.candidates]
        if len(set(ids)) != len(ids):
            raise ValueError("같은 설비가 후보에 중복되었습니다.")
        return self


class StepDto(StrictIn):
    """operation 노드의 단계. 단계 id는 노드 id와 같다."""

    operation_type: TypeKey | None = None
    handler_version: TypeKey | None = None
    timing_rule: TimingRule = Field(default_factory=TimingRule)
    input_rule: InputRule = Field(default_factory=InputRule)
    output_rule: OutputRule = Field(default_factory=OutputRule)
    handoff_rule: HandoffRule = Field(default_factory=HandoffRule)
    residual_rule: ResidualRule = Field(default_factory=ResidualRule)
    resources: list[RequirementDto] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def _unique_roles(self):
        roles = [r.role_key for r in self.resources]
        if len(set(roles)) != len(roles):
            raise ValueError("resources의 role_key가 중복되었습니다.")
        return self


class GraphNode(StrictIn):
    id: uuid.UUID
    node_key: Code
    kind: NodeKind
    label: Name
    asset_id: uuid.UUID | None = None
    display_order: Annotated[int, Field(ge=0, le=1_000_000)] = 0
    step: StepDto | None = None

    @model_validator(mode="after")
    def _consistent(self):
        if self.kind == "operation" and self.step is None:
            raise ValueError("operation 노드에는 step이 필요합니다.")
        if self.kind != "operation" and self.step is not None:
            raise ValueError("operation이 아닌 노드에는 step을 둘 수 없습니다.")
        if self.asset_id is not None and self.kind not in ("source", "buffer", "sink"):
            raise ValueError("asset_id는 source·buffer·sink 노드에만 둘 수 있습니다.")
        return self


class GraphEdge(StrictIn):
    id: uuid.UUID
    edge_key: Code
    from_node_id: uuid.UUID
    to_node_id: uuid.UUID
    edge_kind: EdgeKind = "material"
    movement_rule: MovementRule = Field(default_factory=MovementRule)


class GraphIn(StrictIn):
    """그래프 전체 교체(PUT). 보내지 않은 노드·간선은 삭제된다. 간선이 없는 노드를 가리키면 422."""

    nodes: list[GraphNode] = Field(max_length=500)
    edges: list[GraphEdge] = Field(default_factory=list, max_length=2000)

    @model_validator(mode="after")
    def _unique(self):
        for label, values in (("노드 id", [n.id for n in self.nodes]),
                              ("node_key", [n.node_key for n in self.nodes]),
                              ("간선 id", [e.id for e in self.edges]),
                              ("edge_key", [e.edge_key for e in self.edges])):
            if len(set(values)) != len(values):
                raise ValueError(f"{label}가 중복되었습니다.")
        return self


class IssueDto(Out):
    """검증 항목. 대상은 entity_id(노드·단계·간선·버전 id) + 그 엔티티 내부 JSON Pointer다."""

    severity: Literal["error", "warning"]
    rule_id: str
    entity_id: uuid.UUID
    field_path: str
    message: str
    resolution: str | None = None


class GraphOut(Out):
    process_version_id: uuid.UUID
    row_version: int
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    issues: list[IssueDto]


# --- 버전 ---------------------------------------------------------------------------------

class ProcessVersionListItem(Out):
    id: uuid.UUID
    project_id: uuid.UUID
    product_id: uuid.UUID
    version_no: int
    status: Literal["draft", "in_review", "approved", "superseded"]
    base_version_id: uuid.UUID | None
    submitted_at: UtcDatetime | None
    approved_at: UtcDatetime | None
    created_at: UtcDatetime
    updated_at: UtcDatetime | None
    row_version: int


class ProcessVersionOut(ProcessVersionListItem):
    schema_version: str
    raw_unit_spec: DefaultSpec
    finished_unit_spec: DefaultSpec
    notes: str | None
    issues: list[IssueDto]
    submitted_by: uuid.UUID | None
    rejection_reason: str | None
    rejected_at: UtcDatetime | None
    approved_by: uuid.UUID | None


class ProcessVersionPatch(PatchIn):
    """원자재 기본 단위·완제품 단위·메모(초안만). 단위 값은 보낸 필드만 교체한다."""

    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("raw_unit_spec", "finished_unit_spec")

    raw_unit_spec: DefaultSpecPatch | None = None
    finished_unit_spec: DefaultSpecPatch | None = None
    notes: FreeText | None = None


class StepPatch(PatchIn):
    """보낸 최상위 필드를 통째로 교체한다(규칙 객체는 부분 병합하지 않는다)."""

    NON_NULLABLE: ClassVar[tuple[str, ...]] = (
        "label", "timing_rule", "input_rule", "output_rule", "handoff_rule", "residual_rule",
        "resources")

    label: Name | None = None
    operation_type: TypeKey | None = None
    handler_version: TypeKey | None = None
    timing_rule: TimingRule | None = None
    input_rule: InputRule | None = None
    output_rule: OutputRule | None = None
    handoff_rule: HandoffRule | None = None
    residual_rule: ResidualRule | None = None
    resources: list[RequirementDto] | None = Field(default=None, max_length=50)

    @model_validator(mode="after")
    def _unique_roles(self):
        if self.resources is not None:
            roles = [r.role_key for r in self.resources]
            if len(set(roles)) != len(roles):
                raise ValueError("resources의 role_key가 중복되었습니다.")
        return self


class StepOut(Out):
    id: uuid.UUID
    label: str
    row_version: int
    step: StepDto


class ValidationOut(Out):
    scope: Literal["knowledge", "run_template"]
    error_count: int
    warning_count: int
    issues: list[IssueDto]
