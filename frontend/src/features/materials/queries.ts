import { keepPreviousData, useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { ApiError } from "../../shared/api/errors";
import { failure, fromQuery, pending, success, type Loadable } from "../../shared/api/loadable";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";
import { toMaterialView } from "./materialMappers";
import type { MaterialView } from "./materialView";
import { SAMPLE_MATERIALS } from "./sampleMaterials";

const PAGE_LIMIT = 50;

type MaterialPage = { items: MaterialView[]; nextCursor: string | null };

/** 목록 조회 조건. URL 상태에서 만들며 그대로 서버 쿼리(q, include_archived, sort)가 된다. */
export type MaterialListParams = {
  q: string;
  includeArchived: boolean;
  /** 서버 정렬 키: `code | name`, 내림차순은 앞에 `-`. 없으면 서버 기본(code) */
  sort?: string;
};

export type MaterialListResult = {
  items: MaterialView[];
  hasMore: boolean;
  fetchMore: () => void;
  fetchingMore: boolean;
};

/** 정적 예시에 서버와 같은 규칙(부분 일치 검색, 보관 제외, 단일 필드 정렬, 기본 code)을 적용한다. */
export function applyStaticMaterialQuery(all: MaterialView[], p: MaterialListParams): MaterialView[] {
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

export function useMaterialList(projectId: string, params: MaterialListParams): Loadable<MaterialListResult> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    // 조건이 바뀌면 키가 달라져 이전 cursor를 쓰지 않는다(서버는 다른 조건의 cursor를 422로 거부한다).
    queryKey: projectKey(projectId, source, "materials", params),
    enabled: source === "api" && projectId !== "",
    // 같은 프로젝트의 이전 목록만 유지한다(프로젝트 격리).
    placeholderData: (prev: InfiniteData<MaterialPage, string | undefined> | undefined, prevQuery: { queryKey: readonly unknown[] } | undefined) =>
      prevQuery?.queryKey[1] === projectId ? keepPreviousData(prev) : undefined,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: MaterialPage) => last.nextCursor ?? undefined,
    queryFn: async ({ pageParam, signal }): Promise<MaterialPage> => {
      const r = await client.get<Schemas["ListOut_MaterialOut_"]>(`/projects/${projectId}/materials`, {
        query: {
          q: params.q,
          include_archived: params.includeArchived ? "true" : undefined,
          sort: params.sort,
          limit: PAGE_LIMIT,
          cursor: pageParam,
        },
        signal,
      });
      return { items: r.body.data.map(toMaterialView), nextCursor: r.body.page.next_cursor };
    },
  });
  if (source === "static")
    return success({
      items: applyStaticMaterialQuery(SAMPLE_MATERIALS, params),
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

/** 존재하지 않거나 접근할 수 없는 재료는 서버가 구분 없이 404를 주므로 정적 모드도 같은 오류로 맞춘다. */
export function useMaterialDetail(projectId: string, materialId: string): Loadable<MaterialView> {
  const source = useDataSource();
  const client = useApiClient();
  const query = useQuery({
    queryKey: projectKey(projectId, source, "material", materialId),
    enabled: source === "api" && projectId !== "" && materialId !== "",
    queryFn: async ({ signal }) =>
      toMaterialView(
        (await client.get<Schemas["Single_MaterialOut_"]>(`/projects/${projectId}/materials/${materialId}`, { signal })).body.data,
      ),
  });
  if (source === "static") {
    const found = SAMPLE_MATERIALS.find((m) => m.id === materialId);
    return found ? success(found) : failure(new ApiError({ status: 404, code: "NOT_FOUND", message: "찾을 수 없습니다." }));
  }
  return fromQuery(query, (d) => d);
}

export type MaterialOption = { id: string; code: string; name: string; form: string };
export type MaterialOptions = { options: MaterialOption[]; byId: Map<string, MaterialOption>; complete: boolean };

const toOption = (m: MaterialView): MaterialOption => ({ id: m.id, code: m.code, name: m.name, form: m.form });

/**
 * 공정 단계의 재료 spec에서 고를 재료 선택지. 재료가 50건을 넘어도 잘리지 않게 모든 페이지를 이어서 받는다.
 * 보관된 재료는 새로 고르지 못하게 선택지에서 빼되, 이미 지정된 재료는 id로 찾을 수 있게 `byId`에는 남긴다.
 */
export function useMaterialOptions(projectId: string): Loadable<MaterialOptions> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    queryKey: projectKey(projectId, source, "material-options"),
    enabled: source === "api" && projectId !== "",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: MaterialPage) => last.nextCursor ?? undefined,
    queryFn: async ({ pageParam, signal }): Promise<MaterialPage> => {
      const r = await client.get<Schemas["ListOut_MaterialOut_"]>(`/projects/${projectId}/materials`, {
        // 보관된 재료도 받아 이미 지정된 재료의 이름을 찾는다(선택지에서는 뺀다)
        query: { limit: 200, cursor: pageParam, sort: "code", include_archived: "true" },
        signal,
      });
      return { items: r.body.data.map(toMaterialView), nextCursor: r.body.page.next_cursor };
    },
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const data = q.data;
  const built = useMemo(() => {
    const all = source === "static" ? SAMPLE_MATERIALS : (data?.pages.flatMap((p) => p.items) ?? []);
    return {
      options: all.filter((m) => !m.archivedAt).map(toOption),
      byId: new Map(all.map((m) => [m.id, toOption(m)])),
    };
  }, [source, data]);

  if (source === "static") return success({ ...built, complete: true });
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return { status: "success", data: { ...built, complete: !hasNextPage }, refreshing: false };
}
