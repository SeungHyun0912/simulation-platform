import { useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { fromQuery, pending, success, type Loadable } from "../../shared/api/loadable";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";
import { isActiveRun, type RunListItem, type RunOut } from "./runView";

/** 진행 중인 실행의 상태 polling 간격(계약 안내: 2~5초). 시험에서는 짧게 한다. */
export const RUN_POLL_MS = import.meta.env?.MODE === "test" ? 40 : 3000;

export const runKey = (projectId: string, source: string, runId: string) => projectKey(projectId, source, "run", runId);
export const runListKey = (projectId: string, source: string) => projectKey(projectId, source, "runs");

type Page<T> = { items: T[]; nextCursor: string | null };
const next = <T,>(last: Page<T>) => last.nextCursor ?? undefined;

export type RunListParams = { status: string; scenarioVersionId: string };
export type RunListResult = { items: RunListItem[]; hasMore: boolean; fetchMore: () => void; fetchingMore: boolean };

/** 실행 목록(최신 요청부터). 진행 중인 실행이 있으면 주기적으로 다시 불러온다. 정적 모드에는 예시가 없다. */
export function useRunList(projectId: string, params: RunListParams): Loadable<RunListResult> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    queryKey: projectKey(projectId, source, "runs", params),
    enabled: source === "api" && projectId !== "",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Page<RunListItem>) => next(last),
    refetchInterval: (query) => {
      const data = query.state.data as InfiniteData<{ items: RunListItem[] }> | undefined;
      return data?.pages.some((p) => p.items.some((r) => isActiveRun(r.status))) ? RUN_POLL_MS : false;
    },
    queryFn: async ({ pageParam, signal }): Promise<Page<RunListItem>> => {
      const r = await client.get<Schemas["ListOut_RunListItem_"]>(`/projects/${projectId}/runs`, {
        query: { limit: 50, cursor: pageParam, status: params.status, scenario_version_id: params.scenarioVersionId },
        signal,
      });
      return { items: r.body.data, nextCursor: r.body.page.next_cursor };
    },
  });
  if (source === "static") return success({ items: [], hasMore: false, fetchMore: () => {}, fetchingMore: false });
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return success({
    items: q.data.pages.flatMap((p) => p.items),
    hasMore: q.hasNextPage,
    fetchMore: () => void q.fetchNextPage(),
    fetchingMore: q.isFetchingNextPage,
  });
}

/** 실행 하나. 대기·실행 중이면 종료될 때까지 polling하고, 종료 상태는 다시 바뀌지 않으므로 멈춘다. */
export function useRun(projectId: string, runId: string): Loadable<RunOut> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery<RunOut>({
    queryKey: runKey(projectId, source, runId),
    enabled: source === "api" && projectId !== "" && runId !== "",
    refetchInterval: (query) => (query.state.data && isActiveRun(query.state.data.status) ? RUN_POLL_MS : false),
    queryFn: async ({ signal }): Promise<RunOut> => (await client.get<Schemas["Single_RunOut_"]>(`/projects/${projectId}/runs/${runId}`, { signal })).body.data,
  });
  return fromQuery(q, (d) => d);
}

/** 실행 당시 입력 스냅샷(불변). 크므로 사용자가 펼칠 때만 불러온다. */
export function useRunInput(projectId: string, runId: string, enabled: boolean): Loadable<Schemas["RunInputOut"]> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery({
    queryKey: projectKey(projectId, source, "run-input", runId),
    enabled: enabled && source === "api" && projectId !== "" && runId !== "",
    staleTime: Infinity, // 스냅샷은 불변이다
    queryFn: async ({ signal }) => (await client.get<Schemas["Single_RunInputOut_"]>(`/projects/${projectId}/runs/${runId}/input`, { signal })).body.data,
  });
  return fromQuery(q, (d) => d);
}

/** 지표 정의(이름·단위·설명은 하드코딩하지 않고 서버 정본을 쓴다). 사용자·프로젝트와 무관한 목록이다. */
export function useMetricDefinitions(enabled = true): Loadable<Schemas["MetricDefinitionOut"][]> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery({
    queryKey: ["metric-definitions", source],
    enabled: enabled && source === "api",
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => (await client.get<Schemas["ListOut_MetricDefinitionOut_"]>("/metric-definitions", { signal })).body.data,
  });
  return fromQuery(q, (d) => d);
}

