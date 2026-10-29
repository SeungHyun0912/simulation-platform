import type { Schemas } from "../../shared/api/types";

/**
 * 배치판 내용(계약 0.17.0 `LayoutContentIn`)의 화면 편집 모델. 좌표·크기는 서버처럼 decimal 문자열로 들고 다니며
 * 빈 문자열은 "모름"(null)이다 — 0과 다르다. 반올림(소수 첫째 자리)은 서버가 하고, 화면은 저장 응답 값으로 다시 그린다.
 * 좌표계: m, 원점은 도면 왼쪽 위, x 오른쪽·y 아래, 설비·공간의 x·y는 중심, 회전은 중심 기준 시계 방향 +.
 */
export type LayoutPoint = { key: string; x: string; y: string; attributes: Record<string, unknown> };
export type LayoutPlacement = {
  assetId: string;
  x: string;
  y: string;
  /** 빈 문자열 = 모름(null) */
  width: string;
  height: string;
  rotation: string;
  attributes: Record<string, unknown>;
};
export type LayoutPortPoint = { portId: string; pointKey: string };
export type LayoutRoute = {
  key: string;
  fromPortId: string;
  toPortId: string;
  /** 빈 문자열 = 정하지 않음(null) */
  mode: string;
  points: string[];
  attributes: Record<string, unknown>;
};
export type LayoutDoc = { points: LayoutPoint[]; placements: LayoutPlacement[]; portPoints: LayoutPortPoint[]; routes: LayoutRoute[] };

export const EMPTY_DOC: LayoutDoc = { points: [], placements: [], portPoints: [], routes: [] };

const s = (v: string | null | undefined) => (v === null || v === undefined ? "" : v);
const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

export function fromVersion(v: Schemas["LayoutVersionOut"]): LayoutDoc {
  return {
    points: v.points.map((p) => ({ key: p.point_key, x: p.x_m, y: p.y_m, attributes: p.attributes ?? {} })),
    placements: v.placements.map((p) => ({
      assetId: p.asset_id,
      x: p.x_m,
      y: p.y_m,
      width: s(p.width_m),
      height: s(p.height_m),
      rotation: s(p.rotation_deg),
      attributes: p.attributes ?? {},
    })),
    portPoints: v.port_points.map((m) => ({ portId: m.port_id, pointKey: m.point_key })),
    routes: v.routes.map((r) => ({
      key: r.route_key,
      fromPortId: r.from_port_id,
      toPortId: r.to_port_id,
      mode: s(r.mode),
      points: [...r.points],
      attributes: r.attributes ?? {},
    })),
  };
}

/** PUT /content 본문. 순서는 화면 목록 순서 그대로다(422 field_path가 이 순번을 가리킨다). */
export function toContentIn(d: LayoutDoc): Schemas["LayoutContentIn"] {
  return {
    points: d.points.map((p) => ({ point_key: p.key.trim(), x_m: p.x.trim(), y_m: p.y.trim(), attributes: p.attributes })),
    placements: d.placements.map((p) => ({
      asset_id: p.assetId,
      x_m: p.x.trim(),
      y_m: p.y.trim(),
      width_m: orNull(p.width),
      height_m: orNull(p.height),
      rotation_deg: orNull(p.rotation),
      attributes: p.attributes,
    })),
    port_points: d.portPoints.map((m) => ({ port_id: m.portId, point_key: m.pointKey })),
    routes: d.routes.map((r) => ({
      route_key: r.key.trim(),
      from_port_id: r.fromPortId,
      to_port_id: r.toPortId,
      mode: orNull(r.mode),
      points: r.points,
      attributes: r.attributes,
    })),
  };
}

export const sameContent = (a: LayoutDoc, b: LayoutDoc) => JSON.stringify(toContentIn(a)) === JSON.stringify(toContentIn(b));

/* ---------------- 편집 ---------------- */

const nextKey = (prefix: string, used: Iterable<string>) => {
  let max = 0;
  for (const k of used) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(k);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
};
export const nextPointKey = (d: LayoutDoc) => nextKey("P", d.points.map((p) => p.key));
export const nextRouteKey = (d: LayoutDoc) => nextKey("R", d.routes.map((r) => r.key));

