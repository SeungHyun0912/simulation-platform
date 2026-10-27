import { useId, useMemo } from "react";
import type { KeyboardEvent } from "react";
import type { GraphDoc } from "./processDoc";
import { BOX, layoutGraph } from "./processGraph";
import { NODE_KIND_LABELS } from "./processView";
import styles from "./GraphDiagram.module.css";

type Props = {
  doc: GraphDoc;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  /** 완제품 판정 노드(종류 글자 옆에 표시) */
  completionId?: string | null;
  /** 오류가 있는 노드·간선 id(테두리를 굵게 표시) */
  errorIds?: ReadonlySet<string>;
  /** 강조할 노드(예: 같은 설비를 쓰는 단계). 테두리와 접근 가능한 이름으로 함께 알린다. */
  highlightIds?: ReadonlySet<string>;
  /** 도식의 접근 가능한 이름(한 화면에 도식이 여럿일 때 구분) */
  ariaLabel?: string;
  /** 범례를 숨긴다(한 화면에 도식이 여럿이면 범례는 한 번만 보인다) */
  hideLegend?: boolean;
  onSelectNode?: (id: string) => void;
  onSelectEdge?: (id: string) => void;
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * 공정 그래프 도식(읽기용). 왼쪽에서 오른쪽으로 흐르는 자동 배치이며 좌표는 저장하지 않는다.
 * 같은 내용이 아래 노드·간선 표에 모두 있으므로 도식은 구조를 한눈에 보는 보조 수단이다.
 * 종류는 색뿐 아니라 글자와 테두리 모양(대기 공간은 점선)으로 구분하고, 간선 종류는 선 모양으로 구분한다.
 */
export function GraphDiagram({ doc, selectedNodeId, selectedEdgeId, completionId, errorIds, highlightIds, ariaLabel, hideLegend, onSelectNode, onSelectEdge }: Props) {
  const layout = useMemo(() => layoutGraph(doc), [doc]);
  const markerId = useId();
  if (doc.nodes.length === 0) return null;
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));

  const key = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };

  return (
    <div>
      <div className={styles.wrap}>
        <svg
          className={styles.svg}
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="group"
          aria-label={ariaLabel ?? "공정 그래프 도식 (아래 노드·간선 표와 같은 내용)"}
        >
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrow} />
            </marker>
          </defs>
          {doc.edges.map((e) => {
            const a = layout.boxes.get(e.from_node_id);
            const b = layout.boxes.get(e.to_node_id);
            if (!a || !b) return null;
            const back = layout.backEdges.has(e.id);
            const x1 = back ? a.x + BOX.w / 2 : a.x + BOX.w;
            const y1 = back ? a.y : a.y + BOX.h / 2;
            const x2 = back ? b.x + BOX.w / 2 : b.x;
            const y2 = back ? b.y : b.y + BOX.h / 2;
            const dx = Math.max(24, Math.abs(x2 - x1) / 2);
            const d = back
              ? `M ${x1} ${y1} C ${x1} ${y1 - 40}, ${x2} ${y2 - 40}, ${x2} ${y2}`
              : `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
            const kind = e.edge_kind ?? "material";
            const sel = selectedEdgeId === e.id;
            return (
              <path
                key={e.id}
                d={d}
                markerEnd={`url(#${markerId})`}
                className={[styles.edge, styles[kind], back ? styles.back : "", sel ? styles.edgeSelected : ""].join(" ")}
                style={onSelectEdge ? { cursor: "pointer" } : undefined}
                onClick={() => onSelectEdge?.(e.id)}
              >
                <title>{`${byId.get(e.from_node_id)?.label ?? ""} → ${byId.get(e.to_node_id)?.label ?? ""}`}</title>
              </path>
            );
          })}
          {doc.nodes.map((n) => {
            const box = layout.boxes.get(n.id)!;
            const sel = selectedNodeId === n.id;
            const select = () => onSelectNode?.(n.id);
            return (
              <g
                key={n.id}
                role={onSelectNode ? "button" : undefined}
                tabIndex={onSelectNode ? 0 : undefined}
                aria-label={`${NODE_KIND_LABELS[n.kind]} ${n.label || n.node_key}${highlightIds?.has(n.id) ? " (강조)" : ""}${onSelectNode ? " 선택" : ""}`}
                aria-pressed={onSelectNode ? sel : undefined}
                className={[styles.node, styles[n.kind], sel ? styles.selected : "", errorIds?.has(n.id) ? styles.error : "", highlightIds?.has(n.id) ? styles.highlight : ""].join(" ")}
                transform={`translate(${box.x} ${box.y})`}
                onClick={select}
                onKeyDown={key(select)}
              >
                <rect width={BOX.w} height={BOX.h} rx={n.kind === "source" || n.kind === "sink" ? BOX.h / 2 : 6} />
                <text className={styles.kind} x={10} y={16}>
                  {NODE_KIND_LABELS[n.kind]}
                  {completionId === n.id ? " · 완제품" : ""}
                </text>
                <text className={styles.label} x={10} y={33}>
                  {clip(n.label || "(이름 없음)", 17)}
                </text>
                <title>{`${NODE_KIND_LABELS[n.kind]}: ${n.label} (${n.node_key})`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      {!hideLegend && (
      <ul className={styles.legend} aria-label="도식 범례">
        <li>실선: 물류</li>
        <li>파선: 선후 관계</li>
        <li>점선: 공급</li>
        <li>위로 휘는 곡선: 되돌아가는(순환) 연결</li>
        <li>점선 테두리 상자: 대기 공간</li>
      </ul>
      )}
    </div>
  );
}
