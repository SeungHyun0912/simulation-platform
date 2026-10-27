import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { classifyError } from "../../shared/api/errors";
import { ApiOnlyNotice } from "../../shared/components/ApiOnlyNotice";
import { Button } from "../../shared/components/Button";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { ConflictNotice } from "../../shared/components/ConflictNotice";
import { CheckboxField, SelectField, TextField } from "../../shared/components/Fields";
import { Block, DirtyIndicator, FilterBar, Note } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { ReasonDialog } from "../../shared/components/ReasonDialog";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import { useMaterialOptions, type MaterialOptions } from "../materials/queries";
import { canApprove, canEdit, projectRoleLabel } from "../projects/projectView";
import { useCurrentProject } from "../projects/useCurrentProject";
import { useProductOptions } from "../scenarios/queries";
import { FlowCanvas } from "./FlowCanvas";
import { FlowTabs } from "./FlowTabs";
import { EdgeEditForm, NodeEditForm } from "./GraphForms";
import { clampZoom, effectivePositions, fitViewport, NODE, startViewport, type Point, type Viewport } from "./flowLayout";
import { connectedEdges, linkedSpecKeys, nextLocationOf, operationsInOrder, parseLinear, stepOf, type NodeKind } from "./processDoc";
import { edgeProblem, validateGraphStructure } from "./processGraph";
import { isOpenProcessStatus, issuesByEntity, NODE_KIND_LABELS, resourcesText, validateStepInput, type ProcessGraphView, type ProcessVersionView } from "./processView";
import { useAssetOptions, useEditorState, useProcessDetail, useProcessVersions, type AssetOptions, type EditorStateView } from "./queries";
import { StepEditPanel } from "./StepEditPanel";
import { useDraftCreator } from "./useDraftCreator";
import { useProcessEditor } from "./useProcessEditor";
import { useProcessWriter } from "./writer";
import styles from "./ProcessFlowPage.module.css";

const ADDABLE: NodeKind[] = ["operation", "buffer", "join", "milestone", "source", "sink"];
const STATUS_TEXT: Record<string, string> = { draft: "초안", in_review: "검토 중", approved: "승인", superseded: "대체됨" };
/** 단계 자동 저장: 마지막 입력 뒤 이만큼 기다렸다가 그 단계만 PATCH한다(입력마다 보내지 않는다). */
export const AUTO_SAVE_MS = 1200;

/**
 * 공정 플로우차트: 제품을 고르면 그 제품의 공정 버전 전체(노드·간선)를 서버에서 받아 한 화면의 순서도로 보여 주고,
 * 노드·간선을 눌러 그 자리에서 수정한다. 내용 수정은 초안에서만(서버가 정본), 노드 배치(좌표)는 편집 권한이 있으면
 * 어떤 상태에서도 저장할 수 있다(`editor-state`, 공정 내용·승인과 무관).
 * 시나리오·실행과 같이 서버 연동 전용이며 정적 예시 모드에서는 안내만 보인다.
 */
