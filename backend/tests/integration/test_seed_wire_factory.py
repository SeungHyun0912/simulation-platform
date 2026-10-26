"""실제 기준정보 시드(docs/domain/08_catalog_processes.md)가 문서의 표·공정 값과 일치하고 멱등인지 확인한다."""

import re
import sys
import uuid
from pathlib import Path

import pytest
from helpers import headers

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import seed_wire_factory

API = "/api/v1"
DOC = Path(__file__).resolve().parents[3] / "docs" / "domain" / "08_catalog_processes.md"


@pytest.fixture(scope="module")
def wire(engine):
    return seed_wire_factory.seed(engine)


def admin(wire):
    return headers(wire["users"]["admin"])


def get(client, wire, path, **params):
    r = client.get(f"{API}/projects/{wire['project']}{path}", params=params, headers=admin(wire))
    assert r.status_code == 200, r.text
    return r.json()


def all_assets(client, wire):
    out, cursor = [], None
    while True:
        page = get(client, wire, "/assets", limit=50, **({"cursor": cursor} if cursor else {}))
        out += page["data"]
        cursor = page["page"]["next_cursor"]
        if not cursor:
            return out


def doc_tables():
    """문서 §2(설비)·§3(공간) 표를 읽는다: 설비 [(시작, 끝, 이름, 대수)], 공간 [(코드, 이름)]."""
    text = DOC.read_text(encoding="utf-8")
    equipment = [(int(a), int(b or a), name.strip(), int(n)) for a, b, name, n in re.findall(
        r"^\| EQ-(\d{3})(?:~EQ-(\d{3}))? \| ([^|]+) \| (\d+) \|", text, re.MULTILINE)]
    spaces = [(code, name.strip()) for code, name in re.findall(
        r"^\| (ST-\d{3}) \| ([^|]+) \|", text, re.MULTILINE)]
    return equipment, spaces


def graph_of(client, wire, code):
    products = {p["code"]: p for p in get(client, wire, "/products", limit=50)["data"]}
    version = products[code]["latest_process_version"]
    graph = get(client, wire, f"/process-versions/{version['id']}/graph")["data"]
    detail = get(client, wire, f"/process-versions/{version['id']}")["data"]
    return detail, graph, {n["node_key"]: n for n in graph["nodes"]}


def codes_of(client, wire, node):
    assets = {a["id"]: a["code"] for a in all_assets(client, wire)}
    return [assets[c["asset_id"]] for r in node["step"]["resources"] for c in r["candidates"]]


# --- 기준정보: 문서 표와 대조 ------------------------------------------------------------------

def test_assets_match_document_tables_exactly(client, wire):
    assets = {a["code"]: a for a in all_assets(client, wire)}
    equipment, spaces = doc_tables()
    assert sum(n for *_, n in equipment) == 96 and len(spaces) == 22  # 문서 자체의 합계
    for first, last, name, n in equipment:
        assert last - first + 1 == n  # 문서 표의 범위와 대수가 일치
        for number in range(first, last + 1):
            asset = assets[f"EQ-{number:03d}"]
            assert asset["kind"] == "equipment" and asset["name"] == name
    for code, name in spaces:
        assert assets[code]["name"] == name
        assert assets[code]["kind"] == ("dock" if code in ("ST-021", "ST-022") else "storage")
    assert len(assets) == 118 and not (set(assets) - {f"EQ-{n:03d}" for n in range(1, 97)}
                                       - {c for c, _ in spaces})


def test_ports_and_nothing_unknown_is_invented(client, wire, db):
    ports = db.scalar("select count(*) from asset_port where project_id = :p", p=wire["project"])
    assert ports == 214  # 설비 96×2(IN/OUT) + 공간 22×1(ACCESS), 문서 §9-5
    assets = all_assets(client, wire)
    assert all(a["latest_revision"] is None for a in assets)  # 용량·좌표·운반 등 미정을 값으로 만들지 않았다
    assert db.scalar("select count(*) from asset where project_id = :p and archived_at is not null",
                     p=wire["project"]) == 0


