import { ApiError } from "../../src/shared/api/errors";
import {
  buildProductCreate,
  buildProductPatch,
  changedProductFields,
  mapProductErrors,
  mergeProductDraft,
} from "../../src/features/products/productDraft";
import { toProductView } from "../../src/features/products/productMappers";
import {
  EMPTY_PRODUCT_DRAFT,
  toProductDraft,
  validateProductDraft,
  type ProductDraft,
} from "../../src/features/products/productView";
import { PRODUCTS } from "../fakeApi";

const withSpec = toProductDraft(toProductView(PRODUCTS[0]!)); // 규격 입력
const unknownSpec = toProductDraft(toProductView(PRODUCTS[1]!)); // 규격 미정(null)

describe("toProductView·toProductDraft: null을 값으로 바꾸지 않는다", () => {
  it("규격 null은 미정, 문자열은 값이다(빈 값으로 채우지 않는다)", () => {
    expect(withSpec).toMatchObject({ specUnknown: false, specification: "규격 1" });
    expect(unknownSpec).toMatchObject({ specUnknown: true, specification: "" });
  });
  it("공정 요약·보관·row_version을 그대로 옮긴다", () => {
    const v = toProductView(PRODUCTS[0]!);
    expect(v.latestProcessVersion).toEqual({
      id: PRODUCTS[0]!.latest_process_version!.id,
      versionNo: 2,
      status: "draft",
      approvedAt: null,
    });
    expect(v.currentProcessVersion).toMatchObject({ versionNo: 1, status: "approved" });
    expect(toProductView(PRODUCTS[8]!).archivedAt).not.toBeNull();
    expect(v.rowVersion).toBe(1);
  });
});

describe("buildProductPatch: 바꾼 필드만 보낸다", () => {
  it("변경이 없으면 null(요청 없음)", () => {
    expect(buildProductPatch(withSpec, { ...withSpec })).toBeNull();
    expect(changedProductFields(withSpec, { ...withSpec })).toEqual([]);
  });
  it("바꾼 필드만 본문에 들어가고 코드·이름은 공백을 다듬는다", () => {
    expect(buildProductPatch(withSpec, { ...withSpec, name: "  새 이름 ", code: " X-1 " })).toEqual({ name: "새 이름", code: "X-1" });
  });
  it("규격을 미정으로 바꾸면 null, 미정에서 값을 쓰면 문자열", () => {
    expect(buildProductPatch(withSpec, { ...withSpec, specUnknown: true })).toEqual({ specification: null });
    expect(buildProductPatch(unknownSpec, { ...unknownSpec, specUnknown: false, specification: "S" })).toEqual({ specification: "S" });
  });
  it("미정 상태에서 입력란에 남은 값은 변경이 아니다(미정이 기준)", () => {
    expect(buildProductPatch(unknownSpec, { ...unknownSpec, specification: "남은 값" })).toBeNull();
  });
  it("메모를 비우면 null(입력 없음), 빈 문자열은 보내지 않는다", () => {
    const withNote = { ...withSpec, notes: "메모" };
    expect(buildProductPatch(withNote, { ...withNote, notes: "" })).toEqual({ notes: null });
    expect(buildProductPatch(withSpec, { ...withSpec, notes: "새 메모" })).toEqual({ notes: "새 메모" });
  });
});

describe("buildProductCreate", () => {
  it("미정 규격·빈 메모는 생략한다", () => {
    expect(buildProductCreate({ ...EMPTY_PRODUCT_DRAFT, code: " A ", name: " 이름 " })).toEqual({ code: "A", name: "이름" });
  });
  it("규격·메모를 입력하면 그대로 보낸다(규격 앞뒤 공백은 서버 규칙에 맡긴다)", () => {
    expect(
      buildProductCreate({ code: "A", name: "n", specUnknown: false, specification: "S 1", notes: "m" }),
    ).toEqual({ code: "A", name: "n", specification: "S 1", notes: "m" });
  });
});

