import { forwardRef, useState } from "react";
import { Button } from "../../shared/components/Button";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { SelectField, TextField } from "../../shared/components/Fields";
import { FieldGrid, Note, Section } from "../../shared/components/Layout";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import { CountField, MeasureField } from "./MeasureField";
import { MaterialSpecEditor } from "./MaterialSpecEditor";
import { ResourceEditor } from "./ResourceEditor";
import {
  stepOf,
  type DurationMeasure,
  type GraphNode,
  type NextLocation,
  type OutputRule,
  type Processing,
  type StepDto,
} from "./processDoc";
import {
  ACCOUNTING_LABELS,
  ACQUIRE_SCOPE_LABELS,
  BASIS_LABELS,
  CONSUME_POLICY_LABELS,
  HANDOFF_LABELS,
  INCLUDES_SETUP_LABELS,
  JOIN_MODE_LABELS,
  KNOWN_HANDLERS,
  OCCUPANCY_LABELS,
  OUTPUT_MODE_LABELS,
  OUTPUT_SCHEDULE_LABELS,
  PROCESSING_LABELS,
  QUANTITY_BASIS_LABELS,
  RESIDUAL_ACTION_LABELS,
  RESIDUAL_MODE_LABELS,
  RESIDUAL_SCOPE_LABELS,
  SCALING_LABELS,
  SCHEDULE_LABELS,
  TRIGGER_LABELS,
  measureText,
  type OutputMode,
  type ProcessingKind,
} from "./processView";
import type { AssetOption } from "./queries";
import type { MaterialOptions } from "../materials/queries";
import styles from "./StepEditPanel.module.css";

type Props = {
  node: GraphNode;
  readOnly: boolean;
  /** 이 단계에 대한 서버 검증 결과·거부 메시지 */
  issues: ValidationIssue[];
  equipmentOptions: AssetOption[];
  spaceOptions: AssetOption[];
  assetById: Map<string, AssetOption>;
  optionsComplete: boolean;
  /** 재료 spec에서 고를 재료 선택지 */
  materials: MaterialOptions;
  /** 이 단계의 spec 중 간선이 연결해 둔 key(지울 수 없다) */
  linkedSpecKeys: ReadonlySet<string>;
  /** 직선 구조일 때만 값이 있다. 없으면 "다음 위치" 구역을 편집하지 않는다. */
  nextLocation: NextLocation | null;
  onLabel: (label: string) => void;
  onStep: (fn: (s: StepDto) => StepDto) => void;
  onNext: (next: NextLocation) => void;
  onClose: () => void;
};

function EnumSelect<T extends string>({
  label,
  value,
  labels,
  onChange,
  hint,
}: {
  label: string;
  value: T | undefined;
  labels: Record<T, string>;
  onChange: (v: T) => void;
  hint?: string;
}) {
  return (
    <SelectField label={label} hint={hint} value={value ?? ("unknown" as T)} onChange={(e) => onChange(e.target.value as T)}>
      {(Object.keys(labels) as T[]).map((k) => (
        <option key={k} value={k}>
          {labels[k]}
        </option>
      ))}
    </SelectField>
  );
}

const isKnown = (m: { mode?: string } | null | undefined) => m?.mode === "known";