/** 끌기·화살표 이동 값: 0 이상, 소수 첫째 자리(서버 정밀도와 같다). 사람이 입력한 값은 반올림하지 않고 서버에 맡긴다. */
export const coord = (n: number) => (Math.round(Math.max(0, n) * 10) / 10).toFixed(1);

export function addPoint(d: LayoutDoc, x: number, y: number): { doc: LayoutDoc; key: string } {
  const key = nextPointKey(d);
  return { doc: { ...d, points: [...d.points, { key, x: coord(x), y: coord(y), attributes: {} }] }, key };
}

export function patchPoint(d: LayoutDoc, key: string, patch: Partial<Pick<LayoutPoint, "x" | "y">>): LayoutDoc {
  return { ...d, points: d.points.map((p) => (p.key === key ? { ...p, ...patch } : p)) };
}

/** 점 key를 바꾸면 포트 매핑·경로가 가리키는 key도 함께 바꾼다. 이미 있는 key로는 바꾸지 않는다(null 반환). */
export function renamePoint(d: LayoutDoc, from: string, to: string): LayoutDoc | null {
  const next = to.trim();
  if (next === from) return d;
  if (next === "" || d.points.some((p) => p.key === next)) return null;
  const ren = (k: string) => (k === from ? next : k);
  return {
    points: d.points.map((p) => (p.key === from ? { ...p, key: next } : p)),
    placements: d.placements,
    portPoints: d.portPoints.map((m) => ({ ...m, pointKey: ren(m.pointKey) })),
    routes: d.routes.map((r) => ({ ...r, points: r.points.map(ren) })),
  };
}

/** 이 점을 쓰는 곳(삭제 전 확인용) */
export function pointUsage(d: LayoutDoc, key: string): { ports: number; routes: string[] } {
  return { ports: d.portPoints.filter((m) => m.pointKey === key).length, routes: d.routes.filter((r) => r.points.includes(key)).map((r) => r.key) };
}

/** 점 삭제: 그 점의 포트 매핑을 풀고 경로에서 빼며, 빠져서 연달아 같은 점이 되면 하나로 합친다. 점이 2개 미만이 된 경로는 검증에서 드러난다. */
export function removePoint(d: LayoutDoc, key: string): LayoutDoc {
  return {
    points: d.points.filter((p) => p.key !== key),
    placements: d.placements,
    portPoints: d.portPoints.filter((m) => m.pointKey !== key),
    routes: d.routes.map((r) => ({ ...r, points: collapse(r.points.filter((k) => k !== key)) })),
  };
}
const collapse = (ks: string[]) => ks.filter((k, i) => i === 0 || ks[i - 1] !== k);

export function addPlacement(d: LayoutDoc, assetId: string, x: number, y: number): LayoutDoc {
  if (d.placements.some((p) => p.assetId === assetId)) return d;
  return { ...d, placements: [...d.placements, { assetId, x: coord(x), y: coord(y), width: "", height: "", rotation: "", attributes: {} }] };
}
export function patchPlacement(d: LayoutDoc, assetId: string, patch: Partial<Omit<LayoutPlacement, "assetId" | "attributes">>): LayoutDoc {
  return { ...d, placements: d.placements.map((p) => (p.assetId === assetId ? { ...p, ...patch } : p)) };
}
export function removePlacement(d: LayoutDoc, assetId: string): LayoutDoc {
  return { ...d, placements: d.placements.filter((p) => p.assetId !== assetId) };
}

/** 포트 → 점 매핑(포트당 하나). pointKey가 빈 문자열이면 매핑을 푼다. */
export function mapPort(d: LayoutDoc, portId: string, pointKey: string): LayoutDoc {
  const rest = d.portPoints.filter((m) => m.portId !== portId);
  return { ...d, portPoints: pointKey ? [...rest, { portId, pointKey }] : rest };
}
export const pointOfPort = (d: LayoutDoc, portId: string) => d.portPoints.find((m) => m.portId === portId)?.pointKey ?? "";

