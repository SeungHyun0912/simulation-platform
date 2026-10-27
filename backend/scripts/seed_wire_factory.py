"""**실제 기준정보** 시드: docs/domain/08_catalog_processes.md(사용자 제공 공정의 최신 정리본)를 DB에 만든다.

사용: DATABASE_URL=... python scripts/seed_wire_factory.py --yes   (개발용 시드가 없어도 스스로 만든다)
- 프로젝트 `DEMO-WIRE`(개발 인계용 제안 코드, 사용자 기존 코드가 아님)에 설비 96대(EQ-001~096)·공간 22곳(ST-001~022)·
  제품 6종(P01~P06)·공정 버전 6건(모두 draft)을 만든다. 자산·제품·공정은 **실제 API(서비스 계층)로** 만든다.
- 서로 다른 공정 흐름은 4가지다: 실리콘 공통 경로(P01~P03, 값만 다름), P04(AL), P05(CU 세선), P06(CU 태선).
- 문서가 정하지 않은 값은 unknown으로 둔다(0·무제한·해당 없음으로 바꾸지 않는다). 용량·좌표는 모두 미정이라 만들지 않는다.
- **사용자 정리 반영(2026-10-27, CR be09 §6)**: 아래 값은 문서가 아니라 사용자가 확정한 값이며 `INTAKE_MARK`로 메모에 남긴다 —
  범위 안의 후보 설비 전부 자격 확정(`confirmed`)·선택 규칙 `first_available`, 입력 확보 작업마다(`per_operation`)·소비 시점,
  모든 인계 보빈별, 값이 없는 준비·대기 시간 0분, 120분 준비는 제품이 바뀔 때(`on_product_change`), 싱글-12 대기 120분은 작업 시간,
  P01~P03 검사 작업자 무제한 10분/보빈·완제품은 쉬스 완료, P04·P05 원자재 길이 해당 없음, P05 출발 공간 ST-005,
  운반은 보빈 1개씩 이동 3분 + 상하차 1분(운반 자원 무제한).
- **3차 반영(2026-10-27)**: P05 절연의 4,000m 잔량(100,000m 투입, 24,000m × 4 산출)은 그 자리에서 **폐기**한다
  (잔량 규칙 `discard`, 계약 0.8.0).
- **2차 반영(2026-10-27)**: P01 쉬스 잔량은 같은 제품이 이어지면 유지하고 다른 제품이 그 설비에서 시작되면 모두 폐기
  (범위 `machine`·제품 전환 `discard`), 태신선·멀티신선(과 싱글 메인)은 입력 여러 개를 한 번에 받아 산출을 **순차로 하나씩**
  만든다(스트림 1, 순차), 싱글 메인의 공급 입력은 싱글-12가 준비한 12보빈(1보빈 = 1가닥, 03 §12)이다.
- 단계별 투입·산출 수량·12가닥 공급은 단계의 재료 spec, 간선은 spec 연결, 완제품 시점은 milestone 지정으로 만든다(계약 0.6.0).
  계약에 필드가 없는 값(폐기량 등)은 버전 메모(notes)에 문서 근거와 함께 남긴다.
- 시험 데이터(`seed_demo_data.py`, "[시험]" 이름)와 분리된 별도 프로젝트이며 재실행해도 중복 생성하지 않는다(멱등).
- 운영(APP_ENV=production)에서는 실행을 거부한다.
"""

import argparse
import itertools
import os
import sys
import uuid
from pathlib import Path

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import make_url

sys.path.insert(0, str(Path(__file__).resolve().parent))
import seed_demo_data
import seed_dev_data

API = "/api/v1"
PROJECT_CODE = "DEMO-WIRE"
SOURCE = "docs/domain/08_catalog_processes.md"

# --- 설비(§2): (시작 번호, 끝 번호, 설비명, 분류) -------------------------------------------------
EQUIPMENT = [
    (1, 1, "실리콘 절연 압출기", "실리콘"),
    (2, 2, "실리콘 쉬스 압출기", "실리콘"),
    (3, 10, "실리콘 편조기", "실리콘"),
    (11, 12, "실리콘 테이핑기", "실리콘"),
    (13, 13, "CU 태신선기", "CU"),
    (14, 14, "CU 멀티신선기", "CU"),
    (15, 20, "CU 연선기", "CU"),
    (21, 30, "CU 집합기", "CU"),
    (31, 31, "CU 튜블라", "CU"),
    (32, 33, "절연 압출기", "공용"),
    (34, 35, "쉬스 압출기", "CU"),
    (36, 36, "조사기 — 보빈용", "공용"),
    (37, 38, "조사기 — 다발용", "공용"),
    (39, 80, "CU 편조기", "CU"),
    (81, 84, "CU 테이핑기", "CU"),
    (85, 88, "재권취기", "공용"),
    (89, 89, "AL 멀티 신선기", "AL"),
    (90, 93, "AL 집합기(더블)", "AL"),
    (94, 94, "AL 집합 싱글-1", "AL"),
    (95, 95, "AL 집합 싱글-12", "AL"),
    (96, 96, "AL 집합 싱글", "AL"),
]

# --- 공간(§3): (코드, 기준 명칭, 용도·주의). ST-021·ST-022는 AMR 도킹 위치(dock), 나머지는 저장·대기(storage) ---------
SPACES = [
    ("ST-001", "원자재 보관 공간", "실리콘 원자재·도체 상품 원자재, ST-005와 별도"),
    ("ST-002", "실리콘 압출 대기 공간", "실리콘 압출 전"),
    ("ST-003", "실리콘 쉬스 압출 완료 대기 공간", "실리콘 쉬스 완료 후"),
    ("ST-004", "실리콘 편조 대기 공간", "실리콘 압출 후 편조 전"),
    ("ST-005", "CU 도체 원자재 보관 장소", "ST-001과 별도"),
    ("ST-006", "CU 멀티신선 대기 장소", "태신선 후 멀티신선 전"),
    ("ST-007", "CU 연선 대기 장소", "CU 연선·집합 구역 대기"),
    ("ST-008", "압출 대기 공간 — 800파이용", "제품4·5; ST-009·010과 인접 3구역"),
    ("ST-009", "압출 대기 공간 — 1050파이용", "제품5·6; 쉬스 압출 전에도 사용"),
    ("ST-010", "압출 대기 공간 — 1250파이용", "제품6 최초 절연 전"),
    ("ST-011", "조사 대기 공간", "1차/2차 구분은 공정 상태"),
    ("ST-012", "조사 완료 대기 공간", "후속 편조/재권취는 제품·단계에 따름"),
    ("ST-013", "편조기 대기 공간", "CU 편조기 42대용"),
    ("ST-014", "검사 대기 공간", "제품4·5·6"),
    ("ST-015", "파렛트 적재 공간 — 다발용", "현재 6종 경로에는 미사용"),
    ("ST-016", "파렛트 적재 공간 — 보빈용", "제품4·5·6 검사 후"),
    ("ST-017", "AL 원자재 보관 공간", "AL 멀티신선 대기"),
    ("ST-018", "AL 집합 대기 공간", "AL 더블 집합 전"),
    ("ST-019", "AL 집합 싱글 대기 공간", "AL 싱글 대기 공간 별칭"),
    ("ST-020", "AL 집합 완료 대기 공간", "AL 싱글 완료 적재 공간 별칭"),
    ("ST-021", "AMR 도킹 위치", "AL 집합 이후, ST-022와 별도, 적재 용량·수용 방식 미정"),
    ("ST-022", "CU 테이핑 후 AMR 도킹 위치", "제품5 테이핑 후·제품6 편조 후도 사용, 적재 용량·수용 방식 미정"),
]
DOCKS = {"ST-021", "ST-022"}
SPACE_NAME = {code: name for code, name, _ in SPACES}

