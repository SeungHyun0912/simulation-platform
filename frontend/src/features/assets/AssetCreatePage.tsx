import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiError, classifyError } from "../../shared/api/errors";
import { Button } from "../../shared/components/Button";
import { SelectField, TextAreaField, TextField } from "../../shared/components/Fields";
import { Block, DirtyIndicator, FieldGrid, Note, SampleDataNotice, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import { canEdit, projectRoleLabel } from "../projects/projectView";
import { useCurrentProject } from "../projects/useCurrentProject";
import { KIND_LABELS, validateInfoDraft, type AssetKind, type InfoDraft } from "./assetView";
import { buildAssetCreate, EMPTY_INFO_DRAFT, mapServerErrors } from "./infoDraft";
import { useAssetWriter } from "./writer";

type FieldMap = Partial<Record<keyof InfoDraft, string>>;

/** 자산 생성. 종류에 맞는 상세만 보내고 포트는 서버가 같은 트랜잭션에서 만든다. */
export function AssetCreatePage() {
  const { projectId, project, label, loading } = useCurrentProject();
  const source = useDataSource();
  const navigate = useNavigate();
  const writer = useAssetWriter(projectId);

  const [kind, setKind] = useState<AssetKind>("equipment");
  const [draft, setDraft] = useState<InfoDraft>(EMPTY_INFO_DRAFT);
  const [touched, setTouched] = useState<Set<keyof InfoDraft>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<FieldMap>({});
  const [general, setGeneral] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<unknown>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(EMPTY_INFO_DRAFT) || kind !== "equipment";
  // 생성이 끝나 상세로 이동할 때는 미저장 확인을 띄우지 않는다.
  const guard = useUnsavedChangesGuard(dirty && created === null);

  useEffect(() => {
    if (created) navigate(`/projects/${projectId}/assets/${created}`);
  }, [created, navigate, projectId]);

  const mayCreate = canEdit(project?.role);
  const clientErrors = validateInfoDraft(draft, kind);
  const shown: FieldMap = {};
  for (const k of touched) if (clientErrors[k]) shown[k] = clientErrors[k];
  for (const [k, v] of Object.entries(serverFields)) if (v) shown[k as keyof InfoDraft] = v;
  const hasClientError = Object.keys(clientErrors).length > 0;
  const canSubmit = source === "api" && mayCreate && !hasClientError && !submitting && created === null;

  function update<K extends keyof InfoDraft>(key: K, value: InfoDraft[K]) {
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
      const info = await writer.create(buildAssetCreate(draft, kind));
      setCreated(info.id);
    } catch (e) {
      const k = classifyError(e);
      if ((k === "duplicate" || k === "validation") && e instanceof ApiError) {
        const mapped = mapServerErrors(e);
        setServerFields(mapped.fields);
        setGeneral(mapped.general);
        if (Object.keys(mapped.fields).length === 0 && mapped.general.length === 0) setError(e);
      } else setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  const head = (
    <PageHeader
      title="자산 추가"
      breadcrumbs={[
        { label: "프로젝트", to: "/" },
        { label },
        { label: "설비·공간", to: `/projects/${projectId}/assets` },
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
        <StateNotice kind="forbidden" title="자산을 만들 권한이 없습니다">
          내 역할: {project ? projectRoleLabel(project.role) : "알 수 없음"}. 관리자 또는 편집자만 만들 수 있습니다(최종
          판정은 서버가 합니다).
        </StateNotice>
      </>
    );

  const networkUncertain = !!error && classifyError(error) === "network";
  const issues: ValidationIssue[] = [...general];

  return (
    <>
      {guard}
      {head}
      {source === "static" && (
        <SampleDataNotice>정적 예시 화면에서는 자산이 만들어지지 않습니다(입력 확인용).</SampleDataNotice>
      )}
      {dirty && created === null && <DirtyIndicator />}
      <SaveErrorNotice error={error} />
      {networkUncertain && (
        <Block>
          <Note>
            요청이 처리되었는지 알 수 없습니다. 같은 코드로 다시 만들면 중복 오류가 날 수 있으니, 먼저{" "}
            <Link to={`/projects/${projectId}/assets?q=${encodeURIComponent(draft.code.trim())}`}>
              이 코드로 목록을 검색
            </Link>
            해 이미 만들어졌는지 확인하세요.
          </Note>
        </Block>
      )}
      {issues.length > 0 && (
        <Block>
          <ValidationPanel issues={issues} />
        </Block>
      )}

      <Section id="sec-create" title="새 자산">
        <FieldGrid>
          <SelectField
            label="종류"
            hint="만든 뒤에는 바꿀 수 없습니다. 종류에 맞는 포트가 함께 만들어집니다(설비: IN·OUT, 저장공간·도킹: 접근)."
            value={kind}
            onChange={(e) => setKind(e.target.value as AssetKind)}
          >
            {(Object.keys(KIND_LABELS) as AssetKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </SelectField>
          <TextField
            label="표시 코드"
            hint="프로젝트 안에서 고유해야 합니다."
            value={draft.code}
            error={shown.code}
            onChange={(e) => update("code", e.target.value)}
          />
          <TextField label="이름" value={draft.name} error={shown.name} onChange={(e) => update("name", e.target.value)} />
          {kind === "equipment" ? (
            <>
              <TextField
                label="설비 유형"
                value={draft.equipmentType}
                error={shown.equipmentType}
                onChange={(e) => update("equipmentType", e.target.value)}
              />
              <TextField
                label="모델"
                hint="비우면 입력 없음으로 만들어집니다."
                value={draft.modelName}
                error={shown.modelName}
                onChange={(e) => update("modelName", e.target.value)}
              />
            </>
          ) : (
            <TextField
              label="공간 유형"
              value={draft.spaceType}
              error={shown.spaceType}
              onChange={(e) => update("spaceType", e.target.value)}
            />
          )}
          <TextField
            label="정렬 순서"
            inputMode="numeric"
            value={draft.sortOrder}
            error={shown.sortOrder}
            onChange={(e) => update("sortOrder", e.target.value)}
          />
          <TextField
            label="외부 참조"
            hint="비우면 입력 없음"
            value={draft.externalRef}
            error={shown.externalRef}
            onChange={(e) => update("externalRef", e.target.value)}
          />
        </FieldGrid>
        <TextAreaField label="메모" value={draft.notes} error={shown.notes} onChange={(e) => update("notes", e.target.value)} />
        <Note>
          용량·규칙은 자산을 만든 뒤 버전(초안)을 시작해 설정합니다. 도킹이라는 이유로 용량을 무제한으로 가정하지 않습니다.
        </Note>
        <div>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {submitting ? "만드는 중…" : "자산 만들기"}
          </Button>
        </div>
      </Section>
    </>
  );
}
