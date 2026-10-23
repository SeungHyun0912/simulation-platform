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
    { id: P1, organization_id: ORG_ADMIN, code: "SRV-P1", name: "서버 프로젝트 1", role: "admin" },
    { id: P2, organization_id: ORG_ADMIN, code: "SRV-P2", name: "서버 프로젝트 2", role: "viewer" },
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
};
export type FakeResponse = { status: number; body?: unknown; headers?: Record<string, string> };

export const errorBody = (status: number, code: string, message: string, details: unknown[] = []): FakeResponse => ({
  status,
  headers: { "X-Request-ID": "req-test" },
  body: { error: { code, message, request_id: "req-test", details } },
});

/** 응답 파라미터 서명: cursor를 만든 조건과 다른 조건에서 쓰면 서버처럼 422 INVALID_CURSOR를 낸다. */
const signature = (q: URLSearchParams) => JSON.stringify([q.get("q") ?? "", q.get("kind") ?? "", q.get("sort") ?? ""]);

function listAssets(q: URLSearchParams): FakeResponse {
  const needle = (q.get("q") ?? "").toLowerCase();
  const kind = q.get("kind");
  let items = ASSETS.filter(
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

/** 표준 가짜 서버: P1은 접근 가능(관리자), P2는 조회자, 그 밖의 프로젝트는 404(접근 불가와 없음을 구분하지 않음). */
export function standardHandler(req: FakeRequest): FakeResponse {
  const { method, path, query } = req;
  if (method === "GET" && path === "/me") return { status: 200, body: { data: ME } };
  if (method === "GET" && path === "/projects")
    return { status: 200, body: { data: PROJECTS_OUT, page: { limit: 50, next_cursor: null } } };
  const pm = /^\/projects\/([^/]+)$/.exec(path);
  if (pm && method === "GET") {
    const p = PROJECTS_OUT.find((x) => x.id === pm[1]);
    return p ? { status: 200, headers: { ETag: `"${p.row_version}"` }, body: { data: p } } : errorBody(404, "NOT_FOUND", "찾을 수 없습니다.");
  }
  const m = /^\/projects\/([^/]+)\/assets(?:\/([^/]+)(\/revisions)?)?$/.exec(path);
  if (m && method === "GET") {
    const [, project, assetId, revisions] = m;
    if (project !== P1 && project !== P2) return errorBody(404, "NOT_FOUND", "찾을 수 없습니다.");
    if (project === P2) return errorBody(404, "NOT_FOUND", "찾을 수 없습니다."); // 자산은 P1에만 있다
    if (!assetId) return listAssets(query);
    const asset = ASSETS.find((a) => a.id === assetId);
    if (!asset) return errorBody(404, "NOT_FOUND", "찾을 수 없습니다.");
    if (revisions)
      return {
        status: 200,
        body: {
          data: asset.id === uuid(1) ? REVISIONS_OF_ASSET_1 : [],
          page: { limit: 200, next_cursor: null },
        },
      };
    return { status: 200, headers: { ETag: `"${asset.row_version}"` }, body: { data: asset } };
  }
  return errorBody(404, "NOT_FOUND", "찾을 수 없습니다.");
}

export type FakeServer = {
  fetchImpl: typeof fetch;
  requests: FakeRequest[];
  /** 마지막으로 보낸 요청 중 경로가 맞는 것 */
  last: (pathPrefix: string) => FakeRequest | undefined;
};

export function createFakeServer(
  handler: (req: FakeRequest, standard: (req: FakeRequest) => FakeResponse) => FakeResponse | Promise<FakeResponse> = standardHandler,
): FakeServer {
  const requests: FakeRequest[] = [];
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url, "http://fake.local");
    const req: FakeRequest = {
      method: (init.method ?? "GET").toUpperCase(),
      path: u.pathname.replace(/^\/api\/v1/, ""),
      query: u.searchParams,
      headers: (init.headers ?? {}) as Record<string, string>,
    };
    requests.push(req);
    const r = await handler(req, standardHandler);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json", ...(r.headers ?? {}) },
    });
  }) as unknown as typeof fetch;
  return {
    fetchImpl,
    requests,
    last: (prefix) => [...requests].reverse().find((r) => r.path.startsWith(prefix)),
  };
}
