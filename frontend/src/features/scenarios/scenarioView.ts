import type { Schemas } from "../../shared/api/types";

/**
 * 시나리오 화면 모델. 서버 DTO(계약 0.7.0·0.8.0)를 화면 입력 형태로 옮긴다.
 * - 시각·길이·무게·분은 decimal 문자열이고 개수·우선순위는 JSON 정수다. 서로 환산하지 않는다.
 * - 빈 입력은 "입력 없음(null)"이며 0이 아니다. 도착은 길이 또는 무게 중 하나는 있어야 한다(0.8.0).
 * - 자산 고정(`assets`)은 이 화면이 편집하지 않는다. PATCH에 보내지 않으면 서버가 기존 고정을 유지하고 빠진 것만 채운다.
 */

export type ScenarioSummary = { id: string; versionNo: number; status: string };

export type ScenarioView = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  latestVersion: ScenarioSummary | null;
  rowVersion: number;
};

export type ScenarioVersionItem = {
  id: string;
  scenarioId: string;
  versionNo: number;
  /** draft | approved (서버가 다른 값을 보내도 원문을 보여 준다) */
  status: string;
  baseVersionId: string | null;
  approvedAt: string | null;
  createdAt: string;
  rowVersion: number;
};

export const SCENARIO_LIMITS = { code: 64, name: 200, text: 4000, products: 50, arrivals: 1000, priorityMax: 1000, countMax: 100_000 } as const;

export function toScenarioView(s: Schemas["ScenarioOut"]): ScenarioView {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    description: s.description,
    latestVersion: s.latest_version ? { id: s.latest_version.id, versionNo: s.latest_version.version_no, status: s.latest_version.status } : null,
    rowVersion: s.row_version,
  };
}

export function toVersionItem(v: Schemas["ScenarioVersionListItem"]): ScenarioVersionItem {
  return {
    id: v.id,
    scenarioId: v.scenario_id,
    versionNo: v.version_no,
    status: v.status,
    baseVersionId: v.base_version_id,
    approvedAt: v.approved_at,
    createdAt: v.created_at,
    rowVersion: v.row_version,
  };
}

/* ---------------- 편집 문서 ---------------- */

export type ArrivalEdit = { key: string; atMin: string; count: string; lengthM: string; weightKg: string; lot: string };
export type TransportEdit = { key: string; nodeKey: string; minutes: string };
export type ResidualScopeEdit = { key: string; nodeKey: string; scope: string };
export type AssumptionsEdit = {
  /** "" = 정하지 않음(null). 서버가 아는 값은 `hold_for_operation` 하나다. */
  equipmentHold: string;
  unboundedBuffers: boolean;
  transport: TransportEdit[];
  residualScope: ResidualScopeEdit[];
};
export type ScenarioProductEdit = {
  key: string;
  productId: string;
  processVersionId: string;
  priority: string;
  arrivals: ArrivalEdit[];
  assumptions: AssumptionsEdit;
};
export type StoppingEdit = { mode: "drain" | "fixed_horizon"; horizonMin: string };

export type ScenarioDraft = {
  products: ScenarioProductEdit[];
  stopping: StoppingEdit;
  assumptionReason: string;
  notes: string;
};

export type ScenarioVersionView = {
  id: string;
  scenarioId: string;
  versionNo: number;
  status: string;
  baseVersionId: string | null;
  approvedAt: string | null;
  rowVersion: number;
  draft: ScenarioDraft;
  /** 고정된 자산 수(편집하지 않는 값). 개별 값은 서버 정본이다. */
  pinnedAssets: number;
};

let counter = 0;
export const newKey = (prefix: string) => `${prefix}-${++counter}`;

export const emptyAssumptions = (): AssumptionsEdit => ({ equipmentHold: "", unboundedBuffers: false, transport: [], residualScope: [] });
export const emptyArrival = (): ArrivalEdit => ({ key: newKey("arr"), atMin: "0", count: "1", lengthM: "", weightKg: "", lot: "" });
export const emptyProduct = (): ScenarioProductEdit => ({
  key: newKey("prod"),
  productId: "",
  processVersionId: "",
  priority: "1",
  arrivals: [],
  assumptions: emptyAssumptions(),
});

const text = (v: string | null | undefined) => v ?? "";

