import { useParams } from "react-router";
import type { MyProject } from "./queries";
import { useMe } from "./queries";

/**
 * URL의 프로젝트 정보. `/me`의 내 프로젝트에서 찾는다(정적 모드는 예시 목록).
 * 목록에 없는 id(없거나 접근 불가)는 project가 undefined이며 화면은 id를 그대로 보여 주고 역할을 부여하지 않는다.
 * 아직 불러오는 중에도 역할을 알 수 없으므로 읽기 전용으로 둔다(보수적).
 */
export function useCurrentProject(): {
  projectId: string;
  project: MyProject | undefined;
  label: string;
  loading: boolean;
} {
  const { projectId = "" } = useParams();
  const me = useMe();
  const project = me.status === "success" ? me.data.projects.find((p) => p.id === projectId) : undefined;
  return { projectId, project, label: project?.code ?? projectId, loading: me.status === "pending" };
}