# --- 제품(§4~7). 원자재·완제품 단위는 문서에 적힌 값만(없으면 미정) --------------------------------------
PRODUCTS = {
    "P01": "실리콘_일반_태선(CU)_도체상품",
    "P02": "실리콘_복합_태선(CU)_도체상품",
    "P03": "실리콘_복합_태선(AL)_도체상품",
    "P04": "HV_조사_태선(AL)",
    "P05": "HV_복합_세선(CU)",
    "P06": "HV_복합_태선(CU)_상품",
}


def known(value) -> dict:
    return {"mode": "known", "value": str(value)}


def count(value: int) -> dict:
    return {"mode": "known", "value": int(value)}


UNKNOWN = {"mode": "unknown"}
NOT_APPLICABLE = {"mode": "not_applicable"}
NA = "n/a"  # 길이 없음(해당 없음). 값이 정해지지 않은 unknown과 다르다
INTAKE_MARK = "정리 반영(2026-10-27 3차)"
TRANSPORT_MINUTES = 4  # 이동 3분 + 상하차 1분(사용자 결정, 해석은 CR be09 §6-⑥)


def measure(name, value) -> dict:
    if value == NA:
        return NOT_APPLICABLE
    return count(value) if name in ("unit_count", "strand_count") else known(value)


DISCARD = {"mode": "discard", "on_product_change": "unknown", "on_run_end": "unknown", "scope": "unknown",
           "physical_join_mode": "unknown"}  # 남은 길이를 그 자리에서 폐기(계약 0.8.0)


def codes(first: int, last: int | None = None) -> list[str]:
    return [f"EQ-{n:03d}" for n in range(first, (last or first) + 1)]


# --- 규칙 조립 -------------------------------------------------------------------------------------
def speed(value, *, single_stream=True) -> dict:
    """선속(m/min). 1보빈 입력→1보빈 산출처럼 흐름이 하나인 단계만 스트림 1·스트림별 기준을 확정한다."""
    if single_stream:
        return {"kind": "output_speed", "speed_m_per_min": known(value), "basis": "per_stream",
                "output_schedule": "sequential_units", "parallel_streams": count(1)}
    return {"kind": "output_speed", "speed_m_per_min": known(value), "basis": "unknown",
            "output_schedule": "unknown", "parallel_streams": UNKNOWN}


def per_unit(minutes, schedule="unknown") -> dict:
    return {"kind": "per_output_unit", "duration_min": known(minutes), "output_schedule": schedule}


NO_PROCESSING = {"kind": "none"}
SETUP_UNKNOWN = {"duration_min": UNKNOWN, "trigger": "unknown"}
SETUP_NONE = {"duration_min": known(0), "trigger": "not_applicable"}  # "준비0" 또는 값이 없으면 0분(사용자 확정)
DELAY_UNKNOWN = {"duration_min": UNKNOWN, "trigger": "unknown", "occupancy": "unknown"}
DELAY_NONE = {"duration_min": NOT_APPLICABLE, "trigger": "not_applicable", "occupancy": "unknown"}


def setup_minutes(minutes) -> dict:
    """문서가 준 준비 시간. 발생 시점은 사용자가 "제품이 바뀔 때"로 정했다(on_product_change, CR be09 §6-④의 임시 기본값)."""
    return {"duration_min": known(minutes), "trigger": "on_product_change"}


def out_pass() -> dict:
    return {"mode": "pass_through", "quantity_basis": "per_input_unit", "accounting_mode": "physical"}


def out_split(length, units, basis="per_input_unit") -> dict:
    return {"mode": "split_length", "unit_form": "보빈", "length_m": known(length),
            "unit_count": count(units), "quantity_basis": basis, "schedule": "sequential_units",
            "accounting_mode": "physical"}


def out_units(length, units, accounting="unknown") -> dict:
    return {"mode": "configured_units", "unit_form": "보빈", "length_m": known(length),
            "unit_count": count(units), "quantity_basis": "per_operation", "accounting_mode": accounting}


def out_mass(weight_kg, units) -> dict:
    return {"mode": "fixed_mass_units", "unit_form": "보빈", "weight_kg": known(weight_kg),
            "unit_count": count(units), "quantity_basis": "per_operation", "accounting_mode": "physical"}


INSPECTOR = {"role_key": "inspector", "resource_kind": "worker", "selection_mode": "one_of",
             "required_count": 1, "capacity_mode": "unlimited", "allocation_rule": {"mode": "unknown"},
             "candidates": []}
# 운반 자원: 지게차 3대·AMR 2대가 있지만 이번에는 무제한으로 시작한다(대수는 메모에 사실로 기록, 사용자 결정)
CARRIER = {**INSPECTOR, "role_key": "carrier"}
INPUT_RULE = {"acquire_scope": "per_operation", "consume_policy": "consume"}


def msp(key, direction, state, *, form="보빈", basis="per_operation", **quantity) -> dict:
    """재료 spec(계약 0.6.0). 길이(length_m)·중량(weight_kg)은 decimal, 개수(unit_count)·가닥(strand_count)은 정수다.
    길이·중량·보빈 수·가닥 수를 서로 환산하거나 섞지 않는다."""
    spec = {"spec_key": key, "direction": direction, "state_code": state, "form": form,
            "quantity_basis": basis}
    for name, value in quantity.items():
        spec[name] = measure(name, value)
    return spec


