"""BE-04a: 공정 버전·그래프 API를 실제 PostgreSQL로 검증한다(CR-backend-20261023-be04)."""

import itertools
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from helpers import create_project, equipment_body, headers, project_with_members, space_body

API = "/api/v1"
UNKNOWN = {"mode": "unknown", "value": None}


def uid():
    return str(uuid.uuid4())


def known(value):
    return {"mode": "known", "value": value}


@pytest.fixture
def ctx(db, client, world):
    pid = project_with_members(db, client, world)
    users = world["users"]
    c = {"pid": pid, "world": world, "admin": headers(users["admin"]),
         "editor": headers(users["editor"]), "viewer": headers(users["viewer"]),
         "outsider": headers(users["outsider"])}
    r = client.post(f"{API}/projects/{pid}/products", json={"code": f"P-{uid()[:6]}", "name": "제품"},
                    headers=c["admin"])
    c["product"] = r.json()["data"]["id"]
    c["equipment"] = _asset(client, c, equipment_body(f"EQ-{uid()[:6]}"))
    c["equipment2"] = _asset(client, c, equipment_body(f"EQ-{uid()[:6]}"))
    c["storage"] = _asset(client, c, space_body(f"ST-{uid()[:6]}"))
    c["dock"] = _asset(client, c, space_body(f"DK-{uid()[:6]}", "dock"))
    return c


def _asset(client, ctx, body):
    r = client.post(f"{API}/projects/{ctx['pid']}/assets", json=body, headers=ctx["admin"])
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


def base(ctx):
    return f"{API}/projects/{ctx['pid']}"


def with_version(ctx, who, version):
    return {**ctx[who], "If-Match": f'"{version}"'}


def create_version(client, ctx, who="editor"):
    r = client.post(f"{base(ctx)}/products/{ctx['product']}/process-versions", headers=ctx[who])
    assert r.status_code == 201, r.text
    return r.json()["data"]


# --- 그래프 빌더 -----------------------------------------------------------------------------

def node(kind, key, **extra):
    return {"id": uid(), "node_key": key, "kind": kind, "label": f"[시험] {key}", **extra}


def full_step(equipment_id, **overrides):
    """실행에 필요한 값이 모두 확정된 단계(미정 경고가 없는 상태)."""
    step = {
        "operation_type": "output_units_by_time", "handler_version": "1",
        "timing_rule": {
            "processing": {"kind": "output_speed", "speed_m_per_min": known("30"),
                           "basis": "per_stream", "output_schedule": "sequential_units",
                           "parallel_streams": known(1)},
            "setup": {"duration_min": {"mode": "not_applicable"}, "trigger": "not_applicable"},
            "precondition_delay": {"duration_min": {"mode": "not_applicable"},
                                   "trigger": "not_applicable", "occupancy": "unknown"}},
        "input_rule": {"acquire_scope": "per_operation", "consume_policy": "consume"},
        "output_rule": {"mode": "configured_units", "length_m": known("1000"),
                        "unit_count": known(2), "quantity_basis": "per_operation",
                        "schedule": "sequential_units", "accounting_mode": "physical"},
        "handoff_rule": {"mode": "per_output_unit"},
        "resources": [{"role_key": "main", "candidates": [
            {"asset_id": equipment_id, "eligibility_status": "confirmed"}]}],
    }
    step.update(overrides)
    return step


def edge(a, b, key=None, **extra):
    return {"id": uid(), "edge_key": key or f"{a['node_key']}-{b['node_key']}",
            "from_node_id": a["id"], "to_node_id": b["id"], **extra}


def linear_graph(ctx, step=None):
    """source → 절연 → 대기(저장공간) → 쉬스 → sink 의 직선 공정."""
    src = node("source", "src")
    first = node("operation", "insulate", step=step or full_step(ctx["equipment"]), display_order=1)
    buf = node("buffer", "wait", asset_id=ctx["storage"], display_order=2)
    second = node("operation", "sheath", step=step or full_step(ctx["equipment2"]), display_order=3)
    sink = node("sink", "sink", display_order=4)
    nodes = [src, first, buf, second, sink]
    edges = [edge(a, b) for a, b in itertools.pairwise(nodes)]
    return {"nodes": nodes, "edges": edges}, nodes


def put_graph(client, ctx, version, graph, who="editor", etag=None):
    return client.put(f"{base(ctx)}/process-versions/{version['id']}/graph", json=graph,
                      headers=with_version(ctx, who, etag or version["row_version"]))


def get_version(client, ctx, version_id, who="viewer"):
    r = client.get(f"{base(ctx)}/process-versions/{version_id}", headers=ctx[who])
    assert r.status_code == 200, r.text
    return r.json()["data"]


def graph_of(client, ctx, version_id, who="viewer"):
    r = client.get(f"{base(ctx)}/process-versions/{version_id}/graph", headers=ctx[who])
    assert r.status_code == 200, r.text
    return r.json()["data"]


@pytest.fixture
def ready(client, ctx):
    """완전히 확정된 직선 그래프가 저장된 초안과 그 그래프."""
    version = create_version(client, ctx)
    graph, nodes = linear_graph(ctx)
    r = put_graph(client, ctx, version, graph)
    assert r.status_code == 200, r.text
    version = get_version(client, ctx, version["id"])
    return version, graph, nodes


def advance(client, ctx, version, steps):
    for step, who in steps:
        r = client.post(f"{base(ctx)}/process-versions/{version['id']}/{step}",
                        headers=with_version(ctx, who, version["row_version"]))
        assert r.status_code == 200, r.text
        version = r.json()["data"]
    return version


# --- 생성 ---------------------------------------------------------------------------------

def test_new_version_starts_empty_with_unknown_units_and_warnings(client, ctx):
    r = client.post(f"{base(ctx)}/products/{ctx['product']}/process-versions", headers=ctx["editor"])
    assert r.status_code == 201, r.text
    d = r.json()["data"]
    assert r.headers["ETag"] == '"1"' and d["row_version"] == 1
    assert r.headers["Location"].endswith(f"/process-versions/{d['id']}")
    assert (d["version_no"], d["status"], d["base_version_id"]) == (1, "draft", None)
    unknown = {"mode": "unknown", "value": None}
    assert d["raw_unit_spec"] == {k: unknown for k in ("length_m", "weight_kg", "unit_count",
                                                       "strand_count")}  # 0이 아니다
    assert {i["rule_id"] for i in d["issues"]} == {"VAL-VER-001", "VAL-VER-002", "VAL-GRAPH-010"}
    assert all(i["severity"] == "warning" for i in d["issues"])
    graph = graph_of(client, ctx, d["id"])
    assert graph["nodes"] == [] and graph["edges"] == []


def test_only_one_open_version_per_product(client, ctx):
    create_version(client, ctx)
    dup = client.post(f"{base(ctx)}/products/{ctx['product']}/process-versions", headers=ctx["editor"])
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "PROCESS_DRAFT_EXISTS"
    other = client.post(f"{base(ctx)}/products", json={"code": f"Q-{uid()[:6]}", "name": "다른 제품"},
                        headers=ctx["admin"]).json()["data"]["id"]
    ok = client.post(f"{base(ctx)}/products/{other}/process-versions", headers=ctx["editor"])
    assert ok.status_code == 201


def test_create_permissions_and_scope(client, ctx):
    url = f"{base(ctx)}/products/{ctx['product']}/process-versions"
    assert client.post(url, headers=ctx["viewer"]).status_code == 403
    assert client.post(url, headers=ctx["outsider"]).status_code == 404
    assert client.post(url).status_code == 401
    assert client.post(f"{base(ctx)}/products/{uuid.uuid4()}/process-versions",
                       headers=ctx["admin"]).status_code == 404
    other, _ = create_project(client, ctx["world"])
    cross = f"{API}/projects/{other}/products/{ctx['product']}/process-versions"
    assert client.post(cross, headers=ctx["admin"]).status_code == 404


# --- 그래프 저장 ------------------------------------------------------------------------------

def test_put_graph_saves_atomically_and_roundtrips(client, ctx):
    version = create_version(client, ctx)
    graph, nodes = linear_graph(ctx)
    r = put_graph(client, ctx, version, graph)
    assert r.status_code == 200, r.text
    assert r.headers["ETag"] == '"2"'
    data = r.json()["data"]
    assert data["row_version"] == 2 and data["process_version_id"] == version["id"]
    assert [n["node_key"] for n in data["nodes"]] == ["src", "insulate", "wait", "sheath", "sink"]
    assert [n["id"] for n in data["nodes"]] == [n["id"] for n in nodes]  # 클라이언트 UUID 유지
    buf = next(n for n in data["nodes"] if n["kind"] == "buffer")
    assert buf["asset_id"] == ctx["storage"] and buf["step"] is None
    first = next(n for n in data["nodes"] if n["node_key"] == "insulate")["step"]
    assert first["timing_rule"]["processing"]["speed_m_per_min"] == known("30")
    assert first["resources"][0]["candidates"] == [
        {"asset_id": ctx["equipment"], "eligibility_status": "confirmed"}]
    assert len(data["edges"]) == 4
    assert data["issues"] == [i for i in data["issues"] if i["severity"] == "warning"]
    again = graph_of(client, ctx, version["id"])
    assert [n["id"] for n in again["nodes"]] == [n["id"] for n in data["nodes"]]


