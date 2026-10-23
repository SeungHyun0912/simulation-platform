import { useParams } from "react-router";
import type { ProjectView } from "./projectView";
import { SAMPLE_PROJECTS } from "./sampleProjects";

/**
 * URL의 프로젝트 정보. 지금은 정적 예시 목록에서 찾는다(실제 연동 시 `/me.projects`로 교체).
 * 목록에 없는 id는 undefined이며, 화면은 id를 그대로 보여 주고 권한을 부여하지 않는다.
 */
export function useCurrentProject(): { projectId: string; project: ProjectView | undefined; label: string } {
  const { projectId = "" } = useParams();
  const project = SAMPLE_PROJECTS.find((p) => p.id === projectId);
  return { projectId, project, label: project?.code ?? projectId };
}
