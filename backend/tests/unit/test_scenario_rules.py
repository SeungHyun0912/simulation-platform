"""BE-05a: 시나리오 사전검증의 순수 규칙(DB 없이). 엔진 결과는 번역하지 않고 담는다."""

from fractions import Fraction

from simulation_platform.domain import scenario as rules


def graph(asset_id="ST-1", candidate="EQ-1"):
    return {"nodes": [
        {"id": "n1", "node_key": "src", "kind": "source", "label": "s", "asset_id": None, "step": None},
        {"id": "n2", "node_key": "wait", "kind": "buffer", "label": "w", "asset_id": asset_id, "step": None},
        {"id": "n3", "node_key": "work", "kind": "operation", "label": "o", "asset_id": None,
         "step": {"resources": [{"candidates": [{"asset_id": candidate}]}]}},
    ], "edges": [], "completion_node_id": None}


def test_referenced_assets_are_spaces_and_equipment_candidates():
    assert rules.referenced_assets(graph()) == {"ST-1", "EQ-1"}


def test_assumptions_become_exact_engine_assumptions():
    made = rules.engine_assumptions({"equipment_hold": "hold_for_operation", "unbounded_buffers": True,
                                     "manual_transport_minutes": {"forklift": "2.5"},
                                     "residual_scope": {"sheath": "machine"}})
    assert made.manual_transport_minutes == {"forklift": Fraction(5, 2)}
    assert (made.equipment_hold, made.unbounded_buffers, dict(made.residual_scope)) == (
        "hold_for_operation", True, {"sheath": "machine"})
    assert not rules.assumptions_used({"unbounded_buffers": False, "manual_transport_minutes": {}})


def test_an_empty_scenario_is_not_runnable_and_counts_errors():
    result = rules.precheck([], {}, None)
    assert not result.runnable and result.error_count == 1
    assert [i.rule_id for i in result.issues] == ["SCN-PROD-001"]


def test_arrival_unit_must_match_the_raw_material_unit_of_the_process():
    def item(length_mode, arrivals):
        return rules.ProductInput("p", {"id": "v", "raw_unit_spec": {"length_m": {"mode": length_mode}}},
                                  graph(), arrivals, {})

    assert rules._arrival_unit_warnings(0, item("known", [{"length_m": "2000"}])) == []
    missing = rules._arrival_unit_warnings(0, item("known", [{"weight_kg": "2000"}]))
    assert [(w.rule_id, w.severity, w.field_path) for w in missing] == [("SCN-ARR-002", "warning", "/products/0/arrivals/0")]
    extra = rules._arrival_unit_warnings(0, item("not_applicable", [{"length_m": "5"}]))
    assert [w.rule_id for w in extra] == ["SCN-ARR-002"]
    assert rules._arrival_unit_warnings(0, item("not_applicable", [{"weight_kg": "3300"}])) == []
    assert rules._arrival_unit_warnings(0, item("unknown", [{"weight_kg": "1"}])) == []  # 미정이면 판단하지 않는다
