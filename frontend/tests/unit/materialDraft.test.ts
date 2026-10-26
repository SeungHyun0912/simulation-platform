import { ApiError } from "../../src/shared/api/errors";
import {
  buildMaterialCreate,
  buildMaterialPatch,
  changedMaterialFields,
  conflictLabel,
  mapMaterialErrors,
  mergeMaterialDraft,
} from "../../src/features/materials/materialDraft";
import { toMaterialView } from "../../src/features/materials/materialMappers";
import {
  EMPTY_MATERIAL_DRAFT,
  hasMaterialErrors,
  toMaterialDraft,
  validateMaterialDraft,
  type MaterialDraft,
} from "../../src/features/materials/materialView";
import { materialOut } from "../fakeMaterials";

const m1 = toMaterialDraft(toMaterialView(materialOut(1))); // 길이 3000·중량 2000.5 확정, 나머지 미정
const m2 = toMaterialDraft(toMaterialView(materialOut(2))); // 길이 1000·단위 수 3·중량 해당 없음
const m3 = toMaterialDraft(toMaterialView(materialOut(3))); // 모두 미정
const known = (value: string, unit: string) => ({ mode: "value" as const, value, unit });

describe("toMaterialView: 값 객체를 미정·값·해당 없음으로 옮긴다", () => {
  it("known만 값이고 해당 없음·미정을 구분하며 개수는 문자열로 입력에 담긴다", () => {
    expect(m1.spec.lengthM).toMatchObject({ mode: "value", value: "3000" });
    expect(m1.spec.weightKg).toMatchObject({ mode: "value", value: "2000.500000" });
    expect(m1.spec.unitCount.mode).toBe("unknown");
    expect(m2.spec.weightKg.mode).toBe("not_applicable");
    expect(m2.spec.unitCount).toMatchObject({ mode: "value", value: "3" });
    expect(m3.spec.lengthM.mode).toBe("unknown");
    expect(m2.notes).toBe("보빈 3개 단위로 공급");
    expect(toMaterialView(materialOut(9)).archivedAt).not.toBeNull();
  });
});

describe("buildMaterialPatch: 바꾼 것만 보낸다", () => {
  it("변경이 없으면 null(요청 없음)", () => {
    expect(buildMaterialPatch(m1, { ...m1 })).toBeNull();
    expect(changedMaterialFields(m1, { ...m1 })).toEqual([]);
  });

  it("기본 정보는 바꾼 필드만, 이름·코드·형태는 공백을 다듬고 메모를 비우면 null이다", () => {
    expect(buildMaterialPatch(m1, { ...m1, name: " 새 이름 ", code: " X-1 ", form: " 보빈 " })).toEqual({ name: "새 이름", code: "X-1", form: "보빈" });
    expect(buildMaterialPatch(m2, { ...m2, notes: "" })).toEqual({ notes: null });
    expect(buildMaterialPatch(m3, { ...m3, notes: "메모" })).toEqual({ notes: "메모" });
  });

  it("기본 규격은 바꾼 하위 필드만 보낸다(서버가 보낸 필드만 교체한다). 개수는 JSON 정수, 길이는 decimal 문자열", () => {
    expect(buildMaterialPatch(m3, { ...m3, spec: { ...m3.spec, lengthM: known("1000", "m") } })).toEqual({
      default_spec: { length_m: { mode: "known", value: "1000" } },
    });
    const body = buildMaterialPatch(m3, { ...m3, spec: { ...m3.spec, unitCount: known("3", "item"), strandCount: known("12", "strand") } })!;
    expect(body.default_spec).toEqual({ unit_count: { mode: "known", value: 3 }, strand_count: { mode: "known", value: 12 } });
    expect(typeof (body.default_spec!.unit_count as { value: unknown }).value).toBe("number");
  });

  it("확정값을 미정으로 되돌리면 mode만 보내고, 해당 없음도 mode만 보낸다", () => {
    expect(buildMaterialPatch(m1, { ...m1, spec: { ...m1.spec, lengthM: { mode: "unknown", value: "", unit: "m" } } })).toEqual({
      default_spec: { length_m: { mode: "unknown" } },
    });
    expect(buildMaterialPatch(m3, { ...m3, spec: { ...m3.spec, weightKg: { mode: "not_applicable", value: "", unit: "kg" } } })).toEqual({
      default_spec: { weight_kg: { mode: "not_applicable" } },
    });
  });

  it("규격 하나만 바꾸면 default_spec에 그 필드만 있고 기본 정보 필드는 없다(빈 default_spec은 보내지 않는다)", () => {
    const body = buildMaterialPatch(m1, { ...m1, spec: { ...m1.spec, weightKg: known("1", "kg") } })!;
    expect(Object.keys(body)).toEqual(["default_spec"]);
    expect(Object.keys(body.default_spec!)).toEqual(["weight_kg"]);
    expect(buildMaterialPatch(m1, { ...m1, name: "다름" })!.default_spec).toBeUndefined();
  });
});

