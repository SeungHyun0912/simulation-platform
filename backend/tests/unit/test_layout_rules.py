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
