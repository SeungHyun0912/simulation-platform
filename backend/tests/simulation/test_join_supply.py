"""C0-07: 저장공간 분기·단계 합류·공급 간선과 configured_yield·supply_delay(03 §4.4·§5·§12, 07 §5).

시험 전용 입력(제품4 AL 싱글 구조를 본뜬 수치, 실제 공정 값 아님): 공간 하나에서 선행 단계(1개)와 공급 준비(12개)가
가져가고, 메인이 둘을 모아 지정 산출 10개를 만든다. 작업 한 번의 확보 수는 입력 spec의 unit_count에서만 온다.
"""

import itertools
from fractions import Fraction

from fixtures import (
    EQUIPMENT_1,
    EQUIPMENT_2,
    EQUIPMENT_3,
    STORAGE_A,
    STORAGE_B,
    UNKNOWN,
    Graph,
    known,
    out_pass,
    speed,
    step,
    uid,
)

from simulation_platform.simulation.compiler import ScenarioAssumptions, compile_snapshot
from simulation_platform.simulation.compiler.model import InputModel
from simulation_platform.simulation.monitoring import events as ev
from simulation_platform.simulation.runtime import Arrival, run_model

F = Fraction
OK = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True)
NO_PROCESSING = {"kind": "none"}


def mspec(key, direction, *, state, form="보빈", units=None, strands=None, length="4000", basis="per_operation"):
    return {"spec_key": key, "direction": direction, "state_code": state, "form": form,
            "material_definition_id": None, "length_m": known(length) if length else UNKNOWN,
            "weight_kg": UNKNOWN, "unit_count": known(units) if units else UNKNOWN,
            "strand_count": known(strands) if strands else UNKNOWN, "quantity_basis": basis}


def configured(units=10, length="4000", accounting="abstract_yield", basis="per_operation"):
    return {"mode": "configured_units", "unit_form": "보빈", "length_m": known(length), "weight_kg": UNKNOWN,
            "unit_count": known(units), "quantity_basis": basis, "schedule": "sequential_units",
            "accounting_mode": accounting}


def supply_wait(minutes="120", occupancy="occupies_machine", trigger="per_operation"):
    return {"duration_min": known(minutes), "trigger": trigger, "occupancy": occupancy}


class Line:
    """공간 → (선행, 공급 준비) → 메인 → 공간 → 완제품 → sink."""

    def __init__(self, *, feed_units=12, feed_strands=12, occupancy="occupies_machine", main_consume="consume",
                 feed_consume="transfer", accounting="abstract_yield"):
        self.g = Graph()
        g = self.g
        self.src = g.node("src", "source")
        self.bay = g.node("bay", "buffer", asset_id=STORAGE_A)
        self.pre = g.node("pre", "operation", step(
            "pass_through_length", processing=speed("40"), output=out_pass(), assets=(EQUIPMENT_1,),
            specs=[mspec("out", "output", state="선행 후")]))
        feed = step("supply_delay", processing=NO_PROCESSING, output=out_pass(), assets=(EQUIPMENT_2,),
                    delay=supply_wait(occupancy=occupancy), handoff="total_batch",
                    specs=[mspec("in", "input", state="준비 전", units=12),
                           mspec("out", "output", state="공급 준비", form="가닥", strands=12, length=None)])
        feed["input_rule"]["consume_policy"] = feed_consume
        self.feed = g.node("feed", "operation", feed)
        main = step("configured_yield", processing=speed("32"), output=configured(accounting=accounting),
                    assets=(EQUIPMENT_3,),
                    specs=[mspec("pre", "input", state="선행 후", units=1),
                           mspec("feed", "input", state="공급 준비", form="가닥", units=feed_units,
                                 strands=feed_strands, length=None),
                           mspec("out", "output", state="메인 후")])
        main["input_rule"]["consume_policy"] = main_consume
        self.main = g.node("main", "operation", main)
        self.done = g.node("done", "buffer", asset_id=STORAGE_B)
        g.node("complete", "milestone")
        g.node("sink", "sink")
        self.link(self.src, self.bay)
        self.link(self.bay, self.pre)
        self.link(self.bay, self.feed, target="in")
        self.link(self.pre, self.main, target="pre", source="out")
        self.link(self.feed, self.main, kind="supply", target="feed", source="out")
        nodes = g.nodes
        for a, b in itertools.pairwise(nodes[4:]):  # main → done → complete → sink
            self.link(a, b)

    def link(self, a, b, kind="material", target=None, source=None):
        self.g.edges.append({
            "id": uid(), "edge_key": f"{a['node_key']}-{b['node_key']}", "from_node_id": a["id"],
            "to_node_id": b["id"], "edge_kind": kind, "movement_rule": {"mode": "unknown"},
            "source_output_spec_key": source, "target_input_spec_key": target})

    def snapshot(self):
        return self.g.snapshot()


