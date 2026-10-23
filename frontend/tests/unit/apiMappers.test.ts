import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toAssetInfo, toRevisionDetail } from "../../src/features/assets/apiMappers";
import { toMeView, toProjectView } from "../../src/features/projects/queries";
import { buildQuery } from "../../src/shared/api/client";
import type { Schemas } from "../../src/shared/api/types";

type One<T> = { data: T };
type Many<T> = { data: T[]; page: unknown };

/** 계약 승인 예제(contracts/examples/first-scope)를 어댑터에 통과시켜 계약과 어긋나면 실패하게 한다. */
function example<T>(name: string) {
  const file = resolve(__dirname, "../../../contracts/examples/first-scope", name);
  return JSON.parse(readFileSync(file, "utf8")) as {
    request: { path: string; body?: unknown };
    response: { status: number; headers?: Record<string, string>; body: T };
  };
}

describe("어댑터 × 계약 예제", () => {
  it("asset.get: 자산 기본 정보와 버전 요약", () => {
    const a = toAssetInfo(example<One<Schemas["AssetOut"]>>("asset.get.json").response.body.data);
    expect(a).toMatchObject({
      code: "EQ-001",
      kind: "equipment",
      equipmentType: "extruder",
      modelName: "EX-100",
      sortOrder: 10,
      externalRef: "ERP-0001",
      spaceType: null,
      rowVersion: 2,
      currentRevision: { revisionNo: 1, status: "approved" },
      latestRevision: { revisionNo: 2, status: "draft", approvedAt: null },
    });
    expect(a.ports.map((p) => p.role)).toEqual(["IN", "OUT"]);
  });

  it("asset.list: 모든 항목이 변환된다", () => {
    const body = example<Many<Schemas["AssetOut"]>>("asset.list.json").response.body;
    const items = body.data.map(toAssetInfo);
    expect(items.length).toBe(body.data.length);
    for (const i of items) expect(i.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("revision.patch.equipment 응답: 포트별 용량·규칙·issues", () => {
    const r = toRevisionDetail(example<One<Schemas["AssetRevisionOut"]>>("revision.patch.equipment.json").response.body.data);
    expect(r.status).toBe("draft");
    expect(r.storageCapacity).toBeNull();
    expect(r.ports[0]).toMatchObject({
      role: "IN",
      bufferCapacity: { mode: "value", value: "4", unit: "item" },
      dispatchRule: { mode: "when_destination_available", reservation: "unknown", waitAtInIfBusy: true },
      releaseRule: { mode: "when_destination_accepts", blockMachineWhileWaiting: "unknown" },
    });
    expect(r.ports[1]).toMatchObject({
      role: "OUT",
      bufferCapacity: { mode: "not_allowed", value: "" },
      releaseRule: { blockMachineWhileWaiting: "yes" },
    });
    expect(r.issues[0]).toMatchObject({
      severity: "warning",
      rule_id: "VAL-POLICY-001",
      field_path: "/ports/0/dispatch_rule/reservation",
    });
    expect(r.rowVersion).toBe(2);
  });

  it("revision.create.storage 응답: 저장 용량 미정, 포트 없음", () => {
    const r = toRevisionDetail(example<One<Schemas["AssetRevisionOut"]>>("revision.create.storage.json").response.body.data);
    expect(r.ports).toEqual([]);
    expect(r.storageCapacity).toMatchObject({ mode: "unknown", value: "" });
    expect(r.issues[0]!.rule_id).toBe("VAL-CAP-001");
  });

  it("revision.list: 목록의 각 항목이 상세와 같은 모양으로 변환된다", () => {
    const body = example<Many<Schemas["AssetRevisionOut"]>>("revision.list.json").response.body;
    const list = body.data.map(toRevisionDetail);
    expect(list.length).toBeGreaterThan(0);
    for (const r of list) expect(["draft", "in_review", "approved", "superseded"]).toContain(r.status);
  });

  it("revision.approve·submit·reject 응답도 변환된다(전이 후 상태)", () => {
    for (const [file, status] of [
      ["revision.submit.json", "in_review"],
      ["revision.approve.json", "approved"],
      ["revision.reject.json", "draft"],
    ] as const) {
      const r = toRevisionDetail(example<One<Schemas["AssetRevisionOut"]>>(file).response.body.data);
      expect(r.status).toBe(status);
    }
    expect(toRevisionDetail(example<One<Schemas["AssetRevisionOut"]>>("revision.reject.json").response.body.data).rejectionReason).toBeTruthy();
  });

  it("project.create 응답을 프로젝트 뷰로 바꾼다(역할은 비어 있음)", () => {
    const p = toProjectView(example<One<Schemas["ProjectOut"]>>("project.create.json").response.body.data);
    expect(p.role).toBe("");
    expect(p.status).toBeTruthy();
    expect(p.timezone).toBeTruthy();
  });
});

describe("toMeView", () => {
  it("/me를 화면용으로 바꾼다", () => {
    const v = toMeView({
      user: { id: "u", display_name: "홍길동" },
      organizations: [{ id: "o", code: "O", name: "조직", role: "admin" }],
      projects: [{ id: "p", organization_id: "o", code: "P", name: "프로젝트", role: "viewer", status: "active" }],
    });
    expect(v.userName).toBe("홍길동");
    expect(v.projects[0]).toEqual({ id: "p", organizationId: "o", code: "P", name: "프로젝트", role: "viewer", status: "active" });
  });
});

describe("계약이 정한 목록 쿼리", () => {
  it("자산 목록 쿼리 이름은 q, kind, sort, limit, cursor이다", () => {
    expect(buildQuery({ q: "a", kind: "dock", sort: "-name", limit: 50, cursor: "c" })).toBe(
      "?q=a&kind=dock&sort=-name&limit=50&cursor=c",
    );
  });
});
