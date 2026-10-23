import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import type { Schemas } from "../../shared/api/types";
import type {
  AssetInfo,
  DispatchRule,
  PortInfo,
  PortPolicy,
  ReleaseRule,
  RevisionDetail,
  RevisionSummary,
} from "./assetView";
import { fromCapacityDto } from "./capacityAdapter";

/**
 * API 응답(생성 타입) → 화면 뷰 모델. 서버 값을 임의로 보정하지 않는다.
 * 모르는 규칙 모드는 "미정"으로 바꾸지 않고 그대로 두기 어려우므로 unknown으로 두되, 계약에 없는 값이 오면
 * 어댑터 테스트가 실패하도록 예제로 고정한다(계약 변경 감지).
 */
type AssetOut = Schemas["AssetOut"];
type RevisionOut = Schemas["AssetRevisionOut"];

export function toRevisionSummary(s: Schemas["RevisionSummary"] | null): RevisionSummary | null {
  return s
    ? { id: s.id, revisionNo: s.revision_no, status: s.status, approvedAt: s.approved_at }
    : null;
}

export function toAssetInfo(a: AssetOut): AssetInfo {
  const ports: PortInfo[] = a.ports.map((p) => ({
    id: p.id,
    portKey: p.port_key,
    role: p.role,
    label: p.label,
  }));
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    kind: a.kind,
    sortOrder: a.sort_order,
    externalRef: a.external_ref,
    notes: a.notes,
    equipmentType: a.equipment?.equipment_type ?? null,
    modelName: a.equipment?.model_name ?? null,
    spaceType: a.space?.space_type ?? null,
    archivedAt: a.archived_at,
    ports,
    currentRevision: toRevisionSummary(a.current_revision),
    latestRevision: toRevisionSummary(a.latest_revision),
    rowVersion: a.row_version,
  };
}

function toDispatch(r: Schemas["PortPolicyOut"]["dispatch_rule"]): DispatchRule {
  if (r.mode === "when_destination_available")
    return {
      mode: "when_destination_available",
      reservation: r.reservation,
      waitAtInIfBusy: r.wait_at_in_if_busy,
    };
  return { mode: "unknown" };
}

function toRelease(r: Schemas["PortPolicyOut"]["release_rule"]): ReleaseRule {
  if (r.mode === "when_destination_accepts")
    return {
      mode: "when_destination_accepts",
      blockMachineWhileWaiting: r.block_machine_while_waiting,
    };
  return { mode: "unknown" };
}

export function toIssue(i: Schemas["IssueOut"]): ValidationIssue {
  return {
    severity: i.severity,
    rule_id: i.rule_id,
    entity_id: i.entity_id,
    field_path: i.field_path,
    message: i.message,
    ...(i.resolution ? { resolution: i.resolution } : {}),
  };
}

export function toRevisionDetail(r: RevisionOut): RevisionDetail {
  const ports: PortPolicy[] = r.ports.map((p) => ({
    portId: p.port_id,
    portKey: p.port_key,
    role: p.role,
    bufferCapacity: fromCapacityDto({
      mode: p.buffer_capacity.mode,
      value: p.buffer_capacity.value ?? null,
      unit: p.buffer_capacity.unit ?? null,
    }),
    dispatchRule: toDispatch(p.dispatch_rule),
    releaseRule: toRelease(p.release_rule),
  }));
  return {
    id: r.id,
    assetId: r.asset_id,
    revisionNo: r.revision_no,
    status: r.status,
    storageCapacity: r.storage_capacity
      ? fromCapacityDto({
          mode: r.storage_capacity.mode,
          value: r.storage_capacity.value ?? null,
          unit: r.storage_capacity.unit ?? null,
        })
      : null,
    ports,
    issues: r.issues.map(toIssue),
    rejectionReason: r.rejection_reason,
    approvedAt: r.approved_at,
    rowVersion: r.row_version,
  };
}
