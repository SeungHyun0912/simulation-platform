import { Link, useParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { classifyError } from "../../shared/api/errors";
import { Button } from "../../shared/components/Button";
import { ConflictNotice } from "../../shared/components/ConflictNotice";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { CheckboxField, TextAreaField, TextField } from "../../shared/components/Fields";
import {
  Block,
  DirtyIndicator,
  FieldGrid,
  Note,
  PreviewStateLinks,
  SampleDataNotice,
  Section,
} from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { usePreviewState } from "../../shared/hooks/usePreviewState";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import { canEdit, projectRoleLabel } from "../projects/projectView";
import { useCurrentProject } from "../projects/useCurrentProject";
import {
  validateProductDraft,
  type ProcessVersionView,
  type ProductField,
  type ProductView,
} from "./productView";
import { useProductDetail } from "./queries";
import { useProductEditor } from "./useProductEditor";

/** 충돌 안내에서 필드를 부르는 이름 */
const FIELD_LABELS: Record<ProductField, string> = {
  code: "표시 코드",
  name: "이름",
  specification: "규격",
  notes: "메모",
};

export function ProductDetailPage() {
  const { projectId, label: projectLabel, project } = useCurrentProject();
  const { productId = "" } = useParams();
  const source = useDataSource();
  const previewParam = usePreviewState();
  // ?state= 미리보기는 정적 모드에서만 쓴다. API 모드에서는 실제 요청 결과만 보여 준다.
  const preview = source === "static" ? previewParam : null;
  const detail = useProductDetail(projectId, productId);

  const header = (title: string) => (
    <PageHeader
      title={title}
      breadcrumbs={[
        { label: "프로젝트", to: "/" },
        { label: projectLabel },
        { label: "제품", to: `/projects/${projectId}/products` },
      ]}
      renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
    />
  );

  if (preview === "forbidden")
    return (
      <>
        {header("접근 불가")}
        <StateNotice kind="forbidden">이 제품을 볼 권한이 없습니다.</StateNotice>
      </>
    );
  if (detail.status === "pending")
    return (
      <>
        {header("제품")}
        <StateNotice kind="loading" />
      </>
    );
  if (detail.status === "error") {
    // 서버는 다른 프로젝트의 제품과 없는 제품을 구분하지 않고 404로 답한다. 형식이 틀린 id(422)도 같은 화면으로 처리한다.
    const kind = classifyError(detail.error);
    const notFound = kind === "not-found" || kind === "validation";
    return (
      <>
        {header(notFound ? "제품을 찾을 수 없습니다" : "제품")}
        {notFound ? (
          <StateNotice kind="empty" title="제품을 찾을 수 없습니다">
            <Link to={`/projects/${projectId}/products`}>목록으로 돌아가기</Link>
          </StateNotice>
        ) : (
          <QueryErrorNotice error={detail.error} subject="제품" onRetry={detail.retry} />
        )}
      </>
    );
  }

  // key로 프로젝트·제품이 바뀌면 입력 중인 폼 상태를 완전히 버린다.
  return (
    <ProductForm
      key={`${projectId}:${detail.data.id}`}
      base={detail.data}
      projectId={projectId}
      projectLabel={projectLabel}
      role={project?.role}
      showConflict={preview === "conflict"}
    />
  );
}

function ProductForm({
  base,
  projectId,
  projectLabel,
  role,
  showConflict,
}: {
  base: ProductView;
  projectId: string;
  projectLabel: string;
  role: string | undefined;
  showConflict: boolean;
}) {
  const source = useDataSource();
  const editor = useProductEditor(base, projectId, showConflict);
  const { draft, dirty } = editor;
  const guard = useUnsavedChangesGuard(dirty);
  const mayEdit = canEdit(role);

  // 클라이언트 형식 검사 + 서버가 돌려준 필드 오류(서버가 더 구체적이므로 우선)
  const clientErrors = validateProductDraft(draft);
  const serverFields = Object.fromEntries(Object.entries(editor.fieldErrors).filter(([, v]) => v)) as Partial<
    Record<ProductField, string>
  >;
  const errors = { ...clientErrors, ...serverFields };
  const hasClientError = Object.keys(clientErrors).length > 0;
  const canSave = source === "api" && mayEdit && dirty && !hasClientError && !editor.saving;

  const issues: ValidationIssue[] = [];
  if (clientErrors.specification)
    issues.push({
      severity: "error",
      message: "규격이 비어 있습니다. 값을 입력하거나 '규격 미정'을 선택하세요.",
      field_path: "/specification",
    });
  if (clientErrors.name) issues.push({ severity: "error", message: clientErrors.name, field_path: "/name" });
  if (clientErrors.code) issues.push({ severity: "error", message: clientErrors.code, field_path: "/code" });
  if (draft.specUnknown)
    issues.push({
      severity: "warning",
      message: "규격이 미정입니다. 초안 저장은 가능하지만 공정 승인·실행 전에 확인이 필요합니다.",
      field_path: "/specification",
    });
  issues.push(...editor.general);

  const versionColumns: Column<ProcessVersionView>[] = [
    { key: "no", header: "버전", render: (v) => `v${v.versionNo}` },
    { key: "status", header: "상태", render: (v) => <VersionStatusBadge status={v.status} /> },
    {
      key: "edit",
      header: "작업",
      render: (v) => (
        <Link
          to={`/projects/${projectId}/products/${base.id}/processes/${v.id}`}
          aria-label={`v${v.versionNo} ${v.status === "draft" ? "공정 편집" : "공정 보기"}`}
        >
          {v.status === "draft" ? "공정 편집 (초안 UI)" : "공정 보기 (초안 UI)"}
        </Link>
      ),
    },
  ];
  const versions = [...base.versions].sort((a, b) => b.versionNo - a.versionNo);
  const hintEntries = (Object.entries(editor.hints) as [ProductField, string | undefined][]).filter(
    ([, v]) => v !== undefined,
  );

  return (
    <>
      {guard}
      <PageHeader
        title={`${base.code} ${base.name}`}
        breadcrumbs={[
          { label: "프로젝트", to: "/" },
          { label: projectLabel },
          { label: "제품", to: `/projects/${projectId}/products` },
          { label: base.code },
        ]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
        actions={
          <>
            <Button disabled={!dirty || editor.saving} onClick={editor.reset}>
              되돌리기
            </Button>
            <Button
              variant="primary"
              disabled={!canSave}
              onClick={() => void editor.save()}
              title={
                source === "static"
                  ? "정적 예시 화면에서는 저장하지 않습니다"
                  : !mayEdit
                    ? "이 역할은 수정할 수 없습니다"
                    : hasClientError
                      ? "오류를 해결해야 저장할 수 있습니다"
                      : undefined
              }
            >
              {editor.saving ? "저장 중…" : source === "static" ? "저장 (정적 예시)" : "저장"}
            </Button>
          </>
        }
      />
      <SampleDataNotice>
        {source === "static"
          ? "예시 데이터입니다. 입력은 이 화면에서만 유지되며 서버에 저장되지 않습니다."
          : "서버에서 불러온 데이터입니다. 저장하면 서버에 반영됩니다. 공정 화면은 아직 정적 예시라 연결되어 있지 않습니다."}
      </SampleDataNotice>
      <Block>
        <Note>
          내 역할: {role ? projectRoleLabel(role) : "알 수 없음"}
          {mayEdit ? "" : " — 수정할 수 없습니다(버튼 노출만 제한하며 최종 권한은 서버가 판정합니다)."}
        </Note>
      </Block>

      {editor.conflict && (
        <Block>
          <ConflictNotice
            onReload={() => void editor.reloadFromServer()}
            onKeepEditing={() => void editor.keepMineAndMerge()}
          />
        </Block>
      )}
      <SaveErrorNotice error={editor.error} />
      {editor.saved && !dirty && <p role="status">제품 정보를 저장했습니다.</p>}

      {dirty && <DirtyIndicator />}
      {issues.length > 0 && (
        <Block>
          <ValidationPanel issues={issues} />
        </Block>
      )}

      <Section id="sec-basic" title="기본 정보">
        {base.archivedAt && <Note>보관된 제품입니다.</Note>}
        <FieldGrid>
          <TextField label="내부 ID" value={base.id} readOnly hint="변경할 수 없습니다." />
          <TextField
            label="표시 코드"
            value={draft.code}
            readOnly={!mayEdit}
            error={errors.code}
            onChange={(e) => editor.edit({ code: e.target.value })}
          />
          <TextField
            label="이름"
            value={draft.name}
            readOnly={!mayEdit}
            error={errors.name}
            onChange={(e) => editor.edit({ name: e.target.value })}
          />
          <TextField
            label="규격"
            value={draft.specification}
            disabled={draft.specUnknown}
            readOnly={!mayEdit}
            error={errors.specification}
            hint="자유 텍스트입니다. 표기 형식은 정해지지 않았습니다."
            onChange={(e) => editor.edit({ specification: e.target.value })}
          />
        </FieldGrid>
        <CheckboxField
          label="규격 미정"
          checked={draft.specUnknown}
          disabled={!mayEdit}
          onChange={(e) => editor.edit({ specUnknown: e.target.checked })}
        />
        <Note>미정은 비어 있는 값과 다릅니다. 알 수 없으면 "규격 미정"을 선택하세요.</Note>
        <TextAreaField
          label="메모"
          hint="비우면 입력 없음"
          value={draft.notes}
          readOnly={!mayEdit}
          error={errors.notes}
          onChange={(e) => editor.edit({ notes: e.target.value })}
        />
        {hintEntries.length > 0 && (
          <Note>
            저장하기 전에 다른 사용자가 바꾼 값이 있습니다. 내 입력을 유지했으며, 저장하면 아래 항목은 내 값으로 바뀝니다:{" "}
            {hintEntries.map(([k, v]) => `${FIELD_LABELS[k]}(서버 값: ${v})`).join(", ")}
          </Note>
        )}
      </Section>

      <Section id="sec-versions" title="공정 버전">
        {source === "static" ? (
          <>
            <Note>
              승인된 버전은 수정할 수 없고, 변경하려면 복사하여 새 초안을 만듭니다. 공정 화면은 계약 승인 전의 초안
              UI이며, 새 초안 생성은 연결되어 있지 않습니다.
            </Note>
            {versions.length === 0 ? (
              <StateNotice kind="empty" title="공정 버전이 없습니다">
                이 제품에는 아직 공정이 없습니다.
              </StateNotice>
            ) : (
              <DataTable
                caption={`${base.code} 공정 버전`}
                columns={versionColumns}
                rows={versions}
                getRowKey={(v) => v.id}
              />
            )}
            <div>
              <Button disabled title="정적 예시 화면에서는 만들지 않습니다">
                새 초안 만들기 (연동 전)
              </Button>
            </div>
          </>
        ) : (
          <>
            <Note>
              아래는 서버가 알려 주는 요약입니다. 공정 편집 화면은 아직 정적 예시이며 서버 데이터와 연결되어 있지 않아
              여기서 열지 않습니다.
            </Note>
            {base.latestProcessVersion ? (
              <ul>
                <li>
                  최신 버전: v{base.latestProcessVersion.versionNo}{" "}
                  <VersionStatusBadge status={base.latestProcessVersion.status} />
                </li>
                <li>
                  현재 승인본:{" "}
                  {base.currentProcessVersion ? `v${base.currentProcessVersion.versionNo}` : "없음"}
                </li>
              </ul>
            ) : (
              <StateNotice kind="empty" title="공정 버전이 없습니다">
                이 제품에는 아직 공정이 없습니다.
              </StateNotice>
            )}
          </>
        )}
      </Section>

      {source === "static" && <PreviewStateLinks states={["conflict", "forbidden"]} />}
    </>
  );
}