def rules(snapshot, assumptions=OK):
    return {i.rule_id for i in compile_snapshot(snapshot, assumptions).issues}


def model_of(snapshot, assumptions=OK):
    return compile_snapshot(snapshot, assumptions).require_model()


def times(result, event_type, **match):
    return [e.sim_time for e in result.of_type(event_type)
            if all(getattr(e, k) == v for k, v in match.items())]


# --- 컴파일 ---------------------------------------------------------------------------------------

def test_branch_from_a_space_and_join_into_a_step_compile_with_input_counts_from_specs():
    model = model_of(Line().snapshot())
    assert model.route == ("src", "bay", "pre", "feed", "main", "done", "complete", "sink")
    assert model.nodes["bay"].next_keys == ("pre", "feed") and model.nodes["bay"].next_key is None
    assert model.steps["pre"].inputs == (InputModel("bay", 1, None),)
    assert model.steps["feed"].inputs == (InputModel("bay", 12, "in"),)
    assert model.steps["main"].inputs == (InputModel("pre", 1, "pre"), InputModel("feed", 12, "feed"))
    assert model.steps["feed"].delay.minutes == 120 and model.steps["feed"].consume_policy == "transfer"


def test_strand_count_is_never_turned_into_an_item_count():
    """공급 입력이 가닥 수(12)만 있고 단위 수가 미정이면 막는다(가닥·보빈을 섞지 않음)."""
    assert rules(Line(feed_units=None).snapshot()) == {"INPUT_COUNT_UNKNOWN"}


def test_configured_yield_runs_only_as_an_abstract_per_operation_yield():
    assert rules(Line(accounting="physical").snapshot()) == {"OUTPUT_ACCOUNTING_UNSUPPORTED"}


def test_supply_hands_over_the_same_items_so_it_cannot_consume_them():
    assert rules(Line(feed_consume="consume").snapshot()) == {"INPUT_POLICY_UNSUPPORTED"}


def test_single_item_handlers_take_one_item_from_one_input():
    line = Line()
    line.pre["step"]["material_specs"].append(mspec("in", "input", state="준비 전", units=2))
    line.g.edges[1]["target_input_spec_key"] = "in"  # bay → pre
    assert rules(line.snapshot()) == {"INPUT_BATCH_UNSUPPORTED"}


def test_other_branches_joins_precedence_and_cycles_stay_blocked():
    branch = Line()
    branch.link(branch.pre, branch.done)  # 단계에서 갈라짐
    assert {"BRANCH_UNSUPPORTED", "JOIN_UNSUPPORTED"} <= rules(branch.snapshot())  # done으로 두 입력이 모임
    precedence = Line()
    precedence.g.edges[3]["edge_kind"] = "precedence"  # pre → main
    assert "NONLINEAR_EDGE_UNSUPPORTED" in rules(precedence.snapshot())
    cycle = Line()
    cycle.link(cycle.done, cycle.bay)
    assert "ROUTE_CYCLE" in rules(cycle.snapshot())


# --- 실행 ------------------------------------------------------------------------------------------

