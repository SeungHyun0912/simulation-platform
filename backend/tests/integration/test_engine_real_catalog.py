"""실제 기준정보(DEMO-WIRE) 공정 6종을 엔진에 통과시켜 **지금 어디까지 실행되고 어디서 막히는지**를 고정한다.

사용자가 6묶음 미정을 정리하고(CR be09, 2026-10-27) 잔량 규칙·멀티신선 순차 산출을 정한 뒤 **6종 모두 컴파일**된다.
P01·P02·P03·P06은 끝까지 실행되고, P04는 원자재 24개 기준 입력 부족(싱글-12가 12개 필요한데 9개 남음)으로, P05는 절연
4,000m 잔량의 처리 정책이 없어 그 시점에 이유와 함께 멈춘다. 입고 수량(24개)과 공간 용량 가정(`unbounded_buffers`)은
시나리오 쪽 값이며 문서의 사실이 아니다.
"""

import sys
from collections import Counter
from fractions import Fraction
from pathlib import Path

import pytest
from helpers import headers

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import seed_wire_factory

from simulation_platform.simulation.compiler import (
    ProcessSnapshot,
    ScenarioAssumptions,
    compile_snapshot,
)
from simulation_platform.simulation.runtime import Arrival, Lane, run_model, run_models

API = "/api/v1"
RAW_LENGTH_M = {"P01": "3000", "P02": "4000", "P03": "5000", "P06": "2000"}
RAW_WEIGHT_KG = {"P04": "2000", "P05": "3300"}  # 원자재에 길이가 없다(해당 없음): 무게만으로 입고한다
RAW_COUNT = 24  # 시나리오 기본값: 월 1회 월초 24개(사용자 지정, 바꿔 가며 반복 실행할 시험값)


@pytest.fixture(scope="module")
def wire(engine):
    return seed_wire_factory.seed(engine)


def snapshot(client, wire, code):
    base = f"{API}/projects/{wire['project']}"
    head = headers(wire["users"]["admin"])
    products = {p["code"]: p for p in client.get(f"{base}/products?limit=50", headers=head).json()["data"]}
    version_id = products[code]["latest_process_version"]["id"]
    version = client.get(f"{base}/process-versions/{version_id}", headers=head).json()["data"]
    graph = client.get(f"{base}/process-versions/{version_id}/graph", headers=head).json()["data"]
    return ProcessSnapshot.from_api(version, graph)


def rules(result):
    return {i.rule_id for i in result.issues}


# 공간 용량은 자산 버전 승인 전이라 모른다(무제한으로 가정하지 않고 시나리오가 명시). 점유 정책은 사용자 확정 기본값.
ASSUMED = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True)


def compiled(client, wire, code):
    return compile_snapshot(snapshot(client, wire, code), ASSUMED, allow_unapproved=True)


# --- 끝까지 실행되는 공정 -------------------------------------------------------------------------

@pytest.mark.parametrize("code", ["P01", "P02", "P03", "P04", "P05", "P06"])
def test_all_six_real_processes_compile_with_the_stated_scenario_assumptions(client, wire, code):
    result = compiled(client, wire, code)
    assert result.ok, result.issues
    assert {a.code for a in result.assumptions} == {"UNBOUNDED_BUFFERS", "EQUIPMENT_HOLD_FOR_OPERATION"}
    model = result.require_model()
    assert model.completion_key == "complete"
    for step in model.steps.values():  # 사용자 확정값이 모든 단계에 들어갔다
        assert step.handoff in ("per_output_unit", "total_batch")  # 싱글-12만 전체 준비 후 공급
        assert step.consume_policy in ("consume", "transfer")  # 싱글-12(공급)만 transfer
        if (code, step.key) in {("P04", "multi"), ("P05", "multi"), ("P05", "strand")}:
            assert (step.setup_minutes, step.setup_trigger) == (120, "on_product_change")  # 제품이 바뀔 때만 120분
        else:
            assert step.setup_minutes == 0  # 값이 없으면 0분(사용자 확정)
        if len(step.candidates) > 1:
            assert step.allocation == "first_available"


def test_p06_runs_to_completion_for_one_month_of_raw_material(client, wire):
    """원자재 2,000m 롤 24개(월초 입고) → 500m 보빈 96개. 설비는 후보 목록 순서(코드 순서)로 쓰인다."""
    model = compiled(client, wire, "P06").require_model()
    result = run_model(model, [Arrival("2000", count=RAW_COUNT)])
    assert (result.state, result.reason) == ("completed", None)
    assert len(result.of_type("SINK_REACHED")) == 96  # 2,000m → 1,000m×2 → 500m×2, 총 4개씩
    completions = [e for e in result.of_type("MILESTONE_REACHED") if e.reason == "completion"]
    assert len(completions) == 96
    assert all(r.balanced for r in result.lineage)  # 길이가 새거나 늘지 않는다
    started = Counter(e.asset_key for e in result.of_type("PROCESS_STARTED") if e.asset_key)
    assert len(started) > 40  # 편조기 42대 등 여러 설비가 병렬로 쓰였다
    # 이동은 보빈마다 독립이고 한 번에 4분(이동 3 + 상하차 1)이다
    moves = [r for r in result.lineage if r.step_key in ("forklift", "amr")]
    assert len(moves) == 2 * 48  # 지게차·AMR 각 1,000m 보빈 48개
    assert not any(a.code == "MANUAL_TRANSPORT_MINUTES" for a in result.assumptions)  # 이동 시간은 가정이 아니라 사실


