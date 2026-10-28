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


def test_limitations_say_carriers_were_modelled_when_the_run_used_carriers():
    notes = run(codes={"CARRIER_EMPTY_MOVE"})["limitations"]
    assert any("지정된 대수와 위치" in note for note in notes)
    assert not any("대수를 모델링하지 않" in note for note in notes)


# --- CR be17: 원인 추적 ------------------------------------------------------------------------------
PV4 = "44444444-4444-4444-8444-444444444444"
E94, E95, E96 = ("bbbbbbbb-0000-4000-8000-000000000094", "bbbbbbbb-0000-4000-8000-000000000095",
                 "bbbbbbbb-0000-4000-8000-000000000096")
P04 = {PV4: {
    "product": {"id": "p4", "code": "P04", "name": "제품4"},
    "nodes": {
        "double": {"label": "AL 더블 집합", "kind": "operation", "operation_type": "assemble", "assets": [E95], "next": ["st-019"]},
        "st-019": {"label": "ST-019", "kind": "buffer", "operation_type": None, "assets": [], "next": ["single-pre", "single-feed"]},
        "single-pre": {"label": "싱글-1", "kind": "operation", "operation_type": "assemble", "assets": [E94], "next": ["single-main"]},
        "single-feed": {"label": "싱글-12", "kind": "operation", "operation_type": "assemble", "assets": [E95], "next": ["single-main"]},
        "single-main": {"label": "싱글 메인", "kind": "operation", "operation_type": "assemble", "assets": [E96], "next": []},
    }}}
P04_NAMES = {E94: {"code": "EQ-094", "name": "싱글-1"}, E95: {"code": "EQ-095", "name": "더블"},
             E96: {"code": "EQ-096", "name": "싱글 메인"}}


def run_p04(steps, nodes=None):
    return rules.analyze(steps=steps, nodes=nodes or {}, assets={E96: {"utilization": D("0.989")}, E94: {"utilization": D("0.30")}},
                         graphs=P04, asset_names=P04_NAMES, observed_min=D(1000), assumption_codes=set())


def test_a_blocked_upstream_step_is_traced_through_the_space_to_the_unblocked_machine_downstream():
    out = run_p04({(PV4, "double"): {"step_blocked_item_min": D(408305)},
                   (PV4, "single-feed"): {"step_blocked_item_min": D(90000)},
                   (PV4, "single-pre"): {"step_blocked_item_min": D(20000)},
                   (PV4, "single-main"): {"step_equipment_wait_item_min": D(500), "step_processing_time_min": D(9000)}},
                  nodes={"st-019": {"buffer_peak_items": D(120), "buffer_item_min": D(500000)}})
    top = out["findings"][0]
    assert top["location"]["step_key"] == "double"
    assert [c["key"] for c in top["chain"]] == ["double", "st-019", "single-feed", "single-main"]  # 더 막힌 싱글-12로
    root = top["root_cause"]
    assert (root["product_code"], root["step_key"], root["assets"][0]["code"]) == ("P04", "single-main", "EQ-096")
    assert "AL 더블 집합 → ST-019 → 싱글-12 → 싱글 메인" in root["explanation"] and "98.9%" in root["explanation"]
    assert "근본 원인: P04 · 싱글 메인(EQ-096 가동률 98.9%)" in out["headline"]
    [group] = out["root_causes"]  # 모든 후보가 같은 근본 원인으로 묶임
    assert group["step_key"] == "single-main" and group["rank"] == 1 and group["findings"] == len(out["findings"])
    assert sorted(group["finding_ranks"]) == [f["rank"] for f in out["findings"]]


def test_an_unblocked_busy_machine_is_its_own_root_and_the_headline_does_not_repeat_it():
    out = run_p04({(PV4, "single-main"): {"step_equipment_wait_item_min": D(500)}})
    [finding] = out["findings"]
    assert [c["key"] for c in finding["chain"]] == ["single-main"]
    assert finding["root_cause"]["step_key"] == "single-main" and "흐름을 제한" in finding["root_cause"]["explanation"]
    assert "근본 원인" not in out["headline"]


def test_a_space_with_no_blocked_consumer_goes_to_the_consumer_that_works_longest():
    out = run_p04({(PV4, "single-pre"): {"step_processing_time_min": D(100)},
                   (PV4, "single-feed"): {"step_processing_time_min": D(700)}},
                  nodes={"st-019": {"buffer_peak_items": D(50), "buffer_item_min": D(3000)}})
    [finding] = out["findings"]
    assert [c["key"] for c in finding["chain"]] == ["st-019", "single-feed"]
    assert finding["root_cause"]["step_key"] == "single-feed"


def test_a_blocked_step_with_nowhere_to_go_has_no_root():
    out = run_p04({(PV4, "single-main"): {"step_blocked_item_min": D(500)}})
    [finding] = out["findings"]
    assert finding["root_cause"] is None and out["root_causes"] == []


def test_a_root_with_low_utilization_points_to_the_input_conditions_instead_of_the_machine_speed():
    out = run_p04({(PV4, "single-pre"): {"step_equipment_wait_item_min": D(500), "step_input_wait_item_min": D(7200)}})
    root = out["findings"][0]["root_cause"]
    assert root["utilization"] == D("0.30") and root["input_wait_item_min"] == D(7200)
    assert "투입 조건(입력 대기 7,200.0작업물·분)을 먼저 확인" in root["explanation"]
    assert "투입 조건" in out["root_causes"][0]["explanation"]
    busy = run_p04({(PV4, "single-main"): {"step_equipment_wait_item_min": D(500)}})["findings"][0]["root_cause"]
    assert "투입 조건" not in busy["explanation"]  # 가동률 98.9%는 설비 자체가 원인


def test_a_shared_space_is_followed_into_whichever_product_drains_it_most_slowly():
    other = "55555555-5555-4555-8555-555555555555"
    graphs = {**P04, other: {"product": {"id": "p5", "code": "P05", "name": "제품5"}, "nodes": {
        "st-019": {"label": "ST-019", "kind": "buffer", "operation_type": None, "assets": [], "next": ["tape"]},
        "tape": {"label": "테이핑", "kind": "operation", "operation_type": "transform", "assets": [], "next": []}}}}
    out = rules.analyze(steps={(other, "tape"): {"step_processing_time_min": D(99999)}},
                        nodes={"st-019": {"buffer_peak_items": D(50), "buffer_item_min": D(3000)}}, assets={},
                        graphs=graphs, asset_names={}, observed_min=D(1000), assumption_codes=set())
    [finding] = out["findings"]
    assert [(c["process_version_id"], c["key"]) for c in finding["chain"]] == [(PV4, "st-019"), (other, "tape")]
    assert finding["root_cause"]["product_code"] == "P05"
