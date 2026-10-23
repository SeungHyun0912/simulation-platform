import type { OrganizationView, ProjectView } from "./projectView";

/**
 * 정적 예시 데이터. 실제 API(/me, /projects) 응답이 아니며 실제 사업체·프로젝트 정보가 아니다.
 * id는 실제 API와 같은 UUID 형식으로 둔다(비UUID 경로는 서버가 422로 거부). 실제 연동 시 대체한다.
 */
export const SAMPLE_PROJECT_IDS = {
  a: "aaaaaaaa-0000-4000-8000-000000000001",
  b: "aaaaaaaa-0000-4000-8000-000000000002",
  c: "aaaaaaaa-0000-4000-8000-000000000003",
} as const;

const ORG_ADMIN = "bbbbbbbb-0000-4000-8000-000000000001";
const ORG_MEMBER = "bbbbbbbb-0000-4000-8000-000000000002";

/** 호출자의 조직. 프로젝트 생성은 role이 admin인 조직에서만 가능하다(R-FE-13). */
export const SAMPLE_ORGANIZATIONS: OrganizationView[] = [
  { id: ORG_ADMIN, code: "ORG-A", name: "예시 조직 A", role: "admin" },
  { id: ORG_MEMBER, code: "ORG-B", name: "예시 조직 B", role: "member" },
];

export const SAMPLE_PROJECTS: ProjectView[] = [
  {
    id: SAMPLE_PROJECT_IDS.a,
    organizationId: ORG_ADMIN,
    code: "DEMO-A",
    name: "예시 프로젝트 A",
    timezone: "Asia/Seoul",
    description: "화면 확인용 예시입니다.",
    status: "active",
    role: "admin",
  },
  {
    id: SAMPLE_PROJECT_IDS.b,
    organizationId: ORG_ADMIN,
    code: "DEMO-B",
    name: "예시 프로젝트 B",
    timezone: "Asia/Seoul",
    description: null,
    status: "active",
    role: "viewer",
  },
  {
    id: SAMPLE_PROJECT_IDS.c,
    organizationId: ORG_MEMBER,
    code: "DEMO-C",
    name: "예시 프로젝트 C",
    timezone: "UTC",
    description: null,
    status: "active",
    role: "editor",
  },
];
