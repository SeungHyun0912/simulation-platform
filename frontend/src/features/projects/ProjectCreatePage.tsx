import { useState } from "react";
import { Link } from "react-router";
import { Button } from "../../shared/components/Button";
import { SelectField, TextAreaField, TextField } from "../../shared/components/Fields";
import {
  Block,
  DirtyIndicator,
  FieldGrid,
  Note,
  SampleDataNotice,
  Section,
} from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import {
  PROJECT_LIMITS,
  validateProjectDraft,
  type ProjectDraft,
  type ProjectFieldErrors,
} from "./projectView";
import { SAMPLE_ORGANIZATIONS } from "./sampleProjects";

const INITIAL: ProjectDraft = {
  organizationId: SAMPLE_ORGANIZATIONS.length === 1 ? SAMPLE_ORGANIZATIONS[0]!.id : "",
  code: "",
  name: "",
  timezone: "Asia/Seoul",
  description: "",
};

const FIELD_LABELS: Record<keyof ProjectDraft, string> = {
  organizationId: "조직",
  code: "코드",
  name: "이름",
  timezone: "시간대",
  description: "설명",
};

/** 프로젝트 생성 폼. 저장은 계약 승인 후 연결하며 지금은 입력 검증만 한다. */
export function ProjectCreatePage() {
  const [draft, setDraft] = useState<ProjectDraft>(INITIAL);
  // 사용자가 건드린 필드만 오류를 보여 준다. 빈 새 폼에 오류가 가득 보이지 않게 한다.
  const [touched, setTouched] = useState<Set<keyof ProjectDraft>>(new Set());
  const dirty = JSON.stringify(draft) !== JSON.stringify(INITIAL);
  const guard = useUnsavedChangesGuard(dirty);

  const errors = validateProjectDraft(draft);
  const shown: ProjectFieldErrors = {};
  for (const key of touched) if (errors[key]) shown[key] = errors[key];

  const issues: ValidationIssue[] = (Object.keys(shown) as (keyof ProjectDraft)[]).map((key) => ({
    severity: "error",
    message: `${FIELD_LABELS[key]}: ${shown[key]}`,
    field_path: `/${key === "organizationId" ? "organization_id" : key}`,
  }));

  function update<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setTouched((t) => new Set(t).add(key));
  }

  return (
    <>
      {guard}
      <PageHeader
        title="프로젝트 만들기"
        breadcrumbs={[{ label: "프로젝트", to: "/" }, { label: "만들기" }]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
        actions={
          <Button variant="primary" disabled title="생성은 API 연동 후 사용할 수 있습니다 (계약 필요)">
            만들기 (계약 필요)
          </Button>
        }
      />
      <SampleDataNotice>
        입력은 이 화면에서만 유지되며 서버에 저장되지 않습니다. 조직 목록은 예시입니다.
      </SampleDataNotice>
      {dirty && <DirtyIndicator />}
      {issues.length > 0 && (
        <Block>
          <ValidationPanel issues={issues} />
        </Block>
      )}

      <Section id="sec-project" title="프로젝트 정보">
        <FieldGrid>
          <SelectField
            label="조직"
            hint="프로젝트는 하나의 조직에 속하며 만든 뒤 바꿀 수 없다고 가정합니다."
            value={draft.organizationId}
            error={shown.organizationId}
            onChange={(e) => update("organizationId", e.target.value)}
          >
            <option value="">선택하세요</option>
            {SAMPLE_ORGANIZATIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} {o.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label="코드"
            hint={`조직 안에서 고유해야 합니다. 최대 ${PROJECT_LIMITS.code}자`}
            value={draft.code}
            error={shown.code}
            onChange={(e) => update("code", e.target.value)}
          />
          <TextField
            label="이름"
            hint={`최대 ${PROJECT_LIMITS.name}자`}
            value={draft.name}
            error={shown.name}
            onChange={(e) => update("name", e.target.value)}
          />
          <TextField
            label="시간대"
            hint="IANA 이름(예: Asia/Seoul). 시각은 UTC로 저장하고 이 시간대로 표시합니다."
            value={draft.timezone}
            error={shown.timezone}
            onChange={(e) => update("timezone", e.target.value)}
          />
        </FieldGrid>
        <TextAreaField
          label="설명 (선택)"
          hint="비워 두면 설명 없이 만들어집니다."
          value={draft.description}
          error={shown.description}
          onChange={(e) => update("description", e.target.value)}
        />
        <Note>
          코드 중복 여부와 시간대 이름이 올바른지는 서버가 확인합니다. 이 화면은 입력 형식만 검사합니다.
        </Note>
      </Section>
    </>
  );
}
