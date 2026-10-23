/**
 * 모든 업무 query key는 projectId로 시작한다. 프로젝트 전환 시 다른 프로젝트의 캐시를
 * 재사용하지 않게 하기 위한 규칙이다(06 기술서 §4).
 */
export function projectKey(projectId: string, ...rest: readonly unknown[]) {
  return ["project", projectId, ...rest] as const;
}
