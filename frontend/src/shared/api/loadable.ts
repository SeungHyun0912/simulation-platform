import type { UseQueryResult } from "@tanstack/react-query";

/**
 * 정적 예시와 API 조회를 같은 모양으로 다루기 위한 결과 타입.
 * 정적 데이터는 처음부터 success이고 API 조회는 pending → success|error를 거친다.
 */
export type Loadable<T> =
  | { status: "pending" }
  | { status: "error"; error: unknown; retry: () => void }
  | { status: "success"; data: T; refreshing: boolean };

export const pending: Loadable<never> = { status: "pending" };

export function success<T>(data: T): Loadable<T> {
  return { status: "success", data, refreshing: false };
}

export function failure(error: unknown): Loadable<never> {
  return { status: "error", error, retry: () => {} };
}

export function fromQuery<T, D = T>(q: UseQueryResult<D>, map: (d: D) => T): Loadable<T> {
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return { status: "success", data: map(q.data), refreshing: q.isFetching };
}
