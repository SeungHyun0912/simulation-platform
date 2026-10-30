"""CR be20: 공정 그래프에서 이동 구간을 뽑는 규칙(DB 불필요)."""

from simulation_platform.domain.process_moves import derive_moves


def node(nid, kind, asset=None, op=None, cands=()):
    step = None if op is None else {"operation_type": op,
                                    "resources": [{"candidates": [{"asset_id": c} for c in cands]}]}
    return {"id": nid, "node_key": nid, "kind": kind, "asset_id": asset, "step": step}


def edge(key, a, b, mode="unknown", kind="material"):
    return {"edge_key": key, "from_node_id": a, "to_node_id": b, "edge_kind": kind, "movement_rule": {"mode": mode}}


def test_moves_go_between_located_nodes_through_unlocated_ones_and_transports():
    nodes = [node("src", "source"), node("st4", "buffer", "ST-004"),
             node("braid", "operation", op="split_length", cands=["EQ-003", "EQ-004"]),
             node("done", "milestone"), node("st12", "buffer", "ST-012"),
             node("fork", "operation", op="transport_manual", cands=["FL-001"]), node("st13", "buffer", "ST-013"),
             node("inspect", "operation", op="inspect"), node("sink", "sink")]
    edges = [edge("e1", "src", "st4"), edge("e2", "st4", "braid", "network_route"), edge("e3", "braid", "done"),
             edge("e4", "done", "st12", "unknown"), edge("e5", "st12", "fork"), edge("e6", "fork", "st13"),
             edge("e7", "st13", "inspect"), edge("e8", "inspect", "sink"), edge("p1", "st4", "st13", kind="precedence")]
    moves = [(m.kind, m.from_node, m.to_node, m.edge_keys, m.movement_mode, m.step_node) for m in derive_moves(nodes, edges)]
    assert moves == [
        ("move", "st4", "braid", ["e2"], "network_route", None),  # 공간 → 설비(후보 2대)
        ("move", "braid", "st12", ["e3", "e4"], "unknown", None),  # 완료 표시를 거쳐 공간으로
        ("transport", "st12", "st13", ["e5", "e6"], None, "fork"),  # 운반 단계를 지나면 운반 자원 이동
    ]  # 위치 없는 원자재 입고(src)·작업자 검사(inspect)·출고(sink, 자산 없음)는 이동의 끝이 아니다; 선후 간선은 뺀다
