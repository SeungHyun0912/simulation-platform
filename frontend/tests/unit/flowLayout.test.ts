import {
  clampZoom,
  COORD_LIMIT,
  defaultPositions,
  edgePath,
  effectivePositions,
  fitViewport,
  NODE,
  sanitizePosition,
  startViewport,
  START_ZOOM,
  ZOOM_MAX,
  ZOOM_MIN,
  type Point,
} from "../../src/features/processes/flowLayout";
import type { GraphDoc } from "../../src/features/processes/processDoc";

const node = (id: string, key: string, kind: "source" | "operation" | "sink", order: number) =>
  ({ id, node_key: key, kind, label: key, asset_id: null, display_order: order, step: null }) as unknown as GraphDoc["nodes"][number];
const edge = (id: string, a: string, b: string) => ({ id, edge_key: id, from_node_id: a, to_node_id: b, edge_kind: "material" }) as unknown as GraphDoc["edges"][number];

const doc: GraphDoc = { nodes: [node("a", "src", "source", 0), node("b", "op", "operation", 1), node("c", "sink", "sink", 2)], edges: [edge("e1", "a", "b"), edge("e2", "b", "c")] };

describe("플로우차트 배치 도우미", () => {
  it("기본 배치는 층 순서대로 왼쪽에서 오른쪽으로 흐른다", () => {
    const p = defaultPositions(doc);
    expect(p.get("a")!.x).toBeLessThan(p.get("b")!.x);
    expect(p.get("b")!.x).toBeLessThan(p.get("c")!.x);
    expect(p.get("b")!.x - p.get("a")!.x).toBe(NODE.w + NODE.gapX);
  });

  it("화면 좌표 우선순위: 이번에 옮긴 값 > 서버에 저장된 값 > 기본 배치, 그래프에 없는 노드의 좌표는 버린다", () => {
    const auto = defaultPositions(doc);
    const saved: Record<string, Point> = { a: { x: 1, y: 2 }, b: { x: 3, y: 4 }, gone: { x: 9, y: 9 } };
    const moved = new Map<string, Point>([["a", { x: 100, y: 200 }]]);
    const eff = effectivePositions(doc, saved, moved);
    expect(eff.get("a")).toEqual({ x: 100, y: 200 });
    expect(eff.get("b")).toEqual({ x: 3, y: 4 });
    expect(eff.get("c")).toEqual(auto.get("c"));
    expect(eff.has("gone")).toBe(false);
    expect(eff.size).toBe(3);
  });

  it("전체 맞춤은 모든 노드가 화면 안에 들어오게 배율·위치를 정하고 배율은 한도 안이다", () => {
    const pos = defaultPositions(doc);
    const size = { w: 400, h: 300 };
    const v = fitViewport(pos, size);
    expect(v.zoom).toBeLessThanOrEqual(1);
    expect(v.zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
    for (const p of pos.values()) {
      expect(p.x * v.zoom + v.x).toBeGreaterThanOrEqual(-0.001);
      expect((p.x + NODE.w) * v.zoom + v.x).toBeLessThanOrEqual(size.w + 0.001);
      expect(p.y * v.zoom + v.y).toBeGreaterThanOrEqual(-0.001);
      expect((p.y + NODE.h) * v.zoom + v.y).toBeLessThanOrEqual(size.h + 0.001);
    }
    expect(fitViewport(new Map(), size)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(fitViewport(pos, { w: 0, h: 0 })).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("처음 화면: 읽을 만한 배율로 들어오면 맞추고, 너무 긴 공정은 읽을 수 있는 배율로 왼쪽 위부터 보인다", () => {
    expect(startViewport(defaultPositions(doc), { w: 1200, h: 500 }).zoom).toBeGreaterThanOrEqual(START_ZOOM);
    const long: Map<string, Point> = new Map(Array.from({ length: 30 }, (_, i) => [`n${i}`, { x: NODE.pad + i * (NODE.w + NODE.gapX), y: NODE.pad }]));
    const v = startViewport(long, { w: 800, h: 500 });
    expect(v.zoom).toBe(START_ZOOM);
    expect(v.x).toBeCloseTo(NODE.pad - NODE.pad * START_ZOOM);
  });

  it("확대·축소 배율은 한도로 자른다", () => {
    expect(clampZoom(100)).toBe(ZOOM_MAX);
    expect(clampZoom(0.0001)).toBe(ZOOM_MIN);
    expect(clampZoom(1)).toBe(1);
  });

  it("간선 경로: 오른쪽으로 이어지면 오른쪽 변→왼쪽 변, 뒤로 돌아가면 위·아래 변을 쓴다", () => {
    const fwd = edgePath({ x: 0, y: 0 }, { x: 300, y: 0 });
    expect(fwd.d.startsWith(`M ${NODE.w} ${NODE.h / 2}`)).toBe(true);
    expect(fwd.d.endsWith(`300 ${NODE.h / 2}`)).toBe(true);
    const back = edgePath({ x: 300, y: 0 }, { x: 0, y: 100 });
    expect(back.d.startsWith(`M ${300 + NODE.w / 2} ${NODE.h}`)).toBe(true); // 아래로 되돌아감
    const up = edgePath({ x: 300, y: 200 }, { x: 0, y: 0 });
    expect(up.d.startsWith(`M ${300 + NODE.w / 2} 200`)).toBe(true); // 위로 되돌아감
  });

  it("서버로 보낼 좌표는 정수로 반올림하고 한도(절댓값 1,000,000)로 자르며 유한수만 보낸다", () => {
    expect(sanitizePosition({ x: 10.6, y: -3.4 })).toEqual({ x: 11, y: -3 });
    expect(sanitizePosition({ x: 5_000_000, y: -5_000_000 })).toEqual({ x: COORD_LIMIT, y: -COORD_LIMIT });
    expect(sanitizePosition({ x: Number.NaN, y: Number.POSITIVE_INFINITY })).toEqual({ x: 0, y: 0 });
  });
});
