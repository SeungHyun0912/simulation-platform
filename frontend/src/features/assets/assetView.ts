import type { KnownValue } from "../../shared/components/KnownValueInput";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import { VERSION_STATUS_LABELS } from "../../shared/components/VersionStatusBadge";

/**
 * 화면 전용 뷰 모델. 계약 0.2.0의 Asset·AssetRevision 응답을 화면에 맞게 나눈 것이다.
 * 자산 기본 정보(버전 없음, 자산 ETag)와 버전(상태·용량·규칙, 버전 ETag)은 서로 다른 리소스다.
 * 실제 연동 시 어댑터를 통해 생성 타입에서 변환한다.
 */
export type AssetKind = "equipment" | "storage" | "dock";
export type PortRole = "IN" | "OUT" | "ACCESS";

export type PortInfo = { id: string; portKey: string; role: PortRole; label: string };

/** 자산 응답의 `current_revision`/`latest_revision` 요약 */
export type RevisionSummary = {
  id: string;
  revisionNo: number;
  /** 서버 값 그대로. draft|in_review|approved|superseded 외의 값도 올 수 있다. */
  status: string;
  approvedAt: string | null;
};

export type AssetInfo = {
  id: string;
  code: string;
  name: string;
  kind: AssetKind;
  sortOrder: number;
  externalRef: string | null;
  notes: string | null;
  /** 설비일 때만 */
  equipmentType: string | null;
  modelName: string | null;
  /** 저장공간·도킹일 때만 */
  spaceType: string | null;
  archivedAt: string | null;
  ports: PortInfo[];
  /** 최신 승인본. 없으면 null */
  currentRevision: RevisionSummary | null;
  /** 가장 최근 버전(열린 버전 포함). 없으면 null */
  latestRevision: RevisionSummary | null;
  rowVersion: number;
};

export const KIND_LABELS: Record<AssetKind, string> = {
  equipment: "설비",
  storage: "저장공간",
  dock: "도킹",
};

/** 목록·요약의 포트 문구 */
export function portsText(ports: PortInfo[]): string {
  return ports.map((p) => p.role).join(" · ");
}

/** 목록의 상태 문구용. 버전이 없으면 null이며 화면은 "버전 없음"으로 표시한다. */
export function latestStatus(a: AssetInfo): string | null {
  return a.latestRevision?.status ?? null;
}

export function statusLabel(status: string): string {
  return (VERSION_STATUS_LABELS as Record<string, string>)[status] ?? "알 수 없음";
}

/* ---------------- 버전(리비전) ---------------- */

export type DispatchRule =
  | { mode: "unknown" }
  | {
      mode: "when_destination_available";
      reservation: "unknown" | "reserve" | "none";
      waitAtInIfBusy: boolean;
    };

export type ReleaseRule =
  | { mode: "unknown" }
  | {
      mode: "when_destination_accepts";
      blockMachineWhileWaiting: "unknown" | "yes" | "no";
    };

export type PortPolicy = {
  portId: string;
  portKey: string;
  role: "IN" | "OUT";
  bufferCapacity: KnownValue;
  dispatchRule: DispatchRule;
  releaseRule: ReleaseRule;
};

export type RevisionDetail = {
  id: string;
  assetId: string;
  revisionNo: number;
  status: string;
  /** 공간(저장공간·도킹)은 저장 용량, 설비는 null */
  storageCapacity: KnownValue | null;
  /** 설비는 IN/OUT 정책, 공간은 빈 배열(ACCESS 포트에는 정책이 없다) */
  ports: PortPolicy[];
  /** 서버가 계산한 검증 결과. 저장할 때 갱신된다. */
  issues: ValidationIssue[];
  rejectionReason: string | null;
  /** ISO8601 UTC. 승인되지 않았으면 null */
  approvedAt: string | null;
  rowVersion: number;
};

/** 버전에서 편집하는 값. 규칙(dispatch/release) 입력은 확장 제안 승인 후 추가한다. */
export type RevisionEdit = {
  storageCapacity: KnownValue | null;
  /** portId → 용량 */
  portCapacities: Record<string, KnownValue>;
};