def test_fully_specified_graph_has_only_unit_spec_and_completion_warnings(client, ready):
    version, _, _ = ready
    # 이 그래프에는 완제품 milestone이 없어 완제품 판정 시점(VAL-GRAPH-014)도 미정 경고다.
    assert {i["rule_id"] for i in version["issues"]} == {"VAL-VER-001", "VAL-VER-002", "VAL-GRAPH-014"}


def test_put_graph_replaces_everything_and_removed_parts_disappear(client, ctx, ready):
    version, _graph, nodes = ready
    src, first = nodes[0], nodes[1]
    smaller = {"nodes": [src, first], "edges": [edge(src, first, key="only")]}
    r = put_graph(client, ctx, version, smaller)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert [n["node_key"] for n in data["nodes"]] == ["src", "insulate"]
    assert [e["edge_key"] for e in data["edges"]] == ["only"]
    # 같은 id를 다시 보내도(교체) 문제 없고, 새 id의 간선과 섞이지 않는다.
    empty = put_graph(client, ctx, {"id": version["id"], "row_version": data["row_version"]},
                      {"nodes": [], "edges": []})
    assert empty.status_code == 200 and empty.json()["data"]["nodes"] == []


@pytest.mark.parametrize("label", [
    "dangling edge", "self loop", "into source", "out of sink", "dup node key", "dup node id",
    "dup edge key", "operation without step", "step on buffer", "asset on operation",
    "buffer with equipment", "candidate is storage", "foreign asset", "worker with candidates",
    "unlimited equipment", "required count too big", "unknown field", "negative order",
])
def test_put_graph_rejects_invalid_structure_without_saving(client, ctx, ready, label):
    version, _original, nodes = ready
    src, first, buf = nodes[0], nodes[1], nodes[2]
    sink = nodes[4]
    foreign = _asset(client, create_project_ctx(client, ctx), equipment_body("FOREIGN"))
    ghost = node("operation", "ghost", step=full_step(ctx["equipment"]))
    cases = {
        "dangling edge": {"nodes": [src, first], "edges": [edge(first, ghost)]},
        "self loop": {"nodes": [src, first], "edges": [edge(first, first)]},
        "into source": {"nodes": [src, first], "edges": [edge(first, src)]},
        "out of sink": {"nodes": [first, sink], "edges": [edge(sink, first)]},
        "dup node key": {"nodes": [src, {**first, "node_key": "src", "id": uid()}], "edges": []},
        "dup node id": {"nodes": [src, {**first, "id": src["id"]}], "edges": []},
        "dup edge key": {"nodes": [src, first, buf],
                         "edges": [edge(src, first, key="e"), edge(first, buf, key="e")]},
        "operation without step": {"nodes": [{**first, "step": None}], "edges": []},
        "step on buffer": {"nodes": [{**buf, "step": full_step(ctx["equipment"])}], "edges": []},
        "asset on operation": {"nodes": [{**first, "asset_id": ctx["storage"]}], "edges": []},
        "buffer with equipment": {"nodes": [{**buf, "asset_id": ctx["equipment"]}], "edges": []},
        "candidate is storage": {"nodes": [{**first, "step": full_step(ctx["storage"])}], "edges": []},
        "foreign asset": {"nodes": [{**first, "step": full_step(foreign)}], "edges": []},
        "worker with candidates": {"nodes": [{**first, "step": full_step(
            ctx["equipment"], resources=[{"role_key": "w", "resource_kind": "worker", "candidates": [
                {"asset_id": ctx["equipment"]}]}])}], "edges": []},
        "unlimited equipment": {"nodes": [{**first, "step": full_step(
            ctx["equipment"], resources=[{"role_key": "e", "capacity_mode": "unlimited"}])}],
                                "edges": []},
        "required count too big": {"nodes": [{**first, "step": full_step(
            ctx["equipment"], resources=[{"role_key": "e", "required_count": 3, "candidates": [
                {"asset_id": ctx["equipment"]}]}])}], "edges": []},
        "unknown field": {"nodes": [{**first, "speed": 1}], "edges": []},
        "negative order": {"nodes": [{**first, "display_order": -1}], "edges": []},
    }
    r = put_graph(client, ctx, version, cases[label])
    assert r.status_code == 422, (label, r.text)
    assert r.json()["error"]["code"] == "VALIDATION_ERROR", label
    after = graph_of(client, ctx, version["id"])
    assert [n["id"] for n in after["nodes"]] == [n["id"] for n in nodes], label  # 저장되지 않음
    assert after["row_version"] == version["row_version"], label


def create_project_ctx(client, ctx):
    """다른 프로젝트의 자산 id를 만들기 위한 보조 컨텍스트."""
    other, _ = create_project(client, ctx["world"])
    return {"pid": other, "admin": ctx["admin"]}


def test_put_graph_error_paths_point_into_the_request_body(client, ctx):
    version = create_version(client, ctx)
    first = node("operation", "a", step=full_step(ctx["equipment"]))
    bad_buf = node("buffer", "b", asset_id=ctx["equipment"])
    r = put_graph(client, ctx, version, {"nodes": [first, bad_buf],
                                         "edges": [edge(first, node("sink", "z"))]})
    assert r.status_code == 422
    paths = {d["field_path"] for d in r.json()["error"]["details"]}
    assert paths & {"/nodes/1/asset_id", "/edges/0/to_node_id"}


def test_put_graph_etag_permissions_and_id_reuse_across_versions(client, ctx, ready):
    version, _, _ = ready
    graph, _ = linear_graph(ctx)
    url = f"{base(ctx)}/process-versions/{version['id']}/graph"
    assert client.put(url, json=graph, headers=ctx["editor"]).status_code == 428
    stale = client.put(url, json=graph, headers=with_version(ctx, "editor", 99))
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "EDIT_CONFLICT"
    assert client.put(url, json=graph, headers=with_version(
        ctx, "viewer", version["row_version"])).status_code == 403
    assert client.put(url, json=graph, headers=with_version(
        ctx, "outsider", version["row_version"])).status_code == 404
    # 다른 버전이 쓰는 노드 id를 가져다 쓰면 거부된다(id는 새로 만든 UUID여야 한다).
    taken = graph_of(client, ctx, version["id"])["nodes"][0]["id"]
    dup_nodes = {"nodes": [node("source", "again", id=taken)], "edges": []}
    other_product = client.post(f"{base(ctx)}/products", json={"code": f"R-{uid()[:6]}", "name": "x"},
                                headers=ctx["admin"]).json()["data"]["id"]
    other_version = client.post(f"{base(ctx)}/products/{other_product}/process-versions",
                                headers=ctx["editor"]).json()["data"]
    r = put_graph(client, ctx, other_version, dup_nodes)
    assert r.status_code == 422 and r.json()["error"]["details"][0]["rule_id"] == "VAL-REF-003"


# --- 단계 수정 ----------------------------------------------------------------------------------

def step_url(ctx, version_id, step_id):
    return f"{base(ctx)}/process-versions/{version_id}/steps/{step_id}"


def test_patch_step_replaces_given_fields_and_bumps_version_etag(client, ctx, ready):
    version, _, nodes = ready
    step_id = nodes[1]["id"]
    r = client.patch(step_url(ctx, version["id"], step_id), headers=with_version(
        ctx, "editor", version["row_version"]), json={
            "label": "새 이름", "operation_type": "split_length",
            "timing_rule": {"processing": {"kind": "none"}},
            "resources": [{"role_key": "main", "candidates": [
                {"asset_id": ctx["equipment2"], "eligibility_status": "unknown"}]},
                          {"role_key": "inspector", "resource_kind": "worker",
                           "capacity_mode": "unlimited"}]})
    assert r.status_code == 200, r.text
    assert r.headers["ETag"] == f'"{version["row_version"] + 1}"'
    data = r.json()["data"]
    assert data["id"] == step_id and data["label"] == "새 이름"
    assert data["step"]["operation_type"] == "split_length"
    assert data["step"]["timing_rule"]["processing"] == {"kind": "none"}
    # 최상위 필드는 통째로 교체되므로 보내지 않은 setup은 기본(unknown)으로 돌아간다.
    assert data["step"]["timing_rule"]["setup"]["trigger"] == "unknown"
    roles = {r_["role_key"]: r_ for r_ in data["step"]["resources"]}
    assert roles["inspector"]["capacity_mode"] == "unlimited" and roles["inspector"]["candidates"] == []
    assert roles["main"]["candidates"][0]["eligibility_status"] == "unknown"
    # 보내지 않은 필드(input_rule, output_rule)는 그대로
    assert data["step"]["output_rule"]["unit_count"] == known(2)
    other = next(n for n in graph_of(client, ctx, version["id"])["nodes"] if n["node_key"] == "sheath")
    assert other["step"]["resources"][0]["candidates"][0]["asset_id"] == ctx["equipment2"]  # 다른 단계 영향 없음


