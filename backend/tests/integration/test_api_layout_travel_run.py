"""BE-24(CR be20): 시나리오가 배치판을 고르면 실행 입력에 배치판·이동 설정이 고정되고, 사람 이동(network_route)이
경로 ÷ 속도만큼 걸린다. 경로가 없으면 사전검증이 막는다. 실제 PostgreSQL + worker."""

import itertools
import uuid
from fractions import Fraction

from sqlalchemy.orm import sessionmaker
from test_api_layouts import new_draft, ports_of, put
from test_api_run_events import isolate
from test_api_runs import request_run, worker_settings  # noqa: F401
from test_api_scenarios import ctx, etag, new_scenario, ok, patch, runnable_step, version_of  # noqa: F401

from simulation_platform.worker.service import process_one


def network_route_process(client, ctx):
    """원자재 → 대기(저장공간) → 가공(설비) → 완제품 → 끝. 대기 → 가공은 사람이 배치판 경로로 옮긴다(network_route)."""
    product = ok(client.post(f"{ctx['base']}/products", json={"code": f"P-{uuid.uuid4().hex[:6]}", "name": "제품"},
                             headers=ctx["admin"]), 201)["id"]
    version = ok(client.post(f"{ctx['base']}/products/{product}/process-versions", headers=ctx["editor"]), 201)
    uid = lambda: str(uuid.uuid4())
    nodes = [{"id": uid(), "node_key": "src", "kind": "source", "label": "원자재"},
             {"id": uid(), "node_key": "wait", "kind": "buffer", "label": "대기", "asset_id": ctx["storage"]},
             {"id": uid(), "node_key": "work", "kind": "operation", "label": "가공", "step": runnable_step(ctx["equipment"])},
             {"id": uid(), "node_key": "complete", "kind": "milestone", "label": "완제품"},
             {"id": uid(), "node_key": "sink", "kind": "sink", "label": "끝"}]
    edges = [{"id": uid(), "edge_key": f"{a['node_key']}-{b['node_key']}", "from_node_id": a["id"], "to_node_id": b["id"],
              **({"movement_rule": {"mode": "network_route"}} if a["node_key"] == "wait" else {})}
             for a, b in itertools.pairwise(nodes)]
    graph = ok(client.put(f"{ctx['base']}/process-versions/{version['id']}/graph",
                          json={"nodes": nodes, "edges": edges, "completion_node_id": nodes[3]["id"]},
                          headers=etag(ctx, "editor", version["row_version"])))
    row = graph["row_version"]
    for step, who in (("submit", "editor"), ("approve", "admin")):
        row = ok(client.post(f"{ctx['base']}/process-versions/{version['id']}/{step}", headers=etag(ctx, who, row)))["row_version"]
    return product, version["id"]


def approved_layout(client, ctx, mapped=True):
    st, eq = ports_of(client, ctx, ctx["storage"]), ports_of(client, ctx, ctx["equipment"])
    content = {"points": [{"point_key": "P1", "x_m": "0", "y_m": "0"}, {"point_key": "P2", "x_m": "100", "y_m": "0"}],
               "port_points": [{"port_id": st["ACCESS"], "point_key": "P1"}]
               + ([{"port_id": eq["IN"], "point_key": "P2"}] if mapped else []),
               "aisles": [{"aisle_key": "W1", "points": ["P1", "P2"]}]}
    draft = new_draft(client, ctx)
    saved = ok(put(client, ctx, draft, content))
    return ok(client.post(f"{ctx['base']}/layout-versions/{draft['id']}/approve",
                          headers=etag(ctx, "admin", saved["row_version"])))


def scenario_with(client, ctx, product, process, layout_id, rule):
    version = version_of(client, ctx, new_scenario(client, ctx))
    body = {"products": [{"product_id": product, "process_version_id": process,
                          "arrivals": [{"at_min": "0", "count": 1, "length_m": "1000"}]}]}
    if layout_id is not None:
        body |= {"layout_version_id": layout_id, "travel_rule": rule}
    return ok(patch(client, ctx, version, body))


def run_to_end(client, ctx, db, engine, worker_settings, version):
    approved = ok(client.post(f"{ctx['base']}/scenario-versions/{version['id']}/approve",
                              headers=etag(ctx, "admin", version["row_version"])))
    run = ok(request_run(client, ctx, approved["id"]), 202)
    isolate(db, ctx["pid"])
    assert process_one(sessionmaker(engine), worker_settings, "w-travel") == "completed"
    return ok(client.get(f"{ctx['base']}/runs/{run['id']}", headers=ctx["viewer"]))


def test_people_moves_on_network_route_edges_take_path_over_speed_when_a_layout_is_chosen(
        client, ctx, db, engine, worker_settings):
    product, process = network_route_process(client, ctx)
    layout = approved_layout(client, ctx)
    plain = run_to_end(client, ctx, db, engine, worker_settings, scenario_with(client, ctx, product, process, None, None))
    assert Fraction(plain["result"]["end_time"]["exact"]) == Fraction(100, 3)  # 1,000m ÷ 30 m/분, 배치판 없으면 이동 시간 없음
    version = scenario_with(client, ctx, product, process, layout["id"], {"speeds_kmh": {"person": "6"}})
    check = ok(client.post(f"{ctx['base']}/scenario-versions/{version['id']}/validate", headers=ctx["viewer"]))
    assert check["runnable"] is True
    run = run_to_end(client, ctx, db, engine, worker_settings, version)
    assert Fraction(run["result"]["end_time"]["exact"]) == 1 + Fraction(100, 3)  # 100m ÷ 6 km/h(100 m/분) = 1분 걸어옴
    assert run["engine_version"] == "c0.4"
    snapshot = ok(client.get(f"{ctx['base']}/runs/{run['id']}/input", headers=ctx["viewer"]))["snapshot"]
    assert snapshot["travel"]["layout_version_id"] == layout["id"] and snapshot["travel"]["rule"] == {"speeds_kmh": {"person": "6"}}
    assert "travel" not in ok(client.get(f"{ctx['base']}/runs/{plain['id']}/input", headers=ctx["viewer"]))["snapshot"]
    moved = ok(client.get(f"{ctx['base']}/runs/{run['id']}/events", params={"event_type": "PERSON_MOVED"},
                          headers=ctx["viewer"]))
    assert [(e["source"], e["destination"], Fraction(e["quantities"]["minutes"])) for e in moved] == [("wait", "work", 1)]


def test_a_missing_layout_path_makes_the_scenario_not_runnable(client, ctx):
    product, process = network_route_process(client, ctx)
    layout = approved_layout(client, ctx, mapped=False)  # 설비 IN 포트가 점에 매핑되지 않음
    version = scenario_with(client, ctx, product, process, layout["id"], {})
    check = ok(client.post(f"{ctx['base']}/scenario-versions/{version['id']}/validate", headers=ctx["viewer"]))
    assert check["runnable"] is False
    [found] = [p for p in check["products"] if p["process_version_id"] == process]
    assert "LAYOUT_PATH_UNREACHABLE" in {i["rule_id"] for i in found["compile_issues"]}
