/* eslint-disable @typescript-eslint/no-explicit-any -- 가짜 서버가 임의 요청 본문을 검사한다 */
import type { Schemas } from "../src/shared/api/types";
import type { FakeRequest, FakeResponse, FakeState } from "./fakeApi";
import { measureError, type Helpers } from "./fakeProcess";

/**
 * 재료 가짜 서버(계약 0.3.0 `products-materials`의 규칙 일부). 실제 서버가 아니다. 응답은 생성 타입으로 선언한다.
 * 흉내 내는 규칙: 코드는 프로젝트 안에서 유일(409 MATERIAL_CODE_CONFLICT), `form`은 필수 자유 텍스트 1~100자,
 * `default_spec`은 길이·중량(decimal 문자열, 0 초과)·단위 수·가닥 수(JSON 정수, 1 이상)를 각각 {mode, value}로 받고
 * PATCH에서는 **보낸 필드만 교체**하며 빈 객체·null은 422, 수정에는 If-Match 필수(428/412), 조회자는 쓰기 403.
 */
type Material = Schemas["MaterialOut"];

const id = (n: number) => `mmmmmmmm-0000-4000-8000-${String(n).padStart(12, "0")}`;
const UNKNOWN = { mode: "unknown", value: null } as const;

export const unknownSpec = (): Material["default_spec"] => ({
  length_m: { ...UNKNOWN },
  weight_kg: { ...UNKNOWN },
  unit_count: { ...UNKNOWN },
  strand_count: { ...UNKNOWN },
});

export function materialOut(i: number): Material {
  const spec = unknownSpec();
  // M-001: 길이·중량 확정 / M-002: 길이 확정·단위 수 3·중량 해당 없음 / M-003: 모두 미정 / M-004: 가닥 수만 확정
  if (i === 1) {
    spec.length_m = { mode: "known", value: "3000" };
    spec.weight_kg = { mode: "known", value: "2000.500000" };
  } else if (i === 2) {
    spec.length_m = { mode: "known", value: "1000" };
    spec.unit_count = { mode: "known", value: 3 };
    spec.weight_kg = { mode: "not_applicable", value: null };
  } else if (i === 4) spec.strand_count = { mode: "known", value: 12 };
  return {
    id: id(i),
    project_id: "11111111-1111-4111-8111-111111111111",
    code: `M-${String(i).padStart(3, "0")}`,
    name: `서버 재료 ${i}`,
    form: i % 2 ? "릴" : "보빈",
    default_spec: spec,
    notes: i === 2 ? "보빈 3개 단위로 공급" : null,
    archived_at: i === 9 ? "2026-10-23T00:00:00Z" : null,
    created_at: "2026-10-23T00:00:00Z",
    updated_at: null,
    row_version: 1,
  };
}

export const materialIdOf = id;
export const seedMaterials = (): Material[] => Array.from({ length: 60 }, (_, i) => materialOut(i + 1));

const SPEC_FIELDS = ["length_m", "weight_kg", "unit_count", "strand_count"] as const;

const signature = (q: URLSearchParams) => JSON.stringify([q.get("q") ?? "", q.get("include_archived") ?? "", q.get("sort") ?? ""]);

function list(all: Material[], q: URLSearchParams, h: Helpers): FakeResponse {
  const needle = (q.get("q") ?? "").toLowerCase();
  const withArchived = q.get("include_archived") === "true";
  let items = all.filter((m) => (withArchived || !m.archived_at) && (!needle || m.code.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle)));
  const sort = q.get("sort") ?? "code";
  const desc = sort.startsWith("-");
  const key = sort.replace(/^-/, "") as "code" | "name";
  items = [...items].sort((a, b) => (desc ? -1 : 1) * a[key].localeCompare(b[key]) || a.id.localeCompare(b.id));
  const limit = Number(q.get("limit") ?? 50);
  let offset = 0;
  const cursor = q.get("cursor");
  if (cursor) {
    const [off, sig] = [cursor.split("|")[0]!, cursor.split("|").slice(1).join("|")];
    if (sig !== signature(q)) return h.errorBody(422, "INVALID_CURSOR", "cursor가 이 조건과 맞지 않습니다.", [{ message: "잘못된 cursor", field_path: "/cursor" }]);
    offset = Number(off);
  }
  const next = offset + limit < items.length ? `${offset + limit}|${signature(q)}` : null;
  return { status: 200, body: { data: items.slice(offset, offset + limit), page: { limit, next_cursor: next } } };
}

/** default_spec 검사(생성·수정 공통). 오류가 있으면 첫 422를 돌려준다. */
function specError(spec: any, path: string, patch: boolean): FakeResponse | null {
  if (spec === undefined) return null;
  if (spec === null || typeof spec !== "object" || (patch && Object.keys(spec).length === 0))
    return { status: 422, body: errEnv(path, "빈 객체·null은 보낼 수 없습니다.") };
  for (const [k, m] of Object.entries<any>(spec)) {
    if (!(SPEC_FIELDS as readonly string[]).includes(k)) return { status: 422, body: errEnv(`${path}/${k}`, "알 수 없는 키입니다.") };
    if (m === null) return { status: 422, body: errEnv(`${path}/${k}`, "필드를 null로 보낼 수 없습니다. 미정은 {mode: unknown}입니다.") };
    const e = measureError(m, `${path}/${k}`, k.endsWith("count") ? "count" : "decimal");
    if (e) return e;
  }
  return null;
}