def io(inp: dict, out: dict, *, src_state, dst_state, src_form="보빈", dst_form="보빈",
       dst_basis="per_operation") -> list[dict]:
    """한 단계의 입력 spec `in`과 출력 spec `out`. 문서의 투입·산출 열을 그대로 옮긴다."""
    return [msp("in", "input", src_state, form=src_form, **inp),
            msp("out", "output", dst_state, form=dst_form, basis=dst_basis, **out)]


def _keys(node: dict, direction: str) -> set[str]:
    return {m["spec_key"] for m in (node["step"] or {}).get("material_specs", [])
            if m["direction"] == direction}


class Route:
    """한 제품의 그래프(노드·간선)를 만든다. 노드·간선 id는 새 UUID, node_key는 버전 안에서 유일."""

    def __init__(self, assets: dict[str, str]):
        self.assets = assets
        self.nodes: list[dict] = []
        self.edges: list[dict] = []
        self.completion: str | None = None  # 완제품으로 판정하는 milestone 노드 id
        # 입력 spec이 여럿인 단계: {단계 node_key: {앞 노드 node_key: 입력 spec_key}}(기본은 "in")
        self.input_keys: dict[str, dict[str, str]] = {}

    def _add(self, key, kind, label, asset=None, step=None) -> dict:
        node = {"id": str(uuid.uuid4()), "node_key": key, "kind": kind, "label": label,
                "asset_id": self.assets[asset] if asset else None,
                "display_order": len(self.nodes) * 10, "step": step}
        self.nodes.append(node)
        return node

    def source(self, label, asset=None):
        return self._add("src", "source", label, asset)

    def sink(self, label):
        return self._add("sink", "sink", label)

    def milestone(self, label):
        node = self._add("complete", "milestone", label)
        self.completion = node["id"]
        return node

    def space(self, code, suffix="") -> dict:
        return self._add(f"{code.lower()}{suffix}", "buffer", f"{code} {SPACE_NAME[code]}", code)

    def op(self, key, label, handler, equipment, *, processing, setup=SETUP_NONE, delay=DELAY_NONE,
           output=None, handoff="per_output_unit", residual=None, worker=False, specs=None,
           consume="consume") -> dict:
        """사용자 정리 반영 기본값: 후보 설비 전부 자격 확정·선택 규칙 first_available, 입력 확보 작업마다,
        인계 보빈별, 값이 없는 준비·대기 0분. `worker`는 True(검사 작업자) 또는 "carrier"(운반 자원, 무제한)."""
        resources = []
        if equipment:
            resources.append({
                "role_key": "main", "resource_kind": "equipment", "selection_mode": "one_of",
                "required_count": 1, "capacity_mode": "finite", "allocation_rule": {"mode": "first_available"},
                "candidates": [{"asset_id": self.assets[c], "eligibility_status": "confirmed"}
                               for c in equipment]})
        if worker:
            resources.append(CARRIER if worker == "carrier" else INSPECTOR)
        step = {"operation_type": handler, "handler_version": "1",
                "timing_rule": {"processing": processing, "setup": setup, "precondition_delay": delay},
                "input_rule": {**INPUT_RULE, "consume_policy": consume},
                "output_rule": output or out_pass(), "handoff_rule": {"mode": handoff},
                "resources": resources, "material_specs": specs or []}
        if residual:
            step["residual_rule"] = residual
        return self._add(key, "operation", label, step=step)

    def transport(self, key, method, origin, target) -> dict:
        """문서가 방식(지게차·AMR)을 정한 운반. 보빈 1개씩 독립 이동하며 이동 3분 + 상하차 1분(사용자 결정),
        운반 자원은 이번에는 무제한이다(지게차 3대·AMR 2대는 후속 운반 자원 기능에서 쓴다)."""
        return self.op(key, f"{method} 운반 {origin}→{target}", "transport_manual", [],
                       processing=per_unit(TRANSPORT_MINUTES, "sequential_units"), output=out_pass(),
                       worker="carrier")

    def link(self, a, b, kind="material", movement=None):
        edge = {"id": str(uuid.uuid4()), "edge_key": f"{a['node_key']}-{b['node_key']}",
                "from_node_id": a["id"], "to_node_id": b["id"], "edge_kind": kind}
        if movement:
            edge["movement_rule"] = {"mode": movement}
        self.edges.append(edge)

    def chain(self, *nodes):
        for a, b in itertools.pairwise(nodes):
            self.link(a, b)

    def _link_specs(self) -> None:
        """단계에 붙은 간선에 재료 spec을 연결한다: 앞 단계의 `out` → 간선 → 뒤 단계의 입력 spec."""
        by_id = {n["id"]: n for n in self.nodes}
        for edge in self.edges:
            origin, target = by_id[edge["from_node_id"]], by_id[edge["to_node_id"]]
            if "out" in _keys(origin, "output"):
                edge["source_output_spec_key"] = "out"
            wanted = self.input_keys.get(target["node_key"], {}).get(origin["node_key"], "in")
            if wanted in _keys(target, "input"):
                edge["target_input_spec_key"] = wanted

    def graph(self) -> dict:
        self._link_specs()
        return {"nodes": self.nodes, "edges": self.edges, "completion_node_id": self.completion}


def inspect_op(r: Route, *, worker: bool, handoff: str, setup=SETUP_NONE, delay=DELAY_NONE,
               specs=None):
    return r.op("inspect", "육안 검사", "inspection", [], processing=per_unit(10, "sequential_units"),
                setup=setup, delay=delay, output=out_pass(), handoff=handoff, worker=worker, specs=specs)


