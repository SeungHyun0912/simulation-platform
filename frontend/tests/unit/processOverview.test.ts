import { createLimiter } from "../../src/shared/api/concurrency";
import { equipmentUsage, groupUsage, nodesUsing, type OverviewEntry } from "../../src/features/processes/processOverview";
import type { GraphDoc } from "../../src/features/processes/processDoc";

const op = (id: string, label: string, assets: string[], worker = false) =>
  ({
    id,
    node_key: id,
    kind: "operation",
    label,
    asset_id: null,
    display_order: 0,
    step: {
      resources: [
        { role_key: "main", resource_kind: "equipment", candidates: assets.map((asset_id) => ({ asset_id, eligibility_status: "confirmed" })) },
        ...(worker ? [{ role_key: "w", resource_kind: "worker", candidates: [{ asset_id: "WORKER?", eligibility_status: "unknown" }] }] : []),
      ],
    },
  }) as unknown as GraphDoc["nodes"][number];
const doc = (nodes: GraphDoc["nodes"]): GraphDoc => ({ nodes, edges: [] });

const entries: OverviewEntry[] = [
  { productId: "p1", productCode: "P01", doc: doc([op("a", "압출", ["EQ1"]), op("b", "편조", ["EQ5", "EQ6"])]) },
  { productId: "p2", productCode: "P02", doc: doc([op("c", "압출", ["EQ1"]), op("d", "편조", ["EQ5", "EQ6"], true)]) },
  { productId: "p3", productCode: "P03", doc: doc([op("e", "검사", ["EQ9"])]) },
];

describe("프로젝트 공정 설비 사용처", () => {
  it("설비별로 쓰는 제품·단계를 모으고 여러 제품이 쓰는 설비를 앞에 둔다(노동자 후보는 제외)", () => {
    const u = equipmentUsage(entries);
    expect(u.map((x) => [x.assetId, x.products.length])).toEqual([
      ["EQ1", 2],
      ["EQ5", 2],
      ["EQ6", 2],
      ["EQ9", 1],
    ]);
    expect(u.find((x) => x.assetId === "EQ1")!.products.map((p) => `${p.productCode}:${p.steps.map((s) => s.label)}`)).toEqual(["P01:압출", "P02:압출"]);
    expect(u.some((x) => x.assetId === "WORKER?")).toBe(false);
  });

  it("사용처가 똑같은 설비(같은 단계의 호기 후보)는 한 묶음으로 보인다", () => {
    const g = groupUsage(equipmentUsage(entries));
    expect(g.map((x) => x.assetIds)).toEqual([["EQ1"], ["EQ5", "EQ6"], ["EQ9"]]);
    expect(g[1]!.key).toBe("EQ5");
  });

  it("강조할 노드는 그 제품에서 고른 설비를 쓰는 단계뿐이다", () => {
    const eq5 = equipmentUsage(entries).find((x) => x.assetId === "EQ5");
    expect([...nodesUsing(eq5, "p1")]).toEqual(["b"]);
    expect(nodesUsing(eq5, "p3").size).toBe(0);
    expect(nodesUsing(undefined, "p1").size).toBe(0);
  });
});

describe("동시 요청 제한", () => {
  it("동시에 max개까지만 실행하고 끝나는 대로 다음 작업을 시작하며 결과·실패를 그대로 돌려준다", async () => {
    const limit = createLimiter(2);
    let running = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const task = (v: number, fail = false) => () =>
      new Promise<number>((resolve, reject) => {
        running++;
        peak = Math.max(peak, running);
        releases.push(() => {
          running--;
          if (fail) reject(new Error(`실패 ${v}`));
          else resolve(v);
        });
      });
    const all = [limit(task(1)), limit(task(2)), limit(task(3, true)), limit(task(4))];
    const settledP = Promise.allSettled(all); // 실패를 기다리는 쪽을 먼저 붙여 둔다
    await Promise.resolve();
    expect(releases).toHaveLength(2); // 두 개만 시작했다
    while (releases.length) {
      releases.shift()!();
      await new Promise((r) => setTimeout(r, 0));
    }
    const settled = await settledP;
    expect(peak).toBe(2);
    expect(settled.map((s) => s.status)).toEqual(["fulfilled", "fulfilled", "rejected", "fulfilled"]);
    expect((settled[3] as PromiseFulfilledResult<number>).value).toBe(4);
  });
});
