"""승인 scope의 계약 예제를 실제 API 응답에서 생성한다(손으로 쓴 예제와 구현의 불일치 방지).

사용: python scripts/generate_contract_examples.py <출력 디렉터리>
대상 DB는 TEST_DATABASE_URL(기본: 로컬 simulation_platform_test, 이름이 `_test`로 끝나야 함).
스키마는 이미 head여야 한다(통합 테스트가 만든 상태). UUID·시각은 고정값으로 치환한다.
"""

import itertools
import json
import os
import re
import sys
import uuid
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from simulation_platform.api.app import create_app
from simulation_platform.db import get_session
from simulation_platform.settings import Settings, get_settings

DEFAULT_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:5432/simulation_platform_test"
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
TS_RE = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z")


class Normalizer:
    """등장 순서대로 UUID를 00000000-0000-4000-8000-0000000000NN으로 치환한다."""

    def __init__(self) -> None:
        self.map: dict[str, str] = {}

    def __call__(self, value):
        text_value = json.dumps(value, ensure_ascii=False)

        def uuid_sub(m):
            return self.map.setdefault(
                m.group(0), f"00000000-0000-4000-8000-{len(self.map) + 1:012d}")

        text_value = UUID_RE.sub(uuid_sub, text_value)
        text_value = TS_RE.sub("2026-10-23T00:00:00Z", text_value)
        text_value = re.sub(r'"req-[0-9a-f]{32}"', '"req-example"', text_value)
        text_value = re.sub(r'"next_cursor": "[^"]+"', '"next_cursor": "opaque-cursor-example"',
                            text_value)
        return json.loads(text_value)


