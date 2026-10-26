import type { Schemas } from "../../shared/api/types";
import { toUnitSpecEdit } from "../processes/processView";
import type { MaterialView } from "./materialView";

/** API 응답(생성 타입) → 화면 뷰 모델. 서버 값을 임의로 보정하지 않는다(미정은 미정, null은 입력 없음 그대로). */
export function toMaterialView(m: Schemas["MaterialOut"]): MaterialView {
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    form: m.form,
    defaultSpec: toUnitSpecEdit(m.default_spec),
    notes: m.notes,
    archivedAt: m.archived_at,
    rowVersion: m.row_version,
  };
}