def test_patch_step_rejections(client, ctx, ready):
    version, _, nodes = ready
    step_id, buffer_id = nodes[1]["id"], nodes[2]["id"]
    h = with_version(ctx, "editor", version["row_version"])
    for label, body in {"empty": {}, "null timing": {"timing_rule": None},
                        "null resources": {"resources": None}, "extra": {"asset_id": ctx["storage"]},
                        "bad rule": {"timing_rule": {"processing": {"kind": "teleport"}}},
                        "dup roles": {"resources": [{"role_key": "a"}, {"role_key": "a"}]},
                        "storage candidate": {"resources": [{"role_key": "a", "candidates": [
                            {"asset_id": ctx["storage"]}]}]}}.items():
        r = client.patch(step_url(ctx, version["id"], step_id), json=body, headers=h)
        assert r.status_code == 422, label
    assert client.patch(step_url(ctx, version["id"], buffer_id), json={"label": "x"},
                        headers=h).status_code == 404  # buffer는 단계가 아니다
    assert client.patch(step_url(ctx, version["id"], uuid.uuid4()), json={"label": "x"},
                        headers=h).status_code == 404
    assert client.patch(step_url(ctx, version["id"], step_id), json={"label": "x"},
                        headers=ctx["editor"]).status_code == 428
    assert client.patch(step_url(ctx, version["id"], step_id), json={"label": "x"},
                        headers=with_version(ctx, "editor", 99)).status_code == 412
    assert client.patch(step_url(ctx, version["id"], step_id), json={"label": "x"},
                        headers=with_version(ctx, "viewer", version["row_version"])).status_code == 403
    cleared = client.patch(step_url(ctx, version["id"], step_id), json={"operation_type": None},
                           headers=h)
    assert cleared.status_code == 200 and cleared.json()["data"]["step"]["operation_type"] is None
    assert get_version(client, ctx, version["id"])["row_version"] == version["row_version"] + 1


def test_patch_version_unit_specs_merge_and_notes(client, ctx):
    version = create_version(client, ctx)
    url = f"{base(ctx)}/process-versions/{version['id']}"
    r = client.patch(url, headers=with_version(ctx, "editor", 1), json={
        "raw_unit_spec": {"length_m": known("3000"), "weight_kg": known("2000")},
        "finished_unit_spec": {"unit_count": known(10)}, "notes": "메모"})
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["raw_unit_spec"]["length_m"] == known("3000")
    assert d["raw_unit_spec"]["unit_count"] == UNKNOWN  # 보내지 않은 필드는 미정으로 유지
    assert d["finished_unit_spec"]["unit_count"] == known(10) and d["notes"] == "메모"
    assert "VAL-VER-001" not in {i["rule_id"] for i in d["issues"]}
    for label, body in {"empty": {}, "null": {"raw_unit_spec": None},
                        "zero length": {"raw_unit_spec": {"length_m": known("0")}},
                        "string count": {"finished_unit_spec": {"unit_count": known("3")}},
                        "extra": {"status": "approved"}}.items():
        assert client.patch(url, json=body, headers=with_version(
            ctx, "editor", d["row_version"])).status_code == 422, label


# --- 검증 -----------------------------------------------------------------------------------

def test_validate_scopes_knowledge_vs_run_template(client, ctx, ready):
    version, _, _ = ready
    url = f"{base(ctx)}/process-versions/{version['id']}/validate"
    knowledge = client.post(url, headers=ctx["viewer"]).json()["data"]
    assert knowledge["scope"] == "knowledge" and knowledge["error_count"] == 0
    run = client.post(f"{url}?scope=run_template", headers=ctx["viewer"]).json()["data"]
    # 확정된 그래프라도 완제품 판정 시점이 미정이면 실행 가능 판정은 이것 하나만 오류다(원자재 단위 미정은 경고).
    assert run["error_count"] == 1 and knowledge["warning_count"] == 3
    assert {i["rule_id"] for i in run["issues"] if i["severity"] == "error"} == {"VAL-GRAPH-014"}
    assert {i["rule_id"] for i in run["issues"]} == {"VAL-VER-001", "VAL-VER-002", "VAL-GRAPH-014"}
    assert client.post(f"{url}?scope=bogus", headers=ctx["viewer"]).status_code == 422


def test_unknowns_are_warnings_for_approval_but_errors_for_run(client, ctx):
    version = create_version(client, ctx)
    graph, _ = linear_graph(ctx, step={})  # 기본(미정) 단계
    for n in graph["nodes"]:
        if n["kind"] == "operation":
            n["step"] = {}
    assert put_graph(client, ctx, version, graph).status_code == 200
    url = f"{base(ctx)}/process-versions/{version['id']}/validate"
    knowledge = client.post(url, headers=ctx["viewer"]).json()["data"]
    assert knowledge["error_count"] == 0 and knowledge["warning_count"] > 0
    run = client.post(f"{url}?scope=run_template", headers=ctx["viewer"]).json()["data"]
    errors = {i["rule_id"] for i in run["issues"] if i["severity"] == "error"}
    assert {"VAL-TIME-001", "VAL-OUT-001", "VAL-RES-002", "VAL-HANDLER-001"} <= errors
    # 이슈 대상은 단계 id + 단계 내부 포인터다(순서 번호가 아님).
    step_ids = {n["id"] for n in graph["nodes"] if n["kind"] == "operation"}
    issue = next(i for i in run["issues"] if i["rule_id"] == "VAL-TIME-001")
    assert issue["entity_id"] in step_ids and issue["field_path"] == "/timing_rule/processing"


def test_unsupported_handler_is_registered_but_blocks_run_only(client, ctx, ready):
    version, _, nodes = ready
    r = client.patch(step_url(ctx, version["id"], nodes[1]["id"]), headers=with_version(
        ctx, "editor", version["row_version"]), json={"operation_type": "teleport"})
    assert r.status_code == 200
    url = f"{base(ctx)}/process-versions/{version['id']}/validate"
    assert client.post(url, headers=ctx["viewer"]).json()["data"]["error_count"] == 0
    run = client.post(f"{url}?scope=run_template", headers=ctx["viewer"]).json()["data"]
    assert "UNSUPPORTED_HANDLER" in {i["rule_id"] for i in run["issues"]}


# --- 승인 흐름 --------------------------------------------------------------------------------

def test_submit_freezes_everything_and_reject_reopens(client, ctx, ready):
    version, graph, nodes = ready
    submitted = advance(client, ctx, version, [("submit", "editor")])
    assert submitted["status"] == "in_review" and submitted["submitted_by"]
    h = with_version(ctx, "editor", submitted["row_version"])
    vurl = f"{base(ctx)}/process-versions/{version['id']}"
    for r in (client.put(f"{vurl}/graph", json=graph, headers=h),
              client.patch(step_url(ctx, version["id"], nodes[1]["id"]), json={"label": "x"}, headers=h),
              client.patch(vurl, json={"notes": "x"}, headers=h)):
        assert r.status_code == 409 and r.json()["error"]["code"] == "VERSION_IMMUTABLE"
    reject = f"{vurl}/reject"
    admin_h = with_version(ctx, "admin", submitted["row_version"])
    assert client.post(reject, json={"reason": "r"}, headers=h).status_code == 403
    assert client.post(reject, json={}, headers=admin_h).status_code == 422
    rejected = client.post(reject, json={"reason": " 검토 의견 "}, headers=admin_h).json()["data"]
    assert rejected["status"] == "draft" and rejected["rejection_reason"] == "검토 의견"
    again = put_graph(client, ctx, rejected, graph)  # 반려 후 다시 수정 가능
    assert again.status_code == 200


def test_approve_requires_admin_if_match_and_records_approver(client, ctx, ready):
    version, _, _ = ready
    in_review = advance(client, ctx, version, [("submit", "editor")])
    url = f"{base(ctx)}/process-versions/{version['id']}/approve"
    assert client.post(url, headers=with_version(ctx, "editor", in_review["row_version"])
                       ).status_code == 403
    assert client.post(url, headers=ctx["admin"]).status_code == 428
    assert client.post(url, headers=with_version(ctx, "admin", 99)).status_code == 412
    approved = client.post(url, headers=with_version(ctx, "admin", in_review["row_version"]))
    assert approved.status_code == 200, approved.text
    d = approved.json()["data"]
    assert d["status"] == "approved" and d["approved_by"] == str(ctx["world"]["users"]["admin"])
    # 승인본도 변경 불가
    frozen = client.patch(f"{base(ctx)}/process-versions/{version['id']}",
                          json={"notes": "x"}, headers=with_version(ctx, "editor", d["row_version"]))
    assert frozen.status_code == 409 and frozen.json()["error"]["code"] == "VERSION_IMMUTABLE"


def test_invalid_transitions_are_conflicts(client, ctx, ready):
    version, _, _ = ready
    vurl = f"{base(ctx)}/process-versions/{version['id']}"
    for action, body in (("approve", None), ("reject", {"reason": "x"})):
        r = client.post(f"{vurl}/{action}", json=body, headers=with_version(
            ctx, "admin", version["row_version"]))
        assert r.status_code == 409 and r.json()["error"]["code"] == "INVALID_STATE_TRANSITION"
    submitted = advance(client, ctx, version, [("submit", "editor")])
    r = client.post(f"{vurl}/submit", headers=with_version(ctx, "editor", submitted["row_version"]))
    assert r.status_code == 409


