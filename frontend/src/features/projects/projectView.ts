import type { ProjectOption } from "../../shared/components/ProjectSwitcher";

/**
 * 화면 전용 뷰 모델. 필드는 backend BE-01c의 ProjectOut·MeProject를 따르지만
 * 계약은 아직 승인되지 않았으므로(PENDING_REVIEW) DTO로 취급하지 않는다.
 */
export type ProjectView = {
  id: string;
  organizationId: string;
  /** 프로젝트 표시 코드. 조직 안에서 고유하며 내부 ID가 아니다. */
  code: string;
  name: string;
  timezone: string;
  description: string | null;
  status: string;
  /** 현재 사용자의 역할. 표시용이며 서버 권한 판정을 대체하지 않는다. */
  role: string;
};

export type OrganizationView = { id: string; code: string; name: string };

/** backend 스키마(schemas/common.py·project.py)의 길이 제한. 계약 승인 후 계약 값으로 맞춘다. */
export const PROJECT_LIMITS = { code: 64, name: 200, timezone: 64, description: 4000 } as const;

/** 프로젝트 표시 색은 서버에 없다(R-FE-09). 목록 순서로 정하는 화면 임시 값이다. */
export function toProjectOption(p: ProjectView, index: number): ProjectOption {
  return { id: p.id, name: p.name, accent: ((index % 4) + 1) as ProjectOption["accent"] };
}

export type ProjectDraft = {
  organizationId: string;
  code: string;
  name: string;
  timezone: string;
  description: string;
};

export type ProjectFieldErrors = Partial<Record<keyof ProjectDraft, string>>;

/** 입력 형식 검사. 코드 중복 등 서버 규칙은 서버가 판정한다. */
export function validateProjectDraft(d: ProjectDraft): ProjectFieldErrors {
  const errors: ProjectFieldErrors = {};
  if (d.organizationId === "") errors.organizationId = "조직을 선택하세요.";
  const code = d.code.trim();
  if (code === "") errors.code = "코드를 입력하세요.";
  else if (code.length > PROJECT_LIMITS.code)
    errors.code = `코드는 ${PROJECT_LIMITS.code}자 이하여야 합니다.`;
  const name = d.name.trim();
  if (name === "") errors.name = "이름을 입력하세요.";
  else if (name.length > PROJECT_LIMITS.name)
    errors.name = `이름은 ${PROJECT_LIMITS.name}자 이하여야 합니다.`;
  const tz = d.timezone.trim();
  if (tz === "") errors.timezone = "시간대를 입력하세요.";
  else if (tz.length > PROJECT_LIMITS.timezone)
    errors.timezone = `시간대는 ${PROJECT_LIMITS.timezone}자 이하여야 합니다.`;
  if (d.description.length > PROJECT_LIMITS.description)
    errors.description = `설명은 ${PROJECT_LIMITS.description}자 이하여야 합니다.`;
  return errors;
}
