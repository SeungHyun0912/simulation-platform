import { ApiError, toIssues } from "../../shared/api/errors";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import type { GraphDoc, GraphIn, GraphNode } from "./processDoc";
import { changedUnitFields, type UnitSpecEdit, type UnitSpecField } from "./processView";

/**
 * 공정 편집 초안과 저장·병합 규칙.
 * - `PUT graph`는 노드·간선 전체 교체다. 그래서 서버가 준 문서를 그대로 들고 있다가 고친 부분만 바꿔 다시 보낸다.
 * - 단위(원자재·완제품)는 `PATCH process-version`(보낸 필드만 교체), 그래프·단계·단위·전이는 모두 같은 버전 `row_version`(If-Match)이다.
 */
export type ProcessDraft = { doc: GraphDoc; raw: UnitSpecEdit; finished: UnitSpecEdit };

const json = (x: unknown) => JSON.stringify(x);

/** 구조: 노드·간선의 존재와 연결(단계 내용은 제외). 간선의 이동 규칙도 구조로 본다. */
function structureOf(d: GraphDoc): string {
  return json([
    d.nodes.map((n) => [n.id, n.node_key, n.kind, n.asset_id ?? null, n.display_order ?? 0]),
    d.edges.map((e) => [e.id, e.edge_key, e.from_node_id, e.to_node_id, e.edge_kind, e.movement_rule ?? null]),
  ]);
}

/** 노드 내용: 이름과 단계 규칙 전체(버퍼 노드는 이름만) */
const contentOf = (n: GraphNode) => json([n.label, n.step ?? null]);

export function docChanged(a: GraphDoc, b: GraphDoc): boolean {
  return json(a) !== json(b);
}

export function draftChanged(a: ProcessDraft, b: ProcessDraft): boolean {
  return (
    docChanged(a.doc, b.doc) ||
    changedUnitFields(a.raw, b.raw).length > 0 ||
    changedUnitFields(a.finished, b.finished).length > 0
  );
}

/** 서버에 보낼 그래프 본문(응답의 노드·간선을 그대로 되돌려 보낸다). */
export function toGraphIn(doc: GraphDoc): GraphIn {
  return { nodes: doc.nodes, edges: doc.edges };
}

export type ProcessMerge = {
  draft: ProcessDraft;
  /** 나와 서버가 모두 바꾼 항목: 노드 id 또는 `raw:<필드>`·`finished:<필드>`. 내 값을 유지하고 서버 값을 알린다. */
  conflicts: string[];
};

/**
 * 412 충돌 후 "내 변경을 유지"할 때의 3-way 병합(저장은 하지 않고 사용자가 다시 누른다).
 * 구조(노드·간선의 추가·삭제·연결)가 양쪽 모두 바뀌었거나, 내가 구조를 바꿨는데 서버도 바뀌었다면 자동으로 합치지 않고
 * null을 돌려준다(다시 불러오기만 가능). 구조가 그대로면 노드 단위로 내가 바꾼 단계만 유지하고 나머지는 서버 값을 따른다.
 */
export function mergeProcessDraft(base: ProcessDraft, mine: ProcessDraft, server: ProcessDraft): ProcessMerge | null {
  const conflicts: string[] = [];
  let doc: GraphDoc;
  const sB = structureOf(base.doc);
  const sM = structureOf(mine.doc);
  const sS = structureOf(server.doc);
  const iChangedDoc = docChanged(base.doc, mine.doc);
  if (sM !== sB) {
    // 내가 구조를 바꿨다: 서버 그래프가 전혀 바뀌지 않았을 때만 내 문서를 그대로 쓴다.
    if (docChanged(base.doc, server.doc)) return null;
    doc = mine.doc;
  } else if (sS !== sB) {
    // 서버가 구조를 바꿨다: 내가 그래프를 안 건드렸을 때만 서버 문서를 따른다.
    if (iChangedDoc) return null;
    doc = server.doc;
  } else {
    const baseNodes = new Map(base.doc.nodes.map((n) => [n.id, n]));
    const mineNodes = new Map(mine.doc.nodes.map((n) => [n.id, n]));
    doc = {
      edges: server.doc.edges,
      nodes: server.doc.nodes.map((s) => {
        const b = baseNodes.get(s.id)!;
        const m = mineNodes.get(s.id)!;
        const mineChanged = contentOf(m) !== contentOf(b);
        if (!mineChanged) return s;
        if (contentOf(s) !== contentOf(b) && contentOf(s) !== contentOf(m)) conflicts.push(s.id);
        return { ...s, label: m.label, step: m.step };
      }),
    };
  }

  const mergeUnits = (which: "raw" | "finished"): UnitSpecEdit => {
    const merged: UnitSpecEdit = { ...server[which] };
    for (const k of changedUnitFields(base[which], mine[which])) {
      merged[k] = mine[which][k];
      const serverChanged = changedUnitFields(base[which], server[which]).includes(k);
      if (serverChanged && changedUnitFields(server[which], mine[which]).includes(k)) conflicts.push(`${which}:${k}`);
    }
    return merged;
  };
  return { draft: { doc, raw: mergeUnits("raw"), finished: mergeUnits("finished") }, conflicts };
}

export type UnitErrors = Partial<Record<`${"raw" | "finished"}:${UnitSpecField}`, string>>;

/** 단위 저장(PATCH process-version) 422의 field_path(`/raw_unit_spec/length_m/value` 등)를 입력에 연결한다. */
export function mapUnitErrors(e: ApiError): { byField: UnitErrors; general: ValidationIssue[] } {
  const byField: UnitErrors = {};
  const general: ValidationIssue[] = [];
  const KEY: Record<string, UnitSpecField> = {
    length_m: "lengthM",
    weight_kg: "weightKg",
    unit_count: "unitCount",
    strand_count: "strandCount",
  };
  for (const issue of toIssues(e)) {
    const m = /^\/(raw|finished)_unit_spec\/(length_m|weight_kg|unit_count|strand_count)(\/|$)/.exec(issue.field_path ?? "");
    if (m) {
      const key = `${m[1] as "raw" | "finished"}:${KEY[m[2]!]!}` as keyof UnitErrors;
      if (!(key in byField)) {
        byField[key] = issue.message;
        continue;
      }
    }
    general.push(issue);
  }
  return { byField, general };
}

/**
 * 그래프 저장(PUT graph) 오류의 field_path(`/nodes/1/step/timing_rule/…`, `/edges/0/to_node_id`)는 **요청 본문 기준**이다.
 * 보낸 본문의 index로 노드·간선 id를 찾아 entity_id를 붙이고 field_path는 그 엔티티 내부 포인터로 바꾼다.
 */
export function mapGraphErrors(e: ApiError, sent: GraphIn): ValidationIssue[] {
  return toIssues(e).map((issue) => {
    const m = /^\/(nodes|edges)\/(\d+)(\/.*)?$/.exec(issue.field_path ?? "");
    if (!m) return issue;
    const list: { id: string }[] = m[1] === "nodes" ? sent.nodes : (sent.edges ?? []);
    const target = list[Number(m[2])];
    if (!target) return issue;
    const inner = (m[3] ?? "").replace(/^\/step/, "") || "/";
    return { ...issue, entity_id: target.id, field_path: inner };
  });
}
