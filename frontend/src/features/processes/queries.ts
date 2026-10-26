import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { ApiError } from "../../shared/api/errors";
import { failure, fromQuery, pending, success, type Loadable } from "../../shared/api/loadable";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";
import { SAMPLE_ASSETS } from "../assets/sampleAssets";
import { toAssetInfo } from "../assets/apiMappers";
import type { AssetInfo } from "../assets/assetView";
import { SAMPLE_PROCESSES, sampleVersionList } from "./sampleProcesses";
import {
  toGraphView,
  toListItem,
  toProcessVersionView,
  type ProcessGraphView,
  type ProcessVersionListItem,
  type ProcessVersionView,
} from "./processView";

const notFound = () => new ApiError({ status: 404, code: "NOT_FOUND", message: "찾을 수 없습니다." });

export const versionKey = (projectId: string, source: string, versionId: string) =>
  projectKey(projectId, source, "process-version", versionId);
export const graphKey = (projectId: string, source: string, versionId: string) =>
  projectKey(projectId, source, "process-graph", versionId);
export const versionListKey = (projectId: string, source: string, productId: string) =>
  projectKey(projectId, source, "process-versions", productId);

/** 제품의 공정 버전 목록(최신 버전 번호부터). */
export function useProcessVersions(projectId: string, productId: string): Loadable<ProcessVersionListItem[]> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery({
    queryKey: versionListKey(projectId, source, productId),
    enabled: source === "api" && projectId !== "" && productId !== "",
    queryFn: async ({ signal }) =>
      (
        await client.get<Schemas["ListOut_ProcessVersionListItem_"]>(`/projects/${projectId}/products/${productId}/process-versions`, {
          query: { limit: 200 },
          signal,
        })
      ).body.data.map(toListItem),
  });
  if (source === "static") return success(sampleVersionList(productId));
  return fromQuery(q, (d) => d);
}

export type ProcessDetailResult = { version: ProcessVersionView; graph: ProcessGraphView };

/**
 * 공정 버전과 그래프. 다른 프로젝트·제품의 버전과 없는 버전은 서버가 구분 없이 404를 주므로 정적 모드도 같은 오류로 맞춘다.
 * 제품과 버전이 함께 일치해야 한다(다른 제품의 버전 id를 붙인 URL은 찾을 수 없음).
 */
export function useProcessDetail(projectId: string, productId: string, versionId: string): Loadable<ProcessDetailResult> {
  const source = useDataSource();
  const client = useApiClient();
  const enabled = source === "api" && projectId !== "" && versionId !== "";
  const version = useQuery({
    queryKey: versionKey(projectId, source, versionId),
    enabled,
    queryFn: async ({ signal }) =>
      toProcessVersionView(
        (await client.get<Schemas["Single_ProcessVersionOut_"]>(`/projects/${projectId}/process-versions/${versionId}`, { signal })).body.data,
      ),
  });
  const graph = useQuery({
    queryKey: graphKey(projectId, source, versionId),
    enabled,
    queryFn: async ({ signal }) =>
      toGraphView((await client.get<Schemas["Single_GraphOut_"]>(`/projects/${projectId}/process-versions/${versionId}/graph`, { signal })).body.data),
  });

  if (source === "static") {
    const found = SAMPLE_PROCESSES[versionId];
    if (!found || found.version.productId !== productId) return failure(notFound());
    return success(found);
  }
  const v = fromQuery(version, (d) => d);
  if (v.status !== "success") return v;
  // 주소의 제품과 버전의 제품이 다르면 존재를 알리지 않고 찾을 수 없음으로 처리한다.
  if (v.data.productId !== productId) return failure(notFound());
  const g = fromQuery(graph, (d) => d);
  if (g.status !== "success") return g;
  return { status: "success", data: { version: v.data, graph: g.data }, refreshing: v.refreshing || g.refreshing };
}

export type AssetOption = { id: string; code: string; name: string; kind: AssetInfo["kind"] };
export type AssetOptions = {
  equipment: AssetOption[];
  /** 저장·도킹 공간(대기 위치 선택지) */
  spaces: AssetOption[];
  /** 모든 페이지를 받았는지 */
  complete: boolean;
  byId: Map<string, AssetOption>;
};

const toOption = (a: AssetInfo): AssetOption => ({ id: a.id, code: a.code, name: a.name, kind: a.kind });

/**
 * 설비 후보·대기 위치 선택지. 자산이 50건을 넘어도 선택지가 잘리지 않게 모든 페이지를 이어서 받는다.
 * 선택지는 자산 id를 값으로 쓰고 표시 코드는 표시용이다(같은 설비는 재방문해도 하나의 자원).
 */
export function useAssetOptions(projectId: string): Loadable<AssetOptions> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    queryKey: projectKey(projectId, source, "asset-options"),
    enabled: source === "api" && projectId !== "",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: { items: AssetInfo[]; next: string | null }) => last.next ?? undefined,
    queryFn: async ({ pageParam, signal }) => {
      const r = await client.get<Schemas["ListOut_AssetOut_"]>(`/projects/${projectId}/assets`, {
        query: { limit: 200, cursor: pageParam, sort: "code" },
        signal,
      });
      return { items: r.body.data.map(toAssetInfo), next: r.body.page.next_cursor };
    },
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const data = q.data;
  const built = useMemo(() => {
    const assets = source === "static" ? SAMPLE_ASSETS : (data?.pages.flatMap((p) => p.items) ?? []);
    const live = assets.filter((a) => !a.archivedAt);
    const options = live.map(toOption);
    return {
      equipment: options.filter((o) => o.kind === "equipment"),
      spaces: options.filter((o) => o.kind !== "equipment"),
      byId: new Map(assets.map((a) => [a.id, toOption(a)])),
    };
  }, [source, data]);

  if (source === "static") return success({ ...built, complete: true });
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return { status: "success", data: { ...built, complete: !hasNextPage }, refreshing: false };
}