export function toVersionView(v: Schemas["ScenarioVersionOut"]): ScenarioVersionView {
  const stop = v.stopping_rule as { mode: string; horizon_min?: string };
  return {
    id: v.id,
    scenarioId: v.scenario_id,
    versionNo: v.version_no,
    status: v.status,
    baseVersionId: v.base_version_id,
    approvedAt: v.approved_at,
    rowVersion: v.row_version,
    pinnedAssets: v.assets.length,
    draft: {
      products: v.products.map((p) => ({
        key: newKey("prod"),
        productId: p.product_id,
        processVersionId: p.process_version_id,
        priority: String(p.priority ?? 1),
        arrivals: (p.arrivals ?? []).map((a) => ({
          key: newKey("arr"),
          atMin: a.at_min ?? "0",
          count: String(a.count),
          lengthM: text(a.length_m),
          weightKg: text(a.weight_kg),
          lot: text(a.lot),
        })),
        assumptions: {
          equipmentHold: text(p.assumptions?.equipment_hold ?? null),
          unboundedBuffers: p.assumptions?.unbounded_buffers ?? false,
          transport: Object.entries(p.assumptions?.manual_transport_minutes ?? {}).map(([nodeKey, minutes]) => ({ key: newKey("tr"), nodeKey, minutes: String(minutes) })),
          residualScope: Object.entries(p.assumptions?.residual_scope ?? {}).map(([nodeKey, scope]) => ({ key: newKey("rs"), nodeKey, scope: String(scope) })),
        },
      })),
      stopping: { mode: stop.mode === "fixed_horizon" ? "fixed_horizon" : "drain", horizonMin: stop.horizon_min ?? "" },
      assumptionReason: text(v.assumption_reason),
      notes: text(v.notes),
    },
  };
}

/* ---------------- 검증(클라이언트: 형식만. 실행 가능 판정은 서버 사전검증) ---------------- */

const NON_NEGATIVE = /^(0|[1-9][0-9]{0,17})(\.[0-9]{1,6})?$/;
export const isNonNegativeDecimal = (s: string) => NON_NEGATIVE.test(s.trim());
export const isPositiveDecimal = (s: string) => isNonNegativeDecimal(s) && Number(s) > 0;
const isInt = (s: string) => /^[0-9]+$/.test(s.trim());

export type ScenarioIssue = { path: string; message: string };

/** 제품 줄·도착 줄 단위 입력 오류. 경로는 화면이 필드에 연결하는 데 쓴다(`products.<key>.<field>`). */
export function validateDraft(d: ScenarioDraft): ScenarioIssue[] {
  const out: ScenarioIssue[] = [];
  const add = (path: string, message: string) => out.push({ path, message });
  if (d.products.length > SCENARIO_LIMITS.products) add("products", `제품은 ${SCENARIO_LIMITS.products}개까지입니다.`);
  const seen = new Set<string>();
  for (const p of d.products) {
    const k = `products.${p.key}`;
    if (!p.productId) add(`${k}.productId`, "제품을 선택하세요.");
    if (!p.processVersionId) add(`${k}.processVersionId`, "승인된 공정 버전을 선택하세요.");
    else if (seen.has(p.processVersionId)) add(`${k}.processVersionId`, "같은 공정 버전을 두 번 넣을 수 없습니다.");
    else seen.add(p.processVersionId);
    if (!isInt(p.priority) || Number(p.priority) < 1 || Number(p.priority) > SCENARIO_LIMITS.priorityMax)
      add(`${k}.priority`, `우선순위는 1~${SCENARIO_LIMITS.priorityMax}의 정수입니다.`);
    if (p.arrivals.length > SCENARIO_LIMITS.arrivals) add(`${k}.arrivals`, `도착은 ${SCENARIO_LIMITS.arrivals}건까지입니다.`);
    for (const a of p.arrivals) {
      const ak = `${k}.arrivals.${a.key}`;
      if (!isNonNegativeDecimal(a.atMin)) add(`${ak}.atMin`, "0 이상의 숫자(소수 6자리까지)여야 합니다.");
      if (!isInt(a.count) || Number(a.count) < 1 || Number(a.count) > SCENARIO_LIMITS.countMax) add(`${ak}.count`, `개수는 1~${SCENARIO_LIMITS.countMax}의 정수입니다.`);
      if (a.lengthM.trim() !== "" && !isPositiveDecimal(a.lengthM)) add(`${ak}.lengthM`, "0보다 큰 숫자여야 합니다(비우면 길이 없음).");
      if (a.weightKg.trim() !== "" && !isPositiveDecimal(a.weightKg)) add(`${ak}.weightKg`, "0보다 큰 숫자여야 합니다(비우면 무게 없음).");
      if (a.lengthM.trim() === "" && a.weightKg.trim() === "") add(`${ak}.amount`, "길이 또는 무게 중 하나는 입력해야 합니다(서로 환산하지 않습니다).");
      if (a.lot.trim().length > SCENARIO_LIMITS.code) add(`${ak}.lot`, `로트는 ${SCENARIO_LIMITS.code}자 이하입니다.`);
    }
    const nodes = new Set<string>();
    for (const t of p.assumptions.transport) {
      const tk = `${k}.transport.${t.key}`;
      if (!t.nodeKey) add(`${tk}.nodeKey`, "단계를 선택하세요.");
      else if (nodes.has(`t:${t.nodeKey}`)) add(`${tk}.nodeKey`, "같은 단계를 두 번 넣을 수 없습니다.");
      else nodes.add(`t:${t.nodeKey}`);
      if (!isNonNegativeDecimal(t.minutes)) add(`${tk}.minutes`, "0 이상의 분을 입력하세요(0도 명시해야 합니다).");
    }
    for (const r of p.assumptions.residualScope) {
      const rk = `${k}.residual.${r.key}`;
      if (!r.nodeKey) add(`${rk}.nodeKey`, "단계를 선택하세요.");
      else if (nodes.has(`r:${r.nodeKey}`)) add(`${rk}.nodeKey`, "같은 단계를 두 번 넣을 수 없습니다.");
      else nodes.add(`r:${r.nodeKey}`);
      if (!r.scope) add(`${rk}.scope`, "범위를 선택하세요.");
    }
  }
  if (d.stopping.mode === "fixed_horizon" && !isPositiveDecimal(d.stopping.horizonMin)) add("stopping.horizonMin", "0보다 큰 분을 입력하세요.");
  if (d.assumptionReason.length > SCENARIO_LIMITS.text) add("assumptionReason", `가정 사유는 ${SCENARIO_LIMITS.text}자 이하입니다.`);
  if (d.notes.length > SCENARIO_LIMITS.text) add("notes", `메모는 ${SCENARIO_LIMITS.text}자 이하입니다.`);
  return out;
}

