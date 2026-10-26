import { Button } from "../../shared/components/Button";
import { CheckboxField, SelectField, TextField } from "../../shared/components/Fields";
import { Note } from "../../shared/components/Layout";
import type { AssetOption } from "./queries";
import type { RequirementDto } from "./processDoc";
import {
  ALLOCATION_LABELS,
  CAPACITY_MODE_LABELS,
  ELIGIBILITY_LABELS,
  RESOURCE_KIND_LABELS,
  SELECTION_LABELS,
} from "./processView";
import styles from "./StepEditPanel.module.css";

type Props = {
  requirements: RequirementDto[];
  onChange: (next: RequirementDto[]) => void;
  equipmentOptions: AssetOption[];
  /** 자산 id → 표시용 자산(선택지에 없는 보관·삭제된 자산도 id로 찾는다) */
  assetById: Map<string, AssetOption>;
  /** 선택지를 모두 받지 못했으면 후보를 고르게 하지 않는다(잘린 목록으로 잘못 지정하는 것을 막음) */
  optionsComplete: boolean;
};

const newRequirement = (n: number): RequirementDto => ({
  role_key: n === 0 ? "main" : `role-${n + 1}`,
  resource_kind: "equipment",
  selection_mode: "one_of",
  required_count: 1,
  capacity_mode: "finite",
  allocation_rule: { mode: "unknown" },
  candidates: [],
});

/**
 * 단계의 자원 요구. 후보는 표시 코드가 아니라 **자산 id**이며 같은 설비를 여러 단계에서 써도 하나의 자원이다.
 * 작업자(무제한)는 후보가 없다. 후보의 확인 상태(eligibility)는 미확인(unknown)이 기본이고 확인됨으로 가정하지 않는다.
 */
