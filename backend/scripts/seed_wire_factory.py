"""**실제 기준정보** 시드: docs/domain/08_catalog_processes.md(사용자 제공 공정의 최신 정리본)를 DB에 만든다.

사용: DATABASE_URL=... python scripts/seed_wire_factory.py --yes   (개발용 시드가 없어도 스스로 만든다)
- 프로젝트 `DEMO-WIRE`(개발 인계용 제안 코드, 사용자 기존 코드가 아님)에 설비 96대(EQ-001~096)·공간 22곳(ST-001~022)·
  제품 6종(P01~P06)·공정 버전 6건(모두 draft)을 만든다. 자산·제품·공정은 **실제 API(서비스 계층)로** 만든다.
- 서로 다른 공정 흐름은 4가지다: 실리콘 공통 경로(P01~P03, 값만 다름), P04(AL), P05(CU 세선), P06(CU 태선).
- 모르는 값은 unknown으로 둔다(0·무제한·해당 없음으로 바꾸지 않는다). 후보 설비는 설비 한 대로 지정된 경우만 `confirmed`,
  여러 호기 중 선택은 "사용 가능 호기 미확정"이므로 `unknown`이다(문서 §2·§9-8). 용량·좌표·운반 자원은 모두 미정이라 만들지 않는다.
- 현재 계약 0.5.0에 필드가 없는 값(단계별 투입 수량, 폐기량, 12가닥 공급 등)은 버전 메모(notes)에 문서 근거와 함께 남긴다.
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
SETUP_NONE = {"duration_min": known(0), "trigger": "not_applicable"}  # "준비0": 준비 없음
DELAY_UNKNOWN = {"duration_min": UNKNOWN, "trigger": "unknown", "occupancy": "unknown"}
DELAY_NONE = {"duration_min": NOT_APPLICABLE, "trigger": "not_applicable", "occupancy": "unknown"}


def setup_minutes(minutes) -> dict:
    """제공된 준비 시간. 발생 주기는 문서에 없어 trigger는 미정으로 둔다."""
    return {"duration_min": known(minutes), "trigger": "unknown"}


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


class Route:
    """한 제품의 그래프(노드·간선)를 만든다. 노드·간선 id는 새 UUID, node_key는 버전 안에서 유일."""

    def __init__(self, assets: dict[str, str]):
        self.assets = assets
        self.nodes: list[dict] = []
        self.edges: list[dict] = []

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
        return self._add("complete", "milestone", label)

    def space(self, code, suffix="") -> dict:
        return self._add(f"{code.lower()}{suffix}", "buffer", f"{code} {SPACE_NAME[code]}", code)

    def op(self, key, label, handler, equipment, *, processing, setup=SETUP_UNKNOWN, delay=DELAY_UNKNOWN,
           output=None, handoff="unknown", residual=None, worker=False) -> dict:
        resources = []
        if equipment:
            status = "confirmed" if len(equipment) == 1 else "unknown"
            resources.append({
                "role_key": "main", "resource_kind": "equipment", "selection_mode": "one_of",
                "required_count": 1, "capacity_mode": "finite", "allocation_rule": {"mode": "unknown"},
                "candidates": [{"asset_id": self.assets[c], "eligibility_status": status}
                               for c in equipment]})
        if worker:
            resources.append(INSPECTOR)
        step = {"operation_type": handler, "handler_version": "1",
                "timing_rule": {"processing": processing, "setup": setup, "precondition_delay": delay},
                "output_rule": output or out_pass(), "handoff_rule": {"mode": handoff},
                "resources": resources}
        if residual:
            step["residual_rule"] = residual
        return self._add(key, "operation", label, step=step)

    def transport(self, key, method, origin, target) -> dict:
        """문서가 방식(지게차·AMR)을 정한 운반. 이동 시간·운반 자원은 미확정이라 비워 둔다."""
        return self.op(key, f"{method} 운반 {origin}→{target}", "transport_manual", [],
                       processing={"kind": "unknown"}, output=out_pass())

    def link(self, a, b, kind="material", movement=None):
        edge = {"id": str(uuid.uuid4()), "edge_key": f"{a['node_key']}-{b['node_key']}",
                "from_node_id": a["id"], "to_node_id": b["id"], "edge_kind": kind}
        if movement:
            edge["movement_rule"] = {"mode": movement}
        self.edges.append(edge)

    def chain(self, *nodes):
        for a, b in itertools.pairwise(nodes):
            self.link(a, b)

    def graph(self) -> dict:
        return {"nodes": self.nodes, "edges": self.edges}


def inspect_op(r: Route, *, worker: bool, handoff: str, setup=SETUP_UNKNOWN, delay=DELAY_UNKNOWN):
    return r.op("inspect", "육안 검사", "inspection", [], processing=per_unit(10, "sequential_units"),
                setup=setup, delay=delay, output=out_pass(), handoff=handoff, worker=worker)


# --- 공정 1: 실리콘 공통 경로(P01~P03, §4) -------------------------------------------------------
def silicon(assets, *, bobbins, sheath_len, sheath_units, carry) -> dict:
    r = Route(assets)
    residual = ({"mode": "carry_same_product", "on_product_change": "discard", "on_run_end": "unknown",
                 "scope": "unknown", "physical_join_mode": "abstract_length_pool"} if carry else None)
    chain = [
        r.source("원자재 (2t 롤)", "ST-001"), r.space("ST-002"),
        r.op("insulate", "절연 압출", "split_length", codes(1), processing=speed(20),
             output=out_split(1000, bobbins)),
        r.space("ST-004"),
        r.op("braid", "실리콘 편조", "pass_through_length", codes(3, 10), processing=speed(1.5)),
        r.op("tape", "실리콘 테이핑", "pass_through_length", codes(11, 12), processing=speed(20)),
        r.op("sheath", "쉬스 압출", "split_length", codes(2), processing=speed(15),
             output=out_split(sheath_len, sheath_units, "per_lot"), residual=residual),
        r.space("ST-003"),
        inspect_op(r, worker=False, handoff="unknown"),
        r.sink("완제품"),
    ]
    r.chain(*chain)
    return r.graph()


# --- 공정 2: P04 HV_조사_태선(AL) (§5) ------------------------------------------------------------
def p04(assets) -> dict:
    r = Route(assets)
    N = {"handoff": "per_output_unit", "delay": DELAY_NONE}
    src, st018 = r.source("원자재 (개당 2t)", "ST-017"), None
    multi = r.op("multi", "AL 멀티신선", "output_units_by_time", codes(89), processing=speed(100, single_stream=False),
                 setup=setup_minutes(120), output=out_units(40000, 12), **N)
    st018 = r.space("ST-018")
    double = r.op("double", "AL 더블 집합", "split_length", codes(90, 93), processing=speed(100),
                  setup=SETUP_NONE, output=out_split(4000, 10), **N)
    st019 = r.space("ST-019")
    pre = r.op("single-pre", "싱글-1 선행 가공", "pass_through_length", codes(94), processing=speed(4.4),
               setup=SETUP_NONE, **N)
    feed = r.op("single-feed", "싱글-12 공급 준비", "supply_delay", codes(95), processing=NO_PROCESSING,
                setup=SETUP_NONE, delay={"duration_min": known(120), "trigger": "unknown",
                                         "occupancy": "unknown"},
                handoff="total_batch")
    main = r.op("single-main", "싱글 메인 집합", "configured_yield", codes(96),
                processing=speed(32, single_stream=False), setup=SETUP_NONE,
                output=out_units(4000, 10, "abstract_yield"), **N)
    st020, fork = r.space("ST-020"), r.transport("forklift", "지게차", "ST-020", "ST-021")
    st021, amr = r.space("ST-021"), r.transport("amr", "AMR", "ST-021", "ST-008")
    st008 = r.space("ST-008")
    insulate = r.op("insulate", "절연", "pass_through_length", codes(32, 33), processing=speed(50),
                    setup=SETUP_NONE, **N)
    st011 = r.space("ST-011")
    irradiate = r.op("irradiate", "보빈 조사", "pass_through_length", codes(36), processing=speed(110),
                     setup=SETUP_NONE, **N)
    st012 = r.space("ST-012")
    rewind = r.op("rewind", "재권취", "pass_through_length", codes(85, 88), processing=speed(50),
                  setup=SETUP_NONE, **N)
    complete, st014 = r.milestone("완제품(재권취 완료)"), r.space("ST-014")
    inspect = inspect_op(r, worker=True, handoff="per_output_unit", setup=SETUP_NONE, delay=DELAY_NONE)
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
    N = {"handoff": "per_output_unit", "delay": DELAY_NONE}
    # 출발 공간 ST-005는 "원자재 공간과의 대응 제안"일 뿐 사용자가 직접 지정한 위치가 아니므로 위치를 비워 둔다.
    chain = [
        r.source("원자재 (3.3t/보빈, 출발 위치 미확정: ST-005 대응 제안)"),
        r.op("draw", "CU 태신선", "output_units_by_time", codes(13), processing=per_unit(22),
             setup=SETUP_NONE, output=out_mass(1000, 36), **N),
        r.space("ST-006"),
        r.op("multi", "CU 멀티신선", "output_units_by_time", codes(14), processing=speed(60, single_stream=False),
             setup=setup_minutes(120), output=out_units(100000, 9), **N),
        r.space("ST-007"),
        r.op("strand", "CU 연선", "pass_through_length", codes(15, 20), processing=speed(1000),
             setup=setup_minutes(120), **N),
        r.space("ST-008"),
        r.op("insulate", "절연", "split_length", codes(32, 33), processing=speed(160), setup=SETUP_NONE,
             output=out_split(24000, 4), **N),
        r.space("ST-011", "-1"),
        r.op("irradiate-1", "1차 보빈 조사", "pass_through_length", codes(36), processing=speed(206),
             setup=SETUP_NONE, **N),
        r.space("ST-012", "-1"),
        r.transport("forklift", "지게차", "ST-012", "ST-013"),
        r.space("ST-013"),
        r.op("braid", "CU 편조", "split_length", codes(39, 80), processing=speed(1.5), setup=SETUP_NONE,
             output=out_split(12000, 2), **N),
        r.op("tape", "CU 테이핑", "pass_through_length", codes(81, 84), processing=speed(20),
             setup=SETUP_NONE, **N),
        r.space("ST-022"),  # 테이핑 OUT → ST-022 운반 방식은 미정(간선 이동 규칙 unknown)
        r.transport("amr", "AMR", "ST-022", "ST-009"),
        r.space("ST-009"),
        r.op("sheath", "쉬스 압출", "pass_through_length", codes(34, 35), processing=speed(60),
             setup=SETUP_NONE, **N),
        r.space("ST-011", "-2"),
        r.op("irradiate-2", "2차 보빈 조사", "pass_through_length", codes(36), processing=speed(195),
             setup=SETUP_NONE, **N),
        r.space("ST-012", "-2"),
        r.op("rewind", "재권취", "split_length", codes(85, 88), processing=speed(50), setup=SETUP_NONE,
             output=out_split(600, 20), **N),
        r.milestone("완제품(재권취 완료)"), r.space("ST-014"),
        inspect_op(r, worker=True, handoff="per_output_unit", setup=SETUP_NONE, delay=DELAY_NONE),
        r.space("ST-016"), r.sink("완제품"),
    ]
    r.chain(*chain)
    return r.graph()


# --- 공정 4: P06 HV_복합_태선(CU)_상품 (§7). 테이핑 공정이 없다 --------------------------------------
def p06(assets) -> dict:
    r = Route(assets)
    N = {"handoff": "per_output_unit", "delay": DELAY_NONE, "setup": SETUP_NONE}
    chain = [
        r.source("원자재 (2t, 2,000m, 1보빈)", "ST-001"), r.space("ST-010"),
        # 최초 작업은 절연이지만 설비는 쉬스 압출기 EQ-034~035(EQ-032~033으로 바꾸지 않는다)
        r.op("insulate", "절연(쉬스 압출기 사용)", "split_length", codes(34, 35), processing=speed(30),
             output=out_split(1000, 2), **N),
        r.space("ST-011", "-1"),
        r.op("irradiate-1", "1차 보빈 조사", "pass_through_length", codes(36), processing=speed(50), **N),
        r.space("ST-012", "-1"),
        r.transport("forklift", "지게차", "ST-012", "ST-013"),
        r.space("ST-013"),
        r.op("braid", "CU 편조", "pass_through_length", codes(39, 80), processing=speed(1.5), **N),
        r.space("ST-022"),  # 편조 OUT → ST-022 운반 방식은 미정
        r.transport("amr", "AMR", "ST-022", "ST-009"),
        r.space("ST-009"),
        r.op("sheath", "쉬스 압출", "pass_through_length", codes(34, 35), processing=speed(60), **N),
        r.space("ST-011", "-2"),
        r.op("irradiate-2", "2차 보빈 조사", "pass_through_length", codes(36), processing=speed(195), **N),
        r.space("ST-012", "-2"),
        r.op("rewind", "재권취", "split_length", codes(85, 88), processing=speed(30),
             output=out_split(500, 2), **N),
        r.milestone("완제품(재권취 완료)"), r.space("ST-014"),
        inspect_op(r, worker=True, handoff="per_output_unit", setup=SETUP_NONE, delay=DELAY_NONE),
        r.space("ST-016"), r.sink("완제품"),
    ]
    r.chain(*chain)
    return r.graph()


def _spec(**fields) -> dict:
    return {name: (known(v) if name != "unit_count" else count(v)) for name, v in fields.items()}


def _notes(product, lines) -> str:
    head = f"{PRODUCTS[product]} — 근거 {SOURCE}. 초안(draft)이며 문서의 미정 값은 unknown으로 두었다."
    return "\n".join([head, *lines])


def definitions(assets: dict[str, str]) -> dict[str, dict]:
    """제품 코드 → {raw, finished, notes, graph}. 값의 근거는 문서 §4~7."""
    si_notes = ["준비/교체 시간, 보빈 인계 시점, 검사 위치·자원 수, 완제품 판정 시점은 미정.",
                "편조·테이핑·쉬스 사이에 저장공간을 임의로 만들지 않았다(직결).",
                "검사 자원은 이 제품에 확인된 바 없어 작업자 무제한으로 가정하지 않았다."]
    return {
        "P01": {"raw": _spec(length_m=3000, weight_kg=2000, unit_count=1), "finished": _spec(length_m=300),
                "notes": _notes("P01", [("절연 후 1,000m×3보빈, 쉬스 후 300m×10보빈/1롤분(잔량 이월: 동일 제품 연속 생산 때 이월, "
                                        "다른 제품 투입 시 폐기, 잔량 범위·생산 종료 처리·물리적 접속 방법 미정)."), *si_notes]),
                "graph": silicon(assets, bobbins=3, sheath_len=300, sheath_units=10, carry=True)},
        "P02": {"raw": _spec(length_m=4000, weight_kg=2000, unit_count=1), "finished": _spec(length_m=500),
                "notes": _notes("P02", ["절연 후 1,000m×4보빈, 쉬스 후 500m×8보빈/1롤분.", *si_notes]),
                "graph": silicon(assets, bobbins=4, sheath_len=500, sheath_units=8, carry=False)},
        "P03": {"raw": _spec(length_m=5000, weight_kg=2000, unit_count=1), "finished": _spec(length_m=500),
                "notes": _notes("P03", ["절연 후 1,000m×5보빈, 쉬스 후 500m×10보빈/1롤분.", *si_notes]),
                "graph": silicon(assets, bobbins=5, sheath_len=500, sheath_units=10, carry=False)},
        "P04": {"raw": _spec(weight_kg=2000, unit_count=1), "finished": _spec(length_m=4000),
                "notes": _notes("P04", [
                    ("단계별 투입(현재 스키마에 필드 없음): 멀티신선 2t×2개 동시 투입→40,000m×12보빈, 더블 40,000m×1→4,000m×10, "
                    "싱글-1 4,000m×1(선행 가공), 싱글-12 4,000m×12보빈(12가닥 공급, 전체 준비 후 공급), 메인 선행1+공급12→4,000m×10보빈."),
                    "싱글 메인 산출 10개는 변경 가능한 per-operation 설정값이며 투입 길이로 자동 물량보존해 부정하지 않는다(abstract_yield).",
                    "재권취 완료가 완제품이고 검사·적재는 별도 상태. 검사 작업자는 무제한 가용(확정), 10분/보빈.",
                    ("미정: 멀티신선 12보빈 동시/순차와 선속의 스트림 기준, 준비·대기 120분의 발생 주기, feeder 점유(OPEN-004), "
                    "싱글-1/메인의 인계·원자재 소비 시점. GRP-001(EQ-094~096 연계 그룹)은 계약 밖(그룹 미도입)."),
                    "운반: ST-020→ST-021 지게차, ST-021→ST-008 AMR(이동 시간·운반 자원 미확정)."]),
                "graph": p04(assets)},
        "P05": {"raw": _spec(weight_kg=3300, unit_count=1), "finished": _spec(length_m=600),
                "notes": _notes("P05", [
                    ("단계별 투입(현재 스키마에 필드 없음): 태신선 3.3t×11개 동시→1t×36보빈, 멀티신선 1t×24보빈 동시→100,000m×9보빈, "
                    "연선 100,000m×1→100,000m×1, 절연 100,000m×1→24,000m×4, 편조 24,000m×1→12,000m×2, 재권취 12,000m×1→600m×20."),
                    "잔량: 태신선 36.3t 투입·36t 산출 차이 300kg 폐기, 절연 100,000m 투입·96,000m 산출 차이 4,000m 처리 미정.",
                    "되돌리지 말 정정: 연선은 100,000→100,000(24,000×4 아님), 절연에서 24,000×4 분할, 1차 조사는 1→1, 검사 600→600.",
                    "출발 위치 ST-005는 원자재 공간 대응 제안이라 위치를 비워 두었다(inferred). 모든 단계 보빈별 인계, 검사 작업자 무제한.",
                    "운반: ST-012→ST-013 지게차(1차 조사 후만), ST-022→ST-009 AMR. 테이핑 OUT→ST-022 운반 방식 미정."]),
                "graph": p05(assets)},
        "P06": {"raw": _spec(length_m=2000, weight_kg=2000, unit_count=1), "finished": _spec(length_m=500),
                "notes": _notes("P06", [
                    "최초 작업은 절연이지만 설비는 쉬스 압출기 EQ-034~035(EQ-032~033이 아님). 테이핑 공정 없음(제품5 경로 복제 금지).",
                    "단계별 투입(현재 스키마에 필드 없음): 절연 2,000m×1→1,000m×2, 이후 1,000m×1→1,000m×1, 재권취 1,000m×1→500m×2.",
                    ("쉬스·2차 조사 입력은 1,000m, 검사 입력·완제품은 500m(문서의 100m/600m 표기는 오기). 무손실 단위 관계상 "
                    "원자재 1보빈→최종 500m 4보빈이며 실제 생산계획 수량이 아니다."),
                    "운반: ST-012→ST-013 지게차, 편조 OUT→ST-022 방식 미정, ST-022→ST-009 AMR. 검사 작업자 무제한."]),
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


def seed_processes(seeder, project, products, assets) -> dict:
    created = []
    for code, spec in definitions(assets).items():
        url = f"{API}/projects/{project}/products/{products[code]}/process-versions"
        if seeder.client.get(url, headers=seeder.headers).json()["data"]:
            continue
        version = seeder.post(url)
        version = seeder.patch(f"{API}/projects/{project}/process-versions/{version['id']}", {
            "raw_unit_spec": spec["raw"], "finished_unit_spec": spec["finished"], "notes": spec["notes"]},
            version["row_version"])
        response = seeder.client.put(
            f"{API}/projects/{project}/process-versions/{version['id']}/graph", json=spec["graph"],
            headers={**seeder.headers, "If-Match": f'"{version["row_version"]}"'})
        if response.status_code >= 300:
            raise RuntimeError(f"PUT graph {code} -> {response.status_code}: {response.text}")
        created.append(code)
    return {"created": created}


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
