"""T7: 공정 버전 승인 흐름과 불변성. 실제 서버·전용 DB에서 매번 새 제품으로 실행한다(시드 공정은 건드리지 않는다)."""

import uuid

import pytest

from conftest import PROJECT_A, RUN, data, error_code


def _graph(asset_id: str, label: str) -> dict:
    return {
        "nodes": [{
            "id": str(uuid.uuid4()), "node_key": "step1", "kind": "operation", "label": label, "display_order": 0,
            "step": {
                "operation_type": "output_units_by_time", "handler_version": "1",
                "timing_rule": {"processing": {
                    "kind": "output_speed", "speed_m_per_min": {"mode": "known", "value": "30"},
                    "basis": "per_stream", "output_schedule": "sequential_units",
                    "parallel_streams": {"mode": "known", "value": 1}}},
                "resources": [{
                    "role_key": "main", "resource_kind": "equipment", "selection_mode": "one_of", "required_count": 1,
                    "capacity_mode": "finite", "allocation_rule": {"mode": "unknown"},
                    "candidates": [{"asset_id": asset_id, "eligibility_status": "confirmed"}]}],
            },
        }],
        "edges": [],
    }


@pytest.fixture(scope="module")
def flow(clients):
    admin = clients["admin"]
    eq = next(a for a in data(admin.get(f"/projects/{PROJECT_A}/assets", params={"q": "EQ-001"})) if a["code"] == "EQ-001")
    product = data(admin.post(f"/projects/{PROJECT_A}/products", {"code": f"INT{RUN}-T7", "name": "[INT] T7 승인 흐름"}), 201)
    return {"admin": admin, "product": product, "eq": eq["id"], "base": f"/projects/{PROJECT_A}"}


def _pv(flow, vid):
    return f"{flow['base']}/process-versions/{vid}"


def test_t7_full_lifecycle_approve_immutable_supersede(flow, clients):
    admin, pid, base = flow["admin"], flow["product"]["id"], flow["base"]
    # 새 초안 → 그래프 저장 → knowledge 검증(오류 0)
    created = admin.post(f"{base}/products/{pid}/process-versions")
    v1 = data(created, 201)["id"]
    put = admin.put(f"{_pv(flow, v1)}/graph", _graph(flow["eq"], "[INT] 단계1"), etag=created.headers["etag"])
    assert data(put)["nodes"][0]["node_key"] == "step1"
    knowledge = data(admin.post(f"{_pv(flow, v1)}/validate", params={"scope": "knowledge"}))
    assert knowledge["error_count"] == 0

    # 제출 → 역할·If-Match 규칙 → 관리자 승인
    sub = admin.post(f"{_pv(flow, v1)}/submit", etag=put.headers["etag"])
    assert data(sub)["status"] == "in_review"
    et = sub.headers["etag"]
    assert clients["editor"].post(f"{_pv(flow, v1)}/approve", etag=et).status_code == 403
    assert clients["viewer"].post(f"{_pv(flow, v1)}/approve", etag=et).status_code == 403
    assert error_code(admin.post(f"{_pv(flow, v1)}/approve")) == "PRECONDITION_REQUIRED"
    assert error_code(admin.post(f"{_pv(flow, v1)}/approve", etag='"1"')) == "EDIT_CONFLICT"
    approved = admin.post(f"{_pv(flow, v1)}/approve", etag=et)
    assert data(approved)["status"] == "approved"

    # 승인본은 수정할 수 없다. 제품 요약의 현재 승인본이 이 버전이다.
    again = admin.put(f"{_pv(flow, v1)}/graph", _graph(flow["eq"], "[INT] 변조 시도"), etag=approved.headers["etag"])
    assert again.status_code == 409 and error_code(again) == "VERSION_IMMUTABLE"
    assert data(admin.get(f"{_pv(flow, v1)}/graph"))["nodes"][0]["label"] == "[INT] 단계1"  # 변조되지 않았다.
    summary = data(admin.get(f"{base}/products/{pid}"))
    assert summary["current_process_version"]["id"] == v1 and summary["current_process_version"]["status"] == "approved"

    # 승인본에서 새 초안: base_version_id 기록, 그래프는 새 id로 복사, 열린 버전이 있으면 409
    nxt = admin.post(f"{base}/products/{pid}/process-versions")
    v2 = data(nxt, 201)
    assert v2["base_version_id"] == v1
    g1 = data(admin.get(f"{_pv(flow, v1)}/graph"))
    g2 = data(admin.get(f"{_pv(flow, v2['id'])}/graph"))
    assert [n["label"] for n in g2["nodes"]] == [n["label"] for n in g1["nodes"]]
    assert not {n["id"] for n in g2["nodes"]} & {n["id"] for n in g1["nodes"]}
    dup = admin.post(f"{base}/products/{pid}/process-versions")
    assert dup.status_code == 409 and error_code(dup) == "PROCESS_DRAFT_EXISTS"

    # 두 번째 버전 승인 시 이전 승인본은 superseded
    sub2 = admin.post(f"{_pv(flow, v2['id'])}/submit", etag=nxt.headers["etag"])
    assert data(admin.post(f"{_pv(flow, v2['id'])}/approve", etag=sub2.headers["etag"]))["status"] == "approved"
    versions = data(admin.get(f"{base}/products/{pid}/process-versions", params={"limit": 200}))
    assert [(v["version_no"], v["status"]) for v in versions] == [(2, "approved"), (1, "superseded")]


def test_t7_unresolved_values_stay_unknown_after_save(flow):
    """미정 값은 저장·재조회에서 0이나 빈 값으로 바뀌지 않는다(시드 공정 P04 읽기)."""
    admin = flow["admin"]
    from conftest import PROJECT_WIRE
    p04 = next(p for p in data(admin.get(f"/projects/{PROJECT_WIRE}/products", params={"q": "P04"})) if p["code"] == "P04")
    graph = data(admin.get(f"/projects/{PROJECT_WIRE}/process-versions/{p04['latest_process_version']['id']}/graph"))
    steps = [n["step"] for n in graph["nodes"] if n.get("step")]
    weights = [s["output_rule"]["weight_kg"] for s in steps if s["output_rule"].get("weight_kg")]
    assert any(w["mode"] == "unknown" and w["value"] is None for w in weights)  # 미정은 value가 null이고 0이 아니다.
    assert not any(w["mode"] == "unknown" and w["value"] in (0, "0") for w in weights)
