"""C0-06: 잔량 이월·폐기(03 §6). 이월은 물리 접속이 아니라 길이 풀(abstract_length_pool)이며, 잔량을 모아 두는
범위(scope)와 제품 전환·실행 종료 때의 처리 정책을 명시해야 한다. 미정은 스스로 정하지 않는다."""

from fractions import Fraction

import pytest
from fixtures import EQUIPMENT_1, single_insulation, uid

from simulation_platform.simulation.compiler import ScenarioAssumptions, compile_snapshot
from simulation_platform.simulation.runtime import Arrival, Lane, run_model, run_models

F = Fraction
OK = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True)
PROJECT = uid()


def carry(scope="operation", *, on_product_change="discard", on_run_end="unknown",
          join="abstract_length_pool"):
    return {"mode": "carry_same_product", "on_product_change": on_product_change, "on_run_end": on_run_end,
            "scope": scope, "physical_join_mode": join}


def sheath(rule, **args):
    """1,000m 보빈을 300m 단위로 나누는 단계(잔량 이월이 필요한 시험 전용 입력). 산출 수는 1롤분 기준(per_lot)."""
    return single_insulation(unit=300, count=10, basis="per_lot", speed_value="15", residual_rule=rule,
                             project_id=PROJECT, **args)


def model_of(snapshot, assumptions=OK):
    return compile_snapshot(snapshot, assumptions).require_model()


def rules(snapshot, assumptions=OK):
    return {i.rule_id for i in compile_snapshot(snapshot, assumptions).issues}


def quantities(result, event_type):
    return [e.quantities["length_m"] for e in result.of_type(event_type)]


# --- 컴파일: 이월에 필요한 정보 ------------------------------------------------------------------

def test_carry_needs_a_scope_which_only_a_scenario_assumption_may_fill():
    unknown_scope = sheath(carry(scope="unknown"))
    assert rules(unknown_scope) == {"RESIDUAL_SCOPE_UNKNOWN"}
    assumed = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True,
                                  residual_scope={"insulate": "machine"})
    result = compile_snapshot(unknown_scope, assumed)
    assert result.ok
    assert result.require_model().steps["insulate"].residual.scope == "machine"
    assert any(a.code == "RESIDUAL_SCOPE" and a.node_key == "insulate" for a in result.assumptions)
    wrong = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True,
                                residual_scope={"insulate": "galaxy"})
    assert rules(unknown_scope, wrong) == {"RESIDUAL_SCOPE_INVALID"}


def test_carry_must_be_marked_as_an_abstract_length_pool():
    assert rules(sheath(carry(join="unknown"))) == {"RESIDUAL_JOIN_MODE_UNKNOWN"}


def test_scope_from_the_process_needs_no_assumption():
    result = compile_snapshot(sheath(carry(scope="operation")), OK)
    assert result.ok and not any(a.code == "RESIDUAL_SCOPE" for a in result.assumptions)


# --- 실행: 동일 제품 연속 생산 중 이월 ----------------------------------------------------------------

def test_three_bobbins_of_1000m_become_ten_300m_units_by_carrying_the_remainder():
    result = run_model(model_of(sheath(carry())), [Arrival("1000", count=3)])
    # 1,000 → 300×3 + 100 / 1,100 → 300×3 + 200 / 1,200 → 300×4 + 0  (합계 3,000m → 300m×10)
    assert [r.carried_in_m for r in result.lineage] == [0, 100, 200]
    assert [len(r.child_keys) for r in result.lineage] == [3, 3, 4]
    assert [r.residual_length_m for r in result.lineage] == [100, 200, 0]
    assert all(r.balanced for r in result.lineage)  # 자식 + 잔량 = 부모 + 이월받은 길이
    assert quantities(result, "RESIDUAL_CREATED") == [100, 200]
    assert quantities(result, "RESIDUAL_CARRIED") == [100, 200]
    completed = [i for i in result.items if i.status == "completed"]
    assert len(completed) == 10 and sum((i.length_m for i in completed), F(0)) == 3000
    assert result.state == "completed" and result.residuals == ()  # 풀이 비었다


def test_residual_left_at_the_end_follows_on_run_end_and_is_reported():
    arrivals = [Arrival("1000", count=2)]  # 1,000 → 300×3+100 / 1,100 → 300×3+200 → 끝에 200 남음
    unknown = run_model(model_of(sheath(carry(on_run_end="unknown"))), arrivals)
    (left,) = unknown.residuals
    assert (left["length_m"], left["disposition"]) == (200, "unknown")  # 미정이면 처리하지 않고 미정으로 보고
    assert left["pool"].startswith("operation:") and not unknown.of_type("RESIDUAL_DISCARDED")
    discarded = run_model(model_of(sheath(carry(on_run_end="discard"))), arrivals)
    assert discarded.residuals[0]["disposition"] == "discarded"
    assert [e.reason for e in discarded.of_type("RESIDUAL_DISCARDED")] == ["RUN_END"]
    assert quantities(discarded, "RESIDUAL_DISCARDED") == [200]
    kept = run_model(model_of(sheath(carry(on_run_end="carry"))), arrivals)
    assert kept.residuals[0]["disposition"] == "carried"
    assert kept.of_type("RUN_TERMINATED")[0].quantities["residual_pools"] == 1


