"""시나리오 버전의 실행 사전검증(로드맵 C-06). HTTP·ORM에 의존하지 않는 순수 규칙이다.

서비스가 DB에서 읽은 공정 버전·그래프·고정한 자산 버전을 dict로 넘기면, 시나리오 수준의 검사(SCN-*)를 하고
제품마다 엔진 `compile_snapshot`을 돌려 그 결과를 **번역하지 않고** 모은다. 실행은 하지 않는다(CR be08).
"""

from dataclasses import dataclass, field

from simulation_platform.simulation import ENGINE_VERSION
from simulation_platform.simulation.compiler import (
    ProcessSnapshot,
    ScenarioAssumptions,
    compile_snapshot,
)
from simulation_platform.simulation.compiler.assumptions import assumptions_from_scenario

FROZEN_PROCESS_STATUSES = frozenset({"approved", "superseded"})  # 승인됐던 버전(내용 동결)
FROZEN_REVISION_STATUSES = frozenset({"approved", "superseded"})


@dataclass(frozen=True)
class Issue:
    severity: str
    rule_id: str
    field_path: str | None
    message: str


@dataclass
class ProductInput:
    product_id: str
    version: dict  # process_version: id·project_id·status·schema_version·raw_unit_spec·finished_unit_spec
    graph: dict  # nodes·edges·completion_node_id (그래프 응답 모양)
    arrivals: list[dict]
    assumptions: dict  # AssumptionsDto 모양
    product: dict | None = None  # {code, name}: 실행 당시의 제품 표시 코드·이름(스냅샷에 고정, 결과 화면용)


@dataclass
class ProductResult:
    product_id: str
    process_version_id: str
    compiled: bool
    compile_issues: list[dict] = field(default_factory=list)
    assumptions_used: list[dict] = field(default_factory=list)
    waived: list[dict] = field(default_factory=list)


@dataclass
class PrecheckResult:
    issues: list[Issue]
    products: list[ProductResult]
    engine_version: str = ENGINE_VERSION

    @property
    def error_count(self) -> int:
        return (sum(i.severity == "error" for i in self.issues)
                + sum(len(p.compile_issues) for p in self.products))

    @property
    def warning_count(self) -> int:
        return sum(i.severity == "warning" for i in self.issues)

    @property
    def runnable(self) -> bool:
        return self.error_count == 0 and all(p.compiled for p in self.products)


def referenced_assets(graph: dict) -> set[str]:
    """공정이 참조하는 자산: 공간 노드의 asset_id와 단계 자원 후보 설비."""
    found = {n["asset_id"] for n in graph["nodes"] if n.get("asset_id")}
    for node in graph["nodes"]:
        for req in (node.get("step") or {}).get("resources", []):
            found.update(c["asset_id"] for c in req.get("candidates", []))
    return {str(a) for a in found}


def engine_assumptions(assumptions: dict) -> ScenarioAssumptions:
    return assumptions_from_scenario(assumptions)


def assumptions_used(assumptions: dict) -> bool:
    return bool(assumptions.get("equipment_hold") or assumptions.get("unbounded_buffers")
                or assumptions.get("manual_transport_minutes") or assumptions.get("residual_scope"))


def precheck(products: list[ProductInput], pinned_assets: dict[str, dict],
             assumption_reason: str | None) -> PrecheckResult:
    """pinned_assets: asset id → 엔진이 읽는 자산 버전 data(storage_capacity·ports)."""
    issues: list[Issue] = []
    if not products:
        issues.append(Issue("error", "SCN-PROD-001", "/products", "실행할 제품(공정 버전)이 없습니다."))
    referenced: set[str] = set()
    for i, item in enumerate(products):
        if not item.arrivals:
            issues.append(Issue("error", "SCN-ARR-001", f"/products/{i}/arrivals",
                                "도착 계획이 없습니다. 원자재가 들어오지 않으면 실행할 것이 없습니다."))
        issues.extend(_arrival_unit_warnings(i, item))
        referenced |= referenced_assets(item.graph)
    if any(assumptions_used(p.assumptions) for p in products) and not assumption_reason:
        issues.append(Issue("error", "SCN-ASM-001", "/assumption_reason",
                            "시나리오 가정을 썼는데 사유가 없습니다. 미정을 어떤 근거로 가정했는지 남겨야 합니다."))
    missing = sorted(referenced - set(pinned_assets))
    if missing:
        issues.append(Issue("warning", "SCN-ASSET-001", "/assets",
                            f"공정이 쓰는 자산 {len(missing)}개에 고정한 자산 버전이 없습니다. 그 자산의 용량·배출 규칙은 "
                            "모르는 값으로 실행 판정합니다(무제한으로 보지 않음)."))
    unused = sorted(set(pinned_assets) - referenced)
    if unused:
        issues.append(Issue("warning", "SCN-ASSET-002", "/assets",
                            f"고정한 자산 {len(unused)}개는 이 시나리오의 공정이 쓰지 않습니다."))

    results: list[ProductResult] = []
    for item in products:
        version = item.version
        snapshot = ProcessSnapshot.from_api(version, item.graph, pinned_assets)
        # 대체된(superseded) 버전도 승인됐던 동결 내용이라 실행할 수 있다(엔진의 승인 확인만 이 경우에 넘긴다).
        compiled = compile_snapshot(snapshot, engine_assumptions(item.assumptions),
                                    allow_unapproved=version["status"] in FROZEN_PROCESS_STATUSES)
        results.append(ProductResult(
            product_id=item.product_id, process_version_id=str(version["id"]), compiled=compiled.ok,
            compile_issues=[_issue_dict(i) for i in compiled.issues],
            assumptions_used=[{"code": a.code, "node_key": a.node_key, "message": a.message}
                              for a in compiled.assumptions],
            waived=[_issue_dict(i) for i in compiled.waived]))
    return PrecheckResult(issues, results)


def _arrival_unit_warnings(index: int, item: ProductInput) -> list[Issue]:
    """도착의 단위가 공정의 원자재 단위와 다르면 알린다(길이 있는 원자재에 길이 없는 도착, 길이 없는 원자재에 길이 있는 도착).
    실행은 길이 단계에 길이 없는 작업물이 오면 이유와 함께 멈추므로 사전에 경고한다."""
    length_mode = (item.version.get("raw_unit_spec") or {}).get("length_m", {}).get("mode")
    found: list[Issue] = []
    for j, arrival in enumerate(item.arrivals):
        has_length = arrival.get("length_m") is not None
        path = f"/products/{index}/arrivals/{j}"
        if length_mode == "known" and not has_length:
            found.append(Issue("warning", "SCN-ARR-002", path,
                               "공정의 원자재는 길이가 있는데 도착에 길이가 없습니다. 길이로 계산하는 단계에서 실행이 멈춥니다."))
        elif length_mode == "not_applicable" and has_length:
            found.append(Issue("warning", "SCN-ARR-002", path,
                               "공정의 원자재는 길이가 없는(해당 없음) 것인데 도착에 길이가 있습니다. 공정과 같은 단위로 입고하세요."))
    return found


def _issue_dict(issue) -> dict:
    return {"rule_id": issue.rule_id, "node_key": issue.node_key, "field_path": issue.field_path,
            "message": issue.message}