def test_new_draft_copies_approved_graph_with_new_ids_and_supersedes(client, ctx, ready):
    version, _, _nodes = ready
    first = advance(client, ctx, version, [("submit", "editor"), ("approve", "admin")])
    second = create_version(client, ctx)
    assert second["version_no"] == 2 and second["base_version_id"] == first["id"]
    old = graph_of(client, ctx, first["id"])
    new = graph_of(client, ctx, second["id"])
    assert [n["node_key"] for n in new["nodes"]] == [n["node_key"] for n in old["nodes"]]
    assert not {n["id"] for n in new["nodes"]} & {n["id"] for n in old["nodes"]}  # 새 UUID
    assert not {e["id"] for e in new["edges"]} & {e["id"] for e in old["edges"]}
    assert [n["step"] for n in new["nodes"]] == [n["step"] for n in old["nodes"]]  # 내용 동일
    assert [(e["edge_key"]) for e in new["edges"]] == [e["edge_key"] for e in old["edges"]]
    # 복사본 수정은 원본에 영향이 없다.
    r = client.patch(step_url(ctx, second["id"], new["nodes"][1]["id"]), headers=with_version(
        ctx, "editor", second["row_version"]), json={"label": "복사본 수정"})
    assert r.status_code == 200
    assert graph_of(client, ctx, first["id"])["nodes"][1]["label"] == old["nodes"][1]["label"]
    done = advance(client, ctx, get_version(client, ctx, second["id"]),
                   [("submit", "editor"), ("approve", "admin")])
    listing = client.get(f"{base(ctx)}/products/{ctx['product']}/process-versions",
                         headers=ctx["viewer"]).json()["data"]
    assert [(v["version_no"], v["status"]) for v in listing] == [(2, "approved"), (1, "superseded")]
    product = client.get(f"{base(ctx)}/products/{ctx['product']}", headers=ctx["viewer"]).json()["data"]
    assert product["current_process_version"]["id"] == done["id"]
    assert product["latest_process_version"]["version_no"] == 2


def test_product_summaries_reflect_draft_and_approved_versions(client, ctx):
    product = client.get(f"{base(ctx)}/products/{ctx['product']}", headers=ctx["viewer"]).json()["data"]
    assert product["latest_process_version"] is None and product["current_process_version"] is None
    version = create_version(client, ctx)
    listed = client.get(f"{base(ctx)}/products", headers=ctx["viewer"]).json()["data"]
    mine = next(p for p in listed if p["id"] == ctx["product"])
    assert mine["latest_process_version"]["status"] == "draft"
    assert mine["current_process_version"] is None
    assert version["version_no"] == mine["latest_process_version"]["version_no"]


def test_version_list_pagination_and_cursor_scope(client, ctx):
    v1 = create_version(client, ctx)
    advance(client, ctx, v1, [("submit", "editor"), ("approve", "admin")])
    create_version(client, ctx)
    url = f"{base(ctx)}/products/{ctx['product']}/process-versions"
    first = client.get(f"{url}?limit=1", headers=ctx["viewer"]).json()
    assert [v["version_no"] for v in first["data"]] == [2] and first["page"]["next_cursor"]
    second = client.get(f"{url}?limit=1&cursor={first['page']['next_cursor']}", headers=ctx["viewer"]).json()
    assert [v["version_no"] for v in second["data"]] == [1] and second["page"]["next_cursor"] is None
    other = client.post(f"{base(ctx)}/products", json={"code": f"S-{uid()[:6]}", "name": "x"},
                        headers=ctx["admin"]).json()["data"]["id"]
    reuse = client.get(f"{base(ctx)}/products/{other}/process-versions?cursor={first['page']['next_cursor']}",
                       headers=ctx["viewer"])
    assert reuse.status_code == 422 and reuse.json()["error"]["code"] == "INVALID_CURSOR"


# --- 격리·경쟁·감사 --------------------------------------------------------------------------------

def test_versions_are_invisible_through_another_project_or_user(client, ctx, ready):
    version, graph, nodes = ready
    other, _ = create_project(client, ctx["world"])
    cross = f"{API}/projects/{other}/process-versions/{version['id']}"
    etag = {**ctx["admin"], "If-Match": f'"{version["row_version"]}"'}
    for r in (client.get(cross, headers=ctx["admin"]), client.get(f"{cross}/graph", headers=ctx["admin"]),
              client.put(f"{cross}/graph", json=graph, headers=etag),
              client.patch(f"{cross}/steps/{nodes[1]['id']}", json={"label": "x"}, headers=etag),
              client.post(f"{cross}/validate", headers=ctx["admin"]),
              client.post(f"{cross}/submit", headers=etag)):
        assert r.status_code == 404
    assert client.get(f"{base(ctx)}/process-versions/{version['id']}",
                      headers=ctx["outsider"]).status_code == 404
    assert client.get(f"{base(ctx)}/process-versions/{uuid.uuid4()}",
                      headers=ctx["viewer"]).status_code == 404


def test_concurrent_graph_saves_only_one_wins(make_client, client, ctx):
    version = create_version(client, ctx)
    clients = [make_client() for _ in range(4)]

    def attempt(i):
        graph, _ = linear_graph(ctx)
        return clients[i].put(f"{base(ctx)}/process-versions/{version['id']}/graph", json=graph,
                              headers=with_version(ctx, "editor", 1)).status_code

    with ThreadPoolExecutor(4) as pool:
        assert sorted(pool.map(attempt, range(4))) == [200, 412, 412, 412]
    assert len(graph_of(client, ctx, version["id"])["nodes"]) == 5  # 한 요청의 그래프만 온전히 저장


def test_concurrent_submit_and_graph_save_never_both_apply(make_client, client, ctx, ready):
    version, _, _ = ready
    a, b = make_client(), make_client()
    new_graph, _ = linear_graph(ctx)

    def submit():
        return a.post(f"{base(ctx)}/process-versions/{version['id']}/submit",
                      headers=with_version(ctx, "editor", version["row_version"])).status_code

    def save():
        return b.put(f"{base(ctx)}/process-versions/{version['id']}/graph", json=new_graph,
                     headers=with_version(ctx, "editor", version["row_version"])).status_code

    with ThreadPoolExecutor(2) as pool:
        codes = sorted([pool.submit(submit).result(), pool.submit(save).result()])
    assert codes[0] == 200 and codes[1] in (409, 412)


def test_workflow_is_audited(client, db, ctx, ready):
    version, _, nodes = ready
    client.patch(step_url(ctx, version["id"], nodes[1]["id"]), json={"label": "수정"},
                 headers=with_version(ctx, "editor", version["row_version"]))
    current = get_version(client, ctx, version["id"])
    advance(client, ctx, current, [("submit", "editor"), ("approve", "admin")])
    actions = db.scalar("select string_agg(distinct action, ',' order by action) from audit_log "
                        "where entity_id = :e", e=uuid.UUID(version["id"]))
    assert set(actions.split(",")) == {
        "process_version.create", "process_version.graph", "process_version.step",
        "process_version.submit", "process_version.approve"}


# --- BE-04b: 복제 기준 선택·버전 비교·편집기 상태 (CR be05) ------------------------------

PV = "process-versions"


def approve_ready(client, ctx, ready):
    version, _, _ = ready
    return advance(client, ctx, version, [("submit", "editor"), ("approve", "admin")])


def new_version(client, ctx, body=None, who="editor"):
    return client.post(f"{base(ctx)}/products/{ctx['product']}/{PV}", json=body, headers=ctx[who])


def patch_notes(client, ctx, version, notes):
    r = client.patch(f"{base(ctx)}/{PV}/{version['id']}", json={"notes": notes},
                     headers=with_version(ctx, "editor", version["row_version"]))
    assert r.status_code == 200, r.text
    return r.json()["data"]


def diff(client, ctx, version_id, who="viewer", **params):
    return client.get(f"{base(ctx)}/{PV}/{version_id}/diff", params=params, headers=ctx[who])


def editor_url(ctx, version_id):
    return f"{base(ctx)}/{PV}/{version_id}/editor-state"


def put_editor(client, ctx, version_id, body, etag, who="editor"):
    return client.put(editor_url(ctx, version_id), json=body, headers=with_version(ctx, who, etag))


def supersede_v1_with_v2(client, ctx, ready):
    """v1 승인 → v2(복사본, 메모 변경) 승인 → v1은 superseded. (v1, v2)를 돌려준다."""
    v1 = approve_ready(client, ctx, ready)
    v2 = create_version(client, ctx)
    v2 = patch_notes(client, ctx, v2, "v2 메모")
    v2 = advance(client, ctx, v2, [("submit", "editor"), ("approve", "admin")])
    return get_version(client, ctx, v1["id"]), v2


# --- 복제 기준 선택 -------------------------------------------------------------------------

def test_clone_from_a_superseded_version_copies_its_content_not_the_approved_one(client, ctx, ready):
    version, _, _ = ready
    version = patch_notes(client, ctx, version, "v1 메모")
    v1, v2 = supersede_v1_with_v2(client, ctx, (version, None, None))
    assert v1["status"] == "superseded" and v2["notes"] == "v2 메모"
    r = new_version(client, ctx, {"base_version_id": v1["id"]})
    assert r.status_code == 201, r.text
    v3 = r.json()["data"]
    assert v3["status"] == "draft" and v3["version_no"] == 3
    assert v3["base_version_id"] == v1["id"] and v3["notes"] == "v1 메모"  # 승인본(v2)이 아니라 v1
    assert v3["approved_at"] is None and v3["approved_by"] is None and v3["submitted_at"] is None
    old, new = graph_of(client, ctx, v1["id"]), graph_of(client, ctx, v3["id"])
    assert [n["node_key"] for n in new["nodes"]] == [n["node_key"] for n in old["nodes"]]
    assert not {n["id"] for n in new["nodes"]} & {n["id"] for n in old["nodes"]}
    assert [n["step"] for n in new["nodes"]] == [n["step"] for n in old["nodes"]]


