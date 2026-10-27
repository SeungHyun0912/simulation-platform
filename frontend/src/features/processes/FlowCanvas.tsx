import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type { GraphDoc, GraphNode } from "./processDoc";
import { clampZoom, edgePath, NODE, NUDGE, sanitizePosition, type Point, type Viewport } from "./flowLayout";
import { NODE_KIND_LABELS } from "./processView";
import styles from "./FlowCanvas.module.css";

type Props = {
  doc: GraphDoc;
  /** 모든 노드의 화면 좌표(저장된 값 또는 기본 배치) */
  positions: ReadonlyMap<string, Point>;
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  /** 완제품 판정 노드 */
  completionId?: string | null;
  /** 오류가 있는 노드·간선 id(테두리를 굵게) */
  errorIds?: ReadonlySet<string>;
  /** 간선 연결 모드에서 시작으로 고른 노드 */
  connectFromId?: string | null;
  /** 노드를 끌거나 화살표 키로 옮길 수 있는지(좌표 저장 권한). 공정 내용 수정 가능 여부와 별개다. */
  canArrange: boolean;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onSelectNone: () => void;
  onMoveNode: (id: string, p: Point) => void;
  /** 노드 아래 두 번째 줄에 보일 요약(작업 노드의 설비·처리 방식 등) */
  summaryOf?: (n: GraphNode) => string;
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const DRAG_THRESHOLD = 4;

/**
 * 공정 플로우차트 캔버스(SVG). 확대·축소(Ctrl+휠·버튼), 배경 끌어 이동, 노드 끌어 배치(좌표 저장 권한이 있을 때),
 * 선택한 노드를 화살표 키로 이동(끌기를 못 쓰는 사용자용), 간선·노드 선택을 제공한다.
 * 라이브러리 없이 구성하며(React Flow 제외 결정) 그래프 내용은 건드리지 않고 화면 좌표만 바꾼다.
 */
export function FlowCanvas({
  doc,
  positions,
  viewport,
  onViewportChange,
  selectedNodeId,
  selectedEdgeId,
  completionId,
  errorIds,
  connectFromId,
  canArrange,
  onSelectNode,
  onSelectEdge,
  onSelectNone,
  onMoveNode,
  summaryOf,
}: Props) {
  const markerId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<
    | { kind: "pan"; startX: number; startY: number; vx: number; vy: number; moved: boolean }
    | { kind: "node"; id: string; startX: number; startY: number; px: number; py: number; moved: boolean }
    | null
  >(null);
  const suppressClick = useRef(false);
  const vpRef = useRef(viewport);
  const [panning, setPanning] = useState(false);
  useEffect(() => {
    vpRef.current = viewport;
  }, [viewport]);
  const byId = new Map(doc.nodes.map((n) => [n.id, n]));

  // Ctrl/⌘ + 휠로 확대·축소(브라우저 확대와 겹치지 않도록 passive: false로 막는다)
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const v = vpRef.current;
      const zoom = clampZoom(v.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      const k = zoom / v.zoom;
      onViewportChange({ zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onViewportChange]);

  function onBackgroundDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.target !== e.currentTarget && (e.target as Element).getAttribute("data-bg") !== "1") return;
    drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, vx: viewport.x, vy: viewport.y, moved: false };
    setPanning(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onNodeDown(e: ReactPointerEvent<SVGGElement>, id: string) {
    if (e.button !== undefined && e.button !== 0) return;
    const p = positions.get(id);
    if (!p) return;
    e.stopPropagation();
    drag.current = { kind: "node", id, startX: e.clientX, startY: e.clientY, px: p.x, py: p.y, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onMove(e: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    if (d.kind === "pan") onViewportChange({ ...viewport, x: d.vx + dx, y: d.vy + dy });
    else if (canArrange) onMoveNode(d.id, sanitizePosition({ x: d.px + dx / viewport.zoom, y: d.py + dy / viewport.zoom }));
  }

  function onUp() {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    // 끌었으면 뒤따르는 click이 선택으로 처리되지 않게 한다
    if (d?.moved) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    }
  }

  const clicked = (fn: () => void) => () => {
    if (suppressClick.current) return;
    fn();
  };

  function onNodeKey(e: KeyboardEvent<SVGGElement>, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelectNode(id);
      return;
    }
    const step = e.shiftKey ? NUDGE.large : NUDGE.small;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    const p = positions.get(id);
    if (!delta || !p || !canArrange) return;
    e.preventDefault();
    onMoveNode(id, sanitizePosition({ x: p.x + delta[0]!, y: p.y + delta[1]! }));
  }

  if (doc.nodes.length === 0)
    return (
      <div className={styles.stage} ref={stageRef}>
        <svg className={styles.svg} role="group" aria-label="공정 플로우차트(노드 없음)">
          <text x="50%" y="50%" textAnchor="middle" className={styles.empty}>
            노드가 없습니다
          </text>
        </svg>
      </div>
    );

  return (
    <div className={styles.stage} ref={stageRef}>
      <svg
        className={[styles.svg, panning ? styles.panning : ""].join(" ")}
        role="group"
        aria-label="공정 플로우차트. 노드를 선택하면 오른쪽에서 수정합니다. 선택한 노드는 화살표 키로 옮길 수 있습니다."
        onPointerDown={onBackgroundDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={(e) => {
          if (e.target === e.currentTarget || (e.target as Element).getAttribute("data-bg") === "1") clicked(onSelectNone)();
        }}
      >
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrow} />
          </marker>
        </defs>
        <rect data-bg="1" x="-100000" y="-100000" width="200000" height="200000" fill="transparent" />
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.zoom})`}>
          {doc.edges.map((e) => {
            const a = positions.get(e.from_node_id);
            const b = positions.get(e.to_node_id);
            if (!a || !b) return null;
            const { d, mid } = edgePath(a, b);
            const kind = e.edge_kind ?? "material";
            const label = `${byId.get(e.from_node_id)?.label ?? ""} → ${byId.get(e.to_node_id)?.label ?? ""}`;
            const linked = !!(e.source_output_spec_key || e.target_input_spec_key);
            return (
              <g key={e.id}>
                <path
                  d={d}
                  className={styles.hit}
                  role="button"
                  tabIndex={0}
                  aria-label={`간선 ${label}`}
                  onClick={clicked(() => onSelectEdge(e.id))}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      onSelectEdge(e.id);
                    }
                  }}
                />
                <path
                  d={d}
                  markerEnd={`url(#${markerId})`}
                  className={[styles.edge, styles[kind], selectedEdgeId === e.id ? styles.edgeSelected : "", errorIds?.has(e.id) ? styles.edgeError : ""].join(" ")}
                />
                {(kind !== "material" || linked) && (
                  <text x={mid.x} y={mid.y - 6} textAnchor="middle" className={styles.edgeText}>
                    {kind === "precedence" ? "선후" : kind === "supply" ? "공급" : ""}
                    {linked ? " ⛓재료" : ""}
                  </text>
                )}
              </g>
            );
          })}
          {doc.nodes.map((n) => {
            const p = positions.get(n.id);
            if (!p) return null;
            const isCompletion = completionId === n.id;
            const cls = [
              styles.node,
              styles[n.kind],
              canArrange ? styles.arrangeable : "",
              selectedNodeId === n.id ? styles.selected : "",
              errorIds?.has(n.id) ? styles.error : "",
              connectFromId === n.id ? styles.connectSource : "",
            ].join(" ");
            const summary = summaryOf?.(n) ?? "";
            const name = n.label || n.node_key;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x} ${p.y})`}
                className={cls}
                role="button"
                tabIndex={0}
                aria-pressed={selectedNodeId === n.id}
                aria-label={`${NODE_KIND_LABELS[n.kind]} ${name}${isCompletion ? " (완제품 지정)" : ""}${errorIds?.has(n.id) ? " (오류 있음)" : ""}`}
                onPointerDown={(e) => onNodeDown(e, n.id)}
                onClick={clicked(() => onSelectNode(n.id))}
                onKeyDown={(e) => onNodeKey(e, n.id)}
              >
                <rect width={NODE.w} height={NODE.h} rx={n.kind === "operation" ? 6 : 22} />
                <text x={10} y={16} className={styles.kind}>
                  {NODE_KIND_LABELS[n.kind]}
                  {isCompletion ? " · ★완제품" : ""}
                </text>
                <text x={10} y={36} className={styles.label}>
                  {clip(name, 20)}
                </text>
                {summary && (
                  <text x={10} y={53} className={styles.summary}>
                    {clip(summary, 28)}
                  </text>
                )}
                <title>{summary ? `${name}\n${summary}` : name}</title>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