# --- 공정 1: 실리콘 공통 경로(P01~P03, §4) -------------------------------------------------------
def silicon(assets, *, raw_len, bobbins, sheath_len, sheath_units, carry) -> dict:
    r = Route(assets)
    residual = ({"mode": "carry_same_product", "on_product_change": "discard", "on_run_end": "unknown",
                 "scope": "machine", "physical_join_mode": "abstract_length_pool"} if carry else None)
    bobbin = {"length_m": "1000", "unit_count": 1}
    final = {"length_m": str(sheath_len), "unit_count": 1}
    chain = [
        r.source("원자재 (2t 롤)", "ST-001"), r.space("ST-002"),
        r.op("insulate", "절연 압출", "split_length", codes(1), processing=speed(20),
             output=out_split(1000, bobbins),
             specs=io({"length_m": str(raw_len), "weight_kg": "2000", "unit_count": 1},
                      {"length_m": "1000", "unit_count": bobbins}, src_state="원자재", dst_state="절연 후",
                      src_form="롤")),
        r.space("ST-004"),
        r.op("braid", "실리콘 편조", "pass_through_length", codes(3, 10), processing=speed(1.5),
             specs=io(bobbin, bobbin, src_state="절연 후", dst_state="편조 후")),
        r.op("tape", "실리콘 테이핑", "pass_through_length", codes(11, 12), processing=speed(20),
             specs=io(bobbin, bobbin, src_state="편조 후", dst_state="테이핑 후")),
        r.op("sheath", "쉬스 압출", "split_length", codes(2), processing=speed(15),
             output=out_split(sheath_len, sheath_units, "per_lot"), residual=residual,
             specs=io(bobbin, {"length_m": str(sheath_len), "unit_count": sheath_units},
                      src_state="테이핑 후", dst_state="쉬스 후", dst_basis="per_lot")),
        r.milestone("완제품(쉬스 완료)"), r.space("ST-003"),  # 사용자 확정: 실리콘 3종은 쉬스 이후가 완제품
        inspect_op(r, worker=True, handoff="per_output_unit",
                   specs=io(final, final, src_state="쉬스 후", dst_state="검사 후")),
        r.sink("완제품"),
    ]
    r.chain(*chain)
    return r.graph()


# --- 공정 2: P04 HV_조사_태선(AL) (§5) ------------------------------------------------------------
def p04(assets) -> dict:
    r = Route(assets)
    N = {"handoff": "per_output_unit", "delay": DELAY_NONE}
    b4000 = {"length_m": "4000", "unit_count": 1}
    src = r.source("원자재 (개당 2t)", "ST-017")
    multi = r.op("multi", "AL 멀티신선", "output_units_by_time", codes(89), processing=speed(100),
                 setup=setup_minutes(120), output=out_units(40000, 12),
                 specs=io({"weight_kg": "2000", "length_m": NA, "unit_count": 2},
                          {"length_m": "40000", "unit_count": 12},
                          src_state="원자재", dst_state="멀티신선 후", src_form="원자재"), **N)
    st018 = r.space("ST-018")
    double = r.op("double", "AL 더블 집합", "split_length", codes(90, 93), processing=speed(100),
                  setup=SETUP_NONE, output=out_split(4000, 10),
                  specs=io({"length_m": "40000", "unit_count": 1}, {"length_m": "4000", "unit_count": 10},
                           src_state="멀티신선 후", dst_state="더블 집합 후"), **N)
    st019 = r.space("ST-019")
    pre = r.op("single-pre", "싱글-1 선행 가공", "pass_through_length", codes(94), processing=speed(4.4),
               setup=SETUP_NONE, specs=io(b4000, b4000, src_state="더블 집합 후", dst_state="선행 가공 후"), **N)
    # 대기 120분은 설비 가동이 아니라 재료를 걸어 두는 작업이라 작업 시간 2시간으로 본다(사용자 결정): 작업마다, 설비 점유
    feed = r.op("single-feed", "싱글-12 공급 준비", "supply_delay", codes(95), processing=NO_PROCESSING,
                setup=SETUP_NONE, delay={"duration_min": known(120), "trigger": "per_operation",
                                         "occupancy": "occupies_machine"},
                handoff="total_batch", consume="transfer",
                specs=[msp("in", "input", "더블 집합 후", length_m="4000", unit_count=12),
                       msp("out", "output", "공급 준비", form="가닥", strand_count=12)])
    main = r.op("single-main", "싱글 메인 집합", "configured_yield", codes(96),
                processing=speed(32), setup=SETUP_NONE,
                output=out_units(4000, 10, "abstract_yield"),
                specs=[msp("pre", "input", "선행 가공 후", **b4000),
                       msp("feed", "input", "공급 준비", form="가닥", strand_count=12, unit_count=12),
                       msp("out", "output", "싱글 집합 후", length_m="4000", unit_count=10)], **N)
    r.input_keys["single-main"] = {"single-pre": "pre", "single-feed": "feed"}
    st020, fork = r.space("ST-020"), r.transport("forklift", "지게차", "ST-020", "ST-021")
    st021, amr = r.space("ST-021"), r.transport("amr", "AMR", "ST-021", "ST-008")
    st008 = r.space("ST-008")
    insulate = r.op("insulate", "절연", "pass_through_length", codes(32, 33), processing=speed(50),
                    setup=SETUP_NONE, specs=io(b4000, b4000, src_state="싱글 집합 후", dst_state="절연 후"), **N)
    st011 = r.space("ST-011")
    irradiate = r.op("irradiate", "보빈 조사", "pass_through_length", codes(36), processing=speed(110),
                     setup=SETUP_NONE, specs=io(b4000, b4000, src_state="절연 후", dst_state="조사 후"), **N)
    st012 = r.space("ST-012")
    rewind = r.op("rewind", "재권취", "pass_through_length", codes(85, 88), processing=speed(50),
                  setup=SETUP_NONE, specs=io(b4000, b4000, src_state="조사 후", dst_state="재권취 후"), **N)
    complete, st014 = r.milestone("완제품(재권취 완료)"), r.space("ST-014")
    inspect = inspect_op(r, worker=True, handoff="per_output_unit", setup=SETUP_NONE, delay=DELAY_NONE,
                         specs=io(b4000, b4000, src_state="재권취 후", dst_state="검사 후"))
    r.chain(src, multi, st018, double, st019)
    r.link(st019, pre)
    r.link(st019, feed)
    r.link(pre, main, movement="direct_feed")  # 싱글-1 출력은 ST-019로 돌아가지 않고 메인에 직결(최신 정정)
    r.link(feed, main, kind="supply")
    r.chain(main, st020, fork, st021, amr, st008, insulate, st011, irradiate, st012, rewind, complete,
            st014, inspect, r.space("ST-016"), r.sink("완제품"))
    return r.graph()


