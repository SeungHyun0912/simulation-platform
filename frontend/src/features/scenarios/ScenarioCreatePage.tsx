import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiError, classifyError, toIssues } from "../../shared/api/errors";
import { ApiOnlyNotice } from "../../shared/components/ApiOnlyNotice";
import { Button } from "../../shared/components/Button";
import { TextAreaField, TextField } from "../../shared/components/Fields";
import { Block, DirtyIndicator, FieldGrid, Note, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import { canEdit, projectRoleLabel } from "../projects/projectView";
import { useCurrentProject } from "../projects/useCurrentProject";
import { SCENARIO_LIMITS } from "./scenarioView";
import { useScenarioWriter } from "./writer";

type Draft = { code: string; name: string; description: string };
const EMPTY: Draft = { code: "", name: "", description: "" };
type Field = keyof Draft;

function validate(d: Draft): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (d.code.trim() === "") e.code = "코드를 입력하세요.";
  else if (d.code.trim().length > SCENARIO_LIMITS.code) e.code = `코드는 ${SCENARIO_LIMITS.code}자 이하입니다.`;
  if (d.name.trim() === "") e.name = "이름을 입력하세요.";
  else if (d.name.trim().length > SCENARIO_LIMITS.name) e.name = `이름은 ${SCENARIO_LIMITS.name}자 이하입니다.`;
  if (d.description.length > SCENARIO_LIMITS.text) e.description = `설명은 ${SCENARIO_LIMITS.text}자 이하입니다.`;
  return e;
}

/** 시나리오 생성. 만들면 비어 있는 첫 초안(v1, 종료 규칙 drain)이 함께 생기며 그 초안 편집 화면으로 이동한다. */
export function ScenarioCreatePage() {
  const { projectId, project, label, loading } = useCurrentProject();
  const source = useDataSource();
  const navigate = useNavigate();
  const writer = useScenarioWriter(projectId);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [touched, setTouched] = useState<Set<Field>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ versionId: string | null; scenarioId: string } | null>(null);
  const [serverFields, setServerFields] = useState<Partial<Record<Field, string>>>({});
  const [general, setGeneral] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<unknown>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(EMPTY);
  const guard = useUnsavedChangesGuard(dirty && created === null);
  useEffect(() => {
    if (!created) return;
    navigate(created.versionId ? `/projects/${projectId}/scenarios/versions/${created.versionId}` : `/projects/${projectId}/scenarios/${created.scenarioId}`);
  }, [created, navigate, projectId]);

  const mayCreate = canEdit(project?.role);
  const client = validate(draft);
  const shown: Partial<Record<Field, string>> = {};
  for (const k of touched) if (client[k]) shown[k] = client[k];
  for (const [k, v] of Object.entries(serverFields)) if (v) shown[k as Field] = v;
  const canSubmit = source === "api" && mayCreate && Object.keys(client).length === 0 && !submitting && created === null;

  function update(key: Field, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    setTouched((t) => new Set(t).add(key));
    setServerFields((cur) => (key in cur ? { ...cur, [key]: undefined } : cur));
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setServerFields({});
    setGeneral([]);
    setError(null);
    try {
      const s = await writer.createScenario({
        code: draft.code.trim(),
        name: draft.name.trim(),
        ...(draft.description.trim() === "" ? {} : { description: draft.description }),
      });
      setCreated({ scenarioId: s.id, versionId: s.latestVersion?.id ?? null });
    } catch (e) {
      const k = classifyError(e);
      if ((k === "duplicate" || k === "validation") && e instanceof ApiError) {
        const fields: Partial<Record<Field, string>> = {};
        const rest: ValidationIssue[] = [];
        for (const i of toIssues(e)) {
          const f = (i.field_path ?? "").replace(/^\//, "") as Field;
          if (f in EMPTY && !(f in fields)) fields[f] = i.message;
          else rest.push(i);
        }
        if (e.code === "SCENARIO_CODE_CONFLICT" && !fields.code) fields.code = "이 프로젝트에 이미 있는 코드입니다.";
        setServerFields(fields);
        setGeneral(rest);
        if (Object.keys(fields).length + rest.length === 0) setError(e);
      } else setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  const head = (
    <PageHeader
      title="시나리오 추가"
      breadcrumbs={[{ label: "프로젝트", to: "/" }, { label }, { label: "시나리오", to: `/projects/${projectId}/scenarios` }, { label: "추가" }]}
      renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
    />
  );
  if (source === "static")
    return (
      <>
        {head}
        <ApiOnlyNotice subject="시나리오" />
      </>
    );
  if (loading)
    return (
      <>
        {head}
        <StateNotice kind="loading" />
      </>
    );
  if (!mayCreate)
    return (
      <>
        {head}
        <StateNotice kind="forbidden" title="시나리오를 만들 권한이 없습니다">
          내 역할: {project ? projectRoleLabel(project.role) : "알 수 없음"}. 관리자 또는 편집자만 만들 수 있습니다(최종 판정은 서버가 합니다).
        </StateNotice>
      </>
    );

  const networkUncertain = !!error && classifyError(error) === "network";
  return (
    <>
      {guard}
      {head}
      {dirty && created === null && <DirtyIndicator />}
      <SaveErrorNotice error={error} />
      {networkUncertain && (
        <Block>
          <Note>
            요청이 처리되었는지 알 수 없습니다. 같은 코드로 다시 만들면 중복 오류가 날 수 있으니, 먼저 <Link to={`/projects/${projectId}/scenarios`}>시나리오 목록</Link>에서 이미 만들어졌는지
            확인하세요.
          </Note>
        </Block>
      )}
      {general.length > 0 && (
        <Block>
          <ValidationPanel issues={general} />
        </Block>
      )}
      <Section id="sec-create" title="새 시나리오">
        <FieldGrid>
          <TextField label="표시 코드" hint="프로젝트 안에서 고유해야 합니다." value={draft.code} error={shown.code} onChange={(e) => update("code", e.target.value)} />
          <TextField label="이름" value={draft.name} error={shown.name} onChange={(e) => update("name", e.target.value)} />
        </FieldGrid>
        <TextAreaField label="설명" hint="비우면 입력 없음" value={draft.description} error={shown.description} onChange={(e) => update("description", e.target.value)} />
        <Note>만들면 비어 있는 첫 초안이 함께 생기며, 제품·도착·종료 규칙은 초안 편집 화면에서 입력합니다.</Note>
        <div>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {submitting ? "만드는 중…" : "시나리오 만들기"}
          </Button>
        </div>
      </Section>
    </>
  );
}
