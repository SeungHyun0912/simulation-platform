import { useState } from "react";
import { Button } from "../../shared/components/Button";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { SelectField, TextField } from "../../shared/components/Fields";
import { Note, Section } from "../../shared/components/Layout";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import { GraphDiagram } from "./GraphDiagram";
import { MeasureField } from "./MeasureField";
import {
  SPACE_KINDS,
  connectedEdges,
  movementOf,
  patchEdge,
  specTitle,
  stepOf,
  type EdgeKind,
  type GraphDoc,
  type GraphEdge,
  type GraphNode,
  type MovementRule,
  type NodeKind,
} from "./processDoc";
import { edgeProblem } from "./processGraph";
import { EDGE_KIND_LABELS, MOVEMENT_LABELS, NODE_KIND_LABELS, measureText } from "./processView";
import type { AssetOptions } from "./queries";
import type { MaterialOptions } from "../materials/queries";
import styles from "./ProcessEditorPage.module.css";

export type GraphEditorApi = {
  addNode: (kind: NodeKind, label: string) => string;
  patchNode: (id: string, patch: { label?: string; asset_id?: string | null }) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, delta: -1 | 1) => void;
  addEdge: (from: string, to: string, kind: EdgeKind) => string;
  patchEdge: (id: string, patch: Parameters<typeof patchEdge>[2]) => void;
  removeEdge: (id: string) => void;
  /** 완제품 판정 시점(milestone 노드, 미정은 null) */
  setCompletion: (id: string | null) => void;
};

type Props = {
  doc: GraphDoc;
  editable: boolean;
  options: AssetOptions;
  /** 재료 spec 이름 표시용 */
  materials: MaterialOptions;
  /** entity_id별 서버·입력 검증 항목(노드·간선 행에 개수로 표시) */
  issues: Map<string, ValidationIssue[]>;
  api: GraphEditorApi;
  /** 작업 노드를 고르면 단계 편집 패널을 연다(단계 내용은 거기서 고친다) */
  onOpenStep: (nodeId: string) => void;
  /** 도식·표에서 고른 노드(작업 노드는 단계 패널의 선택과 같이 움직인다) */
  selectedStepId: string | null;
};

const NODE_KINDS = Object.keys(NODE_KIND_LABELS) as NodeKind[];
const EDGE_KINDS = Object.keys(EDGE_KIND_LABELS) as EdgeKind[];
const KIND_HINT: Record<NodeKind, string> = {
  source: "원자재가 들어오는 시작점입니다.",
  buffer: "저장·도킹 공간(대기 위치)입니다. 위치는 비워 둘 수 있습니다(위치 미정).",
  operation: "설비가 처리하는 공정 단계입니다. 내용은 추가한 뒤 단계 편집에서 입력합니다.",
  join: "여러 흐름이 합쳐지는 지점입니다. 합류 규칙(입력 매칭)은 아직 입력할 수 없습니다.",
  milestone: "완료 기준 지점입니다. 완료 기준 연결은 아직 입력할 수 없습니다.",
  sink: "완제품이 나가는 끝점입니다.",
};

const issueText = (list: ValidationIssue[] | undefined) => {
  const e = (list ?? []).filter((i) => i.severity === "error").length;
  const w = (list ?? []).filter((i) => i.severity === "warning").length;
  if (e + w === 0) return "문제 없음";
  return `${e > 0 ? `오류 ${e}` : ""}${e > 0 && w > 0 ? " · " : ""}${w > 0 ? `경고 ${w}` : ""}`;
};

/**
 * 공정 그래프 구성: 도식 + 노드·간선 표 + 추가·수정·삭제. 직선이 아니어도(분기·합류·선후/공급 간선) 편집할 수 있다.
 * - 노드 삭제는 연결된 간선도 함께 지우며 어떤 간선이 사라지는지 먼저 보여 준다(앞뒤를 자동으로 잇지 않는다).
 * - 이동 규칙은 미정이 기본이고 직결 공급도 이동 시간을 0으로 가정하지 않는다.
 * - 좌표는 저장하지 않는다(도식은 자동 배치).
 */
