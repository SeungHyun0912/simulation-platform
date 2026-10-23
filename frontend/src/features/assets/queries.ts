import { keepPreviousData, useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { ApiError } from "../../shared/api/errors";
import { failure, fromQuery, pending, success, type Loadable } from "../../shared/api/loadable";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";
import { toAssetInfo, toRevisionDetail } from "./apiMappers";
import type { AssetInfo, RevisionDetail } from "./assetView";
import { SAMPLE_ASSETS, SAMPLE_REVISIONS } from "./sampleAssets";

const PAGE_LIMIT = 50;

type AssetPage = { items: AssetInfo[]; nextCursor: string | null };

/** 목록 조회 조건. URL 상태에서 만들며 그대로 서버 쿼리(q, kind, sort)가 된다. */
export type AssetListParams = {
  q: string;
  kind: string;
  /** 서버 정렬 키: `sort_order | code | name`, 내림차순은 앞에 `-`. 없으면 서버 기본(sort_order) */
  sort?: string;
};

export type AssetListResult = {
  items: AssetInfo[];
  hasMore: boolean;
  fetchMore: () => void;
  fetchingMore: boolean;
};

/**
 * 정적 예시에 서버와 같은 규칙(부분 일치 검색, 종류 필터, 단일 필드 정렬, 동률은 코드·id)을 적용한다.
 * 정적 모드와 API 모드가 같은 조건 객체를 쓰게 해서 화면 로직이 달라지지 않게 한다.
 */
export function applyStaticListQuery(all: AssetInfo[], p: AssetListParams): AssetInfo[] {
  const needle = p.q.trim().toLowerCase();
  const filtered = all.filter(
    (a) =>
      (!p.kind || a.kind === p.kind) &&
      (!needle || a.code.toLowerCase().includes(needle) || a.name.toLowerCase().includes(needle)),
  );
  const desc = p.sort?.startsWith("-") ?? false;
  const key = (p.sort?.replace(/^-/, "") || "sort_order") as "sort_order" | "code" | "name";
  const cmp = (a: AssetInfo, b: AssetInfo) => {
    const x = key === "sort_order" ? a.sortOrder : a[key];
    const y = key === "sort_order" ? b.sortOrder : b[key];
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ko");
    return (desc ? -c : c) || a.code.localeCompare(b.code, "ko") || a.id.localeCompare(b.id);
  };
  return [...filtered].sort(cmp);
}

export function useAssetList(projectId: string, params: AssetListParams): Loadable<AssetListResult> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    // 조건이 바뀌면 키가 달라져 이전 cursor를 쓰지 않는다(서버는 다른 조건의 cursor를 422로 거부한다).
    queryKey: projectKey(projectId, source, "assets", params),
    enabled: source === "api" && projectId !== "",
    // 조건(정렬·검색)이 바뀌어 새로 불러오는 동안 같은 프로젝트의 이전 목록을 유지해 표가 사라지지 않게 한다.
    // 다른 프로젝트의 데이터는 절대 유지하지 않는다(프로젝트 격리).
    placeholderData: (prev: InfiniteData<AssetPage, string | undefined> | undefined, prevQuery: { queryKey: readonly unknown[] } | undefined) =>
      prevQuery?.queryKey[1] === projectId ? keepPreviousData(prev) : undefined,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: AssetPage) => last.nextCursor ?? undefined,
    queryFn: async ({ pageParam, signal }): Promise<AssetPage> => {
      const r = await client.get<Schemas["ListOut_AssetOut_"]>(`/projects/${projectId}/assets`, {
        query: { q: params.q, kind: params.kind, sort: params.sort, limit: PAGE_LIMIT, cursor: pageParam },
        signal,
      });
      return { items: r.body.data.map(toAssetInfo), nextCursor: r.body.page.next_cursor };
    },
  });
  if (source === "static")
    return success({
      items: applyStaticListQuery(SAMPLE_ASSETS, params),
      hasMore: false,
      fetchMore: () => {},
      fetchingMore: false,
    });
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return {
    status: "success",
    refreshing: q.isFetching && !q.isFetchingNextPage,
    data: {
      items: q.data.pages.flatMap((p) => p.items),
      hasMore: q.hasNextPage,
      fetchMore: () => void q.fetchNextPage(),
      fetchingMore: q.isFetchingNextPage,
    },
  };
}

export type AssetDetailResult = { asset: AssetInfo; revisions: RevisionDetail[] };

/**
 * 자산과 버전 이력. 버전 목록 응답의 항목은 상세(AssetRevisionOut)와 같은 모양이라 상세를 따로 부르지 않는다.
 * 존재하지 않거나 접근할 수 없는 자산은 서버가 구분 없이 404를 주므로 정적 모드도 같은 오류로 맞춘다.
 */
export function useAssetDetail(projectId: string, assetId: string): Loadable<AssetDetailResult> {
  const source = useDataSource();
  const client = useApiClient();
  const enabled = source === "api" && projectId !== "" && assetId !== "";
  const asset = useQuery({
    queryKey: projectKey(projectId, source, "asset", assetId),
    enabled,
    queryFn: async ({ signal }) =>
      toAssetInfo((await client.get<Schemas["Single_AssetOut_"]>(`/projects/${projectId}/assets/${assetId}`, { signal })).body.data),
  });
  const revisions = useQuery({
    queryKey: projectKey(projectId, source, "asset-revisions", assetId),
    enabled,
    queryFn: async ({ signal }) =>
      (
        await client.get<Schemas["ListOut_AssetRevisionOut_"]>(`/projects/${projectId}/assets/${assetId}/revisions`, {
          query: { limit: 200 },
          signal,
        })
      ).body.data.map(toRevisionDetail),
  });

  if (source === "static") {
    const found = SAMPLE_ASSETS.find((a) => a.id === assetId);
    if (!found) return failure(new ApiError({ status: 404, code: "NOT_FOUND", message: "찾을 수 없습니다." }));
    return success({ asset: found, revisions: SAMPLE_REVISIONS[found.id] ?? [] });
  }
  const a = fromQuery(asset, (d) => d);
  if (a.status !== "success") return a;
  const r = fromQuery(revisions, (d) => d);
  if (r.status !== "success") return r;
  return success({ asset: a.data, revisions: r.data });
}