def test_pagination_works_for_the_118_assets(client, wire):
    first = get(client, wire, "/assets", limit=50)
    assert len(first["data"]) == 50 and first["page"]["next_cursor"]
    assert len(all_assets(client, wire)) == 118
    kinds = get(client, wire, "/assets", kind="dock", limit=50)["data"]
    assert sorted(a["code"] for a in kinds) == ["ST-021", "ST-022"]


def test_products_and_six_draft_process_versions(client, wire):
    products = get(client, wire, "/products", limit=50)["data"]
    assert [p["code"] for p in products] == [f"P0{n}" for n in range(1, 7)]
    assert [p["name"] for p in products][3:] == ["HV_조사_태선(AL)", "HV_복합_세선(CU)", "HV_복합_태선(CU)_상품"]
    for product in products:
        latest = product["latest_process_version"]
        assert latest["status"] == "draft" and latest["version_no"] == 1  # 모든 공정은 draft
        assert product["current_process_version"] is None


# --- 공정: 문서 값 대조 ----------------------------------------------------------------------

def proc(node):
    return node["step"]["timing_rule"]["processing"]


def test_silicon_products_share_one_route_with_different_values(client, wire):
    expected = {"P01": ("3000", "1000", 3, "300", 10), "P02": ("4000", "1000", 4, "500", 8),
                "P03": ("5000", "1000", 5, "500", 10)}
    keys = None
    for code, (raw, first, bobbins, last, units) in expected.items():
        version, graph, nodes = graph_of(client, wire, code)
        keys = keys or list(nodes)
        assert list(nodes) == keys  # 같은 경로 모양
        assert list(nodes) == ["src", "st-002", "insulate", "st-004", "braid", "tape", "sheath", "st-003",
                               "inspect", "sink"]
        assert version["raw_unit_spec"]["length_m"] == {"mode": "known", "value": raw}
        assert version["raw_unit_spec"]["weight_kg"]["value"] == "2000"  # 2t 롤
        assert version["finished_unit_spec"]["length_m"]["value"] == last
        out = nodes["insulate"]["step"]["output_rule"]
        assert (out["length_m"]["value"], out["unit_count"]["value"]) == (first, bobbins)
        out = nodes["sheath"]["step"]["output_rule"]
        assert (out["length_m"]["value"], out["unit_count"]["value"]) == (last, units)
        assert [proc(nodes[k])["speed_m_per_min"]["value"] for k in ("insulate", "braid", "tape", "sheath")] \
            == ["20", "1.5", "20", "15"]
        assert nodes["inspect"]["step"]["resources"] == []  # 이 3종의 검사 자원은 확인된 바 없다
        assert proc(nodes["inspect"])["duration_min"]["value"] == "10"
        # 편조·테이핑·쉬스 사이에 저장공간을 임의로 만들지 않았다
        order = [n["node_key"] for n in graph["nodes"]]
        assert order.index("tape") == order.index("braid") + 1 and order.index("sheath") == order.index("tape") + 1
    _, _, p01 = graph_of(client, wire, "P01")
    assert p01["sheath"]["step"]["residual_rule"]["mode"] == "carry_same_product"
    assert p01["sheath"]["step"]["residual_rule"]["on_product_change"] == "discard"
    _, _, p02 = graph_of(client, wire, "P02")
    assert p02["sheath"]["step"]["residual_rule"]["mode"] == "unknown"  # 문서에 없는 규칙은 만들지 않는다
    assert codes_of(client, wire, p01["insulate"]) == ["EQ-001"]
    assert codes_of(client, wire, p01["braid"]) == [f"EQ-{n:03d}" for n in range(3, 11)]


