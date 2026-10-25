"""BE-04b: 공정 버전 비교 순수 함수(CR-backend-20261026-be05 §2-2)."""

import copy

from simulation_platform.domain.process_diff import diff_versions, leaf_diff


def step(speed="30", asset="a1", status="confirmed"):
    return {
        "operation_type": "output_units_by_time", "handler_version": "1",
        "timing_rule": {"processing": {"kind": "output_speed",
                                       "speed_m_per_min": {"mode": "known", "value": speed}}},
        "input_rule": {}, "output_rule": {}, "handoff_rule": {}, "residual_rule": {},
        "resources": [{"role_key": "main", "resource_kind": "equipment", "required_count": 1,
                       "candidates": [{"asset_id": asset, "eligibility_status": status}]}]}


def node(nid, key, kind="buffer", **extra):
    return {"id": nid, "node_key": key, "kind": kind, "label": key, "asset_id": None,
            "display_order": 0, "step": extra.pop("step", None), **extra}


def edge(eid, key, a, b):
    return {"id": eid, "edge_key": key, "from_node_id": a, "to_node_id": b,
            "edge_kind": "material", "movement_rule": {"mode": "unknown"}}


def version(prefix="x", **header):
    nodes = [node(f"{prefix}1", "src", "source"), node(f"{prefix}2", "op", "operation", step=step()),
             node(f"{prefix}3", "sink", "sink")]
    edges = [edge(f"{prefix}e1", "src-op", f"{prefix}1", f"{prefix}2"),
             edge(f"{prefix}e2", "op-sink", f"{prefix}2", f"{prefix}3")]
    base = {"raw_unit_spec": {"length_m": {"mode": "unknown", "value": None}},
            "finished_unit_spec": {}, "notes": None}
    return {"header": {**base, **header}, "nodes": nodes, "edges": edges}


def test_identical_versions_with_different_ids_have_no_diff():
    result = diff_versions(version("t"), version("a"))  # id는 달라도 key가 같다
    assert result["summary"] == {"added": 0, "removed": 0, "changed": 0, "identical": True}
    assert result["header"] == [] and result["steps"]["changed"] == []


def test_added_removed_and_changed_nodes_and_edges_by_key():
    target, against = version("t"), version("a")
    target["nodes"].append(node("t4", "extra"))
    target["edges"].append(edge("te3", "sink-extra", "t3", "t4"))
    del against["nodes"][0], against["edges"][0]  # against에는 src가 없다
    target["nodes"][2]["label"] = "완제품"
    result = diff_versions(target, against)
    assert [n["node_key"] for n in result["nodes"]["added"]] == ["extra", "src"]
    assert result["nodes"]["removed"] == []
    assert result["nodes"]["changed"] == [{"node_key": "sink", "fields": [
        {"field_path": "/label", "change": "changed", "before": "sink", "after": "완제품"}]}]
    assert [e["edge_key"] for e in result["edges"]["added"]] == ["sink-extra", "src-op"]
    assert result["summary"] == {"added": 4, "removed": 0, "changed": 1, "identical": False}


def test_removed_is_reported_with_the_against_entities():
    target, against = version("t"), version("a")
    del target["nodes"][2], target["edges"][1]
    result = diff_versions(target, against)
    assert [n["id"] for n in result["nodes"]["removed"]] == ["a3"]  # against의 id
    assert [e["edge_key"] for e in result["edges"]["removed"]] == ["op-sink"]


def test_step_changes_use_json_pointers_and_key_resources_by_role_and_asset():
    target, against = version("t"), version("a")
    target["nodes"][1]["step"] = step(speed="45", asset="a2")
    changes = diff_versions(target, against)["steps"]["changed"]
    assert [c["node_key"] for c in changes] == ["op"]
    fields = {f["field_path"]: f for f in changes[0]["fields"]}
    speed = fields["/timing_rule/processing/speed_m_per_min/value"]
    assert (speed["change"], speed["before"], speed["after"]) == ("changed", "30", "45")
    assert fields["/resources/main/candidates/a1"]["change"] == "removed"
    assert fields["/resources/main/candidates/a1"]["before"] == {"eligibility_status": "confirmed"}
    assert fields["/resources/main/candidates/a2"]["change"] == "added"
    assert fields["/resources/main/candidates/a2"]["after"] == {"eligibility_status": "confirmed"}


def test_candidate_order_does_not_matter():
    target, against = version("t"), version("a")
    extra = {"asset_id": "a2", "eligibility_status": "confirmed"}
    target["nodes"][1]["step"]["resources"][0]["candidates"].append(extra)
    against["nodes"][1]["step"]["resources"][0]["candidates"].insert(0, copy.deepcopy(extra))
    against["nodes"][1]["step"]["resources"][0]["candidates"].reverse()
    assert diff_versions(target, against)["summary"]["identical"] is True


def test_edge_endpoints_are_compared_by_node_key_not_id():
    target, against = version("t"), version("a")
    target["edges"][0]["to_node_id"] = "t3"  # src → sink 로 바뀜
    fields = diff_versions(target, against)["edges"]["changed"][0]["fields"]
    assert fields == [{"field_path": "/to_node_key", "change": "changed",
                       "before": "op", "after": "sink"}]


def test_header_changes_and_unknown_to_known_is_a_change():
    target = version("t", notes="메모", raw_unit_spec={
        "length_m": {"mode": "known", "value": "3000"}})
    result = diff_versions(target, version("a"))
    fields = {f["field_path"]: (f["before"], f["after"]) for f in result["header"]}
    assert fields == {"/notes": (None, "메모"),
                      "/raw_unit_spec/length_m/mode": ("unknown", "known"),
                      "/raw_unit_spec/length_m/value": (None, "3000")}
    assert result["summary"]["changed"] == 1 and not result["summary"]["identical"]


def test_leaf_diff_treats_lists_as_values_and_escapes_pointers():
    assert leaf_diff({"a": [1, 2]}, {"a": [1, 2]}) == []
    assert leaf_diff({"a": [1, 2]}, {"a": [2, 1]})[0]["field_path"] == "/a"
    out = leaf_diff({"a/b": 1, "c~d": 1}, {"a/b": 2, "c~d": 2})
    assert [f["field_path"] for f in out] == ["/a~1b", "/c~0d"]
    assert leaf_diff(1, 2) == [{"field_path": "", "change": "changed", "before": 1, "after": 2}]
