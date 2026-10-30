"""CR be20(BE-24): 배치판 경로 ÷ 속도로 운반·빈 차·사람 이동 시간을 계산한다(DB 불필요).

배치판이 없는 실행은 그대로이고(다른 엔진 시험), 배치판이 있으면 운반 1건 = 상하차 + 경로 ÷ 운반 자원 종류의 속도,
빈 차 이동 = 지금 공간 → 일을 받는 공간 경로 ÷ 속도, 간선 이동 조건이 network_route인 사람 이동 = 경로 ÷ 사람 속도다.
"""

from dataclasses import replace
from fractions import Fraction as F

from fixtures import (
    EQUIPMENT_1,
    EQUIPMENT_2,
    STORAGE_A,
    STORAGE_B,
    Graph,
    out_pass,
    speed,
    step,
    uid,
)
from test_carriers import CARRIER_1, assumed, route, sink_times
from test_spaces import model_of

from simulation_platform.simulation.compiler import compile_snapshot
from simulation_platform.simulation.runtime import Arrival, Lane, run_model, run_models
from simulation_platform.simulation.travel import TravelModel, carrier_gaps

KIND = "forklift"


def travel(points, lines, ports, port_points, rule=None, kinds=None):
    return TravelModel({"layout_version_id": "L1", "points": {k: [str(x), str(y)] for k, (x, y) in points.items()},
                        "lines": lines, "fixed": [], "port_points": port_points, "ports": ports,
                        "kinds": {CARRIER_1: KIND} if kinds is None else kinds, "rule": rule or {}})


def two_spaces(rule=None, connected=True):
    """공간 A(P1) ↔ 공간 B(P2), 100m."""
    return travel({"P1": (0, 0), "P2": (100, 0)}, [["P1", "P2"]] if connected else [],
                  {STORAGE_A: {"ACCESS": ["pa"]}, STORAGE_B: {"ACCESS": ["pb"]}}, {"pa": "P1", "pb": "P2"}, rule)


def with_travel(model_travel, move=None):
    return replace(assumed(move), travel=model_travel)


def test_a_carrier_trip_takes_handling_plus_path_over_speed_and_drives_back_empty():
    t = two_spaces()
    model = model_of(route((CARRIER_1,)), with_travel(t))
    result = run_model(model, [Arrival("500", count=3)], travel=t)
    # 기본값 4 km/h = 200/3 m/분 → 100m는 1.5분, 상하차 1분 → 운반 2.5분. 2·3회는 B에서 A로 빈 차 1.5분 뒤 운반
    assert sink_times(result) == [F(5, 2), F(13, 2), F(21, 2)]
    moves = result.of_type("CARRIER_MOVED")
    assert [(e.sim_time, e.quantities["minutes"]) for e in moves] == [(F(5, 2), F(3, 2)), (F(13, 2), F(3, 2))]
    codes = {a.code for a in model.assumptions}
    assert {"LAYOUT_TRAVEL", "TRAVEL_SPEED_DEFAULT", "TRAVEL_HANDLING_DEFAULT"} <= codes
    assert "CARRIER_EMPTY_MOVE" not in codes  # 빈 차 시간은 시나리오 가정(3분)이 아니라 경로로 정해진다


def test_scenario_speeds_and_handling_override_the_defaults():
    t = two_spaces({"speeds_kmh": {KIND: "6"}, "carrier_handling_minutes": "0.5"})  # 6 km/h = 100 m/분
    result = run_model(model_of(route((CARRIER_1,)), with_travel(t)), [Arrival("500", count=2)], travel=t)
    assert sink_times(result) == [F(3, 2), 4]  # 0.5 + 1 = 1.5분, 빈 차 1분 뒤 1.5분


def test_a_missing_path_blocks_the_run_before_it_starts():
    issues = {i.rule_id for i in compile_snapshot(route((CARRIER_1,)), with_travel(two_spaces(connected=False))).issues}
    assert "LAYOUT_PATH_UNREACHABLE" in issues


