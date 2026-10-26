import { KnownValueInput, type KnownValue } from "../../shared/components/KnownValueInput";
import { FieldGrid } from "../../shared/components/Layout";
import { validateMeasure } from "./processDoc";
import { UNIT_FIELD_LABELS, type UnitSpecEdit, type UnitSpecField } from "./processView";

const MODES = ["unknown", "value", "not_applicable"] as const;

/**
 * 원자재 기본 단위·완제품 단위 입력. 길이·중량·단위 수·가닥 수는 서로 다른 값이며 서로 환산하지 않는다.
 * 기본은 모두 미정이고 0이 아니다. 서버 오류는 해당 입력 옆에 표시한다.
 */
export function UnitSpecEditor({
  title,
  value,
  onChange,
  errors,
  disabled,
}: {
  title: string;
  value: UnitSpecEdit;
  onChange: (next: UnitSpecEdit) => void;
  errors: Partial<Record<UnitSpecField, string>>;
  disabled?: boolean;
}) {
  const set = (k: UnitSpecField, v: KnownValue) => onChange({ ...value, [k]: v });
  const label = (k: UnitSpecField) => `${title} ${UNIT_FIELD_LABELS[k]}`;
  return (
    <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <FieldGrid>
        <KnownValueInput
          label={label("lengthM")}
          units={["m"]}
          allowedModes={[...MODES]}
          value={value.lengthM}
          validator={(v) => validateMeasure(v, "positive")}
          error={errors.lengthM}
          onChange={(v) => set("lengthM", v)}
        />
        <KnownValueInput
          label={label("weightKg")}
          units={["kg"]}
          allowedModes={[...MODES]}
          value={value.weightKg}
          validator={(v) => validateMeasure(v, "positive")}
          error={errors.weightKg}
          onChange={(v) => set("weightKg", v)}
        />
        <KnownValueInput
          label={label("unitCount")}
          unit="단위"
          numberKind="integer"
          allowedModes={[...MODES]}
          value={value.unitCount}
          validator={(v) => validateMeasure(v, "count")}
          error={errors.unitCount}
          onChange={(v) => set("unitCount", v)}
        />
        <KnownValueInput
          label={label("strandCount")}
          unit="가닥"
          numberKind="integer"
          allowedModes={[...MODES]}
          value={value.strandCount}
          validator={(v) => validateMeasure(v, "count")}
          error={errors.strandCount}
          onChange={(v) => set("strandCount", v)}
        />
      </FieldGrid>
    </fieldset>
  );
}
