"""컴파일 결과(RuntimeModel)와 컴파일 보고서. 컴파일 뒤에는 DB의 현재 상태를 읽지 않는다(07 §2-9)."""

from dataclasses import dataclass, field
from fractions import Fraction


@dataclass(frozen=True)
class TimingModel:
    kind: str  # speed(선속 m/min) | per_unit(산출 단위당 분) | none(처리 시간 없음)
    speed_m_per_min: Fraction | None = None
    unit_minutes: Fraction | None = None


@dataclass(frozen=True)
class OutputModel:
    mode: str  # split_length | pass_through
    unit_length_m: Fraction | None = None
    unit_count: int | None = None
    quantity_basis: str = "unknown"
    accounting_mode: str = "unknown"
    state_code: str | None = None  # 단계의 output spec(첫 번째)에서 읽은 재료 상태
    form: str | None = None


@dataclass(frozen=True)
class InputModel:
    """작업 한 번이 한 입력에서 한꺼번에 확보하는 작업물 수(07 §5: 작업 단위 원자 확보, 일부만 소비하지 않음).

    pool은 앞 노드 key다. 저장공간이 여러 단계로 갈라지면 그 단계들이 같은 pool(공간)에서 들어온 순서대로 가져간다.
    """

    pool: str
    count: int
    spec_key: str | None = None


@dataclass(frozen=True)
class DelayModel:
    """준비 대기(precondition_delay, 03 §4.4). occupancy: occupies_machine이면 설비를 쥔 채, releases_machine이면
    설비를 쥐기 전에 기다린다. 이번 범위의 발생 시점은 작업마다(per_operation)만."""

    minutes: Fraction
    occupancy: str


@dataclass(frozen=True)
class OutPolicy:
    """설비 OUT 배출 정책(DEC-006: 자산 버전 0.2.0의 release_rule이 정본).

    hold: 하류가 받을 때까지 설비 점유 유지(block_machine_while_waiting=yes, 또는 OUT 용량 not_allowed=직접 인계)
    release_after_out: OUT에 놓고 설비 해제, OUT이 차면 설비가 막힘(block_machine_while_waiting=no)
    """

    kind: str
    out_capacity: int | None = None  # release_after_out의 OUT 자리 수(None=무제한)


@dataclass(frozen=True)
class ResidualModel:
    """잔량 규칙(03 §6). mode가 carry_same_product일 때만 scope·join_mode가 확정되어 있다."""

    mode: str  # unknown | none | carry_same_product
    on_product_change: str = "unknown"  # discard | carry | unknown
    on_run_end: str = "unknown"  # discard | carry | unknown
    scope: str | None = None  # machine | product | operation | lot
    physical_join_mode: str = "unknown"  # abstract_length_pool | unknown


@dataclass(frozen=True)
class StepModel:
    key: str  # 노드 node_key
    node_id: str
    label: str
    handler: str
    handler_version: str
    candidates: tuple[str, ...]  # 설비 후보 asset id(스냅샷 순서 = 안정된 동순위 처리 순서)
    allocation: str  # none | single | first_available | fifo
    worker_unlimited: bool
    setup_minutes: Fraction
    timing: TimingModel
    output: OutputModel
    handoff: str  # per_output_unit | total_batch
    residual_mode: str
    transport_minutes: Fraction | None = None
    residual: ResidualModel | None = None
    out_policies: dict[str, OutPolicy] = field(default_factory=dict)  # 하류가 막힐 수 있을 때만 채운다
    inputs: tuple[InputModel, ...] = ()  # 입력별 확보 수(합류 단계는 여럿)
    consume_policy: str = "consume"  # consume(시작 때 소비) | transfer(작업 동안 쓰고 끝날 때 소비·공급은 그대로 전달)
    delay: DelayModel | None = None


@dataclass(frozen=True)
class NodeModel:
    key: str
    node_id: str
    kind: str  # source | buffer | operation | milestone | sink
    label: str
    asset_id: str | None
    next_key: str | None  # 다음 노드가 하나일 때만(저장공간이 여러 단계로 갈라지면 None)
    next_keys: tuple[str, ...] = ()


@dataclass(frozen=True)
class AssumptionUse:
    """컴파일이 사용한 시나리오 가정. 결과와 함께 보고한다(07 §12)."""

    code: str
    message: str
    node_key: str | None = None


@dataclass(frozen=True)
class CompileIssue:
    rule_id: str
    message: str
    node_key: str | None = None
    field_path: str | None = None


@dataclass(frozen=True)
class RuntimeModel:
    schema_version: str
    version_id: str
    project_id: str | None
    source_key: str
    completion_key: str | None
    route: tuple[str, ...]  # source에서 sink까지 위상 순서의 node_key(선형이면 흐름 순서)
    nodes: dict[str, NodeModel]
    steps: dict[str, StepModel]
    assumptions: tuple[AssumptionUse, ...] = ()
    # 저장공간 asset id → 자리 수(작업물 개수). None은 무제한(자산 버전이 unlimited이거나 시나리오 가정).
    spaces: dict[str, int | None] = field(default_factory=dict)


class CompileError(Exception):
    def __init__(self, issues: tuple[CompileIssue, ...]) -> None:
        super().__init__("; ".join(f"{i.rule_id}: {i.message}" for i in issues[:5]))
        self.issues = issues


@dataclass(frozen=True)
class CompileResult:
    model: RuntimeModel | None
    issues: tuple[CompileIssue, ...] = ()
    assumptions: tuple[AssumptionUse, ...] = ()
    waived: tuple[CompileIssue, ...] = field(default_factory=tuple)  # 가정으로 면제한 실행 검증 항목

    @property
    def ok(self) -> bool:
        return self.model is not None and not self.issues

    def require_model(self) -> RuntimeModel:
        if self.model is None or self.issues:
            raise CompileError(self.issues)
        return self.model