def test_clone_base_can_be_the_current_approved_version_and_body_is_optional(client, ctx, ready):
    v1 = approve_ready(client, ctx, ready)
    r = new_version(client, ctx, {"base_version_id": None})
    assert r.status_code == 201 and r.json()["data"]["base_version_id"] == v1["id"]
    # 열린 버전이 있으면 기준을 지정해도 같은 409
    again = new_version(client, ctx, {"base_version_id": v1["id"]})
    assert again.status_code == 409 and again.json()["error"]["code"] == "PROCESS_DRAFT_EXISTS"


def test_clone_base_must_be_a_version_of_the_same_product_in_the_same_project(client, ctx, ready):
    v1 = approve_ready(client, ctx, ready)
    other = client.post(f"{base(ctx)}/products", json={"code": f"Q-{uid()[:6]}", "name": "다른 제품"},
                        headers=ctx["admin"]).json()["data"]["id"]
    foreign = client.post(f"{base(ctx)}/products/{other}/{PV}", headers=ctx["editor"]).json()["data"]
    for bad in (foreign["id"], str(uuid.uuid4())):
        r = new_version(client, ctx, {"base_version_id": bad})
        assert r.status_code == 404, r.text
    other_project, _ = create_project(client, ctx["world"])
    elsewhere = f"{API}/projects/{other_project}"
    product = client.post(f"{elsewhere}/products", json={"code": f"Z-{uid()[:6]}", "name": "x"},
                          headers=ctx["admin"]).json()["data"]["id"]
    cross = client.post(f"{elsewhere}/products/{product}/{PV}", json={"base_version_id": v1["id"]},
                        headers=ctx["admin"])
    assert cross.status_code == 404, cross.text  # 다른 프로젝트의 버전은 존재 여부도 숨긴다
    assert new_version(client, ctx, {"base_version_id": v1["id"], "extra": 1}).status_code == 422
    assert new_version(client, ctx, {"base_version_id": "not-a-uuid"}).status_code == 422
    assert new_version(client, ctx, {"base_version_id": v1["id"]}, who="viewer").status_code == 403


def test_clone_copies_the_shared_editor_state_with_new_node_ids(client, ctx, ready):
    version = approve_ready(client, ctx, ready)
    old = graph_of(client, ctx, version["id"])
    positions = {n["id"]: {"x": float(i) * 10, "y": 5.5} for i, n in enumerate(old["nodes"])}
    viewport = {"x": 1.5, "y": -2, "zoom": 0.75}
    assert put_editor(client, ctx, version["id"], {"node_positions": positions, "viewport": viewport},
                      0).status_code == 200
    copy = create_version(client, ctx)
    new = graph_of(client, ctx, copy["id"])
    state = client.get(editor_url(ctx, copy["id"]), headers=ctx["viewer"]).json()["data"]
    old_key = {n["id"]: n["node_key"] for n in old["nodes"]}
    new_key = {n["id"]: n["node_key"] for n in new["nodes"]}
    assert state["row_version"] == 1 and state["viewport"] == viewport
    assert {new_key[i]: p for i, p in state["node_positions"].items()} == {
        old_key[i]: p for i, p in positions.items()}  # 같은 key, 새 id
    assert not set(state["node_positions"]) & set(positions)


# --- 편집기 상태 ----------------------------------------------------------------------------

def test_editor_state_starts_empty_and_roundtrips_with_its_own_etag(client, ctx, ready):
    version, _, nodes = ready
    r = client.get(editor_url(ctx, version["id"]), headers=ctx["viewer"])
    assert r.status_code == 200 and r.headers["etag"] == '"0"'
    empty = r.json()["data"]
    assert empty["node_positions"] == {} and empty["viewport"] is None
    assert empty["row_version"] == 0 and empty["updated_at"] is None
    body = {"node_positions": {nodes[0]["id"]: {"x": 10.5, "y": -3}}, "viewport": None}
    r = put_editor(client, ctx, version["id"], body, 0)
    assert r.status_code == 200 and r.headers["etag"] == '"1"', r.text
    saved = r.json()["data"]
    assert saved["node_positions"] == {nodes[0]["id"]: {"x": 10.5, "y": -3.0}}
    assert saved["row_version"] == 1 and saved["updated_at"].endswith("Z")
    r = put_editor(client, ctx, version["id"], {"node_positions": {}}, 1)  # 통째 교체
    assert r.status_code == 200 and r.json()["data"]["node_positions"] == {}
    assert r.json()["data"]["row_version"] == 2


def test_editor_state_etag_rules_and_validation(client, ctx, ready):
    version, _, nodes = ready
    url, body = editor_url(ctx, version["id"]), {"node_positions": {nodes[0]["id"]: {"x": 1, "y": 2}}}
    assert client.put(url, json=body, headers=ctx["editor"]).status_code == 428  # If-Match 필수
    assert put_editor(client, ctx, version["id"], body, 1).status_code == 412  # 저장 전에는 0
    assert put_editor(client, ctx, version["id"], body, 0).status_code == 200
    stale = put_editor(client, ctx, version["id"], body, 0)
    assert stale.status_code == 412 and stale.json()["error"]["code"] == "EDIT_CONFLICT"
    unknown = uid()
    r = put_editor(client, ctx, version["id"], {"node_positions": {unknown: {"x": 1, "y": 1}}}, 1)
    assert r.status_code == 422
    detail = r.json()["error"]["details"][0]
    assert detail["rule_id"] == "VAL-REF-005" and detail["field_path"] == f"/node_positions/{unknown}"
    node = nodes[0]["id"]
    for bad in ({"node_positions": {node: {"x": 1}}},
                {"node_positions": {node: {"x": 1, "y": 2, "z": 3}}},
                {"node_positions": {node: {"x": 2e9, "y": 0}}},
                {"node_positions": {node: {"x": "1", "y": 2}}},
                {"node_positions": {"not-a-uuid": {"x": 1, "y": 2}}},
                {"node_positions": {}, "viewport": {"x": 0, "y": 0, "zoom": 0}},
                {"node_positions": {}, "viewport": {"x": 0, "y": 0}},
                {"node_positions": {}, "extra": 1}, {}):
        assert put_editor(client, ctx, version["id"], bad, 1).status_code == 422, bad
    assert client.get(url, headers=ctx["viewer"]).json()["data"]["row_version"] == 1  # 실패는 저장 안 됨


def test_editor_state_can_be_saved_on_frozen_versions_without_touching_the_version(client, ctx, ready):
    version, _, nodes = ready
    in_review = advance(client, ctx, version, [("submit", "editor")])
    r = put_editor(client, ctx, version["id"], {"node_positions": {nodes[1]["id"]: {"x": 1, "y": 1}}}, 0)
    assert r.status_code == 200, r.text  # 검토 중에도 저장
    approved = advance(client, ctx, in_review, [("approve", "admin")])
    r = put_editor(client, ctx, version["id"], {"node_positions": {nodes[1]["id"]: {"x": 9, "y": 9}}}, 1)
    assert r.status_code == 200 and r.json()["data"]["row_version"] == 2  # 승인본에도 저장
    after = get_version(client, ctx, version["id"])
    assert after["row_version"] == approved["row_version"]  # 공정 버전의 ETag는 그대로
    assert after["status"] == "approved" and after["updated_at"] == approved["updated_at"]


def test_editor_state_permissions_scope_and_no_audit(client, db, ctx, ready):
    version, _, nodes = ready
    body = {"node_positions": {nodes[0]["id"]: {"x": 1, "y": 2}}}
    assert put_editor(client, ctx, version["id"], body, 0, who="viewer").status_code == 403
    assert put_editor(client, ctx, version["id"], body, 0, who="outsider").status_code == 404
    assert client.get(editor_url(ctx, version["id"]), headers=ctx["outsider"]).status_code == 404
    assert put_editor(client, ctx, version["id"], body, 0, who="admin").status_code == 200
    other, _ = create_project(client, ctx["world"])
    cross = f"{API}/projects/{other}/{PV}/{version['id']}/editor-state"
    assert client.get(cross, headers=ctx["admin"]).status_code == 404
    assert client.put(cross, json=body, headers=with_version(ctx, "admin", 1)).status_code == 404
    missing = f"{base(ctx)}/{PV}/{uuid.uuid4()}/editor-state"
    assert client.get(missing, headers=ctx["viewer"]).status_code == 404
    actions = db.scalar("select count(*) from audit_log where project_id = :p and "
                        "action like '%editor%'", p=ctx["pid"])
    assert actions == 0  # 화면 좌표는 감사 대상이 아니다


def test_concurrent_first_saves_only_one_wins(make_client, client, ctx, ready):
    version, _, nodes = ready
    clients = [make_client() for _ in range(4)]

    def attempt(i):
        body = {"node_positions": {nodes[0]["id"]: {"x": float(i), "y": 0}}}
        return clients[i].put(editor_url(ctx, version["id"]), json=body,
                              headers=with_version(ctx, "editor", 0)).status_code

    with ThreadPoolExecutor(4) as pool:
        assert sorted(pool.map(attempt, range(4))) == [200, 412, 412, 412]
    state = client.get(editor_url(ctx, version["id"]), headers=ctx["viewer"]).json()["data"]
    assert state["row_version"] == 1 and len(state["node_positions"]) == 1


# --- 비교 -----------------------------------------------------------------------------------

def test_diff_defaults_to_the_base_version_and_starts_identical(client, ctx, ready):
    v1 = approve_ready(client, ctx, ready)
    v2 = create_version(client, ctx)
    r = diff(client, ctx, v2["id"])
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["target_version_id"] == v2["id"] and data["against_version_id"] == v1["id"]
    assert data["summary"] == {"added": 0, "removed": 0, "changed": 0, "identical": True}
    assert data["header"] == [] and data["steps"]["changed"] == []


