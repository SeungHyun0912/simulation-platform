import { Button } from "../../shared/components/Button";
import { SelectField, TextField } from "../../shared/components/Fields";
import { FieldGrid, Note } from "../../shared/components/Layout";
import type { MaterialOptions } from "../materials/queries";
import { CountField, MeasureField } from "./MeasureField";
import { newMaterialSpec, type MaterialSpec } from "./processDoc";
import { QUANTITY_BASIS_LABELS } from "./processView";
import styles from "./StepEditPanel.module.css";

type Props = {
  specs: MaterialSpec[];
  onChange: (next: MaterialSpec[]) => void;
  materials: MaterialOptions;
  /** 간선이 연결해 둔 spec key. 이 spec은 지울 수 없다(서버가 422 VAL-SPEC-005) — 먼저 간선 연결을 풀어야 한다. */
  linkedKeys: ReadonlySet<string>;
};

const DIRECTION_LABEL = { input: "투입", output: "산출" } as const;

/**
 * 단계가 받고 내보내는 재료의 상태·수량(계약 0.6.0 `material_specs`). `output_rule`(산출 계산 규칙)과 별개의 기록이며
 * 서로 자동으로 맞추거나 검증하지 않는다. 길이·중량·단위 수·가닥 수는 서로 다른 값이라 환산하지 않고, 기본은 모두 미정(0이 아님)이다.
 * 예) "3.3t × 11개 동시 투입" = 중량 3300 kg + 단위 수 11, "12가닥 공급" = 가닥 수 12(보빈 수가 아님).
 */
export function MaterialSpecEditor({ specs, onChange, materials, linkedKeys }: Props) {
  const set = (key: string, patch: Partial<MaterialSpec>) => onChange(specs.map((s) => (s.spec_key === key ? { ...s, ...patch } : s)));

  return (
    <div className={styles.checks}>
      <Note>
        투입·산출 재료의 상태와 수량을 기록합니다. 산출 방식(위 "산출")과 자동으로 맞추지 않습니다. 값을 모르면 미정으로 두세요(0이 아닙니다).
      </Note>
      {specs.length === 0 && <Note>등록된 재료 spec이 없습니다.</Note>}
      {(["input", "output"] as const).map((direction) => {
        const mine = specs.filter((s) => s.direction === direction);
        return mine.map((s, i) => {
          const name = `${DIRECTION_LABEL[direction]} ${i + 1}`;
          const linked = linkedKeys.has(s.spec_key);
          const material = s.material_definition_id ? materials.byId.get(s.material_definition_id) : undefined;
          return (
            <fieldset key={s.spec_key} className={styles.checks} aria-label={`재료 spec ${name}`}>
              <legend className={styles.legend}>
                {name} <code>{s.spec_key}</code>
              </legend>
              <FieldGrid>
                <SelectField
                  label={`${name} 재료`}
                  hint="재료 기준정보에서 고릅니다. 정하지 않아도 됩니다."
                  value={s.material_definition_id ?? ""}
                  onChange={(e) => set(s.spec_key, { material_definition_id: e.target.value === "" ? null : e.target.value })}
                >
                  <option value="">지정 안 함</option>
                  {materials.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} {o.name}
                    </option>
                  ))}
                  {s.material_definition_id && !materials.options.some((o) => o.id === s.material_definition_id) && (
                    <option value={s.material_definition_id}>
                      {material ? `${material.code} ${material.name} (보관됨)` : `알 수 없는 재료 (${s.material_definition_id.slice(0, 8)})`}
                    </option>
                  )}
                </SelectField>
                <TextField
                  label={`${name} 상태`}
                  hint="자유 텍스트(예: 1차 조사 후). 비우면 입력 없음"
                  value={s.state_code ?? ""}
                  onChange={(e) => set(s.spec_key, { state_code: e.target.value === "" ? null : e.target.value })}
                />
                <TextField
                  label={`${name} 형태`}
                  hint="자유 텍스트(예: 보빈). 비우면 입력 없음"
                  value={s.form ?? ""}
                  onChange={(e) => set(s.spec_key, { form: e.target.value === "" ? null : e.target.value })}
                />
                <SelectField
                  label={`${name} 수량 기준`}
                  hint="작업 한 번의 수량과 총 계획 수량을 구분합니다."
                  value={s.quantity_basis ?? "unknown"}
                  onChange={(e) => set(s.spec_key, { quantity_basis: e.target.value as MaterialSpec["quantity_basis"] })}
                >
                  {(Object.keys(QUANTITY_BASIS_LABELS) as (keyof typeof QUANTITY_BASIS_LABELS)[]).map((k) => (
                    <option key={k} value={k}>
                      {QUANTITY_BASIS_LABELS[k]}
                    </option>
                  ))}
                </SelectField>
              </FieldGrid>
              <FieldGrid>
                <MeasureField label={`${name} 길이`} unit="m" kind="positive" value={s.length_m} onChange={(m) => set(s.spec_key, { length_m: m })} />
                <MeasureField label={`${name} 중량`} unit="kg" kind="positive" value={s.weight_kg} onChange={(m) => set(s.spec_key, { weight_kg: m })} />
                <CountField label={`${name} 단위 수`} allowNotApplicable value={s.unit_count} onChange={(m) => set(s.spec_key, { unit_count: m })} />
                <CountField label={`${name} 가닥 수`} unitLabel="가닥" allowNotApplicable value={s.strand_count} onChange={(m) => set(s.spec_key, { strand_count: m })} />
              </FieldGrid>
              <div>
                <Button
                  disabled={linked}
                  onClick={() => onChange(specs.filter((x) => x.spec_key !== s.spec_key))}
                  aria-label={`재료 spec ${name} 삭제`}
                  title={linked ? "간선이 이 spec에 연결되어 있어 지울 수 없습니다. 먼저 그래프 구성에서 간선 연결을 푸세요." : undefined}
                >
                  재료 spec 삭제
                </Button>
                {linked && <Note>간선에 연결된 spec입니다. 지우려면 먼저 그래프 구성의 간선 편집에서 연결을 푸세요.</Note>}
              </div>
            </fieldset>
          );
        });
      })}
      <div>
        <Button onClick={() => onChange([...specs, newMaterialSpec("input", specs)])}>투입 재료 추가</Button>{" "}
        <Button onClick={() => onChange([...specs, newMaterialSpec("output", specs)])}>산출 재료 추가</Button>
      </div>
    </div>
  );
}
