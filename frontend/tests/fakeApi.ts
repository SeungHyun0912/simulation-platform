import type { Schemas } from "../src/shared/api/types";
import { materialRoute, seedMaterials } from "./fakeMaterials";
import { processProductId, processRoute, processSummaries, processVersionId, seedProcesses, type ProcessState } from "./fakeProcess";

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
    { id: P1, organization_id: ORG_ADMIN, code: "SRV-P1", name: "서버 프로젝트 1", role: "admin", status: "active", timezone: "America/New_York" },
    { id: P2, organization_id: ORG_ADMIN, code: "SRV-P2", name: "서버 프로젝트 2", role: "viewer", status: "active", timezone: "UTC" },
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
export function productOut(i: number): Schemas["ProductOut"] {
  return {
    id: processProductId(i),
    project_id: P1,
    code: `P-${String(i).padStart(3, "0")}`,
    name: `서버 제품 ${i}`,
    // 홀수는 규격 입력, 짝수는 미정(null)
    specification: i % 2 ? `규격 ${i}` : null,
    notes: null,
    archived_at: i === 9 ? "2026-10-23T00:00:00Z" : null,
    created_at: "2026-10-23T00:00:00Z",
    updated_at: null,
    row_version: 1,
    // 공정 시드(fakeProcess)와 같은 값. 서버처럼 응답마다 상태에서 다시 계산한다.
    current_process_version:
      i === 1 ? { id: processVersionId(1), version_no: 1, status: "approved", approved_at: "2026-10-20T00:00:00Z" } : null,
    latest_process_version:
      i === 1 ? { id: processVersionId(2), version_no: 2, status: "draft", approved_at: null } : null,
  };
}

export const PRODUCTS: Schemas["ProductOut"][] = Array.from({ length: 60 }, (_, i) => productOut(i + 1));

export type FakeState = {
  assets: Schemas["AssetOut"][];
  /** 제품. 테스트에서 "다른 사용자가 먼저 수정함"을 만들 때 직접 바꾼다. */
  products: Schemas["ProductOut"][];
  /** 모든 자산의 버전. 테스트에서 "다른 사용자가 먼저 수정함"을 만들 때 직접 바꾼다. */
  revisions: Schemas["AssetRevisionOut"][];
  /** 재료(fakeMaterials). 테스트에서 "다른 사용자가 먼저 수정함"을 만들 때 직접 바꾼다. */
  materials: Schemas["MaterialOut"][];
  /** 공정 버전·그래프(fakeProcess). 테스트에서 "다른 사용자가 먼저 수정함"을 만들 때 직접 바꾼다. */
  processes: ProcessState;
  /** 현재 요청자의 프로젝트 역할. editor/viewer는 승인·반려(admin 전용)나 쓰기에서 403을 받는다. */
  role: "admin" | "editor" | "viewer";
};
export const freshState = (): FakeState => ({
  assets: structuredClone(ASSETS),
  products: structuredClone(PRODUCTS),
  materials: seedMaterials(),
  processes: seedProcesses(),
  revisions: structuredClone(REVISIONS_OF_ASSET_1),
  role: "admin",
});

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

const forbidden = () => errorBody(403, "FORBIDDEN", "이 작업을 할 권한이 없습니다.");
const missingIfMatch = () =>
  errorBody(428, "PRECONDITION_REQUIRED", "If-Match 헤더가 필요합니다.", [{ message: "If-Match 필수", field_path: "/if-match" }]);
const staleVersion = (current: number) =>
  errorBody(412, "EDIT_CONFLICT", "다른 곳에서 먼저 수정되었습니다.", [{ message: `현재 버전은 ${current}입니다.`, field_path: "/row_version" }]);

/** 서버가 저장 시 다시 계산하는 검증 결과(단순화): 배출 규칙이 미정인 포트마다 경고 */
function revisionIssues(r: Schemas["AssetRevisionOut"]): Schemas["AssetRevisionOut"]["issues"] {
  return r.ports.flatMap((p, i) =>
    p.release_rule.mode === "unknown"
      ? [{ severity: "warning" as const, rule_id: "VAL-POLICY-002", entity_id: r.id, field_path: `/ports/${i}/release_rule`, message: `${p.role} 배출 규칙이 미정입니다.`, resolution: "배출 규칙을 확정하세요." }]
      : [],
  );
}

function summary(r: Schemas["AssetRevisionOut"]) {
  return { id: r.id, revision_no: r.revision_no, status: r.status, approved_at: r.approved_at };
}