def test_diff_reports_header_node_edge_and_step_changes(client, ctx, ready):
    v1 = approve_ready(client, ctx, ready)
    v2 = create_version(client, ctx)
    old = graph_of(client, ctx, v1["id"])
    keys = {n["node_key"]: n for n in old["nodes"]}
    # 대기 공간(wait) 뒤에 도킹 공간(wait2)을 끼워 넣고, 2번째 단계의 속도와 설비 후보를 바꾼다.
    nodes = [{**n, "id": uid()} for n in old["nodes"]]
    by_key = {n["node_key"]: n for n in nodes}
    wait2 = {"id": uid(), "node_key": "wait2", "kind": "buffer", "label": "[시험] 도킹 대기",
             "asset_id": ctx["dock"], "display_order": 3}
    nodes.append(wait2)
    chain = ["src", "insulate", "wait", "wait2", "sheath", "sink"]
    edges = [{"id": uid(), "edge_key": f"{a}-{b}", "from_node_id": ((by_key | {"wait2": wait2})[a])["id"],
              "to_node_id": ((by_key | {"wait2": wait2})[b])["id"]}
             for a, b in itertools.pairwise(chain)]
    changed_step = full_step(ctx["equipment"])
    changed_step["timing_rule"]["processing"]["speed_m_per_min"] = {"mode": "known", "value": "45"}
    by_key["sheath"]["step"] = changed_step
    assert keys["sheath"]["step"]["resources"][0]["candidates"][0]["asset_id"] == ctx["equipment2"]
    r = put_graph(client, ctx, v2, {"nodes": nodes, "edges": edges})
    assert r.status_code == 200, r.text
    v2 = patch_notes(client, ctx, get_version(client, ctx, v2["id"]), "변경 메모")

    data = diff(client, ctx, v2["id"]).json()["data"]
    assert [n["node_key"] for n in data["nodes"]["added"]] == ["wait2"]
    assert data["nodes"]["removed"] == [] and data["nodes"]["changed"] == []
    assert [e["edge_key"] for e in data["edges"]["added"]] == ["wait-wait2", "wait2-sheath"]
    assert [e["edge_key"] for e in data["edges"]["removed"]] == ["wait-sheath"]
    assert data["edges"]["changed"] == []  # 같은 key의 간선은 끝점 id가 달라도 같다
    assert [f["field_path"] for f in data["header"]] == ["/notes"]
    assert (data["header"][0]["before"], data["header"][0]["after"]) == (None, "변경 메모")
    (step,) = data["steps"]["changed"]
    assert step["node_key"] == "sheath"
    fields = {f["field_path"]: f for f in step["fields"]}
    speed = fields["/timing_rule/processing/speed_m_per_min/value"]
    assert (speed["before"], speed["after"]) == ("30", "45")
    assert fields[f"/resources/main/candidates/{ctx['equipment2']}"]["change"] == "removed"
    assert fields[f"/resources/main/candidates/{ctx['equipment']}"]["change"] == "added"
    assert data["summary"] == {"added": 3, "removed": 1, "changed": 2, "identical": False}


def test_diff_with_explicit_against_and_reversed_direction(client, ctx, ready):
    v1, v2 = supersede_v1_with_v2(client, ctx, ready)
    forward = diff(client, ctx, v2["id"], against=v1["id"]).json()["data"]
    assert [(f["field_path"], f["before"], f["after"]) for f in forward["header"]] == [
        ("/notes", None, "v2 메모")]
    backward = diff(client, ctx, v1["id"], against=v2["id"]).json()["data"]
    assert [(f["field_path"], f["before"], f["after"]) for f in backward["header"]] == [
        ("/notes", "v2 메모", None)]  # before는 항상 against
    # 승인본·superseded 같은 동결된 버전끼리도 비교된다. against 생략 + base 없음 → 현재 승인본과 비교.
    same = diff(client, ctx, v1["id"]).json()["data"]  # v1은 base가 없고 현재 승인본은 v2
    assert same["against_version_id"] == v2["id"]


def test_diff_rejections_and_visibility(client, ctx, ready):
    version, _, _ = ready
    r = diff(client, ctx, version["id"])  # base도 승인본도 없다
    assert r.status_code == 422 and r.json()["error"]["details"][0]["rule_id"] == "VAL-REF-004"
    assert r.json()["error"]["details"][0]["field_path"] == "/against"
    v1 = approve_ready(client, ctx, ready)
    other = client.post(f"{base(ctx)}/products", json={"code": f"Q-{uid()[:6]}", "name": "다른 제품"},
                        headers=ctx["admin"]).json()["data"]["id"]
    foreign = client.post(f"{base(ctx)}/products/{other}/{PV}", headers=ctx["editor"]).json()["data"]
    r = diff(client, ctx, v1["id"], against=foreign["id"])
    assert r.status_code == 422 and r.json()["error"]["details"][0]["rule_id"] == "VAL-REF-004"
    assert diff(client, ctx, v1["id"], against=str(uuid.uuid4())).status_code == 404
    assert diff(client, ctx, str(uuid.uuid4()), against=v1["id"]).status_code == 404
    assert diff(client, ctx, v1["id"], against="not-a-uuid").status_code == 422
    assert diff(client, ctx, v1["id"], who="outsider", against=v1["id"]).status_code == 404
    other_project, _ = create_project(client, ctx["world"])
    cross = f"{API}/projects/{other_project}/{PV}/{v1['id']}/diff"
    assert client.get(cross, params={"against": v1["id"]}, headers=ctx["admin"]).status_code == 404
    same = diff(client, ctx, v1["id"], against=v1["id"])  # 자기 자신과는 비교할 수 있고 동일하다
    assert same.status_code == 200 and same.json()["data"]["summary"]["identical"] is True


def test_step_url_helper_is_still_valid_for_cloned_versions(client, ctx, ready):
    """복제본의 단계 PATCH가 원본과 독립적이라는 것을 diff로 확인한다."""
    v1 = approve_ready(client, ctx, ready)
    v2 = create_version(client, ctx)
    step_id = graph_of(client, ctx, v2["id"])["nodes"][1]["id"]
    r = client.patch(step_url(ctx, v2["id"], step_id), json={"label": "복사본 수정"},
                     headers=with_version(ctx, "editor", v2["row_version"]))
    assert r.status_code == 200
    data = diff(client, ctx, v2["id"], against=v1["id"]).json()["data"]
    assert [c["node_key"] for c in data["nodes"]["changed"]] == [
        graph_of(client, ctx, v2["id"])["nodes"][1]["node_key"]]
    assert data["nodes"]["changed"][0]["fields"][0]["field_path"] == "/label"


# --- BE-04c: 재료 spec·간선 spec 연결·완제품 지정 (CR be06) ---------------------------------------

def mspec(key, direction, **quantity):
    return {"spec_key": key, "direction": direction, **quantity}


def spec_step(equipment_id, *specs):
    return full_step(equipment_id, material_specs=list(specs))


def specs_graph(ctx, *, material=None):
    """src → 1단계 → 버퍼 → 2단계 → 완제품 milestone → sink. spec·간선 연결·완제품 지정이 모두 있는 그래프."""
    src = node("source", "src")
    first = node("operation", "insulate", display_order=1, step=spec_step(
        ctx["equipment"],
        mspec("raw", "input", weight_kg=known("3300"), unit_count=known(11), form="보빈",
              state_code="원자재", quantity_basis="per_operation", material_definition_id=material),
        mspec("bobbin", "output", length_m=known("1000"), unit_count=known(3), form="보빈",
              state_code="절연 후", quantity_basis="per_input_unit")))
    buf = node("buffer", "wait", asset_id=ctx["storage"], display_order=2)
    second = node("operation", "sheath", display_order=3, step=spec_step(
        ctx["equipment2"],
        mspec("in", "input", length_m=known("1000"), unit_count=known(1)),
        mspec("strands", "output", strand_count=known(12), form="가닥")))
    done = node("milestone", "complete", display_order=4)
    sink = node("sink", "sink", display_order=5)
    nodes = [src, first, buf, second, done, sink]
    edges = [edge(src, first, target_input_spec_key="raw"), edge(first, buf, source_output_spec_key="bobbin"),
             edge(buf, second, target_input_spec_key="in"),
             edge(second, done, source_output_spec_key="strands"), edge(done, sink)]
    return {"nodes": nodes, "edges": edges, "completion_node_id": done["id"]}, nodes


def spec_version(client, ctx, *, material=None):
    version = create_version(client, ctx)
    graph, nodes = specs_graph(ctx, material=material)
    r = put_graph(client, ctx, version, graph)
    assert r.status_code == 200, r.text
    return get_version(client, ctx, version["id"]), graph, nodes


def by_key(client, ctx, version_id):
    return {n["node_key"]: n for n in graph_of(client, ctx, version_id)["nodes"]}


