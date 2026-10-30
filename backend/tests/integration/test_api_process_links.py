"""BE-23(CR be20): 공정 ↔ 배치판 연결, 시나리오의 배치판 선택·이동 설정(속도 기본 4 km/h)을 실제 PostgreSQL로 검증한다."""

from test_api_layouts import new_draft, ports_of, put
from test_api_scenarios import ctx, etag, new_scenario, ok, patch, version_of  # noqa: F401


def approved_layout(client, ctx, content):
    draft = new_draft(client, ctx)
    saved = ok(put(client, ctx, draft, content))
    return ok(client.post(f"{ctx['base']}/layout-versions/{draft['id']}/approve",
                          headers=etag(ctx, "admin", saved["row_version"])))


def layout_content(ctx, x2="60", y2="80"):
    st, eq = ctx["_ports"]
    return {"points": [{"point_key": "P1", "x_m": "0", "y_m": "0"}, {"point_key": "P2", "x_m": x2, "y_m": y2}],
            "port_points": [{"port_id": st["ACCESS"], "point_key": "P1"}, {"port_id": eq["IN"], "point_key": "P2"}],
            "aisles": [{"aisle_key": "W1", "points": ["P1", "P2"]}]}


def test_process_moves_are_linked_to_layout_paths_with_default_and_scenario_speeds(client, ctx):
    ctx["_ports"] = ports_of(client, ctx, ctx["storage"]), ports_of(client, ctx, ctx["equipment"])
    layout = approved_layout(client, ctx, layout_content(ctx))
    url = f"{ctx['base']}/layout-versions/{layout['id']}/process-links"
    [link] = ok(client.get(url, params={"process_version_id": ctx["process"]}, headers=ctx["viewer"]))
    assert link["process_version_id"] == ctx["process"] and link["product_id"] == ctx["product"]
    [move] = link["moves"]  # 대기(저장공간) → 가공(설비). 원자재·완제품·끝은 위치가 없어 이동의 끝이 아니다
    assert (move["kind"], move["from_node_key"], move["to_node_key"], move["edge_keys"]) == ("move", "wait", "work", ["wait-work"])
    assert (move["speed_key"], move["speed_kmh"], move["speed_defaulted"], move["handling_min"]) == ("person", "4", True, None)
    [pair] = move["pairs"]
    assert (pair["from_role"], pair["to_role"], pair["points"], pair["length_m"]) == ("ACCESS", "IN", ["P1", "P2"], "100.0")
    assert (pair["travel_min"], pair["total_min"], pair["source"]) == ("1.50", "1.50", "computed")  # 100m ÷ 66.67m/분
    every = ok(client.get(url, headers=ctx["viewer"]))  # 생략하면 제품마다 현재 승인본
    assert ctx["process"] in [x["process_version_id"] for x in every]

    # 시나리오에서 배치판을 고르고 속도를 바꾸면, 그 시나리오의 설정으로 계산된다
    scenario = new_scenario(client, ctx)
    version = version_of(client, ctx, scenario)
    saved = ok(patch(client, ctx, version, {"layout_version_id": layout["id"],
                                            "travel_rule": {"speeds_kmh": {"person": "6"}, "carrier_handling_minutes": "2"}}))
    assert saved["layout_version_id"] == layout["id"]
    assert saved["travel_rule"] == {"speeds_kmh": {"person": "6"}, "carrier_handling_minutes": "2"}
    [link] = ok(client.get(url, params={"process_version_id": ctx["process"], "scenario_version_id": version["id"]},
                           headers=ctx["viewer"]))
    move = link["moves"][0]
    assert (move["speed_kmh"], move["speed_defaulted"], move["pairs"][0]["travel_min"]) == ("6", False, "1.00")

    # 배치판(점)을 고치면 다음 조회부터 자동으로 다시 계산된다(새 배치판 승인 → 시나리오 갱신으로 최신 배치판)
    newer = approved_layout(client, ctx, layout_content(ctx, "30", "40"))
    refreshed = ok(client.post(f"{ctx['base']}/scenario-versions/{version['id']}/refresh",
                               headers=etag(ctx, "editor", saved["row_version"])))
    assert refreshed["layout_change"] == {"from_layout_version_id": layout["id"], "to_layout_version_id": newer["id"],
                                          "to_version_no": newer["version_no"]}
    assert refreshed["version"]["layout_version_id"] == newer["id"]
    [link] = ok(client.get(f"{ctx['base']}/layout-versions/{newer['id']}/process-links",
                           params={"process_version_id": ctx["process"]}, headers=ctx["viewer"]))
    assert link["moves"][0]["pairs"][0]["length_m"] == "50.0"


def test_a_scenario_can_only_pick_an_approved_layout_of_its_project(client, ctx):
    ctx["_ports"] = ports_of(client, ctx, ctx["storage"]), ports_of(client, ctx, ctx["equipment"])
    draft = new_draft(client, ctx)
    version = version_of(client, ctx, new_scenario(client, ctx))
    r = patch(client, ctx, version, {"layout_version_id": draft["id"]})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["rule_id"] == "SCN-REF-006"
    r = patch(client, ctx, version, {"layout_version_id": "00000000-0000-4000-8000-000000000001"})
    assert r.status_code == 422 and r.json()["error"]["details"][0]["rule_id"] == "SCN-REF-005"
    r = patch(client, ctx, version, {"travel_rule": {"speeds_kmh": {"person": "0"}}})
    assert r.status_code == 422  # 속도는 0보다 커야 한다
    r = patch(client, ctx, version, {"travel_rule": None})
    assert r.status_code == 422  # null로 지울 수 없다(빈 객체 {}는 기본값으로 돌아간다)
    assert client.get(f"{ctx['base']}/layout-versions/{draft['id']}/process-links",
                      params={"process_version_id": "00000000-0000-4000-8000-000000000002"},
                      headers=ctx["viewer"]).status_code == 404
