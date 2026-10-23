import type { ProjectOption } from "../../shared/components/ProjectSwitcher";

/**
 * 화면 전용 뷰 모델. 필드는 계약 0.2.0의 ProjectOut·MeProject를 따른다.
 * 실제 연동 시 어댑터를 통해 생성 타입에서 변환한다.
 */
export type ProjectView = {
  /** 내부 고유 ID(UUID). 화면에는 표시 코드를 쓴다. */
  id: string;
  organizationId: string;
  /** 프로젝트 표시 코드. 조직 안에서 고유하며 내부 ID가 아니다. */
  code: string;
  name: string;
  timezone: string;
  description: string | null;
  /** `active` | `archived`(서버는 아직 archived를 쓰지 않는다). */
  status: string;
  /** 현재 사용자의 프로젝트 역할. 표시·버튼 노출용이며 서버 403이 정본이다. */
  role: string;
};

/** `/me.organizations` 항목. role은 조직 역할(admin | member)이다. */
export type OrganizationView = { id: string; code: string; name: string; role: string };

/** 계약 0.2.0 스키마의 길이 제한. 계약이 바뀌면 이 값도 맞춘다. */
export const PROJECT_LIMITS = { code: 64, name: 200, timezone: 64, description: 4000 } as const;

const PROJECT_ROLE_LABELS: Record<string, string> = {
  admin: "관리자",
  editor: "편집자",
  viewer: "조회자",
};
const ORG_ROLE_LABELS: Record<string, string> = { admin: "조직 관리자", member: "조직 구성원" };

/** 모르는 역할 문자열은 원문을 그대로 표시한다. */
export function projectRoleLabel(role: string): string {
  return PROJECT_ROLE_LABELS[role] ?? role;
}
export function orgRoleLabel(role: string): string {
  return ORG_ROLE_LABELS[role] ?? role;
}

/** 현재 역할이 자산·버전을 편집할 수 있는지. 서버 판정(403)이 정본이며 버튼 노출에만 쓴다. */
export function canEdit(role: string | undefined): boolean {
  return role === "admin" || role === "editor";
}
/** 승인·반려는 프로젝트 관리자만 가능하다(계약 0.2.0 역할 의미). */
export function canApprove(role: string | undefined): boolean {
  return role === "admin";
}

/**
 * 프로젝트 id로 결정적으로 정하는 구분 색(1~4). 서버에 색 속성이 없으므로(R-FE-09)
 * 목록 순서가 바뀌어도 같은 프로젝트는 같은 색이다. 이름·코드를 항상 함께 표시해 색에만 의존하지 않는다.
 */
export function accentFor(projectId: string): ProjectOption["accent"] {
  let h = 0;
  for (let i = 0; i < projectId.length; i++) h = (h * 31 + projectId.charCodeAt(i)) >>> 0;
  return ((h % 4) + 1) as ProjectOption["accent"];
}

export function toProjectOption(p: ProjectView): ProjectOption {
  return { id: p.id, code: p.code, name: p.name, accent: accentFor(p.id) };
}

export type ProjectDraft = {
  organizationId: string;
  code: string;
  name: string;
  timezone: string;
  description: string;
};

export type ProjectFieldErrors = Partial<Record<keyof ProjectDraft, string>>;

/** IANA 시간대 이름인지 브라우저의 Intl로 확인한다. 서버도 같은 규칙으로 검증한다(R-FE-13). */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("ko-KR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

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
  else if (!isValidTimeZone(tz))
    errors.timezone = "IANA 시간대 이름이어야 합니다(예: Asia/Seoul).";
  if (d.description.length > PROJECT_LIMITS.description)
    errors.description = `설명은 ${PROJECT_LIMITS.description}자 이하여야 합니다.`;
  return errors;
}
