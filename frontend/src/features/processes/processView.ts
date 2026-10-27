import type { Schemas } from "../../shared/api/types";
import type { KnownValue } from "../../shared/components/KnownValueInput";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import {
  knownToCount,
  knownToDecimal,
  measureToKnown,
  stepOf,
  validateMeasure,
  type CountMeasure,
  type DecimalMeasure,
  type DurationMeasure,
  type GraphDoc,
  type GraphNode,
  type StepDto,
} from "./processDoc";

/**
 * 공정 화면 뷰 모델(계약 0.4.0 `process-versions`). 서버 값을 임의로 보정하지 않는다.
 * 마스터 공정 버전에는 `assumed`(가정) 상태가 없다: 확인 상태는 필드 단위(unknown/known/not_applicable)이며
 * 가정은 시나리오 입력이다(03 §2, BE-REQ-015).
 */

/* ---------------- 라벨(코드값은 계약 그대로, 문구만 FE가 정한다) ---------------- */

export const PROCESSING_LABELS = {
  unknown: "미정",
  none: "처리 시간 없음",
  output_speed: "산출 선속 (m/분)",
  per_output_unit: "산출 단위당 시간 (분)",
  per_reference_length: "기준 길이당 시간",
} as const;
export type ProcessingKind = keyof typeof PROCESSING_LABELS;

export const BASIS_LABELS = { unknown: "미정", per_stream: "가닥(스트림)별", aggregate_output: "합산 산출" } as const;
export const OUTPUT_SCHEDULE_LABELS = {
  unknown: "미정",
  sequential_units: "단위를 차례로",
  parallel_streams: "스트림 병렬",
} as const;
export const SCALING_LABELS = { unknown: "미정", linear: "길이에 비례" } as const;
export const INCLUDES_SETUP_LABELS = { unknown: "미정", yes: "준비 시간 포함", no: "준비 시간 별도" } as const;

export const TRIGGER_LABELS = {
  unknown: "미정",
  not_applicable: "해당 없음",
  per_operation: "작업마다",
  per_input_replacement: "투입 교체마다",
  per_output_replacement: "산출 교체마다",
  on_product_change: "제품 교체 시",
  on_shift_start: "근무 시작 시",
  once_per_run: "실행당 한 번",
} as const;
export const OCCUPANCY_LABELS = {
  unknown: "미정",
  occupies_machine: "대기 중 설비 점유",
  releases_machine: "대기 중 설비 해제",
} as const;

export const OUTPUT_MODE_LABELS = {
  unknown: "미정",
  configured_units: "산출 수량 지정",
  split_length: "길이 분할",
  pass_through: "그대로 유지",
  merge_strands: "가닥 합류",
  fixed_mass_units: "고정 중량 단위",
} as const;
export type OutputMode = keyof typeof OUTPUT_MODE_LABELS;
export const QUANTITY_BASIS_LABELS = {
  unknown: "미정",
  per_operation: "작업당",
  per_input_unit: "투입 단위당",
  per_lot: "로트당",
  total_plan: "총 계획 수량",
} as const;
export const SCHEDULE_LABELS = { unknown: "미정", sequential_units: "단위를 차례로" } as const;
export const ACCOUNTING_LABELS = { unknown: "미정", physical: "물리 수량", abstract_yield: "추상 수율" } as const;

export const ACQUIRE_SCOPE_LABELS = { unknown: "미정", per_operation: "작업마다", per_lot: "로트마다" } as const;
export const CONSUME_POLICY_LABELS = { unknown: "미정", reserve: "예약", consume: "소모", transfer: "이전" } as const;
export const HANDOFF_LABELS = { unknown: "미정", per_output_unit: "산출 단위마다", total_batch: "일괄" } as const;
export const RESIDUAL_MODE_LABELS = { unknown: "미정", none: "없음", carry_same_product: "같은 제품에 이월", discard: "그 자리에서 폐기" } as const;
export const RESIDUAL_SCOPE_LABELS = {
  unknown: "미정",
  machine: "설비",
  product: "제품",
  operation: "작업",
  lot: "로트",
} as const;
export const RESIDUAL_ACTION_LABELS = { unknown: "미정", discard: "폐기", carry: "이월" } as const;
export const JOIN_MODE_LABELS = { unknown: "미정", abstract_length_pool: "길이 풀(추상)" } as const;