/** 버전 상태가 바뀌면 자산의 current/latest 요약도 서버처럼 같이 바꾼다. */
function syncAsset(state: FakeState, assetId: string) {
  const asset = state.assets.find((a) => a.id === assetId);
  if (!asset) return;
  const mine = state.revisions.filter((r) => r.asset_id === assetId).sort((a, b) => b.revision_no - a.revision_no);
  const approved = mine.find((r) => r.status === "approved");
  asset.current_revision = approved ? summary(approved) : null;
  asset.latest_revision = mine[0] ? summary(mine[0]) : null;
}

function validCapacity(c: any, path: string): FakeResponse | null { // eslint-disable-line @typescript-eslint/no-explicit-any -- 요청 본문 검사
  if (!c || !["unknown", "finite", "unlimited", "not_allowed"].includes(c.mode)) return invalid(path, "용량 모드가 올바르지 않습니다.");
  if (c.mode === "finite") {
    if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(String(c.value)) || Number(c.value) <= 0) return invalid(`${path}/value`, "0보다 큰 값이어야 합니다.");
    if (!["item", "bobbin_slot", "pallet_slot", "kg", "m2"].includes(c.unit)) return invalid(`${path}/unit`, "용량에 쓸 수 없는 단위입니다.");
  } else if ("value" in c || "unit" in c) return invalid(path, "finite가 아니면 value·unit을 보낼 수 없습니다.");
  if ("status" in c) return invalid(`${path}/status`, "status는 서버가 계산합니다.");
  return null;
}

function toCapacityOut(c: any): Schemas["Capacity"] { // eslint-disable-line @typescript-eslint/no-explicit-any -- 요청 본문 변환
  return c.mode === "finite"
    ? { mode: "finite", value: c.value, unit: c.unit, status: "confirmed" }
    : { mode: c.mode, value: null, unit: null, status: c.mode === "unknown" ? "unknown" : "confirmed" };
}

