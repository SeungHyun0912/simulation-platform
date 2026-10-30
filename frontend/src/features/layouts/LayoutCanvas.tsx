import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactElement } from "react";
import type { Schemas } from "../../shared/api/types";
import { clampZoom, type Viewport } from "../processes/flowLayout";
import { coord, type Background, type LayoutDoc, type Target } from "./layoutDoc";
import styles from "./LayoutCanvas.module.css";

/** 확대 1일 때 1 m가 차지하는 화면 픽셀 */
export const PX_PER_M = 20;
const DRAG_THRESHOLD = 4;
/** 크기를 모르는 배치를 그릴 때 쓰는 표식 크기(m). 값이 아니라 표식이다. */
const UNKNOWN_SIZE_M = 1;

export type CanvasMode = "select" | "point" | "route" | "aisle";
/** 선을 그리는 모드(경로·통로): 클릭이 점을 잇는다 */
const drawing = (m: CanvasMode) => m === "route" || m === "aisle";

type Props = {
  doc: LayoutDoc;
  assetById: ReadonlyMap<string, Schemas["AssetOut"]>;
  portById: ReadonlyMap<string, { port: Schemas["PortOut"]; asset: Schemas["AssetOut"] }>;
  extent: { w: number; h: number };
  background: Background | null;
  viewport: Viewport;
  onViewportChange: (v: Viewport) => void;
  mode: CanvasMode;
  readOnly: boolean;
  selected: Target | null;
  errorTargets: ReadonlySet<string>;
  /** 그리는 중인 경로의 점 순서 */
  routeDraft: string[];
  onSelect: (t: Target | null) => void;
  onAddPoint: (x: number, y: number) => void;
  onRoutePoint: (key: string) => void;
  /** 경로 모드에서 빈 곳·배치를 눌렀을 때(m 좌표, 누른 배치). 점은 화면이 자동으로 만들거나 가까운 점을 쓴다. */
  onRouteClick: (x: number, y: number, placementId: string | null) => void;
  /** 경로 모드 더블클릭: 그리기 끝내기 */
  onRouteFinish: () => void;
  /** 선택 모드에서 경로·통로 구간 더블클릭: index 자리 앞에 (x, y) 점을 끼워 넣는다 */
  onInsertOnLine: (kind: "route" | "aisle", key: string, index: number, x: number, y: number) => void;
  /** 강조할 계산 경로(점 key 순서, /paths 결과) */
  highlight?: string[];
  /** 끌기를 시작할 때 한 번(되돌리기 기록용) */
  onEditStart: () => void;
  onMovePoint: (key: string, x: string, y: string) => void;
  onMovePlacement: (assetId: string, x: string, y: string) => void;
};