def test_p04_al_route_has_direct_feed_supply_wait_and_abstract_yield(client, wire):
    version, graph, nodes = graph_of(client, wire, "P04")
    assert version["raw_unit_spec"]["weight_kg"]["value"] == "2000"
    assert version["finished_unit_spec"]["length_m"]["value"] == "4000"
    assert [k for k in nodes if nodes[k]["kind"] == "operation"] == [
        "multi", "double", "single-pre", "single-feed", "single-main", "forklift", "amr", "insulate",
        "irradiate", "rewind", "inspect"]
    speeds = {k: proc(nodes[k]).get("speed_m_per_min", {}).get("value")
              for k in ("multi", "double", "single-pre", "single-main", "insulate", "irradiate", "rewind")}
    assert speeds == {"multi": "100", "double": "100", "single-pre": "4.4", "single-main": "32",
                      "insulate": "50", "irradiate": "110", "rewind": "50"}
    assert nodes["multi"]["step"]["timing_rule"]["setup"]["duration_min"]["value"] == "120"
    feed = nodes["single-feed"]["step"]
    assert feed["operation_type"] == "supply_delay" and feed["timing_rule"]["processing"] == {"kind": "none"}
    assert feed["timing_rule"]["precondition_delay"]["duration_min"]["value"] == "120"
    assert feed["handoff_rule"]["mode"] == "total_batch"  # 싱글-12만 전체 준비 후 공급
    main = nodes["single-main"]["step"]
    assert main["operation_type"] == "configured_yield"
    assert (main["output_rule"]["unit_count"]["value"], main["output_rule"]["accounting_mode"]) == (
        10, "abstract_yield")
    ids = {n["node_key"]: n["id"] for n in graph["nodes"]}
    edges = {e["edge_key"]: e for e in graph["edges"]}
    assert edges["single-pre-single-main"]["movement_rule"]["mode"] == "direct_feed"  # ST-019로 돌아가지 않음
    assert edges["single-feed-single-main"]["edge_kind"] == "supply"
    assert edges["st-019-single-pre"]["from_node_id"] == ids["st-019"]
    assert nodes["complete"]["kind"] == "milestone"
    assert [k for k, n in nodes.items() if n["kind"] == "milestone"] == ["complete"]
    assert codes_of(client, wire, nodes["single-pre"]) == ["EQ-094"]
    assert codes_of(client, wire, nodes["double"]) == [f"EQ-{n:03d}" for n in range(90, 94)]
    worker = nodes["inspect"]["step"]["resources"][0]
    assert (worker["resource_kind"], worker["capacity_mode"]) == ("worker", "unlimited")  # 확정: 작업자 무제한
    # 재료 spec(계약 0.6.0): 12가닥 공급, 메인의 두 입력(선행 1 + 공급 12), 간선 연결, 완제품 지정
    specs = {k: {m["spec_key"]: m for m in n["step"]["material_specs"]} for k, n in nodes.items()
             if n["kind"] == "operation" and n["step"]["material_specs"]}
    assert specs["multi"]["in"]["weight_kg"]["value"] == "2000" and specs["multi"]["in"]["unit_count"]["value"] == 2
    assert specs["multi"]["out"]["length_m"]["value"] == "40000" and specs["multi"]["out"]["unit_count"]["value"] == 12
    assert specs["single-feed"]["in"]["unit_count"]["value"] == 12  # 4,000m×12보빈을 받아
    feed_out = specs["single-feed"]["out"]
    assert feed_out["strand_count"]["value"] == 12 and feed_out["unit_count"]["mode"] == "unknown"  # 12가닥 공급
    main_in = {k: m for k, m in specs["single-main"].items() if m["direction"] == "input"}
    assert set(main_in) == {"pre", "feed"} and main_in["feed"]["strand_count"]["value"] == 12
    assert specs["single-main"]["out"]["unit_count"]["value"] == 10 and specs["single-main"]["out"]["length_m"]["value"] == "4000"
    links = {k: (e["source_output_spec_key"], e["target_input_spec_key"]) for k, e in edges.items()}
    assert links["single-pre-single-main"] == ("out", "pre") and links["single-feed-single-main"] == ("out", "feed")
    assert links["st-019-single-pre"] == (None, "in") and links["st-019-single-feed"] == (None, "in")
    assert graph["completion_node_id"] == ids["complete"]  # 재권취 완료가 완제품