# --- 공정 3: P05 HV_복합_세선(CU) (§6) -------------------------------------------------------------
def p05(assets) -> dict:
    r = Route(assets)
    N = {"handoff": "per_output_unit", "delay": DELAY_NONE, "setup": SETUP_NONE}
    b100k, b24k, b12k = ({"length_m": m, "unit_count": 1} for m in ("100000", "24000", "12000"))
    # 출발 공간 ST-005(CU 도체 원자재 보관 장소, 태신선 대기 공간)는 사용자가 확정했다(2026-10-27).
    chain = [
        r.source("원자재 (3.3t/보빈)", "ST-005"),
        r.op("draw", "CU 태신선", "output_units_by_time", codes(13), processing=per_unit(22, "sequential_units"),
             output=out_mass(1000, 36),
             specs=io({"weight_kg": "3300", "length_m": NA, "unit_count": 11},
                      {"weight_kg": "1000", "unit_count": 36}, src_state="원자재", dst_state="태신선 후"), **N),
        r.space("ST-006"),
        r.op("multi", "CU 멀티신선", "output_units_by_time", codes(14), processing=speed(60),
             output=out_units(100000, 9),
             specs=io({"weight_kg": "1000", "unit_count": 24}, {"length_m": "100000", "unit_count": 9},
                      src_state="태신선 후", dst_state="멀티신선 후"), **{**N, "setup": setup_minutes(120)}),
        r.space("ST-007"),
        r.op("strand", "CU 연선", "pass_through_length", codes(15, 20), processing=speed(1000),
             specs=io(b100k, b100k, src_state="멀티신선 후", dst_state="연선 후"),
             **{**N, "setup": setup_minutes(120)}),
        r.space("ST-008"),
        r.op("insulate", "절연", "split_length", codes(32, 33), processing=speed(160),
             output=out_split(24000, 4), residual=DISCARD,
             specs=io(b100k, {"length_m": "24000", "unit_count": 4}, src_state="연선 후", dst_state="절연 후"),
             **N),
        r.space("ST-011", "-1"),
        r.op("irradiate-1", "1차 보빈 조사", "pass_through_length", codes(36), processing=speed(206),
             specs=io(b24k, b24k, src_state="절연 후", dst_state="1차 조사 후"), **N),
        r.space("ST-012", "-1"),
        r.transport("forklift", "지게차", "ST-012", "ST-013"),
        r.space("ST-013"),
        r.op("braid", "CU 편조", "split_length", codes(39, 80), processing=speed(1.5),
             output=out_split(12000, 2),
             specs=io(b24k, {"length_m": "12000", "unit_count": 2}, src_state="1차 조사 후", dst_state="편조 후"),
             **N),
        r.op("tape", "CU 테이핑", "pass_through_length", codes(81, 84), processing=speed(20),
             specs=io(b12k, b12k, src_state="편조 후", dst_state="테이핑 후"), **N),
        r.space("ST-022"),  # 테이핑 OUT → ST-022 운반 방식은 미정(간선 이동 규칙 unknown)
        r.transport("amr", "AMR", "ST-022", "ST-009"),
        r.space("ST-009"),
        r.op("sheath", "쉬스 압출", "pass_through_length", codes(34, 35), processing=speed(60),
             specs=io(b12k, b12k, src_state="테이핑 후", dst_state="쉬스 후"), **N),
        r.space("ST-011", "-2"),
        r.op("irradiate-2", "2차 보빈 조사", "pass_through_length", codes(36), processing=speed(195),
             specs=io(b12k, b12k, src_state="쉬스 후", dst_state="2차 조사 후"), **N),
        r.space("ST-012", "-2"),
        r.op("rewind", "재권취", "split_length", codes(85, 88), processing=speed(50),
             output=out_split(600, 20),
             specs=io(b12k, {"length_m": "600", "unit_count": 20}, src_state="2차 조사 후", dst_state="재권취 후"),
             **N),
        r.milestone("완제품(재권취 완료)"), r.space("ST-014"),
        inspect_op(r, worker=True, handoff="per_output_unit", setup=SETUP_NONE, delay=DELAY_NONE,
                   specs=io({"length_m": "600", "unit_count": 1}, {"length_m": "600", "unit_count": 1},
                            src_state="재권취 후", dst_state="검사 후")),
        r.space("ST-016"), r.sink("완제품"),
    ]
    r.chain(*chain)
    return r.graph()


# --- 공정 4: P06 HV_복합_태선(CU)_상품 (§7). 테이핑 공정이 없다 --------------------------------------
def p06(assets) -> dict:
    r = Route(assets)
    N = {"handoff": "per_output_unit", "delay": DELAY_NONE, "setup": SETUP_NONE}
    b1000 = {"length_m": "1000", "unit_count": 1}
    chain = [
        r.source("원자재 (2t, 2,000m, 1보빈)", "ST-001"), r.space("ST-010"),
        # 최초 작업은 절연이지만 설비는 쉬스 압출기 EQ-034~035(EQ-032~033으로 바꾸지 않는다)
        r.op("insulate", "절연(쉬스 압출기 사용)", "split_length", codes(34, 35), processing=speed(30),
             output=out_split(1000, 2),
             specs=io({"length_m": "2000", "weight_kg": "2000", "unit_count": 1},
                      {"length_m": "1000", "unit_count": 2}, src_state="원자재", dst_state="절연 후"), **N),
        r.space("ST-011", "-1"),
        r.op("irradiate-1", "1차 보빈 조사", "pass_through_length", codes(36), processing=speed(50),
             specs=io(b1000, b1000, src_state="절연 후", dst_state="1차 조사 후"), **N),
        r.space("ST-012", "-1"),
        r.transport("forklift", "지게차", "ST-012", "ST-013"),
        r.space("ST-013"),
        r.op("braid", "CU 편조", "pass_through_length", codes(39, 80), processing=speed(1.5),
             specs=io(b1000, b1000, src_state="1차 조사 후", dst_state="편조 후"), **N),
        r.space("ST-022"),  # 편조 OUT → ST-022 운반 방식은 미정
        r.transport("amr", "AMR", "ST-022", "ST-009"),
        r.space("ST-009"),
        r.op("sheath", "쉬스 압출", "pass_through_length", codes(34, 35), processing=speed(60),
             specs=io(b1000, b1000, src_state="편조 후", dst_state="쉬스 후"), **N),
        r.space("ST-011", "-2"),
        r.op("irradiate-2", "2차 보빈 조사", "pass_through_length", codes(36), processing=speed(195),
             specs=io(b1000, b1000, src_state="쉬스 후", dst_state="2차 조사 후"), **N),
        r.space("ST-012", "-2"),
        r.op("rewind", "재권취", "split_length", codes(85, 88), processing=speed(30),
             output=out_split(500, 2),
             specs=io(b1000, {"length_m": "500", "unit_count": 2}, src_state="2차 조사 후", dst_state="재권취 후"),
             **N),
        r.milestone("완제품(재권취 완료)"), r.space("ST-014"),
        inspect_op(r, worker=True, handoff="per_output_unit", setup=SETUP_NONE, delay=DELAY_NONE,
                   specs=io({"length_m": "500", "unit_count": 1}, {"length_m": "500", "unit_count": 1},
                            src_state="재권취 후", dst_state="검사 후")),
        r.space("ST-016"), r.sink("완제품"),
    ]
    r.chain(*chain)
    return r.graph()


