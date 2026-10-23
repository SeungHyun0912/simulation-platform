import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { SAMPLE_ASSETS } from "../assets/sampleAssets";
import { SAMPLE_PRODUCTS } from "../products/sampleProducts";
import { Button } from "../../shared/components/Button";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { ConflictNotice } from "../../shared/components/ConflictNotice";
import { DataTable, type Column } from "../../shared/components/DataTable";
import {
  Block,
  DirtyIndicator,
  Note,
  PreviewStateLinks,
  SampleDataNotice,
} from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel } from "../../shared/components/ValidationPanel";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { usePreviewState } from "../../shared/hooks/usePreviewState";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import {
  CONFIRMATION_LABELS,
  equipmentText,
  newStep,
  outputText,
  processingText,
  setupText,
  validateStep,
  type Confirmation,
  type ProcessVersionDetail,
  type StepView,
} from "./processView";
import { useCurrentProject } from "../projects/useCurrentProject";
import { SAMPLE_PROCESS_VERSIONS } from "./sampleProcesses";
import styles from "./ProcessEditorPage.module.css";
import { StepEditPanel, type CodeOption } from "./StepEditPanel";

const CONFIRMATION_MARK: Record<Confirmation, string> = {
  confirmed: "✓",
  unknown: "?",
  assumed: "△",
};

const EQUIPMENT_OPTIONS: CodeOption[] = SAMPLE_ASSETS.filter((a) => a.kind === "equipment").map(
  (a) => ({ code: a.code, name: a.name }),
);
const LOCATION_OPTIONS: CodeOption[] = SAMPLE_ASSETS.filter((a) => a.kind !== "equipment").map(
  (a) => ({ code: a.code, name: a.name }),
);

export function ProcessEditorPage() {
  const { projectId, label: projectLabel } = useCurrentProject();
  const { productId = "", versionId = "" } = useParams();
  const preview = usePreviewState();
  const product = SAMPLE_PRODUCTS.find((p) => p.id === productId);
  // 제품과 버전이 함께 일치해야 한다. 다른 제품의 버전 ID를 붙인 URL은 찾을 수 없음으로 처리한다.
  const version = SAMPLE_PROCESS_VERSIONS.find((v) => v.id === versionId && v.productId === productId);

  const header = (title: string) => (
    <PageHeader
      title={title}
      breadcrumbs={[{ label: "프로젝트" }, { label: projectLabel }, { label: "제품" }]}
    />
  );

  if (preview === "loading")
    return (
      <>
        {header("공정")}
        <StateNotice kind="loading" />
      </>
    );
  if (preview === "error")
    return (
      <>
        {header("공정")}
        <StateNotice kind="error" action={<Button>다시 시도</Button>}>
          서버에 연결되어 있지 않은 정적 화면의 오류 상태 예시입니다.
        </StateNotice>
      </>
    );
  if (preview === "forbidden")
    return (
      <>
        {header("접근 불가")}
        <StateNotice kind="forbidden">이 공정을 볼 권한이 없습니다.</StateNotice>
      </>
    );
  if (!product || !version)
    return (
      <>
        {header("공정을 찾을 수 없습니다")}
        <StateNotice kind="empty" title="공정을 찾을 수 없습니다">
          <Link to={`/projects/${projectId}/products`}>제품 목록으로 돌아가기</Link>
        </StateNotice>
      </>
    );

  // key로 프로젝트·제품·버전이 바뀌면 입력 중인 편집 상태를 완전히 버린다.
  return (
    <ProcessEditor
      key={`${projectId}:${version.id}`}
      base={version}
      projectId={projectId}
      productCode={product.code}
      productId={product.id}
      showConflict={preview === "conflict"}
    />
  );
}

