import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { fromQuery, pending, success, type Loadable } from "../../shared/api/loadable";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";
import { toProductView } from "../products/productMappers";
import type { ProductView } from "../products/productView";
import {
  toScenarioView,
  toVersionItem,
  toVersionView,
  type ScenarioVersionItem,
  type ScenarioVersionView,
  type ScenarioView,
} from "./scenarioView";

const PAGE_LIMIT = 50;

export const scenarioKey = (projectId: string, source: string, scenarioId: string) => projectKey(projectId, source, "scenario", scenarioId);
export const scenarioListKey = (projectId: string, source: string) => projectKey(projectId, source, "scenarios");
export const scenarioVersionsKey = (projectId: string, source: string, scenarioId: string) =>
  projectKey(projectId, source, "scenario-versions", scenarioId);
export const scenarioVersionKey = (projectId: string, source: string, versionId: string) =>
  projectKey(projectId, source, "scenario-version", versionId);

export type ScenarioListResult = { items: ScenarioView[]; hasMore: boolean; fetchMore: () => void; fetchingMore: boolean };

/** 시나리오 목록(code 오름차순, 최근 버전 요약 포함). 시나리오·실행은 API 전용이라 정적 모드에는 예시가 없다. */
export function useScenarioList(projectId: string): Loadable<ScenarioListResult> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    queryKey: scenarioListKey(projectId, source),
    enabled: source === "api" && projectId !== "",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor ?? undefined,
    queryFn: async ({ pageParam, signal }) => {
      const r = await client.get<Schemas["ListOut_ScenarioOut_"]>(`/projects/${projectId}/scenarios`, { query: { limit: PAGE_LIMIT, cursor: pageParam }, signal });
      return { items: r.body.data.map(toScenarioView), nextCursor: r.body.page.next_cursor };
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

export function useScenario(projectId: string, scenarioId: string): Loadable<ScenarioView> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery({
    queryKey: scenarioKey(projectId, source, scenarioId),
    enabled: source === "api" && projectId !== "" && scenarioId !== "",
    queryFn: async ({ signal }) =>
      toScenarioView((await client.get<Schemas["Single_ScenarioOut_"]>(`/projects/${projectId}/scenarios/${scenarioId}`, { signal })).body.data),
  });
  return fromQuery(q, (d) => d);
}

/** 시나리오의 버전 목록(최신부터). */
export function useScenarioVersions(projectId: string, scenarioId: string): Loadable<ScenarioVersionItem[]> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery({
    queryKey: scenarioVersionsKey(projectId, source, scenarioId),
    enabled: source === "api" && projectId !== "" && scenarioId !== "",
    queryFn: async ({ signal }) =>
      (
        await client.get<Schemas["ListOut_ScenarioVersionListItem_"]>(`/projects/${projectId}/scenarios/${scenarioId}/versions`, {
          query: { limit: 200 },
          signal,
        })
      ).body.data.map(toVersionItem),
  });
  return fromQuery(q, (d) => d);
}

export function useScenarioVersion(projectId: string, versionId: string): Loadable<ScenarioVersionView> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery({
    queryKey: scenarioVersionKey(projectId, source, versionId),
    enabled: source === "api" && projectId !== "" && versionId !== "",
    queryFn: async ({ signal }) =>
      toVersionView((await client.get<Schemas["Single_ScenarioVersionOut_"]>(`/projects/${projectId}/scenario-versions/${versionId}`, { signal })).body.data),
  });
  return fromQuery(q, (d) => d);
}

export type ProductOptions = { products: ProductView[]; byId: Map<string, ProductView>; complete: boolean };

/** 시나리오에 넣을 제품 선택지. 제품이 50건을 넘어도 잘리지 않게 모든 페이지를 이어서 받는다. */
export function useProductOptions(projectId: string): Loadable<ProductOptions> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    queryKey: projectKey(projectId, source, "product-options"),
    enabled: source === "api" && projectId !== "",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor ?? undefined,
    queryFn: async ({ pageParam, signal }) => {
      const r = await client.get<Schemas["ListOut_ProductOut_"]>(`/projects/${projectId}/products`, {
        query: { limit: 200, cursor: pageParam, sort: "code" },
        signal,
      });
      return { items: r.body.data.map(toProductView), nextCursor: r.body.page.next_cursor };
    },
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const data = q.data;
  const built = useMemo(() => {
    const products = data?.pages.flatMap((p) => p.items) ?? [];
    return { products, byId: new Map(products.map((p) => [p.id, p])) };
  }, [data]);
  if (source === "static") return success({ ...built, complete: true });
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return { status: "success", data: { ...built, complete: !hasNextPage }, refreshing: false };
}
