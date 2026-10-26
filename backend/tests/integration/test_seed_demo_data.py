"""시험 데이터 시드(BE-REQ-006)가 FE가 요청한 검증 케이스를 실제로 만들고 멱등인지 확인한다."""

import sys
from pathlib import Path

import pytest
from helpers import headers

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import seed_demo_data

API = "/api/v1"


@pytest.fixture(scope="module")
def seeded(engine):
    """모듈 안에서 한 번만 시드한다(API 호출이 많다)."""
    first = seed_demo_data.seed(engine)
    return first


def asset_list(client, project, user, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    r = client.get(f"{API}/projects/{project}/assets?{query}", headers=headers(user))
    assert r.status_code == 200, r.text
    return r.json()


def by_code(client, project, user, code):
    data = asset_list(client, project, user, q=code, include_archived="true")["data"]
    return next(a for a in data if a["code"] == code)


def test_projects_users_and_isolation(client, seeded):
    users, projects = seeded["users"], seeded["projects"]
    # 소속 없는 사용자는 빈 목록
    me = client.get(f"{API}/me", headers=headers(users["nobody"])).json()["data"]
    assert me["projects"] == [] and me["organizations"] == []
    # 프로젝트별 역할이 다른 사용자
    roles = {p["code"]: p["role"] for p in client.get(
        f"{API}/me", headers=headers(users["mixed"])).json()["data"]["projects"]}
    assert roles == {"DEMO-A": "admin", "DEMO-B": "viewer"}
    # 다른 조직 사용자는 A·B를 볼 수 없다(404)
    other = users["other-org-admin"]
    for key in ("A", "B"):
        assert client.get(f"{API}/projects/{projects[key]}", headers=headers(other)).status_code == 404
    assert client.get(f"{API}/projects/{projects['C']}", headers=headers(other)).status_code == 200
    # 시간대가 서로 다른 프로젝트
    tzs = {client.get(f"{API}/projects/{projects[k]}", headers=headers(users["admin"])).json()
           ["data"]["timezone"] for k in ("A", "B")}
    assert tzs == {"Asia/Seoul", "UTC"}


def test_asset_volume_pagination_and_archived(client, seeded):
    project, admin = seeded["projects"]["A"], seeded["users"]["admin"]
    page = asset_list(client, project, admin)  # 기본 limit 50
    assert len(page["data"]) == 50 and page["page"]["next_cursor"]
    rest = asset_list(client, project, admin, cursor=page["page"]["next_cursor"])
    assert len(page["data"]) + len(rest["data"]) == 60 and rest["page"]["next_cursor"] is None
    kinds = [a["kind"] for a in page["data"] + rest["data"]]
    assert (kinds.count("equipment"), kinds.count("storage"), kinds.count("dock")) == (25, 25, 10)
    archived = asset_list(client, project, admin, include_archived="true", q="EQ-ARCH")["data"]
    assert [a["archived_at"] is not None for a in archived] == [True]
    assert all(a["code"] != "EQ-ARCH" for a in page["data"] + rest["data"])
    assert asset_list(client, project, admin, sort="code", limit=3)["data"][0]["code"] == "DK-001"


def test_same_code_exists_in_two_projects(client, seeded):
    admin, projects = seeded["users"]["admin"], seeded["projects"]
    a = by_code(client, projects["A"], admin, "EQ-001")
    b = by_code(client, projects["B"], admin, "EQ-001")
    assert a["id"] != b["id"] and a["project_id"] != b["project_id"]
    other = seeded["users"]["other-org-admin"]
    assert client.get(f"{API}/projects/{projects['A']}/assets/{a['id']}",
                      headers=headers(other)).status_code == 404


def summary(client, seeded, code):
    asset = by_code(client, seeded["projects"]["A"], seeded["users"]["admin"], code)
    return asset, asset["latest_revision"], asset["current_revision"]


def test_revision_state_samples(client, seeded):
    states = {code: summary(client, seeded, code)
              for code in ("EQ-001", "EQ-002", "EQ-003", "EQ-004", "EQ-005", "EQ-006", "EQ-007")}
    assert states["EQ-001"][1] is None and states["EQ-001"][2] is None           # ① 버전 없음
    assert states["EQ-002"][1]["status"] == "draft" and states["EQ-002"][2] is None      # ②
    assert states["EQ-003"][1]["status"] == "in_review"                          # ③
    assert states["EQ-004"][1]["status"] == "approved" and states["EQ-004"][2]  # ④
    assert (states["EQ-005"][1]["status"], states["EQ-005"][2]["revision_no"]) == ("draft", 1)  # ⑤
    assert states["EQ-005"][1]["revision_no"] == 2
    assert states["EQ-006"][2]["revision_no"] == 2                               # ⑥
    assert (states["EQ-007"][1]["status"], states["EQ-007"][2]["revision_no"]) == ("in_review", 1)  # ⑦


def test_superseded_history_and_capacity_cases(client, seeded):
    project, admin = seeded["projects"]["A"], seeded["users"]["admin"]
    asset = by_code(client, project, admin, "EQ-006")
    revisions = client.get(f"{API}/projects/{project}/assets/{asset['id']}/revisions",
                           headers=headers(admin)).json()["data"]
    assert [(r["revision_no"], r["status"]) for r in revisions] == [(2, "approved"), (1, "superseded")]

    def latest_ports(code):
        a = by_code(client, project, admin, code)
        rev = client.get(f"{API}/projects/{project}/asset-revisions/{a['latest_revision']['id']}",
                         headers=headers(admin)).json()["data"]
        return rev

    modes = {code: {p["role"]: p["buffer_capacity"] for p in latest_ports(code)["ports"]}
             for code in ("EQ-008", "EQ-009", "EQ-010")}
    assert modes["EQ-008"]["IN"]["value"] == "12" and modes["EQ-008"]["OUT"]["mode"] == "unlimited"
    assert (modes["EQ-009"]["IN"]["unit"], modes["EQ-009"]["OUT"]["unit"]) == ("kg", "m2")
    assert "VAL-CAP-002" in {i["rule_id"] for i in latest_ports("EQ-009")["issues"]}
    assert modes["EQ-010"]["IN"]["mode"] == "not_allowed"
    unknown_rules = {p["role"]: p["dispatch_rule"]["mode"] for p in latest_ports("EQ-011")["ports"]}
    assert unknown_rules == {"IN": "unknown", "OUT": "unknown"}
    known = latest_ports("EQ-012")["ports"]
    assert known[0]["dispatch_rule"]["reservation"] == "reserve"
    assert known[1]["release_rule"]["block_machine_while_waiting"] == "yes"
    spaces = {code: latest_ports(code)["storage_capacity"] for code in ("ST-001", "ST-002", "DK-001")}
    assert spaces["ST-001"]["value"] == "200" and spaces["ST-002"]["mode"] == "unknown"
    assert spaces["DK-001"]["mode"] == "unknown"  # 도킹은 무제한으로 가정하지 않는다


def test_catalog_samples_cover_unknown_and_known_values(client, seeded):
    project, admin = seeded["projects"]["A"], seeded["users"]["admin"]
    url = f"{API}/projects/{project}"
    products = client.get(f"{url}/products?limit=50", headers=headers(admin)).json()["data"]
    assert [p["code"] for p in products] == [f"P-{n:03d}" for n in range(1, 9)]
    assert {p["specification"] is None for p in products} == {True, False}  # 규격 미정과 입력 혼합
    materials = {m["code"]: m for m in client.get(
        f"{url}/materials", headers=headers(admin)).json()["data"]}
    assert set(materials) == {"M-001", "M-002", "M-003", "M-004"}
    assert materials["M-001"]["default_spec"]["length_m"] == {"mode": "known", "value": "3000"}
    assert materials["M-002"]["default_spec"]["unit_count"] == {"mode": "known", "value": 3}
    assert materials["M-002"]["default_spec"]["weight_kg"]["mode"] == "not_applicable"
    assert {f["mode"] for f in materials["M-003"]["default_spec"].values()} == {"unknown"}
    other = client.get(f"{API}/projects/{seeded['projects']['B']}/products",
                       headers=headers(admin)).json()["data"]
    assert [p["code"] for p in other] == ["P-001"]  # 프로젝트 격리: 같은 코드, 다른 프로젝트


def test_process_version_samples_cover_states_and_validation_levels(client, seeded):
    project, admin = seeded["projects"]["A"], seeded["users"]["admin"]
    url = f"{API}/projects/{project}"
    products = {p["code"]: p for p in client.get(f"{url}/products?limit=50",
                                                 headers=headers(admin)).json()["data"]}
    state = {code: (p["latest_process_version"] and p["latest_process_version"]["status"],
                    p["current_process_version"] and p["current_process_version"]["version_no"])
             for code, p in products.items()}
    assert state["P-001"] == ("approved", 1) and state["P-002"] == ("draft", None)
    assert state["P-003"] == ("in_review", None) and state["P-004"] == ("draft", 1)
    assert state["P-005"] == (None, None)  # 공정이 없는 제품
    p4 = client.get(f"{url}/products/{products['P-004']['id']}/process-versions",
                    headers=headers(admin)).json()["data"]
    assert [(v["version_no"], v["status"]) for v in p4] == [(2, "draft"), (1, "approved")]
    assert p4[0]["base_version_id"] == p4[1]["id"]  # 승인본에서 복사한 새 초안
    diff = client.get(f"{url}/process-versions/{p4[0]['id']}/diff", headers=headers(admin)).json()["data"]
    assert diff["against_version_id"] == p4[1]["id"] and diff["summary"]["identical"] is False
    assert [f["field_path"] for f in diff["header"]] == ["/notes"]
    assert [c["node_key"] for c in diff["nodes"]["changed"]] == ["step-1"]  # 이름 변경
    assert any(f["field_path"].endswith("/speed_m_per_min/value")
               for c in diff["steps"]["changed"] for f in c["fields"])  # 공정 속도 변경
    first = client.get(f"{url}/products/{products['P-001']['id']}/process-versions",
                       headers=headers(admin)).json()["data"][0]
    editor = client.get(f"{url}/process-versions/{first['id']}/editor-state",
                        headers=headers(admin)).json()["data"]
    assert editor["row_version"] == 1 and len(editor["node_positions"]) == 6  # 승인본에도 좌표 저장(노드마다)
    approved = next(p for p in client.get(
        f"{url}/products/{products['P-001']['id']}/process-versions",
        headers=headers(admin)).json()["data"])
    graph = client.get(f"{url}/process-versions/{approved['id']}/graph",
                       headers=headers(admin)).json()["data"]
    assert [n["kind"] for n in graph["nodes"]] == [
        "source", "operation", "buffer", "operation", "milestone", "sink"]
    assert graph["completion_node_id"] == next(n["id"] for n in graph["nodes"] if n["kind"] == "milestone")
    run = client.post(f"{url}/process-versions/{approved['id']}/validate?scope=run_template",
                      headers=headers(admin)).json()["data"]
    assert run["error_count"] == 0  # 확정된 그래프는 실행 판정도 오류 없음(원자재 단위 미정은 경고)
    unknown = client.get(f"{url}/products/{products['P-003']['id']}/process-versions",
                         headers=headers(admin)).json()["data"][0]
    run = client.post(f"{url}/process-versions/{unknown['id']}/validate?scope=run_template",
                      headers=headers(admin)).json()["data"]
    assert run["error_count"] > 0  # 미정 단계는 실행 판정에서 오류


def test_seed_is_idempotent(client, engine, seeded, db):
    before = db.scalar("select count(*) from asset where project_id = :p", p=seeded["projects"]["A"])
    audits = db.scalar("select count(*) from audit_log where project_id = :p",
                       p=seeded["projects"]["A"])
    second = seed_demo_data.seed(engine)
    assert second["assets"]["skipped"] is True and second["catalog"]["skipped"] is True
    assert second["process"]["skipped"] is True and second["process"]["extras"]["added"] == []
    assert second["projects"] == seeded["projects"] and second["users"] == seeded["users"]
    assert db.scalar("select count(*) from asset where project_id = :p",
                     p=seeded["projects"]["A"]) == before == 61
    assert db.scalar("select count(*) from audit_log where project_id = :p",
                     p=seeded["projects"]["A"]) == audits


def test_demo_script_refuses_without_confirmation_or_in_production(monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@127.0.0.1:5432/x_test")
    assert seed_demo_data.main(["seed"]) == 2
    monkeypatch.setenv("APP_ENV", "production")
    assert seed_demo_data.main(["seed", "--yes"]) == 2
    assert "production" in capsys.readouterr().err
