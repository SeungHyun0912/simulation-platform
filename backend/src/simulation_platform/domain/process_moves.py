"""공정 그래프에서 물건이 옮겨 가는 구간(이동)을 뽑는다(CR be20). HTTP·ORM에 의존하지 않는다.

- **위치**: 자산이 있는 공간 노드(입고·대기·출고)와 후보 설비가 있는 작업 단계(운반 제외). 배치판의 포트로 이어진다.
- 위치가 없는 노드(완료 표시·합류·작업자만 쓰는 단계 등)는 거쳐 간다.
- **운반 단계**(transport_manual)를 지나는 이동은 운반 자원 이동이다(`kind=transport`, 운반 자원 = 그 단계의 후보 설비).
  그 밖의 이동은 사람 이동이다(`kind=move`, 간선 이동 조건 `movement_rule.mode`를 함께 준다).
- 선후 관계 간선(precedence)은 물건이 옮겨 가지 않으므로 뺀다.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

TRANSPORT = "transport_manual"
SPACE_KINDS = ("source", "buffer", "sink")


@dataclass
class Move:
    kind: str  # transport | move
    from_node: str  # node id
    to_node: str
    edge_keys: list[str] = field(default_factory=list)
    movement_mode: str | None = None  # 사람 이동의 첫 간선 이동 조건
    step_node: str | None = None  # 운반 단계 node id


def _candidates(node: Mapping) -> list[str]:
    step = node.get("step") or {}
    return [c["asset_id"] for r in step.get("resources", []) for c in r.get("candidates", [])]


def is_transport(node: Mapping) -> bool:
    return node["kind"] == "operation" and (node.get("step") or {}).get("operation_type") == TRANSPORT


def located(node: Mapping) -> bool:
    if node["kind"] in SPACE_KINDS:
        return node.get("asset_id") is not None
    return node["kind"] == "operation" and not is_transport(node) and bool(_candidates(node))


def candidates(node: Mapping) -> list[str]:
    return _candidates(node)


def derive_moves(nodes: Sequence[Mapping], edges: Sequence[Mapping]) -> list[Move]:
    by_id = {n["id"]: n for n in nodes}
    order = {n["id"]: (n.get("display_order") or 0, i) for i, n in enumerate(nodes)}  # 공정 순서(표시 순서 → 목록 순서)
    out: dict[str, list[Mapping]] = {}
    for e in sorted(edges, key=lambda e: e["edge_key"]):
        if e["edge_kind"] != "precedence":
            out.setdefault(e["from_node_id"], []).append(e)
    moves: list[Move] = []
    seen: set[tuple] = set()
    for start in sorted((n["id"] for n in nodes if located(n)), key=order.get):
        stack = [(start, [], None, None, frozenset([start]))]
        while stack:
            node_id, keys, mode, step, visited = stack.pop()
            for e in reversed(out.get(node_id, [])):
                target = by_id.get(e["to_node_id"])
                if target is None or target["id"] in visited:
                    continue
                now_keys = [*keys, e["edge_key"]]
                now_mode = mode if mode is not None else (e.get("movement_rule") or {}).get("mode")
                now_step = step if step is not None or not is_transport(target) else target["id"]
                if located(target):
                    key = (start, target["id"], now_step)
                    if key not in seen:
                        seen.add(key)
                        moves.append(Move("transport" if now_step else "move", start, target["id"], now_keys,
                                          None if now_step else now_mode, now_step))
                    continue
                stack.append((target["id"], now_keys, now_mode, now_step, visited | {target["id"]}))
    return moves