def main(out_dir: Path) -> None:
    url = os.environ.get("TEST_DATABASE_URL", DEFAULT_URL)
    if not (make_url(url).database or "").endswith("_test"):
        raise SystemExit("테스트 DB(`_test`)만 사용할 수 있습니다.")
    engine = create_engine(url)
    org, admin = uuid.uuid4(), uuid.uuid4()
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO organization (id,name,code) VALUES (:i,'예시 조직',:c)"),
                     {"i": org, "c": f"example-{org}"})
        conn.execute(text("INSERT INTO app_user (id,auth_issuer,auth_subject,display_name) "
                          "VALUES (:i,'example',:s,'예시 사용자')"), {"i": admin, "s": str(admin)})
        conn.execute(text("INSERT INTO organization_member (id,organization_id,user_id,role) "
                          "VALUES (:i,:o,:u,'admin')"), {"i": uuid.uuid4(), "o": org, "u": admin})

    app = create_app()

    def _session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_settings] = lambda: Settings(
        app_env="test", auth_mode="local", _env_file=None)
    client = TestClient(app)
    base = {"X-Debug-User": str(admin)}
    norm = Normalizer()
    out_dir.mkdir(parents=True, exist_ok=True)
    api = "/api/v1"

    def record(name, method, path, response, request_body=None, request_headers=None):
        canonical = {"etag": "ETag", "location": "Location"}
        headers = {canonical[k]: v for k, v in response.headers.items() if k in canonical}
        example = {
            "request": {"method": method, "path": path,
                        **({"headers": request_headers} if request_headers else {}),
                        **({"body": request_body} if request_body is not None else {})},
            "response": {"status": response.status_code,
                         **({"headers": headers} if headers else {}),
                         "body": response.json()},
        }
        (out_dir / f"{name}.json").write_text(
            json.dumps(norm(example), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8", newline="\n")

    proj_body = {"organization_id": str(org), "code": "DEMO-WIRE", "name": "전선 공장 예제",
                 "timezone": "Asia/Seoul", "description": "예제 프로젝트"}
    r = client.post(f"{api}/projects", json=proj_body, headers=base)
    record("project.create", "POST", f"{api}/projects", r, proj_body)
    pid = r.json()["data"]["id"]
    assets = f"{api}/projects/{pid}/assets"

    eq_body = {"kind": "equipment", "code": "EQ-001", "name": "실리콘 절연 압출기",
               "sort_order": 10, "equipment": {"equipment_type": "extruder"}}
    r = client.post(assets, json=eq_body, headers=base)
    record("asset.create.equipment", "POST", assets, r, eq_body)
    eq_id = r.json()["data"]["id"]

    st_body = {"kind": "storage", "code": "ST-001", "name": "원자재 보관 공간",
               "sort_order": 20, "space": {"space_type": "storage"}}
    r = client.post(assets, json=st_body, headers=base)
    record("asset.create.storage", "POST", assets, r, st_body)

    r = client.get(f"{assets}?limit=1", headers=base)
    record("asset.list", "GET", f"{assets}?limit=1", r)

    patch_body = {"name": "실리콘 절연 압출기(수정)", "external_ref": "ERP-0001",
                  "equipment": {"model_name": "EX-100"}}
    target = f"{assets}/{eq_id}"
    r = client.patch(target, json=patch_body, headers={**base, "If-Match": '"1"'})
    record("asset.patch", "PATCH", target, r, patch_body, {"If-Match": '"1"'})

    r = client.patch(target, json={"name": "충돌"}, headers={**base, "If-Match": '"1"'})
    record("error.edit-conflict", "PATCH", target, r, {"name": "충돌"}, {"If-Match": '"1"'})
    r = client.patch(target, json={"name": "헤더 없음"}, headers=base)
    record("error.precondition-required", "PATCH", target, r, {"name": "헤더 없음"})
    dup = {**eq_body, "name": "중복 코드"}
    r = client.post(assets, json=dup, headers=base)
    record("error.asset-code-conflict", "POST", assets, r, dup)
    bad = {"kind": "equipment", "code": "EQ-002", "name": "상세 누락"}
    r = client.post(assets, json=bad, headers=base)
    record("error.validation", "POST", assets, r, bad)
    missing = f"{assets}/{uuid.uuid4()}"
    r = client.get(missing, headers=base)
    record("error.not-found", "GET", missing, r)

    # --- asset-revisions (contract 0.2.0) ---------------------------------------------
    def match(version):
        return {**base, "If-Match": f'"{version}"'}

    revisions_url = f"{assets}/{eq_id}/revisions"
    r = client.post(revisions_url, headers=base)
    record("revision.create.equipment", "POST", revisions_url, r)
    rev = r.json()["data"]
    rev_path = f"{api}/projects/{pid}/asset-revisions/{rev['id']}"
    port_in, port_out = (p["port_id"] for p in rev["ports"])

    r = client.post(revisions_url, headers=base)
    record("error.revision-draft-exists", "POST", revisions_url, r)

    zero_capacity = {"ports": [{"port_id": port_in, "buffer_capacity": {
        "mode": "finite", "value": "0", "unit": "item"}}]}
    r = client.patch(rev_path, json=zero_capacity, headers=match(1))
    record("error.validation-capacity", "PATCH", rev_path, r, zero_capacity, {"If-Match": '"1"'})

    patch_rev = {"ports": [
        {"port_id": port_in, "buffer_capacity": {"mode": "finite", "value": "4", "unit": "item"}},
        {"port_id": port_out, "buffer_capacity": {"mode": "not_allowed"},
         "release_rule": {"mode": "when_destination_accepts",
                          "block_machine_while_waiting": "yes"}}]}
    r = client.patch(rev_path, json=patch_rev, headers=match(1))
    record("revision.patch.equipment", "PATCH", rev_path, r, patch_rev, {"If-Match": '"1"'})

    r = client.post(f"{rev_path}/submit", headers=match(2))
    record("revision.submit", "POST", f"{rev_path}/submit", r, None, {"If-Match": '"2"'})
    r = client.patch(rev_path, json={"notes": "검토 중 수정"}, headers=match(3))
    record("error.version-immutable", "PATCH", rev_path, r, {"notes": "검토 중 수정"},
           {"If-Match": '"3"'})
    r = client.post(f"{rev_path}/approve", headers=match(3))
    record("revision.approve", "POST", f"{rev_path}/approve", r, None, {"If-Match": '"3"'})

    # 반려 흐름은 공간 자산으로 보여 준다(draft → in_review → draft).
    st_id = client.get(f"{assets}?kind=storage", headers=base).json()["data"][0]["id"]
    r = client.post(f"{assets}/{st_id}/revisions", headers=base)
    record("revision.create.storage", "POST", f"{assets}/{st_id}/revisions", r)
    st_rev = r.json()["data"]
    st_path = f"{api}/projects/{pid}/asset-revisions/{st_rev['id']}"
    r = client.post(f"{st_path}/approve", headers=match(1))
    record("error.invalid-state-transition", "POST", f"{st_path}/approve", r, None,
           {"If-Match": '"1"'})
    client.post(f"{st_path}/submit", headers=match(1))
    reject_body = {"reason": "저장 용량의 근거가 필요합니다."}
    r = client.post(f"{st_path}/reject", json=reject_body, headers=match(2))
    record("revision.reject", "POST", f"{st_path}/reject", r, reject_body, {"If-Match": '"2"'})

    # 승인본이 있는 설비의 새 초안(값 복사) 후 목록과 자산 요약을 보여 준다.
    client.post(revisions_url, headers=base)
    r = client.get(f"{revisions_url}?limit=1", headers=base)
    record("revision.list", "GET", f"{revisions_url}?limit=1", r)
    r = client.get(target, headers=base)
    record("asset.get", "GET", target, r)

    # --- products-materials, /me status (contract 0.3.0) --------------------------------
    r = client.get(f"{api}/me", headers=base)
    record("me.get", "GET", f"{api}/me", r)

    products = f"{api}/projects/{pid}/products"
    product_body = {"code": "P-001", "name": "[시험] 제품 예시",
                    "specification": "규격은 자유 텍스트입니다(null이면 미정)."}
    r = client.post(products, json=product_body, headers=base)
    record("product.create", "POST", products, r, product_body)
    product_path = f"{products}/{r.json()['data']['id']}"
    r = client.post(products, json=product_body, headers=base)
    record("error.product-code-conflict", "POST", products, r, product_body)
    client.post(products, json={"code": "P-002", "name": "[시험] 제품 2"}, headers=base)
    r = client.get(f"{products}?limit=1", headers=base)
    record("product.list", "GET", f"{products}?limit=1", r)
    product_patch = {"name": "[시험] 제품 예시(수정)", "specification": None}
    r = client.patch(product_path, json=product_patch, headers=match(1))
    record("product.patch", "PATCH", product_path, r, product_patch, {"If-Match": '"1"'})

    materials = f"{api}/projects/{pid}/materials"
    material_body = {"code": "M-001", "name": "[시험] 원자재 롤", "form": "롤",
                     "default_spec": {"length_m": {"mode": "known", "value": "3000"},
                                      "weight_kg": {"mode": "known", "value": "2000"}}}
    r = client.post(materials, json=material_body, headers=base)
    record("material.create", "POST", materials, r, material_body)
    material_path = f"{materials}/{r.json()['data']['id']}"
    zero_length = {"default_spec": {"length_m": {"mode": "known", "value": "0"}}}
    r = client.patch(material_path, json=zero_length, headers=match(1))
    record("error.validation-default-spec", "PATCH", material_path, r, zero_length,
           {"If-Match": '"1"'})
    material_patch = {"default_spec": {"unit_count": {"mode": "known", "value": 10}}}
    r = client.patch(material_path, json=material_patch, headers=match(1))
    record("material.patch", "PATCH", material_path, r, material_patch, {"If-Match": '"1"'})

    # --- process-versions (contract 0.4.0) ------------------------------------------------
    versions_url = f"{product_path}/process-versions"
    r = client.post(versions_url, headers=base)
    record("process-version.create", "POST", versions_url, r)
    version_path = f"{api}/projects/{pid}/process-versions/{r.json()['data']['id']}"
    r = client.post(versions_url, headers=base)
    record("error.process-draft-exists", "POST", versions_url, r)

    def known(value):
        return {"mode": "known", "value": value}

    def operation(key, order, equipment_id):
        return {"id": str(uuid.uuid4()), "node_key": key, "kind": "operation", "label": f"[시험] {key}",
                "display_order": order, "step": {
                    "operation_type": "output_units_by_time", "handler_version": "1",
                    "timing_rule": {
                        "processing": {"kind": "output_speed", "speed_m_per_min": known("30"),
                                       "basis": "per_stream", "output_schedule": "sequential_units",
                                       "parallel_streams": known(1)},
                        "setup": {"duration_min": {"mode": "not_applicable"},
                                  "trigger": "not_applicable"},
                        "precondition_delay": {"duration_min": {"mode": "not_applicable"},
                                               "trigger": "not_applicable", "occupancy": "unknown"}},
                    "input_rule": {"acquire_scope": "per_operation", "consume_policy": "consume"},
                    "output_rule": {"mode": "configured_units", "length_m": known("1000"),
                                    "unit_count": known(2), "quantity_basis": "per_operation",
                                    "schedule": "sequential_units", "accounting_mode": "physical"},
                    "handoff_rule": {"mode": "per_output_unit"},
                    "resources": [{"role_key": "main", "candidates": [
                        {"asset_id": equipment_id, "eligibility_status": "confirmed"}]}]}}

    nodes = [
        {"id": str(uuid.uuid4()), "node_key": "src", "kind": "source", "label": "[시험] 원자재",
         "display_order": 0},
        operation("insulate", 1, eq_id),
        {"id": str(uuid.uuid4()), "node_key": "wait", "kind": "buffer", "label": "[시험] 대기 공간",
         "asset_id": st_id, "display_order": 2},
        operation("sheath", 3, eq_id),
        {"id": str(uuid.uuid4()), "node_key": "sink", "kind": "sink", "label": "[시험] 완제품",
         "display_order": 4},
    ]
    edges = [{"id": str(uuid.uuid4()), "edge_key": f"{a['node_key']}-{b['node_key']}",
              "from_node_id": a["id"], "to_node_id": b["id"], "edge_kind": "material"}
             for a, b in itertools.pairwise(nodes)]
    dangling = {"nodes": nodes[:2], "edges": [{**edges[1], "id": str(uuid.uuid4())}]}
    r = client.put(f"{version_path}/graph", json=dangling, headers=match(1))
    record("error.graph-invalid", "PUT", f"{version_path}/graph", r, dangling, {"If-Match": '"1"'})
    graph = {"nodes": nodes, "edges": edges}
    r = client.put(f"{version_path}/graph", json=graph, headers=match(1))
    record("process-graph.put", "PUT", f"{version_path}/graph", r, graph, {"If-Match": '"1"'})
    step_patch = {"label": "[시험] 절연(수정)",
                  "timing_rule": {"processing": {"kind": "none"}}}
    step_path = f"{version_path}/steps/{nodes[1]['id']}"
    r = client.patch(step_path, json=step_patch, headers=match(2))
    record("process-step.patch", "PATCH", step_path, r, step_patch, {"If-Match": '"2"'})
    r = client.post(f"{version_path}/validate?scope=run_template", headers=base)
    record("process-validate.run-template", "POST", f"{version_path}/validate?scope=run_template", r)
    r = client.post(f"{version_path}/submit", headers=match(3))
    record("process-version.submit", "POST", f"{version_path}/submit", r, None, {"If-Match": '"3"'})
    r = client.post(f"{version_path}/approve", headers=match(4))
    record("process-version.approve", "POST", f"{version_path}/approve", r, None, {"If-Match": '"4"'})
    r = client.get(versions_url, headers=base)
    record("process-version.list", "GET", versions_url, r)
    r = client.get(product_path, headers=base)
    record("product.get", "GET", product_path, r)

    # --- 복제 기준 선택·비교·편집기 상태 (contract 0.5.0) --------------------------------------
    version_id = version_path.rsplit("/", 1)[1]
    editor_path = f"{version_path}/editor-state"
    r = client.get(editor_path, headers=base)
    record("process-editor-state.get", "GET", editor_path, r)
    state = {"node_positions": {n["id"]: {"x": 160.0 * i, "y": 80.0} for i, n in enumerate(nodes)},
             "viewport": {"x": 0, "y": 0, "zoom": 1}}
    r = client.put(editor_path, json=state, headers=match(0))  # 승인본에도 저장된다
    record("process-editor-state.put", "PUT", editor_path, r, state, {"If-Match": '"0"'})
    from_base = {"base_version_id": version_id}
    r = client.post(versions_url, json=from_base, headers=base)
    record("process-version.create-from-base", "POST", versions_url, r, from_base)
    draft = r.json()["data"]
    draft_path = f"{api}/projects/{pid}/process-versions/{draft['id']}"
    r = client.patch(draft_path, json={"notes": "[시험] 절연 속도 검토"},
                     headers=match(draft["row_version"]))
    draft_nodes = client.get(f"{draft_path}/graph", headers=base).json()["data"]["nodes"]
    draft_step = next(n["id"] for n in draft_nodes if n["kind"] == "operation")
    faster = {"label": "[시험] 절연(속도 상향)", "timing_rule": {"processing": {
        "kind": "output_speed", "speed_m_per_min": known("45"), "basis": "per_stream",
        "output_schedule": "sequential_units", "parallel_streams": known(1)}}}
    r = client.patch(f"{draft_path}/steps/{draft_step}", json=faster, headers=match(2))
    diff_path = f"{draft_path}/diff?against={version_id}"
    r = client.get(diff_path, headers=base)
    record("process-version.diff", "GET", diff_path, r)

    # --- 재료 spec·간선 spec 연결·완제품 지정 (contract 0.6.0) ------------------------------------
    r = client.post(products, json={"code": "P-003", "name": "[시험] 제품 3 (재료 spec 예시)"}, headers=base)
    spec_versions = f"{products}/{r.json()['data']['id']}/process-versions"
    r = client.post(spec_versions, headers=base)
    spec_path = f"{api}/projects/{pid}/process-versions/{r.json()['data']['id']}"

    def mspec(key, direction, **fields):
        return {"spec_key": key, "direction": direction, **fields}

    first = operation("insulate", 1, eq_id)
    first["step"]["material_specs"] = [
        mspec("raw", "input", state_code="원자재", form="보빈", weight_kg=known("3300"),
              unit_count=known(11), quantity_basis="per_operation"),
        mspec("bobbin", "output", state_code="절연 후", form="보빈", length_m=known("1000"),
              unit_count=known(3), quantity_basis="per_input_unit")]
    second = operation("sheath", 3, eq_id)
    second["step"]["material_specs"] = [
        mspec("in", "input", state_code="절연 후", length_m=known("1000"), unit_count=known(1)),
        mspec("strands", "output", state_code="공급 준비", form="가닥", strand_count=known(12))]
    done = {"id": str(uuid.uuid4()), "node_key": "complete", "kind": "milestone",
            "label": "[시험] 완제품(쉬스 완료)", "display_order": 4}
    spec_nodes = [
        {"id": str(uuid.uuid4()), "node_key": "src", "kind": "source", "label": "[시험] 원자재",
         "display_order": 0},
        first,
        {"id": str(uuid.uuid4()), "node_key": "wait", "kind": "buffer", "label": "[시험] 대기 공간",
         "asset_id": st_id, "display_order": 2},
        second, done,
        {"id": str(uuid.uuid4()), "node_key": "sink", "kind": "sink", "label": "[시험] 출고",
         "display_order": 5}]

    def link(a, b, **keys):
        return {"id": str(uuid.uuid4()), "edge_key": f"{a['node_key']}-{b['node_key']}",
                "from_node_id": a["id"], "to_node_id": b["id"], "edge_kind": "material", **keys}

    spec_edges = [
        link(spec_nodes[0], first, target_input_spec_key="raw"),
        link(first, spec_nodes[2], source_output_spec_key="bobbin"),
        link(spec_nodes[2], second, target_input_spec_key="in"),
        link(second, done, source_output_spec_key="strands"),
        link(done, spec_nodes[5])]
    bad_link = {"nodes": spec_nodes, "edges": [
        spec_edges[0], {**spec_edges[1], "id": str(uuid.uuid4()), "source_output_spec_key": "raw"},
        *spec_edges[2:]], "completion_node_id": done["id"]}  # raw는 input spec이라 출력으로 연결할 수 없다
    r = client.put(f"{spec_path}/graph", json=bad_link, headers=match(1))
    record("error.spec-link-invalid", "PUT", f"{spec_path}/graph", r, bad_link, {"If-Match": '"1"'})
    with_specs = {"nodes": spec_nodes, "edges": spec_edges, "completion_node_id": done["id"]}
    r = client.put(f"{spec_path}/graph", json=with_specs, headers=match(1))
    record("process-graph.put-with-specs", "PUT", f"{spec_path}/graph", r, with_specs, {"If-Match": '"1"'})
    revised = {"material_specs": [
        first["step"]["material_specs"][0],
        {**first["step"]["material_specs"][1], "length_m": known("1200")},
        mspec("scrap", "output", state_code="폐기", weight_kg=known("300"))]}
    spec_step_path = f"{spec_path}/steps/{first['id']}"
    r = client.patch(spec_step_path, json=revised, headers=match(2))
    record("process-step.patch-material-specs", "PATCH", spec_step_path, r, revised, {"If-Match": '"2"'})

    # --- 시나리오 버전·실행 사전검증 (contract 0.7.0) -------------------------------------------------
    scenarios = f"{api}/projects/{pid}/scenarios"
    scenario_body = {"code": "S-001", "name": "[시험] 2교대 기준 시나리오", "description": "예제"}
    r = client.post(scenarios, json=scenario_body, headers=base)
    record("scenario.create", "POST", scenarios, r, scenario_body)
    scenario_version_path = f"{api}/projects/{pid}/scenario-versions/{r.json()['data']['latest_version']['id']}"
    product_id = product_path.rsplit("/", 1)[1]
    scenario_patch = {
        "products": [{"product_id": product_id, "process_version_id": version_id, "priority": 1,
                      "arrivals": [{"at_min": "0", "count": 2, "length_m": "2000", "lot": "LOT-1"}],
                      "assumptions": {"unbounded_buffers": True}}],
        "stopping_rule": {"mode": "fixed_horizon", "horizon_min": "960"},
        "assumption_reason": "[시험] 대기 공간 용량 확인 전 임시 가정"}
    r = client.patch(scenario_version_path, json=scenario_patch, headers=match(1))
    record("scenario-version.patch", "PATCH", scenario_version_path, r, scenario_patch, {"If-Match": '"1"'})
    r = client.post(f"{scenario_version_path}/validate", headers=base)
    record("scenario-version.validate", "POST", f"{scenario_version_path}/validate", r)
    r = client.post(f"{scenario_version_path}/approve", headers=match(2))
    record("error.scenario-not-runnable", "POST", f"{scenario_version_path}/approve", r, None,
           {"If-Match": '"2"'})
    print(f"{len(list(out_dir.glob('*.json')))} examples -> {out_dir}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
