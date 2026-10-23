import type { Schemas } from "../src/shared/api/types";

/**
 * 테스트용 가짜 API 서버. 실제 서버가 아니며 계약 0.2.0의 규칙 일부(응답 래퍼, cursor, 404 정책, 오류 envelope)를
 * 흉내 낸다. fixture는 생성된 계약 타입으로 선언해 계약과 어긋나면 타입 검사에서 실패한다.
 */
export const P1 = "11111111-1111-4111-8111-111111111111";
export const P2 = "22222222-2222-4222-8222-222222222222";
export const ORG_ADMIN = "33333333-3333-4333-8333-333333333333";
export const ORG_MEMBER = "44444444-4444-4444-8444-444444444444";

export const ME: Schemas["MeOut"] = {
  user: { id: "55555555-5555-4555-8555-555555555555", display_name: "서버 사용자" },
  organizations: [
    { id: ORG_ADMIN, code: "SRV-ORG", name: "서버 조직", role: "admin" },
    { id: ORG_MEMBER, code: "SRV-MEM", name: "구성원 조직", role: "member" },
  ],
  projects: [
    { id: P1, organization_id: ORG_ADMIN, code: "SRV-P1", name: "서버 프로젝트 1", role: "admin", status: "active" },
    { id: P2, organization_id: ORG_ADMIN, code: "SRV-P2", name: "서버 프로젝트 2", role: "viewer", status: "active" },
  ],
};

const uuid = (n: number, prefix = "a") => `${prefix.repeat(8)}-0000-4000-8000-${String(n).padStart(12, "0")}`;

export function assetOut(i: number): Schemas["AssetOut"] {
  const isEq = i <= 40;
  const base = {
    id: uuid(i),
    project_id: P1,
    sort_order: i * 10,
    external_ref: null,
    notes: null,
    archived_at: null,
    created_at: "2026-10-23T00:00:00Z",
    updated_at: null,
    row_version: 1,
    current_revision: null,
    latest_revision: null,
  };
  if (isEq)
    return {
      ...base,
      kind: "equipment",
      code: `EQ-${String(i).padStart(3, "0")}`,
      name: `서버 설비 ${i}`,
      equipment: { equipment_type: "extruder", model_name: i === 1 ? "EX-100" : null },
      space: null,
      ports: [
        { id: uuid(i, "b"), port_key: "IN", role: "IN", label: "IN" },
        { id: uuid(i, "c"), port_key: "OUT", role: "OUT", label: "OUT" },
      ],
      ...(i === 1
        ? {
            current_revision: { id: uuid(1, "d"), revision_no: 1, status: "approved", approved_at: "2026-10-23T00:00:00Z" },
            latest_revision: { id: uuid(2, "d"), revision_no: 2, status: "draft", approved_at: null },
            row_version: 2,
          }
        : {}),
    };
  return {
    ...base,
    kind: i % 2 ? "storage" : "dock",
    code: `ST-${String(i).padStart(3, "0")}`,
    name: `서버 공간 ${i}`,
    equipment: null,
    space: { space_type: "storage" },
    ports: [{ id: uuid(i, "b"), port_key: "ACCESS-01", role: "ACCESS", label: "접근" }],
  };
}

export const ASSETS: Schemas["AssetOut"][] = Array.from({ length: 60 }, (_, i) => assetOut(i + 1));

const finite = (value: string, unit: "item" | "kg" = "item"): Schemas["Capacity"] => ({
  mode: "finite",
  value,
  unit,
  status: "confirmed",
});

