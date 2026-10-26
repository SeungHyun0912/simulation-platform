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
