import {
  emptyArrival,
  emptyProduct,
  isDirty,
  productsToDto,
  serverPathToDraftPath,
  stoppingToDto,
  toPatch,
  toVersionView,
  validateDraft,
  type ScenarioDraft,
} from "../../src/features/scenarios/scenarioView";
import { parseNonNegativeInt, requestSignature, SEED_MAX } from "../../src/features/runs/runView";
import type { Schemas } from "../../src/shared/api/types";

const serverVersion = (): Schemas["ScenarioVersionOut"] => ({
  id: "v1",
  project_id: "p",
  scenario_id: "s",
  version_no: 1,
  status: "draft",
  base_version_id: null,
  approved_at: null,
  approved_by: null,
  created_at: "2026-10-27T00:00:00Z",
  updated_at: null,
  row_version: 3,
  products: [
    {
      product_id: "prod-1",
      process_version_id: "pv-1",
      priority: 2,
      arrivals: [{ at_min: "0", count: 3, length_m: null, weight_kg: "3300", lot: "L1" }],
      assumptions: { equipment_hold: "hold_for_operation", unbounded_buffers: true, manual_transport_minutes: { "op-a": "0" }, residual_scope: { "op-b": "lot" } },
    },
  ],
  assets: [{ asset_id: "a1", asset_revision_id: "r1" }],
  stopping_rule: { mode: "fixed_horizon", horizon_min: "1440" },
  assumption_reason: "사유",
  notes: null,
});

describe("시나리오 버전 화면 모델", () => {
  it("서버 값을 편집 문서로 옮기고 다시 DTO로 만들어도 값이 같다(왕복 보존, 0과 빈 값 구분)", () => {
    const v = toVersionView(serverVersion());
    expect(v.pinnedAssets).toBe(1);
    const d = v.draft;
    expect(d.products[0]!.arrivals[0]).toMatchObject({ atMin: "0", count: "3", lengthM: "", weightKg: "3300", lot: "L1" });
    expect(d.products[0]!.assumptions.transport[0]).toMatchObject({ nodeKey: "op-a", minutes: "0" }); // 0분은 명시된 값
    expect(productsToDto(d)).toEqual(serverVersion().products);
    expect(stoppingToDto(d.stopping)).toEqual({ mode: "fixed_horizon", horizon_min: "1440" });
    expect(isDirty(d, d)).toBe(false);
  });

  it("길이 없는 도착은 null(무게만)이고 0이나 빈 문자열이 아니다", () => {
    const dto = productsToDto(toVersionView(serverVersion()).draft)[0]!.arrivals![0]!;
    expect(dto.length_m).toBeNull();
    expect(dto.weight_kg).toBe("3300");
    expect(typeof dto.count).toBe("number");
  });

  it("PATCH는 달라진 최상위 필드만 담고 assets는 보내지 않는다(서버 고정을 보존)", () => {
    const base = toVersionView(serverVersion()).draft;
    expect(toPatch(base, base)).toEqual({});
    const next: ScenarioDraft = { ...base, notes: "메모", stopping: { mode: "drain", horizonMin: "" } };
    const patch = toPatch(base, next);
    expect(Object.keys(patch).sort()).toEqual(["notes", "stopping_rule"]);
    expect(patch.stopping_rule).toEqual({ mode: "drain" });
    expect("assets" in patch).toBe(false);
    // 비운 사유는 지움(null)이며 빈 문자열이 아니다
    expect(toPatch(base, { ...base, assumptionReason: "  " }).assumption_reason).toBeNull();
  });

  it("검증: 도착은 길이 또는 무게가 필요하고 개수·분·우선순위 형식을 확인한다", () => {
    const d = toVersionView(serverVersion()).draft;
    expect(validateDraft(d)).toEqual([]);
    const p = d.products[0]!;
    const bad: ScenarioDraft = {
      ...d,
      products: [{ ...p, priority: "0", arrivals: [{ ...emptyArrival(), atMin: "-1", count: "1.5", lengthM: "0", weightKg: "" }] }],
    };
    const paths = validateDraft(bad).map((i) => i.path.replace(/products\.[^.]+\./, ""));
    expect(paths).toEqual(expect.arrayContaining(["priority", expect.stringMatching(/atMin$/), expect.stringMatching(/count$/), expect.stringMatching(/lengthM$/)]));
    const none = validateDraft({ ...d, products: [{ ...p, arrivals: [{ ...emptyArrival(), lengthM: "", weightKg: "" }] }] });
    expect(none.some((i) => i.path.endsWith(".amount"))).toBe(true);
    // 같은 공정 버전 두 번, 제품·버전 미선택
    const dup = validateDraft({ ...d, products: [p, { ...p, key: "other" }, emptyProduct()] });
    expect(dup.filter((i) => i.path.endsWith("processVersionId")).length).toBeGreaterThanOrEqual(2);
    // 고정 지평선은 0보다 커야 한다, 운반 분은 0도 허용
    expect(validateDraft({ ...d, stopping: { mode: "fixed_horizon", horizonMin: "0" } }).map((i) => i.path)).toContain("stopping.horizonMin");
    expect(validateDraft({ ...d, products: [{ ...p, assumptions: { ...p.assumptions, transport: [{ key: "t", nodeKey: "op-a", minutes: "0" }] } }] })).toEqual([]);
  });

  it("서버 422 field_path(본문 인덱스)를 화면 경로(줄 키)로 바꾼다", () => {
    const d = toVersionView(serverVersion()).draft;
    const p = d.products[0]!;
    const a = p.arrivals[0]!;
    expect(serverPathToDraftPath("/products/0/process_version_id", d)).toBe(`products.${p.key}.processVersionId`);
    expect(serverPathToDraftPath("/products/0/arrivals/0/count", d)).toBe(`products.${p.key}.arrivals.${a.key}.count`);
    expect(serverPathToDraftPath("/products/0/arrivals/0", d)).toBe(`products.${p.key}.arrivals.${a.key}.amount`);
    expect(serverPathToDraftPath("/stopping_rule/horizon_min", d)).toBe("stopping.horizonMin");
    expect(serverPathToDraftPath("/products/9/priority", d)).toBeNull();
    expect(serverPathToDraftPath(undefined, d)).toBeNull();
  });
});

describe("실행 요청 도우미", () => {
  it("seed·반복 번호는 0~2^31-1의 정수만 받는다", () => {
    expect(parseNonNegativeInt("0")).toBe(0);
    expect(parseNonNegativeInt(String(SEED_MAX))).toBe(SEED_MAX);
    expect(parseNonNegativeInt(String(SEED_MAX + 1))).toBeNull();
    expect(parseNonNegativeInt("1.5")).toBeNull();
    expect(parseNonNegativeInt("-1")).toBeNull();
    expect(parseNonNegativeInt("")).toBeNull();
  });
  it("본문 서명은 본문이 같을 때만 같다(같은 키 재사용 판단)", () => {
    expect(requestSignature("a", 1, 0)).toBe(requestSignature("a", 1, 0));
    expect(requestSignature("a", 1, 0)).not.toBe(requestSignature("a", 2, 0));
    expect(requestSignature("a", 1, 0)).not.toBe(requestSignature("b", 1, 0));
  });
});
