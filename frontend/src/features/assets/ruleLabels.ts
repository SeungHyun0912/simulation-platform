import type { DispatchRule, ReleaseRule } from "./assetView";

/**
 * 배출 규칙 코드의 한국어 표시. 코드값은 계약 0.2.0 그대로이며 라벨만 FE가 정한다(BE-REQ-008).
 * `confirmed`는 사용자 확정 결정(D-U05·D-U06)에 해당함을, `unknown`은 미정(OPEN-003)을 뜻한다.
 */
export type RuleLine = {
  name: string;
  text: string;
  /** confirmed: 사용자 확정 / unknown: 미정 / plain: 일반 선택값 */
  tone: "confirmed" | "unknown" | "plain";
  /** 근거 표시(예: D-U05) */
  basis?: string;
};

export function describeDispatch(rule: DispatchRule): RuleLine[] {
  if (rule.mode === "unknown")
    return [{ name: "이동 조건", text: "미정", tone: "unknown", basis: "OPEN-003" }];
  return [
    {
      name: "이동 조건",
      text: "목적지 설비가 가용할 때 이동",
      tone: "confirmed",
      basis: "D-U05",
    },
    {
      name: "사용 중일 때",
      text: rule.waitAtInIfBusy ? "목적지가 사용 중이면 IN에서 대기" : "IN에서 대기하지 않음",
      tone: rule.waitAtInIfBusy ? "confirmed" : "plain",
      basis: rule.waitAtInIfBusy ? "D-U05" : undefined,
    },
    {
      name: "이동 중 설비 예약",
      text: { unknown: "미정", reserve: "이동 중 예약", none: "예약하지 않음" }[rule.reservation],
      tone: rule.reservation === "unknown" ? "unknown" : "plain",
      basis: rule.reservation === "unknown" ? "OPEN-003" : undefined,
    },
  ];
}

export function describeRelease(rule: ReleaseRule): RuleLine[] {
  if (rule.mode === "unknown")
    return [{ name: "배출 조건", text: "미정", tone: "unknown", basis: "OPEN-003" }];
  return [
    {
      name: "배출 조건",
      text: "목적지가 수용할 때 OUT에서 배출",
      tone: "confirmed",
      basis: "D-U06",
    },
    {
      name: "대기 중 설비 점유",
      text: {
        unknown: "미정",
        yes: "OUT 대기 중 설비 점유",
        no: "점유하지 않음",
      }[rule.blockMachineWhileWaiting],
      tone: rule.blockMachineWhileWaiting === "unknown" ? "unknown" : "plain",
      basis: rule.blockMachineWhileWaiting === "unknown" ? "OPEN-003" : undefined,
    },
  ];
}
