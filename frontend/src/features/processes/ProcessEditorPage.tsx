import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { classifyError } from "../../shared/api/errors";
import { Button } from "../../shared/components/Button";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { ConflictNotice } from "../../shared/components/ConflictNotice";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { SelectField } from "../../shared/components/Fields";
import { Block, DirtyIndicator, Note, PreviewStateLinks, SampleDataNotice, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { ReasonDialog } from "../../shared/components/ReasonDialog";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { usePreviewState } from "../../shared/hooks/usePreviewState";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import { formatDateTime } from "../../shared/format/datetime";
import { canApprove, canEdit, projectRoleLabel } from "../projects/projectView";
import { useProjectTimezone } from "../projects/queries";
import { useCurrentProject } from "../projects/useCurrentProject";
import { useProductDetail } from "../products/queries";
import { parseLinear, nextLocationOf, operationsInOrder, stepOf, type GraphDoc, type GraphNode } from "./processDoc";
import {
  EDGE_KIND_LABELS,
  NODE_KIND_LABELS,
  isOpenProcessStatus,
  issuesByEntity,
  outputText,
  processingText,
  resourcesText,
  setupText,
  validateStepInput,
  validateUnitSpec,
  type ProcessGraphView,
  type ProcessVersionView,
  type UnitSpecField,
} from "./processView";
import { useAssetOptions, useProcessDetail, useProcessVersions, type AssetOptions } from "./queries";
import { StepEditPanel } from "./StepEditPanel";
import { UnitSpecEditor } from "./UnitSpecEditor";
import { useDraftCreator } from "./useDraftCreator";
import { useProcessEditor } from "./useProcessEditor";
import styles from "./ProcessEditorPage.module.css";

export function ProcessEditorPage() {
  const { projectId, label: projectLabel, project } = useCurrentProject();
  const { productId = "", versionId = "" } = useParams();
  const source = useDataSource();
  const previewParam = usePreviewState();
  // ?state= 미리보기는 정적 모드에서만 쓴다. API 모드에서는 실제 요청 결과만 보여 준다.
  const preview = source === "static" ? previewParam : null;
  const product = useProductDetail(projectId, productId);
  const detail = useProcessDetail(projectId, productId, versionId);
  const options = useAssetOptions(projectId);

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

  // 존재하지 않거나 접근할 수 없는 제품·버전은 서버가 구분 없이 404를 준다. 형식이 틀린 id(422)도 같은 화면으로 처리한다.
  for (const r of [product, detail, options]) {
    if (r.status === "error") {
      const kind = classifyError(r.error);
      const notFound = kind === "not-found" || kind === "validation";
      return (
        <>
          {header(notFound ? "공정을 찾을 수 없습니다" : "공정")}
          {notFound ? (
            <StateNotice kind="empty" title="공정을 찾을 수 없습니다">
              <Link to={`/projects/${projectId}/products`}>제품 목록으로 돌아가기</Link>
            </StateNotice>
          ) : (
            <QueryErrorNotice error={r.error} subject="공정" onRetry={r.retry} />
          )}
        </>
      );
    }
  }
  if (product.status === "pending" || detail.status === "pending" || options.status === "pending")
    return (
      <>
        {header("공정")}
        <StateNotice kind="loading" />
      </>
    );
  if (product.status !== "success" || detail.status !== "success" || options.status !== "success") return null;

  // key로 프로젝트·버전이 바뀌면 입력 중인 편집 상태를 완전히 버린다.
  return (
    <ProcessEditor
      key={`${projectId}:${versionId}`}
      version={detail.data.version}
      graph={detail.data.graph}
      options={options.data}
      projectId={projectId}
      projectLabel={projectLabel}
      productCode={product.data.code}
      productId={productId}
      role={project?.role}
      previewConflict={preview === "conflict"}
    />
  );
}

/** 단계(operation)의 다음 위치 문구 */
function nextText(doc: GraphDoc, node: GraphNode, options: AssetOptions): string {
  const chain = parseLinear(doc);
  if (chain) {
    const n = nextLocationOf(chain, node.id);
    if (!n || n.kind === "none") return "공간 없음";
    if (n.kind === "unset") return "위치 미정";
    return options.byId.get(n.assetId)?.code ?? n.label;
  }
  const byId = new Map(doc.nodes.map((x) => [x.id, x]));
  const targets = doc.edges.filter((e) => e.from_node_id === node.id).map((e) => byId.get(e.to_node_id)).filter((x): x is GraphNode => !!x);
  if (targets.length === 0) return "없음";
  return targets
    .map((t) => (t.kind === "buffer" ? (t.asset_id ? (options.byId.get(t.asset_id)?.code ?? t.label) : "위치 미정") : t.label))
    .join(", ");
}

function ProcessEditor({
  version,
  graph,
  options,
  projectId,
  projectLabel,
  productCode,
  productId,
  role,
  previewConflict,
}: {
  version: ProcessVersionView;
  graph: ProcessGraphView;
  options: AssetOptions;
  projectId: string;
  projectLabel: string;
  productCode: string;
  productId: string;
  role: string | undefined;
  previewConflict: boolean;
}) {
  const source = useDataSource();
  const live = source === "api";
  const navigate = useNavigate();
  const timeZone = useProjectTimezone(projectId);
  const editor = useProcessEditor({ projectId, productId, version, graph, previewConflict });
  const versions = useProcessVersions(projectId, productId);
  const openProcess = (id: string) => navigate(`/projects/${projectId}/products/${productId}/processes/${id}`);
  const drafts = useDraftCreator(projectId, productId, openProcess);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [scope, setScope] = useState<"knowledge" | "run_template">("knowledge");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const mayEdit = canEdit(role);
  const editable = version.status === "draft" && mayEdit;
  const doc = editor.draft.doc;
  const linear = parseLinear(doc) !== null;
  const rows = operationsInOrder(doc);
  const busy = editor.busy !== null;
  const guard = useUnsavedChangesGuard(editor.dirty);
  const editing = rows.find((n) => n.id === editingId) ?? null;
  const deleting = rows.find((n) => n.id === deleteId) ?? null;
  const chain = parseLinear(doc);

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

  // 입력 형식 오류(클라이언트)는 저장 전에 막고, 미정 경고는 서버 검증(issues)이 정본이다.
  const inputIssues = rows.flatMap((n, i) => validateStepInput(n, i + 1));
  const unitErrs = {
    raw: validateUnitSpec(editor.draft.raw),
    finished: validateUnitSpec(editor.draft.finished),
  };
  const unitErrorCount = Object.keys(unitErrs.raw).length + Object.keys(unitErrs.finished).length;
  const clientErrorCount = inputIssues.length + unitErrorCount;
  const allIssues: ValidationIssue[] = [...inputIssues, ...editor.rejected, ...graph.issues];
  const byEntity = issuesByEntity(allIssues);
  const assetCode = (id: string) => options.byId.get(id)?.code ?? id.slice(0, 8);

  const unitErrorFor = (which: "raw" | "finished") => {
    const out: Partial<Record<UnitSpecField, string>> = { ...unitErrs[which] };
    for (const f of ["lengthM", "weightKg", "unitCount", "strandCount"] as UnitSpecField[]) {
      const server = editor.unitErrors[`${which}:${f}`];
      if (server) out[f] = server;
    }
    return out;
  };

  const base = versions.status === "success" ? versions.data : [];
  const openOther = base.find((v) => isOpenProcessStatus(v.status) && v.id !== version.id) ?? null;
  const baseOf = version.baseVersionId ? base.find((v) => v.id === version.baseVersionId) : null;
  const canCreateDraft = live && mayEdit && version.status !== "draft" && version.status !== "in_review" && versions.status === "success" && !openOther;

  const columns: Column<GraphNode>[] = [
    { key: "order", header: "순서", align: "end", render: (n) => rows.indexOf(n) + 1 },
    { key: "name", header: "공정명", render: (n) => n.label || "(이름 없음)" },
    { key: "equipment", header: "설비", render: (n) => resourcesText(stepOf(n), assetCode) },
    { key: "processing", header: "처리", render: (n) => processingText(stepOf(n)) },
    { key: "setup", header: "준비", render: (n) => setupText(stepOf(n)) },
    { key: "output", header: "산출", render: (n) => outputText(stepOf(n)) },
    { key: "next", header: "다음 위치", render: (n) => nextText(doc, n, options) },
    {
      key: "issues",
      header: "검증",
      render: (n) => {
        const list = byEntity.get(n.id) ?? [];
        const e = list.filter((i) => i.severity === "error").length;
        const w = list.filter((i) => i.severity === "warning").length;
        if (e + w === 0) return "문제 없음";
        return `${e > 0 ? `오류 ${e}` : ""}${e > 0 && w > 0 ? " · " : ""}${w > 0 ? `경고 ${w}` : ""}`;
      },
    },
    {
      key: "actions",
      header: "작업",
      render: (n) => {
        const i = rows.indexOf(n);
        const name = n.label || "이름 없는 단계";
        return (
          <span className={styles.rowActions}>
            <Button id={`edit-${n.id}`} onClick={() => setEditingId(n.id)} aria-label={`${name} ${editable ? "편집" : "보기"}`}>
              {editable ? "편집" : "보기"}
            </Button>
            {editable && linear && (
              <>
                <Button disabled={i === 0} onClick={() => editor.move(n.id, -1)} aria-label={`${name} 위로 이동`}>
                  ▲
                </Button>
                <Button disabled={i === rows.length - 1} onClick={() => editor.move(n.id, 1)} aria-label={`${name} 아래로 이동`}>
                  ▼
                </Button>
                <Button onClick={() => setDeleteId(n.id)} aria-label={`${name} 삭제`}>
                  삭제
                </Button>
              </>
            )}
          </span>
        );
      },
    },
  ];

  const graphColumns: Column<GraphNode>[] = [
    { key: "key", header: "키", render: (n) => n.node_key },
    { key: "kind", header: "종류", render: (n) => NODE_KIND_LABELS[n.kind] },
    { key: "label", header: "이름", render: (n) => n.label },
    { key: "asset", header: "공간", render: (n) => (n.asset_id ? assetCode(n.asset_id) : n.kind === "buffer" || n.kind === "source" || n.kind === "sink" ? "위치 미정" : "-") },
  ];
  const nodeLabel = new Map(doc.nodes.map((n) => [n.id, n.label || n.node_key]));
  const edgeColumns = [
    { key: "from", header: "에서", render: (e: GraphDoc["edges"][number]) => nodeLabel.get(e.from_node_id) ?? e.from_node_id.slice(0, 8) },
    { key: "to", header: "으로", render: (e: GraphDoc["edges"][number]) => nodeLabel.get(e.to_node_id) ?? e.to_node_id.slice(0, 8) },
    { key: "kind", header: "관계", render: (e: GraphDoc["edges"][number]) => EDGE_KIND_LABELS[e.edge_kind ?? "material"] },
  ];

  const saveDisabledReason = !live
    ? "정적 예시 화면에서는 저장하지 않습니다"
    : !mayEdit
      ? "이 역할은 수정할 수 없습니다"
      : version.status !== "draft"
        ? "초안이 아닌 버전은 수정할 수 없습니다"
        : clientErrorCount > 0
          ? "오류를 해결해야 저장할 수 있습니다"
          : undefined;
  const canSave = live && editable && editor.dirty && clientErrorCount === 0 && !busy;

  return (
    <>
      {guard}
      <ConfirmDialog
        open={deleting !== null}
        title="단계를 삭제할까요?"
        confirmLabel="삭제"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (deleteId) editor.remove(deleteId);
          if (editingId === deleteId) setEditingId(null);
          setDeleteId(null);
        }}
      >
        "{deleting?.label || "이름 없는 단계"}" 단계와 뒤따르는 대기 위치를 이 화면의 편집 내용에서 삭제합니다. 저장하기 전에는 서버 데이터가 바뀌지 않습니다.
      </ConfirmDialog>
      <ReasonDialog
        open={rejectOpen}
        title="이 공정 버전을 반려할까요?"
        label="반려 사유"
        confirmLabel="반려"
        maxLength={1000}
        busy={editor.busy === "transition"}
        onCancel={() => setRejectOpen(false)}
        onConfirm={(reason) => {
          setRejectOpen(false);
          void editor.transition("reject", reason);
        }}
      >
        반려하면 이 버전은 초안으로 돌아가며, 사유가 작성자에게 표시됩니다.
      </ReasonDialog>

      <PageHeader
        title={`${productCode} 공정 v${version.versionNo}`}
        breadcrumbs={[
          { label: "프로젝트", to: "/" },
          { label: projectLabel },
          { label: "제품", to: `/projects/${projectId}/products` },
          { label: productCode, to: `/projects/${projectId}/products/${productId}` },
          { label: `공정 v${version.versionNo}` },
        ]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
        actions={
          <>
            <Button
              disabled={!editor.dirty || !editable || busy}
              onClick={() => {
                editor.reset();
                setEditingId(null);
              }}
            >
              되돌리기
            </Button>
            <Button variant="primary" disabled={!canSave} onClick={() => void editor.save()} title={saveDisabledReason}>
              {editor.busy === "saving" ? "저장 중…" : live ? "저장" : "저장 (정적 예시)"}
            </Button>
          </>
        }
      />
      <SampleDataNotice>
        {live
          ? "서버에서 불러온 데이터입니다. 저장하면 서버에 반영됩니다. 값이 미정이어도 초안 저장은 가능하지만 실행 가능 판정(실행 템플릿 검증)은 별개입니다."
          : "예시 데이터입니다. 실제 공정이 아니며 입력은 이 화면에서만 유지되고 서버에 저장되지 않습니다."}
      </SampleDataNotice>
      <Block>
        <Note>
          내 역할: {role ? projectRoleLabel(role) : "알 수 없음"}
          {mayEdit ? "" : " — 수정할 수 없습니다(버튼 노출만 제한하며 최종 권한은 서버가 판정합니다)."}
        </Note>
      </Block>

      <p>
        버전 상태: <VersionStatusBadge status={version.status} />
        {version.baseVersionId && (
          <>
            {" "}
            · 기준 버전: {baseOf ? `v${baseOf.versionNo}` : "복사 원본 있음"}
          </>
        )}
        {version.approvedAt && <> · 승인 시각({timeZone ?? "Asia/Seoul 기본"}): {formatDateTime(version.approvedAt, timeZone)}</>}
      </p>
      {version.rejectionReason && (
        <Block>
          <Note>반려 사유: {version.rejectionReason}</Note>
        </Block>
      )}
      {version.status !== "draft" && (
        <Block>
          <Note>
            {version.status === "in_review" ? "검토 중인 버전은 수정할 수 없습니다. 승인되거나 반려되면 다음 단계로 넘어갑니다." : "초안이 아닌 버전은 수정할 수 없습니다. 변경하려면 새 초안을 만듭니다."}{" "}
            {openOther && (
              <Link to={`/projects/${projectId}/products/${productId}/processes/${openOther.id}`}>열린 버전(v{openOther.versionNo}) 열기</Link>
            )}
          </Note>
        </Block>
      )}

      {editor.conflict && (
        <Block>
          <ConflictNotice
            resource="공정 버전"
            onReload={() => void editor.reloadFromServer()}
            onKeepEditing={() => void editor.keepMineAndMerge()}
          />
          {editor.mergeBlocked && (
            <Note>
              단계 추가·삭제·이동·위치 변경이 겹쳐 자동으로 합칠 수 없습니다. 최신 내용으로 다시 불러온 뒤 다시 편집하세요.
            </Note>
          )}
        </Block>
      )}
      <SaveErrorNotice error={editor.error} />
      {editor.notice && <p role="status">{editor.notice}</p>}
      {drafts.error != null && <SaveErrorNotice error={drafts.error} />}
      {editor.hints.length > 0 && (
        <Block>
          <Note>
            저장하기 전에 다른 사용자가 바꾼 값이 있습니다. 내 입력을 유지했으며, 저장하면 아래 항목은 내 값으로 바뀝니다:{" "}
            {editor.hints
              .map((h) => {
                const [which, field] = h.split(":");
                if (which === "raw" || which === "finished") return `${which === "raw" ? "원자재" : "완제품"} 단위(${field})`;
                return `단계 ${doc.nodes.find((n) => n.id === h)?.label || h.slice(0, 8)}`;
              })
              .join(", ")}
          </Note>
        </Block>
      )}

      {editor.dirty && <DirtyIndicator />}
      {allIssues.length > 0 && (
        <Block>
          <ValidationPanel issues={allIssues} />
          {editor.dirty && live && <Note>서버 검증 결과는 마지막으로 저장된 값 기준이며 저장하면 갱신됩니다.</Note>}
        </Block>
      )}
      {clientErrorCount > 0 && <Note>입력 오류를 해결해야 저장할 수 있습니다.</Note>}

      <Section id="sec-flow" title="상태 전환·검증">
        <div className={styles.rowActions}>
          {mayEdit && version.status === "draft" && (
            <Button
              disabled={!live || editor.dirty || busy}
              onClick={() => void editor.transition("submit")}
              title={!live ? "정적 예시 화면에서는 요청하지 않습니다" : editor.dirty ? "먼저 저장해야 검토를 요청할 수 있습니다" : undefined}
            >
              {editor.busy === "transition" ? "처리 중…" : "검토 요청"}
            </Button>
          )}
          {canApprove(role) && version.status === "in_review" && (
            <>
              <Button
                variant="primary"
                disabled={!live || busy}
                onClick={() => void editor.transition("approve")}
                title={live ? undefined : "정적 예시 화면에서는 승인하지 않습니다"}
              >
                {editor.busy === "transition" ? "처리 중…" : "승인"}
              </Button>
              <Button disabled={!live || busy} onClick={() => setRejectOpen(true)} title={live ? undefined : "정적 예시 화면에서는 반려하지 않습니다"}>
                반려
              </Button>
            </>
          )}
          {(version.status === "approved" || version.status === "superseded") && mayEdit && (
            <Button
              disabled={!canCreateDraft || drafts.busy}
              onClick={() => void drafts.create()}
              title={!live ? "정적 예시 화면에서는 만들지 않습니다" : openOther ? "이미 열린 버전이 있습니다" : undefined}
            >
              {drafts.busy ? "만드는 중…" : "새 초안 만들기"}
            </Button>
          )}
        </div>
        <div className={styles.rowActions}>
          <SelectField label="검증 범위" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="knowledge">지식 검증 (미정은 경고)</option>
            <option value="run_template">실행 가능 검증 (미정이 오류)</option>
          </SelectField>
          <Button disabled={!live || busy || editor.dirty} onClick={() => void editor.validate(scope)} title={editor.dirty ? "저장한 값을 검증합니다. 먼저 저장하세요." : !live ? "정적 예시 화면에서는 검증하지 않습니다" : undefined}>
            {editor.busy === "validating" ? "검증 중…" : "검증 실행"}
          </Button>
        </div>
        {editor.validation && (
          <>
            <Note>
              {editor.validation.scope === "knowledge" ? "지식 검증" : "실행 가능 검증"} 결과: 오류 {editor.validation.errorCount}건, 경고 {editor.validation.warningCount}건 (저장된 값 기준)
            </Note>
            {editor.validation.issues.length === 0 ? <p role="status">문제가 없습니다.</p> : <ValidationPanel issues={editor.validation.issues} />}
          </>
        )}
      </Section>

      <Section id="sec-units" title="원자재·완제품 단위">
        <Note>길이·중량·단위 수·가닥 수는 서로 다른 값이며 환산하지 않습니다. 기본은 모두 미정입니다.</Note>
        <UnitSpecEditor
          title="원자재"
          value={editor.draft.raw}
          onChange={(v) => editor.setUnits("raw", v)}
          errors={unitErrorFor("raw")}
          disabled={!editable}
        />
        <UnitSpecEditor
          title="완제품"
          value={editor.draft.finished}
          onChange={(v) => editor.setUnits("finished", v)}
          errors={unitErrorFor("finished")}
          disabled={!editable}
        />
      </Section>

      <Block>
        {rows.length === 0 ? (
          <StateNotice kind="empty" title="단계가 없습니다">
            {editable ? "단계를 추가해 공정을 작성하세요." : "이 버전에는 단계가 없습니다."}
          </StateNotice>
        ) : (
          <DataTable
            caption={`${productCode} 공정 v${version.versionNo} 단계`}
            columns={columns}
            rows={rows}
            getRowKey={(n) => n.id}
            currentRowKey={editingId ?? undefined}
            wrapCells
          />
        )}
      </Block>
      {editable && linear && (
        <Block>
          <Button
            onClick={() => {
              const id = editor.add();
              if (id) setEditingId(id);
            }}
          >
            단계 추가
          </Button>
        </Block>
      )}
      {!linear && (
        <Block>
          <StateNotice kind="contract-pending" title="직선이 아닌 공정입니다">
            합류·분기·선후/공급 간선·연속된 대기 공간이 있어 표로 구조를 바꿀 수 없습니다. 각 단계의 내용만 수정할 수 있으며, 노드와 간선은
            서버에서 받은 그대로 보존됩니다. 단계 추가·삭제·이동과 다음 위치 변경은 그래프 화면에서 제공될 예정입니다.
          </StateNotice>
        </Block>
      )}

      {editing && (
        <StepEditPanel
          ref={headingRef}
          node={editing}
          readOnly={!editable}
          issues={(byEntity.get(editing.id) ?? []).filter((i) => i.severity === "error" || i.entity_id === editing.id)}
          equipmentOptions={options.equipment}
          spaceOptions={options.spaces}
          assetById={options.byId}
          optionsComplete={options.complete}
          nextLocation={chain ? nextLocationOf(chain, editing.id) : null}
          onLabel={(label) => editor.setLabel(editing.id, label)}
          onStep={(fn) => editor.editStep(editing.id, (s) => fn(s))}
          onNext={(next) => editor.setNext(editing.id, next)}
          onClose={closeEditor}
        />
      )}

      {!linear && (
        <Section id="sec-graph" title="그래프 구성 (읽기 전용)">
          <DataTable caption="노드" columns={graphColumns} rows={doc.nodes} getRowKey={(n) => n.id} wrapCells />
          <DataTable caption="간선" columns={edgeColumns} rows={doc.edges} getRowKey={(e) => e.id} wrapCells />
        </Section>
      )}

      {!live && <PreviewStateLinks states={["loading", "error", "forbidden", "conflict"]} />}
    </>
  );
}
