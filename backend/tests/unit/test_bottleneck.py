"""CR be10: 병목 판정 규칙(사용자 기준 3종)을 합성 지표로 확인한다(DB 불필요)."""

from decimal import Decimal as D

from simulation_platform.domain import bottleneck as rules

PV = "11111111-1111-4111-8111-111111111111"
M1, M2 = "aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002"

GRAPHS = {PV: {
    "product": {"id": "p1", "code": "P04", "name": "제품4"},
    "nodes": {
        "wait_in": {"label": "대기 ST-001", "kind": "buffer", "operation_type": None, "assets": [], "next": ["draw"]},
        "draw": {"label": "신선", "kind": "operation", "operation_type": "split_length", "assets": [M1, M2], "next": ["wait_fork"]},
        "wait_fork": {"label": "지게차 대기 ST-020", "kind": "buffer", "operation_type": None, "assets": [], "next": ["forklift"]},
        "forklift": {"label": "지게차 운반", "kind": "operation", "operation_type": "transport_manual", "assets": [], "next": []},
    }}}
NAMES = {M1: {"code": "EQ-001", "name": "신선기 1"}, M2: {"code": "EQ-002", "name": "신선기 2"}}


def run(steps=None, nodes=None, assets=None, codes=frozenset({"EQUIPMENT_HOLD_FOR_OPERATION"})):
    return rules.analyze(steps=steps or {}, nodes=nodes or {}, assets=assets or {}, graphs=GRAPHS, asset_names=NAMES,
                         observed_min=D(1000), assumption_codes=set(codes))


def test_nothing_stalled_means_no_findings():
    out = run(steps={(PV, "draw"): {"step_equipment_wait_item_min": D(0), "step_blocked_item_min": D(0)}},
              nodes={"wait_in": {"space_wait_item_min": D(0), "buffer_peak_items": D(2)}})
    assert out["findings"] == [] and "관측되지 않았" in out["headline"]


def test_an_item_waiting_for_a_busy_machine_is_an_equipment_busy_bottleneck_with_the_machines_utilization():
    out = run(steps={(PV, "draw"): {"step_equipment_wait_item_min": D(600), "step_equipment_wait_avg_min": D(25),
                                    "step_equipment_wait_max_min": D(90), "step_operations": D(24)}},
              assets={M1: {"utilization": D("0.95"), "processing_time_min": D(950)},
                      M2: {"utilization": D("0.40"), "processing_time_min": D(400)}})
    [finding] = out["findings"]
    assert (finding["kind"], finding["level"], finding["rank"], finding["rank_in_kind"]) == ("equipment_busy", "high", 1, 1)
    assert finding["location"] == {"process_version_id": PV, "step_key": "draw", "step_label": "신선"}
    assert [a["code"] for a in finding["evidence"]["assets"]] == ["EQ-001", "EQ-002"]  # 가동률 높은 설비부터
    assert "P04 · 신선" in finding["explanation"] and "EQ-001" in finding["explanation"] and "95.0%" in finding["explanation"]


def test_a_full_next_space_and_a_blocked_output_are_space_full_bottlenecks():
    out = run(steps={(PV, "draw"): {"step_blocked_item_min": D(100)}},
              nodes={"wait_fork": {"space_wait_item_min": D(300), "space_wait_max_min": D(50)}})
    kinds = [(f["kind"], f["evidence"]["source"], f["share"]) for f in out["findings"]]
    assert ("space_full", "space_wait", D("0.75")) in kinds and ("space_full", "output_blocked", D("0.25")) in kinds
    assert [f["rank"] for f in out["findings"]] == [1, 2] and out["findings"][0]["location"]["node_key"] == "wait_fork"


def test_a_pile_of_waiting_items_before_a_transport_step_is_flagged_with_the_carriers_needed():
    out = run(steps={(PV, "forklift"): {"step_peak_concurrency": D(7), "step_processing_time_min": D(2000)}},
              nodes={"wait_fork": {"buffer_peak_items": D(12), "buffer_item_min": D(5000), "buffer_wait_avg_min": D(40),
                                   "buffer_occupancy_avg_items": D(5)},
                     "wait_in": {"buffer_peak_items": D(2), "buffer_item_min": D(100)}})  # 2개는 적체 기준(3개) 미만
    [finding] = out["findings"]
    assert finding["kind"] == "queue_pileup" and finding["evidence"]["transport_related"] is True
    [carrier] = finding["evidence"]["carriers"]
    assert (carrier["step_key"], carrier["peak_concurrent_trips"], carrier["average_concurrent_trips"]) == ("forklift", D(7), D(2))
    assert "최대 12개" in finding["explanation"] and "지게차 운반" in finding["explanation"] and "최대 7건" in finding["explanation"]
    assert any("대수를 모델링하지 않" in note for note in out["limitations"])


def test_a_pile_before_a_non_transport_step_is_a_pileup_but_not_transport_related():
    out = run(nodes={"wait_in": {"buffer_peak_items": D(24), "buffer_item_min": D(9000)}})
    assert out["findings"][0]["evidence"]["transport_related"] is False and out["findings"][0]["evidence"]["carriers"] == []


def test_level_follows_the_share_within_the_kind_and_tiny_stalls_stay_low():
    out = run(steps={(PV, "draw"): {"step_equipment_wait_item_min": D(700)}, (PV, "forklift"): {"step_equipment_wait_item_min": D(250)},
                     ("22222222-2222-4222-8222-222222222222", "x"): {"step_equipment_wait_item_min": D(50)}})
    by_key = {f["location"].get("step_key"): f for f in out["findings"] if f["kind"] == "equipment_busy"}
    assert by_key["draw"]["level"] == "high" and by_key["forklift"]["level"] == "medium"
    assert by_key["x"]["level"] == "low"  # 비율은 5%이고 60작업물·분 미만이라 낮음
    assert [f["rank_in_kind"] for f in sorted(out["findings"], key=lambda f: f["rank"])] == [1, 2, 3]
    only_tiny = run(steps={(PV, "draw"): {"step_equipment_wait_item_min": D(5)}})["findings"][0]
    assert only_tiny["share"] == 1 and only_tiny["level"] == "low"  # 100%여도 60작업물·분 미만이면 low


def test_limitations_tell_when_space_shortage_was_not_evaluated():
    unbounded = run(codes={"UNBOUNDED_BUFFERS"})["limitations"]
    assert any("무제한" in note and "space_full" in note for note in unbounded)
    assert not any("무제한으로 가정한 실행" in note for note in run(codes=set())["limitations"])
    assert run()["thresholds"]["pileup_min_peak_items"] == "3"
