import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiError, classifyError } from "../../shared/api/errors";
import { Button } from "../../shared/components/Button";
import { TextAreaField, TextField } from "../../shared/components/Fields";
import { Block, DirtyIndicator, FieldGrid, Note, SampleDataNotice, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import { UnitSpecEditor } from "../processes/UnitSpecEditor";
import type { UnitSpecEdit, UnitSpecField } from "../processes/processView";
import { canEdit, projectRoleLabel } from "../projects/projectView";
import { useCurrentProject } from "../projects/useCurrentProject";
import { buildMaterialCreate, mapMaterialErrors } from "./materialDraft";
import { EMPTY_MATERIAL_DRAFT, hasMaterialErrors, validateMaterialDraft, type MaterialDraft, type MaterialField } from "./materialView";
import { useMaterialWriter } from "./writer";

type FieldMap = Partial<Record<MaterialField, string>>;

/** 재료 생성. 기본 규격은 모두 미정으로 시작하며, 값을 정한 항목만 본문에 담고 비운 메모는 생략한다(서버가 기본 처리). */
export function MaterialCreatePage() {
  const { projectId, project, label, loading } = useCurrentProject();
  const source = useDataSource();
  const navigate = useNavigate();
  const writer = useMaterialWriter(projectId);

  const [draft, setDraft] = useState<MaterialDraft>(EMPTY_MATERIAL_DRAFT);
  const [touched, setTouched] = useState<Set<MaterialField>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<FieldMap>({});
  const [serverSpec, setServerSpec] = useState<Partial<Record<UnitSpecField, string>>>({});
  const [general, setGeneral] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<unknown>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(EMPTY_MATERIAL_DRAFT);
  // 생성이 끝나 상세로 이동할 때는 미저장 확인을 띄우지 않는다.
  const guard = useUnsavedChangesGuard(dirty && created === null);

  useEffect(() => {
    if (created) navigate(`/projects/${projectId}/materials/${created}`);
  }, [created, navigate, projectId]);

  const mayCreate = canEdit(project?.role);
  const client = validateMaterialDraft(draft);
  const shown: FieldMap = {};
  for (const k of touched) if (client.fields[k]) shown[k] = client.fields[k];
  for (const [k, v] of Object.entries(serverFields)) if (v) shown[k as MaterialField] = v;
  const canSubmit = source === "api" && mayCreate && !hasMaterialErrors(client) && !submitting && created === null;

  function update(patch: Partial<Omit<MaterialDraft, "spec">>, field: MaterialField) {
    setDraft((d) => ({ ...d, ...patch }));
    setTouched((t) => new Set(t).add(field));
    setServerFields((cur) => (field in cur ? { ...cur, [field]: undefined } : cur));
  }

  function updateSpec(spec: UnitSpecEdit) {
    setDraft((d) => ({ ...d, spec }));
    setServerSpec({});
  }

  async function submit() {
    if (!canSubmit) return; // 저장 중 중복 전송 방지
    setSubmitting(true);
    setServerFields({});
    setServerSpec({});
    setGeneral([]);
    setError(null);
    try {
      const m = await writer.create(buildMaterialCreate(draft));
      setCreated(m.id);
    } catch (e) {
      const k = classifyError(e);
      if ((k === "duplicate" || k === "validation") && e instanceof ApiError) {
        const mapped = mapMaterialErrors(e);
        setServerFields(mapped.fields);
        setServerSpec(mapped.spec);
        setGeneral(mapped.general);
        if (Object.keys(mapped.fields).length + Object.keys(mapped.spec).length + mapped.general.length === 0) setError(e);
      } else setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  const head = (
    <PageHeader
      title="재료 추가"
      breadcrumbs={[
        { label: "프로젝트", to: "/" },
        { label },
        { label: "재료", to: `/projects/${projectId}/materials` },
        { label: "추가" },
      ]}
      renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
    />
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
        <StateNotice kind="forbidden" title="재료를 만들 권한이 없습니다">
          내 역할: {project ? projectRoleLabel(project.role) : "알 수 없음"}. 관리자 또는 편집자만 만들 수 있습니다(최종 판정은 서버가 합니다).
        </StateNotice>
      </>
    );

  const networkUncertain = !!error && classifyError(error) === "network";

  return (
    <>
      {guard}
      {head}
      {source === "static" && <SampleDataNotice>정적 예시 화면에서는 재료가 만들어지지 않습니다(입력 확인용).</SampleDataNotice>}
      {dirty && created === null && <DirtyIndicator />}
      <SaveErrorNotice error={error} />
      {networkUncertain && (
        <Block>
          <Note>
            요청이 처리되었는지 알 수 없습니다. 같은 코드로 다시 만들면 중복 오류가 날 수 있으니, 먼저{" "}
            <Link to={`/projects/${projectId}/materials?q=${encodeURIComponent(draft.code.trim())}`}>이 코드로 목록을 검색</Link>해 이미 만들어졌는지
            확인하세요.
          </Note>
        </Block>
      )}
      {general.length > 0 && (
        <Block>
          <ValidationPanel issues={general} />
        </Block>
      )}

      <Section id="sec-create" title="새 재료">
        <FieldGrid>
          <TextField
            label="표시 코드"
            hint="프로젝트 안에서 고유해야 합니다(제품 코드와는 별개)."
            value={draft.code}
            error={shown.code}
            onChange={(e) => update({ code: e.target.value }, "code")}
          />
          <TextField label="이름" value={draft.name} error={shown.name} onChange={(e) => update({ name: e.target.value }, "name")} />
          <TextField
            label="형태"
            hint="자유 텍스트입니다(예: 보빈, 릴)."
            value={draft.form}
            error={shown.form}
            onChange={(e) => update({ form: e.target.value }, "form")}
          />
        </FieldGrid>
        <TextAreaField label="메모" hint="비우면 입력 없음" value={draft.notes} error={shown.notes} onChange={(e) => update({ notes: e.target.value }, "notes")} />
      </Section>
      <Section id="sec-spec" title="기본 규격">
        <Note>길이·중량·단위 수·가닥 수는 서로 다른 값이며 환산하지 않습니다. 모두 미정으로 시작합니다(0이 아닙니다). 나중에 채워도 됩니다.</Note>
        <UnitSpecEditor title="기본 규격" value={draft.spec} onChange={updateSpec} errors={{ ...client.spec, ...serverSpec }} />
        <div>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {submitting ? "만드는 중…" : "재료 만들기"}
          </Button>
        </div>
      </Section>
    </>
  );
}
