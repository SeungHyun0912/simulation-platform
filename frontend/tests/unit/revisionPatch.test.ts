import { ApiError } from "../../src/shared/api/errors";
import { toRevisionEdit, type RevisionEdit } from "../../src/features/assets/assetView";
import {
  buildRevisionPatch,
  mapRevisionErrors,
  mergeRevisionEdit,
  toDispatchRequest,
  toReleaseRequest,
} from "../../src/features/assets/revisionPatch";
import { SAMPLE_ASSETS, SAMPLE_REVISIONS } from "../../src/features/assets/sampleAssets";

const eq = SAMPLE_ASSETS.find((a) => a.code === "EQ-001")!;
const rev = SAMPLE_REVISIONS[eq.id]![0]!;
const base = toRevisionEdit(rev);
const IN = rev.ports[0]!.portId;
const OUT = rev.ports[1]!.portId;

const clone = (e: RevisionEdit): RevisionEdit => structuredClone(e);
const edited = (fn: (e: RevisionEdit) => void) => {
  const e = clone(base);
  fn(e);
  return e;
};

describe("buildRevisionPatch: 바꾼 값만 보낸다", () => {
  it("변경이 없으면 null(요청 없음)", () => {
    expect(buildRevisionPatch(base, clone(base))).toBeNull();
  });

  it("바꾼 포트의 바꾼 필드만 보낸다", () => {
    const body = buildRevisionPatch(
      base,
      edited((e) => (e.ports[IN]!.capacity = { mode: "value", value: "9", unit: "kg" })),
    );
    expect(body).toEqual({ ports: [{ port_id: IN, buffer_capacity: { mode: "finite", value: "9", unit: "kg" } }] });
  });

  it("finite가 아닌 용량은 mode만 보내고 status를 보내지 않는다", () => {
    const body = buildRevisionPatch(
      base,
      edited((e) => (e.ports[IN]!.capacity = { mode: "not_allowed", value: "", unit: "item" })),
    );
    expect(body).toEqual({ ports: [{ port_id: IN, buffer_capacity: { mode: "not_allowed" } }] });
  });

  it("규칙은 판별 객체 전체로 보낸다(미정은 mode만)", () => {
    expect(toDispatchRequest({ mode: "unknown" })).toEqual({ mode: "unknown" });
    expect(toDispatchRequest({ mode: "when_destination_available", reservation: "none", waitAtInIfBusy: false })).toEqual({
      mode: "when_destination_available",
      reservation: "none",
      wait_at_in_if_busy: false,
    });
    expect(toReleaseRequest({ mode: "unknown" })).toEqual({ mode: "unknown" });
    expect(toReleaseRequest({ mode: "when_destination_accepts", blockMachineWhileWaiting: "yes" })).toEqual({
      mode: "when_destination_accepts",
      block_machine_while_waiting: "yes",
    });
  });

  it("여러 포트를 바꾸면 포트마다 하나의 항목으로 묶는다", () => {
    const body = buildRevisionPatch(
      base,
      edited((e) => {
        e.ports[IN]!.release = { mode: "unknown" };
        e.ports[OUT]!.capacity = { mode: "unlimited", value: "", unit: "item" };
      }),
    );
    expect(body!.ports!.map((p) => p.port_id)).toEqual([IN, OUT]);
    expect(Object.keys(body!.ports![0]!)).toEqual(["port_id", "release_rule"]);
  });

  it("공간은 저장 용량만 보낸다", () => {
    const st = SAMPLE_ASSETS.find((a) => a.kind === "storage" && SAMPLE_REVISIONS[a.id]?.length)!;
    const b = toRevisionEdit(SAMPLE_REVISIONS[st.id]![0]!);
    const body = buildRevisionPatch(b, { ...clone(b), storageCapacity: { mode: "value", value: "12", unit: "pallet_slot" } });
    expect(body).toEqual({ storage_capacity: { mode: "finite", value: "12", unit: "pallet_slot" } });
  });
});

