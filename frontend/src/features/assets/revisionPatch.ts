import { ApiError } from "../../shared/api/errors";
import type { Schemas } from "../../shared/api/types";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import type { DispatchRule, ReleaseRule, RevisionEdit } from "./assetView";
import { toCapacityRequest } from "./capacityAdapter";

/**
 * 버전 저장 규칙(계약 0.2.0 `PATCH /asset-revisions/{id}`, RevisionPatch).
 * - 초안만 수정할 수 있다(그 밖은 409 VERSION_IMMUTABLE). If-Match는 버전의 row_version이다.
 * - 보낸 필드만 바뀌고 `ports`는 port_id별로 병합된다. 그러므로 **사용자가 바꾼 값만** 보낸다.
 * - 용량은 `finite`만 value·unit을 가지며 status는 보내지 않는다(어댑터가 처리).
 * - 규칙(dispatch/release)은 판별 객체 전체를 교체한다(일부 필드만 보낼 수 없음).
 */
export type RevisionPatchBody = Schemas["RevisionPatch"];
type PortPatch = Schemas["PortPolicyPatch"];

export function toDispatchRequest(r: DispatchRule): NonNullable<PortPatch["dispatch_rule"]> {
  return r.mode === "unknown"
    ? { mode: "unknown" }
    : { mode: r.mode, reservation: r.reservation, wait_at_in_if_busy: r.waitAtInIfBusy };
}

export function toReleaseRequest(r: ReleaseRule): NonNullable<PortPatch["release_rule"]> {
  return r.mode === "unknown"
    ? { mode: "unknown" }
    : { mode: r.mode, block_machine_while_waiting: r.blockMachineWhileWaiting };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 서버에 보낼 변경 본문. 바뀐 값이 없으면 null(요청을 보내지 않는다). */
export function buildRevisionPatch(base: RevisionEdit, draft: RevisionEdit): RevisionPatchBody | null {
  const body: RevisionPatchBody = {};
  if (draft.storageCapacity && !same(base.storageCapacity, draft.storageCapacity))
    body.storage_capacity = toCapacityRequest(draft.storageCapacity);
  const ports: PortPatch[] = [];
  for (const [portId, d] of Object.entries(draft.ports)) {
    const b = base.ports[portId];
    if (!b) continue;
    const p: PortPatch = { port_id: portId };
    if (!same(b.capacity, d.capacity)) p.buffer_capacity = toCapacityRequest(d.capacity);
    if (!same(b.dispatch, d.dispatch)) p.dispatch_rule = toDispatchRequest(d.dispatch);
    if (!same(b.release, d.release)) p.release_rule = toReleaseRequest(d.release);
    if (Object.keys(p).length > 1) ports.push(p);
  }
  if (ports.length > 0) body.ports = ports;
  return Object.keys(body).length > 0 ? body : null;
}

/** 병합·변경 충돌을 사람이 읽는 이름으로 부르기 위한 라벨 */
export type EditKey = "storage" | `${string}:capacity` | `${string}:dispatch` | `${string}:release`;

function entries(e: RevisionEdit): Map<EditKey, unknown> {
  const m = new Map<EditKey, unknown>();
  if (e.storageCapacity) m.set("storage", e.storageCapacity);
  for (const [id, p] of Object.entries(e.ports)) {
    m.set(`${id}:capacity`, p.capacity);
    m.set(`${id}:dispatch`, p.dispatch);
    m.set(`${id}:release`, p.release);
  }
  return m;
}

export type RevisionMerge = {
  draft: RevisionEdit;
  /** 나와 서버가 모두 바꾼 항목(내 값을 유지하고 서버 값을 알린다). 값은 서버의 JSON */
  conflicts: EditKey[];
};

/**
 * 412 충돌 후 "내 변경을 유지"할 때의 항목 단위 3-way 병합(자산 기본 정보와 같은 원칙).
 * 내가 안 바꾼 항목은 서버 최신 값, 바꾼 항목은 내 값. 둘 다 바꿨고 값이 다르면 conflicts에 알린다.
 * 저장은 하지 않고 사용자가 병합 결과를 확인한 뒤 새 버전으로 다시 저장한다.
 */
export function mergeRevisionEdit(original: RevisionEdit, draft: RevisionEdit, server: RevisionEdit): RevisionMerge {
  const o = entries(original);
  const d = entries(draft);
  const s = entries(server);
  const merged: RevisionEdit = {
    storageCapacity: server.storageCapacity,
    ports: Object.fromEntries(Object.entries(server.ports).map(([id, p]) => [id, { ...p }])),
  };
  const conflicts: EditKey[] = [];
  for (const key of d.keys()) {
    const mine = !same(o.get(key), d.get(key));
    if (!mine) continue;
    if (key === "storage") merged.storageCapacity = draft.storageCapacity;
    else {
      const [portId, field] = key.split(":") as [string, "capacity" | "dispatch" | "release"];
      const target = merged.ports[portId];
      const source = draft.ports[portId];
      if (!target || !source) continue; // 서버에 없는 포트(구조가 바뀜)는 내 값을 쓰지 않는다
      (target as Record<string, unknown>)[field] = source[field];
    }
    if (s.has(key) && !same(s.get(key), o.get(key)) && !same(s.get(key), d.get(key))) conflicts.push(key);
  }
  return { draft: merged, conflicts };
}

/**
 * 저장(PATCH) 422의 field_path(요청 본문 기준)를 편집 항목에 연결한다.
 * `/ports/{i}/…`의 i는 **요청 본문의 ports 배열 순서**이므로 보낸 본문으로 port_id를 찾는다.
 */
export function mapRevisionErrors(
  e: ApiError,
  sent: RevisionPatchBody | null,
): { byKey: Partial<Record<EditKey, string>>; general: ValidationIssue[] } {
  const byKey: Partial<Record<EditKey, string>> = {};
  const general: ValidationIssue[] = [];
  for (const d of e.details) {
    const path = d.field_path ?? "";
    let key: EditKey | undefined;
    const pm = /^\/ports\/(\d+)\/(buffer_capacity|dispatch_rule|release_rule)(\/|$)/.exec(path);
    if (pm) {
      const portId = sent?.ports?.[Number(pm[1])]?.port_id;
      if (portId) key = `${portId}:${pm[2] === "buffer_capacity" ? "capacity" : pm[2] === "dispatch_rule" ? "dispatch" : "release"}`;
    } else if (path.startsWith("/storage_capacity")) key = "storage";
    if (key && !(key in byKey)) byKey[key] = d.message;
    else
      general.push({
        severity: d.severity === "warning" ? "warning" : "error",
        message: d.message,
        ...(d.field_path ? { field_path: d.field_path } : {}),
        ...(d.rule_id ? { rule_id: d.rule_id } : {}),
        ...(d.resolution ? { resolution: d.resolution } : {}),
      });
  }
  return { byKey, general };
}
