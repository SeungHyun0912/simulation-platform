"""snapshot → RuntimeModel 컴파일러(07 §2). 컴파일이 통과해야만 실행할 수 있다.

순서: schema_version·상태 확인 → 도메인 실행 검증(run_template) → 경로 해석 → handler 선택·단계 모델 구성 →
시나리오 가정 요구 확인. 오류는 첫 번째에서 멈추지 않고 모아서 보고한다(미정을 한꺼번에 알려 주기 위해).
엔진이 지원하지 않는 구조·값은 조용히 무시하거나 자동 선택하지 않고 이유와 함께 컴파일 오류로 막는다.
"""

from fractions import Fraction

from simulation_platform.domain import process as rules
from simulation_platform.simulation import SUPPORTED_SCHEMA_VERSIONS
from simulation_platform.simulation.compiler.assumptions import (
    HOLD_FOR_OPERATION,
    RESIDUAL_SCOPES,
    SUPPORTED_EQUIPMENT_HOLD,
    ScenarioAssumptions,
)
from simulation_platform.simulation.compiler.model import (
    AssumptionUse,
    CompileIssue,
    CompileResult,
    DelayModel,
    InputModel,
    NodeModel,
    OutPolicy,
    OutputModel,
    ResidualModel,
    RuntimeModel,
    StepModel,
    TimingModel,
)
from simulation_platform.simulation.compiler.snapshot import ProcessSnapshot
from simulation_platform.simulation.handlers import get_handler
from simulation_platform.simulation.handlers.base import HandlerDef
from simulation_platform.simulation.numbers import to_fraction

TRANSPORT = "transport_manual"


def compile_snapshot(snapshot: ProcessSnapshot, assumptions: ScenarioAssumptions | None = None,
                     *, allow_unapproved: bool = False) -> CompileResult:
    return _Compiler(snapshot, assumptions or ScenarioAssumptions(), allow_unapproved).run()


