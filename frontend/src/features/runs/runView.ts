import type { Schemas } from "../../shared/api/types";

export type RunOut = Schemas["RunOut"];
export type RunListItem = Schemas["RunListItem"];
export type RunResult = NonNullable<RunOut["result"]>;

/**
 * 실행 상태. `queued`·`running`은 진행 중이고 그 밖의 값은 종료다. 종료 상태는 다시 바뀌지 않는다.
 * `stalled`는 실행 실패가 아니라 "더 진행할 수 없는 상태"(입력 부족)이며 결과에 부족한 입력이 담긴다.
 * 서버가 모르는 값을 보내도 원문을 그대로 보여 준다(열린 목록).
 */
export const RUN_STATUS_LABELS: Record<string, { text: string; mark: string; tone: string }> = {
  queued: { text: "대기 중", mark: "…", tone: "info" },
  running: { text: "실행 중", mark: "▶", tone: "info" },
  completed: { text: "완료", mark: "✓", tone: "success" },
  stalled: { text: "입력 부족으로 멈춤", mark: "⏸", tone: "warning" },
  horizon_reached: { text: "지평선 도달", mark: "⏹", tone: "success" },
  limit_reached: { text: "이벤트 한도 도달", mark: "⚠", tone: "warning" },
  failed: { text: "실패", mark: "✕", tone: "danger" },
  cancelled: { text: "취소됨", mark: "⊘", tone: "neutral" },
};

export const isActiveRun = (status: string) => status === "queued" || status === "running";

/** 종료 사유·결과 상태는 열린 문자열이다. 아는 것만 한국어로 풀고 나머지는 원문을 보인다. */
export const TERMINATION_REASON_LABELS: Record<string, string> = {
  CANCELLED_BEFORE_START: "시작 전에 취소됨",
  CANCELLED: "실행 중 취소됨",
  WALL_TIMEOUT: "실행 시간 제한 초과",
  ENGINE_ERROR: "엔진 오류",
  WORKER_LOST: "실행 담당(worker)이 사라짐",
  SNAPSHOT_HASH_MISMATCH: "입력 스냅샷 해시 불일치",
  COMPILE_FAILED: "공정 컴파일 실패",
};
export const terminationText = (r: string | null | undefined) => (r ? (TERMINATION_REASON_LABELS[r] ?? r) : "");

export const ATTEMPT_STATE_LABELS: Record<string, string> = {
  running: "실행 중",
  finished: "끝남",
  failed: "실패",
  cancelled: "취소됨",
  abandoned: "버려짐(worker 소실)",
};

/** 가상 시간(분): 표시는 `min`(소수 6자리 반올림), 정확한 값은 `exact`(분수 문자열)이다. */
export const minutesText = (m: { min: string; exact: string } | null | undefined) => (m ? `${m.min}분` : "없음");

/** 실행 요청 본문 서명. 같은 본문의 재시도는 같은 Idempotency-Key를 쓰고 본문이 바뀌면 새 키를 쓴다. */
export const requestSignature = (scenarioVersionId: string, seed: number, replicateIndex: number) => `${scenarioVersionId}|${seed}|${replicateIndex}`;

export const SEED_MAX = 2 ** 31 - 1;
export function parseNonNegativeInt(s: string): number | null {
  if (!/^[0-9]+$/.test(s.trim())) return null;
  const n = Number(s);
  return n <= SEED_MAX ? n : null;
}