export function upsertRoute(d: LayoutDoc, route: LayoutRoute, replaceKey?: string): LayoutDoc {
  const at = d.routes.findIndex((r) => r.key === (replaceKey ?? route.key));
  if (at < 0) return { ...d, routes: [...d.routes, route] };
  return { ...d, routes: d.routes.map((r, i) => (i === at ? route : r)) };
}
export function removeRoute(d: LayoutDoc, key: string): LayoutDoc {
  return { ...d, routes: d.routes.filter((r) => r.key !== key) };
}

/* ---------------- 경로 점 편집(참고: frontend/references/factory-labeler.html의 경로 도구) ---------------- */

/** 경로의 i번째 자리 앞에 점을 끼워 넣는다(구간 더블클릭). 연달아 같은 점이 되면 넣지 않는다. */
export function insertRoutePoint(d: LayoutDoc, routeKey: string, index: number, pointKey: string): LayoutDoc {
  return {
    ...d,
    routes: d.routes.map((r) => {
      if (r.key !== routeKey || r.points[index - 1] === pointKey || r.points[index] === pointKey) return r;
      return { ...r, points: [...r.points.slice(0, index), pointKey, ...r.points.slice(index)] };
    }),
  };
}

/** 경로에서 i번째 점을 뺀다(점 자체는 남는다). 빠져서 연달아 같은 점이 되면 합친다. */
export function removeRoutePointAt(d: LayoutDoc, routeKey: string, index: number): LayoutDoc {
  return { ...d, routes: d.routes.map((r) => (r.key === routeKey ? { ...r, points: collapse(r.points.filter((_, i) => i !== index)) } : r)) };
}

/** 어디에도 쓰이지 않는 점(포트 연결도 경로도 없음) */
export const unusedPoints = (d: LayoutDoc) => d.points.filter((p) => pointUsage(d, p.key).ports === 0 && pointUsage(d, p.key).routes.length === 0).map((p) => p.key);

export function removePoints(d: LayoutDoc, keys: Iterable<string>): LayoutDoc {
  let next = d;
  for (const k of keys) next = removePoint(next, k);
  return next;
}

/** (x, y)에서 maxDist(m) 안에 있는 가장 가까운 점 */
export function nearestPoint(d: LayoutDoc, x: number, y: number, maxDist: number): string | null {
  let best: string | null = null;
  let bestD = maxDist;
  for (const p of d.points) {
    const dist = Math.hypot(Number(p.x) - x, Number(p.y) - y);
    if (dist <= bestD) {
      best = p.key;
      bestD = dist;
    }
  }
  return best;
}

/* ---------------- 화면 쪽 입력 검사(서버 검사 전에 막을 것만) ---------------- */

const NUM = /^\d+(\.\d+)?$/;
export type DocErrors = Record<string, string>;

/**
 * 저장 전에 화면에서 잡는 것: 빈 key·중복 key, 숫자가 아닌 좌표·크기, 음수, 회전 범위. 오류 키는 `point:P1.x` 같은 대상.필드다.
 * 참조 규칙(없는 점·포트 등)과 승인 규칙은 서버(LAY-SAVE-*, LAY-*)가 판정한다.
 */
export function validateDoc(d: LayoutDoc): DocErrors {
  const e: DocErrors = {};
  const seen = new Set<string>();
  for (const p of d.points) {
    const t = `point:${p.key}`;
    if (!p.key.trim()) e[`${t}.key`] = "점 이름이 비었습니다.";
    else if (seen.has(p.key.trim())) e[`${t}.key`] = "같은 이름의 점이 있습니다.";
    seen.add(p.key.trim());
    if (!NUM.test(p.x.trim())) e[`${t}.x`] = "x는 0 이상의 숫자(m)입니다.";
    if (!NUM.test(p.y.trim())) e[`${t}.y`] = "y는 0 이상의 숫자(m)입니다.";
  }
  for (const p of d.placements) {
    const t = `placement:${p.assetId}`;
    if (!NUM.test(p.x.trim())) e[`${t}.x`] = "중심 x는 0 이상의 숫자(m)입니다.";
    if (!NUM.test(p.y.trim())) e[`${t}.y`] = "중심 y는 0 이상의 숫자(m)입니다.";
    for (const f of ["width", "height"] as const)
      if (p[f].trim() && (!NUM.test(p[f].trim()) || Number(p[f]) <= 0)) e[`${t}.${f}`] = `${f === "width" ? "가로" : "세로"}는 0보다 큰 숫자(m)이거나 비워 둡니다(모름).`;
    if (p.rotation.trim() && (!NUM.test(p.rotation.trim()) || Number(p.rotation) >= 360)) e[`${t}.rotation`] = "회전은 0 이상 360 미만(도)이거나 비워 둡니다(모름).";
  }
  const routeKeys = new Set<string>();
  for (const r of d.routes) {
    const t = `route:${r.key}`;
    if (!r.key.trim()) e[`${t}.key`] = "경로 이름이 비었습니다.";
    else if (routeKeys.has(r.key.trim())) e[`${t}.key`] = "같은 이름의 경로가 있습니다.";
    routeKeys.add(r.key.trim());
    if (r.points.length < 2) e[`${t}.points`] = "경로에는 점이 2개 이상 있어야 합니다.";
  }
  return e;
}