class _Compiler:
    def __init__(self, snapshot: ProcessSnapshot, assumptions: ScenarioAssumptions,
                 allow_unapproved: bool) -> None:
        self.snapshot, self.assumptions, self.allow_unapproved = snapshot, assumptions, allow_unapproved
        self.nodes = list(snapshot.nodes)
        self.edges = list(snapshot.edges)
        self.key_of = {n["id"]: n["node_key"] for n in self.nodes}
        self.issues: list[CompileIssue] = []
        self.waived: list[CompileIssue] = []
        self.used: list[AssumptionUse] = []

    def issue(self, rule_id: str, message: str, node_key: str | None = None,
              field_path: str | None = None) -> None:
        self.issues.append(CompileIssue(rule_id, message, node_key, field_path))

    # --- 진입 -------------------------------------------------------------------------------
    def run(self) -> CompileResult:
        self._check_header()
        self._check_run_validation()
        route, succ, in_edges = self._route()
        nodes: dict[str, NodeModel] = {}
        steps: dict[str, StepModel] = {}
        by_key = {n["node_key"]: n for n in self.nodes}
        self.spaces = self._check_spaces(route, by_key, succ)
        for key in route:
            node = by_key[key]
            following = tuple(succ.get(key, ()))
            nodes[key] = NodeModel(key, node["id"], node["kind"], node["label"], node["asset_id"],
                                   following[0] if len(following) == 1 else None, following)
            if node["kind"] == "operation":
                step = self._build_step(node, following[0] if len(following) == 1 else None, by_key,
                                        in_edges.get(key, []))
                if step is not None:
                    steps[key] = step
        if self.issues:
            return CompileResult(None, tuple(self.issues), tuple(self.used), tuple(self.waived))
        completion = self.snapshot.completion_node_id
        model = RuntimeModel(
            schema_version=self.snapshot.schema_version, version_id=self.snapshot.version_id,
            project_id=self.snapshot.project_id, source_key=route[0],
            completion_key=None if completion is None else self.key_of.get(completion),
            route=tuple(route), nodes=nodes, steps=steps, assumptions=tuple(self.used),
            spaces=dict(self.spaces))
        return CompileResult(model, (), tuple(self.used), tuple(self.waived))

    # --- 1. 버전·schema ---------------------------------------------------------------------
    def _check_header(self) -> None:
        if self.snapshot.schema_version not in SUPPORTED_SCHEMA_VERSIONS:
            self.issue("UNSUPPORTED_SCHEMA_VERSION",
                       f"지원하지 않는 schema_version {self.snapshot.schema_version}입니다.")
        if self.snapshot.status != "approved" and not self.allow_unapproved:
            self.issue("VERSION_NOT_APPROVED",
                       f"승인된 공정 버전만 실행할 수 있습니다(현재 {self.snapshot.status}).")

    # --- 2. 도메인 실행 검증 -----------------------------------------------------------------
    def _check_run_validation(self) -> None:
        snap = self.snapshot
        base = rules.graph_issues(snap.version_id, snap.raw_unit_spec, snap.finished_unit_spec,
                                  self.nodes, self.edges, snap.completion_node_id)
        waivable = {n["id"] for n in self.nodes
                    if (n["step"] or {}).get("operation_type") == TRANSPORT
                    and n["node_key"] in self.assumptions.manual_transport_minutes}
        for found in rules.for_run_template(base, self.nodes):
            if found.severity != "error":
                continue
            item = CompileIssue(found.rule_id, found.message, self.key_of.get(found.entity_id),
                                found.field_path)
            # 수동 운반은 시나리오가 이동 시간을 명시하면 단계의 미정 값(운반 자원·처리 규칙)을 이 가정으로 대체한다.
            if found.entity_id in waivable and found.rule_id != "UNSUPPORTED_HANDLER":
                self.waived.append(item)
            else:
                self.issues.append(item)

    # --- 3. 경로(선형 + 저장공간 분기 + 단계 합류, C0-07) --------------------------------------------
    def _route(self) -> tuple[list[str], dict[str, list[str]], dict[str, list[tuple[str, dict]]]]:
        """source에서 이어지는 노드의 위상 순서, 다음 노드 목록, 단계별 들어오는 간선(앞 노드 key, 간선).

        지원: material·supply 간선(공급도 작업물이 실제로 옮겨 간다), 저장공간에서 여러 단계로 갈라지는 분기
        (그 단계들이 한 공간에서 함께 가져간다), 단계로 여러 입력이 모이는 합류. 그 밖의 분기·합류, precedence(완료 의존)
        간선, join 노드, 순환은 의미가 정해지지 않아 막는다.
        """
        by_id = {n["id"]: n for n in self.nodes}
        kind_of = {n["node_key"]: n["kind"] for n in self.nodes}
        sources = [n for n in self.nodes if n["kind"] == "source"]
        if len(sources) != 1:
            self.issue("ROUTE_SOURCE", f"source 노드는 정확히 하나여야 합니다(현재 {len(sources)}개).")
            return [], {}, {}
        succ: dict[str, list[str]] = {}
        in_edges: dict[str, list[tuple[str, dict]]] = {}
        for edge in self.edges:
            a, b = by_id[edge["from_node_id"]]["node_key"], by_id[edge["to_node_id"]]["node_key"]
            if edge["edge_kind"] == "precedence":
                self.issue("NONLINEAR_EDGE_UNSUPPORTED",
                           f"{edge['edge_key']}: precedence(완료 의존) 간선은 아직 실행하지 않습니다.",
                           field_path=f"/edges/{edge['edge_key']}")
                continue
            if edge["edge_kind"] == "supply" and not (kind_of[a] == kind_of[b] == "operation"):
                self.issue("NONLINEAR_EDGE_UNSUPPORTED",
                           f"{edge['edge_key']}: 공급 간선은 단계에서 단계로만 실행합니다.",
                           field_path=f"/edges/{edge['edge_key']}")
                continue
            succ.setdefault(a, []).append(b)
            in_edges.setdefault(b, []).append((a, edge))
        for key, following in succ.items():
            if len(following) > 1 and not (kind_of[key] == "buffer"
                                           and all(kind_of[f] == "operation" for f in following)):
                self.issue("BRANCH_UNSUPPORTED",
                           f"{key}: 저장공간에서 단계들로 갈라지는 분기만 실행합니다(그 밖의 분기는 나눠 보낼 규칙이 없음).", key)
        for key, edges in in_edges.items():
            if len(edges) > 1 and kind_of[key] != "operation":
                self.issue("JOIN_UNSUPPORTED", f"{key}: 단계가 아닌 노드로 여러 입력이 모이는 흐름은 아직 실행하지 않습니다.", key)
        for node in self.nodes:
            if node["kind"] == "join":
                self.issue("JOIN_UNSUPPORTED", f"{node['node_key']}: join 노드는 아직 실행하지 않습니다(단계의 입력 spec으로 합류).",
                           node["node_key"])
        start = sources[0]["node_key"]
        reachable, stack = {start}, [start]
        while stack:
            for following in succ.get(stack.pop(), []):
                if following not in reachable:
                    reachable.add(following)
                    stack.append(following)
        indegree = {k: sum(1 for a, _ in in_edges.get(k, []) if a in reachable) for k in reachable}
        order_of = {n["node_key"]: i for i, n in enumerate(self.nodes)}
        ready, route = [start], []
        while ready:  # 위상 순서(동순위는 snapshot 노드 순서)
            ready.sort(key=order_of.get)
            key = ready.pop(0)
            route.append(key)
            for following in succ.get(key, []):
                indegree[following] -= 1
                if indegree[following] == 0:
                    ready.append(following)
        if len(route) < len(reachable):
            self.issue("ROUTE_CYCLE", "순환하는 흐름은 반복 종료 규칙이 없어 실행하지 않습니다.")
        for key in route:
            if kind_of[key] != "sink" and not succ.get(key):
                self.issue("ROUTE_NO_SINK", f"경로가 sink 노드로 끝나지 않습니다(막다른 노드 {key}).", key)
        sinks = [k for k in route if kind_of[k] == "sink"]
        if len(sinks) > 1:
            self.issue("ROUTE_SINK", f"sink 노드는 하나여야 합니다(현재 {len(sinks)}개).")
        for node in self.nodes:
            if node["node_key"] not in reachable:
                self.issue("UNREACHABLE_NODE", f"{node['node_key']}: source에서 이어지지 않은 노드입니다.",
                           node["node_key"])
        return route, succ, in_edges

    def _space_capacity(self, asset: str | None) -> tuple[str, object]:
        """저장공간의 자리 수(작업물 개수). 자산 버전이 없거나 미정이면 unknown이다(무제한으로 가정하지 않는다)."""
        revision = self.snapshot.assets.get(asset) if asset else None
        capacity = None if revision is None else revision.get("storage_capacity")
        if capacity is None or capacity["mode"] == "unknown":
            return "unknown", None
        if capacity["mode"] == "unlimited":
            return "unbounded", None
        if capacity["mode"] == "not_allowed":
            return "not_allowed", None
        if capacity["unit"] != "item":
            return "unsupported", capacity["unit"]
        return "finite", int(capacity["value"])

    def _check_spaces(self, route: list[str], by_key: dict, succ: dict) -> dict[str, int | None]:
        """경로가 지나는 저장공간의 용량과, 용량을 모르는 대기 장소를 확인한다.

        - 자산 버전의 저장 용량이 유한(item)이면 자리 수, 무제한이면 None. 같은 공간은 노드가 달라도 하나의 용량이다.
        - 용량이 미정인 공간은 시나리오가 `unbounded_buffers`로 명시해야 한다.
        - 단계에서 다음 단계로 바로 넘기는 직접 인계는 미정이 아니다: 다음 설비 앞 자리(설비 한 대당 한 번에 처리하는 입력 수,
          최소 1)를 실행이 정한다(사용자 규칙 2026-10-28, runtime `_front_slots`).
        """
        spaces: dict[str, int | None] = {}
        unknown: list[str] = []  # 용량을 모르는 저장공간
        for key in route:
            node = by_key[key]
            if node["kind"] == "source" and node.get("asset_id"):  # 원자재 입고 위치: 용량이 정해졌을 때만 적용한다
                kind, value = self._space_capacity(node["asset_id"])
                if kind == "finite":
                    spaces[node["asset_id"]] = value
                continue
            if node["kind"] != "buffer":
                continue
            asset = node["asset_id"]
            kind, value = self._space_capacity(asset)
            if kind == "finite":
                spaces[asset] = value
            elif kind == "unbounded":
                spaces[asset] = None
            elif kind == "not_allowed":
                self.issue("SPACE_NOT_ALLOWED", f"{key}: 저장공간의 저장 용량이 '허용 안 함'인데 대기 공간으로 쓰였습니다.", key)
            elif kind == "unsupported":
                self.issue("SPACE_CAPACITY_UNIT_UNSUPPORTED",
                           f"{key}: 저장 용량 단위 {value}은(는) 작업물 개수로 환산할 규칙이 없어 아직 실행하지 않습니다(item만 지원).", key)
            else:
                unknown.append(key)
        if unknown:
            if not self.assumptions.unbounded_buffers:
                self.issue("BUFFER_POLICY_UNKNOWN",
                           f"용량을 모르는 저장공간 {len(unknown)}곳이 있습니다. 용량을 모르는 값을 무제한으로 가정하지 않으므로 "
                           "시나리오가 `unbounded_buffers`를 명시해야 합니다.", unknown[0])
            else:  # 저장공간 용량이 미정이라 공간 부족을 평가할 수 없다(병목 요약의 한계)
                self.used.append(AssumptionUse(
                    "UNBOUNDED_BUFFERS", f"용량을 모르는 저장공간 {len(unknown)}곳을 용량 제한 없이 대기하는 것으로 가정"))
        return spaces

    def _out_policies(self, key: str, candidates: tuple[str, ...], following: dict | None) -> dict[str, OutPolicy]:
        """하류 공간이 유한해서 막힐 수 있을 때만 설비별 OUT 배출 정책을 정한다(DEC-006 대응표).

        block_machine_while_waiting: yes → hold(설비 점유 유지), no → release_after_out(OUT에 놓고 해제, OUT 용량 필요),
        unknown → 실행 차단. OUT 용량이 not_allowed이면 직접 인계라 hold다.
        """
        if following is None or following["kind"] != "buffer" or self.spaces.get(following["asset_id"]) is None:
            return {}
        policies: dict[str, OutPolicy] = {}
        unknown: list[str] = []
        for asset in candidates:
            revision = self.snapshot.assets.get(asset)
            port = next((p for p in revision["ports"] if p["role"] == "OUT"), None) if revision else None
            if port is None:
                unknown.append(asset)
                continue
            capacity, rule = port["buffer_capacity"], port["release_rule"]
            if capacity["mode"] == "not_allowed":
                policies[asset] = OutPolicy("hold")
                continue
            block = rule.get("block_machine_while_waiting", "unknown") \
                if rule["mode"] == "when_destination_accepts" else "unknown"
            if block == "yes":
                policies[asset] = OutPolicy("hold")
            elif block == "no" and capacity["mode"] == "unlimited":
                policies[asset] = OutPolicy("release_after_out", None)
            elif block == "no" and capacity["mode"] == "finite" and capacity["unit"] == "item":
                policies[asset] = OutPolicy("release_after_out", int(capacity["value"]))
            else:
                unknown.append(asset)
        if unknown and self.assumptions.out_release == "hold":
            for asset in unknown:  # 시나리오 가정: 다음 공간에 자리가 날 때까지 산출을 쥐고 설비가 기다린다
                policies[asset] = OutPolicy("hold")
            self.used.append(AssumptionUse(
                "OUT_RELEASE_HOLD", f"{key}: OUT 배출 정책이 정해지지 않은 설비 {len(unknown)}대는 다음 공간"
                f"({following['node_key']})이 가득 차면 산출을 쥐고 기다리는 것으로 가정", key))
        elif unknown:
            self.issue("OUT_RELEASE_POLICY_UNKNOWN",
                       f"{key}: 다음 공간({following['node_key']})의 용량이 유한해 막힐 수 있는데 설비 {len(unknown)}대의 OUT 배출 정책"
                       "(block_machine_while_waiting) 또는 OUT 용량이 미정입니다. 승인된 자산 버전에서 정해야 합니다(DEC-006).", key)
        return policies

    # --- 4. 단계 모델 -----------------------------------------------------------------------
    def _build_step(self, node: dict, next_key: str | None = None, by_key: dict | None = None,
                    in_edges: list | None = None) -> StepModel | None:
        key, step = node["node_key"], node["step"]
        name, version = step["operation_type"], step["handler_version"] or "1"
        handler = get_handler(name, version)
        if handler is None:
            if name in rules.SUPPORTED_HANDLERS and version in rules.SUPPORTED_HANDLER_VERSIONS:
                self.issue("ENGINE_HANDLER_NOT_AVAILABLE",
                           f"{key}: handler {name} v{version}은(는) 등록되어 있지만 엔진에는 아직 구현되지 않았습니다.", key)
            return None  # 이름이 없거나 지원 목록 밖이면 도메인 검증(VAL-HANDLER-001·UNSUPPORTED_HANDLER)이 이미 막았다.
        transport_minutes = self._transport_minutes(key, handler, step)
        timing = TimingModel("none") if handler.name == TRANSPORT else self._timing(key, step, handler)
        setup_rule = (Fraction(0), "per_operation") if handler.name == TRANSPORT else self._setup(key, step)
        setup, setup_trigger = (None, "per_operation") if setup_rule is None else setup_rule
        delay = None if handler.name == TRANSPORT else self._delay(key, step)
        output = self._output(key, step, handler)
        inputs, consume_policy = self._inputs(key, step, handler, in_edges or [])
        candidates, allocation, worker_unlimited = self._resources(key, step, handler)
        if setup_trigger == "on_product_change" and setup and not candidates:
            self.issue("SETUP_TRIGGER_UNSUPPORTED",
                       f"{key}: 제품 전환 준비는 설비의 직전 작업 제품을 보므로 설비가 있는 단계에만 쓸 수 있습니다.", key)
        if handler.batch and timing is not None and timing.kind == "speed" and output is not None \
                and output.unit_length_m is None:
            self.issue("TIMING_UNSUPPORTED",
                       f"{key}: 선속으로 시간을 재려면 산출 길이가 필요한데 이 단계의 산출은 길이가 없습니다"
                       "(단위당 시간을 쓰세요).", key)
        self._check_hold_policy(key, handler, output, candidates)
        residual = self._residual(key, step, handler, candidates)
        out_policies = self._out_policies(key, candidates, (by_key or {}).get(next_key) if next_key else None)
        carrier_move = None
        if handler.name == TRANSPORT and candidates:  # 운반 자원이 정해진 운반: 자원의 위치를 따진다
            carrier_move = self.assumptions.carrier_empty_move_minutes
            if carrier_move is None:
                self.issue("CARRIER_EMPTY_MOVE_UNKNOWN",
                           f"{key}: 운반 자원 {len(candidates)}대가 정해졌는데, 다른 곳에 있던 자원이 일을 받은 곳까지 빈 차로 "
                           "옮겨 가는 시간이 없습니다. 시나리오가 `carrier_empty_move_minutes`를 명시해야 합니다.", key)
            else:
                self.used.append(AssumptionUse(
                    "CARRIER_EMPTY_MOVE", f"{key}: 운반 자원은 다음 명령이 없으면 목적지에서 기다리고, 다른 곳에서 일을 받으면 "
                    f"빈 차로 {carrier_move}분 이동", key))
        handoff = step["handoff_rule"]["mode"]
        if handoff not in ("per_output_unit", "total_batch"):
            handoff = "per_output_unit"  # 미정이면 도메인 검증이 이미 막았다(수동 운반은 한 개 산출)
        if timing is None or setup is None or output is None:
            return None
        return StepModel(
            key=key, node_id=node["id"], label=node["label"], handler=handler.name,
            handler_version=handler.version, candidates=candidates, allocation=allocation,
            worker_unlimited=worker_unlimited, setup_minutes=setup, timing=timing, output=output,
            handoff=handoff, residual_mode=step["residual_rule"]["mode"],
            transport_minutes=transport_minutes, residual=residual, out_policies=out_policies,
            inputs=inputs, consume_policy=consume_policy, delay=delay, setup_trigger=setup_trigger,
            carrier_move_minutes=carrier_move)

    def _transport_minutes(self, key: str, handler: HandlerDef, step: dict) -> Fraction | None:
        """수동 운반의 이동 시간(보빈 하나가 한 번 옮겨지는 시간, 상하차 포함은 값에 담는다).

        공정 데이터가 정한 값(처리 방식 `per_output_unit`)이 사실이다. 시나리오 가정(`manual_transport_minutes`)이 있으면
        그 시나리오에서만 그 값으로 덮어쓰고 가정으로 보고한다. 둘 다 없으면 막는다(0분도 명시해야 한다)."""
        if handler.name != TRANSPORT:
            return None
        minutes = self.assumptions.manual_transport_minutes.get(key)
        if minutes is not None:
            if minutes < 0:
                self.issue("TRANSPORT_DURATION_INVALID", f"{key}: 이동 시간은 0 이상이어야 합니다.", key)
                return None
            self.used.append(AssumptionUse(
                "MANUAL_TRANSPORT_MINUTES",
                f"{key}: 수동 운반 {minutes}분(시나리오 가정, 운반 자원은 무제한이 아니라 미모형)", key))
            return Fraction(minutes)
        processing = step["timing_rule"]["processing"]
        if processing["kind"] == "per_output_unit" and processing["duration_min"]["mode"] == "known":
            return to_fraction(processing["duration_min"]["value"])
        self.issue("TRANSPORT_DURATION_UNKNOWN",
                   f"{key}: 수동 운반의 이동 시간이 미정입니다. 공정에 확정하거나(처리 방식 per_output_unit) 시나리오가 "
                   "명시 가정으로 정해야 합니다(0분도 명시해야 함).", key)
        return None

    def _timing(self, key: str, step: dict, handler: HandlerDef) -> TimingModel | None:
        proc = step["timing_rule"]["processing"]
        kind = proc["kind"]
        timing = None
        if kind == "output_speed":
            speed, streams = proc["speed_m_per_min"], proc["parallel_streams"]
            if proc["basis"] != "per_stream" or streams["mode"] != "known" or streams["value"] != 1 \
                    or proc["output_schedule"] != "sequential_units":
                self.issue("TIMING_UNSUPPORTED",
                           f"{key}: 병렬 스트림·합계 기준 산출은 아직 실행하지 않습니다(스트림 1·스트림별·순차만 지원).", key)
                return None
            if speed["mode"] == "known":
                timing = TimingModel("speed", speed_m_per_min=to_fraction(speed["value"]))
        elif kind == "per_output_unit":
            if proc["output_schedule"] != "sequential_units":
                self.issue("TIMING_UNSUPPORTED", f"{key}: 산출 스케줄이 sequential_units가 아니면 아직 실행하지 않습니다.", key)
                return None
            if proc["duration_min"]["mode"] == "known":
                timing = TimingModel("per_unit", unit_minutes=to_fraction(proc["duration_min"]["value"]))
        elif kind == "none":
            timing = TimingModel("none")
        else:
            self.issue("TIMING_UNSUPPORTED", f"{key}: 처리 방식 {kind}은(는) 아직 실행하지 않습니다.", key)
            return None
        if timing is not None and timing.kind not in handler.timing_kinds:
            self.issue("HANDLER_TIMING_MISMATCH",
                       f"{key}: handler {handler.name}은(는) 처리 시간 종류 {timing.kind}을(를) 쓸 수 없습니다.", key)
            return None
        return timing

    def _setup(self, key: str, step: dict) -> tuple[Fraction, str] | None:
        """준비 시간(분)과 발생 시점. 지원: 작업마다(per_operation), 제품이 바뀔 때(on_product_change, 설비의 직전 작업
        제품이 다를 때만), 0분(발생 시점 무관)."""
        setup = step["timing_rule"]["setup"]
        duration = setup["duration_min"]
        if setup["trigger"] == "not_applicable":
            return Fraction(0), "per_operation"
        if duration["mode"] == "known" and to_fraction(duration["value"]) == 0:
            return Fraction(0), "per_operation"
        if setup["trigger"] in ("per_operation", "on_product_change") and duration["mode"] == "known":
            return to_fraction(duration["value"]), setup["trigger"]
        self.issue("SETUP_TRIGGER_UNSUPPORTED",
                   f"{key}: 준비 시점 {setup['trigger']}은(는) 아직 실행하지 않습니다(per_operation과 0분만 지원).", key)
        return None

    def _delay(self, key: str, step: dict) -> DelayModel | None:
        """준비 대기(03 §4.4). 미정(발생 시점·시간·설비 점유)은 도메인 검증(VAL-TIME-005)이 이미 막는다."""
        delay = step["timing_rule"]["precondition_delay"]
        duration, trigger, occupancy = delay["duration_min"], delay["trigger"], delay["occupancy"]
        if trigger == "not_applicable":
            return None
        if trigger == "unknown" or duration["mode"] != "known" or occupancy == "unknown":
            return None
        if trigger != "per_operation":
            self.issue("PRECONDITION_DELAY_UNSUPPORTED",
                       f"{key}: 준비 대기 발생 시점 {trigger}은(는) 아직 실행하지 않습니다(작업마다 per_operation만).", key)
            return None
        return DelayModel(to_fraction(duration["value"]), occupancy)

    def _inputs(self, key: str, step: dict, handler: HandlerDef,
                in_edges: list[tuple[str, dict]]) -> tuple[tuple[InputModel, ...], str]:
        """들어오는 간선마다 작업 한 번에 확보할 작업물 수(07 §5). 간선에 연결된 입력 spec의 단위 수(unit_count)를 쓰고
        가닥 수·길이·중량을 개수로 바꾸지 않는다. 작업물 하나를 처리하는 handler는 입력 하나·1개만 받는다."""
        specs = {m["spec_key"]: m for m in step.get("material_specs", []) if m["direction"] == "input"}
        inputs: list[InputModel] = []
        for origin, edge in in_edges:
            spec_key = edge.get("target_input_spec_key")
            spec = specs.get(spec_key) if spec_key else None
            count = None
            if spec is not None and spec["unit_count"]["mode"] == "known":
                count = int(spec["unit_count"]["value"])
                if count > 1 and spec["quantity_basis"] != "per_operation":
                    self.issue("INPUT_BASIS_UNSUPPORTED",
                               f"{key}: 입력 {spec_key}의 수량 기준이 {spec['quantity_basis']}입니다. 작업 한 번에 여러 개를 "
                               "확보하려면 per_operation이어야 합니다.", key)
            elif len(in_edges) == 1 and not handler.batch:
                count = 1  # 작업물 하나를 처리하는 handler의 정의(spec이 없어도 한 번에 하나)
            if count is None:
                self.issue("INPUT_COUNT_UNKNOWN",
                           f"{key}: {origin}에서 작업 한 번에 가져올 작업물 수(입력 spec의 unit_count)가 미정입니다. "
                           "가닥 수·길이로 개수를 추정하지 않습니다.", key)
                continue
            inputs.append(InputModel(origin, count, spec_key))
        policy = step["input_rule"]["consume_policy"]
        if not handler.batch:
            if len(in_edges) > 1 or any(i.count != 1 for i in inputs):
                self.issue("INPUT_BATCH_UNSUPPORTED",
                           f"{key}: handler {handler.name}은(는) 작업 한 번에 작업물 하나만 처리합니다(합류·여러 개 확보 불가).", key)
            return tuple(inputs), "consume"
        if step["input_rule"]["acquire_scope"] not in ("per_operation", "unknown"):
            self.issue("INPUT_SCOPE_UNSUPPORTED",
                       f"{key}: 투입 확보 범위 {step['input_rule']['acquire_scope']}은(는) 아직 실행하지 않습니다(작업마다만).", key)
        if policy != "unknown" and policy not in handler.consume_policies:
            self.issue("INPUT_POLICY_UNSUPPORTED",
                       f"{key}: handler {handler.name}의 투입 소비 시점은 {sorted(handler.consume_policies)}만 실행합니다"
                       f"(현재 {policy}).", key)
        return tuple(inputs), policy

    def _output(self, key: str, step: dict, handler: HandlerDef) -> OutputModel | None:
        out = step["output_rule"]
        if handler.name == TRANSPORT:
            return OutputModel("pass_through")
        if out["mode"] not in handler.output_modes:
            self.issue("OUTPUT_MODE_MISMATCH",
                       f"{key}: handler {handler.name}에는 output_rule.mode {sorted(handler.output_modes)}이(가) 필요합니다"
                       f"(현재 {out['mode']}).", key)
            return None
        length = out["length_m"]
        if handler.needs_output_length and length["mode"] != "known":
            return None  # VAL-OUT-002가 이미 막았다
        count = out["unit_count"]
        weight = out.get("weight_kg") or {"mode": "unknown"}
        if handler.batch and out["mode"] in ("configured_units", "fixed_mass_units"):
            if out["quantity_basis"] != "per_operation":
                self.issue("OUTPUT_BASIS_UNSUPPORTED",
                           f"{key}: 지정 산출은 작업 한 번의 산출(per_operation)만 실행합니다(현재 {out['quantity_basis']}).", key)
            if handler.abstract_yield_only and out["accounting_mode"] != "abstract_yield":
                self.issue("OUTPUT_ACCOUNTING_UNSUPPORTED",
                           f"{key}: 지정 산출은 투입 길이와 맞추는 물리 규칙이 없어 abstract_yield로만 실행합니다"
                           f"(현재 {out['accounting_mode']}, 03 §5).", key)
            if count["mode"] != "known":
                return None  # VAL-OUT-002가 이미 막았다
        spec = next((m for m in step.get("material_specs", []) if m["direction"] == "output"), None)
        return OutputModel(
            mode=out["mode"],
            unit_length_m=to_fraction(length["value"]) if length["mode"] == "known" else None,
            unit_weight_kg=(to_fraction(weight["value"])
                            if out["mode"] == "fixed_mass_units" and weight["mode"] == "known" else None),
            unit_count=count["value"] if count["mode"] == "known" else None,
            quantity_basis=out["quantity_basis"], accounting_mode=out["accounting_mode"],
            state_code=None if spec is None else spec["state_code"], form=None if spec is None else spec["form"])

    def _resources(self, key: str, step: dict, handler: HandlerDef) -> tuple[tuple[str, ...], str, bool]:
        equipment = [r for r in step["resources"] if r["resource_kind"] == "equipment"]
        workers = [r for r in step["resources"] if r["resource_kind"] == "worker"]
        for worker in workers:
            if worker["capacity_mode"] != "unlimited":
                self.issue("WORKER_CAPACITY_UNSUPPORTED", f"{key}: 유한 작업자 자원은 아직 실행하지 않습니다.", key)
        if len(equipment) > 1:
            self.issue("RESOURCE_ROLES_UNSUPPORTED", f"{key}: 설비 자원 요구가 둘 이상인 단계는 아직 실행하지 않습니다.", key)
            return (), "none", False
        if not equipment:
            return (), "none", any(w["capacity_mode"] == "unlimited" for w in workers)
        req = equipment[0]
        if req["selection_mode"] != "one_of" or req["required_count"] != 1:
            self.issue("RESOURCE_REQUIREMENT_UNSUPPORTED",
                       f"{key}: 설비를 동시에 여러 대 확보하는 단계는 allocator가 필요해 아직 실행하지 않습니다.", key)
            return (), "none", False
        candidates = tuple(c["asset_id"] for c in req["candidates"])
        allocation = "single"
        if len(candidates) > 1:
            allocation = req["allocation_rule"]["mode"]
            if allocation not in ("fifo", "first_available"):
                self.issue("ALLOCATION_RULE_UNKNOWN",
                           f"{key}: 후보 설비 {len(candidates)}대 중 선택 규칙({allocation})이 없습니다. fifo·first_available를 "
                           "명시해야 합니다(자동 선택하지 않음).", key)
        return candidates, allocation, any(w["capacity_mode"] == "unlimited" for w in workers)

    def _residual(self, key: str, step: dict, handler: HandlerDef,
                  candidates: tuple[str, ...]) -> ResidualModel:
        """잔량 이월(03 §6). 이월은 잔량을 모아 둘 범위와 '물리 접속이 아닌 길이 풀'이라는 표시가 있어야 한다.
        제품 전환·실행 종료 때의 처리 정책은 그 상황이 실제로 생길 때 runtime이 확인한다(미리 막지 않는다)."""
        rule = step["residual_rule"]
        model = ResidualModel(rule["mode"], rule["on_product_change"], rule["on_run_end"],
                              None if rule["scope"] == "unknown" else rule["scope"],
                              rule["physical_join_mode"])
        if rule["mode"] == "discard" and handler.name != "split_length":
            self.issue("RESIDUAL_MODE_UNSUPPORTED",
                       f"{key}: 잔량 폐기(discard)는 분할(split_length) 단계에서만 쓸 수 있습니다(다른 단계는 잔량이 생기지 않음).", key)
            return model
        if rule["mode"] != "carry_same_product" or handler.name != "split_length":
            return model
        scope = model.scope
        if scope is None:
            scope = self.assumptions.residual_scope.get(key)
            if scope is None:
                self.issue("RESIDUAL_SCOPE_UNKNOWN",
                           f"{key}: 잔량을 이월하지만 잔량을 모아 둘 범위(scope)가 미정입니다. 시나리오가 `residual_scope`로 "
                           "machine·product·operation·lot 중 하나를 명시해야 합니다.", key)
                return model
            self.used.append(AssumptionUse("RESIDUAL_SCOPE", f"{key}: 잔량 범위 {scope}(시나리오 가정)", key))
        if scope not in RESIDUAL_SCOPES:
            self.issue("RESIDUAL_SCOPE_INVALID", f"{key}: 잔량 범위 {scope}은(는) 알 수 없는 값입니다.", key)
            return model
        if scope == "machine" and not candidates:
            self.issue("RESIDUAL_SCOPE_INVALID", f"{key}: 설비가 없는 단계는 설비별 잔량 범위를 쓸 수 없습니다.", key)
            return model
        if model.physical_join_mode != "abstract_length_pool":
            self.issue("RESIDUAL_JOIN_MODE_UNKNOWN",
                       f"{key}: 잔량을 다음 투입에 잇는 방식이 미정입니다. 실제 접속 방식이 확인되지 않았다면 "
                       "abstract_length_pool(길이 풀)로 표시해야 합니다(03 §6).", key)
            return model
        return ResidualModel(model.mode, model.on_product_change, model.on_run_end, scope,
                             model.physical_join_mode)

    def _check_hold_policy(self, key: str, handler: HandlerDef, output: OutputModel | None,
                           candidates: tuple[str, ...]) -> None:
        if not (handler.multiple_outputs and candidates and output is not None):
            return
        if output.unit_count is not None and output.unit_count <= 1:
            return  # 산출이 하나면 점유 정책이 결과를 바꾸지 않는다
        policy = self.assumptions.equipment_hold
        if policy is None:
            self.issue("EQUIPMENT_HOLD_POLICY_REQUIRED",
                       f"{key}: 한 작업이 여러 산출을 내는데 설비 점유 정책이 미정입니다. 시나리오가 "
                       f"`equipment_hold`({HOLD_FOR_OPERATION})를 명시해야 합니다(\"보빈별 인계\"는 설비 재배정 정책이 아님).", key)
        elif policy not in SUPPORTED_EQUIPMENT_HOLD:
            self.issue("EQUIPMENT_HOLD_UNSUPPORTED", f"{key}: 설비 점유 정책 {policy}은(는) 아직 실행하지 않습니다.", key)
        else:
            self.used.append(AssumptionUse(
                "EQUIPMENT_HOLD_FOR_OPERATION", f"{key}: 모든 산출이 끝날 때까지 설비를 점유(시나리오 가정)", key))