/** 점 p에서 선분 ab까지의 거리 */
function distSeg(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 자산 코드 글자가 차지하는 대략의 폭(px, --text-xs 기준). 사각형이 이보다 좁으면 글자를 숨긴다. */
const labelWidth = (code: string) => code.length * 7 + 6;

/** 격자 간격(m): 화면에서 24px 이상 벌어지는 가장 작은 값 */
function gridStep(k: number) {
  for (const s of [0.5, 1, 2, 5, 10, 20, 50, 100]) if (s * k >= 24) return s;
  return 200;
}

/**
 * 배치판 도면(SVG). 좌표계는 m·왼쪽 위 원점·y 아래(계약 0.17.0)로 화면 좌표와 방향이 같다. 배경 도면이 있으면 깔고 없으면 격자만 그린다.
 * 선택 모드: 점·배치를 끌어 옮기고(초안), 화살표 키로 0.1 m(Shift 1 m)씩 옮긴다. 점 추가 모드: 빈 곳을 누르면 점이 생긴다.
 * 경로 모드: 빈 곳을 누르면 그 자리에 점이 생기고(가까운 기존 점은 그 점을 씀), 설비·공간을 누르면 그 포트의 점으로 잇는다. 더블클릭으로 끝낸다.
 * 선택 모드에서 경로 선을 더블클릭하면 그 자리에 점을 끼워 넣는다. Ctrl+휠로 확대·축소, 빈 곳을 끌어 이동.
 */
export function LayoutCanvas(p: Props) {
  const { doc, viewport, onViewportChange } = p;
  const stageRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const vpRef = useRef(viewport);
  const suppressClick = useRef(false);
  const drag = useRef<
    | { kind: "pan"; sx: number; sy: number; vx: number; vy: number; moved: boolean }
    | { kind: "point" | "placement"; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
    | null
  >(null);
  const [panning, setPanning] = useState(false);
  /** 경로 모드에서 마우스 위치(m) — 마지막 점에서 이어지는 미리보기 선 */
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    vpRef.current = viewport;
  }, [viewport]);
  const k = PX_PER_M * viewport.zoom;
  const X = (m: number) => viewport.x + m * k;
  const Y = (m: number) => viewport.y + m * k;

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
      const r = zoom / v.zoom;
      onViewportChange({ zoom, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onViewportChange]);

  /** 화면 좌표 → m */
  function toWorld(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: (clientX - (rect?.left ?? 0) - viewport.x) / k, y: (clientY - (rect?.top ?? 0) - viewport.y) / k };
  }

  const isBg = (e: { target: EventTarget; currentTarget: EventTarget }) => e.target === e.currentTarget || (e.target as Element).getAttribute?.("data-bg") === "1";

  function onBgDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (!isBg(e)) return;
    drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: viewport.x, vy: viewport.y, moved: false };
    setPanning(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onItemDown(e: ReactPointerEvent<SVGGElement>, kind: "point" | "placement", id: string, x: string, y: string) {
    if (p.readOnly || p.mode !== "select" || (e.button !== undefined && e.button !== 0)) return;
    e.stopPropagation();
    drag.current = { kind, id, sx: e.clientX, sy: e.clientY, ox: Number(x), oy: Number(y), moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onMove(e: ReactPointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (drawing(p.mode) && p.routeDraft.length > 0 && !d) setHover(toWorld(e.clientX, e.clientY));
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved && d.kind !== "pan") p.onEditStart();
    d.moved = true;
    if (d.kind === "pan") onViewportChange({ ...viewport, x: d.vx + dx, y: d.vy + dy });
    else if (d.kind === "point") p.onMovePoint(d.id, coord(d.ox + dx / k), coord(d.oy + dy / k));
    else p.onMovePlacement(d.id, coord(d.ox + dx / k), coord(d.oy + dy / k));
  }
  function onUp() {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    if (d?.moved) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    }
  }
  function onBgClick(e: ReactMouseEvent<SVGSVGElement>) {
    if (suppressClick.current || !isBg(e)) return;
    if (p.mode === "point" && !p.readOnly) {
      const w = toWorld(e.clientX, e.clientY);
      p.onAddPoint(w.x, w.y);
    } else if (drawing(p.mode) && !p.readOnly) {
      const w = toWorld(e.clientX, e.clientY);
      p.onRouteClick(w.x, w.y, null);
    } else if (p.mode === "select") p.onSelect(null);
  }
  const clickItem = (fn: () => void) => () => {
    if (!suppressClick.current) fn();
  };
  function onItemKey(e: KeyboardEvent<SVGGElement>, select: () => void, move?: (dx: number, dy: number) => void) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select();
      return;
    }
    const s = e.shiftKey ? 1 : 0.1;
    const delta = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
    if (!delta || !move || p.readOnly) return;
    e.preventDefault();
    move(delta[0]!, delta[1]!);
  }

  const pointByKey = new Map(doc.points.map((pt) => [pt.key, pt]));
  const portsAt = new Map<string, string[]>();
  for (const m of doc.portPoints) {
    const info = p.portById.get(m.portId);
    const text = info ? `${info.asset.code} ${info.port.port_key}` : `포트 ${m.portId.slice(0, 8)}`;
    portsAt.set(m.pointKey, [...(portsAt.get(m.pointKey) ?? []), text]);
  }
  const step = gridStep(k);
  const lines: ReactElement[] = [];
  for (let gx = 0; gx <= p.extent.w + 1e-9; gx += step) lines.push(<line key={`x${gx}`} x1={X(gx)} y1={Y(0)} x2={X(gx)} y2={Y(p.extent.h)} className={styles.grid} />);
  for (let gy = 0; gy <= p.extent.h + 1e-9; gy += step) lines.push(<line key={`y${gy}`} x1={X(0)} y1={Y(gy)} x2={X(p.extent.w)} y2={Y(gy)} className={styles.grid} />);
  const polyline = (keys: string[]) =>
    keys
      .map((key) => pointByKey.get(key))
      .filter((pt): pt is NonNullable<typeof pt> => !!pt)
      .map((pt) => `${X(Number(pt.x))},${Y(Number(pt.y))}`)
      .join(" ");
  /** 선(경로·통로) 더블클릭: 가장 가까운 구간 앞자리에 점을 끼워 넣는다 */
  function insertOnLine(e: ReactMouseEvent, kind: "route" | "aisle", key: string, keys: string[]) {
    if (p.mode !== "select" || p.readOnly) return;
    e.stopPropagation();
    const w = toWorld(e.clientX, e.clientY);
    const pts = keys.map((k2) => pointByKey.get(k2)).map((pt) => (pt ? { x: Number(pt.x), y: Number(pt.y) } : null));
    let best = -1;
    let bestD = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (!a || !b) continue;
      const dist = distSeg(w, a, b);
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    }
    if (best > 0) p.onInsertOnLine(kind, key, best, w.x, w.y);
  }
  const cls = (base: string | undefined, t: Target) => [base, p.selected === t ? styles.selected : "", p.errorTargets.has(t) ? styles.error : ""].join(" ");

  return (
    <div className={styles.stage} ref={stageRef}>
      <svg
        ref={svgRef}
        className={[styles.svg, panning ? styles.panning : "", (p.mode === "point" || drawing(p.mode)) && !p.readOnly ? styles.crosshair : ""].join(" ")}
        role="group"
        aria-label={`배치판 도면(단위 m, 원점 왼쪽 위). ${p.mode === "point" ? "빈 곳을 누르면 점을 추가합니다." : p.mode === "route" ? "경로 그리기: 빈 곳을 누르면 점이 생기고, 기존 점·설비를 누르면 그곳으로 잇습니다. 더블클릭이나 Enter로 끝냅니다." : p.mode === "aisle" ? "통로 그리기: 빈 곳을 누르면 점이 생기고, 기존 점을 누르면 그 점을 함께 지나 갈림길이 됩니다. 더블클릭이나 Enter로 끝냅니다." : "점·배치를 끌거나 선택한 뒤 화살표 키로 옮깁니다."}`}
        onPointerDown={onBgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={onBgClick}
        onDoubleClick={(e) => {
          if (drawing(p.mode) && !p.readOnly) {
            e.preventDefault();
            p.onRouteFinish();
          }
        }}
        onPointerLeave={() => setHover(null)}
      >
        <rect data-bg="1" x="-100000" y="-100000" width="200000" height="200000" fill="transparent" />
        {p.background && (
          <image data-bg="1" href={p.background.url} x={X(0)} y={Y(0)} width={p.background.widthM * k} height={p.background.heightM * k} preserveAspectRatio="none" className={styles.background} />
        )}
        <g aria-hidden="true">{lines}</g>
        <rect data-bg="1" x={X(0)} y={Y(0)} width={p.extent.w * k} height={p.extent.h * k} className={styles.frame} />
        <text x={X(0) + 4} y={Y(0) - 6} className={styles.axis} aria-hidden="true">
          (0, 0) · 격자 {step} m
        </text>

        {/* 공간을 먼저, 설비를 위에 그린다(설비가 대기 공간 안에 놓인 실데이터: 예 CU 편조기 40대가 ST-013 안). 클릭도 위의 설비가 받는다. */}
        {[...doc.placements]
          .sort((a, b) => Number(p.assetById.get(a.assetId)?.kind === "equipment") - Number(p.assetById.get(b.assetId)?.kind === "equipment"))
          .map((pl) => {
          const a = p.assetById.get(pl.assetId);
          const unknown = !(Number(pl.width) > 0) || !(Number(pl.height) > 0);
          const w = (Number(pl.width) > 0 ? Number(pl.width) : UNKNOWN_SIZE_M) * k;
          const h = (Number(pl.height) > 0 ? Number(pl.height) : UNKNOWN_SIZE_M) * k;
          const t: Target = `placement:${pl.assetId}`;
          const name = a ? `${a.code} ${a.name}` : `자산 ${pl.assetId.slice(0, 8)}`;
          return (
            <g
              key={t}
              transform={`translate(${X(Number(pl.x))} ${Y(Number(pl.y))}) rotate(${Number(pl.rotation) || 0})`}
              className={cls([styles.placement, a?.kind === "equipment" ? styles.equipment : styles.space, unknown ? styles.unknownSize : ""].join(" "), t)}
              role="button"
              tabIndex={0}
              aria-pressed={p.selected === t}
              aria-label={`배치 ${name}${unknown ? " (크기 모름)" : ""}${pl.rotation.trim() === "" ? " (회전 모름)" : ""}${p.errorTargets.has(t) ? " (오류 있음)" : ""}`}
              onPointerDown={(e) => onItemDown(e, "placement", pl.assetId, pl.x, pl.y)}
              onClick={(e) => {
                if (suppressClick.current) return;
                if (drawing(p.mode) && !p.readOnly) {
                  const w = toWorld(e.clientX, e.clientY);
                  p.onRouteClick(w.x, w.y, pl.assetId);
                } else if (!drawing(p.mode)) p.onSelect(t);
              }}
              onKeyDown={(e) =>
                onItemKey(
                  e,
                  () => (drawing(p.mode) && !p.readOnly ? p.onRouteClick(Number(pl.x), Number(pl.y), pl.assetId) : p.onSelect(t)),
                  (dx, dy) => p.onMovePlacement(pl.assetId, coord(Number(pl.x) + dx), coord(Number(pl.y) + dy)),
                )
              }
            >
              <rect x={-w / 2} y={-h / 2} width={w} height={h} />
              {/* 크기 모름 표식은 작아서 글자는 표식 아래에 둔다(점 이름과 겹치지 않게). 사각형이 글자보다 작으면(축소 시) 글자를 숨기고
                  이름은 툴팁·접근성 이름·표로 본다 — 실데이터(설비 96대, 269.9 m)에서 전체 보기 때 글자가 겹쳤다. */}
              {(unknown || (w >= labelWidth(a?.code ?? "?") && h >= 12) || p.selected === t) && (
                <text y={unknown ? h / 2 + 28 : p.selected === t && !(w >= labelWidth(a?.code ?? "?") && h >= 12) ? -h / 2 - 6 : 4} textAnchor="middle" className={styles.label}>
                  {a?.code ?? "?"}
                </text>
              )}
              {unknown && (
                <text y={h / 2 + 40} textAnchor="middle" className={styles.portLabel}>
                  크기 모름
                </text>
              )}
              <title>{name}</title>
            </g>
          );
        })}

        {doc.aisles.map((a) => {
          const t: Target = `aisle:${a.key}`;
          const pts = polyline(a.points);
          const a0 = pointByKey.get(a.points[0] ?? "");
          const a1 = pointByKey.get(a.points[1] ?? "") ?? a0;
          const mid = a0 && a1 ? { x: (Number(a0.x) + Number(a1.x)) / 2, y: (Number(a0.y) + Number(a1.y)) / 2 } : null;
          return (
            <g key={t}>
              <polyline
                points={pts}
                className={styles.routeHit}
                role="button"
                tabIndex={0}
                aria-label={`통로 ${a.key}: ${a.points.join(" — ")}${p.errorTargets.has(t) ? " (오류 있음)" : ""}`}
                onClick={clickItem(() => !drawing(p.mode) && p.onSelect(t))}
                onDoubleClick={(e) => insertOnLine(e, "aisle", a.key, a.points)}
                onKeyDown={(e) => onItemKey(e as unknown as KeyboardEvent<SVGGElement>, () => p.onSelect(t))}
              />
              <polyline points={pts} className={cls(styles.aisle, t)} />
              {mid && (
                <text x={X(mid.x) + 6} y={Y(mid.y) + 14} className={styles.aisleText} aria-hidden="true">
                  {a.key}
                </text>
              )}
            </g>
          );
        })}
        {doc.routes.map((r) => {
          const t: Target = `route:${r.key}`;
          const pts = polyline(r.points);
          // 이름표는 첫 구간 가운데에 둔다(끝점의 점 이름·포트 글자와 겹치지 않게)
          const a0 = pointByKey.get(r.points[0] ?? "");
          const a1 = pointByKey.get(r.points[1] ?? "") ?? a0;
          const first = a0 && a1 ? { x: (Number(a0.x) + Number(a1.x)) / 2, y: (Number(a0.y) + Number(a1.y)) / 2 } : null;
          return (
            <g key={t}>
              <polyline
                points={pts}
                className={styles.routeHit}
                role="button"
                tabIndex={0}
                aria-label={`경로 ${r.key}${r.mode ? ` (${r.mode})` : ""}: ${r.points.join(" → ")}${p.errorTargets.has(t) ? " (오류 있음)" : ""}`}
                onClick={clickItem(() => !drawing(p.mode) && p.onSelect(t))}
                onDoubleClick={(e) => insertOnLine(e, "route", r.key, r.points)}
                onKeyDown={(e) => onItemKey(e as unknown as KeyboardEvent<SVGGElement>, () => p.onSelect(t))}
              />
              <polyline points={pts} className={cls(styles.route, t)} />
              {first && (
                <text x={X(first.x) + 6} y={Y(first.y) - 6} className={styles.routeText} aria-hidden="true">
                  {r.key}
                  {r.mode ? ` · ${r.mode}` : ""}
                </text>
              )}
            </g>
          );
        })}
        {p.highlight && p.highlight.length > 1 && <polyline points={polyline(p.highlight)} className={styles.pathHighlight} aria-label={`계산 경로 ${p.highlight.join(" → ")}`} role="img" />}
        {p.routeDraft.length > 0 && <polyline points={polyline(p.routeDraft)} className={p.mode === "aisle" ? styles.aisleDraft : styles.routeDraft} aria-hidden="true" />}
        {drawing(p.mode) && hover && pointByKey.get(p.routeDraft[p.routeDraft.length - 1] ?? "") && (
          <line
            x1={X(Number(pointByKey.get(p.routeDraft[p.routeDraft.length - 1]!)!.x))}
            y1={Y(Number(pointByKey.get(p.routeDraft[p.routeDraft.length - 1]!)!.y))}
            x2={X(hover.x)}
            y2={Y(hover.y)}
            className={styles.routeDraft}
            aria-hidden="true"
          />
        )}

        {doc.points.map((pt) => {
          const t: Target = `point:${pt.key}`;
          const inDraft = p.routeDraft.includes(pt.key);
          const ports = portsAt.get(pt.key) ?? [];
          return (
            <g
              key={t}
              transform={`translate(${X(Number(pt.x))} ${Y(Number(pt.y))})`}
              className={cls([styles.point, inDraft ? styles.inDraft : ""].join(" "), t)}
              role="button"
              tabIndex={0}
              aria-pressed={p.selected === t}
              aria-label={`점 ${pt.key} (${pt.x}, ${pt.y})${ports.length ? ` 포트 ${ports.join(", ")}` : ""}${p.errorTargets.has(t) ? " (오류 있음)" : ""}`}
              onPointerDown={(e) => onItemDown(e, "point", pt.key, pt.x, pt.y)}
              onClick={clickItem(() => (drawing(p.mode) ? p.onRoutePoint(pt.key) : p.onSelect(t)))}
              onKeyDown={(e) =>
                onItemKey(
                  e,
                  () => (drawing(p.mode) ? p.onRoutePoint(pt.key) : p.onSelect(t)),
                  (dx, dy) => p.onMovePoint(pt.key, coord(Number(pt.x) + dx), coord(Number(pt.y) + dy)),
                )
              }
            >
              <circle r={6} />
              <text x={9} y={-6} className={styles.pointLabel}>
                {pt.key}
              </text>
              {ports.length > 0 && (
                <text x={9} y={12} className={styles.portLabel}>
                  {ports.join(", ")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
