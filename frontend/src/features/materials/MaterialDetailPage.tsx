import { Link, useParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { classifyError } from "../../shared/api/errors";
import { Button } from "../../shared/components/Button";
import { ConflictNotice } from "../../shared/components/ConflictNotice";
import { TextAreaField, TextField } from "../../shared/components/Fields";
import { Block, DirtyIndicator, FieldGrid, Note, PreviewStateLinks, SampleDataNotice, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel } from "../../shared/components/ValidationPanel";
import { usePreviewState } from "../../shared/hooks/usePreviewState";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import { UnitSpecEditor } from "../processes/UnitSpecEditor";
import { canEdit, projectRoleLabel } from "../projects/projectView";
import { useCurrentProject } from "../projects/useCurrentProject";
import { conflictLabel } from "./materialDraft";
import { hasMaterialErrors, validateMaterialDraft, type MaterialView } from "./materialView";
import { useMaterialDetail } from "./queries";
import { useMaterialEditor } from "./useMaterialEditor";

export function MaterialDetailPage() {
  const { projectId, label: projectLabel, project } = useCurrentProject();
  const { materialId = "" } = useParams();
  const source = useDataSource();
  const previewParam = usePreviewState();
  // ?state= 미리보기는 정적 모드에서만 쓴다. API 모드에서는 실제 요청 결과만 보여 준다.
  const preview = source === "static" ? previewParam : null;
  const detail = useMaterialDetail(projectId, materialId);

  const header = (title: string) => (
    <PageHeader
      title={title}
      breadcrumbs={[
        { label: "프로젝트", to: "/" },
        { label: projectLabel },
        { label: "재료", to: `/projects/${projectId}/materials` },
      ]}
      renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
    />
  );

  if (preview === "forbidden")
    return (
      <>
        {header("접근 불가")}
        <StateNotice kind="forbidden">이 재료를 볼 권한이 없습니다.</StateNotice>
      </>
    );
  if (detail.status === "pending")
    return (
      <>
        {header("재료")}
        <StateNotice kind="loading" />
      </>
    );
  if (detail.status === "error") {
    // 서버는 다른 프로젝트의 재료와 없는 재료를 구분하지 않고 404로 답한다. 형식이 틀린 id(422)도 같은 화면으로 처리한다.
    const kind = classifyError(detail.error);
    const notFound = kind === "not-found" || kind === "validation";
    return (
      <>
        {header(notFound ? "재료를 찾을 수 없습니다" : "재료")}
        {notFound ? (
          <StateNotice kind="empty" title="재료를 찾을 수 없습니다">
            <Link to={`/projects/${projectId}/materials`}>목록으로 돌아가기</Link>
          </StateNotice>
        ) : (
          <QueryErrorNotice error={detail.error} subject="재료" onRetry={detail.retry} />
        )}
      </>
    );
  }

  // key로 프로젝트·재료가 바뀌면 입력 중인 폼 상태를 완전히 버린다.
  return (
    <MaterialForm
      key={`${projectId}:${detail.data.id}`}
      base={detail.data}
      projectId={projectId}
      projectLabel={projectLabel}
      role={project?.role}
      showConflict={preview === "conflict"}
    />
  );
}

function MaterialForm({
  base,
  projectId,
  projectLabel,
  role,
  showConflict,
}: {
  base: MaterialView;
  projectId: string;
  projectLabel: string;
  role: string | undefined;
  showConflict: boolean;
}) {
  const source = useDataSource();
  const editor = useMaterialEditor(base, projectId, showConflict);
  const { draft, dirty } = editor;
  const guard = useUnsavedChangesGuard(dirty);
  const mayEdit = canEdit(role);

  // 클라이언트 형식 검사 + 서버가 돌려준 오류(서버가 더 구체적이므로 우선)
  const client = validateMaterialDraft(draft);
  const serverFields = Object.fromEntries(Object.entries(editor.fieldErrors).filter(([, v]) => v));
  const fields = { ...client.fields, ...serverFields };
  const specErrors = { ...client.spec, ...editor.specErrors };
  const hasClientError = hasMaterialErrors(client);
  const canSave = source === "api" && mayEdit && dirty && !hasClientError && !editor.saving;
  const hintEntries = Object.entries(editor.hints);

  return (
    <>
      {guard}
      <PageHeader
        title={`${base.code} ${base.name}`}
        breadcrumbs={[
          { label: "프로젝트", to: "/" },
          { label: projectLabel },
          { label: "재료", to: `/projects/${projectId}/materials` },
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
          : "서버에서 불러온 데이터입니다. 저장하면 서버에 반영됩니다."}
      </SampleDataNotice>
      <Block>
        <Note>
          내 역할: {role ? projectRoleLabel(role) : "알 수 없음"}
          {mayEdit ? "" : " — 수정할 수 없습니다(버튼 노출만 제한하며 최종 권한은 서버가 판정합니다)."}
        </Note>
      </Block>

      {editor.conflict && (
        <Block>
          <ConflictNotice onReload={() => void editor.reloadFromServer()} onKeepEditing={() => void editor.keepMineAndMerge()} />
        </Block>
      )}
      <SaveErrorNotice error={editor.error} />
      {editor.saved && !dirty && <p role="status">재료 정보를 저장했습니다.</p>}
      {dirty && <DirtyIndicator />}
      {editor.general.length > 0 && (
        <Block>
          <ValidationPanel issues={editor.general} />
        </Block>
      )}

      <Section id="sec-basic" title="기본 정보">
        {base.archivedAt && <Note>보관된 재료입니다.</Note>}
        <FieldGrid>
          <TextField label="내부 ID" value={base.id} readOnly hint="변경할 수 없습니다." />
          <TextField
            label="표시 코드"
            hint="프로젝트 안에서 고유해야 합니다(제품 코드와는 별개)."
            value={draft.code}
            readOnly={!mayEdit}
            error={fields.code}
            onChange={(e) => editor.edit({ code: e.target.value })}
          />
          <TextField label="이름" value={draft.name} readOnly={!mayEdit} error={fields.name} onChange={(e) => editor.edit({ name: e.target.value })} />
          <TextField
            label="형태"
            hint="자유 텍스트입니다(예: 보빈, 릴). 허용값 목록은 아직 없습니다."
            value={draft.form}
            readOnly={!mayEdit}
            error={fields.form}
            onChange={(e) => editor.edit({ form: e.target.value })}
          />
        </FieldGrid>
        <TextAreaField
          label="메모"
          hint="비우면 입력 없음"
          value={draft.notes}
          readOnly={!mayEdit}
          error={fields.notes}
          onChange={(e) => editor.edit({ notes: e.target.value })}
        />
      </Section>

      <Section id="sec-spec" title="기본 규격">
        <Note>
          길이·중량·단위 수·가닥 수는 서로 다른 값이며 서로 환산하지 않습니다. 알 수 없으면 미정으로 두세요(0이 아닙니다). 해당하지 않는 값은
          "해당 없음"을 고르세요. 단위 수는 보빈 등 한 번에 다루는 단위의 개수입니다.
        </Note>
        <UnitSpecEditor title="기본 규격" value={draft.spec} onChange={editor.editSpec} errors={specErrors} disabled={!mayEdit} />
        {hintEntries.length > 0 && (
          <Note>
            저장하기 전에 다른 사용자가 바꾼 값이 있습니다. 내 입력을 유지했으며, 저장하면 아래 항목은 내 값으로 바뀝니다:{" "}
            {hintEntries.map(([k, v]) => `${conflictLabel(k)}(서버 값: ${v})`).join(", ")}
          </Note>
        )}
      </Section>

      {source === "static" && <PreviewStateLinks states={["conflict", "forbidden"]} />}
    </>
  );
}