def _spec(**fields) -> dict:
    return {name: measure(name, v) for name, v in fields.items()}


def _notes(product, lines) -> str:
    return "\n".join([notes_head(product), *lines])


def legacy_notes_head(product) -> str:
    """사용자 정리 반영 전(계약 0.6.0 시드)의 메모 머리말. 시드가 쓴 메모인지 알아보는 데만 쓴다."""
    return f"{PRODUCTS[product]} — 근거 {SOURCE}. 초안(draft)이며 문서의 미정 값은 unknown으로 두었다."


def previous_notes_heads(product) -> tuple[str, ...]:
    """이전 세대의 시드 메모 머리말(사람이 고치지 않은 시드 메모인지 알아보는 데만 쓴다)."""
    first = (f"{PRODUCTS[product]} — 근거 {SOURCE}. 초안(draft). 정리 반영(2026-10-27): 사용자가 확정한 값은 문서 값과 구분해 "
             "아래에 적었고, 문서가 정하지 않은 나머지는 unknown으로 두었다.")
    second = (f"{PRODUCTS[product]} — 근거 {SOURCE}. 초안(draft). 정리 반영(2026-10-27 2차): 사용자가 확정한 값은 문서 값과 구분해 "
              "아래에 적었고, 문서가 정하지 않은 나머지는 unknown으로 두었다.")
    return legacy_notes_head(product), first, second


def notes_head(product) -> str:
    return (f"{PRODUCTS[product]} — 근거 {SOURCE}. 초안(draft). {INTAKE_MARK}: 사용자가 확정한 값은 문서 값과 구분해 "
            "아래에 적었고, 문서가 정하지 않은 나머지는 unknown으로 두었다.")


INTAKE_NOTES = [
    ("사용자 확정(2026-10-27): 후보 설비 범위 안의 설비는 모두 자격 확정, 선택 규칙은 비어 있는 설비를 코드 순서로(first_available), "
     "입력은 작업마다 확보(실제 소비는 작업 끝이나 결과가 같아 시작 때 소비, 설비는 작업이 끝날 때까지 독점), 모든 인계는 보빈별."),
    "사용자 확정: 준비·교체 시간 값이 없으면 0분, 120분 준비는 제품이 바뀔 때(on_product_change, \"제품\" 뜻은 임시로 제품 종류).",
]
TRANSPORT_NOTE = (f"운반(사용자 확정): 보빈 1개씩 독립 이동, 이동 3분 + 상하차 1분 = {TRANSPORT_MINUTES}분, 운반 자원은 무제한으로 시작"
                  "(지게차 3대·AMR 2대는 후속 운반 자원 기능에서 사용).")


def definitions(assets: dict[str, str]) -> dict[str, dict]:
    """제품 코드 → {raw, finished, notes, graph}. 값의 근거는 문서 §4~7."""
    si_notes = ["단계별 투입·산출 수량은 각 단계의 재료 spec(material_specs)에 있다.",
                "편조·테이핑·쉬스 사이에 저장공간을 임의로 만들지 않았다(직결).",
                "사용자 확정: 완제품은 쉬스 압출 완료 시점(완제품 milestone), 검사는 작업자 무제한·10분/보빈, 값이 없는 준비 시간은 0분.",
                *INTAKE_NOTES]
    return {
        "P01": {"raw": _spec(length_m=3000, weight_kg=2000, unit_count=1), "finished": _spec(length_m=300),
                "notes": _notes("P01", [("절연 후 1,000m×3보빈, 쉬스 후 300m×10보빈/1롤분(잔량 이월: 동일 제품 연속 생산 때 이월, "
                                        "다른 제품이 쉬스 압출기에서 시작되면 폐기, 잔량 범위 = 설비(사용자 확정 2026-10-27), 생산 종료 처리·물리적 접속 방법 미정)."), *si_notes]),
                "graph": silicon(assets, raw_len=3000, bobbins=3, sheath_len=300, sheath_units=10, carry=True)},
        "P02": {"raw": _spec(length_m=4000, weight_kg=2000, unit_count=1), "finished": _spec(length_m=500),
                "notes": _notes("P02", ["절연 후 1,000m×4보빈, 쉬스 후 500m×8보빈/1롤분.", *si_notes]),
                "graph": silicon(assets, raw_len=4000, bobbins=4, sheath_len=500, sheath_units=8, carry=False)},
        "P03": {"raw": _spec(length_m=5000, weight_kg=2000, unit_count=1), "finished": _spec(length_m=500),
                "notes": _notes("P03", ["절연 후 1,000m×5보빈, 쉬스 후 500m×10보빈/1롤분.", *si_notes]),
                "graph": silicon(assets, raw_len=5000, bobbins=5, sheath_len=500, sheath_units=10, carry=False)},
        "P04": {"raw": _spec(weight_kg=2000, length_m=NA, unit_count=1), "finished": _spec(length_m=4000),
                "notes": _notes("P04", [
                    "단계별 투입·산출 수량은 각 단계의 재료 spec에 있다(싱글-12의 12가닥 공급은 strand_count 12).",
                    "싱글 메인 산출 10개는 변경 가능한 per-operation 설정값이며 투입 길이로 자동 물량보존해 부정하지 않는다(abstract_yield).",
                    "재권취 완료가 완제품(완제품 milestone 지정)이고 검사·적재는 별도 상태. 검사 작업자는 무제한 가용(확정), 10분/보빈.",
                    ("사용자 확정: 원자재는 길이가 없고(해당 없음) 멀티신선을 거치며 길이가 생긴다, 싱글-12의 대기 120분은 재료를 걸어 두는 "
                     "작업이라 작업 시간 2시간(작업마다·설비 점유), 싱글-12·싱글-1은 메인 작업 동안 점유하지 않는다."),
                    ("사용자 확정: 멀티신선은 원자재 2개를 한 번에 받아 12보빈을 순차로 하나씩 만든다(보빈당 40,000m ÷ 100m/min). "
                     "싱글 메인도 같은 순차 산출로 두었다(07 §4 예시 125분/보빈, 확인 대기). 싱글 메인의 공급 입력은 "
                     "싱글-12가 준비한 12보빈이다(03 §12). GRP-001(EQ-094~096 연계 그룹)은 계약 밖(그룹 미도입)."),
                    TRANSPORT_NOTE, *INTAKE_NOTES,
                    "운반 경로: ST-020→ST-021 지게차, ST-021→ST-008 AMR."]),
                "graph": p04(assets)},
        "P05": {"raw": _spec(weight_kg=3300, length_m=NA, unit_count=1), "finished": _spec(length_m=600),
                "notes": _notes("P05", [
                    "단계별 투입·산출 수량은 각 단계의 재료 spec에 있다(태신선 3.3t×11개 동시→1t×36보빈, 재권취 12,000m→600m×20 등).",
                    ("잔량: 태신선 36.3t 투입·36t 산출 차이 300kg 폐기(무게 잔량은 모형에 없어 메모로만 남김), 절연 100,000m 투입·"
                     "96,000m 산출 차이 4,000m는 폐기(사용자 확정, 잔량 규칙 discard)."),
                    "되돌리지 말 정정: 연선은 100,000→100,000(24,000×4 아님), 절연에서 24,000×4 분할, 1차 조사는 1→1, 검사 600→600.",
                    ("사용자 확정: 원자재는 길이가 없고(해당 없음) 태신선·멀티신선을 거치며 길이가 생긴다, 원자재 첫 공간은 ST-005, "
                     "입고 24개여도 태신선이 11개씩 확보하므로 2개가 남아 입력 부족으로 끝나는 것은 정상(공정 정보는 사용자가 수정해 다시 실행). "
                     "모든 단계 보빈별 인계, 검사 작업자 무제한. 재권취 완료가 완제품(완제품 milestone 지정)."),
                    TRANSPORT_NOTE, *INTAKE_NOTES,
                    "운반 경로: ST-012→ST-013 지게차(1차 조사 후만), ST-022→ST-009 AMR."]),
                "graph": p05(assets)},
        "P06": {"raw": _spec(length_m=2000, weight_kg=2000, unit_count=1), "finished": _spec(length_m=500),
                "notes": _notes("P06", [
                    "최초 작업은 절연이지만 설비는 쉬스 압출기 EQ-034~035(EQ-032~033이 아님). 테이핑 공정 없음(제품5 경로 복제 금지).",
                    "단계별 투입·산출 수량은 각 단계의 재료 spec에 있다. 재권취 완료가 완제품(완제품 milestone 지정).",
                    ("쉬스·2차 조사 입력은 1,000m, 검사 입력·완제품은 500m(문서의 100m/600m 표기는 오기). 무손실 단위 관계상 "
                    "원자재 1보빈→최종 500m 4보빈이며 실제 생산계획 수량이 아니다."),
                    TRANSPORT_NOTE, *INTAKE_NOTES,
                    "운반 경로: ST-012→ST-013 지게차, ST-022→ST-009 AMR. 검사 작업자 무제한."]),
                "graph": p06(assets)},
    }