export type MetricParams = { window: string; metricKey: string };
export type PagedResult<T> = { items: T[]; hasMore: boolean; fetchMore: () => void; fetchingMore: boolean };

/** 실행 지표(공식 결과). 선택된 시도가 없으면 409 RUN_RESULT_NOT_AVAILABLE이며 호출한 화면이 안내한다. */
export function useRunMetrics(projectId: string, runId: string, params: MetricParams, enabled: boolean): Loadable<PagedResult<Schemas["MetricOut"]>> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    queryKey: projectKey(projectId, source, "run-metrics", runId, params),
    enabled: enabled && source === "api" && projectId !== "" && runId !== "",
    retry: false,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Page<Schemas["MetricOut"]>) => next(last),
    queryFn: async ({ pageParam, signal }): Promise<Page<Schemas["MetricOut"]>> => {
      const r = await client.get<Schemas["ListOut_MetricOut_"]>(`/projects/${projectId}/runs/${runId}/metrics`, {
        query: { limit: 200, cursor: pageParam, window: params.window, metric_key: params.metricKey },
        signal,
      });
      return { items: r.body.data, nextCursor: r.body.page.next_cursor };
    },
  });
  if (!enabled) return pending;
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return success({ items: q.data.pages.flatMap((p) => p.items), hasMore: q.hasNextPage, fetchMore: () => void q.fetchNextPage(), fetchingMore: q.isFetchingNextPage });
}

/** 병목 요약(0.12.0). 공식 결과가 없으면 409 RUN_RESULT_NOT_AVAILABLE이며 호출한 화면이 안내한다. */
export function useRunBottlenecks(projectId: string, runId: string, enabled: boolean): Loadable<Schemas["BottleneckSummaryOut"]> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery({
    queryKey: projectKey(projectId, source, "run-bottlenecks", runId),
    enabled: enabled && source === "api" && projectId !== "" && runId !== "",
    retry: false,
    staleTime: Infinity, // 끝난 실행의 결과는 바뀌지 않는다
    queryFn: async ({ signal }) =>
      (await client.get<Schemas["Single_BottleneckSummaryOut_"]>(`/projects/${projectId}/runs/${runId}/bottlenecks`, { query: { limit: 50 }, signal })).body.data,
  });
  if (!enabled) return pending;
  return fromQuery(q, (d) => d);
}

/** 설비 타임라인(0.13.0). 크므로(일 단위 한 달치 ≈ 2MB) 설비 20대씩 나눠 받고, 화면은 주 단위로 시작한다. */
export function useAssetTimeline(projectId: string, runId: string, window: string, enabled: boolean): Loadable<PagedResult<Schemas["AssetTimelineOut"]>> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    queryKey: projectKey(projectId, source, "run-asset-timeline", runId, window),
    enabled: enabled && source === "api" && projectId !== "" && runId !== "",
    retry: false,
    staleTime: Infinity,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Page<Schemas["AssetTimelineOut"]>) => next(last),
    queryFn: async ({ pageParam, signal }): Promise<Page<Schemas["AssetTimelineOut"]>> => {
      const r = await client.get<Schemas["ListOut_AssetTimelineOut_"]>(`/projects/${projectId}/runs/${runId}/asset-timeline`, {
        query: { window, limit: 20, cursor: pageParam },
        signal,
      });
      return { items: r.body.data, nextCursor: r.body.page.next_cursor };
    },
  });
  if (!enabled) return pending;
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return success({ items: q.data.pages.flatMap((p) => p.items), hasMore: q.hasNextPage, fetchMore: () => void q.fetchNextPage(), fetchingMore: q.isFetchingNextPage });
}

/** 설비 하나의 상태 구간(간트). 구간을 [from, to)로 잘라 받는다. */
export function useAssetStates(
  projectId: string,
  runId: string,
  assetId: string,
  range: { from: string; to: string } | null,
): Loadable<PagedResult<Schemas["AssetStateSegmentOut"]>> {
  const source = useDataSource();
  const client = useApiClient();
  const enabled = range !== null && assetId !== "";
  const q = useInfiniteQuery({
    queryKey: projectKey(projectId, source, "run-asset-states", runId, assetId, range),
    enabled: enabled && source === "api" && projectId !== "" && runId !== "",
    retry: false,
    staleTime: Infinity,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Page<Schemas["AssetStateSegmentOut"]>) => next(last),
    queryFn: async ({ pageParam, signal }): Promise<Page<Schemas["AssetStateSegmentOut"]>> => {
      const r = await client.get<Schemas["ListOut_AssetStateSegmentOut_"]>(`/projects/${projectId}/runs/${runId}/assets/${assetId}/states`, {
        query: { from_min: range?.from, to_min: range?.to, limit: 200, cursor: pageParam },
        signal,
      });
      return { items: r.body.data, nextCursor: r.body.page.next_cursor };
    },
  });
  if (!enabled) return pending;
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return success({ items: q.data.pages.flatMap((p) => p.items), hasMore: q.hasNextPage, fetchMore: () => void q.fetchNextPage(), fetchingMore: q.isFetchingNextPage });
}

