"""공정 버전 비교(순수 함수). 기준: CR-backend-20261026-be05 §2-2.

두 버전은 복제 때 노드·간선 id가 바뀌므로 **node_key / edge_key**로 맞춘다. 그래서 id 자체와
간선 끝점 id는 비교하지 않고, 끝점은 `node_key`로 바꿔 비교한다. 값은 입력 그대로(문자열 decimal 유지)
비교하며 unknown ↔ known 같은 모드 변화도 변경으로 나온다. before는 against(기준), after는 target.
"""

from typing import Any

NODE_FIELDS = ("kind", "label", "asset_id", "display_order")
HEADER_FIELDS = ("raw_unit_spec", "finished_unit_spec", "notes")


def _pointer(parts: list[str]) -> str:
    return "/" + "/".join(p.replace("~", "~0").replace("/", "~1") for p in parts)


def leaf_diff(before: Any, after: Any, path: list[str] | None = None) -> list[dict]:
    """JSON 값 두 개의 차이를 리프(객체 키 단위) 경로로 나열한다. 리스트는 통째로 한 값으로 비교한다."""
    path = path or []
    if isinstance(before, dict) and isinstance(after, dict):
        out: list[dict] = []
        for key in sorted(set(before) | set(after)):
            if key not in after:
                out.append(_field(path + [key], "removed", before[key], None))
            elif key not in before:
                out.append(_field(path + [key], "added", None, after[key]))
            else:
                out.extend(leaf_diff(before[key], after[key], path + [key]))
        return out
    if before == after:
        return []
    return [_field(path, "changed", before, after)]


def _field(path: list[str], change: str, before: Any, after: Any) -> dict:
    return {"field_path": _pointer(path) if path else "", "change": change,
            "before": before, "after": after}


def _step_view(step: dict | None) -> dict | None:
    """자원 요구를 role_key, 후보를 asset_id로 키를 잡아 경로가 순서에 의존하지 않게 한다."""
    if step is None:
        return None
    view = {k: v for k, v in step.items() if k != "resources"}
    view["resources"] = {
        r["role_key"]: {
            **{k: v for k, v in r.items() if k not in ("role_key", "candidates")},
            "candidates": {c["asset_id"]: {"eligibility_status": c["eligibility_status"]}
                           for c in r["candidates"]},
        } for r in step["resources"]}
    return view


def diff_versions(target: dict, against: dict) -> dict:
    """target/against: {"header": {...}, "nodes": [...], "edges": [...]} (repo.load_graph 모양).

    반환: header·nodes{added,removed,changed}·steps{changed}·edges{added,removed,changed}·summary.
    """
    header = []
    for name in HEADER_FIELDS:
        header.extend(leaf_diff({name: against["header"][name]}, {name: target["header"][name]}))

    t_nodes = {n["node_key"]: n for n in target["nodes"]}
    a_nodes = {n["node_key"]: n for n in against["nodes"]}
    t_key_of = {n["id"]: n["node_key"] for n in target["nodes"]}
    a_key_of = {n["id"]: n["node_key"] for n in against["nodes"]}

    nodes_changed, steps_changed = [], []
    for key in sorted(t_nodes.keys() & a_nodes.keys()):
        before, after = a_nodes[key], t_nodes[key]
        fields = leaf_diff({f: before[f] for f in NODE_FIELDS}, {f: after[f] for f in NODE_FIELDS})
        if fields:
            nodes_changed.append({"node_key": key, "fields": fields})
        step_fields = leaf_diff(_step_view(before["step"]) or {}, _step_view(after["step"]) or {})
        if step_fields:
            steps_changed.append({"node_key": key, "fields": step_fields})

    t_edges = {e["edge_key"]: e for e in target["edges"]}
    a_edges = {e["edge_key"]: e for e in against["edges"]}

    def edge_view(edge: dict, key_of: dict) -> dict:
        return {"edge_kind": edge["edge_kind"], "movement_rule": edge["movement_rule"],
                "from_node_key": key_of[edge["from_node_id"]],
                "to_node_key": key_of[edge["to_node_id"]]}

    edges_changed = []
    for key in sorted(t_edges.keys() & a_edges.keys()):
        fields = leaf_diff(edge_view(a_edges[key], a_key_of), edge_view(t_edges[key], t_key_of))
        if fields:
            edges_changed.append({"edge_key": key, "fields": fields})

    result = {
        "header": header,
        "nodes": {"added": [t_nodes[k] for k in sorted(t_nodes.keys() - a_nodes.keys())],
                  "removed": [a_nodes[k] for k in sorted(a_nodes.keys() - t_nodes.keys())],
                  "changed": nodes_changed},
        "steps": {"changed": steps_changed},
        "edges": {"added": [t_edges[k] for k in sorted(t_edges.keys() - a_edges.keys())],
                  "removed": [a_edges[k] for k in sorted(a_edges.keys() - t_edges.keys())],
                  "changed": edges_changed},
    }
    added = len(result["nodes"]["added"]) + len(result["edges"]["added"])
    removed = len(result["nodes"]["removed"]) + len(result["edges"]["removed"])
    changed = (len({c["node_key"] for c in nodes_changed + steps_changed}) + len(edges_changed)
               + (1 if header else 0))
    result["summary"] = {"added": added, "removed": removed, "changed": changed,
                         "identical": added == removed == changed == 0}
    return result
