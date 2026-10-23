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


def test_fully_specified_graph_has_only_unit_spec_warnings(client, ready):
    version, _, _ = ready
    assert {i["rule_id"] for i in version["issues"]} == {"VAL-VER-001", "VAL-VER-002"}


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
    assert run["error_count"] == 0  # 확정된 그래프는 실행 가능 판정도 오류 없음(원자재 단위 미정은 경고)
    assert {i["rule_id"] for i in run["issues"]} == {"VAL-VER-001", "VAL-VER-002"}
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