export function ResourceEditor({ requirements, onChange, equipmentOptions, assetById, optionsComplete }: Props) {
  const set = (i: number, patch: Partial<RequirementDto>) =>
    onChange(requirements.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  function toggleCandidate(i: number, assetId: string, checked: boolean) {
    const r = requirements[i]!;
    const cur = r.candidates ?? [];
    set(i, {
      candidates: checked
        ? [...cur, { asset_id: assetId, eligibility_status: "unknown" }]
        : cur.filter((c) => c.asset_id !== assetId),
    });
  }

  return (
    <div className={styles.checks}>
      {requirements.length === 0 && <Note>자원 요구가 없습니다. 설비 후보를 지정하려면 추가하세요(미지정은 서버 검증이 경고합니다).</Note>}
      {requirements.map((r, i) => {
        const cands = r.candidates ?? [];
        const isWorker = r.resource_kind === "worker";
        const chosen = new Set(cands.map((c) => c.asset_id));
        // 선택지에 없는 후보(보관·삭제된 자산 등)도 지우거나 확인 상태를 볼 수 있게 함께 보여 준다.
        const orphans = cands.filter((c) => !equipmentOptions.some((o) => o.id === c.asset_id));
        return (
          <fieldset key={i} className={styles.checks} aria-label={`자원 요구 ${i + 1}`}>
            <legend className={styles.legend}>자원 요구 {i + 1}</legend>
            <TextField
              label={`자원 ${i + 1} 역할 이름`}
              value={r.role_key ?? ""}
              onChange={(e) => set(i, { role_key: e.target.value })}
            />
            <SelectField
              label={`자원 ${i + 1} 종류`}
              value={r.resource_kind ?? "equipment"}
              onChange={(e) => {
                const kind = e.target.value as "equipment" | "worker";
                // 작업자는 후보가 없다. 후보가 있으면 사라지므로 값을 바꾸기 전에 사용자가 직접 고르게 한다.
                set(i, kind === "worker" ? { resource_kind: kind, candidates: [], selection_mode: "one_of" } : { resource_kind: kind, capacity_mode: "finite" });
              }}
            >
              {(Object.keys(RESOURCE_KIND_LABELS) as (keyof typeof RESOURCE_KIND_LABELS)[]).map((k) => (
                <option key={k} value={k}>
                  {RESOURCE_KIND_LABELS[k]}
                </option>
              ))}
            </SelectField>
            {!isWorker && (
              <SelectField
                label={`자원 ${i + 1} 선택 방식`}
                value={r.selection_mode ?? "one_of"}
                onChange={(e) => set(i, { selection_mode: e.target.value as "one_of" | "all_of" })}
              >
                {(Object.keys(SELECTION_LABELS) as (keyof typeof SELECTION_LABELS)[]).map((k) => (
                  <option key={k} value={k}>
                    {SELECTION_LABELS[k]}
                  </option>
                ))}
              </SelectField>
            )}
            <TextField
              label={`자원 ${i + 1} 필요 수량`}
              inputMode="numeric"
              value={String(r.required_count ?? 1)}
              hint={isWorker ? "무제한 작업자는 수량이 의미 없습니다." : "후보 중 선택이면 후보 수를 넘을 수 없습니다."}
              onChange={(e) => {
                const v = e.target.value.trim();
                // 입력 중인 올바르지 않은 값은 지우지 않고 그대로 두며 저장 전 검증이 막는다.
                set(i, { required_count: /^\d+$/.test(v) ? Number(v) : (e.target.value as unknown as number) });
              }}
            />
            {isWorker && (
              <SelectField
                label={`자원 ${i + 1} 수량 방식`}
                value={r.capacity_mode ?? "finite"}
                onChange={(e) => set(i, { capacity_mode: e.target.value as "finite" | "unlimited" })}
              >
                {(Object.keys(CAPACITY_MODE_LABELS) as (keyof typeof CAPACITY_MODE_LABELS)[]).map((k) => (
                  <option key={k} value={k}>
                    {CAPACITY_MODE_LABELS[k]}
                  </option>
                ))}
              </SelectField>
            )}
            <SelectField
              label={`자원 ${i + 1} 배정 규칙`}
              value={r.allocation_rule?.mode ?? "unknown"}
              onChange={(e) => set(i, { allocation_rule: { mode: e.target.value as NonNullable<RequirementDto["allocation_rule"]>["mode"] } })}
            >
              {(Object.keys(ALLOCATION_LABELS) as (keyof typeof ALLOCATION_LABELS)[]).map((k) => (
                <option key={k} value={k}>
                  {ALLOCATION_LABELS[k]}
                </option>
              ))}
            </SelectField>
            {!isWorker && (
              <fieldset className={styles.checks} aria-label={`자원 ${i + 1} 설비 후보`}>
                <legend className={styles.legend}>설비 후보</legend>
                {!optionsComplete && <Note>설비 목록을 모두 불러오는 중입니다. 완료되면 후보를 고를 수 있습니다.</Note>}
                {equipmentOptions.map((o) => (
                  <CheckboxField
                    key={o.id}
                    label={`${o.code} ${o.name}`}
                    disabled={!optionsComplete}
                    checked={chosen.has(o.id)}
                    onChange={(e) => toggleCandidate(i, o.id, e.target.checked)}
                  />
                ))}
                {orphans.map((c) => (
                  <CheckboxField
                    key={c.asset_id}
                    label={`알 수 없는 자산 (${assetById.get(c.asset_id)?.code ?? c.asset_id.slice(0, 8)})`}
                    checked
                    onChange={() => toggleCandidate(i, c.asset_id, false)}
                  />
                ))}
                {cands.map((c) => {
                  const a = assetById.get(c.asset_id);
                  const name = a ? a.code : c.asset_id.slice(0, 8);
                  return (
                    <SelectField
                      key={c.asset_id}
                      label={`${name} 후보 확인 상태 (자원 ${i + 1})`}
                      value={c.eligibility_status ?? "unknown"}
                      onChange={(e) =>
                        set(i, {
                          candidates: cands.map((x) =>
                            x.asset_id === c.asset_id ? { ...x, eligibility_status: e.target.value as "confirmed" | "unknown" } : x,
                          ),
                        })
                      }
                    >
                      {(Object.keys(ELIGIBILITY_LABELS) as (keyof typeof ELIGIBILITY_LABELS)[]).map((k) => (
                        <option key={k} value={k}>
                          {ELIGIBILITY_LABELS[k]}
                        </option>
                      ))}
                    </SelectField>
                  );
                })}
              </fieldset>
            )}
            <div>
              <Button onClick={() => onChange(requirements.filter((_, idx) => idx !== i))} aria-label={`자원 요구 ${i + 1} 삭제`}>
                자원 요구 삭제
              </Button>
            </div>
          </fieldset>
        );
      })}
      <div>
        <Button onClick={() => onChange([...requirements, newRequirement(requirements.length)])}>자원 요구 추가</Button>
      </div>
      <Note>같은 설비를 여러 단계에서 선택해도 하나의 자원으로 취급됩니다. 후보 확인 상태는 확인되기 전까지 미확인으로 둡니다.</Note>
    </div>
  );
}