/* ---------------- 오류 위치 → 대상 ---------------- */

export type Target = `point:${string}` | `placement:${string}` | `port:${string}` | `route:${string}`;

/** 저장(PUT) 422의 field_path는 보낸 본문의 순번(JSON Pointer, 예: /routes/3/points/1)이다. 보낸 본문으로 대상을 찾는다. */
export function saveIssueTarget(path: string | undefined, sent: Schemas["LayoutContentIn"]): Target | null {
  const m = /^\/(points|placements|port_points|routes)\/(\d+)/.exec(path ?? "");
  if (!m) return null;
  const i = Number(m[2]);
  if (m[1] === "points") return sent.points?.[i] ? `point:${sent.points[i]!.point_key}` : null;
  if (m[1] === "placements") return sent.placements?.[i] ? `placement:${sent.placements[i]!.asset_id}` : null;
  if (m[1] === "port_points") return sent.port_points?.[i] ? `port:${sent.port_points[i]!.port_id}` : null;
  return sent.routes?.[i] ? `route:${sent.routes[i]!.route_key}` : null;
}

/** 검증(validate·approve)의 field_path는 key 경로다: /points/{key}, /placements/{asset_id}, /port_points/{port_id}, /routes/{key}. */
export function validationIssueTarget(path: string | undefined): Target | null {
  const m = /^\/(points|placements|port_points|routes)\/([^/]+)/.exec(path ?? "");
  if (!m) return null;
  const key = decodeURIComponent(m[2]!);
  const kind = { points: "point", placements: "placement", port_points: "port", routes: "route" }[m[1] as "points"];
  return `${kind}:${key}` as Target;
}

/* ---------------- 엑셀 붙여 넣기 ---------------- */

/** 탭(엑셀 복사)·쉼표로 나뉜 줄. 빈 줄은 버린다. */
export function parseRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (l.includes("\t") ? l.split("\t") : l.split(",")).map((c) => c.trim()));
}
const isHeader = (row: string[]) => row.some((c) => c !== "" && !NUM.test(c)) && !NUM.test(row[1] ?? "");

export type PasteResult = { doc: LayoutDoc; added: number; updated: number; errors: string[] };

/** 점 붙여 넣기: 열 = 이름, x, y. 같은 이름이 있으면 좌표를 바꾸고 없으면 추가한다. 첫 줄이 제목이면 건너뛴다. */
export function pastePoints(d: LayoutDoc, text: string): PasteResult {
  const rows = parseRows(text);
  if (rows[0] && isHeader(rows[0])) rows.shift();
  let doc = d;
  let added = 0;
  let updated = 0;
  const errors: string[] = [];
  rows.forEach((row, i) => {
    const [key = "", x = "", y = ""] = row;
    if (!key || !NUM.test(x) || !NUM.test(y)) return errors.push(`${i + 1}번째 줄: "이름, x, y"(x·y는 0 이상의 숫자)가 아닙니다.`);
    if (doc.points.some((p) => p.key === key)) {
      doc = patchPoint(doc, key, { x, y });
      updated++;
    } else {
      doc = { ...doc, points: [...doc.points, { key, x, y, attributes: {} }] };
      added++;
    }
  });
  return { doc, added, updated, errors };
}

