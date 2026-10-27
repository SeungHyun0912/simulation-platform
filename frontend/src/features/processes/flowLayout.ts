import type { GraphDoc } from "./processDoc";
import { layoutGraph } from "./processGraph";

/** 플로우차트 노드 크기와 간격. 도식(GraphDiagram)보다 크게 그려 단계 요약을 한 줄 더 보인다. */
export const NODE = { w: 190, h: 64, gapX: 72, gapY: 32, pad: 24 } as const;

export type Point = { x: number; y: number };
export type Viewport = { x: number; y: number; zoom: number };
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 2;
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/**
 * 저장된 좌표가 없는 노드의 기본 위치: 도식과 같은 층 배치(`layoutGraph`)의 층·행을 플로우차트 크기로 옮긴다.
 * 좌표는 화면 전용이며 공정 내용이 아니다.
 */
export function defaultPositions(doc: GraphDoc): Map<string, Point> {
  const layout = layoutGraph(doc);
  const out = new Map<string, Point>();
  for (const [id, b] of layout.boxes) out.set(id, { x: NODE.pad + b.layer * (NODE.w + NODE.gapX), y: NODE.pad + b.row * (NODE.h + NODE.gapY) });
  return out;
}

/**
 * 화면에 쓸 좌표: 저장된 좌표가 있으면 그 값을, 없으면 기본 배치를 쓴다. 저장된 좌표 중 현재 그래프에 없는 노드는 버린다.
 * 서버 값을 임의로 만들어 채우지 않으며 저장된 값은 그대로 보존한다.
 */
export function effectivePositions(doc: GraphDoc, saved: Record<string, Point>, moved: ReadonlyMap<string, Point>): Map<string, Point> {
  const auto = defaultPositions(doc);
  const out = new Map<string, Point>();
  for (const n of doc.nodes) out.set(n.id, moved.get(n.id) ?? saved[n.id] ?? auto.get(n.id) ?? { x: NODE.pad, y: NODE.pad });
  return out;
}

/** 모든 노드가 보이도록 맞춘 화면 위치·배율(여백 포함). 노드가 없으면 기본 위치. */
export function fitViewport(positions: ReadonlyMap<string, Point>, size: { w: number; h: number }): Viewport {
  if (positions.size === 0 || size.w <= 0 || size.h <= 0) return { x: 0, y: 0, zoom: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + NODE.w);
    maxY = Math.max(maxY, p.y + NODE.h);
  }
  const pad = NODE.pad;
  const zoom = clampZoom(Math.min(size.w / (maxX - minX + pad * 2), size.h / (maxY - minY + pad * 2), 1));
  return { zoom, x: (size.w - (maxX - minX) * zoom) / 2 - minX * zoom, y: (size.h - (maxY - minY) * zoom) / 2 - minY * zoom };
}

/** 처음 열 때의 화면: 전체가 읽을 만한 배율(0.6 이상)로 들어오면 맞추고, 너무 길면 읽을 수 있는 배율로 왼쪽 위부터 보여 준다. */
export const START_ZOOM = 0.6;
export function startViewport(positions: ReadonlyMap<string, Point>, size: { w: number; h: number }): Viewport {
  const fit = fitViewport(positions, size);
  if (fit.zoom >= START_ZOOM || positions.size === 0) return fit;
  let minX = Infinity;
  let minY = Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
  }
  return { zoom: START_ZOOM, x: NODE.pad - minX * START_ZOOM, y: NODE.pad - minY * START_ZOOM };
}

/** 두 상자 사이의 곡선 간선 경로. 가로로 이어지면 오른쪽→왼쪽, 아니면 위·아래 변을 쓴다. */
export function edgePath(a: Point, b: Point): { d: string; mid: Point } {
  const ax = a.x;
  const ay = a.y;
  if (b.x >= ax + NODE.w - 8) {
    const x1 = ax + NODE.w;
    const y1 = ay + NODE.h / 2;
    const x2 = b.x;
    const y2 = b.y + NODE.h / 2;
    const dx = Math.max(32, Math.abs(x2 - x1) / 2);
    return { d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
  }
  const down = b.y >= ay;
  const x1 = ax + NODE.w / 2;
  const y1 = down ? ay + NODE.h : ay;
  const x2 = b.x + NODE.w / 2;
  const y2 = down ? b.y : b.y + NODE.h;
  const dy = Math.max(32, Math.abs(y2 - y1) / 2) * (down ? 1 : -1);
  return { d: `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`, mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
}

/** 화살표로 옮길 때의 간격(Shift는 크게). 키보드로도 배치를 바꿀 수 있게 한다. */
export const NUDGE = { small: 10, large: 50 } as const;

/** 좌표는 서버가 절댓값 1,000,000 이하 유한 JSON 숫자만 받는다(소수는 반올림해 보낸다). */
export const COORD_LIMIT = 1_000_000;
export function sanitizePosition(p: Point): Point {
  const c = (v: number) => Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, Math.round(Number.isFinite(v) ? v : 0)));
  return { x: c(p.x), y: c(p.y) };
}