/** 처리 방식을 바꿀 때 이어받을 수 있는 값은 이어받고, 버려지는 확정 값은 목록으로 돌려준다. */
function switchProcessing(prev: Processing, kind: ProcessingKind): { next: Processing; lost: string[] } {
  const lost: string[] = [];
  const keep = (name: string, v: unknown) => {
    if (v !== undefined && v !== "unknown") lost.push(name);
  };
  const schedule = prev.kind === "output_speed" || prev.kind === "per_output_unit" ? prev.output_schedule : undefined;
  const duration = prev.kind === "per_output_unit" || prev.kind === "per_reference_length" ? prev.duration_min : undefined;

  // 이어받지 못하는 이전 값을 알린다.
  if (prev.kind === "output_speed" && kind !== "output_speed") {
    if (isKnown(prev.speed_m_per_min)) lost.push(`선속: ${measureText(prev.speed_m_per_min, "m/분")}`);
    if (isKnown(prev.parallel_streams)) lost.push(`병렬 스트림 수: ${measureText(prev.parallel_streams, "개")}`);
    keep("기준(스트림별/합산)", prev.basis);
  }
  if (prev.kind === "per_reference_length" && kind !== "per_reference_length") {
    if (isKnown(prev.reference_length_m)) lost.push(`기준 길이: ${measureText(prev.reference_length_m, "m")}`);
    keep("길이 비례 여부", prev.scaling);
    keep("준비 시간 포함 여부", prev.includes_setup);
  }
  if (kind !== "per_output_unit" && kind !== "per_reference_length" && duration && isKnown(duration))
    lost.push(`시간: ${measureText(duration, "분")}`);
  if (kind !== "output_speed" && kind !== "per_output_unit" && schedule && schedule !== "unknown")
    lost.push(`산출 방식 순서: ${OUTPUT_SCHEDULE_LABELS[schedule]}`);

  switch (kind) {
    case "unknown":
    case "none":
      return { next: { kind }, lost };
    case "output_speed":
      return {
        next: {
          kind,
          speed_m_per_min: prev.kind === "output_speed" ? prev.speed_m_per_min : { mode: "unknown" },
          basis: prev.kind === "output_speed" ? prev.basis : "unknown",
          output_schedule: schedule ?? "unknown",
          parallel_streams: prev.kind === "output_speed" ? prev.parallel_streams : { mode: "unknown" },
        },
        lost,
      };
    case "per_output_unit":
      return { next: { kind, duration_min: duration ?? { mode: "unknown" }, output_schedule: schedule ?? "unknown" }, lost };
    case "per_reference_length":
      return {
        next: {
          kind,
          duration_min: duration ?? { mode: "unknown" },
          reference_length_m: prev.kind === "per_reference_length" ? prev.reference_length_m : { mode: "unknown" },
          scaling: prev.kind === "per_reference_length" ? prev.scaling : "unknown",
          includes_setup: prev.kind === "per_reference_length" ? prev.includes_setup : "unknown",
        },
        lost,
      };
  }
}

/** 산출 방식별로 쓰는 값. 쓰지 않는 값은 남기지 않는다(방식을 바꾸면 미정으로 되돌린다). */
const USES: Record<OutputMode, { length: boolean; weight: boolean; count: boolean }> = {
  unknown: { length: false, weight: false, count: false },
  configured_units: { length: true, weight: false, count: true },
  split_length: { length: true, weight: false, count: false },
  pass_through: { length: false, weight: false, count: false },
  merge_strands: { length: false, weight: false, count: true },
  fixed_mass_units: { length: false, weight: true, count: true },
};

type Trigger = keyof typeof TRIGGER_LABELS;

/**
 * 준비·공급 대기 시점을 바꿀 때 시간 값을 시점과 어긋나지 않게 정리한다.
 * 해당 없음이면 시간도 해당 없음, 미정이면 미정이고, 해당 없음이던 시간이 실제 시점으로 바뀌면 미정에서 시작한다(0분이 아니다).
 * 확정한 시간이 사라질 때는 호출한 쪽이 확인을 받는다.
 */
function durationFor(prev: DurationMeasure | undefined, trigger: Trigger): { next: DurationMeasure; lost: boolean } {
  if (trigger === "not_applicable") return { next: { mode: "not_applicable" }, lost: prev?.mode === "known" };
  if (trigger === "unknown") return { next: { mode: "unknown" }, lost: prev?.mode === "known" };
  return { next: prev && prev.mode === "known" ? prev : { mode: "unknown" }, lost: false };
}