describe("mergeRevisionEdit: 항목 단위 3-way 병합", () => {
  it("내가 안 바꾼 항목은 서버 값, 바꾼 항목은 내 값", () => {
    const mine = edited((e) => (e.ports[IN]!.capacity = { mode: "value", value: "6", unit: "item" }));
    const server = edited((e) => (e.ports[OUT]!.release = { mode: "unknown" }));
    const m = mergeRevisionEdit(base, mine, server);
    expect(m.draft.ports[IN]!.capacity).toEqual({ mode: "value", value: "6", unit: "item" });
    expect(m.draft.ports[OUT]!.release).toEqual({ mode: "unknown" });
    expect(m.conflicts).toEqual([]);
  });

  it("둘 다 바꿨고 값이 다르면 내 값을 유지하고 충돌 항목으로 알린다", () => {
    const mine = edited((e) => (e.ports[IN]!.capacity = { mode: "value", value: "6", unit: "item" }));
    const server = edited((e) => (e.ports[IN]!.capacity = { mode: "value", value: "8", unit: "item" }));
    const m = mergeRevisionEdit(base, mine, server);
    expect(m.draft.ports[IN]!.capacity.value).toBe("6");
    expect(m.conflicts).toEqual([`${IN}:capacity`]);
  });

  it("둘이 같은 값으로 바꿨으면 충돌이 아니다", () => {
    const same = { mode: "value" as const, value: "6", unit: "item" };
    const m = mergeRevisionEdit(
      base,
      edited((e) => (e.ports[IN]!.capacity = same)),
      edited((e) => (e.ports[IN]!.capacity = same)),
    );
    expect(m.conflicts).toEqual([]);
  });
});

describe("mapRevisionErrors: /ports/{i}는 보낸 본문의 순서다", () => {
  const sent = buildRevisionPatch(
    base,
    edited((e) => {
      e.ports[OUT]!.capacity = { mode: "unlimited", value: "", unit: "item" };
      e.ports[IN]!.release = { mode: "unknown" };
    }),
  )!;
  const err = (...details: { message: string; field_path?: string }[]) =>
    new ApiError({ status: 422, code: "VALIDATION_ERROR", message: "x", requestId: "r", details });

  it("본문 index로 port_id를 찾아 해당 항목에 연결한다(버전의 ports 순서가 아니다)", () => {
    // sent.ports 순서는 PATCH를 만들 때의 draft.ports 순서(IN, OUT)이며, index 1은 OUT이다.
    const idx = sent.ports!.findIndex((p) => p.port_id === OUT);
    const r = mapRevisionErrors(err({ message: "나쁨", field_path: `/ports/${idx}/buffer_capacity/value` }), sent);
    expect(r.byKey).toEqual({ [`${OUT}:capacity`]: "나쁨" });
    expect(r.general).toEqual([]);
  });

  it("저장 용량·규칙 경로도 연결하고 연결할 수 없는 오류는 일반 오류로 남긴다", () => {
    const r = mapRevisionErrors(
      err(
        { message: "a", field_path: "/storage_capacity/value" },
        { message: "b", field_path: "/ports/0/dispatch_rule/reservation" },
        { message: "c", field_path: "/알수없음" },
        { message: "d" },
      ),
      sent,
    );
    expect(r.byKey.storage).toBe("a");
    expect(Object.values(r.byKey)).toContain("b");
    expect(r.general.map((g) => g.message)).toEqual(["c", "d"]);
  });

  it("본문에 없는 index는 일반 오류로 남긴다(엉뚱한 포트에 붙이지 않는다)", () => {
    const r = mapRevisionErrors(err({ message: "z", field_path: "/ports/9/buffer_capacity" }), sent);
    expect(r.byKey).toEqual({});
    expect(r.general).toHaveLength(1);
  });
});