# --- 실행 ---------------------------------------------------------------------------------------
def ensure_project(engine: Engine) -> dict:
    base = seed_dev_data.seed(engine)
    project = seed_dev_data.dev_id(f"project:{PROJECT_CODE}")
    org = base["organization_id"]
    with engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO project (id, organization_id, code, name, description, timezone) VALUES "
            "(:i, :o, :c, '전선 공장 기준정보', :d, 'Asia/Seoul') ON CONFLICT DO NOTHING"),
            {"i": project, "o": org, "c": PROJECT_CODE,
             "d": f"{SOURCE} 기준(설비 96·공간 22·제품 6). 프로젝트 코드는 개발 인계용 제안이다."})
        for name, user_id in base["users"].items():
            _, role = seed_dev_data.ROLES[name]
            conn.execute(text(
                "INSERT INTO project_member (id, organization_id, project_id, user_id, role) "
                "VALUES (:i, :o, :p, :u, :r) ON CONFLICT DO NOTHING"),
                {"i": seed_dev_data.dev_id(f"project-member:{PROJECT_CODE}:{name}"), "o": org,
                 "p": project, "u": user_id, "r": role})
    return {"project": project, "users": base["users"]}


def asset_ids(engine: Engine, project: uuid.UUID) -> dict[str, str]:
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT code, id FROM asset WHERE project_id = :p"), {"p": project})
        return {code: str(i) for code, i in rows}


def seed_assets(seeder, engine, project) -> dict:
    url = f"{API}/projects/{project}/assets"
    existing, created = asset_ids(engine, project), 0
    sort = 0
    for first, last, name, group in EQUIPMENT:
        for number in range(first, last + 1):
            sort += 10
            code = f"EQ-{number:03d}"
            if code in existing:
                continue
            note = f"분류: {group}. 출처 {SOURCE} §2."
            if code in ("EQ-094", "EQ-095", "EQ-096"):
                note += " 연계 그룹 GRP-001의 구성원(그룹은 아직 계약에 없음)."
            seeder.post(url, {"kind": "equipment", "code": code, "name": name, "sort_order": sort,
                              "notes": note, "equipment": {"equipment_type": name}})
            created += 1
    for index, (code, name, note) in enumerate(SPACES, start=1):
        if code in existing:
            continue
        kind = "dock" if code in DOCKS else "storage"
        seeder.post(url, {"kind": kind, "code": code, "name": name, "sort_order": 1000 + index * 10,
                          "notes": f"{note}. 출처 {SOURCE} §3. 용량·좌표 미정.",
                          "space": {"space_type": "AMR 도킹 위치" if kind == "dock" else "저장·대기 공간"}})
        created += 1
    return {"created": created}


def seed_products(seeder, project) -> dict[str, str]:
    base = f"{API}/projects/{project}/products"
    have = {p["code"]: p["id"] for p in seeder.client.get(
        f"{base}?limit=100", headers=seeder.headers).json()["data"]}
    for code, name in PRODUCTS.items():
        if code not in have:
            have[code] = seeder.post(base, {"code": code, "name": name,
                                            "notes": f"출처 {SOURCE}. 코드 P01~P06은 개발 인계용 제안이다."})["id"]
    return have


def _get(seeder, url):
    response = seeder.client.get(url, headers=seeder.headers)
    assert response.status_code == 200, f"GET {url} -> {response.status_code}: {response.text}"
    return response.json()["data"]


def _send(seeder, method, url, body, etag):
    response = getattr(seeder.client, method)(
        url, json=body, headers={**seeder.headers, "If-Match": f'"{etag}"'})
    if response.status_code >= 300:
        raise RuntimeError(f"{method.upper()} {url} -> {response.status_code}: {response.text}")
    return response.json()["data"]