def test_graph_with_specs_links_and_completion_roundtrips(client, ctx):
    version, graph, _nodes = spec_version(client, ctx)
    saved = graph_of(client, ctx, version["id"])
    assert saved["completion_node_id"] == graph["completion_node_id"] == version["completion_node_id"]
    first = by_key(client, ctx, version["id"])["insulate"]["step"]["material_specs"]
    assert [m["spec_key"] for m in first] == ["raw", "bobbin"]  # 입력이 출력보다 먼저
    raw, bobbin = first
    assert (raw["direction"], raw["weight_kg"], raw["unit_count"]) == (
        "input", known("3300"), known(11))
    assert raw["length_m"]["mode"] == "unknown" and raw["strand_count"]["mode"] == "unknown"  # 섞지 않는다
    assert (raw["form"], raw["state_code"], raw["quantity_basis"]) == ("보빈", "원자재", "per_operation")
    assert bobbin["length_m"] == known("1000") and bobbin["quantity_basis"] == "per_input_unit"
    strands = by_key(client, ctx, version["id"])["sheath"]["step"]["material_specs"][1]
    assert strands["strand_count"] == known(12) and strands["unit_count"]["mode"] == "unknown"
    links = {e["edge_key"]: (e["source_output_spec_key"], e["target_input_spec_key"]) for e in saved["edges"]}
    assert links == {"src-insulate": (None, "raw"), "insulate-wait": ("bobbin", None),
                     "wait-sheath": (None, "in"), "sheath-complete": ("strands", None),
                     "complete-sink": (None, None)}
    run = client.post(f"{base(ctx)}/process-versions/{version['id']}/validate?scope=run_template",
                      headers=ctx["viewer"]).json()["data"]
    assert run["error_count"] == 0  # 완제품이 지정된 확정 그래프는 실행 가능 판정도 오류가 없다
    assert {i["rule_id"] for i in run["issues"]} == {"VAL-VER-001", "VAL-VER-002"}


def test_spec_defaults_are_unknown_and_unknown_quantities_warn(client, ctx):
    version = create_version(client, ctx)
    graph, nodes = linear_graph(ctx, step=None)
    nodes[1]["step"]["material_specs"] = [mspec("in", "input"), mspec("out", "output", length_m=known("5"))]
    assert put_graph(client, ctx, version, graph).status_code == 200
    issues = get_version(client, ctx, version["id"])["issues"]
    found = [i for i in issues if i["rule_id"] == "VAL-SPEC-001"]
    assert [(i["severity"], i["field_path"], i["entity_id"]) for i in found] == [
        ("warning", "/material_specs/0", nodes[1]["id"])]  # 모두 미정인 spec 하나만 경고
    spec_in = by_key(client, ctx, version["id"])[nodes[1]["node_key"]]["step"]["material_specs"][0]
    assert spec_in["quantity_basis"] == "unknown" and spec_in["material_definition_id"] is None


@pytest.mark.parametrize("label", ["dup-key", "source-key", "target-key", "wrong-direction", "precedence",
                                   "completion-not-milestone", "completion-unknown-node", "extra-field",
                                   "string-count", "foreign-material"])
def test_spec_errors_are_rejected_without_saving_anything(client, ctx, label):
    version, _graph, nodes = spec_version(client, ctx)
    before = graph_of(client, ctx, version["id"])
    bad, nodes = specs_graph(ctx)
    ops = {n["node_key"]: n for n in nodes}
    other_project, _ = create_project(client, ctx["world"])
    foreign = client.post(f"{API}/projects/{other_project}/materials", headers=ctx["admin"],
                          json={"code": f"M-{uid()[:6]}", "name": "x", "form": "roll"}).json()["data"]["id"]
    expected = None
    if label == "dup-key":
        ops["insulate"]["step"]["material_specs"].append(mspec("raw", "output"))
    elif label == "source-key":
        bad["edges"][1]["source_output_spec_key"] = "raw"  # input spec을 출력으로 연결
        expected = ("VAL-SPEC-002", "/edges/1/source_output_spec_key")
    elif label == "target-key":
        bad["edges"][2]["target_input_spec_key"] = "nope"
        expected = ("VAL-SPEC-003", "/edges/2/target_input_spec_key")
    elif label == "wrong-direction":
        bad["edges"][0]["target_input_spec_key"] = "raw"
        bad["edges"][0]["source_output_spec_key"] = "raw"  # src는 단계가 아니라 spec이 없다
        expected = ("VAL-SPEC-002", "/edges/0/source_output_spec_key")
    elif label == "precedence":
        bad["edges"][1]["edge_kind"] = "precedence"
        expected = ("VAL-SPEC-004", "/edges/1/source_output_spec_key")
    elif label == "completion-not-milestone":
        bad["completion_node_id"] = ops["sink"]["id"]
        expected = ("VAL-GRAPH-005", "/completion_node_id")
    elif label == "completion-unknown-node":
        bad["completion_node_id"] = uid()
        expected = ("VAL-GRAPH-005", "/completion_node_id")
    elif label == "extra-field":
        ops["insulate"]["step"]["material_specs"][0]["extra"] = 1
    elif label == "string-count":
        ops["insulate"]["step"]["material_specs"][0]["unit_count"] = {"mode": "known", "value": "3"}
    else:
        ops["insulate"]["step"]["material_specs"][0]["material_definition_id"] = foreign
        expected = ("VAL-REF-006", "/nodes/1/step/material_specs/0/material_definition_id")
    current = get_version(client, ctx, version["id"])
    r = put_graph(client, ctx, current, bad)
    assert r.status_code == 422, r.text
    if expected:
        details = r.json()["error"]["details"]
        assert (expected[0], expected[1]) in {(d["rule_id"], d["field_path"]) for d in details}, details
    assert graph_of(client, ctx, version["id"]) == before  # 오류가 있으면 아무것도 바뀌지 않는다
    assert get_version(client, ctx, version["id"])["row_version"] == current["row_version"]


def test_material_of_the_same_project_can_be_referenced(client, ctx):
    material = client.post(f"{base(ctx)}/materials", headers=ctx["admin"],
                           json={"code": f"M-{uid()[:6]}", "name": "2t 롤", "form": "roll"}).json()["data"]["id"]
    version, _, _ = spec_version(client, ctx, material=material)
    raw = by_key(client, ctx, version["id"])["insulate"]["step"]["material_specs"][0]
    assert raw["material_definition_id"] == material


def test_put_without_the_new_fields_clears_them_because_put_replaces_everything(client, ctx):
    """0.5.0 이하 화면이 새 필드를 모르고 저장하면 spec·간선 연결·완제품 지정이 지워진다(계약 문서의 주의)."""
    version, graph, _ = spec_version(client, ctx)
    old_style = {"nodes": [{**n, "step": None if n.get("step") is None else {
        k: v for k, v in n["step"].items() if k != "material_specs"}} for n in graph["nodes"]],
        "edges": [{k: v for k, v in e.items() if not k.endswith("_spec_key")} for e in graph["edges"]]}
    current = get_version(client, ctx, version["id"])
    assert put_graph(client, ctx, current, old_style).status_code == 200
    saved = graph_of(client, ctx, version["id"])
    assert saved["completion_node_id"] is None
    assert all(not (n["step"] or {}).get("material_specs") for n in saved["nodes"])
    assert all(e["source_output_spec_key"] is None and e["target_input_spec_key"] is None
               for e in saved["edges"])


def patch_specs(client, ctx, version_id, step_id, specs, who="editor"):
    version = get_version(client, ctx, version_id)
    return client.patch(step_url(ctx, version_id, step_id), json={"material_specs": specs},
                        headers=with_version(ctx, who, version["row_version"]))


def test_patch_step_replaces_specs_and_keeps_edge_links_by_key(client, ctx):
    version, _, nodes = spec_version(client, ctx)
    step = nodes[1]
    before = {m["spec_key"]: m for m in step["step"]["material_specs"]}
    new = [{**before["raw"], "weight_kg": known("3500")},  # 같은 key는 값만 바뀐다(연결 유지)
           before["bobbin"], mspec("extra", "output", unit_count=known(2))]
    r = patch_specs(client, ctx, version["id"], step["id"], new)
    assert r.status_code == 200, r.text
    specs = {m["spec_key"]: m for m in r.json()["data"]["step"]["material_specs"]}
    assert set(specs) == {"raw", "bobbin", "extra"} and specs["raw"]["weight_kg"] == known("3500")
    links = {e["edge_key"]: (e["source_output_spec_key"], e["target_input_spec_key"])
             for e in graph_of(client, ctx, version["id"])["edges"]}
    assert links["src-insulate"] == (None, "raw") and links["insulate-wait"] == ("bobbin", None)
    # 다른 필드만 고치면 spec은 그대로다.
    current = get_version(client, ctx, version["id"])
    r = client.patch(step_url(ctx, version["id"], step["id"]), json={"label": "이름만"},
                     headers=with_version(ctx, "editor", current["row_version"]))
    assert r.status_code == 200 and len(r.json()["data"]["step"]["material_specs"]) == 3
    # 연결되지 않은 spec은 지울 수 있다.
    r = patch_specs(client, ctx, version["id"], step["id"], [new[0], new[1]])
    assert r.status_code == 200 and len(r.json()["data"]["step"]["material_specs"]) == 2


@pytest.mark.parametrize("change", ["remove-linked", "flip-direction", "clear-all"])
def test_patch_step_cannot_break_an_edge_linked_spec(client, ctx, change):
    version, _, nodes = spec_version(client, ctx)
    step = nodes[1]
    raw, bobbin = step["step"]["material_specs"]
    new = {"remove-linked": [raw], "flip-direction": [{**raw, "direction": "output"}, bobbin],
           "clear-all": []}[change]
    before = graph_of(client, ctx, version["id"])
    r = patch_specs(client, ctx, version["id"], step["id"], new)
    assert r.status_code == 422, r.text
    detail = r.json()["error"]["details"][0]
    assert detail["rule_id"] == "VAL-SPEC-005" and detail["field_path"] == "/material_specs"
    assert graph_of(client, ctx, version["id"]) == before