export function toRevisionEdit(r: RevisionDetail): RevisionEdit {
  return {
    storageCapacity: r.storageCapacity,
    portCapacities: Object.fromEntries(r.ports.map((p) => [p.portId, p.bufferCapacity])),
  };
}

/** 이 버전이 편집 가능한지: 상태가 draft이고 역할이 편집 권한을 가질 때. 서버 409/403이 정본이다. */
export function isRevisionEditable(status: string, canEditRole: boolean): boolean {
  return status === "draft" && canEditRole;
}

/** 열린 버전(draft·in_review)은 자산당 하나만 둘 수 있다(409 REVISION_DRAFT_EXISTS). */
export function isOpenStatus(status: string): boolean {
  return status === "draft" || status === "in_review";
}

/* ---------------- 자산 기본 정보 편집 ---------------- */

export const ASSET_LIMITS = {
  code: 64,
  name: 200,
  typeName: 100,
  modelName: 200,
  externalRef: 200,
  notes: 4000,
  sortOrder: 2_147_483_647,
} as const;

/** 입력 중인 문자열 폼. 선택 필드는 비우면 "입력 없음"(null)으로 보낸다(빈 문자열은 서버가 거부). */
export type InfoDraft = {
  code: string;
  name: string;
  sortOrder: string;
  externalRef: string;
  notes: string;
  equipmentType: string;
  modelName: string;
  spaceType: string;
};

export type InfoErrors = Partial<Record<keyof InfoDraft, string>>;

export function toInfoDraft(a: AssetInfo): InfoDraft {
  return {
    code: a.code,
    name: a.name,
    sortOrder: String(a.sortOrder),
    externalRef: a.externalRef ?? "",
    notes: a.notes ?? "",
    equipmentType: a.equipmentType ?? "",
    modelName: a.modelName ?? "",
    spaceType: a.spaceType ?? "",
  };
}

export function validateInfoDraft(d: InfoDraft, kind: AssetKind): InfoErrors {
  const e: InfoErrors = {};
  const code = d.code.trim();
  if (code === "") e.code = "코드를 입력하세요.";
  else if (code.length > ASSET_LIMITS.code) e.code = `코드는 ${ASSET_LIMITS.code}자 이하여야 합니다.`;
  const name = d.name.trim();
  if (name === "") e.name = "이름을 입력하세요.";
  else if (name.length > ASSET_LIMITS.name) e.name = `이름은 ${ASSET_LIMITS.name}자 이하여야 합니다.`;
  if (!/^\d+$/.test(d.sortOrder) || Number(d.sortOrder) > ASSET_LIMITS.sortOrder)
    e.sortOrder = `0 이상 ${ASSET_LIMITS.sortOrder.toLocaleString("ko-KR")} 이하의 정수를 입력하세요.`;
  if (d.externalRef.length > ASSET_LIMITS.externalRef)
    e.externalRef = `외부 참조는 ${ASSET_LIMITS.externalRef}자 이하여야 합니다.`;
  if (d.notes.length > ASSET_LIMITS.notes) e.notes = `메모는 ${ASSET_LIMITS.notes}자 이하여야 합니다.`;
  if (kind === "equipment") {
    const t = d.equipmentType.trim();
    if (t === "") e.equipmentType = "설비 유형을 입력하세요.";
    else if (t.length > ASSET_LIMITS.typeName)
      e.equipmentType = `설비 유형은 ${ASSET_LIMITS.typeName}자 이하여야 합니다.`;
    if (d.modelName.length > ASSET_LIMITS.modelName)
      e.modelName = `모델은 ${ASSET_LIMITS.modelName}자 이하여야 합니다.`;
  } else {
    const t = d.spaceType.trim();
    if (t === "") e.spaceType = "공간 유형을 입력하세요.";
    else if (t.length > ASSET_LIMITS.typeName)
      e.spaceType = `공간 유형은 ${ASSET_LIMITS.typeName}자 이하여야 합니다.`;
  }
  return e;
}