export const SELECTION_LABELS = { one_of: "후보 중 선택", all_of: "모두 필요" } as const;
export const RESOURCE_KIND_LABELS = { equipment: "설비", worker: "작업자" } as const;
export const CAPACITY_MODE_LABELS = { finite: "유한", unlimited: "무제한" } as const;
export const ALLOCATION_LABELS = { unknown: "미정", fifo: "먼저 온 순서", priority: "우선순위", first_available: "먼저 비는 설비" } as const;
export const ELIGIBILITY_LABELS = { confirmed: "확인됨", unknown: "미확인" } as const;

export const NODE_KIND_LABELS = {
  source: "시작(원자재)",
  buffer: "대기 공간",
  operation: "공정 단계",
  join: "합류",
  milestone: "완료 기준",
  sink: "끝(완제품)",
} as const;
export const MOVEMENT_LABELS = {
  unknown: "미정",
  manual_duration: "사람이 정한 이동 시간",
  network_route: "경로망 이동",
  direct_feed: "직결 공급",
} as const;
export const EDGE_KIND_LABELS = { material: "물류", precedence: "선후 관계", supply: "공급" } as const;

/** 엔진이 지원하는 handler(07 §2). 등록은 아무 문자열이나 가능하며 실행 가능 여부만 서버가 판정한다. */
export const KNOWN_HANDLERS = [
  "pass_through_length",
  "split_length",
  "output_units_by_time",
  "configured_yield",
  "supply_delay",
  "inspection",
  "transport_manual",
] as const;

/* ---------------- 단위(원자재·완제품) ---------------- */

export type UnitSpecEdit = {
  lengthM: KnownValue;
  weightKg: KnownValue;
  unitCount: KnownValue;
  strandCount: KnownValue;
};
export type UnitSpecField = keyof UnitSpecEdit;

type DefaultSpec = Schemas["DefaultSpec"];
export type DefaultSpecPatch = Schemas["DefaultSpecPatch"];