export const assumptionsUsed = (a: AssumptionsEdit) => a.equipmentHold !== "" || a.unboundedBuffers || a.transport.length > 0 || a.residualScope.length > 0;

/* ---------------- 저장 본문 ---------------- */

type ProductDto = Schemas["ScenarioProductDto"];
type Patch = Schemas["ScenarioVersionPatch"];

const nullIfBlank = (s: string) => (s.trim() === "" ? null : s.trim());

export function productsToDto(d: ScenarioDraft): ProductDto[] {
  return d.products.map((p) => ({
    product_id: p.productId,
    process_version_id: p.processVersionId,
    priority: Number(p.priority),
    arrivals: p.arrivals.map((a) => ({
      at_min: a.atMin.trim(),
      count: Number(a.count),
      length_m: nullIfBlank(a.lengthM),
      weight_kg: nullIfBlank(a.weightKg),
      lot: nullIfBlank(a.lot),
    })),
    assumptions: {
      equipment_hold: p.assumptions.equipmentHold === "" ? null : (p.assumptions.equipmentHold as "hold_for_operation"),
      unbounded_buffers: p.assumptions.unboundedBuffers,
      manual_transport_minutes: Object.fromEntries(p.assumptions.transport.map((t) => [t.nodeKey, t.minutes.trim()])),
      residual_scope: Object.fromEntries(p.assumptions.residualScope.map((r) => [r.nodeKey, r.scope as "machine"])),
    },
  }));
}

export function stoppingToDto(s: StoppingEdit): Patch["stopping_rule"] {
  return s.mode === "drain" ? { mode: "drain" } : { mode: "fixed_horizon", horizon_min: s.horizonMin.trim() };
}

/**
 * 서버 값과 달라진 최상위 필드만 보낸다(서버는 보낸 필드를 통째로 교체한다). `assets`는 보내지 않아 기존 고정을 보존한다.
 * 빈 가정 사유·메모는 null(지움)이다(빈 문자열은 서버가 거부한다).
 */
export function toPatch(base: ScenarioDraft, next: ScenarioDraft): Patch {
  const patch: Patch = {};
  if (JSON.stringify(productsToDto(base)) !== JSON.stringify(productsToDto(next))) patch.products = productsToDto(next);
  if (JSON.stringify(stoppingToDto(base.stopping)) !== JSON.stringify(stoppingToDto(next.stopping))) patch.stopping_rule = stoppingToDto(next.stopping);
  if (nullIfBlank(base.assumptionReason) !== nullIfBlank(next.assumptionReason)) patch.assumption_reason = nullIfBlank(next.assumptionReason);
  if (nullIfBlank(base.notes) !== nullIfBlank(next.notes)) patch.notes = nullIfBlank(next.notes);
  return patch;
}

export const isDirty = (base: ScenarioDraft, next: ScenarioDraft) => Object.keys(toPatch(base, next)).length > 0;

/** 서버 오류의 field_path(`/products/0/arrivals/1/count` 등, 요청 본문 기준)를 화면 경로로 바꾼다. 못 찾으면 null. */
export function serverPathToDraftPath(path: string | null | undefined, sent: ScenarioDraft): string | null {
  if (!path) return null;
  const parts = path.replace(/^\//, "").split("/");
  if (parts[0] === "stopping_rule") return "stopping.horizonMin";
  if (parts[0] === "assumption_reason") return "assumptionReason";
  if (parts[0] === "notes") return "notes";
  if (parts[0] !== "products") return null;
  const product = sent.products[Number(parts[1])];
  if (!product) return null;
  const k = `products.${product.key}`;
  if (parts[2] === undefined) return k;
  if (parts[2] === "process_version_id") return `${k}.processVersionId`;
  if (parts[2] === "product_id") return `${k}.productId`;
  if (parts[2] === "priority") return `${k}.priority`;
  if (parts[2] === "arrivals") {
    const arrival = product.arrivals[Number(parts[3])];
    if (!arrival) return `${k}.arrivals`;
    const f = { at_min: "atMin", count: "count", length_m: "lengthM", weight_kg: "weightKg", lot: "lot" }[parts[4] ?? ""];
    return `${k}.arrivals.${arrival.key}.${f ?? "amount"}`;
  }
  return k;
}

export const STATUS_LABEL: Record<string, string> = { draft: "초안", approved: "승인" };
