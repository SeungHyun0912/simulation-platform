import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { fromQuery, success, pending, type Loadable } from "../../shared/api/loadable";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";
import type { OrganizationView, ProjectView } from "./projectView";
import { SAMPLE_ORGANIZATIONS, SAMPLE_PROJECTS } from "./sampleProjects";

/**
 * `/me`가 주는 내 프로젝트 요약. 시간대·상태·설명은 `/me`에 없고 `GET /projects`(ProjectOut)에 있다.
 * timezone은 정적 예시에서만 채우고, API 모드에서는 비워 두어 화면이 기본 표시 시간대(KST)를 쓴다.
 */
export type MyProject = Pick<ProjectView, "id" | "organizationId" | "code" | "name" | "role" | "status"> & {
  timezone?: string;
};

export type MeView = {
  userName: string;
  organizations: OrganizationView[];
  projects: MyProject[];
};

export function toMeView(me: Schemas["MeOut"]): MeView {
  return {
    userName: me.user.display_name,
    organizations: me.organizations.map((o) => ({ id: o.id, code: o.code, name: o.name, role: o.role })),
    projects: me.projects.map((p) => ({
      id: p.id,
      organizationId: p.organization_id,
      code: p.code,
      name: p.name,
      role: p.role,
      status: p.status,
    })),
  };
}

export function toProjectView(p: Schemas["ProjectOut"]): ProjectView {
  return {
    id: p.id,
    organizationId: p.organization_id,
    code: p.code,
    name: p.name,
    timezone: p.timezone,
    description: p.description,
    status: p.status,
    role: "", // ProjectOut에는 역할이 없다. 화면은 /me의 역할과 id로 합친다.
  };
}

const STATIC_ME: MeView = {
  userName: "예시 사용자",
  organizations: SAMPLE_ORGANIZATIONS,
  projects: SAMPLE_PROJECTS.map((p) => ({
    id: p.id,
    organizationId: p.organizationId,
    code: p.code,
    name: p.name,
    role: p.role,
    status: p.status,
    timezone: p.timezone,
  })),
};

/** 호출자의 조직·프로젝트(전환 메뉴·역할·프로젝트 생성 조직). 프로젝트와 무관한 사용자 단위 데이터다. */
export function useMe(): Loadable<MeView> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery({
    queryKey: ["me", source],
    enabled: source === "api",
    staleTime: 30_000,
    queryFn: async ({ signal }) => toMeView((await client.get<Schemas["Single_MeOut_"]>("/me", { signal })).body.data),
  });
  return source === "static" ? success(STATIC_ME) : fromQuery(q, (d) => d);
}

/**
 * 프로젝트의 표시 시간대. `/me`에는 시간대가 없어 상세 화면이 필요할 때만 `GET /projects/{id}`로 가져온다.
 * 알 수 없는 동안(불러오는 중·실패)은 undefined이며 화면은 기본 표시 시간대(KST)를 쓰되 틀릴 수 있음을 알린다.
 */
export function useProjectTimezone(projectId: string): string | undefined {
  const source = useDataSource();
  const client = useApiClient();
  const q = useQuery({
    queryKey: projectKey(projectId, source, "project"),
    enabled: source === "api" && projectId !== "",
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) =>
      (await client.get<Schemas["Single_ProjectOut_"]>(`/projects/${projectId}`, { signal })).body.data.timezone,
  });
  if (source === "static") return STATIC_ME.projects.find((p) => p.id === projectId)?.timezone;
  return q.data;
}

export type ProjectListResult = {
  items: ProjectView[];
  hasMore: boolean;
  fetchMore: () => void;
  fetchingMore: boolean;
};

const PAGE_LIMIT = 50;

type ProjectPage = { items: ProjectView[]; nextCursor: string | null };

/** 프로젝트 목록(`GET /projects`, code 오름차순 cursor). 이전 페이지·총 건수는 없다("더 보기"). */
export function useProjectList(): Loadable<ProjectListResult> {
  const source = useDataSource();
  const client = useApiClient();
  const q = useInfiniteQuery({
    queryKey: ["projects", source],
    enabled: source === "api",
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ProjectPage) => last.nextCursor ?? undefined,
    queryFn: async ({ pageParam, signal }): Promise<ProjectPage> => {
      const r = await client.get<Schemas["ListOut_ProjectOut_"]>("/projects", {
        query: { limit: PAGE_LIMIT, cursor: pageParam },
        signal,
      });
      return { items: r.body.data.map(toProjectView), nextCursor: r.body.page.next_cursor };
    },
  });
  if (source === "static")
    return success({ items: SAMPLE_PROJECTS, hasMore: false, fetchMore: () => {}, fetchingMore: false });
  if (q.status === "pending") return pending;
  if (q.status === "error") return { status: "error", error: q.error, retry: () => void q.refetch() };
  return success({
    items: q.data.pages.flatMap((p) => p.items),
    hasMore: q.hasNextPage,
    fetchMore: () => void q.fetchNextPage(),
    fetchingMore: q.isFetchingNextPage,
  });
}
