/**
 * 서버의 실제 시각은 ISO8601 UTC이며 화면에서 프로젝트 시간대(없으면 KST)로 표시한다.
 * 잘못된 입력은 원문을 그대로 돌려줘 값을 숨기거나 임의로 바꾸지 않는다.
 */
export function formatDateTime(iso: string | null, timeZone = "Asia/Seoul"): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return iso;
  }
}