def test_empty_moves_between_products_are_checked_across_all_routes_of_a_carrier():
    other_a, other_b = uid(), uid()
    t = travel({"P1": (0, 0), "P2": (100, 0), "P3": (0, 50), "P4": (100, 50)}, [["P1", "P2"], ["P3", "P4"]],
               {STORAGE_A: {"ACCESS": ["pa"]}, STORAGE_B: {"ACCESS": ["pb"]}, other_a: {"ACCESS": ["pc"]},
                other_b: {"ACCESS": ["pd"]}}, {"pa": "P1", "pb": "P2", "pc": "P3", "pd": "P4"})
    a = model_of(route((CARRIER_1,), "wait_a", "wait_b", STORAGE_A, STORAGE_B), with_travel(t))
    b = model_of(route((CARRIER_1,), "wait_c", "wait_d", other_a, other_b), with_travel(t))
    gaps = carrier_gaps([a, b], t)  # 두 경로는 서로 이어지지 않아 B → C, D → A 빈 차 이동이 불가능
    assert len(gaps) == 2 and all(CARRIER_1 in g for g in gaps)
    t.lines.append(["P2", "P3"])
    t._lengths.clear()
    assert carrier_gaps([a, b], t) == []
    result = run_models([Lane(a, (Arrival("500"),)), Lane(b, (Arrival("500"),))], travel=t)
    # a: 0~2.5분. b: B(P2) → C(P3) 빈 차 √(100²+50²)=111.8m ÷ 66.67 = 1.677분, 그 뒤 운반 2.5분
    [move] = result.of_type("CARRIER_MOVED")
    assert move.quantities["minutes"] == F("111.8") * 60 / 4000


def person_line(mode="network_route"):
    """원자재 → 공간 A → 가공(설비 1·2 택1) → 공간 B → 완제품. 공간 ↔ 설비 이동이 사람 이동(network_route)."""
    g = Graph()
    g.node("src", "source")
    g.node("wait_a", "buffer", asset_id=STORAGE_A)
    g.node("work", "operation", step("pass_through_length", processing=speed("1000"), output=out_pass(),
                                     assets=(EQUIPMENT_1, EQUIPMENT_2), allocation="first_available"))
    g.node("wait_b", "buffer", asset_id=STORAGE_B)
    g.node("complete", "milestone")
    g.node("sink", "sink")
    g.chain()
    for edge in g.edges:
        if edge["edge_key"] in ("wait_a-work", "work-wait_b"):
            edge["movement_rule"] = {"mode": mode}
    return g.snapshot()


def person_travel():
    # A(P1) → 설비1 IN(P2) 100m, 설비2 IN(P4) 200m. 설비1 OUT(P3) → B(P6) 100m, 설비2 OUT(P5) → P3 → B 200m. 사람 6 km/h
    return travel({"P1": (0, 0), "P2": (100, 0), "P4": (200, 0), "P3": (100, 10), "P5": (200, 10), "P6": (100, 110)},
                  [["P1", "P2", "P4"], ["P5", "P3", "P6"]],
                  {STORAGE_A: {"ACCESS": ["pa"]}, STORAGE_B: {"ACCESS": ["pb"]},
                   EQUIPMENT_1: {"IN": ["e1i"], "OUT": ["e1o"]}, EQUIPMENT_2: {"IN": ["e2i"], "OUT": ["e2o"]}},
                  {"pa": "P1", "e1i": "P2", "e2i": "P4", "e1o": "P3", "e2o": "P5", "pb": "P6"},
                  {"speeds_kmh": {"person": "6"}}, kinds={})


def test_people_carry_items_to_the_chosen_machine_and_on_to_the_next_space_along_the_layout():
    t = person_travel()
    model = model_of(person_line(), with_travel(t, move="3"))
    assert model.steps["work"].walk_in == {"wait_a": {EQUIPMENT_1: 1, EQUIPMENT_2: 2}}
    assert model.steps["work"].walk_out == {EQUIPMENT_1: 1, EQUIPMENT_2: 2}
    result = run_model(model, [Arrival("2000", count=2)], travel=t)
    # 첫째는 설비1: 걸어옴 1 + 처리 2 + 걸어감 1 = 4. 둘째는 설비2: 2 + 2 + 2 = 6
    assert sink_times(result) == [4, 6]
    walks = [(e.sim_time, e.asset_key, e.source, e.destination, e.quantities["minutes"])
             for e in result.of_type("PERSON_MOVED")]
    assert walks == [(0, EQUIPMENT_1, "wait_a", "work", 1), (0, EQUIPMENT_2, "wait_a", "work", 2),
                     (3, EQUIPMENT_1, "work", "wait_b", 1), (4, EQUIPMENT_2, "work", "wait_b", 2)]


def test_moves_not_marked_network_route_stay_instant_even_with_a_layout():
    t = person_travel()
    model = model_of(person_line("unknown"), with_travel(t, move="3"))
    assert model.steps["work"].walk_in == {} and model.steps["work"].walk_out == {}
    assert sink_times(run_model(model, [Arrival("2000", count=2)], travel=t)) == [2, 2]
