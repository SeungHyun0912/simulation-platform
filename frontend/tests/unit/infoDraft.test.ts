import { ApiError } from "../../src/shared/api/errors";
import { toInfoDraft } from "../../src/features/assets/assetView";
import {
  buildAssetCreate,
  buildAssetPatch,
  changedFields,
  EMPTY_INFO_DRAFT,
  mapServerErrors,
  mergeInfoDraft,
} from "../../src/features/assets/infoDraft";
import { SAMPLE_ASSETS } from "../../src/features/assets/sampleAssets";

const eq = toInfoDraft(SAMPLE_ASSETS.find((a) => a.code === "EQ-001")!); // 설비: EX-100, 외부 참조 ERP-0001
const st = toInfoDraft(SAMPLE_ASSETS.find((a) => a.code === "ST-001")!); // 저장공간

describe("buildAssetPatch: 바꾼 필드만 보낸다", () => {
  it("변경이 없으면 null(요청 없음)", () => {
    expect(buildAssetPatch(eq, { ...eq }, "equipment")).toBeNull();
    expect(changedFields(eq, { ...eq })).toEqual([]);
  });
  it("바꾼 필드만 본문에 들어가고 문자열 공백은 다듬는다", () => {
    expect(buildAssetPatch(eq, { ...eq, name: "  새 이름  ", code: " EQ-9 " }, "equipment")).toEqual({
      name: "새 이름",
      code: "EQ-9",
    });
  });
  it("정렬 순서는 숫자로 보낸다", () => {
    expect(buildAssetPatch(eq, { ...eq, sortOrder: "15" }, "equipment")).toEqual({ sort_order: 15 });
  });
  it("선택 필드를 비우면 null(입력 없음), 빈 문자열은 보내지 않는다", () => {
    expect(buildAssetPatch(eq, { ...eq, externalRef: "", notes: "" }, "equipment")).toEqual({ external_ref: null });
    expect(buildAssetPatch(eq, { ...eq, modelName: "" }, "equipment")).toEqual({ equipment: { model_name: null } });
  });
  it("설비는 equipment 객체만, 공간은 space 객체만 보내고 서로의 필드는 무시한다", () => {
    expect(buildAssetPatch(eq, { ...eq, equipmentType: "braider", modelName: "B1" }, "equipment")).toEqual({
      equipment: { equipment_type: "braider", model_name: "B1" },
    });
    expect(buildAssetPatch(st, { ...st, spaceType: "rack" }, "storage")).toEqual({ space: { space_type: "rack" } });
    // 공간 자산의 설비 입력칸이 바뀌어도(숨겨진 값) 본문에 equipment를 넣지 않는다
    expect(buildAssetPatch(st, { ...st, equipmentType: "x" }, "storage")).toBeNull();
  });
  it("kind와 포트는 절대 본문에 없다", () => {
    const body = buildAssetPatch(eq, { ...eq, name: "a", code: "b", notes: "c", sortOrder: "1" }, "equipment")!;
    expect(Object.keys(body).sort()).toEqual(["code", "name", "notes", "sort_order"]);
  });
});

describe("mergeInfoDraft: 충돌 후 필드 단위 병합", () => {
  const original = { ...eq };
  it("내가 안 바꾼 필드는 서버 최신 값을 따른다(옛 값으로 되돌리지 않음)", () => {
    const draft = { ...original, notes: "내 메모" };
    const server = { ...original, name: "서버 이름" };
    const r = mergeInfoDraft(original, draft, server);
    expect(r.draft.name).toBe("서버 이름");
    expect(r.draft.notes).toBe("내 메모");
    expect(r.conflicts).toEqual({});
  });
  it("같은 필드를 서로 다르게 바꿨으면 내 값을 유지하고 서버 값을 알린다", () => {
    const r = mergeInfoDraft(original, { ...original, name: "내 이름" }, { ...original, name: "서버 이름" });
    expect(r.draft.name).toBe("내 이름");
    expect(r.conflicts).toEqual({ name: "서버 이름" });
  });
  it("서버가 내 값과 같은 값으로 바꿨다면 충돌이 아니다", () => {
    const r = mergeInfoDraft(original, { ...original, name: "같은 이름" }, { ...original, name: "같은 이름" });
    expect(r.conflicts).toEqual({});
  });
  it("병합 결과로 만든 요청 본문은 내가 바꾼 필드만 담는다", () => {
    const server = { ...original, name: "서버 이름", externalRef: "SRV" };
    const merged = mergeInfoDraft(original, { ...original, notes: "내 메모" }, server);
    expect(buildAssetPatch(server, merged.draft, "equipment")).toEqual({ notes: "내 메모" });
  });
  it("서버 값이 비어 있는 경우(필드 삭제)도 서버 값으로 맞춘다", () => {
    const r = mergeInfoDraft(original, { ...original }, { ...original, externalRef: "" });
    expect(r.draft.externalRef).toBe("");
  });
});