function ProcessEditor({
  base,
  projectId,
  productCode,
  productId,
  showConflict,
}: {
  base: ProcessVersionDetail;
  projectId: string;
  productCode: string;
  productId: string;
  showConflict: boolean;
}) {
  const { label: projectLabel } = useCurrentProject();
  const [steps, setSteps] = useState<StepView[]>(base.steps);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const readOnly = base.status !== "draft";
  const dirty = JSON.stringify(steps) !== JSON.stringify(base.steps);
  const guard = useUnsavedChangesGuard(dirty);
  const editing = steps.find((s) => s.id === editingId) ?? null;
  const deleting = steps.find((s) => s.id === deleteId) ?? null;

  const issues = steps.flatMap((s, i) => validateStep(s, i + 1));
  const errorCount = issues.filter((i) => i.severity === "error").length;

  // 편집 패널이 열리면 제목으로 포커스를 옮겨 스크린리더·키보드 사용자가 위치를 알 수 있게 한다.
  useEffect(() => {
    if (editingId) headingRef.current?.focus();
  }, [editingId]);

  function closeEditor() {
    const id = editingId;
    setEditingId(null);
    // 닫은 뒤에는 편집을 시작한 버튼으로 포커스를 돌려 준다.
    if (id) setTimeout(() => document.getElementById(`edit-${id}`)?.focus(), 0);
  }

  function updateStep(next: StepView) {
    setSteps((cur) => cur.map((s) => (s.id === next.id ? next : s)));
  }

  function move(id: string, delta: -1 | 1) {
    setSteps((cur) => {
      const i = cur.findIndex((s) => s.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= cur.length) return cur;
      const copy = [...cur];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });
  }

  function addStep() {
    const step = newStep(crypto.randomUUID());
    setSteps((cur) => [...cur, step]);
    setEditingId(step.id);
  }

  const columns: Column<StepView>[] = [
    { key: "order", header: "순서", align: "end", render: (s) => steps.indexOf(s) + 1 },
    { key: "name", header: "공정명", render: (s) => s.name || "(이름 없음)" },
    { key: "equipment", header: "설비", render: (s) => equipmentText(s.equipment) },
    { key: "processing", header: "처리", render: (s) => processingText(s.processing) },
    { key: "setup", header: "준비", render: (s) => setupText(s.setup) },
    { key: "output", header: "산출", render: (s) => outputText(s.output) },
    { key: "next", header: "다음 위치", render: (s) => s.nextLocation ?? "미정" },
    {
      key: "confirmation",
      header: "확인 상태",
      render: (s) => (
        <span>
          <span aria-hidden="true">{CONFIRMATION_MARK[s.confirmation]}</span>{" "}
          {CONFIRMATION_LABELS[s.confirmation]}
        </span>
      ),
    },
    {
      key: "actions",
      header: "작업",
      render: (s) => {
        const i = steps.indexOf(s);
        return (
          <span className={styles.rowActions}>
            <Button id={`edit-${s.id}`} onClick={() => setEditingId(s.id)} aria-label={`${s.name || "이름 없는 단계"} ${readOnly ? "보기" : "편집"}`}>
              {readOnly ? "보기" : "편집"}
            </Button>
            {!readOnly && (
              <>
                <Button disabled={i === 0} onClick={() => move(s.id, -1)} aria-label={`${s.name || "이름 없는 단계"} 위로 이동`}>
                  ▲
                </Button>
                <Button disabled={i === steps.length - 1} onClick={() => move(s.id, 1)} aria-label={`${s.name || "이름 없는 단계"} 아래로 이동`}>
                  ▼
                </Button>
                <Button onClick={() => setDeleteId(s.id)} aria-label={`${s.name || "이름 없는 단계"} 삭제`}>
                  삭제
                </Button>
              </>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <>
      {guard}
      <ConfirmDialog
        open={deleting !== null}
        title="단계를 삭제할까요?"
        confirmLabel="삭제"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) setSteps((cur) => cur.filter((s) => s.id !== deleteId));
          if (editingId === deleteId) setEditingId(null);
          setDeleteId(null);
        }}
      >
        "{deleting?.name || "이름 없는 단계"}" 단계를 이 화면의 편집 내용에서 삭제합니다. 저장하기 전에는
        서버 데이터가 바뀌지 않습니다.
      </ConfirmDialog>

      <PageHeader
        title={`${productCode} 공정 v${base.versionNo}`}
        breadcrumbs={[
          { label: "프로젝트" },
          { label: projectLabel },
          { label: "제품", to: `/projects/${projectId}/products` },
          { label: productCode, to: `/projects/${projectId}/products/${productId}` },
          { label: `공정 v${base.versionNo}` },
        ]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
        actions={
          <>
            <Button disabled={!dirty || readOnly} onClick={() => { setSteps(base.steps); setEditingId(null); }}>
              되돌리기
            </Button>
            <Button variant="primary" disabled title="저장은 API 연동 후 사용할 수 있습니다 (계약 필요)">
              저장 (계약 필요)
            </Button>
          </>
        }
      />
      <Block>
        <StateNotice kind="contract-pending" title="초안 UI">
          단계 필드는 아직 승인되지 않은 계약(03 §4~7, 제안 상태)을 화면용으로 단순화한 것이며 승인 시
          바뀔 수 있습니다. 이 화면의 검증은 입력 형식 검사이고, 실행 가능 여부는 서버가 판정합니다
          (계약 필요).
        </StateNotice>
      </Block>
      <SampleDataNotice>
        예시 데이터입니다. 실제 공정이 아니며 입력은 이 화면에서만 유지되고 서버에 저장되지 않습니다.
      </SampleDataNotice>

      <p>
        버전 상태: <VersionStatusBadge status={base.status} />
      </p>
      {readOnly && (
        <Block>
          <Note>
            초안이 아닌 버전은 수정할 수 없습니다. 복사하여 새 초안을 만드는 기능은 계약 승인 후
            제공됩니다.
          </Note>
        </Block>
      )}

      {showConflict && !conflictDismissed && (
        <Block>
          <ConflictNotice
            onReload={() => {
              setSteps(base.steps);
              setEditingId(null);
              setConflictDismissed(true);
            }}
            onKeepEditing={() => setConflictDismissed(true)}
          />
        </Block>
      )}

      {dirty && <DirtyIndicator />}
      {issues.length > 0 && (
        <Block>
          <ValidationPanel issues={issues} />
        </Block>
      )}
      {errorCount > 0 && <Note>오류를 해결해야 저장할 수 있습니다.</Note>}

      <Block>
        {steps.length === 0 ? (
          <StateNotice kind="empty" title="단계가 없습니다">
            {readOnly ? "이 버전에는 단계가 없습니다." : "단계를 추가해 공정을 작성하세요."}
          </StateNotice>
        ) : (
          <DataTable
            caption={`${productCode} 공정 v${base.versionNo} 단계`}
            columns={columns}
            rows={steps}
            getRowKey={(s) => s.id}
            currentRowKey={editingId ?? undefined}
            wrapCells
          />
        )}
      </Block>
      {!readOnly && (
        <Block>
          <Button onClick={addStep}>단계 추가</Button>
        </Block>
      )}

      {editing && (
        <StepEditPanel
          ref={headingRef}
          step={editing}
          onChange={updateStep}
          onClose={closeEditor}
          readOnly={readOnly}
          equipmentOptions={EQUIPMENT_OPTIONS}
          locationOptions={LOCATION_OPTIONS}
        />
      )}

      <PreviewStateLinks states={["loading", "error", "forbidden", "conflict"]} />
    </>
  );
}
