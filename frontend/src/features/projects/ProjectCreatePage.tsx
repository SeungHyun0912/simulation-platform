import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiError, classifyError } from "../../shared/api/errors";
import { Button } from "../../shared/components/Button";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
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
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import {
  PROJECT_LIMITS,
  validateProjectDraft,
  type ProjectDraft,
  type ProjectFieldErrors,
} from "./projectView";
import { useMe } from "./queries";
import type { OrganizationView } from "./projectView";
import { buildProjectCreate, mapProjectErrors, useProjectWriter } from "./writer";

function makeInitial(orgs: OrganizationView[]): ProjectDraft {
  return {
    organizationId: orgs.length === 1 ? orgs[0]!.id : "",
    code: "",
    name: "",
    timezone: "Asia/Seoul",
    description: "",
  };
}

const FIELD_LABELS: Record<keyof ProjectDraft, string> = {
  organizationId: "조직",
  code: "코드",
  name: "이름",
  timezone: "시간대",
  description: "설명",
};

/** 프로젝트 생성. 조직은 내 정보(/me)에서 오며 role이 admin인 조직만 고를 수 있다(R-FE-13, 서버가 최종 판정). */
export function ProjectCreatePage() {
  const me = useMe();
  const head = (
    <PageHeader
      title="프로젝트 만들기"
      breadcrumbs={[{ label: "프로젝트", to: "/" }, { label: "만들기" }]}
      renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
    />
  );
  if (me.status === "pending")
    return (
      <>
        {head}
        <StateNotice kind="loading" />
      </>
    );
  if (me.status === "error")
    return (
      <>
        {head}
        <QueryErrorNotice error={me.error} subject="내 정보" onRetry={me.retry} />
      </>
    );
  return <ProjectCreateForm orgs={me.data.organizations.filter((o) => o.role === "admin")} />;
}

function ProjectCreateForm({ orgs }: { orgs: OrganizationView[] }) {
  const source = useDataSource();
  const INITIAL = useMemo(() => makeInitial(orgs), [orgs]);
  const [draft, setDraft] = useState<ProjectDraft>(INITIAL);
  // 사용자가 건드린 필드만 오류를 보여 준다. 빈 새 폼에 오류가 가득 보이지 않게 한다.
  const [touched, setTouched] = useState<Set<keyof ProjectDraft>>(new Set());
  const writer = useProjectWriter();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<ProjectFieldErrors>({});
  const [general, setGeneral] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(INITIAL);
  // 생성이 끝나 이동할 때는 미저장 확인을 띄우지 않는다.
  const guard = useUnsavedChangesGuard(dirty && created === null);

  useEffect(() => {
    if (created) navigate(`/projects/${created}/assets`);
  }, [created, navigate]);

  const errors = validateProjectDraft(draft);
  const shown: ProjectFieldErrors = {};
  for (const key of touched) if (errors[key]) shown[key] = errors[key];
  for (const [key, v] of Object.entries(serverFields)) if (v) shown[key as keyof ProjectDraft] = v;
  const canSubmit = source === "api" && Object.keys(errors).length === 0 && !submitting && created === null;

  const issues: ValidationIssue[] = (Object.keys(shown) as (keyof ProjectDraft)[]).map((key) => ({
    severity: "error",
    message: `${FIELD_LABELS[key]}: ${shown[key]}`,
    field_path: `/${key === "organizationId" ? "organization_id" : key}`,
  }));

  function update<K extends keyof ProjectDraft>(key: K, value: ProjectDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setTouched((t) => new Set(t).add(key));
    setServerFields((cur) => (key in cur ? { ...cur, [key]: undefined } : cur));
  }

  async function submit() {
    if (!canSubmit) return; // 저장 중 중복 전송 방지
    setSubmitting(true);
    setServerFields({});
    setGeneral([]);
    setError(null);
    try {
      setCreated((await writer.create(buildProjectCreate(draft))).id);
    } catch (e) {
      const k = classifyError(e);
      if ((k === "duplicate" || k === "validation") && e instanceof ApiError) {
        const mapped = mapProjectErrors(e);
        setServerFields(mapped.fields);
        setGeneral(mapped.general);
        if (Object.keys(mapped.fields).length + mapped.general.length === 0) setError(e);
      } else setError(e);
    } finally {
      setSubmitting(false);
    }
  }
  const networkUncertain = !!error && classifyError(error) === "network";

  if (orgs.length === 0)
    return (
      <>
        <PageHeader
          title="프로젝트 만들기"
          breadcrumbs={[{ label: "프로젝트", to: "/" }, { label: "만들기" }]}
          renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
        />
        <StateNotice kind="forbidden" title="프로젝트를 만들 권한이 없습니다">
          프로젝트는 조직 관리자만 만들 수 있습니다. 조직 관리자에게 요청하세요.
        </StateNotice>
      </>
    );

  return (
    <>
      {guard}
      <PageHeader
        title="프로젝트 만들기"
        breadcrumbs={[{ label: "프로젝트", to: "/" }, { label: "만들기" }]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
        actions={
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {submitting ? "만드는 중…" : "프로젝트 만들기"}
          </Button>
        }
      />
      {source === "static" && (
        <SampleDataNotice>입력은 이 화면에서만 유지되며 서버에 저장되지 않습니다. 조직 목록은 예시입니다.</SampleDataNotice>
      )}
      {dirty && created === null && <DirtyIndicator />}
      <SaveErrorNotice error={error} />
      {networkUncertain && (
        <Block>
          <Note>
            요청이 처리되었는지 알 수 없습니다. 같은 코드로 다시 만들면 중복 오류가 날 수 있으니, 먼저 <Link to="/">프로젝트 목록</Link>에서 이미
            만들어졌는지 확인하세요.
          </Note>
        </Block>
      )}
      {(issues.length > 0 || general.length > 0) && (
        <Block>
          <ValidationPanel issues={[...issues, ...general]} />
        </Block>
      )}

      <Section id="sec-project" title="프로젝트 정보">
        <FieldGrid>
          <SelectField
            label="조직"
            hint="조직 관리자인 조직만 고를 수 있습니다. 만든 뒤 조직은 바꿀 수 없다고 가정합니다."
            value={draft.organizationId}
            error={shown.organizationId}
            onChange={(e) => update("organizationId", e.target.value)}
          >
            <option value="">선택하세요</option>
            {orgs.map((o) => (
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
