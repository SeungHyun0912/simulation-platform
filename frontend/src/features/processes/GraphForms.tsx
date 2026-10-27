import { Button } from "../../shared/components/Button";
import { SelectField, TextField } from "../../shared/components/Fields";
import { Note } from "../../shared/components/Layout";
import type { MaterialOptions } from "../materials/queries";
import { MeasureField } from "./MeasureField";
import {
  SPACE_KINDS,
  movementOf,
  specTitle,
  stepOf,
  type EdgeKind,
  type GraphDoc,
  type GraphEdge,
  type GraphNode,
  type MovementRule,
} from "./processDoc";
import { edgeProblem } from "./processGraph";
import { EDGE_KIND_LABELS, MOVEMENT_LABELS, NODE_KIND_LABELS } from "./processView";
import type { AssetOptions } from "./queries";
import type { GraphEditorApi } from "./GraphEditor";
import styles from "./ProcessEditorPage.module.css";

const EDGE_KINDS = Object.keys(EDGE_KIND_LABELS) as EdgeKind[];

/**
 * 공정 그래프의 노드(단계가 아닌 시작·대기 공간·합류·완료 기준·끝) 편집 양식. 그래프 구성 표와 플로우차트 패널이 같이 쓴다.
 * 작업(operation) 노드의 내용은 단계 편집 패널에서 고친다.
 */
export function NodeEditForm({
  node,
  editable,
  options,
  api,
  onClose,
}: {
  node: GraphNode;
  editable: boolean;
  options: AssetOptions;
  api: Pick<GraphEditorApi, "patchNode">;
  onClose: () => void;
}) {
  const assetCode = (id: string | null | undefined) => (id ? (options.byId.get(id)?.code ?? id.slice(0, 8)) : null);
  return (
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
            <Button onClick={onClose}>편집 닫기</Button>
          </div>
        </div>
  );
}

/** 간선 편집 양식(끝점·종류·이동 규칙·재료 연결). 그래프 구성 표와 플로우차트 패널이 같이 쓴다. */
export function EdgeEditForm({
  edge,
  doc,
  editable,
  materials,
  api,
  onClose,
}: {
  edge: GraphEdge;
  doc: GraphDoc;
  editable: boolean;
  materials: MaterialOptions;
  api: Pick<GraphEditorApi, "patchEdge">;
  onClose: () => void;
}) {
  const nodes = [...doc.nodes].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.node_key.localeCompare(b.node_key));
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));
  const nodeName = (id: string) => byId.get(id)?.label || byId.get(id)?.node_key || id.slice(0, 8);
  const edgeText = (e: GraphEdge) => `${nodeName(e.from_node_id)} → ${nodeName(e.to_node_id)}`;
  const nodeOption = (n: GraphNode) => (
    <option key={n.id} value={n.id}>
      {n.label || n.node_key} ({NODE_KIND_LABELS[n.kind]})
    </option>
  );
  return (
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
            <Button onClick={onClose}>편집 닫기</Button>
          </div>
        </div>
  );
}
