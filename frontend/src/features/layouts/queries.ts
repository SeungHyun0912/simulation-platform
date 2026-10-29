import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { fromQuery, pending, success, type Loadable } from "../../shared/api/loadable";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";

export const layoutListKey = (projectId: string, source: string) => projectKey(projectId, source, "layout-versions");
export const layoutVersionKey = (projectId: string, source: string, versionId: string) => projectKey(projectId, source, "layout-version", versionId);

/** 배치판 버전 목록(최신 version_no부터). 배치판은 API 전용이라 정적 모드에는 예시가 없다. */
export function useLayoutList(projectId: string): Loadable<Schemas["LayoutVersionListItem"][]> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery({
    queryKey: layoutListKey(projectId, source),
    enabled: source === "api" && projectId !== "",
    queryFn: async ({ signal }) =>
      (await client.get<Schemas["ListOut_LayoutVersionListItem_"]>(`/projects/${projectId}/layout-versions`, { query: { limit: 200 }, signal })).body.data,
  });
  if (source === "static") return success([]);
  return fromQuery(q, (d) => d);
}

export function useLayoutVersion(projectId: string, versionId: string): Loadable<Schemas["LayoutVersionOut"]> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery({
    queryKey: layoutVersionKey(projectId, source, versionId),
    enabled: source === "api" && projectId !== "" && versionId !== "",
    queryFn: async ({ signal }) => (await client.get<Schemas["Single_LayoutVersionOut_"]>(`/projects/${projectId}/layout-versions/${versionId}`, { signal })).body.data,
  });
  return fromQuery(q, (d) => d);
}

export type LayoutAssets = {
  assets: Schemas["AssetOut"][];
  byId: Map<string, Schemas["AssetOut"]>;
  idByCode: Map<string, string>;
  /** 포트 id → 그 포트와 자산 */
  portById: Map<string, { port: Schemas["PortOut"]; asset: Schemas["AssetOut"] }>;
  complete: boolean;
};

/** 배치할 설비·공간과 그 포트(목록 응답의 `ports[]`). 자산이 많아도 잘리지 않게 모든 페이지를 이어서 받는다. */
export function useLayoutAssets(projectId: string): Loadable<LayoutAssets> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    queryKey: projectKey(projectId, source, "layout-assets"),
    enabled: source === "api" && projectId !== "",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor ?? undefined,
    queryFn: async ({ pageParam, signal }) => {
      const r = await client.get<Schemas["ListOut_AssetOut_"]>(`/projects/${projectId}/assets`, { query: { limit: 200, cursor: pageParam, sort: "code" }, signal });
      return { items: r.body.data, nextCursor: r.body.page.next_cursor };
    },
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const data = q.data;
  const built = useMemo(() => {
    const assets = data?.pages.flatMap((p) => p.items) ?? [];
    const portById = new Map<string, { port: Schemas["PortOut"]; asset: Schemas["AssetOut"] }>();
    for (const a of assets) for (const port of a.ports) portById.set(port.id, { port, asset: a });
    return { assets, byId: new Map(assets.map((a) => [a.id, a])), idByCode: new Map(assets.map((a) => [a.code, a.id])), portById };
  }, [data]);
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return { status: "success", data: { ...built, complete: !hasNextPage }, refreshing: false };
}