/** 배치 붙여 넣기: 열 = 자산 코드, 중심 x, 중심 y, 가로, 세로, 회전(뒤 셋은 비우면 모름). 같은 자산이 있으면 바꾸고 없으면 추가한다. */
export function pastePlacements(d: LayoutDoc, text: string, assetIdByCode: ReadonlyMap<string, string>): PasteResult {
  const rows = parseRows(text);
  if (rows[0] && isHeader(rows[0])) rows.shift();
  let doc = d;
  let added = 0;
  let updated = 0;
  const errors: string[] = [];
  rows.forEach((row, i) => {
    const [code = "", x = "", y = "", width = "", height = "", rotation = ""] = row;
    const assetId = assetIdByCode.get(code);
    if (!assetId) return errors.push(`${i + 1}번째 줄: 이 프로젝트에 자산 코드 "${code}"가 없습니다.`);
    if (!NUM.test(x) || !NUM.test(y)) return errors.push(`${i + 1}번째 줄(${code}): 중심 x·y는 0 이상의 숫자입니다.`);
    const patch = { x, y, width, height, rotation };
    if (doc.placements.some((p) => p.assetId === assetId)) {
      doc = patchPlacement(doc, assetId, patch);
      updated++;
    } else {
      doc = { ...doc, placements: [...doc.placements, { assetId, attributes: {}, ...patch }] };
      added++;
    }
  });
  return { doc, added, updated, errors };
}

/* ---------------- 도면 범위·배경 ---------------- */

export type Background = { url: string; widthM: number; heightM: number };

/**
 * 배경 도면(`attributes.background = {url, width_px, height_px, m_per_px}`, 모두 선택). http(s) 주소만 쓴다.
 * 축척: m_per_px가 있으면 그 값, 없으면 도면 가로(m) ÷ width_px. 축척을 정할 수 없으면 깔지 않는다(격자만).
 */
export function backgroundOf(attributes: Record<string, unknown> | null | undefined, canvasWidthM: string | null | undefined): { bg: Background | null; reason: string | null } {
  const raw = attributes?.background;
  if (!raw || typeof raw !== "object") return { bg: null, reason: null };
  const b = raw as Record<string, unknown>;
  const url = typeof b.url === "string" ? b.url.trim() : "";
  if (!url) return { bg: null, reason: null };
  if (!/^https?:\/\//i.test(url)) return { bg: null, reason: "배경 도면 주소가 http(s)가 아니어서 깔지 않았습니다." };
  const wpx = Number(b.width_px);
  const hpx = Number(b.height_px);
  const mpp = Number(b.m_per_px);
  const scale = mpp > 0 ? mpp : wpx > 0 && Number(canvasWidthM) > 0 ? Number(canvasWidthM) / wpx : NaN;
  if (!(scale > 0) || !(wpx > 0) || !(hpx > 0)) return { bg: null, reason: "배경 도면의 픽셀 크기나 축척(m_per_px 또는 도면 가로)을 몰라 깔지 않았습니다." };
  return { bg: { url, widthM: wpx * scale, heightM: hpx * scale }, reason: null };
}

/** 그릴 범위(m): 도면 크기가 있으면 그것, 없으면 점·배치를 모두 담는 범위(+여백). */
export function extentOf(d: LayoutDoc, canvasW: string | null | undefined, canvasH: string | null | undefined, bg: Background | null): { w: number; h: number } {
  let w = Number(canvasW) > 0 ? Number(canvasW) : 0;
  let h = Number(canvasH) > 0 ? Number(canvasH) : 0;
  if (bg) {
    w = Math.max(w, bg.widthM);
    h = Math.max(h, bg.heightM);
  }
  if (Number(canvasW) > 0 && Number(canvasH) > 0) return { w, h };
  for (const p of d.points) {
    w = Math.max(w, Number(p.x) + 2);
    h = Math.max(h, Number(p.y) + 2);
  }
  for (const p of d.placements) {
    const r = Math.max(Number(p.width) || 1, Number(p.height) || 1);
    w = Math.max(w, Number(p.x) + r);
    h = Math.max(h, Number(p.y) + r);
  }
  return { w: Math.max(w, 10), h: Math.max(h, 10) };
}