def test_p05_cu_fine_wire_route_and_corrections(client, wire):
    version, graph, nodes = graph_of(client, wire, "P05")
    assert version["raw_unit_spec"]["weight_kg"]["value"] == "3300"
    assert version["finished_unit_spec"]["length_m"]["value"] == "600"
    ops = [k for k in nodes if nodes[k]["kind"] == "operation"]
    assert ops == ["draw", "multi", "strand", "insulate", "irradiate-1", "forklift", "braid", "tape", "amr",
                   "sheath", "irradiate-2", "rewind", "inspect"]
    assert nodes["src"]["asset_id"] is None  # ST-005는 대응 제안일 뿐 위치를 확정하지 않았다
    assert proc(nodes["draw"])["duration_min"]["value"] == "22"
    assert nodes["draw"]["step"]["output_rule"]["weight_kg"]["value"] == "1000"
    assert nodes["draw"]["step"]["output_rule"]["unit_count"]["value"] == 36
    # 정정 1: 연선은 100,000→100,000(24,000×4 분할 아님), 정정 2: 절연에서 24,000×4 분할, 정정 3: 1차 조사는 1→1
    assert nodes["strand"]["step"]["output_rule"]["mode"] == "pass_through"
    insulate = nodes["insulate"]["step"]["output_rule"]
    assert (insulate["mode"], insulate["length_m"]["value"], insulate["unit_count"]["value"]) == (
        "split_length", "24000", 4)
    assert nodes["irradiate-1"]["step"]["output_rule"]["mode"] == "pass_through"
    rewind = nodes["rewind"]["step"]["output_rule"]
    assert (rewind["length_m"]["value"], rewind["unit_count"]["value"]) == ("600", 20)
    assert {k: nodes[k]["step"]["timing_rule"]["setup"]["duration_min"]["value"]
            for k in ("multi", "strand", "insulate")} == {"multi": "120", "strand": "120", "insulate": "0"}
    assert [proc(nodes[k])["speed_m_per_min"]["value"] for k in ("irradiate-1", "irradiate-2")] == ["206", "195"]
    # 같은 공간(ST-011·ST-012)의 재방문은 노드만 둘이고 자산은 하나다
    assert nodes["st-011-1"]["asset_id"] == nodes["st-011-2"]["asset_id"] is not None
    assert codes_of(client, wire, nodes["irradiate-1"]) == codes_of(client, wire, nodes["irradiate-2"]) == ["EQ-036"]
    assert codes_of(client, wire, nodes["braid"]) == [f"EQ-{n:03d}" for n in range(39, 81)]
    assert codes_of(client, wire, nodes["tape"]) == [f"EQ-{n:03d}" for n in range(81, 85)]
    assert {e["edge_key"] for e in graph["edges"] if e["movement_rule"]["mode"] != "unknown"} == set()


def test_p06_has_no_taping_and_uses_sheath_extruders_for_first_insulation(client, wire):
    version, _graph, nodes = graph_of(client, wire, "P06")
    assert "tape" not in nodes and "st-022" in nodes  # 테이핑 공정 없음(제품5 경로 복제 금지)
    assert version["raw_unit_spec"]["length_m"]["value"] == "2000"
    assert codes_of(client, wire, nodes["insulate"]) == ["EQ-034", "EQ-035"]  # EQ-032~033이 아니다
    out = nodes["insulate"]["step"]["output_rule"]
    assert (out["length_m"]["value"], out["unit_count"]["value"]) == ("1000", 2)
    assert nodes["irradiate-1"]["step"]["output_rule"]["mode"] == "pass_through"  # 1→1, 산출 4 아님
    rewind = nodes["rewind"]["step"]["output_rule"]
    assert (rewind["length_m"]["value"], rewind["unit_count"]["value"]) == ("500", 2)
    assert [proc(nodes[k])["speed_m_per_min"]["value"] for k in
            ("insulate", "irradiate-1", "braid", "sheath", "irradiate-2", "rewind")] == [
        "30", "50", "1.5", "60", "195", "30"]