const errEnv = (field_path: string, message: string) => ({
  error: { code: "VALIDATION_ERROR", message: "요청 형식이 올바르지 않습니다.", request_id: "req-test", details: [{ message, field_path, severity: "error" }] },
});

function inputError(b: any, creating: boolean, h: Helpers): FakeResponse | null {
  const allowed = ["code", "name", "form", "default_spec", "notes"];
  for (const k of Object.keys(b)) if (!allowed.includes(k)) return h.invalid(`/${k}`, "허용되지 않는 필드입니다.");
  if (creating) {
    for (const k of ["code", "name", "form"]) if (typeof b[k] !== "string" || b[k].trim() === "") return h.invalid(`/${k}`, "필요합니다.");
  } else {
    if (Object.keys(b).length === 0) return h.invalid("/", "변경할 필드가 없습니다.");
    for (const k of ["code", "name", "form"]) if (k in b && b[k] === null) return h.invalid(`/${k}`, `${k}은(는) null로 지울 수 없습니다.`);
  }
  for (const k of ["code", "name", "form", "notes"]) if (typeof b[k] === "string" && b[k].trim() === "") return h.invalid(`/${k}`, "비어 있을 수 없습니다.");
  if (typeof b.form === "string" && b.form.length > 100) return h.invalid("/form", "100자 이하여야 합니다.");
  return specError(b.default_spec, "/default_spec", !creating);
}

/** 표준 가짜 서버의 재료 경로. 해당하지 않으면 null. */
export function materialRoute(req: FakeRequest, state: FakeState, h: Helpers): FakeResponse | null {
  const m = /^\/projects\/([^/]+)\/materials(?:\/([^/]+))?$/.exec(req.path);
  if (!m) return null;
  if (m[1] !== h.project) return h.notFound();
  const materialId = m[2];

  if (req.method === "GET") {
    if (!materialId) return list(state.materials, req.query, h);
    const x = state.materials.find((y) => y.id === materialId);
    return x ? { status: 200, headers: h.etag(x.row_version), body: { data: x } } : h.notFound();
  }

  if (req.method === "POST" && !materialId) {
    if (state.role === "viewer") return h.forbidden();
    const b = req.body ?? {};
    const bad = inputError(b, true, h);
    if (bad) return bad;
    if (state.materials.some((y) => y.code === b.code.trim()))
      return h.errorBody(409, "MATERIAL_CODE_CONFLICT", "같은 프로젝트에 동일한 재료 코드가 있습니다.", [{ message: "이미 사용 중인 코드입니다.", field_path: "/code" }]);
    const created: Material = {
      id: id(1000 + state.materials.length + 1),
      project_id: h.project,
      code: b.code.trim(),
      name: b.name.trim(),
      form: b.form.trim(),
      default_spec: unknownSpec(),
      notes: b.notes ?? null,
      archived_at: null,
      created_at: "2026-10-26T02:00:00Z",
      updated_at: null,
      row_version: 1,
    };
    for (const [k, v] of Object.entries<any>(b.default_spec ?? {})) (created.default_spec as any)[k] = { mode: v.mode, value: v.value ?? null };
    state.materials.push(created);
    return { status: 201, headers: { ...h.etag(1), Location: `/api/v1/projects/${h.project}/materials/${created.id}` }, body: { data: created } };
  }

  if (req.method === "PATCH" && materialId) {
    const x = state.materials.find((y) => y.id === materialId);
    if (!x) return h.notFound();
    if (state.role === "viewer") return h.forbidden();
    const ifMatch = req.headers["If-Match"];
    if (ifMatch === undefined) return h.missingIfMatch();
    const b = req.body ?? {};
    const bad = inputError(b, false, h);
    if (bad) return bad;
    if (Number(String(ifMatch).replace(/"/g, "")) !== x.row_version) return h.staleVersion(x.row_version);
    if (b.code && state.materials.some((y) => y.id !== x.id && y.code === b.code.trim()))
      return h.errorBody(409, "MATERIAL_CODE_CONFLICT", "같은 프로젝트에 동일한 재료 코드가 있습니다.", [{ message: "이미 사용 중인 코드입니다.", field_path: "/code" }]);
    if (b.code) x.code = b.code.trim();
    if (b.name) x.name = b.name.trim();
    if (b.form) x.form = b.form.trim();
    if ("notes" in b) x.notes = b.notes;
    // 보낸 하위 필드만 교체하고 나머지는 유지한다
    for (const [k, v] of Object.entries<any>(b.default_spec ?? {})) (x.default_spec as any)[k] = { mode: v.mode, value: v.value ?? null };
    x.row_version += 1;
    x.updated_at = "2026-10-26T01:00:00Z";
    return { status: 200, headers: h.etag(x.row_version), body: { data: x } };
  }
  return null;
}