describe("buildMaterialCreate", () => {
  it("모두 미정인 규격과 빈 메모는 생략한다", () => {
    expect(buildMaterialCreate({ ...EMPTY_MATERIAL_DRAFT, code: " A ", name: " 이름 ", form: " 릴 " })).toEqual({ code: "A", name: "이름", form: "릴" });
  });

  it("값을 정한 규격만 담고 해당 없음도 담는다", () => {
    const body = buildMaterialCreate({
      ...EMPTY_MATERIAL_DRAFT,
      code: "A",
      name: "n",
      form: "릴",
      notes: "메모",
      spec: { ...EMPTY_MATERIAL_DRAFT.spec, lengthM: known("3000", "m"), weightKg: { mode: "not_applicable", value: "", unit: "kg" }, unitCount: known("2", "item") },
    });
    expect(body).toEqual({
      code: "A",
      name: "n",
      form: "릴",
      notes: "메모",
      default_spec: { length_m: { mode: "known", value: "3000" }, weight_kg: { mode: "not_applicable" }, unit_count: { mode: "known", value: 2 } },
    });
  });
});

describe("validateMaterialDraft", () => {
  it("코드·이름·형태는 필수이고 길이 제한이 있다", () => {
    expect(validateMaterialDraft(EMPTY_MATERIAL_DRAFT).fields).toMatchObject({ code: expect.any(String), name: expect.any(String), form: expect.any(String) });
    expect(validateMaterialDraft({ ...m1, code: "x".repeat(65) }).fields.code).toMatch(/64자/);
    expect(validateMaterialDraft({ ...m1, name: "x".repeat(201) }).fields.name).toMatch(/200자/);
    expect(validateMaterialDraft({ ...m1, form: "x".repeat(101) }).fields.form).toMatch(/100자/);
    expect(validateMaterialDraft({ ...m1, notes: "x".repeat(4001) }).fields.notes).toMatch(/4,000자/);
    expect(hasMaterialErrors(validateMaterialDraft(m1))).toBe(false);
  });

  it("규격은 0 이하·소수 7자리·정수가 아닌 개수를 오류로 알린다", () => {
    const bad: MaterialDraft = {
      ...m1,
      spec: { ...m1.spec, lengthM: known("0", "m"), weightKg: known("1.1234567", "kg"), unitCount: known("1.5", "item"), strandCount: known("0", "strand") },
    };
    expect(Object.keys(validateMaterialDraft(bad).spec).sort()).toEqual(["lengthM", "strandCount", "unitCount", "weightKg"]);
    expect(hasMaterialErrors(validateMaterialDraft(bad))).toBe(true);
  });
});

describe("mergeMaterialDraft: 항목 단위 3-way 병합", () => {
  it("내가 안 바꾼 항목은 서버 값, 바꾼 항목은 내 값", () => {
    const m = mergeMaterialDraft(m1, { ...m1, notes: "내 메모" }, { ...m1, name: "서버 이름" });
    expect(m.draft).toMatchObject({ name: "서버 이름", notes: "내 메모" });
    expect(m.conflicts).toEqual({});
  });

  it("같은 항목을 둘 다 바꿨으면 내 값을 유지하고 서버 값을 알린다", () => {
    const m = mergeMaterialDraft(m1, { ...m1, name: "내 이름" }, { ...m1, name: "서버 이름" });
    expect(m.draft.name).toBe("내 이름");
    expect(m.conflicts).toEqual({ name: "서버 이름" });
  });

  it("규격은 값별로 병합하고 겹치면 서버 값을 문구로 알린다(미정·해당 없음 포함)", () => {
    const mine = { ...m1, spec: { ...m1.spec, lengthM: known("1", "m") } };
    const server = { ...m1, spec: { ...m1.spec, lengthM: { mode: "unknown" as const, value: "", unit: "m" }, weightKg: known("9", "kg") } };
    const m = mergeMaterialDraft(m1, mine, server);
    expect(m.draft.spec.lengthM.value).toBe("1");
    expect(m.draft.spec.weightKg.value).toBe("9");
    expect(m.conflicts).toEqual({ "spec:lengthM": "미정" });
    const na = mergeMaterialDraft(m1, { ...m1, spec: { ...m1.spec, weightKg: known("1", "kg") } }, { ...m1, spec: { ...m1.spec, weightKg: { mode: "not_applicable", value: "", unit: "kg" } } });
    expect(na.conflicts).toEqual({ "spec:weightKg": "해당 없음" });
  });

  it("충돌 항목의 이름", () => {
    expect(conflictLabel("name")).toBe("이름");
    expect(conflictLabel("spec:strandCount")).toBe("기본 규격 가닥 수");
  });
});

describe("mapMaterialErrors", () => {
  const err = (code: string, details: { message: string; field_path?: string }[]) => new ApiError({ status: 422, code, message: "x", requestId: "r", details });

  it("field_path를 기본 정보 입력·규격 입력에 연결하고 나머지는 일반 오류로 둔다", () => {
    const r = mapMaterialErrors(
      err("VALIDATION_ERROR", [
        { message: "a", field_path: "/form" },
        { message: "b", field_path: "/default_spec/length_m/value" },
        { message: "c", field_path: "/default_spec/strand_count" },
        { message: "d", field_path: "/default_spec" },
      ]),
    );
    expect(r.fields).toEqual({ form: "a" });
    expect(r.spec).toEqual({ lengthM: "b", strandCount: "c" });
    expect(r.general.map((g) => g.message)).toEqual(["d"]);
  });

  it("코드 중복은 details가 없어도 코드 필드에 연결한다", () => {
    expect(mapMaterialErrors(err("MATERIAL_CODE_CONFLICT", [])).fields.code).toBe("이미 사용 중인 코드입니다.");
  });
});