/** 자산 1의 버전: v2 초안(서버 issues 포함) + v1 승인본 */
export const REVISIONS_OF_ASSET_1: Schemas["AssetRevisionOut"][] = [
  {
    id: uuid(2, "d"),
    project_id: P1,
    asset_id: uuid(1),
    revision_no: 2,
    status: "draft",
    schema_version: "1.0",
    storage_capacity: null,
    ports: [
      {
        port_id: uuid(1, "b"),
        port_key: "IN",
        role: "IN",
        buffer_capacity: finite("4"),
        dispatch_rule: { mode: "when_destination_available", reservation: "unknown", wait_at_in_if_busy: true },
        release_rule: { mode: "when_destination_accepts", block_machine_while_waiting: "unknown" },
      },
      {
        port_id: uuid(1, "c"),
        port_key: "OUT",
        role: "OUT",
        buffer_capacity: { mode: "not_allowed", value: null, unit: null, status: "confirmed" },
        dispatch_rule: { mode: "unknown" },
        release_rule: { mode: "unknown" },
      },
    ],
    notes: null,
    issues: [
      {
        severity: "warning",
        rule_id: "VAL-POLICY-001",
        entity_id: uuid(2, "d"),
        field_path: "/ports/0/dispatch_rule/reservation",
        message: "서버가 알려 준 경고: 예약 여부가 미정입니다.",
        resolution: "예약 여부를 확정하세요.",
      },
    ],
    submitted_at: null,
    submitted_by: null,
    rejection_reason: null,
    rejected_at: null,
    approved_at: null,
    approved_by: null,
    created_at: "2026-10-23T00:00:00Z",
    updated_at: null,
    row_version: 2,
  },
  {
    id: uuid(1, "d"),
    project_id: P1,
    asset_id: uuid(1),
    revision_no: 1,
    status: "approved",
    schema_version: "1.0",
    storage_capacity: null,
    ports: [
      {
        port_id: uuid(1, "b"),
        port_key: "IN",
        role: "IN",
        buffer_capacity: finite("2"),
        dispatch_rule: { mode: "unknown" },
        release_rule: { mode: "unknown" },
      },
      {
        port_id: uuid(1, "c"),
        port_key: "OUT",
        role: "OUT",
        buffer_capacity: { mode: "unlimited", value: null, unit: null, status: "confirmed" },
        dispatch_rule: { mode: "unknown" },
        release_rule: { mode: "unknown" },
      },
    ],
    notes: null,
    issues: [],
    submitted_at: null,
    submitted_by: null,
    rejection_reason: null,
    rejected_at: null,
    approved_at: "2026-10-23T00:00:00Z",
    approved_by: null,
    created_at: "2026-10-23T00:00:00Z",
    updated_at: null,
    row_version: 3,
  },
];

export const PROJECTS_OUT: Schemas["ProjectOut"][] = [
  { id: P1, organization_id: ORG_ADMIN, code: "SRV-P1", name: "서버 프로젝트 1", timezone: "America/New_York", description: "서버 설명", status: "active", created_at: "2026-10-23T00:00:00Z", updated_at: null, row_version: 1 },
  { id: P2, organization_id: ORG_ADMIN, code: "SRV-P2", name: "서버 프로젝트 2", timezone: "UTC", description: null, status: "active", created_at: "2026-10-23T00:00:00Z", updated_at: null, row_version: 1 },
];

export type FakeRequest = {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  /** JSON 본문(없으면 undefined) */
  body?: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- 가짜 서버가 임의 본문을 검사한다
};
export type FakeResponse = { status: number; body?: unknown; headers?: Record<string, string> };

/** 가짜 서버의 가변 상태. 서버마다 새로 복제하므로 테스트끼리 영향을 주지 않는다. */
export type FakeState = { assets: Schemas["AssetOut"][] };
export const freshState = (): FakeState => ({ assets: structuredClone(ASSETS) });

export const errorBody = (status: number, code: string, message: string, details: unknown[] = []): FakeResponse => ({
  status,
  headers: { "X-Request-ID": "req-test" },
  body: { error: { code, message, request_id: "req-test", details } },
});

const notFound = () => errorBody(404, "NOT_FOUND", "찾을 수 없습니다.");
const invalid = (field_path: string, message: string) =>
  errorBody(422, "VALIDATION_ERROR", "요청 형식이 올바르지 않습니다.", [{ message, field_path }]);

/** 응답 파라미터 서명: cursor를 만든 조건과 다른 조건에서 쓰면 서버처럼 422 INVALID_CURSOR를 낸다. */
const signature = (q: URLSearchParams) => JSON.stringify([q.get("q") ?? "", q.get("kind") ?? "", q.get("sort") ?? ""]);

function listAssets(all: Schemas["AssetOut"][], q: URLSearchParams): FakeResponse {
  const needle = (q.get("q") ?? "").toLowerCase();
  const kind = q.get("kind");
  let items = all.filter(
    (a) => (!kind || a.kind === kind) && (!needle || a.code.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle)),
  );
  const sort = q.get("sort") ?? "sort_order";
  const desc = sort.startsWith("-");
  const key = sort.replace(/^-/, "") as "sort_order" | "code" | "name";
  items = [...items].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return desc ? -c : c;
  });
  const limit = Number(q.get("limit") ?? 50);
  let offset = 0;
  const cursor = q.get("cursor");
  if (cursor) {
    const [off, sig] = [cursor.split("|")[0]!, cursor.split("|").slice(1).join("|")];
    if (sig !== signature(q)) return errorBody(422, "INVALID_CURSOR", "cursor가 이 조건과 맞지 않습니다.", [{ message: "잘못된 cursor", field_path: "/cursor" }]);
    offset = Number(off);
  }
  const page = items.slice(offset, offset + limit);
  const next = offset + limit < items.length ? `${offset + limit}|${signature(q)}` : null;
  return { status: 200, body: { data: page, page: { limit, next_cursor: next } } };
}

