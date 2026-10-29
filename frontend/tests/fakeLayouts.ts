import type { Schemas } from "../src/shared/api/types";
import type { FakeRequest, FakeResponse, FakeState } from "./fakeApi";
import type { Helpers } from "./fakeProcess";

/**
 * 배치판 가짜 서버(계약 0.17.0). 서버 규칙의 핵심만 모델링한다: 초안만 수정(승인본 409), If-Match 428/412, 프로젝트당 초안 하나(409 LAYOUT_DRAFT_EXISTS),
 * 저장 때 구조 검사(422 LAY-SAVE-*, field_path = 본문 순번), 좌표·크기 소수 첫째 자리 반올림(ROUND_HALF_UP), 응답 정렬(점·경로 key 순, 배치 자산 코드 순),
 * 검증(LAY-*, field_path = key 경로), 승인은 관리자·오류 0일 때만(422 LAYOUT_VALIDATION_FAILED), 경로 길이 = 연속한 점 사이 직선 거리 합.
 * 자산은 fakeApi의 시드(EQ-001~040 설비: 포트 IN `b`·OUT `c`, ST-041~060 공간: 포트 ACCESS `b`)를 쓴다.
 */
export type LayoutState = { versions: Schemas["LayoutVersionOut"][] };

const id = (n: number, p: string) => `${p.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const layoutVersionId = (i: number) => id(i, "9");
export const assetId = (i: number) => id(i, "a");
export const inPort = (i: number) => id(i, "b");
export const outPort = (i: number) => id(i, "c");
const NOW = "2026-10-29T01:00:00Z";
const COORD = { unit: "m", origin: "top_left", x_axis: "right", y_axis: "down", anchor: "center", precision: "0.1" } as const;

/** ROUND_HALF_UP 소수 첫째 자리(문자열 십진 연산: "9.05" → "9.1") */
export function round1(v: string): string {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(v.trim());
  if (!m) return v;
  const int = BigInt(m[1]!);
  const frac = (m[2] ?? "").padEnd(2, "0");
  let tenths = int * 10n + BigInt(frac[0]!);
  if (Number(frac[1]) >= 5) tenths += 1n;
  return `${tenths / 10n}.${tenths % 10n}`;
}

function assetsOf(state: FakeState) {
  const ports = new Map<string, { port: Schemas["PortOut"]; asset: Schemas["AssetOut"] }>();
  for (const a of state.assets) for (const p of a.ports) ports.set(p.id, { port: p, asset: a });
  return { byId: new Map(state.assets.map((a) => [a.id, a])), ports };
}

/** 저장 형태(In) → 응답 형태(Out): 이름·코드를 붙이고 정렬하며 길이를 계산한다 */
function build(state: FakeState, base: Schemas["LayoutVersionOut"], c: Schemas["LayoutContentIn"]): Schemas["LayoutVersionOut"] {
  const { byId, ports } = assetsOf(state);
  const points = (c.points ?? []).map((p) => ({ point_key: p.point_key, x_m: round1(p.x_m), y_m: round1(p.y_m), attributes: p.attributes ?? {} })).sort((a, b) => a.point_key.localeCompare(b.point_key));
  const at = new Map(points.map((p) => [p.point_key, p]));
  const opt = (v: string | null | undefined) => (v === null || v === undefined ? null : round1(v));
  const placements = (c.placements ?? [])
    .map((p) => {
      const a = byId.get(p.asset_id)!;
      return { asset_id: p.asset_id, asset_code: a.code, asset_name: a.name, asset_kind: a.kind, x_m: round1(p.x_m), y_m: round1(p.y_m), width_m: opt(p.width_m), height_m: opt(p.height_m), rotation_deg: opt(p.rotation_deg), attributes: p.attributes ?? {} };
    })
    .sort((a, b) => a.asset_code.localeCompare(b.asset_code));
  const port_points = (c.port_points ?? [])
    .map((m) => {
      const info = ports.get(m.port_id)!;
      return { port_id: m.port_id, point_key: m.point_key, port_key: info.port.port_key, role: info.port.role, asset_id: info.asset.id, asset_code: info.asset.code };
    })
    .sort((a, b) => a.asset_code.localeCompare(b.asset_code) || a.role.localeCompare(b.role));
  const routes = (c.routes ?? [])
    .map((r) => {
      let len = 0;
      for (let i = 1; i < r.points.length; i++) {
        const a = at.get(r.points[i - 1]!)!;
        const b = at.get(r.points[i]!)!;
        len += Math.hypot(Number(b.x_m) - Number(a.x_m), Number(b.y_m) - Number(a.y_m));
      }
      return {
        route_key: r.route_key,
        from_port_id: r.from_port_id,
        to_port_id: r.to_port_id,
        from_asset_id: ports.get(r.from_port_id)!.asset.id,
        to_asset_id: ports.get(r.to_port_id)!.asset.id,
        mode: r.mode ?? null,
        points: [...r.points],
        length_m: (Math.round(len * 10) / 10).toFixed(1),
        attributes: r.attributes ?? {},
      };
    })
    .sort((a, b) => a.route_key.localeCompare(b.route_key));
  return { ...base, points, placements, port_points, routes };
}

const contentOf = (v: Schemas["LayoutVersionOut"]): Schemas["LayoutContentIn"] => ({
  points: v.points.map((p) => ({ point_key: p.point_key, x_m: p.x_m, y_m: p.y_m, attributes: p.attributes })),
  placements: v.placements.map((p) => ({ asset_id: p.asset_id, x_m: p.x_m, y_m: p.y_m, width_m: p.width_m, height_m: p.height_m, rotation_deg: p.rotation_deg, attributes: p.attributes })),
  port_points: v.port_points.map((m) => ({ port_id: m.port_id, point_key: m.point_key })),
  routes: v.routes.map((r) => ({ route_key: r.route_key, from_port_id: r.from_port_id, to_port_id: r.to_port_id, mode: r.mode, points: r.points, attributes: r.attributes })),
});

function header(i: number, status: "draft" | "approved", project: string): Schemas["LayoutVersionOut"] {
  return {
    id: layoutVersionId(i),
    project_id: project,
    version_no: i,
    status,
    name: i === 1 ? "1층 도면" : null,
    notes: null,
    canvas_width_m: "40.0",
    canvas_height_m: "20.0",
    coordinate_system: COORD,
    attributes: {},
    base_version_id: i === 1 ? null : layoutVersionId(i - 1),
    approved_at: status === "approved" ? NOW : null,
    approved_by: null,
    created_at: NOW,
    updated_at: null,
    row_version: 1,
    points: [],
    placements: [],
    port_points: [],
    routes: [],
  };
}

/** 시드: v1 승인본(EQ-001 OUT → P1, ST-041 ACCESS → P3, 경로 R1 = P1 → P2 → P3, 지게차) + v2 초안(v1 복사) */
export function seedLayouts(state: FakeState, project: string): LayoutState {
  const content: Schemas["LayoutContentIn"] = {
    points: [
      { point_key: "P1", x_m: "10.0", y_m: "5.0" },
      { point_key: "P2", x_m: "13.0", y_m: "9.0" },
      { point_key: "P3", x_m: "25.0", y_m: "9.0" },
    ],
    placements: [
      { asset_id: assetId(1), x_m: "8.0", y_m: "5.0", width_m: "4.0", height_m: "2.0", rotation_deg: "0.0" },
      { asset_id: assetId(41), x_m: "27.0", y_m: "9.0", width_m: null, height_m: null, rotation_deg: null },
    ],
    port_points: [
      { port_id: outPort(1), point_key: "P1" },
      { port_id: inPort(41), point_key: "P3" },
    ],
    routes: [{ route_key: "R1", from_port_id: outPort(1), to_port_id: inPort(41), mode: "forklift", points: ["P1", "P2", "P3"] }],
  };
  return { versions: [build(state, header(1, "approved", project), content), build(state, header(2, "draft", project), content)] };
}

type Issue = { rule_id: string; message: string; field_path: string; severity: "error" | "warning" };

function saveErrors(state: FakeState, c: Schemas["LayoutContentIn"]): Issue[] {
  const { byId, ports } = assetsOf(state);
  const out: Issue[] = [];
  const e = (rule: string, path: string, message: string) => out.push({ rule_id: `LAY-SAVE-${rule}`, field_path: path, message, severity: "error" });
  const keys = new Set<string>();
  (c.points ?? []).forEach((p, i) => {
    if (keys.has(p.point_key)) e("001", `/points/${i}/point_key`, `점 key ${p.point_key}이(가) 중복됩니다.`);
    keys.add(p.point_key);
  });
  const placed = new Set<string>();
  (c.placements ?? []).forEach((p, i) => {
    if (!byId.has(p.asset_id)) e("004", `/placements/${i}/asset_id`, "이 프로젝트에 없는 자산입니다.");
    if (placed.has(p.asset_id)) e("006", `/placements/${i}/asset_id`, "같은 자산을 두 번 배치했습니다.");
    placed.add(p.asset_id);
    for (const f of ["width_m", "height_m"] as const) if (p[f] !== null && p[f] !== undefined && round1(p[f]!) === "0.0") e("010", `/placements/${i}/${f}`, "반올림하면 0이 되는 크기입니다.");
  });
  const mapped = new Set<string>();
  (c.port_points ?? []).forEach((m, i) => {
    if (!ports.has(m.port_id)) e("005", `/port_points/${i}/port_id`, "이 프로젝트에 없는 포트입니다.");
    if (!keys.has(m.point_key)) e("003", `/port_points/${i}/point_key`, `없는 점 ${m.point_key}입니다.`);
    if (mapped.has(m.port_id)) e("007", `/port_points/${i}/port_id`, "포트를 두 점에 매핑했습니다.");
    mapped.add(m.port_id);
  });
  const rkeys = new Set<string>();
  (c.routes ?? []).forEach((r, i) => {
    if (rkeys.has(r.route_key)) e("002", `/routes/${i}/route_key`, `경로 key ${r.route_key}이(가) 중복됩니다.`);
    rkeys.add(r.route_key);
    if (!ports.has(r.from_port_id)) e("005", `/routes/${i}/from_port_id`, "이 프로젝트에 없는 포트입니다.");
    if (!ports.has(r.to_port_id)) e("005", `/routes/${i}/to_port_id`, "이 프로젝트에 없는 포트입니다.");
    if (r.points.length < 2) e("008", `/routes/${i}/points`, "경로 점이 2개 미만입니다.");
    r.points.forEach((k, j) => {
      if (!keys.has(k)) e("003", `/routes/${i}/points/${j}`, `없는 점 ${k}입니다.`);
      if (j > 0 && r.points[j - 1] === k) e("009", `/routes/${i}/points/${j}`, "연달아 같은 점입니다.");
    });
  });
  return out;
}

export function validateLayout(v: Schemas["LayoutVersionOut"]): Schemas["LayoutValidationOut"] {
  const issues: Issue[] = [];
  const pointOf = new Map(v.port_points.map((m) => [m.port_id, m.point_key]));
  const placed = new Set(v.placements.map((p) => p.asset_id));
  for (const r of v.routes) {
    const path = `/routes/${r.route_key}`;
    const fp = pointOf.get(r.from_port_id);
    const tp = pointOf.get(r.to_port_id);
    if (r.from_port_id === r.to_port_id) issues.push({ rule_id: "LAY-007", severity: "error", field_path: path, message: `경로 ${r.route_key}의 출발 포트와 도착 포트가 같습니다.` });
    if (!fp || !tp) issues.push({ rule_id: "LAY-003", severity: "error", field_path: path, message: `경로 ${r.route_key}의 출발·도착 포트가 점에 매핑되지 않았습니다.` });
    if (fp && r.points[0] !== fp) issues.push({ rule_id: "LAY-001", severity: "error", field_path: path, message: `경로 ${r.route_key}의 첫 점이 출발 포트의 점(${fp})이 아닙니다.` });
    if (tp && r.points[r.points.length - 1] !== tp) issues.push({ rule_id: "LAY-002", severity: "error", field_path: path, message: `경로 ${r.route_key}의 끝 점이 도착 포트의 점(${tp})이 아닙니다.` });
  }
  for (const m of v.port_points) if (!placed.has(m.asset_id)) issues.push({ rule_id: "LAY-004", severity: "warning", field_path: `/port_points/${m.port_id}`, message: `${m.asset_code} ${m.port_key} 포트를 매핑했지만 자산이 배치되지 않았습니다.` });
  const W = Number(v.canvas_width_m);
  const H = Number(v.canvas_height_m);
  if (W > 0 && H > 0)
    for (const p of v.points) if (Number(p.x_m) > W || Number(p.y_m) > H) issues.push({ rule_id: "LAY-005", severity: "warning", field_path: `/points/${p.point_key}`, message: `점 ${p.point_key}이(가) 도면 크기를 벗어났습니다.` });
  for (const p of v.placements) if (p.width_m === null || p.height_m === null) issues.push({ rule_id: "LAY-006", severity: "warning", field_path: `/placements/${p.asset_id}`, message: `${p.asset_code}의 가로·세로 크기를 모릅니다.` });
  const errors = issues.filter((i) => i.severity === "error").length;
  return { layout_version_id: v.id, approvable: errors === 0, error_count: errors, warning_count: issues.length - errors, issues };
}

export function layoutRoute(req: FakeRequest, state: FakeState, h: Helpers): FakeResponse | null {
  const m = new RegExp(`^/projects/${h.project}/layout-versions(?:/([^/]+)(?:/(content|validate|approve))?)?$`).exec(req.path);
  if (!m) return null;
  const L = state.layouts;
  const [, vid, action] = m;
  const viewer = state.role === "viewer";
  const ok = (v: Schemas["LayoutVersionOut"], status = 200): FakeResponse => ({ status, headers: h.etag(v.row_version), body: { data: v } });
  const ifMatch = () => {
    const raw = req.headers["If-Match"];
    return raw === undefined ? undefined : Number(String(raw).replace(/"/g, ""));
  };

  if (!vid) {
    if (req.method === "GET") {
      const items = [...L.versions]
        .sort((a, b) => b.version_no - a.version_no)
        .map((v) => ({ id: v.id, project_id: v.project_id, version_no: v.version_no, status: v.status, name: v.name, base_version_id: v.base_version_id, approved_at: v.approved_at, created_at: v.created_at, updated_at: v.updated_at, row_version: v.row_version }));
      return { status: 200, body: { data: items, page: { limit: 200, next_cursor: null } } };
    }
    if (req.method === "POST") {
      if (viewer) return h.forbidden();
      if (L.versions.some((v) => v.status === "draft")) return h.errorBody(409, "LAYOUT_DRAFT_EXISTS", "이미 열린 배치판 초안이 있습니다.", [{ message: "프로젝트당 초안은 하나입니다.", field_path: "/" }]);
      const from = (req.body as { from_version_id?: string } | undefined)?.from_version_id;
      const src = from ? L.versions.find((v) => v.id === from) : [...L.versions].filter((v) => v.status === "approved").sort((a, b) => b.version_no - a.version_no)[0];
      const n = Math.max(0, ...L.versions.map((v) => v.version_no)) + 1;
      const base = { ...header(n, "draft", h.project), name: src?.name ?? null, canvas_width_m: src?.canvas_width_m ?? null, canvas_height_m: src?.canvas_height_m ?? null, attributes: src?.attributes ?? {}, base_version_id: src?.id ?? null };
      const v = src ? build(state, base, contentOf(src)) : base;
      L.versions.push(v);
      return ok(v, 201);
    }
    return null;
  }
  const v = L.versions.find((x) => x.id === vid);
  if (!v) return h.notFound();
  if (!action && req.method === "GET") return ok(v);
  if (action === "validate" && req.method === "POST") return { status: 200, body: { data: validateLayout(v) } };

  // 쓰기
  if (viewer || (action === "approve" && state.role !== "admin")) return h.forbidden();
  const im = ifMatch();
  if (im === undefined) return h.missingIfMatch();
  if (v.status !== "draft") return h.errorBody(409, "VERSION_IMMUTABLE", "승인된 배치판은 수정할 수 없습니다.", [{ message: `현재 상태: ${v.status}`, field_path: "/status" }]);
  if (im !== v.row_version) return h.staleVersion(v.row_version);
  const replace = (next: Schemas["LayoutVersionOut"]) => {
    L.versions[L.versions.indexOf(v)] = next;
    return ok(next);
  };

  if (!action && req.method === "PATCH") {
    const b = (req.body ?? {}) as Schemas["LayoutVersionPatch"];
    const next = { ...v, row_version: v.row_version + 1, updated_at: NOW };
    if ("name" in b) next.name = b.name ?? null;
    if ("notes" in b) next.notes = b.notes ?? null;
    if ("canvas_width_m" in b) next.canvas_width_m = b.canvas_width_m == null ? null : round1(b.canvas_width_m);
    if ("canvas_height_m" in b) next.canvas_height_m = b.canvas_height_m == null ? null : round1(b.canvas_height_m);
    if ("attributes" in b) next.attributes = b.attributes ?? {};
    return replace(next);
  }
  if (action === "content" && req.method === "PUT") {
    const c = (req.body ?? {}) as Schemas["LayoutContentIn"];
    const errs = saveErrors(state, c);
    if (errs.length) return h.errorBody(422, "VALIDATION_ERROR", "배치판 내용이 올바르지 않습니다.", errs);
    return replace(build(state, { ...v, row_version: v.row_version + 1, updated_at: NOW }, c));
  }
  if (action === "approve" && req.method === "POST") {
    const r = validateLayout(v);
    if (!r.approvable) return h.errorBody(422, "LAYOUT_VALIDATION_FAILED", "검증 오류가 있어 승인할 수 없습니다.", r.issues.filter((i) => i.severity === "error"));
    return replace({ ...v, status: "approved", approved_at: NOW, row_version: v.row_version + 1 });
  }
  return null;
}