export function toUnitSpecEdit(s: DefaultSpec | null | undefined): UnitSpecEdit {
  return {
    lengthM: measureToKnown(s?.length_m, "m"),
    weightKg: measureToKnown(s?.weight_kg, "kg"),
    unitCount: measureToKnown(s?.unit_count, "item"),
    strandCount: measureToKnown(s?.strand_count, "strand"),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const UNIT_FIELDS: UnitSpecField[] = ["lengthM", "weightKg", "unitCount", "strandCount"];
/** 비교용: 단위 선택은 서버에 가지 않으므로 mode·value만 본다 */
const core = (v: KnownValue) => ({ mode: v.mode, value: v.mode === "value" ? v.value : "" });

export function changedUnitFields(base: UnitSpecEdit, draft: UnitSpecEdit): UnitSpecField[] {
  return UNIT_FIELDS.filter((k) => !same(core(base[k]), core(draft[k])));
}

/** 보낸 필드만 교체되므로 바꾼 필드만 보낸다. 확정값을 미정으로 되돌릴 때는 `{mode: "unknown"}`이다. */
export function buildUnitSpecPatch(base: UnitSpecEdit, draft: UnitSpecEdit): DefaultSpecPatch | null {
  const changed = new Set(changedUnitFields(base, draft));
  const body: DefaultSpecPatch = {};
  if (changed.has("lengthM")) body.length_m = knownToDecimal(draft.lengthM);
  if (changed.has("weightKg")) body.weight_kg = knownToDecimal(draft.weightKg);
  if (changed.has("unitCount")) body.unit_count = knownToCount(draft.unitCount);
  if (changed.has("strandCount")) body.strand_count = knownToCount(draft.strandCount);
  return Object.keys(body).length > 0 ? body : null;
}

export const UNIT_FIELD_LABELS: Record<UnitSpecField, string> = {
  lengthM: "길이",
  weightKg: "중량",
  unitCount: "단위 수",
  strandCount: "가닥 수",
};

export function validateUnitSpec(u: UnitSpecEdit): Partial<Record<UnitSpecField, string>> {
  const e: Partial<Record<UnitSpecField, string>> = {};
  const l = validateMeasure(u.lengthM, "positive");
  if (l) e.lengthM = l;
  const w = validateMeasure(u.weightKg, "positive");
  if (w) e.weightKg = w;
  const c = validateMeasure(u.unitCount, "count");
  if (c) e.unitCount = c;
  const s = validateMeasure(u.strandCount, "count");
  if (s) e.strandCount = s;
  return e;
}

/* ---------------- 버전·그래프 뷰 ---------------- */

export type ProcessVersionView = {
  id: string;
  productId: string;
  versionNo: number;
  /** 서버 값 그대로. draft|in_review|approved|superseded 외의 값도 올 수 있다. */
  status: string;
  baseVersionId: string | null;
  rawUnitSpec: UnitSpecEdit;
  finishedUnitSpec: UnitSpecEdit;
  notes: string | null;
  /** 서버가 계산한 knowledge 검증 결과 */
  issues: ValidationIssue[];
  rejectionReason: string | null;
  approvedAt: string | null;
  rowVersion: number;
};

export type ProcessGraphView = {
  rowVersion: number;
  doc: GraphDoc;
  issues: ValidationIssue[];
};

/** 제품의 공정 버전 목록 행 */
export type ProcessVersionListItem = {
  id: string;
  versionNo: number;
  status: string;
  baseVersionId: string | null;
  approvedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  rowVersion: number;
};

export function toIssue(i: Schemas["IssueDto"]): ValidationIssue {
  return {
    severity: i.severity,
    rule_id: i.rule_id,
    entity_id: i.entity_id,
    field_path: i.field_path,
    message: i.message,
    ...(i.resolution ? { resolution: i.resolution } : {}),
  };
}

export function toProcessVersionView(v: Schemas["ProcessVersionOut"]): ProcessVersionView {
  return {
    id: v.id,
    productId: v.product_id,
    versionNo: v.version_no,
    status: v.status,
    baseVersionId: v.base_version_id,
    rawUnitSpec: toUnitSpecEdit(v.raw_unit_spec),
    finishedUnitSpec: toUnitSpecEdit(v.finished_unit_spec),
    notes: v.notes,
    issues: v.issues.map(toIssue),
    rejectionReason: v.rejection_reason,
    approvedAt: v.approved_at,
    rowVersion: v.row_version,
  };
}

export function toGraphView(g: Schemas["GraphOut"]): ProcessGraphView {
  return {
    rowVersion: g.row_version,
    doc: { nodes: g.nodes, edges: g.edges, completion_node_id: g.completion_node_id ?? null },
    issues: g.issues.map(toIssue),
  };
}

export function toListItem(v: Schemas["ProcessVersionListItem"]): ProcessVersionListItem {
  return {
    id: v.id,
    versionNo: v.version_no,
    status: v.status,
    baseVersionId: v.base_version_id,
    approvedAt: v.approved_at,
    submittedAt: v.submitted_at,
    createdAt: v.created_at,
    rowVersion: v.row_version,
  };
}

/** 열린 버전(draft·in_review)은 제품당 하나만 둘 수 있다(409 PROCESS_DRAFT_EXISTS). */
export const isOpenProcessStatus = (s: string) => s === "draft" || s === "in_review";

/** 항목을 entity_id별로 묶는다. 단계·노드·간선·버전 자체가 대상이다(순서 번호를 쓰지 않는다). */
export function issuesByEntity(issues: ValidationIssue[]): Map<string, ValidationIssue[]> {
  const m = new Map<string, ValidationIssue[]>();
  for (const i of issues) {
    const id = i.entity_id ?? "";
    m.set(id, [...(m.get(id) ?? []), i]);
  }
  return m;
}

/* ---------------- 표시 문구 ---------------- */

type AnyMeasure = DecimalMeasure | DurationMeasure | CountMeasure | null | undefined;

/** 목록·요약용: 미정을 0이나 빈칸으로 보이지 않게 한다. */
export function measureText(m: AnyMeasure, unitLabel: string): string {
  if (!m || m.mode === "unknown") return "미정";
  if (m.mode === "not_applicable") return "해당 없음";
  return `${m.value ?? ""} ${unitLabel}`.trim();
}

export function processingText(step: StepDto): string {
  const p = step.timing_rule?.processing;
  switch (p?.kind) {
    case undefined:
    case "unknown":
      return "미정";
    case "none":
      return "처리 시간 없음";
    case "output_speed":
      return `${measureText(p.speed_m_per_min, "m/분")} (산출 기준)`;
    case "per_output_unit":
      return `산출 단위당 ${measureText(p.duration_min, "분")}`;
    case "per_reference_length":
      return `기준 ${measureText(p.reference_length_m, "m")}당 ${measureText(p.duration_min, "분")}`;
  }
}

export function setupText(step: StepDto): string {
  const s = step.timing_rule?.setup;
  if (!s || s.trigger === "unknown") return "미정";
  if (s.trigger === "not_applicable") return "없음";
  return `${measureText(s.duration_min, "분")} · ${TRIGGER_LABELS[s.trigger]}`;
}

export function outputText(step: StepDto): string {
  const o = step.output_rule;
  switch (o?.mode) {
    case undefined:
    case "unknown":
      return "미정";
    case "pass_through":
      return "길이·수량 유지";
    case "split_length":
      return `${measureText(o.length_m, "m")}씩 분할`;
    case "configured_units":
      return `${measureText(o.length_m, "m")} × ${measureText(o.unit_count, "단위")}`;
    case "merge_strands":
      return `가닥 합류 (${measureText(o.unit_count, "단위")})`;
    case "fixed_mass_units":
      return `${measureText(o.weight_kg, "kg")} × ${measureText(o.unit_count, "단위")}`;
  }
}

/** 설비 후보 문구. 자산 id → 표시 코드는 호출한 쪽이 넘긴다(알 수 없는 자산은 id 앞부분으로 보인다). */
export function resourcesText(step: StepDto, assetCode: (id: string) => string): string {
  const reqs = step.resources ?? [];
  if (reqs.length === 0) return "후보 없음";
  return reqs
    .map((r) => {
      if (r.resource_kind === "worker") return r.capacity_mode === "unlimited" ? "작업자(무제한)" : `작업자 ${r.required_count}명`;
      const codes = (r.candidates ?? []).map((c) => assetCode(c.asset_id));
      if (codes.length === 0) return "설비 후보 없음";
      const how = r.selection_mode === "all_of" ? "모두" : `택${r.required_count ?? 1}`;
      return `${codes.join(", ")} (${how})`;
    })
    .join(" / ");
}

/* ---------------- 클라이언트 입력 검증(형식만, 최종 판정은 서버) ---------------- */

/**
 * 단계 하나의 입력 형식 오류. 미정은 오류가 아니라 서버 검증이 경고로 알려 준다
 * (연동 모드에서 FE가 경고를 따로 만들지 않는다 — 서버 `issues`가 정본).
 */
export function validateStepInput(node: GraphNode, order: number): ValidationIssue[] {
  if (node.kind !== "operation") return [];
  const issues: ValidationIssue[] = [];
  const label = node.label.trim() || `(이름 없음, ${order}번째)`;
  const err = (message: string, field: string) =>
    issues.push({ severity: "error", message: `${label}: ${message}`, field_path: field, entity_id: node.id });
  const step = stepOf(node);

  if (node.label.trim() === "") err("공정명을 입력하세요.", "/label");
  if (node.label.length > 200) err("공정명은 200자 이하여야 합니다.", "/label");

  const check = (m: AnyMeasure, name: string, kind: "positive" | "nonnegative" | "count", unit: string, field: string) => {
    const kv = measureToKnown(m, unit);
    const e = validateMeasure(kv, kind);
    if (e) err(`${name}: ${e}`, field);
  };
  const p = step.timing_rule?.processing;
  if (p?.kind === "output_speed") {
    check(p.speed_m_per_min, "선속", "positive", "m_per_min", "/timing_rule/processing/speed_m_per_min");
    check(p.parallel_streams, "병렬 스트림 수", "count", "item", "/timing_rule/processing/parallel_streams");
  }
  if (p?.kind === "per_output_unit") check(p.duration_min, "산출 단위당 시간", "positive", "min", "/timing_rule/processing/duration_min");
  if (p?.kind === "per_reference_length") {
    check(p.reference_length_m, "기준 길이", "positive", "m", "/timing_rule/processing/reference_length_m");
    check(p.duration_min, "기준 길이당 시간", "positive", "min", "/timing_rule/processing/duration_min");
  }
  // 준비·대기 시간은 0이 유효하다
  check(step.timing_rule?.setup?.duration_min, "준비 시간", "nonnegative", "min", "/timing_rule/setup/duration_min");
  check(step.timing_rule?.precondition_delay?.duration_min, "공급 대기 시간", "nonnegative", "min", "/timing_rule/precondition_delay/duration_min");

  const o = step.output_rule;
  check(o?.length_m, "산출 길이", "positive", "m", "/output_rule/length_m");
  check(o?.weight_kg, "산출 중량", "positive", "kg", "/output_rule/weight_kg");
  check(o?.unit_count, "산출 수량", "count", "item", "/output_rule/unit_count");

  const seenSpec = new Set<string>();
  (step.material_specs ?? []).forEach((m, i) => {
    const base = `/material_specs/${i}`;
    const name = `${m.direction === "input" ? "투입" : "산출"} 재료 ${m.spec_key}`;
    if (seenSpec.has(m.spec_key)) err(`${name}: 재료 spec 키가 중복됩니다.`, `${base}/spec_key`);
    seenSpec.add(m.spec_key);
    check(m.length_m, `${name} 길이`, "positive", "m", `${base}/length_m`);
    check(m.weight_kg, `${name} 중량`, "positive", "kg", `${base}/weight_kg`);
    check(m.unit_count, `${name} 단위 수`, "count", "item", `${base}/unit_count`);
    check(m.strand_count, `${name} 가닥 수`, "count", "item", `${base}/strand_count`);
    if ((m.state_code ?? "").length > 100) err(`${name}: 상태는 100자 이하여야 합니다.`, `${base}/state_code`);
    if ((m.form ?? "").length > 50) err(`${name}: 형태는 50자 이하여야 합니다.`, `${base}/form`);
  });

  (step.resources ?? []).forEach((r, i) => {
    const base = `/resources/${i}`;
    if ((r.role_key ?? "").trim() === "") err("자원 역할 이름을 입력하세요.", `${base}/role_key`);
    const count = r.required_count ?? 1;
    if (!Number.isInteger(count) || count < 1 || count > 1000) err("필요 수량은 1~1000의 정수여야 합니다.", `${base}/required_count`);
    const n = r.candidates?.length ?? 0;
    if (r.resource_kind !== "worker" && r.selection_mode !== "all_of" && n > 0 && count > n)
      err(`후보 중 ${count}개를 고르려면 후보가 ${count}개 이상이어야 합니다(현재 ${n}개).`, `${base}/required_count`);
  });
  return issues;
}