/** 선택한 단계 하나를 편집하는 패널. 열리면 제목으로 포커스가 이동한다. */
export const StepEditPanel = forwardRef<HTMLHeadingElement, Props>(function StepEditPanel(
  {
    node,
    readOnly,
    issues,
    equipmentOptions,
    spaceOptions,
    assetById,
    optionsComplete,
    materials,
    linkedSpecKeys,
    nextLocation,
    onLabel,
    onStep,
    onNext,
    onClose,
  },
  headingRef,
) {
  const step = stepOf(node);
  const timing = step.timing_rule!;
  const processing = timing.processing!;
  const setup = timing.setup!;
  const delay = timing.precondition_delay!;
  const out = step.output_rule!;
  const input = step.input_rule!;
  const residual = step.residual_rule!;

  // 방식을 바꾸면 입력한 값이 사라질 때는 먼저 확인한다. 취소하면 선택은 그대로 유지된다.
  const [pending, setPending] = useState<{ lost: string[]; apply: () => void } | null>(null);
  const confirmIfLost = (lost: string[], apply: () => void) => (lost.length === 0 ? apply() : setPending({ lost, apply }));

  const setTiming = (patch: Partial<NonNullable<StepDto["timing_rule"]>>) =>
    onStep((s) => ({ ...s, timing_rule: { ...s.timing_rule!, ...patch } }));
  const setOut = (patch: Partial<OutputRule>) => onStep((s) => ({ ...s, output_rule: { ...s.output_rule!, ...patch } }));

  function changeProcessing(kind: ProcessingKind) {
    const { next, lost } = switchProcessing(processing, kind);
    confirmIfLost(lost, () => setTiming({ processing: next }));
  }

  function changeOutputMode(mode: OutputMode) {
    const uses = USES[mode];
    const lost: string[] = [];
    if (!uses.length && isKnown(out.length_m)) lost.push(`산출 길이: ${measureText(out.length_m, "m")}`);
    if (!uses.weight && isKnown(out.weight_kg)) lost.push(`산출 중량: ${measureText(out.weight_kg, "kg")}`);
    if (!uses.count && isKnown(out.unit_count)) lost.push(`산출 수량: ${measureText(out.unit_count, "단위")}`);
    confirmIfLost(lost, () =>
      setOut({
        mode,
        length_m: uses.length ? out.length_m : { mode: "unknown" },
        weight_kg: uses.weight ? out.weight_kg : { mode: "unknown" },
        unit_count: uses.count ? out.unit_count : { mode: "unknown" },
      }),
    );
  }

  const uses = USES[out.mode ?? "unknown"];
  const nextValue = !nextLocation ? "" : nextLocation.kind === "none" ? "none" : nextLocation.kind === "unset" ? "unset" : nextLocation.assetId;

  return (
    <div className={styles.panel}>
      <ConfirmDialog
        open={pending !== null}
        title="입력한 값이 사라집니다"
        confirmLabel="값을 버리고 변경"
        cancelLabel="취소"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          pending?.apply();
          setPending(null);
        }}
      >
        <p>방식을 바꾸면 아래 값이 지워집니다. 지워진 값은 되돌리기 전에는 복구되지 않습니다.</p>
        <ul>
          {pending?.lost.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </ConfirmDialog>
      <div className={styles.head}>
        <h2 ref={headingRef} tabIndex={-1} className={styles.title}>
          단계 편집: {node.label || "(이름 없음)"}
        </h2>
        <Button onClick={onClose}>편집 닫기</Button>
      </div>
      {readOnly && <Note>읽기 전용입니다. 승인되었거나 검토 중인 버전은 수정할 수 없습니다.</Note>}
      {issues.length > 0 && (
        // 같은 항목은 화면 위쪽 검증 결과에도 있다. 알림 영역을 중복해 만들지 않고 이 단계의 항목만 목록으로 보여 준다.
        <section aria-label="이 단계의 검증 항목">
          <ul>
            {issues.map((i, n) => (
              <li key={`${i.rule_id ?? "i"}-${n}`}>
                <strong>{i.severity === "error" ? "오류" : "경고"}</strong> {i.message}
              </li>
            ))}
          </ul>
        </section>
      )}
      <fieldset className={styles.fieldset} disabled={readOnly}>
        <Section id="step-basic" title="기본">
          <FieldGrid>
            <TextField
              label="공정명"
              value={node.label}
              error={node.label.trim() === "" ? "공정명을 입력하세요." : null}
              onChange={(e) => onLabel(e.target.value)}
            />
            <TextField
              label="작업 종류(operation_type)"
              hint={`엔진이 지원하는 값: ${KNOWN_HANDLERS.join(", ")}. 등록은 아무 문자열이나 가능하고 실행 가능 여부는 서버가 판정합니다.`}
              list="known-handlers"
              value={step.operation_type ?? ""}
              onChange={(e) => onStep((s) => ({ ...s, operation_type: e.target.value === "" ? null : e.target.value }))}
            />
            <TextField
              label="처리기 버전(handler_version)"
              hint="비우면 입력 없음(미정)입니다."
              value={step.handler_version ?? ""}
              onChange={(e) => onStep((s) => ({ ...s, handler_version: e.target.value === "" ? null : e.target.value }))}
            />
          </FieldGrid>
          <datalist id="known-handlers">
            {KNOWN_HANDLERS.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        </Section>

        <Section id="step-resources" title="설비·자원">
          <ResourceEditor
            requirements={step.resources ?? []}
            onChange={(resources) => onStep((s) => ({ ...s, resources }))}
            equipmentOptions={equipmentOptions}
            assetById={assetById}
            optionsComplete={optionsComplete}
          />
        </Section>

        <Section id="step-processing" title="처리 시간">
          <SelectField label="처리 방식" value={processing.kind} onChange={(e) => changeProcessing(e.target.value as ProcessingKind)}>
            {(Object.keys(PROCESSING_LABELS) as ProcessingKind[]).map((k) => (
              <option key={k} value={k}>
                {PROCESSING_LABELS[k]}
              </option>
            ))}
          </SelectField>
          {processing.kind === "output_speed" && (
            <>
              <MeasureField
                label="선속"
                unit="m_per_min"
                kind="positive"
                allowNotApplicable={false}
                value={processing.speed_m_per_min}
                onChange={(m) => setTiming({ processing: { ...processing, speed_m_per_min: m } })}
              />
              <EnumSelect
                label="선속 기준"
                labels={BASIS_LABELS}
                value={processing.basis}
                onChange={(basis) => setTiming({ processing: { ...processing, basis } })}
              />
              <EnumSelect
                label="산출 순서"
                labels={OUTPUT_SCHEDULE_LABELS}
                value={processing.output_schedule}
                onChange={(output_schedule) => setTiming({ processing: { ...processing, output_schedule } })}
              />
              <CountField
                label="병렬 스트림 수"
                unitLabel="개"
                value={processing.parallel_streams}
                onChange={(m) => setTiming({ processing: { ...processing, parallel_streams: m } })}
              />
            </>
          )}
          {processing.kind === "per_output_unit" && (
            <>
              <MeasureField
                label="산출 단위당 시간"
                unit="min"
                kind="positive"
                allowNotApplicable={false}
                value={processing.duration_min}
                onChange={(m) => setTiming({ processing: { ...processing, duration_min: m } })}
              />
              <EnumSelect
                label="산출 순서"
                labels={OUTPUT_SCHEDULE_LABELS}
                value={processing.output_schedule}
                onChange={(output_schedule) => setTiming({ processing: { ...processing, output_schedule } })}
              />
            </>
          )}
          {processing.kind === "per_reference_length" && (
            <>
              <MeasureField
                label="기준 길이"
                unit="m"
                kind="positive"
                allowNotApplicable={false}
                value={processing.reference_length_m}
                onChange={(m) => setTiming({ processing: { ...processing, reference_length_m: m } })}
              />
              <MeasureField
                label="기준 길이당 시간"
                unit="min"
                kind="positive"
                allowNotApplicable={false}
                value={processing.duration_min}
                onChange={(m) => setTiming({ processing: { ...processing, duration_min: m } })}
              />
              <EnumSelect
                label="길이 비례 여부"
                labels={SCALING_LABELS}
                value={processing.scaling}
                onChange={(scaling) => setTiming({ processing: { ...processing, scaling } })}
              />
              <EnumSelect
                label="준비 시간 포함 여부"
                labels={INCLUDES_SETUP_LABELS}
                value={processing.includes_setup}
                onChange={(includes_setup) => setTiming({ processing: { ...processing, includes_setup } })}
              />
              <Note>다른 길이로 비례 계산하지 않습니다. 비례 여부는 확인되기 전까지 미정입니다.</Note>
            </>
          )}
          <Note>
            선속(m/분)은 분당 처리 길이이고, 보빈당 길이(예: 1,000 m)와 다른 값입니다. 미정은 0이 아닙니다.
          </Note>
        </Section>

        <Section id="step-setup" title="준비·공급 대기">
          <EnumSelect
            label="준비 시점"
            labels={TRIGGER_LABELS}
            value={setup.trigger}
            onChange={(trigger) => {
              const { next, lost } = durationFor(setup.duration_min, trigger);
              confirmIfLost(lost ? [`준비 시간: ${measureText(setup.duration_min, "분")}`] : [], () =>
                setTiming({ setup: { trigger, duration_min: next } }),
              );
            }}
          />
          {setup.trigger !== "unknown" && setup.trigger !== "not_applicable" && (
            <MeasureField
              label="준비 시간"
              unit="min"
              kind="nonnegative"
              value={setup.duration_min}
              onChange={(m) => setTiming({ setup: { ...setup, duration_min: m } })}
            />
          )}
          <EnumSelect
            label="공급 대기 시점"
            labels={TRIGGER_LABELS}
            value={delay.trigger}
            onChange={(trigger) => {
              const { next, lost } = durationFor(delay.duration_min, trigger);
              confirmIfLost(lost ? [`공급 대기 시간: ${measureText(delay.duration_min, "분")}`] : [], () =>
                setTiming({ precondition_delay: { ...delay, trigger, duration_min: next } }),
              );
            }}
          />
          {delay.trigger !== "unknown" && delay.trigger !== "not_applicable" && (
            <>
              <MeasureField
                label="공급 대기 시간"
                unit="min"
                kind="nonnegative"
                value={delay.duration_min}
                onChange={(m) => setTiming({ precondition_delay: { ...delay, duration_min: m } })}
              />
              <EnumSelect
                label="대기 중 설비 점유"
                labels={OCCUPANCY_LABELS}
                value={delay.occupancy}
                onChange={(occupancy) => setTiming({ precondition_delay: { ...delay, occupancy } })}
              />
            </>
          )}
          <Note>준비·대기 시간은 0분이 유효한 값이며 미정과 다릅니다.</Note>
        </Section>

        <Section id="step-output" title="산출">
          <SelectField label="산출 방식" value={out.mode ?? "unknown"} onChange={(e) => changeOutputMode(e.target.value as OutputMode)}>
            {(Object.keys(OUTPUT_MODE_LABELS) as OutputMode[]).map((k) => (
              <option key={k} value={k}>
                {OUTPUT_MODE_LABELS[k]}
              </option>
            ))}
          </SelectField>
          {uses.length && (
            <MeasureField label="산출 길이" unit="m" kind="positive" allowNotApplicable={false} value={out.length_m} onChange={(m) => setOut({ length_m: m })} />
          )}
          {uses.weight && (
            <MeasureField label="산출 중량" unit="kg" kind="positive" allowNotApplicable={false} value={out.weight_kg} onChange={(m) => setOut({ weight_kg: m })} />
          )}
          {uses.count && (
            <CountField label="산출 수량" value={out.unit_count} onChange={(m) => setOut({ unit_count: m })} />
          )}
          <TextField
            label="산출 단위 형태(unit_form)"
            hint="예: 보빈. 비우면 입력 없음입니다. 길이·중량·보빈 수·가닥 수는 서로 환산하지 않습니다."
            value={out.unit_form ?? ""}
            onChange={(e) => setOut({ unit_form: e.target.value === "" ? null : e.target.value })}
          />
          <EnumSelect label="수량 기준" labels={QUANTITY_BASIS_LABELS} value={out.quantity_basis} onChange={(quantity_basis) => setOut({ quantity_basis })} />
          <EnumSelect label="산출 일정" labels={SCHEDULE_LABELS} value={out.schedule} onChange={(schedule) => setOut({ schedule })} />
          <EnumSelect label="수량 계산 방식" labels={ACCOUNTING_LABELS} value={out.accounting_mode} onChange={(accounting_mode) => setOut({ accounting_mode })} />
          <Note>산출 수량은 한 작업의 설정이며 전체 생산 목표가 아닙니다. 작업당·총 계획 수량은 수량 기준으로 구분합니다.</Note>
        </Section>

        <Section id="step-materials" title="투입·산출 재료">
          <MaterialSpecEditor
            specs={step.material_specs ?? []}
            onChange={(material_specs) => onStep((s) => ({ ...s, material_specs }))}
            materials={materials}
            linkedKeys={linkedSpecKeys}
          />
        </Section>

        <Section id="step-flow" title="투입·인계·잔여">
          <FieldGrid>
            <EnumSelect
              label="투입 획득 범위"
              labels={ACQUIRE_SCOPE_LABELS}
              value={input.acquire_scope}
              onChange={(acquire_scope) => onStep((s) => ({ ...s, input_rule: { ...s.input_rule!, acquire_scope } }))}
            />
            <EnumSelect
              label="투입 소비 방식"
              labels={CONSUME_POLICY_LABELS}
              value={input.consume_policy}
              onChange={(consume_policy) => onStep((s) => ({ ...s, input_rule: { ...s.input_rule!, consume_policy } }))}
            />
            <EnumSelect
              label="인계 방식"
              labels={HANDOFF_LABELS}
              value={step.handoff_rule?.mode}
              onChange={(mode) => onStep((s) => ({ ...s, handoff_rule: { ...s.handoff_rule!, mode } }))}
            />
            <EnumSelect
              label="잔여 처리"
              labels={RESIDUAL_MODE_LABELS}
              value={residual.mode}
              onChange={(mode) => onStep((s) => ({ ...s, residual_rule: { ...s.residual_rule!, mode } }))}
            />
            <EnumSelect
              label="잔여 범위"
              labels={RESIDUAL_SCOPE_LABELS}
              value={residual.scope}
              onChange={(scope) => onStep((s) => ({ ...s, residual_rule: { ...s.residual_rule!, scope } }))}
            />
            <EnumSelect
              label="제품 교체 시 잔여"
              labels={RESIDUAL_ACTION_LABELS}
              value={residual.on_product_change}
              onChange={(on_product_change) => onStep((s) => ({ ...s, residual_rule: { ...s.residual_rule!, on_product_change } }))}
            />
            <EnumSelect
              label="실행 종료 시 잔여"
              labels={RESIDUAL_ACTION_LABELS}
              value={residual.on_run_end}
              onChange={(on_run_end) => onStep((s) => ({ ...s, residual_rule: { ...s.residual_rule!, on_run_end } }))}
            />
            <EnumSelect
              label="물리 합류 방식"
              labels={JOIN_MODE_LABELS}
              value={residual.physical_join_mode}
              onChange={(physical_join_mode) => onStep((s) => ({ ...s, residual_rule: { ...s.residual_rule!, physical_join_mode } }))}
            />
          </FieldGrid>
          <Note>모든 값의 기본은 미정입니다. 확인되기 전에는 미정으로 두세요.</Note>
        </Section>

        {nextLocation && (
          <Section id="step-next" title="대기 위치">
            <SelectField
              label="다음 위치"
              hint="이동 방식·이동 시간은 이 화면에서 바꾸지 않고 보존합니다. '위치 미정'은 대기 공간은 있으나 어디인지 모르는 경우이고 '공간 없음'과 다릅니다."
              value={nextValue}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "none") onNext({ kind: "none" });
                else if (v === "unset") onNext({ kind: "unset" });
                else {
                  const a = assetById.get(v);
                  onNext({ kind: "asset", assetId: v, label: a ? `${a.code} ${a.name}` : v.slice(0, 8) });
                }
              }}
            >
              <option value="none">공간 없음 (바로 다음 단계)</option>
              <option value="unset">대기 공간 있음 · 위치 미정</option>
              {spaceOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} {o.name}
                </option>
              ))}
              {nextLocation.kind === "asset" && !spaceOptions.some((o) => o.id === nextLocation.assetId) && (
                <option value={nextLocation.assetId}>{nextLocation.label} (선택지에 없음)</option>
              )}
            </SelectField>
          </Section>
        )}
      </fieldset>
    </div>
  );
});