export function ProcessFlowPage() {
  const { projectId, label: projectLabel } = useCurrentProject();
  const { productId = "" } = useParams();
  const source = useDataSource();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const products = useProductOptions(projectId);
  const versions = useProcessVersions(projectId, productId);

  const head = (title = "공정 플로우차트") => (
    <>
      <PageHeader
        title={title}
        breadcrumbs={[{ label: "프로젝트", to: "/" }, { label: projectLabel }, { label: "공정", to: `/projects/${projectId}/processes` }, { label: "플로우차트" }]}
        renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
      />
      {source === "api" && <FlowTabs projectId={projectId} productId={productId || undefined} />}
    </>
  );

  // 제품을 고르지 않았으면 공정이 있는 첫 제품으로 이동한다.
  const first = products.status === "success" ? products.data.products.find((p) => p.latestProcessVersion) : undefined;
  useEffect(() => {
    if (!productId && first) navigate(`/projects/${projectId}/products/${first.id}/flow`, { replace: true });
  }, [productId, first, navigate, projectId]);

  if (source === "static") return <>{head()}<ApiOnlyNotice subject="공정 플로우차트" /></>;
  if (products.status === "pending") return <>{head()}<StateNotice kind="loading" /></>;
  if (products.status === "error") return <>{head()}<QueryErrorNotice error={products.error} subject="제품 목록" onRetry={products.retry} /></>;
  const list = products.data.products;
  if (list.length === 0)
    return (
      <>
        {head()}
        <StateNotice kind="empty" title="등록된 제품이 없습니다">
          공정은 제품 아래의 버전으로 만듭니다. 먼저 <Link to={`/projects/${projectId}/products/new`}>제품을 추가</Link>하세요.
        </StateNotice>
      </>
    );
  if (!productId)
    return (
      <>
        {head()}
        <StateNotice kind="empty" title="공정이 있는 제품이 없습니다">
          제품 상세에서 공정 초안을 만든 뒤 이 화면에서 볼 수 있습니다.
        </StateNotice>
      </>
    );

  const product = products.data.byId.get(productId);
  const versionList = versions.status === "success" ? versions.data : [];
  const wanted = params.get("version");
  const version = versionList.find((v) => v.id === wanted) ?? versionList[0] ?? null;

  const pickers = (
    <FilterBar>
      <SelectField label="제품" value={productId} onChange={(e) => navigate(`/projects/${projectId}/products/${e.target.value}/flow`)}>
        {!product && <option value={productId}>제품 ({productId.slice(0, 8)})</option>}
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code} {p.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="공정 버전"
        value={version?.id ?? ""}
        disabled={versionList.length === 0}
        onChange={(e) => setParams(e.target.value === versionList[0]?.id ? {} : { version: e.target.value }, { replace: true })}
      >
        {versionList.length === 0 && <option value="">버전 없음</option>}
        {versionList.map((v) => (
          <option key={v.id} value={v.id}>
            v{v.versionNo} ({STATUS_TEXT[v.status] ?? v.status})
          </option>
        ))}
      </SelectField>
    </FilterBar>
  );

  if (!product)
    return (
      <>
        {head()}
        {pickers}
        <StateNotice kind="empty" title="제품을 찾을 수 없습니다">
          <Link to={`/projects/${projectId}/flow`}>다른 제품 고르기</Link>
        </StateNotice>
      </>
    );
  if (versions.status === "pending") return <>{head(`${product.code} 공정 플로우차트`)}{pickers}<StateNotice kind="loading" /></>;
  if (versions.status === "error") return <>{head(`${product.code} 공정 플로우차트`)}{pickers}<QueryErrorNotice error={versions.error} subject="공정 버전" onRetry={versions.retry} /></>;
  if (!version)
    return (
      <>
        {head(`${product.code} 공정 플로우차트`)}
        {pickers}
        <StateNotice kind="empty" title="공정 버전이 없습니다">
          이 제품에는 공정이 없습니다. <Link to={`/projects/${projectId}/products/${productId}`}>제품 상세</Link>에서 새 초안을 만들 수 있습니다.
        </StateNotice>
      </>
    );

  return (
    <>
      {head(`${product.code} 공정 플로우차트`)}
      {pickers}
      <FlowLoader key={`${projectId}:${version.id}`} projectId={projectId} productId={productId} versionId={version.id} />
    </>
  );
}

function FlowLoader({ projectId, productId, versionId }: { projectId: string; productId: string; versionId: string }) {
  const detail = useProcessDetail(projectId, productId, versionId);
  const options = useAssetOptions(projectId);
  const materials = useMaterialOptions(projectId);
  const es = useEditorState(projectId, versionId);
  for (const r of [detail, options, materials]) {
    if (r.status === "error") {
      const kind = classifyError(r.error);
      return kind === "not-found" || kind === "validation" ? (
        <StateNotice kind="empty" title="공정을 찾을 수 없습니다" />
      ) : (
        <QueryErrorNotice error={r.error} subject="공정" onRetry={r.retry} />
      );
    }
  }
  if (detail.status === "pending" || options.status === "pending" || materials.status === "pending" || es.status === "pending") return <StateNotice kind="loading" />;
  if (detail.status !== "success" || options.status !== "success" || materials.status !== "success") return null;
  // 좌표를 못 불러와도(오류) 공정 자체는 자동 배치로 볼 수 있다. 저장은 막는다.
  const saved: EditorStateView | null = es.status === "success" ? es.data : null;
  return (
    <FlowEditor
      projectId={projectId}
      productId={productId}
      version={detail.data.version}
      graph={detail.data.graph}
      options={options.data}
      materials={materials.data}
      saved={saved}
      savedError={es.status === "error" ? es.error : null}
    />
  );
}

