import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import { hasEdge, measureToKnown, stepOf, validateMeasure, type EdgeKind, type GraphDoc } from "./processDoc";

/**
 * 그래프 구조 검증(클라이언트 형식 검사)과 도식 배치.
 * 구조 오류의 최종 판정은 서버(`PUT graph` 422, VAL-GRAPH-001·003·004)이며 여기서는 저장 전에 같은 규칙으로 미리 알려 준다.
 * 실제 순환(재작업)은 저장할 수 있어 오류가 아니다(서버가 경고 VAL-GRAPH-011).
 */
export function validateGraphStructure(doc: GraphDoc): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const name = (id: string) => byId.get(id)?.label || byId.get(id)?.node_key || id.slice(0, 8);

  const seen = new Set<string>();
  for (const n of doc.nodes) {
    // 작업 노드의 이름 오류는 단계 검증이 알려 준다.
    if (n.kind !== "operation" && n.label.trim() === "")
      issues.push({ severity: "error", message: `${n.node_key}: 이름을 입력하세요.`, field_path: "/label", entity_id: n.id });
    if (n.label.length > 200)
      issues.push({ severity: "error", message: `${n.node_key}: 이름은 200자 이하여야 합니다.`, field_path: "/label", entity_id: n.id });
    if (seen.has(n.node_key))
      issues.push({ severity: "error", message: `${n.label || n.node_key}: 키 ${n.node_key}가 다른 노드와 중복됩니다.`, field_path: "/node_key", entity_id: n.id });
    seen.add(n.node_key);
  }

  if (doc.completion_node_id && byId.get(doc.completion_node_id)?.kind !== "milestone")
    issues.push({ severity: "error", message: "완제품 판정 노드는 완료 기준(milestone) 노드여야 합니다.", field_path: "/completion_node_id", rule_id: "VAL-GRAPH-005" });

  for (const e of doc.edges) {
    const from = byId.get(e.from_node_id);
    const to = byId.get(e.to_node_id);
    const err = (message: string, field: string) => issues.push({ severity: "error", message, field_path: field, entity_id: e.id });
    if (!from) err("간선의 시작 노드가 그래프에 없습니다.", "/from_node_id");
    if (!to) err("간선의 끝 노드가 그래프에 없습니다.", "/to_node_id");
    if (from && to && from.id === to.id) err(`${name(from.id)}: 자기 자신으로 이어지는 간선은 만들 수 없습니다.`, "/to_node_id");
    const kind = e.edge_kind ?? "material";
    if (kind === "material" && from?.kind === "sink") err(`${name(from.id)}: 끝(완제품) 노드에서 나가는 물류 간선은 만들 수 없습니다.`, "/from_node_id");
    if (kind === "material" && to?.kind === "source") err(`${name(to.id)}: 시작(원자재) 노드로 들어오는 물류 간선은 만들 수 없습니다.`, "/to_node_id");
    // 재료 spec 연결: 시작 단계의 출력 spec·끝 단계의 입력 spec이어야 하고 선후 관계에는 쓸 수 없다(VAL-SPEC-002~004)
    const hasSpec = (n: typeof from, key: string, dir: "input" | "output") => !!n && stepOf(n).material_specs.some((m) => m.spec_key === key && m.direction === dir);
    if ((e.source_output_spec_key || e.target_input_spec_key) && kind === "precedence")
      err("선후 관계 간선에는 재료를 연결할 수 없습니다.", "/source_output_spec_key");
    else {
      if (e.source_output_spec_key && !hasSpec(from, e.source_output_spec_key, "output"))
        err(`시작 단계에 출력 재료 ${e.source_output_spec_key}가 없어 연결할 수 없습니다.`, "/source_output_spec_key");
      if (e.target_input_spec_key && !hasSpec(to, e.target_input_spec_key, "input"))
        err(`끝 단계에 투입 재료 ${e.target_input_spec_key}가 없어 연결할 수 없습니다.`, "/target_input_spec_key");
    }
    // 이동 시간은 0이 유효하다(미정과 다르다)
    const dur = validateMeasure(measureToKnown(e.movement_rule?.duration_min, "min"), "nonnegative");
    if (dur) err(`${from && to ? `${name(from.id)} → ${name(to.id)}` : "간선"} 이동 시간: ${dur}`, "/movement_rule/duration_min/value");
  }
  return issues;
}

/**
 * 간선을 추가·수정하기 전에 막아야 하는 문제(없으면 null). 서버 구조 오류와 같은 규칙에 같은 연결의 중복을 더한 것이다.
 * 되돌아가는(순환) 연결은 막지 않는다 — 재작업은 저장할 수 있고 서버가 경고한다.
 */