def test_patch_step_rejects_foreign_material_and_unknown_fields(client, ctx):
    version, _, nodes = spec_version(client, ctx)
    step = nodes[1]
    other_project, _ = create_project(client, ctx["world"])
    foreign = client.post(f"{API}/projects/{other_project}/materials", headers=ctx["admin"],
                          json={"code": f"M-{uid()[:6]}", "name": "x", "form": "roll"}).json()["data"]["id"]
    raw, bobbin = step["step"]["material_specs"]
    r = patch_specs(client, ctx, version["id"], step["id"],
                    [{**raw, "material_definition_id": foreign}, bobbin])
    assert r.status_code == 422
    assert r.json()["error"]["details"][0]["rule_id"] == "VAL-REF-006"
    assert r.json()["error"]["details"][0]["field_path"] == "/material_specs/0/material_definition_id"
    assert patch_specs(client, ctx, version["id"], step["id"], [{**raw, "x": 1}, bobbin]).status_code == 422


def test_specs_and_completion_are_frozen_after_submit_and_viewers_cannot_edit(client, ctx):
    version, graph, nodes = spec_version(client, ctx)
    step = nodes[1]
    assert patch_specs(client, ctx, version["id"], step["id"], [], who="viewer").status_code == 403
    submitted = advance(client, ctx, get_version(client, ctx, version["id"]), [("submit", "editor")])
    r = patch_specs(client, ctx, version["id"], step["id"], step["step"]["material_specs"])
    assert r.status_code == 409 and r.json()["error"]["code"] == "VERSION_IMMUTABLE"
    r = put_graph(client, ctx, submitted, {**graph, "completion_node_id": None})
    assert r.status_code == 409 and r.json()["error"]["code"] == "VERSION_IMMUTABLE"
    assert graph_of(client, ctx, version["id"])["completion_node_id"] == graph["completion_node_id"]


def test_new_draft_copies_specs_links_and_completion_with_new_ids(client, ctx):
    version, graph, _ = spec_version(client, ctx)
    first = advance(client, ctx, version, [("submit", "editor"), ("approve", "admin")])
    second = create_version(client, ctx)
    old, new = graph_of(client, ctx, first["id"]), graph_of(client, ctx, second["id"])
    assert second["completion_node_id"] == new["completion_node_id"] != old["completion_node_id"]
    new_keys = {n["id"]: n["node_key"] for n in new["nodes"]}
    old_keys = {n["id"]: n["node_key"] for n in old["nodes"]}
    assert new_keys[new["completion_node_id"]] == old_keys[old["completion_node_id"]] == "complete"
    assert [n["step"] for n in new["nodes"]] == [n["step"] for n in old["nodes"]]  # spec 내용 동일
    assert {e["edge_key"]: (e["source_output_spec_key"], e["target_input_spec_key"]) for e in new["edges"]} \
        == {e["edge_key"]: (e["source_output_spec_key"], e["target_input_spec_key"]) for e in old["edges"]}
    # 복사본의 spec을 고쳐도 원본은 그대로다.
    insulate = next(n for n in new["nodes"] if n["node_key"] == "insulate")
    r = patch_specs(client, ctx, second["id"], insulate["id"],
                    [{**insulate["step"]["material_specs"][0], "weight_kg": known("1")},
                     insulate["step"]["material_specs"][1]])
    assert r.status_code == 200
    assert by_key(client, ctx, first["id"])["insulate"]["step"]["material_specs"][0]["weight_kg"] == known("3300")
    assert graph["completion_node_id"] in {n["id"] for n in old["nodes"]}


def test_diff_reports_spec_link_and_completion_changes(client, ctx):
    version, _, _ = spec_version(client, ctx)
    first = advance(client, ctx, version, [("submit", "editor"), ("approve", "admin")])
    second = create_version(client, ctx)
    assert client.get(f"{base(ctx)}/process-versions/{second['id']}/diff",
                      headers=ctx["viewer"]).json()["data"]["summary"]["identical"] is True
    insulate = by_key(client, ctx, second["id"])["insulate"]
    specs = insulate["step"]["material_specs"]
    assert patch_specs(client, ctx, second["id"], insulate["id"],
                       [specs[0], {**specs[1], "length_m": known("1200")}]).status_code == 200
    saved = graph_of(client, ctx, second["id"])
    cleared = {"nodes": saved["nodes"], "completion_node_id": None,
               "edges": [{**e, "target_input_spec_key": None} if e["edge_key"] == "src-insulate" else e
                         for e in saved["edges"]]}
    assert put_graph(client, ctx, get_version(client, ctx, second["id"]), cleared).status_code == 200
    data = client.get(f"{base(ctx)}/process-versions/{second['id']}/diff?against={first['id']}",
                      headers=ctx["viewer"]).json()["data"]
    header = {f["field_path"]: (f["change"], f["before"], f["after"]) for f in data["header"]}
    assert header == {"/completion_node_key": ("changed", "complete", None)}  # id가 아니라 node_key로 비교
    (step_change,) = data["steps"]["changed"]
    fields = {f["field_path"]: (f["before"], f["after"]) for f in step_change["fields"]}
    assert fields == {"/material_specs/bobbin/length_m/value": ("1000", "1200")}
    (edge_change,) = data["edges"]["changed"]
    assert edge_change["edge_key"] == "src-insulate"
    assert edge_change["fields"] == [{"field_path": "/target_input_spec_key", "change": "changed",
                                      "before": "raw", "after": None}]


def test_graph_save_audit_records_the_completion_node(client, db, ctx):
    version, graph, _ = spec_version(client, ctx)
    after = db.scalar("select after->>'completion_node_id' from audit_log where entity_id = :e and "
                      "action = 'process_version.graph' order by created_at desc limit 1",
                      e=uuid.UUID(version["id"]))
    assert after == graph["completion_node_id"]


# --- 엔진 연결(C0): API가 돌려주는 공정을 그대로 snapshot으로 읽어 컴파일·실행한다 --------------------

def test_api_process_graph_compiles_and_runs_in_the_engine(client, ctx):
    from fractions import Fraction

    from simulation_platform.simulation.compiler import (
        ProcessSnapshot,
        ScenarioAssumptions,
        compile_snapshot,
    )
    from simulation_platform.simulation.runtime import Arrival, run_model

    split = full_step(
        ctx["equipment"], operation_type="split_length",
        output_rule={"mode": "split_length", "unit_form": "보빈", "length_m": known("1000"),
                     "unit_count": known(2), "quantity_basis": "per_input_unit",
                     "schedule": "sequential_units", "accounting_mode": "physical"},
        material_specs=[mspec("out", "output", state_code="절연 후", form="보빈",
                              length_m=known("1000"), unit_count=known(2))])
    src, wait = node("source", "src"), node("buffer", "wait", asset_id=ctx["storage"], display_order=1)
    first = node("operation", "insulate", step=split, display_order=2)
    done, sink = node("milestone", "complete", display_order=3), node("sink", "sink", display_order=4)
    nodes = [src, wait, first, done, sink]
    graph = {"nodes": nodes, "edges": [edge(a, b) for a, b in itertools.pairwise(nodes)],
             "completion_node_id": done["id"]}
    version = create_version(client, ctx)
    assert put_graph(client, ctx, version, graph).status_code == 200
    detail, saved = get_version(client, ctx, version["id"]), graph_of(client, ctx, version["id"])

    snapshot = ProcessSnapshot.from_api(detail, saved)
    assumptions = ScenarioAssumptions(equipment_hold="hold_for_operation", unbounded_buffers=True)
    result = compile_snapshot(snapshot, assumptions, allow_unapproved=True)
    assert result.ok, result.issues
    model = result.require_model()
    assert model.completion_key == "complete" and model.steps["insulate"].candidates == (ctx["equipment"],)
    assert model.steps["insulate"].output.state_code == "절연 후"  # 단계 재료 spec의 상태가 산출 작업물에 붙는다
    run = run_model(model, [Arrival("2000")])
    assert run.state == "completed"
    assert [e.sim_time for e in run.of_type("OUTPUT_UNIT_READY")] == [Fraction(100, 3), Fraction(200, 3)]
    assert [e.reason for e in run.of_type("MILESTONE_REACHED")] == ["completion", "completion"]
    # 승인되지 않은 버전은 기본적으로 실행할 수 없다
    assert [i.rule_id for i in compile_snapshot(snapshot, assumptions).issues] == ["VERSION_NOT_APPROVED"]


def test_empty_process_is_not_runnable_but_still_approvable_dec005(client, ctx):
    """DEC-005(계약 0.6.1): 노드가 없는 초안은 run_template에서 오류 1(VAL-GRAPH-010), knowledge는 오류 0."""
    version = create_version(client, ctx)
    url = f"{base(ctx)}/process-versions/{version['id']}/validate"
    knowledge = client.post(url, headers=ctx["viewer"]).json()["data"]
    assert knowledge["error_count"] == 0  # 승인(지식 등록)을 막지 않는다
    run = client.post(f"{url}?scope=run_template", headers=ctx["viewer"]).json()["data"]
    assert [i["rule_id"] for i in run["issues"] if i["severity"] == "error"] == ["VAL-GRAPH-010"]
    assert run["issues"][0]["field_path"] == "/nodes"