function patchRevision(state: FakeState, req: FakeRequest, revisionId: string): FakeResponse {
  const rev = state.revisions.find((r) => r.id === revisionId);
  if (!rev) return notFound();
  if (state.role === "viewer") return forbidden();
  const ifMatch = req.headers["If-Match"];
  if (ifMatch === undefined) return missingIfMatch();
  if (rev.status !== "draft") return errorBody(409, "VERSION_IMMUTABLE", "초안이 아닌 버전은 수정할 수 없습니다.", [{ message: `현재 상태: ${rev.status}`, field_path: "/status" }]);
  if (Number(ifMatch.replace(/"/g, "")) !== rev.row_version) return staleVersion(rev.row_version);
  const b = req.body ?? {};
  for (const k of Object.keys(b)) if (!["storage_capacity", "ports", "notes"].includes(k)) return invalid(`/${k}`, "허용되지 않는 필드입니다.");
  if (Object.keys(b).length === 0) return invalid("/", "변경할 필드가 없습니다.");
  if (b.storage_capacity) {
    const e = validCapacity(b.storage_capacity, "/storage_capacity");
    if (e) return e;
  }
  for (const [i, p] of (b.ports ?? []).entries()) {
    const target = rev.ports.find((x) => x.port_id === p.port_id);
    if (!target) return invalid(`/ports/${i}/port_id`, "이 버전에 없는 포트입니다.");
    if (p.buffer_capacity) {
      const e = validCapacity(p.buffer_capacity, `/ports/${i}/buffer_capacity`);
      if (e) return e;
    }
    if (p.dispatch_rule && !["unknown", "when_destination_available"].includes(p.dispatch_rule.mode)) return invalid(`/ports/${i}/dispatch_rule/mode`, "알 수 없는 이동 규칙입니다.");
    if (p.release_rule && !["unknown", "when_destination_accepts"].includes(p.release_rule.mode)) return invalid(`/ports/${i}/release_rule/mode`, "알 수 없는 배출 규칙입니다.");
  }
  if (b.storage_capacity) rev.storage_capacity = toCapacityOut(b.storage_capacity);
  for (const p of b.ports ?? []) {
    const target = rev.ports.find((x) => x.port_id === p.port_id)!;
    if (p.buffer_capacity) target.buffer_capacity = toCapacityOut(p.buffer_capacity);
    if (p.dispatch_rule) target.dispatch_rule = p.dispatch_rule;
    if (p.release_rule) target.release_rule = p.release_rule;
  }
  rev.issues = revisionIssues(rev);
  rev.row_version += 1;
  rev.updated_at = "2026-10-23T01:00:00Z";
  return { status: 200, headers: etag(rev.row_version), body: { data: rev } };
}

/** 전이 규칙: submit draft→in_review(edit 권한), approve in_review→approved(admin), reject in_review→draft(admin, 사유 필수) */
function transitionRevision(state: FakeState, req: FakeRequest, revisionId: string, action: string): FakeResponse {
  const rev = state.revisions.find((r) => r.id === revisionId);
  if (!rev) return notFound();
  if (state.role === "viewer" || (action !== "submit" && state.role !== "admin")) return forbidden();
  const ifMatch = req.headers["If-Match"];
  if (ifMatch === undefined) return missingIfMatch();
  const from = action === "submit" ? "draft" : "in_review";
  if (rev.status !== from) return errorBody(409, "INVALID_STATE_TRANSITION", "이 상태에서는 할 수 없는 작업입니다.", [{ message: `현재 상태: ${rev.status}`, field_path: "/status" }]);
  if (Number(ifMatch.replace(/"/g, "")) !== rev.row_version) return staleVersion(rev.row_version);
  if (action === "reject") {
    const reason = req.body?.reason;
    if (typeof reason !== "string" || reason.trim() === "" || reason.length > 1000) return invalid("/reason", "사유는 1~1000자여야 합니다.");
    rev.rejection_reason = reason;
    rev.rejected_at = "2026-10-23T03:00:00Z";
    rev.status = "draft";
  } else if (action === "submit") {
    rev.status = "in_review";
    rev.submitted_at = "2026-10-23T03:00:00Z";
  } else {
    for (const o of state.revisions) if (o.asset_id === rev.asset_id && o.status === "approved") o.status = "superseded";
    rev.status = "approved";
    rev.approved_at = "2026-10-23T03:00:00Z";
  }
  rev.row_version += 1;
  syncAsset(state, rev.asset_id);
  return { status: 200, headers: etag(rev.row_version), body: { data: rev } };
}

/** 새 초안: 열린 버전이 있으면 409 REVISION_DRAFT_EXISTS. 승인본(없으면 미정)의 값으로 시작한다. */
function createRevision(state: FakeState, assetId: string): FakeResponse {
  const asset = state.assets.find((a) => a.id === assetId);
  if (!asset) return notFound();
  if (state.role === "viewer") return forbidden();
  const mine = state.revisions.filter((r) => r.asset_id === assetId);
  if (mine.some((r) => r.status === "draft" || r.status === "in_review"))
    return errorBody(409, "REVISION_DRAFT_EXISTS", "이미 열린 버전이 있습니다.", [{ message: "자산당 열린 버전은 하나입니다.", field_path: "/" }]);
  const approved = mine.find((r) => r.status === "approved");
  const unknownCap: Schemas["Capacity"] = { mode: "unknown", value: null, unit: null, status: "unknown" };
  const n = Math.max(0, ...mine.map((r) => r.revision_no)) + 1;
  const rev: Schemas["AssetRevisionOut"] = {
    id: uuid(500 + state.revisions.length, "d"),
    project_id: P1,
    asset_id: assetId,
    revision_no: n,
    status: "draft",
    schema_version: "1.0",
    storage_capacity: approved ? structuredClone(approved.storage_capacity) : asset.kind === "equipment" ? null : unknownCap,
    ports: approved
      ? structuredClone(approved.ports)
      : asset.kind === "equipment"
        ? asset.ports.map((p) => ({ port_id: p.id, port_key: p.port_key, role: p.role as "IN" | "OUT", buffer_capacity: unknownCap, dispatch_rule: { mode: "unknown" as const }, release_rule: { mode: "unknown" as const } }))
        : [],
    notes: null,
    issues: [],
    submitted_at: null,
    submitted_by: null,
    rejection_reason: null,
    rejected_at: null,
    approved_at: null,
    approved_by: null,
    created_at: "2026-10-23T04:00:00Z",
    updated_at: null,
    row_version: 1,
  };
  rev.issues = revisionIssues(rev);
  state.revisions.push(rev);
  syncAsset(state, assetId);
  return { status: 201, headers: etag(1), body: { data: rev } };
}

const productSignature = (q: URLSearchParams) =>
  JSON.stringify([q.get("q") ?? "", q.get("include_archived") ?? "", q.get("sort") ?? ""]);

/** 제품 응답의 공정 요약은 서버처럼 공정 버전 상태에서 다시 계산한다. */
const withSummaries = (state: FakeState, p: Schemas["ProductOut"]): Schemas["ProductOut"] => ({ ...p, ...processSummaries(state, p.id) });

/** 목록 규칙(계약 0.3.0): q 부분 일치, include_archived 기본 false, sort code|name(기본 code), cursor는 조건 서명을 가진다. */
function listProducts(all: Schemas["ProductOut"][], q: URLSearchParams): FakeResponse {
  const needle = (q.get("q") ?? "").toLowerCase();
  const withArchived = q.get("include_archived") === "true";
  let items = all.filter(
    (p) => (withArchived || !p.archived_at) && (!needle || p.code.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)),
  );
  const sort = q.get("sort") ?? "code";
  const desc = sort.startsWith("-");
  const key = sort.replace(/^-/, "") as "code" | "name";
  items = [...items].sort((a, b) => (desc ? -1 : 1) * a[key].localeCompare(b[key]) || a.id.localeCompare(b.id));
  const limit = Number(q.get("limit") ?? 50);
  let offset = 0;
  const cursor = q.get("cursor");
  if (cursor) {
    const [off, sig] = [cursor.split("|")[0]!, cursor.split("|").slice(1).join("|")];
    if (sig !== productSignature(q)) return errorBody(422, "INVALID_CURSOR", "cursor가 이 조건과 맞지 않습니다.", [{ message: "잘못된 cursor", field_path: "/cursor" }]);
    offset = Number(off);
  }
  const page = items.slice(offset, offset + limit);
  const next = offset + limit < items.length ? `${offset + limit}|${productSignature(q)}` : null;
  return { status: 200, body: { data: page, page: { limit, next_cursor: next } } };
}

/** 제품 입력 검사(생성·수정 공통): 빈 문자열 금지, 길이 제한, code·name은 null 불가 */
function productInputError(b: any, creating: boolean): FakeResponse | null { // eslint-disable-line @typescript-eslint/no-explicit-any -- 요청 본문 검사
  const allowed = ["code", "name", "specification", "notes"];
  for (const k of Object.keys(b)) if (!allowed.includes(k)) return invalid(`/${k}`, "허용되지 않는 필드입니다.");
  if (creating) {
    if (typeof b.code !== "string" || b.code.trim() === "") return invalid("/code", "코드가 필요합니다.");
    if (typeof b.name !== "string" || b.name.trim() === "") return invalid("/name", "이름이 필요합니다.");
  } else {
    if (Object.keys(b).length === 0) return invalid("/", "변경할 필드가 없습니다.");
    for (const k of ["code", "name"]) if (k in b && b[k] === null) return invalid(`/${k}`, `${k}은(는) null로 지울 수 없습니다.`);
  }
  for (const k of ["code", "name", "specification", "notes"]) if (typeof b[k] === "string" && b[k].trim() === "") return invalid(`/${k}`, "비어 있을 수 없습니다.");
  if (typeof b.specification === "string" && b.specification.length > 4000) return invalid("/specification", "4000자 이하여야 합니다.");
  return null;
}

function patchProduct(state: FakeState, req: FakeRequest, productId: string): FakeResponse {
  const p = state.products.find((x) => x.id === productId);
  if (!p) return notFound();
  if (state.role === "viewer") return forbidden();
  const ifMatch = req.headers["If-Match"];
  if (ifMatch === undefined) return missingIfMatch();
  const b = req.body ?? {};
  const bad = productInputError(b, false);
  if (bad) return bad;
  if (Number(ifMatch.replace(/"/g, "")) !== p.row_version) return staleVersion(p.row_version);
  if (b.code && state.products.some((x) => x.id !== p.id && x.code === b.code.trim()))
    return errorBody(409, "PRODUCT_CODE_CONFLICT", "같은 프로젝트에 동일한 제품 코드가 있습니다.", [{ message: "이미 사용 중인 코드입니다.", field_path: "/code" }]);
  if (b.code) p.code = b.code.trim();
  if (b.name) p.name = b.name.trim();
  if ("specification" in b) p.specification = b.specification;
  if ("notes" in b) p.notes = b.notes;
  p.row_version += 1;
  p.updated_at = "2026-10-23T01:00:00Z";
  return { status: 200, headers: etag(p.row_version), body: { data: withSummaries(state, p) } };
}

function createProduct(state: FakeState, req: FakeRequest): FakeResponse {
  if (state.role === "viewer") return forbidden();
  const b = req.body ?? {};
  const bad = productInputError(b, true);
  if (bad) return bad;
  if (state.products.some((x) => x.code === b.code.trim()))
    return errorBody(409, "PRODUCT_CODE_CONFLICT", "같은 프로젝트에 동일한 제품 코드가 있습니다.", [{ message: "이미 사용 중인 코드입니다.", field_path: "/code" }]);
  const created: Schemas["ProductOut"] = {
    id: uuid(1000 + state.products.length + 1, "e"),
    project_id: P1,
    code: b.code.trim(),
    name: b.name.trim(),
    specification: b.specification ?? null,
    notes: b.notes ?? null,
    archived_at: null,
    created_at: "2026-10-23T02:00:00Z",
    updated_at: null,
    row_version: 1,
    current_process_version: null,
    latest_process_version: null,
  };
  state.products.push(created);
  return { status: 201, headers: { ...etag(1), Location: `/api/v1/projects/${P1}/products/${created.id}` }, body: { data: withSummaries(state, created) } };
}

/** 표준 가짜 서버: P1은 접근 가능(관리자), P2는 조회자, 그 밖의 프로젝트는 404(접근 불가와 없음을 구분하지 않음). */
export function standardHandler(req: FakeRequest, state: FakeState = freshState()): FakeResponse {
  const { method, path, query } = req;
  if (method === "GET" && path === "/me") return { status: 200, body: { data: ME } };
  if (method === "GET" && path === "/projects")
    return { status: 200, body: { data: PROJECTS_OUT, page: { limit: 50, next_cursor: null } } };
  if (method === "POST" && path === "/projects") {
    const b = req.body ?? {};
    if (b.organization_id !== ORG_ADMIN) return notFound(); // 조직 admin이 아니면 서버는 존재 여부를 알리지 않는다
    if (PROJECTS_OUT.some((x) => x.code === b.code))
      return errorBody(409, "PROJECT_CODE_CONFLICT", "같은 조직에 동일한 프로젝트 코드가 있습니다.", [{ message: "이미 사용 중인 코드입니다.", field_path: "/code" }]);
    // 공유 상수(ME·PROJECTS_OUT)는 바꾸지 않는다. 응답만 만들어 돌려준다.
    const created = { ...PROJECTS_OUT[0]!, id: uuid(9001, "f"), organization_id: b.organization_id, code: b.code, name: b.name, timezone: b.timezone, description: b.description ?? null, row_version: 1 };
    return { status: 201, headers: { ...etag(1), Location: `/api/v1/projects/${created.id}` }, body: { data: created } };
  }
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
          body: {
            data: state.revisions.filter((r) => r.asset_id === asset.id).sort((a, b) => b.revision_no - a.revision_no),
            page: { limit: 200, next_cursor: null },
          },
        };
      return { status: 200, headers: etag(asset.row_version), body: { data: asset } };
    }
    if (method === "PATCH" && assetId && !revisions) return patchAsset(state, req, assetId);
    if (method === "POST" && assetId && revisions) return createRevision(state, assetId);
    if (method === "POST" && !assetId) return createAsset(state, req);
  }
  const prm = /^\/projects\/([^/]+)\/products(?:\/([^/]+))?$/.exec(path);
  if (prm) {
    const [, project, productId] = prm;
    if (project !== P1) return notFound();
    if (method === "GET") {
      if (!productId) return listProducts(state.products.map((x) => withSummaries(state, x)), query);
      const p = state.products.find((x) => x.id === productId);
      return p ? { status: 200, headers: etag(p.row_version), body: { data: withSummaries(state, p) } } : notFound();
    }
    if (method === "PATCH" && productId) return patchProduct(state, req, productId);
    if (method === "POST" && !productId) return createProduct(state, req);
  }
  const rm = /^\/projects\/([^/]+)\/asset-revisions\/([^/]+)(?:\/(submit|approve|reject))?$/.exec(path);
  if (rm && rm[1] === P1) {
    const rev = state.revisions.find((r) => r.id === rm[2]);
    if (method === "GET") return rev ? { status: 200, headers: etag(rev.row_version), body: { data: rev } } : notFound();
    if (method === "PATCH" && !rm[3]) return patchRevision(state, req, rm[2]!);
    if (method === "POST" && rm[3]) return transitionRevision(state, req, rm[2]!, rm[3]);
  }
  const mr = materialRoute(req, state, { errorBody, etag, notFound, forbidden, missingIfMatch, staleVersion, invalid, project: P1 });
  if (mr) return mr;
  const pr = processRoute(req, state, { errorBody, etag, notFound, forbidden, missingIfMatch, staleVersion, invalid, project: P1 });
  if (pr) return pr;
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