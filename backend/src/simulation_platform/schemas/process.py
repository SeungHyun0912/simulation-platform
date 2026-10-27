"""공정 버전·그래프 DTO. 기준: contracts/03 §4~8, CR-backend-20261023-be04-process-versions (BE-04a).

모든 규칙은 판별자(kind/mode)를 가진 닫힌 객체이며 알 수 없는 키는 거부한다. 값은 unknown이 기본이고 0이 아니다.
숫자 값은 03이 이름에 단위를 넣은 필드(speed_m_per_min, duration_min …)에 `{mode, value}`로 담는다.
"""

import re
import uuid
from decimal import Decimal
from typing import Annotated, ClassVar, Literal

from pydantic import Field, JsonValue, StringConstraints, model_validator

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
    # discard(0.8.0): 단계가 계획한 산출을 만들고 남은 길이를 그 자리에서 폐기한다(예: 100,000m 투입, 24,000m×4 산출,
    # 4,000m 폐기). 폐기 길이는 이벤트·계보에 기록된다. carry_same_product와 달리 잔량을 모아 두지 않는다.
    mode: Literal["unknown", "none", "carry_same_product", "discard"] = "unknown"
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


StateCode = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
FormText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class MaterialSpecDto(StrictIn):
    """operation 단계의 입력·출력 재료 spec(CR be06). 길이·중량·단위 수·가닥 수는 서로 환산하지 않는 별개 값이며
    재료 `default_spec`과 같은 값 객체다(기본 unknown). spec_key는 단계 안에서 입력·출력 공통으로 유일하다."""

    spec_key: Code
    direction: Literal["input", "output"]
    material_definition_id: uuid.UUID | None = None
    state_code: StateCode | None = None
    form: FormText | None = None
    length_m: DecimalMeasure = Field(default_factory=DecimalMeasure)
    weight_kg: DecimalMeasure = Field(default_factory=DecimalMeasure)
    unit_count: CountMeasure = Field(default_factory=CountMeasure)
    strand_count: CountMeasure = Field(default_factory=CountMeasure)
    quantity_basis: Literal["unknown", "per_operation", "per_input_unit", "per_lot",
                            "total_plan"] = "unknown"


def _unique_spec_keys(specs: list[MaterialSpecDto]) -> None:
    keys = [m.spec_key for m in specs]
    if len(set(keys)) != len(keys):
        raise ValueError("material_specs의 spec_key가 중복되었습니다.")


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
    material_specs: list[MaterialSpecDto] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def _unique_roles(self):
        roles = [r.role_key for r in self.resources]
        if len(set(roles)) != len(roles):
            raise ValueError("resources의 role_key가 중복되었습니다.")
        _unique_spec_keys(self.material_specs)
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
    source_output_spec_key: Code | None = Field(
        default=None, description="from 노드(operation) 단계의 output spec_key. precedence 간선에는 쓸 수 없다.")
    target_input_spec_key: Code | None = Field(
        default=None, description="to 노드(operation) 단계의 input spec_key. precedence 간선에는 쓸 수 없다.")


class GraphIn(StrictIn):
    """그래프 전체 교체(PUT). 보내지 않은 노드·간선은 삭제된다. 간선이 없는 노드를 가리키면 422."""

    nodes: list[GraphNode] = Field(max_length=500)
    edges: list[GraphEdge] = Field(default_factory=list, max_length=2000)
    completion_node_id: uuid.UUID | None = Field(
        default=None, description="완제품으로 판정하는 milestone 노드 id(같은 요청의 노드). null=미정")

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
    completion_node_id: uuid.UUID | None
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
    completion_node_id: uuid.UUID | None
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
        "resources", "material_specs")

    label: Name | None = None
    operation_type: TypeKey | None = None
    handler_version: TypeKey | None = None
    timing_rule: TimingRule | None = None
    input_rule: InputRule | None = None
    output_rule: OutputRule | None = None
    handoff_rule: HandoffRule | None = None
    residual_rule: ResidualRule | None = None
    resources: list[RequirementDto] | None = Field(default=None, max_length=50)
    material_specs: list[MaterialSpecDto] | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def _unique_roles(self):
        if self.resources is not None:
            roles = [r.role_key for r in self.resources]
            if len(set(roles)) != len(roles):
                raise ValueError("resources의 role_key가 중복되었습니다.")
        if self.material_specs is not None:
            _unique_spec_keys(self.material_specs)
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


# --- 복제 기준·비교·편집기 상태 (CR be05, BE-04b) -----------------------------------------------

class ProcessVersionCreate(StrictIn):
    """새 초안 생성 본문(선택). 생략·null이면 현재 승인본을 복사한다(0.4.0 동작)."""

    base_version_id: uuid.UUID | None = Field(
        default=None, description="복사할 같은 제품의 공정 버전(모든 상태 가능). 복사본은 항상 draft.")


DiffChange = Literal["added", "removed", "changed"]


class DiffField(Out):
    """엔티티 안의 JSON Pointer 경로와 before(against)·after(target) 값. 없는 쪽은 null이다."""

    field_path: str
    change: DiffChange
    before: JsonValue
    after: JsonValue


class NodeChange(Out):
    node_key: str
    fields: list[DiffField]


class EdgeChange(Out):
    edge_key: str
    fields: list[DiffField]


class NodeDiff(Out):
    added: list[GraphNode]
    removed: list[GraphNode]
    changed: list[NodeChange]


class StepDiff(Out):
    changed: list[NodeChange]


class EdgeDiff(Out):
    added: list[GraphEdge]
    removed: list[GraphEdge]
    changed: list[EdgeChange]


class DiffSummary(Out):
    added: int
    removed: int
    changed: int
    identical: bool


class VersionDiffOut(Out):
    target_version_id: uuid.UUID
    against_version_id: uuid.UUID
    header: list[DiffField]
    nodes: NodeDiff
    steps: StepDiff
    edges: EdgeDiff
    summary: DiffSummary


Coordinate = Annotated[float, Field(strict=True, ge=-1_000_000, le=1_000_000, allow_inf_nan=False)]


class NodePosition(StrictIn):
    x: Coordinate
    y: Coordinate


class Viewport(StrictIn):
    x: Coordinate
    y: Coordinate
    zoom: Annotated[float, Field(strict=True, gt=0, le=1000, allow_inf_nan=False)]


class EditorStateIn(StrictIn):
    """화면 좌표 전체 교체. 키는 이 버전의 노드 id여야 한다(노드 수 상한 500과 같다)."""

    node_positions: dict[uuid.UUID, NodePosition] = Field(max_length=500)
    viewport: Viewport | None = None


class EditorStateOut(Out):
    process_version_id: uuid.UUID
    node_positions: dict[uuid.UUID, NodePosition]
    viewport: Viewport | None
    row_version: int = Field(description="저장 전에는 0. 공정 버전의 row_version과 별개다.")
    updated_at: UtcDatetime | None
    updated_by: uuid.UUID | None