def _upgrade_version(seeder, project, code, spec, listed) -> bool:
    """계약 0.6.0 이전에 만든 draft 공정에 재료 spec·간선 연결·완제품 지정을 보충한다(멱등).

    이미 spec이나 완제품 지정이 있거나(보충됨·사람이 수정함) 구조가 시드와 다르면 건드리지 않는다.
    기존 노드·간선 id는 유지하고 새 필드만 채워 그래프를 다시 저장한다."""
    if listed["status"] != "draft":
        return False
    base = f"{API}/projects/{project}/process-versions/{listed['id']}"
    version, graph = _get(seeder, base), _get(seeder, f"{base}/graph")
    if graph["completion_node_id"] or any(n["step"] and n["step"]["material_specs"] for n in graph["nodes"]):
        return False
    wanted = spec["graph"]
    nodes_by_key = {n["node_key"]: n for n in wanted["nodes"]}
    edges_by_key = {e["edge_key"]: e for e in wanted["edges"]}
    if {n["node_key"] for n in graph["nodes"]} != set(nodes_by_key) or \
            {e["edge_key"] for e in graph["edges"]} != set(edges_by_key):
        return False
    nodes = [{**n, "step": None if n["step"] is None else {
        **n["step"], "material_specs": nodes_by_key[n["node_key"]]["step"]["material_specs"]}}
        for n in graph["nodes"]]
    edges = [{**e, "source_output_spec_key": edges_by_key[e["edge_key"]].get("source_output_spec_key"),
              "target_input_spec_key": edges_by_key[e["edge_key"]].get("target_input_spec_key")}
             for e in graph["edges"]]
    completion = next((n["id"] for n in graph["nodes"]
                       if wanted["completion_node_id"] and n["node_key"] == "complete"), None)
    saved = _send(seeder, "put", f"{base}/graph",
                  {"nodes": nodes, "edges": edges, "completion_node_id": completion},
                  version["row_version"])
    if (version["notes"] or "").startswith(notes_head(code)):  # 시드가 쓴 메모만 새 내용으로 바꾼다
        _send(seeder, "patch", base, {"notes": spec["notes"]}, saved["row_version"])
    return True


def _apply_intake(seeder, project, code, spec, listed) -> bool:
    """사용자 정리 반영(2026-10-27) 전에 만든 draft 공정에 새 값을 적용한다(멱등).

    시드가 쓴 메모가 그대로이고(사람이 고치지 않음), 현재 노드가 모두 새 구성에도 있을 때만 바꾼다(사람이 노드를 더하지
    않음). 같은 node_key·edge_key의 id는 유지하고 새로 생기는 노드(예: 완제품 milestone)·간선만 새 id를 받는다.
    승인·검토 중인 버전은 건드리지 않는다."""
    if listed["status"] != "draft":
        return False
    base = f"{API}/projects/{project}/process-versions/{listed['id']}"
    version = _get(seeder, base)
    if not (version["notes"] or "").startswith(previous_notes_heads(code)):
        return False
    graph = _get(seeder, f"{base}/graph")
    wanted = spec["graph"]
    wanted_key = {n["id"]: n["node_key"] for n in wanted["nodes"]}
    if not {n["node_key"] for n in graph["nodes"]} <= set(wanted_key.values()):
        return False
    old_nodes = {n["node_key"]: n["id"] for n in graph["nodes"]}
    old_edges = {e["edge_key"]: e["id"] for e in graph["edges"]}
    nodes = [{**n, "id": old_nodes.get(n["node_key"], n["id"])} for n in wanted["nodes"]]
    new_id = {n["node_key"]: n["id"] for n in nodes}
    edges = [{**e, "id": old_edges.get(e["edge_key"], e["id"]),
              "from_node_id": new_id[wanted_key[e["from_node_id"]]],
              "to_node_id": new_id[wanted_key[e["to_node_id"]]]} for e in wanted["edges"]]
    completion = new_id["complete"] if wanted["completion_node_id"] else None
    saved = _send(seeder, "put", f"{base}/graph",
                  {"nodes": nodes, "edges": edges, "completion_node_id": completion}, version["row_version"])
    _send(seeder, "patch", base, {"raw_unit_spec": spec["raw"], "finished_unit_spec": spec["finished"],
                                  "notes": spec["notes"]}, saved["row_version"])
    return True


def seed_processes(seeder, project, products, assets) -> dict:
    created, upgraded, reapplied = [], [], []
    for code, spec in definitions(assets).items():
        url = f"{API}/projects/{project}/products/{products[code]}/process-versions"
        versions = _get(seeder, url)
        if versions:
            if _upgrade_version(seeder, project, code, spec, versions[0]):
                upgraded.append(code)
            if _apply_intake(seeder, project, code, spec, versions[0]):
                reapplied.append(code)
            continue
        version = seeder.post(url)
        version = seeder.patch(f"{API}/projects/{project}/process-versions/{version['id']}", {
            "raw_unit_spec": spec["raw"], "finished_unit_spec": spec["finished"], "notes": spec["notes"]},
            version["row_version"])
        _send(seeder, "put", f"{API}/projects/{project}/process-versions/{version['id']}/graph",
              spec["graph"], version["row_version"])
        created.append(code)
    return {"created": created, "upgraded": upgraded, "reapplied": reapplied}


def seed(engine: Engine) -> dict:
    fixtures = ensure_project(engine)
    project = fixtures["project"]
    seeder = seed_demo_data.Seeder(engine, fixtures["users"]["admin"])
    assets = seed_assets(seeder, engine, project)
    ids = asset_ids(engine, project)
    products = seed_products(seeder, project)
    processes = seed_processes(seeder, project, products, ids)
    return {**fixtures, "assets": assets, "products": products, "processes": processes}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--yes", action="store_true", help="대상 DB를 확인했으며 시드를 실행한다")
    args = parser.parse_args(argv[1:])
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        print("DATABASE_URL이 필요합니다.", file=sys.stderr)
        return 2
    if os.environ.get("APP_ENV") == "production":
        print("production에서는 실행할 수 없습니다.", file=sys.stderr)
        return 2
    target = make_url(url)
    print(f"대상 DB: {target.host}:{target.port}/{target.database}")
    if not args.yes:
        print("--yes를 붙여야 실행합니다.", file=sys.stderr)
        return 2
    result = seed(create_engine(url))
    print(f"project {PROJECT_CODE} = {result['project']}")
    for name, user_id in result["users"].items():
        print(f"X-Debug-User ({name}) = {user_id}")
    print(f"assets: {result['assets']}  products: {len(result['products'])}  processes: {result['processes']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