/** 두 실행 비교 요약(0.13.0, 저장 없는 조회형). base = 기준, other = 비교 대상 */
export function useRunComparison(projectId: string, baseId: string, otherId: string): Loadable<Schemas["RunComparisonOut"]> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery({
    queryKey: projectKey(projectId, source, "run-compare", baseId, otherId),
    enabled: source === "api" && projectId !== "" && baseId !== "" && otherId !== "",
    retry: false,
    staleTime: Infinity,
    queryFn: async ({ signal }) => (await client.get<Schemas["Single_RunComparisonOut_"]>(`/projects/${projectId}/runs/${baseId}/compare/${otherId}`, { signal })).body.data,
  });
  return fromQuery(q, (d) => d);
}

export type CompareMetricParams = { window: string; metricKey: string; changedOnly: boolean };

/** 두 실행의 지표 차이. 일·주·월 구간은 지표 하나(metric_key)를 골라야 한다(서버 규칙). */
export function useComparisonMetrics(projectId: string, baseId: string, otherId: string, params: CompareMetricParams): Loadable<PagedResult<Schemas["MetricComparisonOut"]>> {
  const source = useDataSource();
  const client = useApiClient();
  const enabled = params.window === "run" || params.metricKey !== "";
  const q = useInfiniteQuery({
    queryKey: projectKey(projectId, source, "run-compare-metrics", baseId, otherId, params),
    enabled: enabled && source === "api" && projectId !== "" && baseId !== "" && otherId !== "",
    retry: false,
    staleTime: Infinity,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Page<Schemas["MetricComparisonOut"]>) => next(last),
    queryFn: async ({ pageParam, signal }): Promise<Page<Schemas["MetricComparisonOut"]>> => {
      const r = await client.get<Schemas["ListOut_MetricComparisonOut_"]>(`/projects/${projectId}/runs/${baseId}/compare/${otherId}/metrics`, {
        query: { window: params.window, metric_key: params.metricKey, changed_only: params.changedOnly ? "true" : "false", limit: 200, cursor: pageParam },
        signal,
      });
      return { items: r.body.data, nextCursor: r.body.page.next_cursor };
    },
  });
  if (!enabled) return pending;
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return success({ items: q.data.pages.flatMap((p) => p.items), hasMore: q.hasNextPage, fetchMore: () => void q.fetchNextPage(), fetchingMore: q.isFetchingNextPage });
}

export type EventParams = { eventType: string; stepKey: string };

/** 실행 이벤트(공식 결과, event_seq 순서). 한 번에 전부 받지 않고 cursor로 이어 읽는다. */
export function useRunEvents(projectId: string, runId: string, params: EventParams, enabled: boolean): Loadable<PagedResult<Schemas["EventOut"]>> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    queryKey: projectKey(projectId, source, "run-events", runId, params),
    enabled: enabled && source === "api" && projectId !== "" && runId !== "",
    retry: false,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Page<Schemas["EventOut"]>) => next(last),
    queryFn: async ({ pageParam, signal }): Promise<Page<Schemas["EventOut"]>> => {
      const r = await client.get<Schemas["ListOut_EventOut_"]>(`/projects/${projectId}/runs/${runId}/events`, {
        query: { limit: 100, cursor: pageParam, event_type: params.eventType, step_key: params.stepKey },
        signal,
      });
      return { items: r.body.data, nextCursor: r.body.page.next_cursor };
    },
  });
  if (!enabled) return pending;
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return success({ items: q.data.pages.flatMap((p) => p.items), hasMore: q.hasNextPage, fetchMore: () => void q.fetchNextPage(), fetchingMore: q.isFetchingNextPage });
}
