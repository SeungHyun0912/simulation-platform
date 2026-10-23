import { knownValueText, type KnownValue } from "../../shared/components/KnownValueInput";
import type { VersionStatus } from "../../shared/components/VersionStatusBadge";

/**
 * 화면 전용 뷰 모델. 승인된 API DTO가 아니며(계약 PENDING_REVIEW),
 * 계약 승인 후 어댑터를 통해 DTO에서 변환한다.
 */
export type AssetKind = "equipment" | "storage" | "dock";

export type PortView = { kind: "IN" | "OUT" | "ACCESS"; placement: "unknown" | "placed" };

export type AssetView = {
  /** 내부 고유 ID. 화면 표시 코드와 구분한다. */
  id: string;
  /** 화면 표시 코드(EQ·ST 등). 내부 ID가 아니다. */
  code: string;
  name: string;
  kind: AssetKind;
  model: string;
  group: string;
  status: VersionStatus;
  /** 대기 용량(item). 미정 / 값 / 무제한 / 대기 불가를 구분한다. */
  capacity: KnownValue;
  ports: PortView[];
};

export const KIND_LABELS: Record<AssetKind, string> = {
  equipment: "설비",
  storage: "저장공간",
  dock: "도킹",
};

/** 목록·요약용 용량 문구. 단위가 없으면 개(item)로 본다. */
export function capacityText(c: KnownValue): string {
  return knownValueText(c, "item");
}

export function portsText(ports: PortView[]): string {
  return ports.map((p) => p.kind).join(" · ");
}
