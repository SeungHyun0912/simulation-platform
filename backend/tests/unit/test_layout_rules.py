"""CR be18: 배치판 규칙(반올림·경로 길이·저장 오류·검증)을 DB 없이 확인한다."""

from decimal import Decimal as D

from simulation_platform.domain import layout as rules


def test_values_keep_one_decimal_and_round_half_up():
    assert [str(rules.round_m(v)) for v in ("12.34", "12.35", "0.05", "7")] == ["12.3", "12.4", "0.1", "7.0"]
    assert rules.fmt(D("3.0")) == "3.0" and rules.fmt(None) is None


def test_route_length_sums_straight_segments_and_rounds_once():
    assert rules.length([(D(0), D(0)), (D(3), D(4))]) == D("5.0")
    assert rules.length([(D(0), D(0)), (D(1), D(1)), (D(2), D(2))]) == D("2.8")  # √2 + √2 = 2.828…
    assert rules.length([(D(0), D(0))]) == D("0.0")


def point(key, x="1", y="1"):
    return {"point_key": key, "x_m": D(x), "y_m": D(y), "attributes": {}}


def test_saving_rejects_broken_references_and_routes():
    issues = rules.save_errors(
        points=[point("P1"), point("P1"), point("P2")],
        placements=[{"asset_id": "a", "x_m": D(1), "y_m": D(1), "width_m": D("0.0"), "height_m": None},
                    {"asset_id": "zz", "x_m": D(1), "y_m": D(1)}],
        port_points=[{"port_id": "p", "point_key": "P9"}],
        routes=[{"route_key": "R1", "from_port_id": "p", "to_port_id": "q", "points": ["P1"]},
                {"route_key": "R2", "from_port_id": "p", "to_port_id": "p", "points": ["P1", "P1", "P8"]}],
        known_assets={"a"}, known_ports={"p"})
    rules_hit = {(i.rule_id, i.field_path) for i in issues}
    assert ("LAY-SAVE-001", "/points/0/point_key") in rules_hit
    assert ("LAY-SAVE-004", "/placements/1/asset_id") in rules_hit
    assert ("LAY-SAVE-010", "/placements/0/width_m") in rules_hit
    assert ("LAY-SAVE-003", "/port_points/0/point_key") in rules_hit
    assert ("LAY-SAVE-005", "/routes/0/to_port_id") in rules_hit
    assert ("LAY-SAVE-008", "/routes/0/points") in rules_hit
    assert ("LAY-SAVE-009", "/routes/1/points/1") in rules_hit and ("LAY-SAVE-003", "/routes/1/points/2") in rules_hit


def test_validation_checks_route_ends_against_the_mapped_port_points():
    def run(points, port_points, placements=()):
        return rules.validate(canvas=(D(10), D(10)), points={"P1": (D(1), D(1)), "P2": (D(2), D(2)), "P3": (D(11), D(2))},
                              placements=list(placements), port_points=port_points,
                              port_assets={"out": "A", "in": "B"},
                              routes=[{"route_key": "R1", "from_port_id": "out", "to_port_id": "in", "points": points}])

    good = run(["P1", "P2"], {"out": "P1", "in": "P2"},
               [{"asset_id": "A", "x_m": D(1), "y_m": D(1), "width_m": D(1), "height_m": D(1)},
                {"asset_id": "B", "x_m": D(2), "y_m": D(2), "width_m": D(1), "height_m": D(1)}])
    assert [i for i in good if i.severity == "error"] == []
    assert {i.rule_id for i in good} == {"LAY-005"}  # P3이 도면(10m) 밖: 경고만
    wrong = {i.rule_id for i in run(["P2", "P1"], {"out": "P1", "in": "P2"}) if i.severity == "error"}
    assert wrong == {"LAY-001", "LAY-002"}
    unmapped = run(["P1", "P2"], {"out": "P1"})
    assert {i.rule_id for i in unmapped if i.severity == "error"} == {"LAY-003"}
    assert {i.rule_id for i in unmapped if i.severity == "warning"} >= {"LAY-004"}  # 배치하지 않은 자산의 포트
    # field_path는 순번이 아니라 key 기준(응답 정렬과 무관): 경로 key, 포트 id, 자산 id, 점 key
    assert {i.field_path for i in unmapped} >= {"/routes/R1", "/port_points/out"}
    assert {i.field_path for i in good} == {"/points/P3"}


# --- CR be19: 통로·길 그물 ---------------------------------------------------------------------------
XY = {"P10": (D(0), D(0)), "P11": (D(10), D(0)), "P12": (D(20), D(0)),
      "P21": (D(10), D(-10)), "P22": (D(10), D(10)), "A": (D(0), D(5)), "B": (D(20), D(5))}


def test_a_cross_shares_its_center_point_and_paths_turn_there():
    lines = [["P10", "P11", "P12"], ["P21", "P11", "P22"]]  # 방법 1: 가로·세로 통로가 가운데 P11을 공유
    assert rules.shortest_path(XY, lines, "P10", "P22") == (["P10", "P11", "P22"], D("20.0"))
    assert rules.unjoined_crossings(XY, lines) == []
    apart = [["P10", "P12"], ["P21", "P22"]]  # 겹쳐 보이지만 공유 점이 없으면 이어지지 않는다
    assert rules.shortest_path(XY, apart, "P10", "P22") is None
    assert rules.unjoined_crossings(XY, apart) == [(("P10", "P12"), ("P21", "P22"))]


def test_the_shortest_of_several_ways_is_chosen_and_both_directions_work():
    lines = [["A", "P10", "P11", "P12", "B"], ["A", "B"]]  # 돌아가는 길(5+20+5=30)과 곧은 길(20)
    assert rules.shortest_path(XY, lines, "A", "B") == (["A", "B"], D("20.0"))
    assert rules.shortest_path(XY, lines, "B", "A") == (["B", "A"], D("20.0"))  # 양방향
    assert rules.shortest_path(XY, lines, "A", "A") == (["A"], D("0.0"))
    assert rules.shortest_path(XY, lines, "A", "nowhere") is None


def test_aisles_are_checked_like_routes_when_saving():
    issues = rules.save_errors(points=[point("P1"), point("P2")], placements=[], port_points=[], routes=[],
                               known_assets=set(), known_ports=set(),
                               aisles=[{"aisle_key": "W1", "points": ["P1"]},
                                       {"aisle_key": "W1", "points": ["P1", "P1", "P9"]}])
    assert {(i.rule_id, i.field_path) for i in issues} == {
        ("LAY-SAVE-008", "/aisles/0/points"), ("LAY-SAVE-011", "/aisles/0/aisle_key"),
        ("LAY-SAVE-011", "/aisles/1/aisle_key"), ("LAY-SAVE-009", "/aisles/1/points/1"),
        ("LAY-SAVE-003", "/aisles/1/points/2")}


def test_validation_warns_about_ports_off_the_network():
    issues = rules.validate(canvas=(None, None), points={"P1": (D(0), D(0)), "P2": (D(1), D(0)), "P3": (D(5), D(5))},
                            placements=[], port_points={"out": "P1", "in": "P3"}, port_assets={}, routes=[],
                            aisles=[{"aisle_key": "W1", "points": ["P1", "P2"]}])
    assert [(i.rule_id, i.field_path) for i in issues if i.rule_id == "LAY-009"] == [("LAY-009", "/port_points/in")]