def test_the_three_runnable_processes_share_equipment_and_the_first_free_machine_is_used_first(client, wire):
    lanes = [Lane(compiled(client, wire, code).require_model(), (Arrival(RAW_LENGTH_M[code], count=RAW_COUNT),))
             for code in ("P02", "P03", "P06")]  # ST-001 순차 입고(제품 순서가 같은 시각 처리 순서)
    result = run_models(lanes)
    assert (result.state, result.reason) == ("completed", None)
    done = Counter(e.process_version_id for e in result.of_type("SINK_REACHED"))
    assert sorted(done.values()) == [96, 192, 240]  # P06 96 / P02 24×8 / P03 24×10
    # 실리콘 쉬스 압출기 EQ-002와 테이핑기 EQ-011은 한 대(또는 두 대 중 앞 번호)가 216개 보빈을 모두 맡는다
    started = Counter(e.asset_key for e in result.of_type("PROCESS_STARTED") if e.asset_key)
    assert max(started.values()) >= 216
    assert result.end_time > Fraction(10 * 1440)  # 실리콘 편조(1.5m/min, 8대)가 병목이라 약 13일 걸린다


# --- 끝까지 가지 못하는 공정(이유를 숨기지 않는다) -------------------------------------------------------

def test_p01_carries_the_sheath_residual_so_ten_300m_bobbins_come_from_each_3000m_roll(client, wire):
    model = compiled(client, wire, "P01").require_model()
    result = run_model(model, [Arrival("3000", count=RAW_COUNT)])
    assert (result.state, result.reason) == ("completed", None)
    assert len(result.of_type("SINK_REACHED")) == 240  # 3,000m → 300m × 10(1,000m 보빈 3개: 3+3+4)
    assert [e.quantities["length_m"] for e in result.of_type("RESIDUAL_CARRIED")][:2] == [100, 200]
    assert not result.of_type("RESIDUAL_DISCARDED") and result.residuals == ()  # 같은 제품이라 버리지 않고 남는 것도 없다


def test_p04_runs_for_months_and_stops_with_insufficient_input_for_the_last_supply_batch(client, wire):
    """24개 입고 → 멀티신선 12회 → 4,000m 보빈 1,440개 → 싱글 메인은 13개(싱글-1 1 + 공급 12)씩 → 110회 1,100개, 10개 남는다.
    남은 9개는 싱글-12가 12개를 못 채워 기다리는 것(입력 부족)이다."""
    model = compiled(client, wire, "P04").require_model()
    result = run_model(model, [Arrival(weight_kg=RAW_WEIGHT_KG["P04"], count=RAW_COUNT)])
    assert (result.state, result.reason) == ("stalled", "INSUFFICIENT_INPUT")
    assert len(result.of_type("SINK_REACHED")) == 1100
    assert [(f["step"], f["waiting"], f["needed"]) for f in result.shortfalls] == [("single-feed", 9, 12)]
    assert result.end_time > Fraction(90 * 1440)  # 싱글-1(4.4m/min, 1대)이 병목이라 한 달 입고를 석 달 가까이 걸려 처리한다
    # 멀티신선: 원자재 2개를 한 번에 받아 12보빈을 순차로 하나씩(40,000m ÷ 100m/min = 400분마다)
    multi = [e.sim_time for e in result.of_type("OUTPUT_UNIT_READY") if e.step_key == "multi"][:3]
    assert multi == [400, 800, 1200]
    assert not any(e.quantities.get("length_m") is not None for e in result.of_type("MATERIAL_ARRIVED"))


def test_p05_stops_at_the_insulation_residual_whose_policy_is_still_undecided(client, wire):
    model = compiled(client, wire, "P05").require_model()
    result = run_model(model, [Arrival(weight_kg=RAW_WEIGHT_KG["P05"], count=RAW_COUNT)])
    assert (result.state, result.reason) == ("failed", "RESIDUAL_POLICY_UNKNOWN")
    terminated = result.of_type("RUN_TERMINATED")[-1]
    assert terminated.step_key == "insulate" and "4000m" in terminated.quantities["message"]
    # 태신선은 11개씩 2회(36보빈 × 2), 멀티신선은 24보빈을 한 번에 받아 9보빈(100,000m)을 순차로 만든 뒤 연선까지 갔다
    started = Counter(e.step_key for e in result.of_type("PROCESS_STARTED"))
    assert started["draw"] == 2 and started["multi"] == 1 and started["strand"] == 1


def test_a_scenario_that_does_not_state_the_unknowns_stays_blocked(client, wire):
    """공간 용량·점유 정책을 시나리오가 말하지 않으면 용량 미정은 무제한으로 가정되지 않고 막힌다."""
    result = compile_snapshot(snapshot(client, wire, "P06"), ScenarioAssumptions(), allow_unapproved=True)
    assert {"BUFFER_POLICY_UNKNOWN", "EQUIPMENT_HOLD_POLICY_REQUIRED"} <= rules(result)