def test_candidates_are_confirmed_only_for_single_named_equipment(client, wire):
    for code in ("P01", "P04", "P05", "P06"):
        _, graph, _ = graph_of(client, wire, code)
        for node in graph["nodes"]:
            for req in (node["step"] or {}).get("resources", []):
                status = {c["eligibility_status"] for c in req["candidates"]}
                if req["resource_kind"] == "equipment":
                    assert status == ({"confirmed"} if len(req["candidates"]) == 1 else {"unknown"})


def test_every_graph_passes_structure_checks_but_is_not_runnable_yet(client, wire):
    for code in seed_wire_factory.PRODUCTS:
        version, _graph, _ = graph_of(client, wire, code)
        knowledge = client.post(f"{API}/projects/{wire['project']}/process-versions/{version['id']}/validate",
                                params={"scope": "knowledge"}, headers=admin(wire)).json()["data"]
        assert knowledge["error_count"] == 0, (code, knowledge["issues"][:3])  # 구조 오류 없음
        rules = {i["rule_id"] for i in knowledge["issues"]}
        assert "VAL-GRAPH-011" not in rules and "VAL-GRAPH-012" not in rules  # 순환·고립 단계 없음
        run = client.post(f"{API}/projects/{wire['project']}/process-versions/{version['id']}/validate",
                          params={"scope": "run_template"}, headers=admin(wire)).json()["data"]
        assert run["error_count"] > 0  # 미정(준비·운반·입력 규칙 등)이 남아 있어 아직 실행 불가, 숨기지 않는다
        assert not [i for i in run["issues"] if i["rule_id"] == "UNSUPPORTED_HANDLER"]  # handler는 모두 지원 목록


def test_non_member_cannot_see_the_data_and_viewer_can(client, wire, db):
    base = f"{API}/projects/{wire['project']}"
    viewer = headers(wire["users"]["viewer"])
    assert client.get(f"{base}/assets", headers=viewer).status_code == 200
    assert client.get(f"{base}/products", headers=viewer).status_code == 200
    stranger = headers(db.user())  # 프로젝트 구성원이 아닌 사용자는 존재 여부도 모른다(404)
    assert client.get(f"{base}/assets", headers=stranger).status_code == 404
    assert client.get(f"{base}/products", headers=stranger).status_code == 404


def test_seed_is_idempotent_and_does_not_change_row_counts(engine, wire, db):
    def counts():
        return [db.scalar(f"select count(*) from {t} where project_id = :p", p=wire["project"])
                for t in ("asset", "product", "process_version", "flow_node", "flow_edge", "process_step",
                          "resource_requirement", "requirement_candidate", "asset_port")]

    before = counts()
    again = seed_wire_factory.seed(engine)
    assert again["assets"] == {"created": 0}
    assert again["processes"] == {"created": [], "upgraded": []}
    assert counts() == before


