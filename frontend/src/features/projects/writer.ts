import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import type { ApiError } from "../../shared/api/errors";
import { toIssues } from "../../shared/api/errors";
import type { Schemas } from "../../shared/api/types";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import type { ProjectDraft, ProjectFieldErrors, ProjectView } from "./projectView";
import { toProjectView } from "./queries";

/** 생성 본문. 설명은 비우면 보내지 않는다(서버 기본 null). 코드·이름·시간대는 앞뒤 공백을 지운 값이다. */
export function buildProjectCreate(d: ProjectDraft): Schemas["ProjectCreate"] {
  const description = d.description.trim();
  return {
    organization_id: d.organizationId,
    code: d.code.trim(),
    name: d.name.trim(),
    timezone: d.timezone.trim(),
    ...(description === "" ? {} : { description: d.description }),
  };
}

const FIELD_BY_PATH: Record<string, keyof ProjectDraft> = {
  organization_id: "organizationId",
  code: "code",
  name: "name",
  timezone: "timezone",
  description: "description",
};

/** 서버 422·409의 `field_path`(요청 본문 기준)를 폼 필드에 연결한다. 연결할 수 없는 항목은 general로 남긴다. */
export function mapProjectErrors(e: ApiError): { fields: ProjectFieldErrors; general: ValidationIssue[] } {
  const fields: ProjectFieldErrors = {};
  const general: ValidationIssue[] = [];
  for (const issue of toIssues(e)) {
    const key = FIELD_BY_PATH[(issue.field_path ?? "").replace(/^\//, "")];
    if (key && !(key in fields)) fields[key] = issue.message;
    else general.push(issue);
  }
  if (e.code === "PROJECT_CODE_CONFLICT" && !fields.code) fields.code = "이 조직에 이미 있는 코드입니다.";
  return { fields, general };
}

/**
 * 프로젝트 쓰기 호출과 캐시 갱신. 만든 프로젝트는 내 정보(`/me`)와 목록에 바로 나타나야 하므로 두 쿼리를 무효화한다.
 * 실패는 그대로 던진다(자동 재시도 없음: 요청이 처리됐는지 알 수 없을 수 있다).
 */
export function useProjectWriter() {
  const client = useApiClient();
  const source = useDataSource();
  const qc = useQueryClient();
  return useMemo(
    () => ({
      async create(body: Schemas["ProjectCreate"]): Promise<ProjectView> {
        const r = await client.post<Schemas["Single_ProjectOut_"]>("/projects", { body });
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["me", source] }),
          qc.invalidateQueries({ queryKey: ["projects", source] }),
        ]);
        return toProjectView(r.body.data);
      },
    }),
    [client, source, qc],
  );
}