const etag = (v: number) => ({ ETag: `"${v}"` });

/** PATCH 규칙(계약 0.2.0 AssetPatch): 허용 필드만, null 불가 필드, 빈 문자열 불가, If-Match 필수 */
function patchAsset(state: FakeState, req: FakeRequest, assetId: string): FakeResponse {
  const asset = state.assets.find((a) => a.id === assetId);
  if (!asset) return notFound();
  const ifMatch = req.headers["If-Match"];
  if (ifMatch === undefined) return errorBody(428, "PRECONDITION_REQUIRED", "If-Match 헤더가 필요합니다.", [{ message: "If-Match 필수", field_path: "/if-match" }]);
  const b = req.body ?? {};
  const allowed = ["code", "name", "sort_order", "external_ref", "notes", "equipment", "space"];
  for (const k of Object.keys(b)) if (!allowed.includes(k)) return invalid(`/${k}`, "허용되지 않는 필드입니다.");
  if (Object.keys(b).length === 0) return invalid("/", "변경할 필드가 없습니다.");
  for (const k of ["code", "name", "sort_order", "equipment", "space"]) if (k in b && b[k] === null) return invalid(`/${k}`, `${k}은(는) null로 지울 수 없습니다.`);
  for (const k of ["code", "name", "external_ref", "notes"]) if (typeof b[k] === "string" && b[k].trim() === "") return invalid(`/${k}`, "비어 있을 수 없습니다.");
  if (b.equipment && asset.kind !== "equipment") return invalid("/", "kind에 맞지 않는 상세입니다.");
  if (b.space && asset.kind === "equipment") return invalid("/", "kind에 맞지 않는 상세입니다.");
  if (b.equipment && typeof b.equipment.model_name === "string" && b.equipment.model_name === "") return invalid("/equipment/model_name", "비어 있을 수 없습니다.");
  if (Number(ifMatch.replace(/"/g, "")) !== asset.row_version)
    return errorBody(412, "EDIT_CONFLICT", "다른 곳에서 먼저 수정되었습니다.", [{ message: `현재 버전은 ${asset.row_version}입니다.`, field_path: "/row_version" }]);
  if (b.code && state.assets.some((a) => a.id !== asset.id && a.code === b.code.trim()))
    return errorBody(409, "ASSET_CODE_CONFLICT", "같은 프로젝트에 동일한 자산 코드가 있습니다.", [{ message: "이미 사용 중인 코드입니다.", field_path: "/code" }]);
  if (b.code) asset.code = b.code.trim();
  if (b.name) asset.name = b.name.trim();
  if ("sort_order" in b) asset.sort_order = b.sort_order;
  if ("external_ref" in b) asset.external_ref = b.external_ref;
  if ("notes" in b) asset.notes = b.notes;
  if (b.equipment && asset.equipment) {
    if (b.equipment.equipment_type) asset.equipment.equipment_type = b.equipment.equipment_type;
    if ("model_name" in b.equipment) asset.equipment.model_name = b.equipment.model_name;
  }
  if (b.space && asset.space && b.space.space_type) asset.space.space_type = b.space.space_type;
  asset.row_version += 1;
  asset.updated_at = "2026-10-23T01:00:00Z";
  return { status: 200, headers: etag(asset.row_version), body: { data: asset } };
}

/** POST 규칙(AssetCreate): kind별 상세 필수, 포트는 서버가 만든다, 코드 중복 409 */
function createAsset(state: FakeState, req: FakeRequest): FakeResponse {
  const b = req.body ?? {};
  if (!["equipment", "storage", "dock"].includes(b.kind)) return invalid("/kind", "kind가 올바르지 않습니다.");
  if (typeof b.code !== "string" || b.code.trim() === "") return invalid("/code", "코드가 필요합니다.");
  if (typeof b.name !== "string" || b.name.trim() === "") return invalid("/name", "이름이 필요합니다.");
  if ("ports" in b) return invalid("/ports", "포트는 보내지 않습니다.");
  for (const k of ["external_ref", "notes"]) if (typeof b[k] === "string" && b[k] === "") return invalid(`/${k}`, "비어 있을 수 없습니다.");
  if (b.kind === "equipment" && (!b.equipment || b.space)) return invalid("/", "kind=equipment는 equipment 객체만 필요합니다.");
  if (b.kind !== "equipment" && (!b.space || b.equipment)) return invalid("/", "kind에 맞는 space 객체만 필요합니다.");
  if (state.assets.some((a) => a.code === b.code.trim()))
    return errorBody(409, "ASSET_CODE_CONFLICT", "같은 프로젝트에 동일한 자산 코드가 있습니다.", [{ message: "이미 사용 중인 코드입니다.", field_path: "/code" }]);
  const n = state.assets.length + 1;
  const id = uuid(1000 + n, "e");
  const created: Schemas["AssetOut"] = {
    id,
    project_id: P1,
    kind: b.kind,
    code: b.code.trim(),
    name: b.name.trim(),
    sort_order: b.sort_order ?? 0,
    external_ref: b.external_ref ?? null,
    notes: b.notes ?? null,
    archived_at: null,
    equipment: b.equipment ? { equipment_type: b.equipment.equipment_type, model_name: b.equipment.model_name ?? null } : null,
    space: b.space ? { space_type: b.space.space_type } : null,
    ports:
      b.kind === "equipment"
        ? [
            { id: uuid(1000 + n, "f"), port_key: "IN", role: "IN", label: "IN" },
            { id: uuid(1000 + n, "9"), port_key: "OUT", role: "OUT", label: "OUT" },
          ]
        : [{ id: uuid(1000 + n, "f"), port_key: "ACCESS-01", role: "ACCESS", label: "접근" }],
    current_revision: null,
    latest_revision: null,
    created_at: "2026-10-23T02:00:00Z",
    updated_at: null,
    row_version: 1,
  };
  state.assets.push(created);
  return { status: 201, headers: { ...etag(1), Location: `/api/v1/projects/${P1}/assets/${id}` }, body: { data: created } };
}

/** 표준 가짜 서버: P1은 접근 가능(관리자), P2는 조회자, 그 밖의 프로젝트는 404(접근 불가와 없음을 구분하지 않음). */
export function standardHandler(req: FakeRequest, state: FakeState = freshState()): FakeResponse {
  const { method, path, query } = req;
  if (method === "GET" && path === "/me") return { status: 200, body: { data: ME } };
  if (method === "GET" && path === "/projects")
    return { status: 200, body: { data: PROJECTS_OUT, page: { limit: 50, next_cursor: null } } };
  const pm = /^\/projects\/([^/]+)$/.exec(path);
  if (pm && method === "GET") {
    const p = PROJECTS_OUT.find((x) => x.id === pm[1]);
    return p ? { status: 200, headers: etag(p.row_version), body: { data: p } } : notFound();
  }
  const m = /^\/projects\/([^/]+)\/assets(?:\/([^/]+)(\/revisions)?)?$/.exec(path);
  if (m) {
    const [, project, assetId, revisions] = m;
    if (project !== P1) return notFound(); // P2는 조회자 프로젝트이며 자산은 P1에만 있다. 그 밖은 접근 불가
    if (method === "GET") {
      if (!assetId) return listAssets(state.assets, query);
      const asset = state.assets.find((a) => a.id === assetId);
      if (!asset) return notFound();
      if (revisions)
        return {
          status: 200,
          body: { data: asset.id === uuid(1) ? REVISIONS_OF_ASSET_1 : [], page: { limit: 200, next_cursor: null } },
        };
      return { status: 200, headers: etag(asset.row_version), body: { data: asset } };
    }
    if (method === "PATCH" && assetId && !revisions) return patchAsset(state, req, assetId);
    if (method === "POST" && !assetId) return createAsset(state, req);
  }
  return notFound();
}

export type FakeServer = {
  fetchImpl: typeof fetch;
  requests: FakeRequest[];
  /** 서버의 가변 상태. 테스트에서 "다른 사용자가 먼저 수정함"을 만들 때 직접 바꾼다. */
  state: FakeState;
  /** 마지막으로 보낸 요청 중 경로가 맞는 것 */
  last: (pathPrefix: string) => FakeRequest | undefined;
  /** 메서드별 요청 */
  writes: () => FakeRequest[];
};

export function createFakeServer(
  handler?: (req: FakeRequest, standard: (req: FakeRequest) => FakeResponse) => FakeResponse | Promise<FakeResponse>,
): FakeServer {
  const state = freshState();
  const standard = (req: FakeRequest) => standardHandler(req, state);
  const requests: FakeRequest[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url, "http://fake.local");
    const req: FakeRequest = {
      method: (init.method ?? "GET").toUpperCase(),
      path: u.pathname.replace(/^\/api\/v1/, ""),
      query: u.searchParams,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(req);
    const r = await (handler ? handler(req, standard) : standard(req));
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json", ...(r.headers ?? {}) },
    });
  }) as unknown as typeof fetch;
  return {
    fetchImpl,
    requests,
    state,
    last: (prefix) => [...requests].reverse().find((r) => r.path.startsWith(prefix)),
    writes: () => requests.filter((r) => r.method !== "GET"),
  };
}