import { forwardRef } from "react";
import { Button } from "../../shared/components/Button";
import { CheckboxField, SelectField, TextField } from "../../shared/components/Fields";
import { KnownValueInput } from "../../shared/components/KnownValueInput";
import { FieldGrid, Note, Section } from "../../shared/components/Layout";
import {
  CONFIRMATION_LABELS,
  OUTPUT_LABELS,
  PROCESSING_LABELS,
  TRIGGER_LABELS,
  UNKNOWN_VALUE,
  processingValueUnit,
  type Confirmation,
  type OutputMode,
  type ProcessingKind,
  type SetupTrigger,
  type StepView,
} from "./processView";
import styles from "./StepEditPanel.module.css";

export type CodeOption = { code: string; name: string };

type Props = {
  step: StepView;
  onChange: (next: StepView) => void;
  onClose: () => void;
  readOnly: boolean;
  equipmentOptions: CodeOption[];
  locationOptions: CodeOption[];
};

const VALUE_MODES = ["unknown", "value"] as const;

/** 선택한 단계 하나를 편집하는 패널. 열리면 제목으로 포커스가 이동한다. */
export const StepEditPanel = forwardRef<HTMLHeadingElement, Props>(function StepEditPanel(
  { step, onChange, onClose, readOnly, equipmentOptions, locationOptions },
  headingRef,
) {
  const set = (patch: Partial<StepView>) => onChange({ ...step, ...patch });

  function setProcessingKind(kind: ProcessingKind) {
    const unit = processingValueUnit(kind);
    const keep = unit !== null && step.processing.value.unit === unit;
    set({
      processing: {
        kind,
        // 선속(m/분)과 시간(분)은 다른 값이므로 단위가 달라지면 값을 이어받지 않는다.
        value: keep ? step.processing.value : UNKNOWN_VALUE(unit ?? "min"),
        referenceLength:
          kind === "per_reference_length" ? step.processing.referenceLength : UNKNOWN_VALUE("m"),
      },
    });
  }

  function setOutputMode(mode: OutputMode) {
    // 해당 방식에서 쓰지 않는 입력은 남기지 않는다.
    set({
      output: {
        mode,
        unitCount:
          mode === "configured_units" ? step.output.unitCount : UNKNOWN_VALUE("bobbin"),
        length:
          mode === "configured_units" || mode === "split_length"
            ? step.output.length
            : UNKNOWN_VALUE("m"),
      },
    });
  }

  function toggleCandidate(code: string, checked: boolean) {
    const codes = checked
      ? [...step.equipment.candidateCodes, code]
      : step.equipment.candidateCodes.filter((c) => c !== code);
    set({ equipment: { ...step.equipment, candidateCodes: codes } });
  }

  const p = step.processing;
  const o = step.output;

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h2 ref={headingRef} tabIndex={-1} className={styles.title}>
          단계 편집: {step.name || "(이름 없음)"}
        </h2>
        <Button onClick={onClose}>편집 닫기</Button>
      </div>
      {readOnly && <Note>읽기 전용입니다. 승인되었거나 검토 중인 버전은 수정할 수 없습니다.</Note>}
      <fieldset className={styles.fieldset} disabled={readOnly}>
        <Section id="step-basic" title="기본">
          <FieldGrid>
            <TextField
              label="공정명"
              value={step.name}
              error={step.name.trim() === "" ? "공정명을 입력하세요." : null}
              onChange={(e) => set({ name: e.target.value })}
            />
            <SelectField
              label="확인 상태"
              value={step.confirmation}
              onChange={(e) => set({ confirmation: e.target.value as Confirmation })}
            >
              {(Object.keys(CONFIRMATION_LABELS) as Confirmation[]).map((k) => (
                <option key={k} value={k}>
                  {CONFIRMATION_LABELS[k]}
                </option>
              ))}
            </SelectField>
          </FieldGrid>
        </Section>

        <Section id="step-equipment" title="설비">
          <SelectField
            label="배정 방식"
            hint="후보 그룹은 실행 시 후보 중에서 배정하고, 특정 설비는 하나를 고정합니다."
            value={step.equipment.mode}
            onChange={(e) =>
              set({ equipment: { ...step.equipment, mode: e.target.value as "group" | "specific" } })
            }
          >
            <option value="group">후보 그룹 중 배정</option>
            <option value="specific">특정 설비 지정</option>
          </SelectField>
          <fieldset className={styles.checks}>
            <legend className={styles.legend}>설비 후보</legend>
            {equipmentOptions.map((opt) => (
              <CheckboxField
                key={opt.code}
                label={`${opt.code} ${opt.name}`}
                checked={step.equipment.candidateCodes.includes(opt.code)}
                onChange={(e) => toggleCandidate(opt.code, e.target.checked)}
              />
            ))}
          </fieldset>
          <Note>같은 설비를 여러 단계에서 선택해도 하나의 자원으로 취급됩니다.</Note>
        </Section>

        <Section id="step-processing" title="처리 시간">
          <SelectField
            label="처리 방식"
            value={p.kind}
            onChange={(e) => setProcessingKind(e.target.value as ProcessingKind)}
          >
            {(Object.keys(PROCESSING_LABELS) as ProcessingKind[]).map((k) => (
              <option key={k} value={k}>
                {PROCESSING_LABELS[k]}
              </option>
            ))}
          </SelectField>
          {p.kind === "output_speed" && (
            <KnownValueInput
              label="선속"
              units={["m_per_min"]}
              allowedModes={[...VALUE_MODES]}
              value={p.value}
              onChange={(value) => set({ processing: { ...p, value } })}
            />
          )}
          {p.kind === "per_output_unit" && (
            <KnownValueInput
              label="산출 단위당 시간"
              units={["min"]}
              allowedModes={[...VALUE_MODES]}
              value={p.value}
              onChange={(value) => set({ processing: { ...p, value } })}
            />
          )}
          {p.kind === "per_reference_length" && (
            <>
              <KnownValueInput
                label="기준 길이"
                units={["m"]}
                allowedModes={[...VALUE_MODES]}
                value={p.referenceLength}
                onChange={(referenceLength) => set({ processing: { ...p, referenceLength } })}
              />
              <KnownValueInput
                label="기준 길이당 시간"
                units={["min"]}
                allowedModes={[...VALUE_MODES]}
                value={p.value}
                onChange={(value) => set({ processing: { ...p, value } })}
              />
              <Note>다른 길이로 비례 계산하지 않습니다. 비례 여부는 확인되지 않았습니다.</Note>
            </>
          )}
          <Note>
            선속(m/분)은 분당 처리 길이이고, 보빈당 길이(예: 1,000 m)와 다른 값입니다. 0분은
            유효한 값이며 미정과 다릅니다.
          </Note>
        </Section>

        <Section id="step-setup" title="준비">
          <SelectField
            label="준비 시점"
            value={step.setup.trigger}
            onChange={(e) =>
              set({ setup: { ...step.setup, trigger: e.target.value as SetupTrigger } })
            }
          >
            {(Object.keys(TRIGGER_LABELS) as SetupTrigger[]).map((k) => (
              <option key={k} value={k}>
                {TRIGGER_LABELS[k]}
              </option>
            ))}
          </SelectField>
          {step.setup.trigger !== "unknown" && step.setup.trigger !== "not_applicable" && (
            <KnownValueInput
              label="준비 시간"
              units={["min"]}
              allowedModes={[...VALUE_MODES]}
              value={step.setup.duration}
              onChange={(duration) => set({ setup: { ...step.setup, duration } })}
            />
          )}
        </Section>

        <Section id="step-output" title="산출">
          <SelectField
            label="산출 방식"
            value={o.mode}
            onChange={(e) => setOutputMode(e.target.value as OutputMode)}
          >
            {(Object.keys(OUTPUT_LABELS) as OutputMode[]).map((k) => (
              <option key={k} value={k}>
                {OUTPUT_LABELS[k]}
              </option>
            ))}
          </SelectField>
          {(o.mode === "configured_units" || o.mode === "split_length") && (
            <KnownValueInput
              label="산출 길이"
              units={["m"]}
              allowedModes={[...VALUE_MODES]}
              value={o.length}
              onChange={(length) => set({ output: { ...o, length } })}
            />
          )}
          {o.mode === "configured_units" && (
            <KnownValueInput
              label="산출 수량"
              units={["bobbin"]}
              allowedModes={[...VALUE_MODES]}
              value={o.unitCount}
              onChange={(unitCount) => set({ output: { ...o, unitCount } })}
            />
          )}
          <Note>
            산출 수량은 한 작업의 설정이며 전체 생산 목표가 아닙니다. 가닥 합류·중량 단위 산출 등
            다른 방식은 계약 승인 후 추가됩니다.
          </Note>
        </Section>

        <Section id="step-next" title="다음 위치">
          <SelectField
            label="다음 위치"
            hint="이동 방식·이동 시간은 계약 승인 후 입력할 수 있습니다."
            value={step.nextLocation ?? ""}
            onChange={(e) => set({ nextLocation: e.target.value === "" ? null : e.target.value })}
          >
            <option value="">미정</option>
            {locationOptions.map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.code} {opt.name}
              </option>
            ))}
          </SelectField>
        </Section>
      </fieldset>
    </div>
  );
});