def test_residual_is_not_settled_when_the_run_was_cut_by_the_horizon():
    # 첫 작업은 60분에 끝나 100m를 풀에 남기고, 둘째 원자재는 지평선(70분) 뒤에 도착한다
    result = run_model(model_of(sheath(carry(on_run_end="discard"))),
                       [Arrival("1000"), Arrival("1000", at=100)], horizon=F(70))
    assert result.state == "horizon_reached"
    assert [r["disposition"] for r in result.residuals] == ["open"]  # 관측 중단이면 종료 정책을 적용하지 않는다
    assert not result.of_type("RESIDUAL_DISCARDED")


# --- 제품 전환 -----------------------------------------------------------------------------------

def two_products(policy, scope="machine"):
    a = Lane(model_of(sheath(carry(scope=scope, on_product_change=policy))), (Arrival("1000"),))
    b = Lane(model_of(sheath(carry(scope=scope, on_product_change=policy))), (Arrival("1000"),))
    return a, b, run_models([a, b])


def test_product_change_discards_the_previous_products_remainder():
    a, b, result = two_products("discard")
    dropped = result.of_type("RESIDUAL_DISCARDED")
    assert [e.reason for e in dropped] == ["PRODUCT_CHANGE"]
    assert dropped[0].quantities == {"length_m": 100, "from_process_version_id": a.model.version_id}
    assert dropped[0].process_version_id == b.model.version_id
    second = next(r for r in result.lineage if r.process_version_id == b.model.version_id)
    assert second.carried_in_m == 0 and len(second.child_keys) == 3  # 다른 제품의 잔량을 잇지 않는다
    assert result.state == "completed"


def test_product_change_with_unknown_policy_fails_only_when_it_actually_happens():
    _a, b, result = two_products("unknown")
    assert result.state == "failed" and result.reason == "RESIDUAL_PRODUCT_CHANGE_POLICY_UNKNOWN"
    assert result.events[-1].process_version_id == b.model.version_id
    alone = run_model(model_of(sheath(carry(scope="machine", on_product_change="unknown"))),
                      [Arrival("1000", count=3)])
    assert alone.state == "completed"  # 같은 제품만 흐르면 제품 전환 정책이 필요 없다


def test_product_change_with_carry_policy_passes_the_remainder_on():
    a, b, result = two_products("carry")
    carried = result.of_type("RESIDUAL_CARRIED")
    assert carried[0].quantities["from_process_version_id"] == a.model.version_id
    second = next(r for r in result.lineage if r.process_version_id == b.model.version_id)
    assert second.carried_in_m == 100 and second.balanced


def test_product_scope_keeps_each_products_pool_separate():
    _a, _b, result = two_products("unknown", scope="product")
    assert result.state == "completed" and not result.of_type("RESIDUAL_CARRIED")
    assert sorted(r["length_m"] for r in result.residuals) == [100, 100]


# --- lot 범위 ----------------------------------------------------------------------------------

def test_lot_scope_pools_by_lot_and_requires_a_lot():
    model = model_of(sheath(carry(scope="lot")))
    result = run_model(model, [Arrival("1000", lot="L1"), Arrival("1000", lot="L2"), Arrival("1000", lot="L1")])
    assert [r.carried_in_m for r in result.lineage] == [0, 0, 100]  # L2는 L1의 잔량을 잇지 않는다
    missing = run_model(model, [Arrival("1000")])
    assert missing.state == "failed" and missing.reason == "RESIDUAL_LOT_UNKNOWN"


# --- 이월하지 않는 단계는 그대로 ---------------------------------------------------------------------

@pytest.mark.parametrize("mode,reason", [("none", "RESIDUAL_UNEXPECTED"), ("unknown", "RESIDUAL_POLICY_UNKNOWN")])
def test_non_carry_steps_still_refuse_leftovers(mode, reason):
    result = run_model(model_of(sheath({**carry(), "mode": mode})), [Arrival("1000")])
    assert result.state == "failed" and result.reason == reason
    assert not result.of_type("ASSET_STATE_CHANGED")  # 이월이 없으면 설비를 쥐기 전에 실패한다


def test_the_same_inputs_give_the_same_residual_events():
    model = model_of(sheath(carry()))
    one = run_model(model, [Arrival("1000", count=3)])
    two = run_model(model, [Arrival("1000", count=3)])
    assert [e.to_dict() for e in one.events] == [e.to_dict() for e in two.events]
    assert EQUIPMENT_1 in {e.asset_key for e in one.of_type("PROCESS_STARTED")}