def test_main_starts_when_both_inputs_are_ready_and_yields_the_configured_units():
    result = run_model(model_of(Line().snapshot()), [Arrival("4000", count=13)])
    assert result.state == "completed"
    # 선행 4000/40=100분, 공급 준비 120분(설비 점유) → 메인은 120분에 13개를 한꺼번에 확보하고 시작
    assert times(result, ev.PROCESS_STARTED, step_key="main") == [120]
    assert len(times(result, ev.INPUT_RESERVED, step_key="main")) == 13
    assert times(result, ev.OUTPUT_UNIT_READY, step_key="main") == [120 + 125 * k for k in range(1, 11)]
    assert len(result.of_type(ev.SINK_REACHED)) == 10
    assert times(result, ev.PRECONDITION_DELAY_STARTED, asset_key=EQUIPMENT_2) == [0]
    assert times(result, ev.PRECONDITION_DELAY_FINISHED, step_key="feed") == [120]


def test_supply_does_not_duplicate_items_and_yield_is_not_a_conservation_claim():
    result = run_model(model_of(Line().snapshot()), [Arrival("4000", count=13)])
    assert len(result.items) == 13 + 10  # 공급 준비는 새 작업물을 만들지 않는다
    supplied = [r for r in result.lineage if r.relation == "supply"]
    assert len(supplied) == 12 and all(r.child_keys == (r.parent_key,) and r.balanced for r in supplied)
    by_key = {i.key: i for i in result.items}
    assert {by_key[r.parent_key].form for r in supplied} == {"가닥"}
    (yielded,) = [r for r in result.lineage if r.relation == "yield"]
    assert len(yielded.parent_keys) == 13 and len(yielded.child_keys) == 10
    assert yielded.accounting_mode == "abstract_yield" and yielded.balanced is None
    assert all(by_key[k].status == "consumed" for k in yielded.parent_keys)


def test_a_wait_that_releases_the_machine_does_not_hold_it():
    result = run_model(model_of(Line(occupancy="releases_machine").snapshot()), [Arrival("4000", count=13)])
    assert times(result, ev.PRECONDITION_DELAY_STARTED, step_key="feed") == [0]
    reserved = [e.sim_time for e in result.of_type(ev.ASSET_STATE_CHANGED)
                if e.asset_key == EQUIPMENT_2 and e.quantities["state"] == ev.RESERVED]
    assert reserved == [120]  # 기다린 뒤에야 설비를 쥔다


def test_transfer_consumes_the_inputs_when_the_main_operation_ends():
    consume = run_model(model_of(Line().snapshot()), [Arrival("4000", count=13)])
    assert set(times(consume, ev.INPUT_CONSUMED, step_key="main")) == {120}
    transfer = run_model(model_of(Line(main_consume="transfer").snapshot()), [Arrival("4000", count=13)])
    assert set(times(transfer, ev.INPUT_CONSUMED, step_key="main")) == {1370}


def test_steps_sharing_a_space_take_their_batches_in_request_order():
    result = run_model(model_of(Line().snapshot()), [Arrival("4000", count=26)])
    assert result.state == "completed"
    yields = [r for r in result.lineage if r.relation == "yield"]
    assert [sorted(r.parent_keys) for r in yields] == [
        [f"item-{n:04d}" for n in range(1, 14)], [f"item-{n:04d}" for n in range(14, 27)]]
    assert times(result, ev.PROCESS_STARTED, step_key="main") == [120, 1370]  # 메인 설비가 비는 대로
    assert len(result.of_type(ev.SINK_REACHED)) == 20


def test_an_incomplete_batch_waits_and_is_reported_as_stalled():
    result = run_model(model_of(Line().snapshot()), [Arrival("4000", count=12)])  # 공급 준비에 1개 부족
    assert (result.state, result.reason) == ("stalled", "INSUFFICIENT_INPUT")  # 진짜 교착(WIP_REMAINING)과 구분한다
    assert {(f["step"], f["needed"]) for f in result.shortfalls} >= {("feed", 12)}
    assert not times(result, ev.PROCESS_STARTED, step_key="feed")  # 일부만 가져가 시작하지 않는다
    assert all(i.status == "active" for i in result.items)  # 12개는 공간에서 계속 기다린다
