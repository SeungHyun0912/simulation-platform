import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiError, classifyError } from "../../shared/api/errors";
import { Button } from "../../shared/components/Button";
import { CheckboxField, TextAreaField, TextField } from "../../shared/components/Fields";
import { Block, DirtyIndicator, FieldGrid, Note, SampleDataNotice, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import { canEdit, projectRoleLabel } from "../projects/projectView";
import { useCurrentProject } from "../projects/useCurrentProject";
import { buildProductCreate, mapProductErrors } from "./productDraft";
import {
  EMPTY_PRODUCT_DRAFT,
  validateProductDraft,
  type ProductDraft,
  type ProductField,
} from "./productView";
import { useProductWriter } from "./writer";

type FieldMap = Partial<Record<ProductField, string>>;

/** 제품 생성. 규격은 미정으로 시작하며, 비운 메모·미정 규격은 본문에서 생략한다(서버가 null로 저장). */
export function ProductCreatePage() {
  const { projectId, project, label, loading } = useCurrentProject();
  const source = useDataSource();
  const navigate = useNavigate();
  const writer = useProductWriter(projectId);

  const [draft, setDraft] = useState<ProductDraft>(EMPTY_PRODUCT_DRAFT);
  const [touched, setTouched] = useState<Set<ProductField>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<FieldMap>({});
  const [general, setGeneral] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<unknown>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(EMPTY_PRODUCT_DRAFT);
  // 생성이 끝나 상세로 이동할 때는 미저장 확인을 띄우지 않는다.
  const guard = useUnsavedChangesGuard(dirty && created === null);

  useEffect(() => {
    if (created) navigate(`/projects/${projectId}/products/${created}`);
  }, [created, navigate, projectId]);

  const mayCreate = canEdit(project?.role);
  const clientErrors = validateProductDraft(draft);
  const shown: FieldMap = {};
  for (const k of touched) if (clientErrors[k]) shown[k] = clientErrors[k];
  for (const [k, v] of Object.entries(serverFields)) if (v) shown[k as ProductField] = v;
  const hasClientError = Object.keys(clientErrors).length > 0;
  const canSubmit = source === "api" && mayCreate && !hasClientError && !submitting && created === null;

  function update(patch: Partial<ProductDraft>, field: ProductField) {
    setDraft((d) => ({ ...d, ...patch }));
    setTouched((t) => new Set(t).add(field));
    setServerFields((cur) => (field in cur ? { ...cur, [field]: undefined } : cur));
  }

  async function submit() {
    if (!canSubmit) return; // 저장 중 중복 전송 방지
    setSubmitting(true);
    setServerFields({});
    setGeneral([]);
    setError(null);
    try {
      const p = await writer.create(buildProductCreate(draft));
      setCreated(p.id);
    } catch (e) {
      const k = classifyError(e);
      if ((k === "duplicate" || k === "validation") && e instanceof ApiError) {
        const mapped = mapProductErrors(e);
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
      title="제품 추가"
      breadcrumbs={[
        { label: "프로젝트", to: "/" },
        { label },
        { label: "제품", to: `/projects/${projectId}/products` },
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
        <StateNotice kind="forbidden" title="제품을 만들 권한이 없습니다">
          내 역할: {project ? projectRoleLabel(project.role) : "알 수 없음"}. 관리자 또는 편집자만 만들 수 있습니다(최종
          판정은 서버가 합니다).
        </StateNotice>
      </>
    );

  const networkUncertain = !!error && classifyError(error) === "network";

  return (
    <>
      {guard}
      {head}
      {source === "static" && (
        <SampleDataNotice>정적 예시 화면에서는 제품이 만들어지지 않습니다(입력 확인용).</SampleDataNotice>
      )}
      {dirty && created === null && <DirtyIndicator />}
      <SaveErrorNotice error={error} />
      {networkUncertain && (
        <Block>
          <Note>
            요청이 처리되었는지 알 수 없습니다. 같은 코드로 다시 만들면 중복 오류가 날 수 있으니, 먼저{" "}
            <Link to={`/projects/${projectId}/products?q=${encodeURIComponent(draft.code.trim())}`}>
              이 코드로 목록을 검색
            </Link>
            해 이미 만들어졌는지 확인하세요.
          </Note>
        </Block>
      )}
      {general.length > 0 && (
        <Block>
          <ValidationPanel issues={general} />
        </Block>
      )}

      <Section id="sec-create" title="새 제품">
        <FieldGrid>
          <TextField
            label="표시 코드"
            hint="프로젝트 안에서 고유해야 합니다."
            value={draft.code}
            error={shown.code}
            onChange={(e) => update({ code: e.target.value }, "code")}
          />
          <TextField
            label="이름"
            value={draft.name}
            error={shown.name}
            onChange={(e) => update({ name: e.target.value }, "name")}
          />
          <TextField
            label="규격"
            value={draft.specification}
            disabled={draft.specUnknown}
            error={shown.specification}
            hint="자유 텍스트입니다. 표기 형식은 정해지지 않았습니다."
            onChange={(e) => update({ specification: e.target.value }, "specification")}
          />
        </FieldGrid>
        <CheckboxField
          label="규격 미정"
          checked={draft.specUnknown}
          onChange={(e) => update({ specUnknown: e.target.checked }, "specification")}
        />
        <Note>미정은 비어 있는 값과 다릅니다. 알 수 없으면 "규격 미정"을 선택하세요(처음에는 미정입니다).</Note>
        <TextAreaField
          label="메모"
          hint="비우면 입력 없음"
          value={draft.notes}
          error={shown.notes}
          onChange={(e) => update({ notes: e.target.value }, "notes")}
        />
        <Note>공정은 제품을 만든 뒤 공정 버전(초안)으로 정의합니다. 공정 화면은 아직 연결되어 있지 않습니다.</Note>
        <div>
          <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {submitting ? "만드는 중…" : "제품 만들기"}
          </Button>
        </div>
      </Section>
    </>
  );
}
