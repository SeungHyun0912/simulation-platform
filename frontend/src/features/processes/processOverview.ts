import type { GraphDoc } from "./processDoc";

export type OverviewEntry = { productId: string; productCode: string; doc: GraphDoc };
export type EquipmentUse = {
  assetId: string;
  /** 이 설비를 후보로 쓰는 제품과 그 제품의 단계(노드) */
  products: { productId: string; productCode: string; steps: { nodeId: string; label: string }[] }[];
};

/**
 * 프로젝트 공정 전체에서 설비별 사용처: 공정 단계의 설비 후보(자원 요구 `candidates`)를 모은다. 노동자(worker)는 후보가 없어 빠진다.
 * 같은 설비를 여러 제품이 쓰면 실행에서 서로 기다릴 수 있으므로 한눈에 보이게 한다. 생산량을 합산하지 않는다(설비 사용처만 센다).
 * 정렬: 사용하는 제품이 많은 설비 → 단계가 많은 설비 → 자산 id.
 */
export function equipmentUsage(entries: OverviewEntry[]): EquipmentUse[] {
  const byAsset = new Map<string, Map<string, EquipmentUse["products"][number]>>();
  for (const e of entries) {
    for (const n of e.doc.nodes) {
      if (n.kind !== "operation") continue;
      const ids = new Set<string>();
      for (const r of n.step?.resources ?? []) {
        if (r.resource_kind === "worker") continue;
        for (const c of r.candidates ?? []) ids.add(c.asset_id);
      }
      for (const id of ids) {
        const products = byAsset.get(id) ?? new Map();
        const p = products.get(e.productId) ?? { productId: e.productId, productCode: e.productCode, steps: [] };
        p.steps.push({ nodeId: n.id, label: n.label || n.node_key });
        products.set(e.productId, p);
        byAsset.set(id, products);
      }
    }
  }
  const out: EquipmentUse[] = [...byAsset].map(([assetId, products]) => ({ assetId, products: [...products.values()] }));
  const steps = (u: EquipmentUse) => u.products.reduce((a, p) => a + p.steps.length, 0);
  return out.sort((a, b) => b.products.length - a.products.length || steps(b) - steps(a) || a.assetId.localeCompare(b.assetId));
}

export type EquipmentGroup = {
  /** 묶음의 대표(첫) 자산 id. 강조 상태를 주소에 남길 때 쓴다. */
  key: string;
  assetIds: string[];
  products: EquipmentUse["products"];
};

/**
 * 사용처(제품·단계)가 똑같은 설비를 한 묶음으로 모은다. 같은 단계의 호기 후보(예: 편조기 20대)는 한 줄로 보여 표가 짧아진다.
 * 강조 결과는 묶음 안 어느 설비를 골라도 같다(사용처가 같으므로).
 */
export function groupUsage(usage: EquipmentUse[]): EquipmentGroup[] {
  const groups = new Map<string, EquipmentGroup>();
  for (const u of usage) {
    const sig = JSON.stringify(u.products.map((p) => [p.productId, p.steps.map((s) => s.nodeId).sort()]));
    const g = groups.get(sig);
    if (g) g.assetIds.push(u.assetId);
    else groups.set(sig, { key: u.assetId, assetIds: [u.assetId], products: u.products });
  }
  return [...groups.values()];
}

/** 한 제품의 도식에서 강조할 노드: 고른 설비를 후보로 쓰는 단계 */
export function nodesUsing(use: EquipmentUse | undefined, productId: string): ReadonlySet<string> {
  return new Set(use?.products.find((p) => p.productId === productId)?.steps.map((s) => s.nodeId) ?? []);
}
