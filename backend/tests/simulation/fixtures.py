"""엔진 시험용 공정 snapshot 조립기. **테스트 전용 입력**이며 실제 공정 값이 아니다(G0-08).

도메인 문서의 제품 이름·설비 코드를 엔진 분기에 쓰지 않는다: 여기서는 단계 key·자산 id가 임의 문자열이다.
snapshot의 모양은 계약 0.6.0의 버전·그래프 응답(JSON dict)과 같다.
"""

import copy
import uuid

from simulation_platform.simulation.compiler import ProcessSnapshot

UNKNOWN = {"mode": "unknown", "value": None}
NA = {"mode": "not_applicable", "value": None}


def known(value):
    return {"mode": "known", "value": value}


def uid():
    return str(uuid.uuid4())


def speed(value, streams=1, basis="per_stream", schedule="sequential_units"):
    return {"kind": "output_speed", "speed_m_per_min": known(value), "basis": basis,
            "output_schedule": schedule, "parallel_streams": known(streams)}


def per_unit(minutes, schedule="sequential_units"):
    return {"kind": "per_output_unit", "duration_min": known(minutes), "output_schedule": schedule}


SETUP_NONE = {"duration_min": NA, "trigger": "not_applicable"}
DELAY_NONE = {"duration_min": NA, "trigger": "not_applicable", "occupancy": "unknown"}


def out_split(length, count=None, basis="per_input_unit"):
    return {"mode": "split_length", "unit_form": "보빈", "length_m": known(length),
            "unit_count": known(count) if count else UNKNOWN, "quantity_basis": basis,
            "schedule": "sequential_units", "accounting_mode": "physical"}


def out_pass():
    return {"mode": "pass_through", "unit_form": None, "length_m": UNKNOWN, "weight_kg": UNKNOWN,
            "unit_count": UNKNOWN, "quantity_basis": "per_input_unit", "schedule": "unknown",
            "accounting_mode": "physical"}


def resource(assets, allocation="unknown", status="confirmed"):
    return {"role_key": "main", "resource_kind": "equipment", "selection_mode": "one_of",
            "required_count": 1, "capacity_mode": "finite", "allocation_rule": {"mode": allocation},
            "candidates": [{"asset_id": a, "eligibility_status": status} for a in assets]}


WORKER = {"role_key": "inspector", "resource_kind": "worker", "selection_mode": "one_of",
          "required_count": 1, "capacity_mode": "unlimited", "allocation_rule": {"mode": "unknown"},
          "candidates": []}


def step(handler, *, processing, output, assets=(), allocation="unknown", setup=SETUP_NONE,
         delay=DELAY_NONE, handoff="per_output_unit", residual="none", worker=False, state=None,
         resources=None, specs=None):
    resources = resources if resources is not None else (
        ([resource(assets, allocation)] if assets else []) + ([copy.deepcopy(WORKER)] if worker else []))
    material_specs = specs if specs is not None else (
        [] if state is None else [{"spec_key": "out", "direction": "output", "state_code": state,
                                   "form": "보빈", "material_definition_id": None, "length_m": UNKNOWN,
                                   "weight_kg": UNKNOWN, "unit_count": UNKNOWN, "strand_count": UNKNOWN,
                                   "quantity_basis": "per_operation"}])
    return {"operation_type": handler, "handler_version": "1",
            "timing_rule": {"processing": processing, "setup": setup, "precondition_delay": delay},
            "input_rule": {"acquire_scope": "per_operation", "consume_policy": "consume"},
            "output_rule": output, "handoff_rule": {"mode": handoff},
            "residual_rule": {"mode": residual, "on_product_change": "unknown", "on_run_end": "unknown",
                              "scope": "unknown", "physical_join_mode": "unknown"},
            "resources": resources, "material_specs": material_specs}


class Graph:
    """선형 그래프 조립기: source → ... → sink. 노드 key로 단계를 찾는다."""

    def __init__(self):
        self.nodes, self.edges = [], []

    def node(self, key, kind, step=None, asset_id=None):
        node = {"id": uid(), "node_key": key, "kind": kind, "label": key, "asset_id": asset_id,
                "display_order": len(self.nodes), "step": step}
        self.nodes.append(node)
        return node

    def chain(self):
        for a, b in zip(self.nodes, self.nodes[1:], strict=False):
            self.edges.append({
                "id": uid(), "edge_key": f"{a['node_key']}-{b['node_key']}", "from_node_id": a["id"],
                "to_node_id": b["id"], "edge_kind": "material", "movement_rule": {"mode": "unknown"},
                "source_output_spec_key": None, "target_input_spec_key": None})
        return self

    def snapshot(self, *, status="approved", completion="complete", schema="1.0"):
        completion_id = next((n["id"] for n in self.nodes if n["node_key"] == completion), None)
        return ProcessSnapshot(
            version_id=uid(), project_id=uid(), status=status, schema_version=schema,
            raw_unit_spec={"length_m": known("2000"), "weight_kg": UNKNOWN, "unit_count": UNKNOWN,
                           "strand_count": UNKNOWN},
            finished_unit_spec={"length_m": known("1000"), "weight_kg": UNKNOWN, "unit_count": UNKNOWN,
                                "strand_count": UNKNOWN},
            completion_node_id=completion_id, nodes=tuple(self.nodes), edges=tuple(self.edges))


STORAGE_A, STORAGE_B = uid(), uid()
EQUIPMENT_1, EQUIPMENT_2, EQUIPMENT_3 = uid(), uid(), uid()


def single_insulation(*, speed_value="30", unit=1000, count=2, assets=(EQUIPMENT_1,), handoff="per_output_unit",
                      allocation="unknown", setup=SETUP_NONE, residual="none", **snapshot_args):
    """원자재 1개(2,000m)를 한 설비에서 1,000m 단위 둘로 나누는 단일 단계(제품6 절연의 시험 전용 입력)."""
    g = Graph()
    g.node("src", "source")
    g.node("wait_in", "buffer", asset_id=STORAGE_A)
    g.node("insulate", "operation", step("split_length", processing=speed(speed_value),
                                         output=out_split(unit, count), assets=assets, handoff=handoff,
                                         allocation=allocation, setup=setup, residual=residual,
                                         state="절연 후"))
    g.node("wait_out", "buffer", asset_id=STORAGE_B)
    g.node("complete", "milestone")
    g.node("sink", "sink")
    return g.chain().snapshot(**snapshot_args)