export function GraphEditor({ doc, editable, options, materials, issues, api, onOpenStep, selectedStepId }: Props) {
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [edgeId, setEdgeId] = useState<string | null>(null);
  const [deleteNode, setDeleteNode] = useState<string | null>(null);
  const [deleteEdge, setDeleteEdge] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<NodeKind>("operation");
  const [newLabel, setNewLabel] = useState("");
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  const [edgeKind, setEdgeKind] = useState<EdgeKind>("material");

  const nodes = [...doc.nodes].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.node_key.localeCompare(b.node_key));
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const nodeName = (id: string) => byId.get(id)?.label || byId.get(id)?.node_key || id.slice(0, 8);
  const assetCode = (id: string | null | undefined) => (id ? (options.byId.get(id)?.code ?? id.slice(0, 8)) : null);
  const milestones = nodes.filter((n) => n.kind === "milestone");
  const node = nodes.find((n) => n.id === nodeId) ?? null;
  const edge = doc.edges.find((e) => e.id === edgeId) ?? null;
  const deleting = nodes.find((n) => n.id === deleteNode) ?? null;
  const deletingEdges = deleting ? connectedEdges(doc, deleting.id) : [];
  const problem = edgeFrom === "" || edgeTo === "" ? "시작과 끝 노드를 모두 고르세요." : edgeProblem(doc, edgeFrom, edgeTo, edgeKind);
  const errorIds = new Set([...issues].filter(([, l]) => l.some((i) => i.severity === "error")).map(([id]) => id));

  function selectNode(id: string) {
    const n = byId.get(id);
    if (!n) return;
    setEdgeId(null);
    if (n.kind === "operation") {
      setNodeId(null);
      onOpenStep(id);
    } else setNodeId(id);
  }

  const nodeColumns: Column<GraphNode>[] = [
    { key: "order", header: "순서", align: "end", render: (n) => nodes.indexOf(n) + 1 },
    {
      key: "kind",
      header: "종류",
      render: (n) => (doc.completion_node_id === n.id ? `${NODE_KIND_LABELS[n.kind]} · 완제품 지정` : NODE_KIND_LABELS[n.kind]),
    },
    { key: "label", header: "이름", render: (n) => n.label || "(이름 없음)" },
    { key: "key", header: "키", render: (n) => <code>{n.node_key}</code> },
    {
      key: "asset",
      header: "공간",
      render: (n) => (SPACE_KINDS.includes(n.kind) ? (assetCode(n.asset_id) ?? "위치 미정") : "-"),
    },
    {
      key: "links",
      header: "연결",
      render: (n) => `들어옴 ${doc.edges.filter((e) => e.to_node_id === n.id).length} · 나감 ${doc.edges.filter((e) => e.from_node_id === n.id).length}`,
    },
    { key: "issues", header: "검증", render: (n) => issueText(issues.get(n.id)) },
    {
      key: "actions",
      header: "작업",
      render: (n) => {
        const i = nodes.indexOf(n);
        const name = `${n.label || n.node_key}`;
        return (
          <span className={styles.rowActions}>
            <Button onClick={() => selectNode(n.id)} aria-label={`노드 ${name} ${editable ? "편집" : "보기"}`}>
              {editable ? "편집" : "보기"}
            </Button>
            {editable && (
              <>
                <Button disabled={i === 0} onClick={() => api.moveNode(n.id, -1)} aria-label={`노드 ${name} 위로 이동`}>
                  ▲
                </Button>
                <Button disabled={i === nodes.length - 1} onClick={() => api.moveNode(n.id, 1)} aria-label={`노드 ${name} 아래로 이동`}>
                  ▼
                </Button>
                <Button onClick={() => setDeleteNode(n.id)} aria-label={`노드 ${name} 삭제`}>
                  삭제
                </Button>
              </>
            )}
          </span>
        );
      },
    },
  ];

  const edgeText = (e: GraphEdge) => `${nodeName(e.from_node_id)} → ${nodeName(e.to_node_id)}`;
  const edgeColumns: Column<GraphEdge>[] = [
    { key: "from", header: "에서", render: (e) => nodeName(e.from_node_id) },
    { key: "to", header: "으로", render: (e) => nodeName(e.to_node_id) },
    { key: "kind", header: "관계", render: (e) => EDGE_KIND_LABELS[e.edge_kind ?? "material"] },
    {
      key: "move",
      header: "이동",
      render: (e) => {
        const m = movementOf(e);
        return m.mode === "unknown" ? "미정" : `${MOVEMENT_LABELS[m.mode]} · ${measureText(m.duration_min, "분")}`;
      },
    },
    {
      key: "specs",
      header: "재료 연결",
      render: (e) => (e.source_output_spec_key || e.target_input_spec_key ? `${e.source_output_spec_key ?? "-"} → ${e.target_input_spec_key ?? "-"}` : "없음"),
    },
    { key: "issues", header: "검증", render: (e) => issueText(issues.get(e.id)) },
    {
      key: "actions",
      header: "작업",
      render: (e) => (
        <span className={styles.rowActions}>
          <Button
            onClick={() => {
              setNodeId(null);
              setEdgeId(e.id);
            }}
            aria-label={`간선 ${edgeText(e)} ${editable ? "편집" : "보기"}`}
          >
            {editable ? "편집" : "보기"}
          </Button>
          {editable && (
            <Button onClick={() => setDeleteEdge(e.id)} aria-label={`간선 ${edgeText(e)} 삭제`}>
              삭제
            </Button>
          )}
        </span>
      ),
    },
  ];

  function addNodeNow() {
    const label = newLabel.trim();
    if (label === "") return;
    const id = api.addNode(newKind, label);
    setNewLabel("");
    if (newKind === "operation") onOpenStep(id);
    else {
      setEdgeId(null);
      setNodeId(id);
    }
  }

  function addEdgeNow() {
    if (problem) return;
    const id = api.addEdge(edgeFrom, edgeTo, edgeKind);
    setEdgeFrom("");
    setEdgeTo("");
    setNodeId(null);
    setEdgeId(id);
  }

  const nodeOption = (n: GraphNode) => (
    <option key={n.id} value={n.id}>
      {n.label || n.node_key} ({NODE_KIND_LABELS[n.kind]})
    </option>
  );

  return (
    <Section id="sec-graph" title="그래프 구성">
      <ConfirmDialog
        open={deleting !== null}
        title="노드를 삭제할까요?"
        confirmLabel="노드와 간선 삭제"
        onCancel={() => setDeleteNode(null)}
        onConfirm={() => {
          if (deleteNode) api.removeNode(deleteNode);
          if (nodeId === deleteNode) setNodeId(null);
          if (selectedStepId === deleteNode) onOpenStep("");
          setDeleteNode(null);
        }}
      >
        <p>"{deleting?.label || deleting?.node_key}" 노드를 이 화면의 편집 내용에서 삭제합니다. 저장하기 전에는 서버 데이터가 바뀌지 않습니다.</p>
        {deletingEdges.length > 0 ? (
          <>
            <p>연결된 간선 {deletingEdges.length}개도 함께 지워지며, 앞뒤 노드를 자동으로 잇지 않습니다.</p>
            <ul>
              {deletingEdges.map((e) => (
                <li key={e.id}>{edgeText(e)}</li>
              ))}
            </ul>
          </>
        ) : (
          <p>연결된 간선이 없습니다.</p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteEdge !== null}
        title="간선을 삭제할까요?"
        confirmLabel="간선 삭제"
        onCancel={() => setDeleteEdge(null)}
        onConfirm={() => {
          if (deleteEdge) api.removeEdge(deleteEdge);
          if (edgeId === deleteEdge) setEdgeId(null);
          setDeleteEdge(null);
        }}
      >
        "{doc.edges.find((e) => e.id === deleteEdge) ? edgeText(doc.edges.find((e) => e.id === deleteEdge)!) : ""}" 연결을 이 화면의 편집 내용에서
        삭제합니다. 저장하기 전에는 서버 데이터가 바뀌지 않습니다.
      </ConfirmDialog>

      <Note>
        노드(시작·대기 공간·공정 단계·합류·끝)와 간선(물류·선후 관계·공급)으로 공정을 구성합니다. 도식은 자동 배치이며 위치는 저장하지 않습니다.
      </Note>
      <GraphDiagram
        doc={doc}
        selectedNodeId={nodeId ?? selectedStepId}
        selectedEdgeId={edgeId}
        completionId={doc.completion_node_id ?? null}
        errorIds={errorIds}
        onSelectNode={selectNode}
        onSelectEdge={(id) => {
          setNodeId(null);
          setEdgeId(id);
        }}
      />

      {editable && (
        <fieldset className={styles.addForm}>
          <legend>노드 추가</legend>
          <SelectField label="새 노드 종류" value={newKind} hint={KIND_HINT[newKind]} onChange={(e) => setNewKind(e.target.value as NodeKind)}>
            {NODE_KINDS.map((k) => (
              <option key={k} value={k}>
                {NODE_KIND_LABELS[k]}
              </option>
            ))}
          </SelectField>
          <TextField
            label="새 노드 이름"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addNodeNow();
              }
            }}
          />
          <div>
            <Button disabled={newLabel.trim() === ""} onClick={addNodeNow} title={newLabel.trim() === "" ? "이름을 입력하세요" : undefined}>
              노드 추가
            </Button>
          </div>
        </fieldset>
      )}

      {milestones.length > 0 || doc.completion_node_id ? (
        <SelectField
          label="완제품 판정 노드"
          hint="완제품이 되는 시점(완료 기준 노드)을 지정합니다. 미정이면 서버가 경고하고 실행 가능 검증에서는 오류입니다."
          value={doc.completion_node_id ?? ""}
          disabled={!editable}
          onChange={(e) => api.setCompletion(e.target.value === "" ? null : e.target.value)}
        >
          <option value="">미정 (지정 안 함)</option>
          {milestones.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label || n.node_key}
            </option>
          ))}
        </SelectField>
      ) : (
        editable && <Note>완제품 판정 시점을 지정하려면 먼저 "완료 기준" 노드를 추가하세요(지정하지 않으면 서버가 경고합니다).</Note>
      )}

      {nodes.length === 0 ? (
        <Note>노드가 없습니다.{editable ? " 위에서 노드를 추가하세요." : ""}</Note>
      ) : (
        <DataTable caption="노드" columns={nodeColumns} rows={nodes} getRowKey={(n) => n.id} currentRowKey={nodeId ?? selectedStepId ?? undefined} wrapCells />
      )}

      {node && (
        <div className={styles.addForm} role="group" aria-label={`노드 편집: ${node.label || node.node_key}`}>
          <strong>노드 편집: {node.label || node.node_key}</strong>
          <fieldset disabled={!editable} style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: "var(--space-3)" }}>
            <TextField
              label="노드 이름"
              value={node.label}
              error={node.label.trim() === "" ? "이름을 입력하세요." : null}
              onChange={(e) => api.patchNode(node.id, { label: e.target.value })}
            />
            {SPACE_KINDS.includes(node.kind) ? (
              <SelectField
                label="노드 공간"
                hint="저장·도킹 공간만 고를 수 있습니다. 비우면 위치 미정입니다."
                value={node.asset_id ?? ""}
                onChange={(e) => api.patchNode(node.id, { asset_id: e.target.value === "" ? null : e.target.value })}
              >
                <option value="">위치 미정</option>
                {options.spaces.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} {o.name}
                  </option>
                ))}
                {node.asset_id && !options.spaces.some((o) => o.id === node.asset_id) && (
                  <option value={node.asset_id}>{assetCode(node.asset_id)} (선택지에 없음)</option>
                )}
              </SelectField>
            ) : (
              <Note>이 종류의 노드에는 설비·공간을 직접 지정하지 않습니다.</Note>
            )}
          </fieldset>
          <div>
            <Button onClick={() => setNodeId(null)}>편집 닫기</Button>
          </div>
        </div>
      )}

      {editable && (
        <fieldset className={styles.addForm}>
          <legend>간선 추가</legend>
          <SelectField label="새 간선 시작" value={edgeFrom} onChange={(e) => setEdgeFrom(e.target.value)}>
            <option value="">선택</option>
            {nodes.map(nodeOption)}
          </SelectField>
          <SelectField label="새 간선 끝" value={edgeTo} onChange={(e) => setEdgeTo(e.target.value)}>
            <option value="">선택</option>
            {nodes.map(nodeOption)}
          </SelectField>
          <SelectField label="새 간선 종류" value={edgeKind} onChange={(e) => setEdgeKind(e.target.value as EdgeKind)}>
            {EDGE_KINDS.map((k) => (
              <option key={k} value={k}>
                {EDGE_KIND_LABELS[k]}
              </option>
            ))}
          </SelectField>
          <div>
            <Button disabled={problem !== null} onClick={addEdgeNow} title={problem ?? undefined}>
              간선 추가
            </Button>
            {edgeFrom !== "" && edgeTo !== "" && problem && <Note>{problem}</Note>}
          </div>
        </fieldset>
      )}

      {doc.edges.length === 0 ? (
        <Note>간선이 없습니다.{editable ? " 위에서 노드를 이어 주세요." : ""}</Note>
      ) : (
        <DataTable caption="간선" columns={edgeColumns} rows={doc.edges} getRowKey={(e) => e.id} currentRowKey={edgeId ?? undefined} wrapCells />
      )}

      {edge && (
        <div className={styles.addForm} role="group" aria-label={`간선 편집: ${edgeText(edge)}`}>
          <strong>간선 편집: {edgeText(edge)}</strong>
          <fieldset disabled={!editable} style={{ border: 0, margin: 0, padding: 0, display: "grid", gap: "var(--space-3)" }}>
            <SelectField label="간선 시작" value={edge.from_node_id} onChange={(e) => api.patchEdge(edge.id, { from_node_id: e.target.value })}>
              {nodes.map(nodeOption)}
            </SelectField>
            <SelectField label="간선 끝" value={edge.to_node_id} onChange={(e) => api.patchEdge(edge.id, { to_node_id: e.target.value })}>
              {nodes.map(nodeOption)}
            </SelectField>
            <SelectField label="간선 종류" value={edge.edge_kind ?? "material"} onChange={(e) => api.patchEdge(edge.id, { edge_kind: e.target.value as EdgeKind })}>
              {EDGE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {EDGE_KIND_LABELS[k]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="이동 방식"
              hint="이동 방식은 미정이 기본입니다. 직결 공급도 이동 시간을 0으로 가정하지 않습니다."
              value={movementOf(edge).mode}
              onChange={(e) => {
                const mode = e.target.value as MovementRule["mode"];
                // 미정으로 돌아가면 이동 시간도 미정으로 비운다(시간만 남지 않게)
                api.patchEdge(edge.id, { movement_rule: { mode, duration_min: mode === "unknown" ? { mode: "unknown" } : movementOf(edge).duration_min } });
              }}
            >
              {(Object.keys(MOVEMENT_LABELS) as (keyof typeof MOVEMENT_LABELS)[]).map((k) => (
                <option key={k} value={k}>
                  {MOVEMENT_LABELS[k]}
                </option>
              ))}
            </SelectField>
            {movementOf(edge).mode !== "unknown" && (
              <MeasureField
                label="이동 시간"
                unit="min"
                kind="nonnegative"
                value={movementOf(edge).duration_min}
                onChange={(m) => api.patchEdge(edge.id, { movement_rule: { mode: movementOf(edge).mode, duration_min: m } })}
              />
            )}
            {(() => {
              const from = byId.get(edge.from_node_id);
              const to = byId.get(edge.to_node_id);
              const kind = edge.edge_kind ?? "material";
              const outs = from?.kind === "operation" ? stepOf(from).material_specs.filter((x) => x.direction === "output") : [];
              const ins = to?.kind === "operation" ? stepOf(to).material_specs.filter((x) => x.direction === "input") : [];
              const matName = (id: string) => materials.byId.get(id)?.name;
              if (kind === "precedence") return <Note>선후 관계 간선에는 재료를 연결할 수 없습니다.</Note>;
              if (from?.kind !== "operation" && to?.kind !== "operation")
                return <Note>재료 연결은 공정 단계에 직접 이어진 간선에만 합니다(대기 공간을 사이에 둔 흐름에서는 단계에 붙은 간선에 연결).</Note>;
              return (
                <>
                  {from?.kind === "operation" && (
                    <SelectField
                      label="출력 재료 연결 (시작 단계)"
                      hint={outs.length === 0 ? "시작 단계에 산출 재료 spec이 없습니다. 단계 편집의 '투입·산출 재료'에서 추가하세요." : undefined}
                      value={edge.source_output_spec_key ?? ""}
                      onChange={(e) => api.patchEdge(edge.id, { source_output_spec_key: e.target.value === "" ? null : e.target.value })}
                    >
                      <option value="">연결 없음</option>
                      {outs.map((s) => (
                        <option key={s.spec_key} value={s.spec_key}>
                          {specTitle(s, matName)}
                        </option>
                      ))}
                      {edge.source_output_spec_key && !outs.some((s) => s.spec_key === edge.source_output_spec_key) && (
                        <option value={edge.source_output_spec_key}>{edge.source_output_spec_key} (시작 단계에 없음)</option>
                      )}
                    </SelectField>
                  )}
                  {to?.kind === "operation" && (
                    <SelectField
                      label="입력 재료 연결 (끝 단계)"
                      hint={ins.length === 0 ? "끝 단계에 투입 재료 spec이 없습니다. 단계 편집의 '투입·산출 재료'에서 추가하세요." : undefined}
                      value={edge.target_input_spec_key ?? ""}
                      onChange={(e) => api.patchEdge(edge.id, { target_input_spec_key: e.target.value === "" ? null : e.target.value })}
                    >
                      <option value="">연결 없음</option>
                      {ins.map((s) => (
                        <option key={s.spec_key} value={s.spec_key}>
                          {specTitle(s, matName)}
                        </option>
                      ))}
                      {edge.target_input_spec_key && !ins.some((s) => s.spec_key === edge.target_input_spec_key) && (
                        <option value={edge.target_input_spec_key}>{edge.target_input_spec_key} (끝 단계에 없음)</option>
                      )}
                    </SelectField>
                  )}
                </>
              );
            })()}
          </fieldset>
          {edgeProblem(doc, edge.from_node_id, edge.to_node_id, edge.edge_kind ?? "material", edge.id) && (
            <Note>{edgeProblem(doc, edge.from_node_id, edge.to_node_id, edge.edge_kind ?? "material", edge.id)}</Note>
          )}
          <div>
            <Button onClick={() => setEdgeId(null)}>편집 닫기</Button>
          </div>
        </div>
      )}
    </Section>
  );
}