def test_cli_refuses_without_confirmation_or_in_production(monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@127.0.0.1:5432/x_test")
    assert seed_wire_factory.main(["seed"]) == 2
    monkeypatch.setenv("APP_ENV", "production")
    assert seed_wire_factory.main(["seed", "--yes"]) == 2
    assert "production" in capsys.readouterr().err


# --- 재료 spec·완제품 지정(계약 0.6.0) ---------------------------------------------------------

def test_p05_and_p06_specs_follow_the_document_tables(client, wire):
    _, graph5, p5 = graph_of(client, wire, "P05")
    spec = {k: {m["spec_key"]: m for m in n["step"]["material_specs"]} for k, n in p5.items()
            if n["kind"] == "operation" and n["step"]["material_specs"]}
    assert set(spec) == {"draw", "multi", "strand", "insulate", "irradiate-1", "braid", "tape", "sheath",
                         "irradiate-2", "rewind", "inspect"}  # 운반 단계에는 spec이 없다
    assert (spec["draw"]["in"]["weight_kg"]["value"], spec["draw"]["in"]["unit_count"]["value"]) == ("3300", 11)
    assert (spec["draw"]["out"]["weight_kg"]["value"], spec["draw"]["out"]["unit_count"]["value"]) == ("1000", 36)
    assert (spec["multi"]["in"]["weight_kg"]["value"], spec["multi"]["in"]["unit_count"]["value"]) == ("1000", 24)
    assert (spec["multi"]["out"]["length_m"]["value"], spec["multi"]["out"]["unit_count"]["value"]) == ("100000", 9)
    assert spec["strand"]["in"]["length_m"] == spec["strand"]["out"]["length_m"]  # 연선은 1→1
    assert (spec["insulate"]["out"]["length_m"]["value"], spec["insulate"]["out"]["unit_count"]["value"]) == ("24000", 4)
    assert spec["draw"]["in"]["length_m"]["mode"] == "unknown"  # 문서에 없는 값은 만들지 않는다
    assert spec["draw"]["in"]["state_code"] == "원자재" and spec["rewind"]["out"]["state_code"] == "재권취 후"
    assert [m["unit_count"]["value"] for m in spec["rewind"].values()] == [1, 20]  # 12,000m×1 → 600m×20
    assert p5["forklift"]["step"]["material_specs"] == [] and p5["amr"]["step"]["material_specs"] == []
    assert graph5["completion_node_id"] == p5["complete"]["id"]
    _, graph6, p6 = graph_of(client, wire, "P06")
    assert p6["insulate"]["step"]["material_specs"][0]["length_m"]["value"] == "2000"
    assert [m["unit_count"]["value"] for m in p6["rewind"]["step"]["material_specs"]] == [1, 2]
    assert [m["length_m"]["value"] for m in p6["inspect"]["step"]["material_specs"]] == ["500", "500"]
    assert graph6["completion_node_id"] == p6["complete"]["id"]


def test_silicon_specs_and_unknown_completion(client, wire):
    for code, raw, last, units in (("P01", "3000", "300", 10), ("P02", "4000", "500", 8),
                                   ("P03", "5000", "500", 10)):
        _, graph, nodes = graph_of(client, wire, code)
        assert graph["completion_node_id"] is None  # 완제품 판정 시점은 문서에 없다 → 미정으로 둔다
        roll = nodes["insulate"]["step"]["material_specs"][0]
        assert (roll["form"], roll["length_m"]["value"], roll["weight_kg"]["value"]) == ("롤", raw, "2000")
        sheath = {m["spec_key"]: m for m in nodes["sheath"]["step"]["material_specs"]}
        assert (sheath["out"]["length_m"]["value"], sheath["out"]["unit_count"]["value"]) == (last, units)
        assert sheath["out"]["quantity_basis"] == "per_lot"  # 1롤분
        assert [m["spec_key"] for m in nodes["inspect"]["step"]["material_specs"]] == ["in", "out"]
    version, _, _ = graph_of(client, wire, "P01")
    run = client.post(f"{API}/projects/{wire['project']}/process-versions/{version['id']}/validate",
                      params={"scope": "run_template"}, headers=admin(wire)).json()["data"]
    assert "VAL-GRAPH-014" in {i["rule_id"] for i in run["issues"] if i["severity"] == "error"}


def test_no_spec_is_left_with_every_quantity_unknown(client, wire):
    """시드가 만든 spec은 모두 문서의 값이 하나 이상 있다(VAL-SPEC-001 경고 없음)."""
    for code in ("P01", "P04", "P05", "P06"):
        version, _, _ = graph_of(client, wire, code)
        issues = client.post(f"{API}/projects/{wire['project']}/process-versions/{version['id']}/validate",
                             params={"scope": "knowledge"}, headers=admin(wire)).json()["data"]["issues"]
        assert "VAL-SPEC-001" not in {i["rule_id"] for i in issues}
        assert "VAL-GRAPH-014" not in {i["rule_id"] for i in issues} or code == "P01"


def strip_new_fields(graph):
    """0.6.0 이전에 만든 공정처럼 spec·간선 연결·완제품 지정을 모두 뺀 그래프."""
    return {"nodes": [{**n, "step": None if n["step"] is None else {
        k: v for k, v in n["step"].items() if k != "material_specs"}} for n in graph["nodes"]],
        "edges": [{k: v for k, v in e.items() if not k.endswith("_spec_key")} for e in graph["edges"]]}


def save(client, wire, version, body):
    r = client.put(f"{API}/projects/{wire['project']}/process-versions/{version['id']}/graph", json=body,
                   headers={**admin(wire), "If-Match": f'"{version["row_version"]}"'})
    assert r.status_code == 200, r.text


def test_upgrade_fills_specs_into_older_drafts_once_and_keeps_ids(client, engine, wire):
    version, graph, _ = graph_of(client, wire, "P04")
    ids_before = {n["node_key"]: n["id"] for n in graph["nodes"]}
    save(client, wire, version, strip_new_fields(graph))
    _, stripped, _ = graph_of(client, wire, "P04")
    assert stripped["completion_node_id"] is None
    assert all(not (n["step"] or {}).get("material_specs") for n in stripped["nodes"])
    result = seed_wire_factory.seed(engine)["processes"]
    assert result == {"created": [], "upgraded": ["P04"]}
    version, restored, nodes = graph_of(client, wire, "P04")
    assert {n["node_key"]: n["id"] for n in restored["nodes"]} == ids_before  # 노드 id는 그대로
    assert restored["completion_node_id"] == ids_before["complete"]
    assert nodes["single-main"]["step"]["material_specs"][0]["spec_key"] == "feed"
    assert seed_wire_factory.seed(engine)["processes"] == {"created": [], "upgraded": []}  # 두 번째는 없음
    assert version["notes"].count("각 단계의 재료 spec") >= 1  # 시드가 쓴 메모는 새 내용으로 바뀐다


def test_upgrade_does_not_touch_drafts_whose_structure_or_notes_were_changed(client, engine, wire):
    version, graph, _ = graph_of(client, wire, "P05")
    original = {"nodes": graph["nodes"], "edges": graph["edges"],
                "completion_node_id": graph["completion_node_id"]}
    extra = {"id": str(uuid.uuid4()), "node_key": "extra", "kind": "buffer", "label": "사람이 추가한 노드",
             "asset_id": None, "display_order": 999, "step": None}
    edited = strip_new_fields(graph)
    edited["nodes"].append(extra)
    save(client, wire, version, edited)
    assert seed_wire_factory.seed(engine)["processes"] == {"created": [], "upgraded": []}  # 구조가 달라 건드리지 않는다
    _, after, _ = graph_of(client, wire, "P05")
    assert "extra" in {n["node_key"] for n in after["nodes"]}
    assert after["completion_node_id"] is None
    current, _, _ = graph_of(client, wire, "P05")  # 원래 그래프로 복원해 다른 테스트에 영향이 없게 한다
    save(client, wire, current, original)
    _, restored, _ = graph_of(client, wire, "P05")
    assert restored["completion_node_id"] == graph["completion_node_id"]
