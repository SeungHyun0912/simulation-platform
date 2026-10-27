"""CR be12: 두 실행 비교의 순수 규칙 — 입력 차이·차원 맞추기·차이와 비율(DB 불필요)."""

import copy
from decimal import Decimal as D

from simulation_platform.domain import comparison as rules


def snapshot(**overrides):
    base = {
        "engine": {"version": "c0-1", "simpy": "4.1.2"}, "seed": 0, "replicate_index": 0,
        "engine_options": {"event_limit": 2000000},
        "scenario": {"scenario_version_id": "sv1", "stopping_rule": {"mode": "drain"}, "assumption_reason": "가정"},
        "products": [
            {"product_id": "p1", "product": {"code": "P01", "name": "제품1"}, "process_version": {"id": "v1"},
             "arrivals": [{"at_min": "0", "count": 24, "length_m": "3000"}], "assumptions": {"unbounded_buffers": True}},
            {"product_id": "p4", "product": {"code": "P04", "name": "제품4"}, "process_version": {"id": "v4"},
             "arrivals": [{"at_min": "0", "count": 24, "weight_kg": "2000"}], "assumptions": {}}],
        "assets": {"a1": {"storage_capacity": None}},
    }
    base.update(overrides)
    return base


def test_identical_inputs_have_no_changes_and_are_comparable():
    assert rules.input_changes(snapshot(), snapshot()) == []
    assert rules.warnings(snapshot(), snapshot(), "completed", "completed") == (True, [])


def test_changes_are_listed_by_product_code_and_asset():
    other = snapshot(seed=7)
    other["products"][0]["arrivals"] = [{"at_min": "0", "count": 30, "length_m": "3000"}]
    other["products"][1]["process_version"] = {"id": "v4b"}
    other["assets"] = {"a1": {"storage_capacity": {"mode": "finite", "value": "10"}}}
    paths = {c["path"]: c for c in rules.input_changes(snapshot(), other)}
    assert set(paths) == {"seed", "products.P01.arrivals", "products.P04.process_version_id", "assets.a1"}
    assert paths["seed"]["base"] == 0 and paths["seed"]["other"] == 7
    assert paths["products.P04.process_version_id"]["other"] == "v4b" and "diff" in paths["products.P04.process_version_id"]["note"]


def test_order_and_missing_products_are_reported_and_warned():
    other = snapshot()
    other["products"] = list(reversed(other["products"]))
    assert [c["path"] for c in rules.input_changes(snapshot(), other)] == ["products.order"]
    fewer = snapshot()
    fewer["products"] = fewer["products"][:1]
    change = rules.input_changes(snapshot(), fewer)[0]
    assert change["path"] == "products.P04" and change["other"] is None
    comparable, notes = rules.warnings(snapshot(), fewer, "completed", "stalled")
    assert comparable and any("한쪽 실행에만" in n for n in notes) and any("stalled" in n for n in notes)


def test_a_different_engine_version_is_not_comparable():
    other = copy.deepcopy(snapshot())
    other["engine"]["version"] = "c0-2"
    comparable, notes = rules.warnings(snapshot(), other, "completed", "completed")
    assert comparable is False and "엔진 버전" in notes[0]


def test_dimensions_are_aligned_by_product_even_when_the_process_version_changes():
    a = rules.align_dimensions({"process_version_id": "v4", "step_key": "draw"}, {"v4": "p4"})
    b = rules.align_dimensions({"process_version_id": "v4b", "step_key": "draw"}, {"v4b": "p4"})
    assert a == b == (("product_id", "p4"), ("step_key", "draw"))
    assert rules.align_dimensions({"asset_key": "x"}, {}) == (("asset_key", "x"),)


def test_delta_and_ratio():
    assert rules.delta(D(2), D(4)) == (D(2), D(2))
    assert rules.delta(D(0), D(4)) == (D(4), None)  # 기준이 0이면 비율은 없다
    assert rules.delta(None, D(4)) == (None, None)
