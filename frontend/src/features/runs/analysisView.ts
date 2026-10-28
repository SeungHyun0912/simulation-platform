import type { Schemas } from "../../shared/api/types";

/**
 * 실행 분석(병목·설비 타임라인·비교) 화면 도우미. 숫자는 서버가 decimal 문자열로 주며 화면은 표시용으로만 반올림한다
 * (정확한 값은 title로 남긴다). null은 0이 아니라 "해당 없음/비교 불가"다.
 */
export type Bottleneck = Schemas["BottleneckOut"];

export function numberText(s: string | null | undefined, digits = 1): string {
  if (s === null || s === undefined || s === "") return "해당 없음";
  const n = Number(s);
  return Number.isFinite(n) ? n.toLocaleString("ko-KR", { maximumFractionDigits: digits }) : s;
}

/** 비율(0~1 decimal 문자열) → "12.3%" */
export function percentText(s: string | null | undefined, digits = 1): string {
  if (s === null || s === undefined || s === "") return "해당 없음";
  const n = Number(s);
  return Number.isFinite(n) ? `${(n * 100).toLocaleString("ko-KR", { maximumFractionDigits: digits })}%` : s;
}

/** 병목 종류(사용자 판정 기준, 04 §5.5). 순서는 서버 순위의 종류 순서와 같다. 모르는 종류는 원문을 보인다. */
export const BOTTLENECK_KINDS: { kind: string; title: string; desc: string }[] = [
  { kind: "space_full", title: "저장 공간 부족", desc: "다음 저장 공간에 자리가 없어 이동이 멈춘 곳(자리를 기다린 시간, 단계 출력이 막힌 시간)" },
  { kind: "equipment_busy", title: "설비 가동 대기", desc: "입력을 확보한 뒤 다음 설비가 바빠 배정을 기다린 곳" },
  { kind: "queue_pileup", title: "대기 자재 적체", desc: "운반이 한 번에 1제품이라 대기 공간에 자재가 여러 개 쌓인 곳" },
];
export const kindTitle = (k: string) => BOTTLENECK_KINDS.find((x) => x.kind === k)?.title ?? k;

/** 수준: 같은 종류 안 비율 기준(high ≥ 30%, medium ≥ 10%). 색과 함께 기호·글자로 구분한다. */
export const LEVEL_LABELS: Record<string, { text: string; mark: string; tone: string }> = {
  high: { text: "높음", mark: "!", tone: "danger" },
  medium: { text: "중간", mark: "⚠", tone: "warning" },
  low: { text: "낮음", mark: "○", tone: "neutral" },
};

/** 병목 위치: 제품·단계 또는 대기 공간 */
export function locationText(l: Schemas["BottleneckLocationOut"]): string {
  const product = l.product_code ? `${l.product_code}${l.product_name ? ` ${l.product_name}` : ""}` : "";
  const step = l.step_label ?? l.step_key ?? "";
  const node = l.node_label ?? l.node_key ?? "";
  return [product, step ? `단계 ${step}` : "", node ? `대기 공간 ${node}` : ""].filter(Boolean).join(" · ") || "위치 정보 없음";
}

/** 근거(evidence)는 종류마다 다른 열린 구조다. 아는 키는 한국어로, 모르는 키는 원문으로 한 줄씩 보인다. */
const EVIDENCE_LABELS: Record<string, string> = {
  equipment_wait_avg_min: "설비 대기 평균(분)",
  equipment_wait_max_min: "설비 대기 최대(분)",
  operations: "작업 수",
  processing_time_min: "처리 시간(분)",
  input_wait_item_min: "입력 대기(작업물·분)",
  peak_items: "최대 적체(개)",
  average_items: "평균 적체(개)",
  wait_avg_min: "대기 평균(분)",
  wait_max_min: "대기 최대(분)",
  transport_related: "다음 단계가 운반",
  carriers: "운반 단계",
  assets: "후보 설비",
  space_wait_item_min: "공간 대기(작업물·분)",
  step_blocked_item_min: "출력 막힘(작업물·분)",
};
export function evidenceLines(ev: Record<string, unknown>): { key: string; label: string; text: string }[] {
  const val = (v: unknown): string => {
    if (v === null || v === undefined) return "해당 없음";
    if (typeof v === "boolean") return v ? "예" : "아니요";
    if (typeof v === "string") return /^-?\d+(\.\d+)?$/.test(v) ? numberText(v) : v;
    if (typeof v === "number") return numberText(String(v));
    if (Array.isArray(v)) return v.length === 0 ? "없음" : v.map(val).join(" / ");
    if (typeof v === "object")
      return Object.entries(v as Record<string, unknown>)
        .map(([k, x]) => `${EVIDENCE_LABELS[k] ?? k}: ${val(x)}`)
        .join(", ");
    return String(v);
  };
  return Object.entries(ev).map(([key, v]) => ({ key, label: EVIDENCE_LABELS[key] ?? key, text: val(v) }));
}

/** 설비 상태(열린 목록). 간트·범례·표가 같은 이름을 쓴다. */
export const ASSET_STATE_LABELS: Record<string, string> = {
  PROCESSING: "처리",
  SETUP: "준비(교체)",
  RESERVED: "예약(배정 대기)",
  BLOCKED: "막힘(배출 대기)",
  IDLE: "유휴",
};
export const stateText = (s: string) => ASSET_STATE_LABELS[s] ?? s;

export const WINDOW_TEXT: Record<string, string> = { run: "실행 전체", day: "일", week: "주", month: "월" };

/** 구간 이름: 주 단위면 "1주", 일 단위면 "1일"(시작 분으로 계산, 마지막 구간은 짧을 수 있다) */
export function bucketTitle(window: string, i: number): string {
  if (window === "run") return "전체";
  const unit = window === "week" ? "주" : window === "month" ? "월" : "일";
  return `${i + 1}${unit}`;
}