export function edgeProblem(doc: GraphDoc, from: string, to: string, kind: EdgeKind, exceptId?: string): string | null {
  const a = doc.nodes.find((n) => n.id === from);
  const b = doc.nodes.find((n) => n.id === to);
  if (!a || !b) return "시작과 끝 노드를 모두 고르세요.";
  if (a.id === b.id) return "같은 노드로 이어지는 간선은 만들 수 없습니다.";
  if (kind === "material" && a.kind === "sink") return "끝(완제품) 노드에서 나가는 물류 간선은 만들 수 없습니다.";
  if (kind === "material" && b.kind === "source") return "시작(원자재) 노드로 들어오는 물류 간선은 만들 수 없습니다.";
  if (hasEdge(doc, from, to, kind, exceptId)) return "같은 종류의 같은 연결이 이미 있습니다.";
  return null;
}

/* ---------------- 도식 배치 ---------------- */

export const BOX = { w: 150, h: 44, gapX: 64, gapY: 24, pad: 16 } as const;

export type NodeBox = { id: string; x: number; y: number; layer: number; row: number };
export type GraphLayout = {
  boxes: Map<string, NodeBox>;
  width: number;
  height: number;
  /** 순환을 닫는 간선(되돌아가는 간선). 도식에서 점선 곡선으로 그린다. */
  backEdges: Set<string>;
};

/**
 * 왼쪽에서 오른쪽으로 흐르는 층 배치. 순환은 깊이 우선 탐색에서 만난 되돌림 간선을 빼고 층을 나눈다.
 * 같은 층 안의 순서는 앞 층의 위치(평균)와 display_order로 정한다. 좌표는 화면 계산용이며 서버에 저장하지 않는다
 * (화면 좌표 저장 editor-state는 계약 제안 단계다).
 */
export function layoutGraph(doc: GraphDoc): GraphLayout {
  const nodes = [...doc.nodes].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.node_key.localeCompare(b.node_key));
  const known = new Set(nodes.map((n) => n.id));
  const edges = doc.edges.filter((e) => known.has(e.from_node_id) && known.has(e.to_node_id) && e.from_node_id !== e.to_node_id);
  const out = new Map<string, typeof edges>();
  for (const e of edges) out.set(e.from_node_id, [...(out.get(e.from_node_id) ?? []), e]);

  // 되돌림 간선 찾기(반복 DFS)
  const back = new Set<string>();
  const state = new Map<string, 0 | 1 | 2>(); // 1 = 탐색 중, 2 = 끝
  const incoming = new Set(edges.map((e) => e.to_node_id));
  const starts = [...nodes.filter((n) => !incoming.has(n.id)), ...nodes];
  for (const s of starts) {
    if (state.get(s.id)) continue;
    const stack: { id: string; i: number }[] = [{ id: s.id, i: 0 }];
    state.set(s.id, 1);
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const list = out.get(top.id) ?? [];
      if (top.i >= list.length) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const e = list[top.i++]!;
      const st = state.get(e.to_node_id);
      if (st === 1) back.add(e.id);
      else if (!st) {
        state.set(e.to_node_id, 1);
        stack.push({ id: e.to_node_id, i: 0 });
      }
    }
  }

  // 되돌림을 뺀 간선으로 가장 긴 경로 층
  const forward = edges.filter((e) => !back.has(e.id));
  const preds = new Map<string, string[]>();
  for (const e of forward) preds.set(e.to_node_id, [...(preds.get(e.to_node_id) ?? []), e.from_node_id]);
  const layer = new Map<string, number>();
  const visit = (id: string): number => {
    const cached = layer.get(id);
    if (cached !== undefined) return cached;
    layer.set(id, 0); // 방어: 남은 순환이 있어도 멈춘다
    const l = Math.max(-1, ...(preds.get(id) ?? []).map(visit)) + 1;
    layer.set(id, l);
    return l;
  };
  for (const n of nodes) visit(n.id);

  const layers = new Map<number, string[]>();
  for (const n of nodes) layers.set(layer.get(n.id)!, [...(layers.get(layer.get(n.id)!) ?? []), n.id]);
  const row = new Map<string, number>();
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  for (const l of [...layers.keys()].sort((a, b) => a - b)) {
    const ids = layers.get(l)!;
    const key = (id: string) => {
      const p = (preds.get(id) ?? []).map((x) => row.get(x)).filter((x): x is number => x !== undefined);
      return p.length ? p.reduce((a, b) => a + b, 0) / p.length : Infinity;
    };
    ids.sort((a, b) => key(a) - key(b) || order.get(a)! - order.get(b)!);
    ids.forEach((id, i) => row.set(id, i));
  }

  const boxes = new Map<string, NodeBox>();
  let rows = 0;
  let cols = 0;
  for (const n of nodes) {
    const l = layer.get(n.id)!;
    const r = row.get(n.id)!;
    rows = Math.max(rows, r + 1);
    cols = Math.max(cols, l + 1);
    boxes.set(n.id, { id: n.id, layer: l, row: r, x: BOX.pad + l * (BOX.w + BOX.gapX), y: BOX.pad + r * (BOX.h + BOX.gapY) });
  }
  return {
    boxes,
    backEdges: back,
    width: BOX.pad * 2 + Math.max(cols, 1) * BOX.w + Math.max(cols - 1, 0) * BOX.gapX,
    height: BOX.pad * 2 + Math.max(rows, 1) * BOX.h + Math.max(rows - 1, 0) * BOX.gapY,
  };
}
