import { useSearchParams } from "react-router";

/**
 * 정적 단계 전용: URL의 ?state= 로 로딩·오류·권한 없음 등 상태 화면을 미리 볼 수 있다.
 * 실제 API 연동 시 이 훅을 제거하고 요청 결과로 대체한다.
 */
export const PREVIEW_STATES = ["loading", "error", "empty", "forbidden", "conflict"] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

export function usePreviewState(): PreviewState | null {
  const [params] = useSearchParams();
  const s = params.get("state");
  return (PREVIEW_STATES as readonly string[]).includes(s ?? "") ? (s as PreviewState) : null;
}
