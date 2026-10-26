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


@dataclass(frozen=True)
class NodeModel:
    key: str
    node_id: str
    kind: str  # source | buffer | operation | milestone | sink
    label: str
    asset_id: str | None
    next_key: str | None


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
    route: tuple[str, ...]  # source → sink 순서의 node_key
    nodes: dict[str, NodeModel]
    steps: dict[str, StepModel]
    assumptions: tuple[AssumptionUse, ...] = ()


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