describe("mapServerErrors: field_path → 폼 필드", () => {
  const err = (code: string, details: ConstructorParameters<typeof ApiError>[0]["details"]) =>
    new ApiError({ status: 422, code, message: "m", details });
  it("본문 JSON Pointer를 화면 필드로 연결한다", () => {
    const m = mapServerErrors(
      err("VALIDATION_ERROR", [
        { message: "a", field_path: "/name" },
        { message: "b", field_path: "/equipment/equipment_type" },
        { message: "c", field_path: "/sort_order" },
        { message: "d", field_path: "/space/space_type" },
      ]),
    );
    expect(m.fields).toEqual({ name: "a", equipmentType: "b", sortOrder: "c", spaceType: "d" });
    expect(m.general).toEqual([]);
  });
  it("연결할 수 없는 경로(`/` 등)는 일반 오류로 남긴다", () => {
    const m = mapServerErrors(err("VALIDATION_ERROR", [{ message: "전체 규칙", field_path: "/" }, { message: "경로 없음" }]));
    expect(m.fields).toEqual({});
    expect(m.general.map((g) => g.message)).toEqual(["전체 규칙", "경로 없음"]);
  });
  it("코드 중복은 details가 없어도 코드 필드에 연결한다", () => {
    expect(mapServerErrors(err("ASSET_CODE_CONFLICT", [])).fields.code).toBe("이미 사용 중인 코드입니다.");
  });
  it("같은 필드의 첫 오류를 쓴다", () => {
    const m = mapServerErrors(err("VALIDATION_ERROR", [{ message: "첫째", field_path: "/name" }, { message: "둘째", field_path: "/name" }]));
    expect(m.fields.name).toBe("첫째");
  });
});

describe("buildAssetCreate: 종류별 본문", () => {
  const base = { ...EMPTY_INFO_DRAFT, code: " EQ-9 ", name: " 새 설비 " };
  it("설비: equipment만, 포트·space 없음, 빈 선택 필드는 생략", () => {
    const b = buildAssetCreate({ ...base, equipmentType: " extruder " }, "equipment");
    expect(b).toEqual({ kind: "equipment", code: "EQ-9", name: "새 설비", sort_order: 0, equipment: { equipment_type: "extruder" } });
    expect("ports" in b).toBe(false);
    expect("space" in b).toBe(false);
  });
  it("설비의 모델·외부 참조·메모는 입력이 있을 때만 보낸다", () => {
    const b = buildAssetCreate({ ...base, equipmentType: "x", modelName: "M1", externalRef: "R", notes: "n", sortOrder: "7" }, "equipment");
    expect(b).toMatchObject({ sort_order: 7, external_ref: "R", notes: "n", equipment: { equipment_type: "x", model_name: "M1" } });
  });
  it("저장공간·도킹: space만", () => {
    for (const kind of ["storage", "dock"] as const) {
      const b = buildAssetCreate({ ...base, spaceType: kind }, kind);
      expect(b).toMatchObject({ kind, space: { space_type: kind } });
      expect("equipment" in b).toBe(false);
    }
  });
  it("숨겨진 다른 종류의 입력은 본문에 들어가지 않는다", () => {
    const b = buildAssetCreate({ ...base, equipmentType: "숨겨진 값", spaceType: "rack" }, "storage");
    expect("equipment" in b).toBe(false);
  });
});