describe("validateProductDraft", () => {
  it("빈 코드·이름과 길이 초과", () => {
    expect(validateProductDraft(EMPTY_PRODUCT_DRAFT)).toMatchObject({ code: expect.any(String), name: expect.any(String) });
    expect(validateProductDraft({ ...withSpec, code: "x".repeat(65) }).code).toMatch(/64자/);
    expect(validateProductDraft({ ...withSpec, name: "x".repeat(201) }).name).toMatch(/200자/);
  });
  it("미정이 아닌데 비어 있으면 오류이고 미정이면 오류가 아니다", () => {
    expect(validateProductDraft({ ...withSpec, specification: "  " }).specification).toBeDefined();
    expect(validateProductDraft({ ...withSpec, specUnknown: true, specification: "" }).specification).toBeUndefined();
  });
  it("규격·메모 4000자 제한", () => {
    expect(validateProductDraft({ ...withSpec, specification: "x".repeat(4001) }).specification).toMatch(/4,000자/);
    expect(validateProductDraft({ ...withSpec, notes: "x".repeat(4001) }).notes).toMatch(/4,000자/);
    expect(validateProductDraft({ ...withSpec, specification: "x".repeat(4000) })).toEqual({});
  });
});

describe("mergeProductDraft: 필드 단위 3-way 병합", () => {
  const edited = (d: ProductDraft, patch: Partial<ProductDraft>): ProductDraft => ({ ...d, ...patch });

  it("내가 안 바꾼 필드는 서버 값, 바꾼 필드는 내 값", () => {
    const m = mergeProductDraft(withSpec, edited(withSpec, { notes: "내 메모" }), edited(withSpec, { name: "서버 이름" }));
    expect(m.draft).toMatchObject({ name: "서버 이름", notes: "내 메모" });
    expect(m.conflicts).toEqual({});
  });
  it("둘 다 바꿨고 값이 다르면 내 값을 유지하고 서버 값을 알린다", () => {
    const m = mergeProductDraft(withSpec, edited(withSpec, { name: "내 이름" }), edited(withSpec, { name: "서버 이름" }));
    expect(m.draft.name).toBe("내 이름");
    expect(m.conflicts).toEqual({ name: "서버 이름" });
  });
  it("규격은 미정 여부와 값을 함께 병합하고 서버 미정은 '미정'으로 알린다", () => {
    const m = mergeProductDraft(
      withSpec,
      edited(withSpec, { specification: "내 규격" }),
      edited(withSpec, { specUnknown: true, specification: "" }),
    );
    expect(m.draft).toMatchObject({ specUnknown: false, specification: "내 규격" });
    expect(m.conflicts).toEqual({ specification: "미정" });
  });
  it("둘이 같은 값으로 바꿨으면 충돌이 아니다", () => {
    const m = mergeProductDraft(withSpec, edited(withSpec, { name: "같음" }), edited(withSpec, { name: "같음" }));
    expect(m.conflicts).toEqual({});
  });
});

describe("mapProductErrors", () => {
  const err = (code: string, details: { message: string; field_path?: string }[]) =>
    new ApiError({ status: 422, code, message: "x", requestId: "r", details });

  it("field_path를 폼 필드에 연결하고 나머지는 일반 오류로 둔다", () => {
    const r = mapProductErrors(
      err("VALIDATION_ERROR", [
        { message: "a", field_path: "/specification" },
        { message: "b", field_path: "/name" },
        { message: "c", field_path: "/" },
      ]),
    );
    expect(r.fields).toEqual({ specification: "a", name: "b" });
    expect(r.general.map((g) => g.message)).toEqual(["c"]);
  });
  it("코드 중복은 details가 없어도 코드 필드에 연결한다", () => {
    expect(mapProductErrors(err("PRODUCT_CODE_CONFLICT", [])).fields.code).toBe("이미 사용 중인 코드입니다.");
  });
});