type Selection = { kind: "node"; id: string } | { kind: "edge"; id: string } | null;

function stepStatusText(saving: boolean, state: "clean" | "changed" | "new", auto: boolean, hasError: boolean): string {
  if (saving) return "이 단계를 저장하는 중입니다…";
  if (state === "new") return "새로 추가한 단계는 위의 '저장'으로 공정과 함께 저장합니다.";
  if (state === "changed") {
    if (!auto) return "이 단계에 저장하지 않은 변경이 있습니다.";
    return hasError ? "입력 오류를 고치면 이 단계만 자동으로 저장합니다." : "입력을 멈추면 잠시 뒤 이 단계만 자동으로 저장합니다.";
  }
  return auto ? "자동 저장: 이 단계를 고치면 이 단계만 서버에 저장합니다." : "";
}

function FlowEditor({
  projectId,
  productId,
  version,
  graph,
  options,
  materials,
  saved,
  savedError,
}: {
  projectId: string;
  productId: string;
  version: ProcessVersionView;
  graph: ProcessGraphView;
  options: AssetOptions;
  materials: MaterialOptions;
  saved: EditorStateView | null;
  savedError: unknown;
}) {
  const { project } = useCurrentProject();
  const role = project?.role;
  const navigate = useNavigate();
  const writer = useProcessWriter(projectId);
  const versions = useProcessVersions(projectId, productId);
  const drafts = useDraftCreator(projectId, productId, (id) => navigate(`/projects/${projectId}/products/${productId}/flow?version=${id}`));
  const openOther = versions.status === "success" ? (versions.data.find((v) => isOpenProcessStatus(v.status) && v.id !== version.id) ?? null) : null;
  const editor = useProcessEditor({ projectId, productId, version, graph, previewConflict: false });
  const mayEdit = canEdit(role);
  const editable = version.status === "draft" && mayEdit;
  // 좌표는 공정 내용이 아니므로 상태와 무관하게 편집 권한만 있으면 저장할 수 있다(서버가 최종 판정). 좌표를 못 불러왔으면 저장하지 않는다.
  const canArrange = mayEdit && saved !== null;
  const doc = editor.draft.doc;

  const [selection, setSelection] = useState<Selection>(null);
  const [mode, setMode] = useState<"select" | "connect">("select");
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectNote, setConnectNote] = useState<string | null>(null);
  const [moved, setMoved] = useState<ReadonlyMap<string, Point>>(new Map());
  // 저장된 화면 위치가 없으면 처음에는 읽을 수 있는 배율로 보여 준다(화면 크기는 창 너비로 추정, 전체 조망은 "화면에 맞춤").
  const [viewport, setViewport] = useState<Viewport>(
    () => saved?.viewport ?? startViewport(effectivePositions(editor.draft.doc, saved?.positions ?? {}, new Map()), { w: Math.max(480, Math.round(window.innerWidth * 0.6)), h: 560 }),
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newKind, setNewKind] = useState<NodeKind>("operation");
  const [newLabel, setNewLabel] = useState("");
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [layoutConflict, setLayoutConflict] = useState(false);
  const [layoutError, setLayoutError] = useState<unknown>(null);
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [autoStopped, setAutoStopped] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const positions = useMemo(() => effectivePositions(doc, saved?.positions ?? {}, moved), [doc, saved, moved]);
  const layoutDirty = moved.size > 0;
  const guard = useUnsavedChangesGuard(editor.dirty || layoutDirty);
  const busy = editor.busy !== null || layoutBusy;

  const size = useCallback(() => ({ w: wrapRef.current?.clientWidth || 900, h: wrapRef.current?.clientHeight || 560 }), []);

  const rows = operationsInOrder(doc);
  const chain = parseLinear(doc);
  const inputIssues = [...rows.flatMap((n, i) => validateStepInput(n, i + 1)), ...validateGraphStructure(doc)];
  const allIssues: ValidationIssue[] = [...inputIssues, ...editor.rejected, ...graph.issues];
  const byEntity = issuesByEntity(allIssues);
  const errorIds = new Set([...byEntity].filter(([, l]) => l.some((i) => i.severity === "error")).map(([id]) => id));
  const assetCode = (id: string) => options.byId.get(id)?.code ?? id.slice(0, 8);
  const clientErrorCount = inputIssues.length;

  const node = selection?.kind === "node" ? (doc.nodes.find((n) => n.id === selection.id) ?? null) : null;
  const edge = selection?.kind === "edge" ? (doc.edges.find((e) => e.id === selection.id) ?? null) : null;

  // 단계 자동 저장: 고른 단계의 이름·내용이 바뀌면 잠시 뒤 그 단계만 PATCH한다. 입력 오류가 있으면 보내지 않는다.
  // 실패하면(충돌·거부·오류) 자동 저장을 멈추고 알린다. 다른 노드를 고르면 남은 변경을 바로 저장한다.
  const stepNodeId = node?.kind === "operation" ? node.id : null;
  const stepJson = node?.kind === "operation" ? JSON.stringify([node.label, node.step]) : "";
  const stepHasError = stepNodeId ? (byEntity.get(stepNodeId) ?? []).some((i) => i.severity === "error") : false;
  const autoActive = autoSave && editable;
  const { saveStep, stepState } = editor;
  const runAutoSave = useCallback(
    (id: string) => {
      void saveStep(id).then((ok) => {
        if (ok === false) {
          setAutoSave(false);
          setAutoStopped(true);
        }
      });
    },
    [saveStep],
  );
  useEffect(() => {
    if (!autoActive || !stepNodeId || stepHasError || editor.busy !== null || stepState(stepNodeId) !== "changed") return;
    const t = setTimeout(() => runAutoSave(stepNodeId), AUTO_SAVE_MS);
    return () => clearTimeout(t);
    // stepJson: 같은 단계를 계속 고치면 타이머를 다시 건다
  }, [autoActive, stepNodeId, stepJson, stepHasError, editor.busy, stepState, runAutoSave]);
  // 다른 노드를 고르면 이전 단계의 남은 변경을 저장 대기열에 넣고, 진행 중인 저장이 끝나면 하나씩 보낸다(요청을 겹치지 않는다).
  const prevStep = useRef<string | null>(null);
  const queue = useRef<string[]>([]);
  const busyNow = editor.busy;
  useEffect(() => {
    const prev = prevStep.current;
    prevStep.current = stepNodeId;
    if (prev && prev !== stepNodeId && autoActive && stepState(prev) === "changed" && !queue.current.includes(prev)) queue.current.push(prev);
    if (busyNow !== null || !autoActive) return;
    // 진행 중인 저장이 없을 때 대기열의 다음 단계를 보낸다(한 번에 하나)
    while (queue.current.length > 0) {
      const next = queue.current.shift()!;
      if (stepState(next) === "changed") {
        runAutoSave(next);
        break;
      }
    }
  }, [stepNodeId, autoActive, busyNow, stepState, runAutoSave]);

  const summaryOf = (n: (typeof doc.nodes)[number]) => {
    if (n.kind === "operation") return resourcesText(stepOf(n), assetCode);
    if (n.kind === "buffer") return n.asset_id ? assetCode(n.asset_id) : "위치 미정";
    return "";
  };

  function move(id: string, p: Point) {
    setLayoutNotice(null);
    setMoved((cur) => new Map(cur).set(id, p));
  }

  function select(id: string) {
    if (mode === "connect") {
      if (!connectFrom) {
        setConnectFrom(id);
        setConnectNote("끝 노드를 누르세요. 같은 노드를 다시 누르면 취소합니다.");
      } else if (connectFrom === id) {
        setConnectFrom(null);
        setConnectNote(null);
      } else {
        const problem = edgeProblem(doc, connectFrom, id, "material");
        if (problem) setConnectNote(problem);
        else {
          const eid = editor.addGraphEdge(connectFrom, id, "material");
          setConnectFrom(null);
          setConnectNote(null);
          setMode("select");
          setSelection({ kind: "edge", id: eid });
        }
      }
      return;
    }
    setSelection({ kind: "node", id });
  }

  function addNode() {
    const label = newLabel.trim();
    if (label === "" || !editable) return;
    const id = editor.addGraphNode(newKind, label);
    const s = size();
    // 지금 보이는 화면의 가운데에 놓는다(겹치면 끌어서 옮긴다)
    move(id, { x: Math.round((s.w / 2 - viewport.x) / viewport.zoom - NODE.w / 2), y: Math.round((s.h / 2 - viewport.y) / viewport.zoom - NODE.h / 2) });
    setNewLabel("");
    setSelection({ kind: "node", id });
  }

  function removeSelected() {
    if (selection?.kind === "node") editor.removeGraphNode(selection.id);
    else if (selection?.kind === "edge") editor.removeGraphEdge(selection.id);
    setSelection(null);
    setDeleteOpen(false);
  }

  const zoomBy = (f: number) => {
    const s = size();
    const zoom = clampZoom(viewport.zoom * f);
    const k = zoom / viewport.zoom;
    setViewport({ zoom, x: s.w / 2 - (s.w / 2 - viewport.x) * k, y: s.h / 2 - (s.h / 2 - viewport.y) * k });
  };

  function autoArrange() {
    // 기본 배치를 모든 노드의 좌표로 지정한다(저장하기 전에는 서버 값이 바뀌지 않는다)
    const auto = effectivePositions(doc, {}, new Map());
    setMoved(new Map(auto));
    setViewport(fitViewport(auto, size()));
  }

  async function saveLayout(overwrite = false) {
    if (!saved || layoutBusy) return;
    setLayoutBusy(true);
    setLayoutError(null);
    setLayoutConflict(false);
    try {
      const rowVersion = overwrite ? (await writer.fetchEditorState(version.id)).rowVersion : saved.rowVersion;
      await writer.saveEditorState(version.id, { positions: Object.fromEntries(positions), viewport }, rowVersion);
      setMoved(new Map());
      setLayoutNotice("배치를 저장했습니다.");
    } catch (e) {
      if (classifyError(e) === "conflict") setLayoutConflict(true);
      else setLayoutError(e);
    } finally {
      setLayoutBusy(false);
    }
  }

  async function reloadLayout() {
    setLayoutConflict(false);
    try {
      await writer.fetchEditorState(version.id);
      setMoved(new Map());
    } catch (e) {
      setLayoutError(e);
    }
  }

  async function saveAll() {
    if (busy) return;
    setLayoutNotice(null);
    // 좌표 키는 서버에 저장된 노드 id여야 하므로 공정 내용을 먼저 저장한다.
    if (editor.dirty && !(await editor.save())) return;
    if (layoutDirty && canArrange) await saveLayout();
  }

  const dirty = editor.dirty || layoutDirty;
  const canSave = dirty && !busy && clientErrorCount === 0 && (editor.dirty ? editable : canArrange);
  const addProblem = newLabel.trim() === "" ? "이름을 입력하세요" : undefined;
  const deleting = selection?.kind === "node" ? node : null;
  const deletingEdges = deleting ? connectedEdges(doc, deleting.id) : [];

  return (
    <>
      {guard}
      <ConfirmDialog open={deleteOpen} title={selection?.kind === "node" ? "노드를 삭제할까요?" : "간선을 삭제할까요?"} confirmLabel="삭제" onCancel={() => setDeleteOpen(false)} onConfirm={removeSelected}>
        {selection?.kind === "node" ? (
          <>
            <p>"{node?.label || node?.node_key}" 노드를 이 화면의 편집 내용에서 삭제합니다. 저장하기 전에는 서버 데이터가 바뀌지 않습니다.</p>
            {deletingEdges.length > 0 ? <p>연결된 간선 {deletingEdges.length}개도 함께 지워지며 앞뒤 노드를 자동으로 잇지 않습니다.</p> : <p>연결된 간선이 없습니다.</p>}
          </>
        ) : (
          <p>이 연결을 이 화면의 편집 내용에서 삭제합니다. 저장하기 전에는 서버 데이터가 바뀌지 않습니다.</p>
        )}
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
      <p>
        버전 상태: <VersionStatusBadge status={version.status} /> · 내 역할: {role ? projectRoleLabel(role) : "알 수 없음"} ·{" "}
        <Link to={`/projects/${projectId}/products/${productId}/processes/${version.id}`}>표·상세 편집 화면으로</Link>
      </p>
      {version.rejectionReason && version.status === "draft" && <Note>반려 사유: {version.rejectionReason}</Note>}
      <div className={styles.toolbar} role="group" aria-label="버전 상태 전환">
        {mayEdit && version.status === "draft" && (
          <Button disabled={editor.dirty || busy} onClick={() => void editor.transition("submit")} title={editor.dirty ? "먼저 저장해야 검토를 요청할 수 있습니다" : undefined}>
            {editor.busy === "transition" ? "처리 중…" : "검토 요청"}
          </Button>
        )}
        {canApprove(role) && version.status === "in_review" && (
          <>
            <Button disabled={busy} onClick={() => void editor.transition("approve")}>
              {editor.busy === "transition" ? "처리 중…" : "승인"}
            </Button>
            <Button disabled={busy} onClick={() => setRejectOpen(true)}>
              반려
            </Button>
          </>
        )}
        {mayEdit && (version.status === "approved" || version.status === "superseded") && (
          <Button
            disabled={!!openOther || drafts.busy || versions.status !== "success"}
            onClick={() => void drafts.create(version.id)}
            title={openOther ? "이미 열린 버전이 있습니다(제품당 하나)" : undefined}
          >
            {drafts.busy ? "만드는 중…" : "이 버전으로 새 초안 만들기"}
          </Button>
        )}
        {openOther && (version.status === "approved" || version.status === "superseded") && (
          <Link to={`/projects/${projectId}/products/${productId}/flow?version=${openOther.id}`}>열린 버전(v{openOther.versionNo}) 열기</Link>
        )}
      </div>
      {drafts.error != null && <SaveErrorNotice error={drafts.error} />}
      {drafts.notice && <p role="status">{drafts.notice}</p>}
      {!editable && (
        <Block>
          <Note>
            {version.status === "draft"
              ? "이 역할은 공정 내용을 수정할 수 없습니다(관리자·편집자만). "
              : version.status === "in_review"
                ? "검토 중인 버전은 내용을 수정할 수 없습니다. "
                : "승인된 버전의 내용은 수정할 수 없습니다(변경하려면 새 초안을 만드세요). "}
            {canArrange ? "노드 배치는 옮겨 저장할 수 있습니다." : ""}
          </Note>
        </Block>
      )}
      {editor.conflict && (
        <Block>
          <ConflictNotice resource="공정 버전" onReload={() => void editor.reloadFromServer()} onKeepEditing={() => void editor.keepMineAndMerge()} />
          {editor.mergeBlocked && <Note>구조 변경이 겹쳐 자동으로 합칠 수 없습니다. 최신 내용으로 다시 불러온 뒤 다시 편집하세요.</Note>}
        </Block>
      )}
      {layoutConflict && (
        <Block>
          <StateNotice
            kind="conflict"
            title="다른 사용자가 배치를 먼저 저장했습니다"
            action={
              <>
                <Button onClick={() => void reloadLayout()}>서버 배치로 다시 불러오기</Button>
                <Button onClick={() => void saveLayout(true)}>내 배치로 덮어쓰기</Button>
              </>
            }
          >
            노드 배치는 공정 내용이 아니라 화면 좌표입니다. 다시 불러오면 이 화면에서 옮긴 위치가 사라지고, 덮어쓰면 상대의 배치가 내 배치로 바뀝니다.
          </StateNotice>
        </Block>
      )}
      <SaveErrorNotice error={editor.error ?? layoutError} />
      {savedError != null && <Note>저장된 노드 배치를 불러오지 못해 자동 배치로 보여 줍니다(배치 저장은 할 수 없습니다).</Note>}
      {(editor.notice || layoutNotice) && <p role="status">{[editor.notice, layoutNotice].filter(Boolean).join(" ")}</p>}
      {dirty && <DirtyIndicator />}

      <div className={styles.toolbar} role="toolbar" aria-label="플로우차트 도구">
        <div className={styles.group}>
          <Button variant={mode === "select" ? "primary" : undefined} aria-pressed={mode === "select"} onClick={() => { setMode("select"); setConnectFrom(null); setConnectNote(null); }}>
            선택·이동
          </Button>
          <Button variant={mode === "connect" ? "primary" : undefined} aria-pressed={mode === "connect"} disabled={!editable} title={editable ? "시작 노드와 끝 노드를 차례로 눌러 물류 간선을 만듭니다" : "초안에서만 연결을 바꿀 수 있습니다"} onClick={() => { setMode("connect"); setSelection(null); }}>
            간선 연결
          </Button>
        </div>
        {editable && (
          <div className={styles.group}>
            <SelectField label="새 노드 종류" value={newKind} onChange={(e) => setNewKind(e.target.value as NodeKind)}>
              {ADDABLE.map((k) => (
                <option key={k} value={k}>
                  {NODE_KIND_LABELS[k]}
                </option>
              ))}
            </SelectField>
            <TextField
              label="새 노드 이름"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addNode();
                }
              }}
            />
            <Button disabled={!!addProblem} title={addProblem} onClick={addNode}>
              노드 추가
            </Button>
          </div>
        )}
        <div className={styles.group}>
          <Button disabled={!editable || !selection} onClick={() => setDeleteOpen(true)} title={editable ? undefined : "초안에서만 삭제할 수 있습니다"}>
            선택 삭제
          </Button>
        </div>
        <div className={styles.group}>
          <Button onClick={() => zoomBy(1 / 1.2)} aria-label="축소">
            −
          </Button>
          <Button onClick={() => zoomBy(1.2)} aria-label="확대">
            ＋
          </Button>
          <Button onClick={() => setViewport(fitViewport(positions, size()))}>화면에 맞춤</Button>
          <Button disabled={!canArrange} onClick={autoArrange} title={canArrange ? "자동 배치로 다시 놓습니다(저장하기 전에는 서버 값이 바뀌지 않습니다)" : undefined}>
            자동 배치
          </Button>
        </div>
        {editable && (
          <div className={styles.group}>
            <CheckboxField
              label="단계 변경 자동 저장"
              checked={autoSave}
              onChange={(e) => {
                setAutoSave(e.target.checked);
                setAutoStopped(false);
              }}
            />
          </div>
        )}
        <div className={styles.group}>
          <Button
            disabled={!dirty || busy}
            onClick={() => {
              editor.reset();
              setMoved(new Map());
              setSelection(null);
            }}
          >
            되돌리기
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={() => void saveAll()} title={clientErrorCount > 0 ? "오류를 해결해야 저장할 수 있습니다" : undefined}>
            {busy ? "저장 중…" : "저장"}
          </Button>
        </div>
      </div>
      {mode === "connect" && connectNote && <p role="status">{connectNote}</p>}
      {mode === "connect" && !connectNote && <p role="status">간선 연결: 시작 노드를 누르세요.</p>}

      {allIssues.length > 0 && (
        <Block>
          <ValidationPanel issues={allIssues} />
        </Block>
      )}

      <div className={styles.workspace}>
        <div className={styles.canvasWrap} ref={wrapRef}>
          <FlowCanvas
            doc={doc}
            positions={positions}
            viewport={viewport}
            onViewportChange={setViewport}
            selectedNodeId={selection?.kind === "node" ? selection.id : null}
            selectedEdgeId={selection?.kind === "edge" ? selection.id : null}
            completionId={doc.completion_node_id ?? null}
            errorIds={errorIds}
            connectFromId={connectFrom}
            canArrange={canArrange && mode === "select"}
            onSelectNode={select}
            onSelectEdge={(id) => mode === "select" && setSelection({ kind: "edge", id })}
            onSelectNone={() => setSelection(null)}
            onMoveNode={move}
            summaryOf={summaryOf}
          />
        </div>
        <aside className={styles.panel} aria-label="선택한 항목 수정">
          {node && node.kind === "operation" && editable && (
            <div className={styles.hint} role="status" aria-label="단계 저장 상태">
              {stepStatusText(editor.busy === "step", stepState(node.id), autoActive, stepHasError)}
              {!autoActive && stepState(node.id) === "changed" && (
                <>
                  {" "}
                  <Button disabled={busy || stepHasError} onClick={() => void editor.saveStep(node.id)}>
                    이 단계만 저장
                  </Button>
                </>
              )}
            </div>
          )}
          {autoStopped && <Note>단계 자동 저장을 멈췄습니다(저장 실패). 위의 안내를 확인한 뒤 다시 켜거나 직접 저장하세요.</Note>}
          {node && node.kind === "operation" && (
            <StepEditPanel
              node={node}
              readOnly={!editable}
              issues={(byEntity.get(node.id) ?? []).filter((i) => i.severity === "error" || i.entity_id === node.id)}
              equipmentOptions={options.equipment}
              spaceOptions={options.spaces}
              assetById={options.byId}
              optionsComplete={options.complete}
              materials={materials}
              linkedSpecKeys={linkedSpecKeys(doc, node.id)}
              nextLocation={chain ? nextLocationOf(chain, node.id) : null}
              onLabel={(label) => editor.setLabel(node.id, label)}
              onStep={(fn) => editor.editStep(node.id, (s) => fn(s))}
              onNext={(next) => editor.setNext(node.id, next)}
              onClose={() => setSelection(null)}
            />
          )}
          {node && node.kind !== "operation" && (
            <NodeEditForm
              node={node}
              editable={editable}
              options={options}
              api={{ patchNode: editor.patchGraphNode }}
              onClose={() => setSelection(null)}
            />
          )}
          {edge && (
            <EdgeEditForm edge={edge} doc={doc} editable={editable} materials={materials} api={{ patchEdge: editor.patchGraphEdge }} onClose={() => setSelection(null)} />
          )}
          {!node && !edge && (
            <div className={styles.hint}>
              <p>노드나 간선을 누르면 여기에서 수정합니다.</p>
              <ul>
                <li>공정 단계(작업)를 누르면 처리 방식·설비·투입·산출 재료 등 단계 내용을 수정합니다.</li>
                <li>{canArrange ? "노드를 끌거나 화살표 키로 옮겨 배치를 바꾸고, 저장하면 배치도 함께 저장됩니다." : "배치를 저장할 권한이 없습니다(관리자·편집자만)."}</li>
                <li>Ctrl+휠로 확대·축소, 빈 곳을 끌어 화면을 이동합니다.</li>
              </ul>
            </div>
          )}
        </aside>
      </div>

      <ul className={styles.legend} aria-label="범례">
        <li>둥근 모서리 사각형: 공정 단계 · 알약 모양: 시작·합류·완료 기준·끝 · 점선 테두리: 대기 공간</li>
        <li>실선: 물류 · 점선(긴): 선후 관계 · 점선(짧은): 공급 · ● 완제품: 완제품 판정 노드 · 굵은 붉은 테두리: 오류</li>
      </ul>
    </>
  );
}
