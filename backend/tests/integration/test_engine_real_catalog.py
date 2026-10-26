"""실제 기준정보(DEMO-WIRE) 공정 4가지를 엔진 컴파일러에 통과시켜 **지금 어디서 막히는지**를 기록한다.

이 테스트는 "엔진이 실제 공정을 돌린다"는 증거가 아니다. 반대로 문서가 정하지 않은 값(입력 소비 시점·운반 시간·
점유 정책 등)이 남아 있어 컴파일이 막힌다는 것을 고정한다. 미정이 확정되면(도메인 입력) 이 기대값이 줄어든다.
"""

import sys
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

API = "/api/v1"


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


FULL_ASSUMPTIONS = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True)


@pytest.mark.parametrize("code", ["P01", "P02", "P03", "P04", "P05", "P06"])
def test_no_real_process_is_runnable_yet_and_the_reasons_are_explicit(client, wire, code):
    result = compile_snapshot(snapshot(client, wire, code), FULL_ASSUMPTIONS, allow_unapproved=True)
    assert result.model is None and not result.ok
    assert result.issues  # 숨기지 않는다
    # 문서에 없는 값(입력 소비 시점·확보 범위)이 모든 단계에 남아 있다
    assert "VAL-INPUT-001" in rules(result)


def test_silicon_products_are_blocked_by_missing_completion_and_inspection_resources(client, wire):
    result = compile_snapshot(snapshot(client, wire, "P01"), FULL_ASSUMPTIONS, allow_unapproved=True)
    assert {"VAL-GRAPH-014", "VAL-RES-002", "VAL-HANDOFF-001"} <= rules(result)  # 완제품 시점·검사 자원·인계 방식 미정


def test_p04_al_join_is_structurally_runnable_but_its_unknowns_remain(client, wire):
    result = compile_snapshot(snapshot(client, wire, "P04"), FULL_ASSUMPTIONS, allow_unapproved=True)
    # C0-07: ST-019 분기(싱글-1·싱글-12) + 싱글 메인 합류(직결·공급 간선)는 경로로 받아들인다
    assert not {"NONLINEAR_EDGE_UNSUPPORTED", "BRANCH_UNSUPPORTED", "JOIN_UNSUPPORTED"} & rules(result)
    assert "ENGINE_HANDLER_NOT_AVAILABLE" in rules(result)  # 멀티신선 output_units_by_time(병렬 스트림)은 미구현
    # 싱글 메인의 공급 입력은 가닥 수(12)만 있고 단위 수가 없다: 가닥을 보빈 수로 바꾸지 않는다
    assert "INPUT_COUNT_UNKNOWN" in rules(result)


def test_p05_and_p06_are_linear_but_need_transport_assumptions_and_input_policies(client, wire):
    for code in ("P05", "P06"):
        result = compile_snapshot(snapshot(client, wire, code), FULL_ASSUMPTIONS, allow_unapproved=True)
        assert "TRANSPORT_DURATION_UNKNOWN" in rules(result)  # 지게차·AMR 이동 시간은 문서에 없다
        assert not rules(result) & {"NONLINEAR_EDGE_UNSUPPORTED", "BRANCH_UNSUPPORTED", "JOIN_UNSUPPORTED"} \
            or code == "P05"  # P05의 draw·multi는 병렬 신선(미지원)이라 별도 사유가 섞일 수 있다


def test_p06_blockers_shrink_only_when_the_scenario_states_the_unknowns(client, wire):
    snap = snapshot(client, wire, "P06")
    transports = {n["node_key"]: 0 for n in snap.nodes if (n["step"] or {}).get("operation_type") == "transport_manual"}
    from fractions import Fraction
    assumed = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True,
                                  manual_transport_minutes={k: Fraction(v) for k, v in transports.items()})
    result = compile_snapshot(snap, assumed, allow_unapproved=True)
    remaining = rules(result)
    assert "TRANSPORT_DURATION_UNKNOWN" not in remaining and "BUFFER_POLICY_UNKNOWN" not in remaining
    assert "EQUIPMENT_HOLD_POLICY_REQUIRED" not in remaining
    assert "VAL-INPUT-001" in remaining and "VAL-RES-004" in remaining  # 도메인 입력(소비 시점·후보 호기 자격)이 남는다
    waived = {w.rule_id for w in result.waived}
    assert {"VAL-RES-002"} <= waived  # 운반 단계의 자원 미정은 가정으로 면제하되 보고한다
