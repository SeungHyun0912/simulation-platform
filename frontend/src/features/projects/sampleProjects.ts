import type { OrganizationView, ProjectView } from "./projectView";

/**
 * 정적 예시 데이터. 실제 API(/me, /projects) 응답이 아니며 실제 사업체·프로젝트 정보가 아니다.
 * 실제 연동 시 대체한다.
 */
export const SAMPLE_ORGANIZATIONS: OrganizationView[] = [
  { id: "org-a", code: "ORG-A", name: "예시 조직" },
];

export const SAMPLE_PROJECTS: ProjectView[] = [
  {
    id: "demo-a",
    organizationId: "org-a",
    code: "DEMO-A",
    name: "예시 프로젝트 A",
    timezone: "Asia/Seoul",
    description: "화면 확인용 예시입니다.",
    status: "active",
    role: "admin",
  },
  {
    id: "demo-b",
    organizationId: "org-a",
    code: "DEMO-B",
    name: "예시 프로젝트 B",
    timezone: "Asia/Seoul",
    description: null,
    status: "active",
    role: "viewer",
  },
  {
    id: "demo-c",
    organizationId: "org-a",
    code: "DEMO-C",
    name: "예시 프로젝트 C",
    timezone: "UTC",
    description: null,
    status: "active",
    role: "editor",
  },
];
