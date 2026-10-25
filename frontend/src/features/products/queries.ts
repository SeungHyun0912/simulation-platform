import { keepPreviousData, useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { ApiError } from "../../shared/api/errors";
import { failure, fromQuery, pending, success, type Loadable } from "../../shared/api/loadable";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";
import { toProductView } from "./productMappers";
import type { ProductView } from "./productView";
import { SAMPLE_PRODUCTS } from "./sampleProducts";

const PAGE_LIMIT = 50;

type ProductPage = { items: ProductView[]; nextCursor: string | null };

/** 목록 조회 조건. URL 상태에서 만들며 그대로 서버 쿼리(q, include_archived, sort)가 된다. */
export type ProductListParams = {
  q: string;
  includeArchived: boolean;
  /** 서버 정렬 키: `code | name`, 내림차순은 앞에 `-`. 없으면 서버 기본(code) */
  sort?: string;
};

export type ProductListResult = {
  items: ProductView[];
  hasMore: boolean;
  fetchMore: () => void;
  fetchingMore: boolean;
};

/** 정적 예시에 서버와 같은 규칙(부분 일치 검색, 보관 제외, 단일 필드 정렬, 기본 code)을 적용한다. */
export function applyStaticProductQuery(all: ProductView[], p: ProductListParams): ProductView[] {
  const needle = p.q.trim().toLowerCase();
  const filtered = all.filter(
    (x) =>
      (p.includeArchived || !x.archivedAt) &&
      (!needle || x.code.toLowerCase().includes(needle) || x.name.toLowerCase().includes(needle)),
  );
  const desc = p.sort?.startsWith("-") ?? false;
  const key = (p.sort?.replace(/^-/, "") || "code") as "code" | "name";
  return [...filtered].sort((a, b) => (desc ? -1 : 1) * a[key].localeCompare(b[key], "ko") || a.id.localeCompare(b.id));
}

export function useProductList(projectId: string, params: ProductListParams): Loadable<ProductListResult> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    // 조건이 바뀌면 키가 달라져 이전 cursor를 쓰지 않는다(서버는 다른 조건의 cursor를 422로 거부한다).
    queryKey: projectKey(projectId, source, "products", params),
    enabled: source === "api" && projectId !== "",
    // 같은 프로젝트의 이전 목록만 유지한다(프로젝트 격리).
    placeholderData: (prev: InfiniteData<ProductPage, string | undefined> | undefined, prevQuery: { queryKey: readonly unknown[] } | undefined) =>
      prevQuery?.queryKey[1] === projectId ? keepPreviousData(prev) : undefined,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ProductPage) => last.nextCursor ?? undefined,
    queryFn: async ({ pageParam, signal }): Promise<ProductPage> => {
      const r = await client.get<Schemas["ListOut_ProductOut_"]>(`/projects/${projectId}/products`, {
        query: {
          q: params.q,
          include_archived: params.includeArchived ? "true" : undefined,
          sort: params.sort,
          limit: PAGE_LIMIT,
          cursor: pageParam,
        },
        signal,
      });
      return { items: r.body.data.map(toProductView), nextCursor: r.body.page.next_cursor };
    },
  });
  if (source === "static")
    return success({
      items: applyStaticProductQuery(SAMPLE_PRODUCTS, params),
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

/** 존재하지 않거나 접근할 수 없는 제품은 서버가 구분 없이 404를 주므로 정적 모드도 같은 오류로 맞춘다. */
export function useProductDetail(projectId: string, productId: string): Loadable<ProductView> {
  const source = useDataSource();
  const client = useApiClient();
  const query = useQuery({
    queryKey: projectKey(projectId, source, "product", productId),
    enabled: source === "api" && projectId !== "" && productId !== "",
    queryFn: async ({ signal }) =>
      toProductView(
        (await client.get<Schemas["Single_ProductOut_"]>(`/projects/${projectId}/products/${productId}`, { signal })).body.data,
      ),
  });
  if (source === "static") {
    const found = SAMPLE_PRODUCTS.find((p) => p.id === productId);
    return found ? success(found) : failure(new ApiError({ status: 404, code: "NOT_FOUND", message: "찾을 수 없습니다." }));
  }
  return fromQuery(query, (d) => d);
}
