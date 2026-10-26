import type { Schemas } from "../../shared/api/types";
import type { ProcessVersionSummaryView, ProductView } from "./productView";

/** API 응답(생성 타입) → 화면 뷰 모델. 서버 값을 임의로 보정하지 않는다(null=미정/입력 없음 그대로). */
function toSummary(s: Schemas["ProcessVersionSummary"] | null | undefined): ProcessVersionSummaryView | null {
  return s ? { id: s.id, versionNo: s.version_no, status: s.status, approvedAt: s.approved_at } : null;
}

export function toProductView(p: Schemas["ProductOut"]): ProductView {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    specification: p.specification,
    notes: p.notes,
    archivedAt: p.archived_at,
    currentProcessVersion: toSummary(p.current_process_version),
    latestProcessVersion: toSummary(p.latest_process_version),
    rowVersion: p.row_version,
  };
}
