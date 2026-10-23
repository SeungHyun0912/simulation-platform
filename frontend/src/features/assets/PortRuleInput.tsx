import { useState } from "react";
import { CheckboxField, SelectField } from "../../shared/components/Fields";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import type { DispatchRule, ReleaseRule } from "./assetView";
import styles from "./AssetDetailPage.module.css";

type Props = {
  portRole: string;
  dispatch: DispatchRule;
  release: ReleaseRule;
  onDispatch: (next: DispatchRule) => void;
  onRelease: (next: ReleaseRule) => void;
  disabled?: boolean;
  dispatchError?: string | null;
  releaseError?: string | null;
};

/** "미정"에서 확정 규칙으로 바꿀 때의 시작값. D-U05(사용 중이면 IN에서 대기)·D-U06 확정 결정을 따르고 나머지는 미정이다. */
const DEFAULT_DISPATCH = {
  mode: "when_destination_available",
  reservation: "unknown",
  waitAtInIfBusy: true,
} satisfies DispatchRule;
const DEFAULT_RELEASE = { mode: "when_destination_accepts", blockMachineWhileWaiting: "unknown" } satisfies ReleaseRule;

const hasDispatchDetail = (r: DispatchRule) =>
  r.mode !== "unknown" && (r.reservation !== "unknown" || r.waitAtInIfBusy !== DEFAULT_DISPATCH.waitAtInIfBusy);
const hasReleaseDetail = (r: ReleaseRule) => r.mode !== "unknown" && r.blockMachineWhileWaiting !== "unknown";

/**
 * 포트 하나의 이동·배출 규칙 입력(확장 제안 CR 승인). 규칙은 판별 객체이며 서버에는 통째로 교체되어 전달된다.
 * 확정 결정(D-U05·D-U06)과 미정(OPEN-003)을 라벨로 구분하고, 세부 값을 버리게 되는 "미정"으로의 변경은 확인을 받는다.
 */
export function PortRuleInput({
  portRole,
  dispatch,
  release,
  onDispatch,
  onRelease,
  disabled,
  dispatchError,
  releaseError,
}: Props) {
  const [pending, setPending] = useState<null | "dispatch" | "release">(null);

  return (
    <div className={styles.ruleEditor}>
      <fieldset disabled={disabled} className={styles.ruleGroup}>
        <legend>{portRole} 이동 규칙</legend>
        <SelectField
          label={`${portRole} 이동 조건`}
          value={dispatch.mode}
          error={dispatchError}
          onChange={(e) => {
            if (e.target.value === "unknown") {
              if (hasDispatchDetail(dispatch)) setPending("dispatch");
              else onDispatch({ mode: "unknown" });
            } else if (dispatch.mode === "unknown") onDispatch(DEFAULT_DISPATCH);
          }}
        >
          <option value="unknown">미정 (OPEN-003)</option>
          <option value="when_destination_available">목적지 설비가 가용할 때 이동 (D-U05 확정)</option>
        </SelectField>
        {dispatch.mode === "when_destination_available" && (
          <>
            <CheckboxField
              label={`${portRole} 목적지가 사용 중이면 IN에서 대기 (D-U05)`}
              checked={dispatch.waitAtInIfBusy}
              onChange={(e) => onDispatch({ ...dispatch, waitAtInIfBusy: e.target.checked })}
            />
            <SelectField
              label={`${portRole} 이동 중 설비 예약`}
              value={dispatch.reservation}
              onChange={(e) => onDispatch({ ...dispatch, reservation: e.target.value as typeof dispatch.reservation })}
            >
              <option value="unknown">미정 (OPEN-003)</option>
              <option value="reserve">이동 중 예약</option>
              <option value="none">예약하지 않음</option>
            </SelectField>
          </>
        )}
      </fieldset>

      <fieldset disabled={disabled} className={styles.ruleGroup}>
        <legend>{portRole} 배출 규칙</legend>
        <SelectField
          label={`${portRole} 배출 조건`}
          value={release.mode}
          error={releaseError}
          onChange={(e) => {
            if (e.target.value === "unknown") {
              if (hasReleaseDetail(release)) setPending("release");
              else onRelease({ mode: "unknown" });
            } else if (release.mode === "unknown") onRelease(DEFAULT_RELEASE);
          }}
        >
          <option value="unknown">미정 (OPEN-003)</option>
          <option value="when_destination_accepts">목적지가 수용할 때 OUT에서 배출 (D-U06 확정)</option>
        </SelectField>
        {release.mode === "when_destination_accepts" && (
          <SelectField
            label={`${portRole} 대기 중 설비 점유`}
            value={release.blockMachineWhileWaiting}
            onChange={(e) =>
              onRelease({ ...release, blockMachineWhileWaiting: e.target.value as typeof release.blockMachineWhileWaiting })
            }
          >
            <option value="unknown">미정 (OPEN-003)</option>
            <option value="yes">OUT 대기 중 설비 점유</option>
            <option value="no">점유하지 않음</option>
          </SelectField>
        )}
      </fieldset>

      <ConfirmDialog
        open={pending !== null}
        title="규칙을 미정으로 바꿀까요?"
        confirmLabel="미정으로 변경"
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending === "dispatch") onDispatch({ mode: "unknown" });
          if (pending === "release") onRelease({ mode: "unknown" });
          setPending(null);
        }}
      >
        지금 입력한 세부 값(대기·예약·점유)이 지워집니다. 저장하기 전에는 서버에 반영되지 않으며, 되돌리기로 복구할 수 있습니다.
      </ConfirmDialog>
    </div>
  );
}
