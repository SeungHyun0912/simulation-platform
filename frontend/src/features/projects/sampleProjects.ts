import type { ProjectOption } from "../../shared/components/ProjectSwitcher";

/**
 * 정적 예시 프로젝트. 실제 프로젝트 목록 API(/projects, /me)가 승인되면 대체한다.
 * 실제 사업체·프로젝트 정보가 아니다.
 */
export const SAMPLE_PROJECTS: ProjectOption[] = [
  { id: "demo-a", name: "예시 프로젝트 A", accent: 1 },
  { id: "demo-b", name: "예시 프로젝트 B", accent: 2 },
  { id: "demo-c", name: "예시 프로젝트 C", accent: 3 },
];
