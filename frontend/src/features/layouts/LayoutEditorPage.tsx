import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiError, classifyError, toIssues } from "../../shared/api/errors";
import type { Schemas } from "../../shared/api/types";
import { ApiOnlyNotice } from "../../shared/components/ApiOnlyNotice";
import { Button } from "../../shared/components/Button";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { ConflictNotice } from "../../shared/components/ConflictNotice";
import { TextAreaField, TextField } from "../../shared/components/Fields";
import { DirtyIndicator, FieldGrid, FilterBar, Note, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import { clampZoom, type Viewport } from "../processes/flowLayout";
import { canApprove, canEdit } from "../projects/projectView";
import { useCurrentProject } from "../projects/useCurrentProject";
import { LayoutCanvas, PX_PER_M, type CanvasMode } from "./LayoutCanvas";
import { LayoutTables, RouteDraftPanel, SelectionPanel, type RouteDraft } from "./LayoutPanels";
import {
  addPlacement,
  addPoint,
  backgroundOf,
  insertRoutePoint,
  mapPort,
  nearestPoint,
  pointOfPort,
  removePoint,
  upsertRoute,
  extentOf,
  fromVersion,
  patchPlacement,
  patchPoint,
  sameContent,
  nextRouteKey,
  saveIssueTarget,
  toContentIn,
  validateDoc,
  validationIssueTarget,
  type LayoutDoc,
  type Target,
} from "./layoutDoc";
import { headerOf, headerPatch, portText, validateHeader, type HeaderDraft } from "./layoutView";
import { useLayoutAssets, useLayoutVersion, type LayoutAssets } from "./queries";
import { useLayoutWriter } from "./writer";

/** 배치판 버전 화면(계약 0.17.0): 초안은 도면·표로 편집해 통째로 저장(PUT /content)하고 검증·승인한다. 승인본은 읽기 전용이다. */
export function LayoutEditorPage() {
  const { versionId = "" } = useParams();
  const { projectId, label, project } = useCurrentProject();
  const source = useDataSource();
  const version = useLayoutVersion(projectId, versionId);
  const assets = useLayoutAssets(projectId);
  const v = version.status === "success" ? version.data : null;

  const head = (
    <PageHeader
      title={v ? `배치판 v${v.version_no}${v.name ? ` ${v.name}` : ""}` : "배치판"}
      breadcrumbs={[{ label: "프로젝트", to: "/" }, { label }, { label: "배치판", to: `/projects/${projectId}/layouts` }, { label: v ? `v${v.version_no}` : "버전" }]}
      renderLink={(c) => <Link to={c.to!}>{c.label}</Link>}
      actions={v ? <VersionStatusBadge status={v.status} /> : undefined}
    />
  );
  if (source === "static") return <>{head}<ApiOnlyNotice subject="배치판" /></>;
  if (version.status === "pending" || assets.status === "pending") return <>{head}<StateNotice kind="loading" /></>;
  if (version.status === "error") return <>{head}<QueryErrorNotice error={version.error} subject="배치판" onRetry={version.retry} /></>;
  if (assets.status === "error") return <>{head}<QueryErrorNotice error={assets.error} subject="설비·공간 목록" onRetry={assets.retry} /></>;
  return (
    <>
      {head}
      <LayoutEditor key={version.data.id} projectId={projectId} initial={version.data} assets={assets.data} role={project?.role} />
    </>
  );
}

/** 경로 그리기 패널·상태 줄의 버튼은 Enter가 그 버튼을 누른다(끝내기 단축키를 가로채지 않음) */
const DRAW_CONTROLS = `[aria-label="경로 그리기"], [aria-label="경로 그리기 상태"]`;

function fitViewport(extent: { w: number; h: number }): Viewport {
  const zoom = clampZoom(Math.min(860 / (extent.w * PX_PER_M), 500 / (extent.h * PX_PER_M)));
  return { zoom, x: 24, y: 28 };
}

function LayoutEditor({ projectId, initial, assets, role }: { projectId: string; initial: Schemas["LayoutVersionOut"]; assets: LayoutAssets; role: string | undefined }) {
  const writer = useLayoutWriter(projectId);
  const navigate = useNavigate();
  const [server, setServer] = useState(initial);
  const [doc, setDoc] = useState<LayoutDoc>(() => fromVersion(initial));
  // 되돌리기·다시 하기(참고 라벨러와 같은 Ctrl+Z / Ctrl+Y). 끌기는 시작할 때 한 번만 기록한다.
  const [past, setPast] = useState<LayoutDoc[]>([]);
  const [future, setFuture] = useState<LayoutDoc[]>([]);
  const [header, setHeader] = useState<HeaderDraft>(() => headerOf(initial));
  const [selected, setSelected] = useState<Target | null>(null);
  const [mode, setMode] = useState<CanvasMode>("select");
  const [routeDraft, setRouteDraft] = useState<RouteDraft | null>(null);
  const [busy, setBusy] = useState<null | "saving" | "header" | "validating" | "approving" | "copying">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [conflict, setConflict] = useState(false);
  const [issues, setIssues] = useState<{ list: ValidationIssue[]; targets: Target[]; from: "save" | "validate" } | null>(null);
  const [validation, setValidation] = useState<Schemas["LayoutValidationOut"] | null>(null);
  const [approveOpen, setApproveOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const draft = server.status === "draft";
  const editable = draft && canEdit(role);
  const savedDoc = useMemo(() => fromVersion(server), [server]);
  const contentDirty = !sameContent(doc, savedDoc);
  const headerDirty = Object.keys(headerPatch(server, header)).length > 0;
  const guard = useUnsavedChangesGuard(contentDirty || headerDirty);
  const docErrors = useMemo(() => validateDoc(doc), [doc]);
  const headerErrors = validateHeader(header);
  const { bg, reason: bgReason } = backgroundOf(server.attributes, server.canvas_width_m);
  const extent = extentOf(doc, server.canvas_width_m, server.canvas_height_m, bg);
  const [viewport, setViewport] = useState<Viewport>(() => fitViewport(extent));
  const onViewport = useCallback((next: Viewport) => setViewport(next), []);
  // 키보드(입력 칸 밖에서만): 경로 그리기 Enter 끝내기·Backspace 마지막 점 빼기·Esc 취소, Ctrl+Z / Ctrl+Y 되돌리기·다시 하기
  const keyRef = { routeFinish, routeRemoveLast, routeCancel, undo, redo, drawing: !!routeDraft, editable };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const k = keyRef;
      // 경로 그리기 중에는 출발·도착 포트 같은 선택 상자를 고른 직후에도 Enter·Esc가 먹게 한다(사용자 보고: 끝내기가 안 됨).
      // 글자 입력 칸·버튼(Enter = 그 버튼 누르기)은 제외한다.
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
      const selectInDraw = t?.tagName === "SELECT" && k.drawing && (e.key === "Enter" || e.key === "Escape");
      if (typing || (t?.tagName === "SELECT" && !selectInDraw) || (t?.tagName === "BUTTON" && e.key === "Enter" && !!t.closest(DRAW_CONTROLS))) return;
      if (!k.editable) return;
      if (k.drawing) {
        if (e.key === "Enter") k.routeFinish();
        else if (e.key === "Backspace") k.routeRemoveLast();
        else if (e.key === "Escape") k.routeCancel();
        else return;
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) k.undo();
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) k.redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // 매 렌더 최신 상태로 다시 건다(가벼운 창 이벤트 하나)

  const errorTargets = useMemo(() => {
    const s = new Set<string>(issues?.targets ?? []);
    if (showErrors) for (const k of Object.keys(docErrors)) s.add(k.split(".")[0]!);
    return s;
  }, [issues, docErrors, showErrors]);

  /** 서버 응답(반올림된 값)으로 다시 그린다. 내용 저장 뒤에만 doc을 바꾸고, 머리 저장은 편집 중인 doc을 건드리지 않는다. */
  const applyServer = (v: Schemas["LayoutVersionOut"], content: boolean) => {
    setServer(v);
    if (content) setDoc(fromVersion(v));
    setHeader((h) => (content ? h : headerOf(v)));
  };
  const change = (next: LayoutDoc) => {
    setPast((p) => [...p.slice(-99), doc]);
    setFuture([]);
    setDoc(next);
    setNotice(null);
    setValidation(null);
  };
  /** 끌기 중 이동: 기록 없이 바꾼다(시작할 때 onEditStart가 한 번 기록) */
  const moveSilently = (next: LayoutDoc) => {
    setDoc(next);
    setValidation(null);
  };
  function undo() {
    const prev = past[past.length - 1];
    if (!prev || routeDraft) return;
    setPast(past.slice(0, -1));
    setFuture([doc, ...future]);
    setDoc(prev);
  }
  function redo() {
    const next = future[0];
    if (!next || routeDraft) return;
    setFuture(future.slice(1));
    setPast([...past, doc]);
    setDoc(next);
  }

  /* ---- 경로 그리기: 점은 클릭한 자리에 자동으로 만들고, 가까운 기존 점·설비의 포트 점을 쓴다 ---- */
  const snapTol = 12 / (PX_PER_M * viewport.zoom); // 화면 12px 안의 기존 점은 그 점을 쓴다
  const portFor = (assetId: string, start: boolean) => {
    const ports = assets.byId.get(assetId)?.ports ?? [];
    const order = start ? ["OUT", "ACCESS"] : ["IN", "ACCESS"];
    for (const role of order) {
      const hit = ports.find((pt) => pt.role === role);
      if (hit) return hit;
    }
    return ports[0] ?? null;
  };
  function routeClick(x: number, y: number, placementId: string | null) {
    const d = routeDraft;
    if (!d) return;
    let next = doc;
    let key: string | null = null;
    const created = [...d.created];
    let { fromPortId, toPortId } = d;
    if (placementId) {
      const start = d.points.length === 0;
      const port = portFor(placementId, start);
      if (port) {
        key = pointOfPort(next, port.id) || null;
        if (!key) {
          const r = addPoint(next, x, y);
          next = mapPort(r.doc, port.id, r.key);
          key = r.key;
          created.push(r.key);
        }
        if (start) fromPortId = fromPortId || port.id;
        else toPortId = port.id;
      }
    }
    key ??= nearestPoint(next, x, y, snapTol);
    if (!key) {
      const r = addPoint(next, x, y);
      next = r.doc;
      key = r.key;
      created.push(r.key);
    }
    if (d.points[d.points.length - 1] === key) return;
    if (next !== doc) moveSilently(next);
    setRouteDraft({ ...d, points: [...d.points, key], fromPortId, toPortId, created, message: null });
  }
  function routeAppend(key: string) {
    const d = routeDraft;
    if (!d || d.points[d.points.length - 1] === key) return;
    setRouteDraft({ ...d, points: [...d.points, key], message: null });
  }
  /** 마지막 점 빼기: 이 그리기에서 자동으로 만든 점이면 점(과 그때 만든 포트 연결)도 지운다 */
  function routeRemoveLast() {
    const d = routeDraft;
    if (!d || d.points.length === 0) return;
    const last = d.points[d.points.length - 1]!;
    const points = d.points.slice(0, -1);
    if (d.created.includes(last) && !points.includes(last)) moveSilently(removePoint(doc, last));
    setRouteDraft({ ...d, points, created: d.created.filter((k) => k !== last || points.includes(last)), message: null });
  }
  function routeCancel() {
    if (routeDraft?.base) setDoc(routeDraft.base);
    setRouteDraft(null);
    setMode("select");
  }
  /** 끝내기: 출발·도착 포트를 고르지 않았으면 첫·끝 점에 연결된 포트로 채운다. 그래도 없으면 안내하고 계속 그린다. */
  function routeFinish() {
    const d = routeDraft;
    if (!d) return;
    const pick = (pointKey: string | undefined, roles: string[]) => {
      const here = doc.portPoints.filter((m) => m.pointKey === pointKey).map((m) => assets.portById.get(m.portId)).filter((x): x is NonNullable<typeof x> => !!x);
      for (const role of roles) {
        const hit = here.find((h) => h.port.role === role);
        if (hit) return hit.port.id;
      }
      return here[0]?.port.id ?? "";
    };
    const fromPortId = d.fromPortId || pick(d.points[0], ["OUT", "ACCESS"]);
    const toPortId = d.toPortId || pick(d.points[d.points.length - 1], ["IN", "ACCESS"]);
    const key = d.key.trim() || (d.editingKey ?? nextRouteKey(doc));
    const msg =
      d.points.length < 2
        ? "점을 2개 이상 찍어야 경로가 됩니다."
        : !fromPortId || !toPortId
          ? "출발·도착 포트를 고르세요(설비·공간을 누르면 자동으로 정해집니다)."
          : key !== d.editingKey && doc.routes.some((r) => r.key === key)
            ? "같은 이름의 경로가 있습니다."
            : null;
    if (msg) return setRouteDraft({ ...d, fromPortId, toPortId, message: msg });
    const old = d.editingKey ? doc.routes.find((r) => r.key === d.editingKey) : undefined;
    const next = upsertRoute(doc, { key, fromPortId, toPortId, mode: d.mode, points: d.points, attributes: old?.attributes ?? {} }, d.editingKey ?? undefined);
    setPast((p) => [...p.slice(-99), d.base ?? doc]); // 경로 하나를 되돌리기 한 번으로
    setFuture([]);
    setDoc(next);
    setValidation(null);
    setSelected(`route:${key}`);
    setRouteDraft(null);
    setMode("select");
  }
  function insertOnRoute(routeKey: string, index: number, x: number, y: number) {
    let next = doc;
    let key = nearestPoint(next, x, y, snapTol);
    if (!key) {
      const r = addPoint(next, x, y);
      next = r.doc;
      key = r.key;
    }
    change(insertRoutePoint(next, routeKey, index, key));
    setSelected(`point:${key}`);
  }

  async function save() {
    setShowErrors(true);
    if (Object.keys(docErrors).length) return;
    const body = toContentIn(doc);
    setBusy("saving");
    setError(null);
    setIssues(null);
    try {
      const v = await writer.putContent(server.id, body, server.row_version);
      applyServer(v, true);
      setShowErrors(false);
      setNotice("배치판 내용을 저장했습니다. 좌표·크기는 서버가 소수 첫째 자리로 맞춘 값입니다.");
    } catch (e) {
      const kind = classifyError(e);
      if (kind === "conflict") setConflict(true);
      else if (kind === "validation" && e instanceof ApiError) {
        const list = toIssues(e);
        setIssues({ list, targets: list.map((i) => saveIssueTarget(i.field_path, body)).filter((t): t is Target => !!t), from: "save" });
      } else setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function saveHeader() {
    if (Object.keys(headerErrors).length) return;
    setBusy("header");
    setError(null);
    try {
      const v = await writer.patchHeader(server.id, headerPatch(server, header), server.row_version);
      applyServer(v, false);
      setNotice("배치판 정보를 저장했습니다.");
    } catch (e) {
      if (classifyError(e) === "conflict") setConflict(true);
      else setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function validate() {
    setBusy("validating");
    setError(null);
    try {
      const r = await writer.validate(server.id);
      setValidation(r);
      const list: ValidationIssue[] = r.issues.map((i) => ({ severity: i.severity === "warning" ? "warning" : "error", rule_id: i.rule_id, message: i.message, field_path: i.field_path }));
      setIssues({ list, targets: r.issues.map((i) => validationIssueTarget(i.field_path)).filter((t): t is Target => !!t), from: "validate" });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    setApproveOpen(false);
    setBusy("approving");
    setError(null);
    try {
      const v = await writer.approve(server.id, server.row_version);
      applyServer(v, true);
      setMode("select");
      setIssues(null);
      setNotice("배치판을 승인했습니다. 승인본은 바꿀 수 없으며 고치려면 새 초안을 만듭니다.");
    } catch (e) {
      const kind = classifyError(e);
      if (kind === "conflict") setConflict(true);
      else if (kind === "validation" && e instanceof ApiError) {
        const list = toIssues(e);
        setIssues({ list, targets: list.map((i) => validationIssueTarget(i.field_path)).filter((t): t is Target => !!t), from: "validate" });
      } else setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function copyToDraft() {
    setBusy("copying");
    setError(null);
    try {
      const v = await writer.createDraft(server.id);
      navigate(`/projects/${projectId}/layouts/${v.id}`);
    } catch (e) {
      if (classifyError(e) === "state") setNotice("이미 열린 초안이 있습니다. 배치판 목록에서 초안을 여세요(프로젝트에 초안은 하나).");
      else setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function reload() {
    setConflict(false);
    const v = await writer.reload(server.id);
    setServer(v);
    setDoc(fromVersion(v));
    setHeader(headerOf(v));
    setIssues(null);
  }

  const startRoute = () => {
    setMode("route");
    setSelected(null);
    setRouteDraft((d) => d ?? { editingKey: null, key: "", fromPortId: "", toPortId: "", mode: "", points: [], base: doc, created: [], message: null });
  };
  const centerPlace = (assetId: string) => {
    change(addPlacement(doc, assetId, extent.w / 2, extent.h / 2));
    setSelected(`placement:${assetId}`);
  };

  const saveBlocked = showErrors && Object.keys(docErrors).length > 0;

  return (
    <>
      {guard}
      {!draft && (
        <StateNotice kind="empty" title="승인된 배치판은 바꿀 수 없습니다">
          고치려면 이 버전을 복사해 새 초안을 만드세요.{" "}
          {canEdit(role) && (
            <Button onClick={() => void copyToDraft()} disabled={busy !== null}>
              {busy === "copying" ? "만드는 중…" : "이 버전으로 새 초안 만들기"}
            </Button>
          )}
        </StateNotice>
      )}
      {draft && !canEdit(role) && <Note>이 역할은 배치판을 고칠 수 없습니다(편집자·관리자만). 읽기 전용으로 보입니다.</Note>}
      {notice && (
        <StateNotice kind="empty" title="알림">
          {notice}
        </StateNotice>
      )}
      {conflict && <ConflictNotice resource="배치판" onReload={() => void reload()} onKeepEditing={() => setConflict(false)} />}
      {error !== null && <SaveErrorNotice error={error} />}

      <Section id="sec-layout-info" title="배치판 정보">
        <FieldGrid>
          <TextField label="이름" value={header.name} disabled={!editable} onChange={(e) => setHeader({ ...header, name: e.target.value })} hint="비우면 이름 없음" />
          <TextField label="도면 가로(m)" value={header.canvasW} disabled={!editable} error={headerErrors.canvasW} hint="비우면 모름(점·배치를 담는 범위로 그립니다)" onChange={(e) => setHeader({ ...header, canvasW: e.target.value })} />
          <TextField label="도면 세로(m)" value={header.canvasH} disabled={!editable} error={headerErrors.canvasH} hint="비우면 모름" onChange={(e) => setHeader({ ...header, canvasH: e.target.value })} />
        </FieldGrid>
        <TextAreaField label="메모" value={header.notes} disabled={!editable} onChange={(e) => setHeader({ ...header, notes: e.target.value })} />
        <details>
          <summary>배경 도면 이미지(선택)</summary>
          <Note>이미지를 이 화면에 올리는 기능은 아직 없습니다(후속). 이미 올려 둔 이미지 주소와 축척을 적으면 도면 아래에 깝니다. 없으면 격자만 그립니다.</Note>
          <FieldGrid>
            <TextField label="이미지 주소" value={header.bgUrl} disabled={!editable} error={headerErrors.bgUrl} hint="http(s) 주소" onChange={(e) => setHeader({ ...header, bgUrl: e.target.value })} />
            <TextField label="이미지 가로(px)" value={header.bgWpx} disabled={!editable} error={headerErrors.bgWpx} onChange={(e) => setHeader({ ...header, bgWpx: e.target.value })} />
            <TextField label="이미지 세로(px)" value={header.bgHpx} disabled={!editable} error={headerErrors.bgHpx} onChange={(e) => setHeader({ ...header, bgHpx: e.target.value })} />
            <TextField label="픽셀당 m" value={header.bgMpp} disabled={!editable} error={headerErrors.bgMpp} hint="비우면 도면 가로 ÷ 이미지 가로로 맞춥니다" onChange={(e) => setHeader({ ...header, bgMpp: e.target.value })} />
          </FieldGrid>
        </details>
        {editable && (
          <p>
            <Button onClick={() => void saveHeader()} disabled={!headerDirty || busy !== null || Object.keys(headerErrors).length > 0}>
              {busy === "header" ? "저장 중…" : "배치판 정보 저장"}
            </Button>
            {headerDirty && <DirtyIndicator />}
          </p>
        )}
      </Section>

      <Section id="sec-layout-canvas" title="도면">
        <FilterBar>
          <Button aria-pressed={mode === "select"} onClick={() => (routeDraft ? routeCancel() : setMode("select"))}>
            선택·이동
          </Button>
          {editable && (
            <>
              <Button aria-pressed={mode === "point"} onClick={() => { if (routeDraft) routeCancel(); setMode("point"); }}>
                점 추가
              </Button>
              <Button aria-pressed={mode === "route"} onClick={startRoute}>
                경로 그리기
              </Button>
            </>
          )}
          <Button aria-label="확대" onClick={() => setViewport((v) => ({ ...v, zoom: clampZoom(v.zoom * 1.25) }))}>
            ＋
          </Button>
          <Button aria-label="축소" onClick={() => setViewport((v) => ({ ...v, zoom: clampZoom(v.zoom / 1.25) }))}>
            −
          </Button>
          <Button onClick={() => setViewport(fitViewport(extent))}>전체 보기</Button>
          {editable && (
            <>
              <Button onClick={undo} disabled={past.length === 0 || !!routeDraft} title="Ctrl+Z">
                ↺ 되돌리기
              </Button>
              <Button onClick={redo} disabled={future.length === 0 || !!routeDraft} title="Ctrl+Y">
                다시 하기
              </Button>
            </>
          )}
        </FilterBar>
        {bgReason && <Note>{bgReason}</Note>}
        {mode === "route" && routeDraft && editable && (
          // 그리는 중 상태와 끝내기를 도면 바로 위에 둔다(패널이 도면 아래라 끝내지 못한 이유가 안 보였다)
          <section aria-label="경로 그리기 상태">
            <FilterBar>
              <span>
                경로 그리기 중 · 점 {routeDraft.points.length}개 · 출발 {routeDraft.fromPortId ? portText(assets.portById.get(routeDraft.fromPortId), routeDraft.fromPortId) : "미정"} · 도착{" "}
                {routeDraft.toPortId ? portText(assets.portById.get(routeDraft.toPortId), routeDraft.toPortId) : "미정"}
              </span>
              <Button variant="primary" onClick={routeFinish} disabled={routeDraft.points.length < 2} title="Enter 또는 더블클릭">
                경로 끝내기
              </Button>
              <Button onClick={routeRemoveLast} disabled={routeDraft.points.length === 0} title="Backspace">
                마지막 점 빼기
              </Button>
              <Button onClick={routeCancel} title="Esc">
                취소
              </Button>
            </FilterBar>
            {routeDraft.message ? (
              <StateNotice kind="error" title="경로를 끝내지 못했습니다">
                {routeDraft.message}
              </StateNotice>
            ) : (
              <Note>
                끝내기: 더블클릭 · Enter · "경로 끝내기". 도착할 설비·공간을 누르면 도착 포트가 정해집니다(빈 곳만 누르면 출발·도착 포트를 아래 패널에서 고르세요).
              </Note>
            )}
          </section>
        )}
        <Note>
          범위 {extent.w.toFixed(1)} × {extent.h.toFixed(1)} m{server.canvas_width_m && server.canvas_height_m ? "(도면 크기)" : "(도면 크기를 몰라 점·배치를 담는 범위)"} · 점 {doc.points.length} · 배치 {doc.placements.length} · 경로 {doc.routes.length}
        </Note>
        <LayoutCanvas
          doc={doc}
          assetById={assets.byId}
          portById={assets.portById}
          extent={extent}
          background={bg}
          viewport={viewport}
          onViewportChange={onViewport}
          mode={mode}
          readOnly={!editable}
          selected={selected}
          errorTargets={errorTargets}
          routeDraft={routeDraft?.points ?? []}
          onSelect={setSelected}
          onAddPoint={(x, y) => {
            const r = addPoint(doc, x, y);
            change(r.doc);
            setSelected(`point:${r.key}`);
          }}
          onRoutePoint={routeAppend}
          onRouteClick={routeClick}
          onRouteFinish={routeFinish}
          onInsertOnRoute={insertOnRoute}
          onEditStart={() => {
            setPast((p) => [...p.slice(-99), doc]);
            setFuture([]);
          }}
          onMovePoint={(key, x, y) => moveSilently(patchPoint(doc, key, { x, y }))}
          onMovePlacement={(assetId, x, y) => moveSilently(patchPlacement(doc, assetId, { x, y }))}
        />
        {mode === "route" && routeDraft && editable && (
          <RouteDraftPanel
            doc={doc}
            draft={routeDraft}
            assets={assets}
            onChange={setRouteDraft}
            onAppend={routeAppend}
            onRemoveLast={routeRemoveLast}
            onFinish={routeFinish}
            onCancel={routeCancel}
          />
        )}
        {selected && mode !== "route" && (
          <SelectionPanel
            doc={doc}
            saved={server}
            target={selected}
            assets={assets}
            editable={editable}
            errors={showErrors ? docErrors : {}}
            onChange={change}
            onSelect={setSelected}
            onRedrawRoute={(r) => {
              setMode("route");
              setRouteDraft({ editingKey: r.key, key: r.key, fromPortId: r.fromPortId, toPortId: r.toPortId, mode: r.mode, points: [], base: doc, created: [], message: null });
            }}
          />
        )}
      </Section>

      <Section id="sec-layout-tables" title="표로 보기·붙여 넣기">
        <LayoutTables doc={doc} saved={server} assets={assets} editable={editable} selected={selected} onSelect={(t) => { setMode("select"); setSelected(t); }} onChange={change} onPlace={centerPlace} />
      </Section>

      <Section id="sec-layout-actions" title="저장·검증·승인">
        {issues && issues.list.length > 0 && (
          <>
            <Note>{issues.from === "save" ? "저장하지 못했습니다(서버 구조 검사). 문제 있는 점·배치·경로를 도면에 굵은 빨간 테두리로 표시했습니다." : "문제 있는 점·배치·포트·경로를 도면에 굵은 빨간 테두리로 표시했습니다."}</Note>
            <ValidationPanel issues={issues.list} />
          </>
        )}
        {validation && validation.issues.length === 0 && (
          <StateNotice kind="empty" title="승인할 수 있습니다">
            오류 0건 · 경고 0건
          </StateNotice>
        )}
        {validation && validation.issues.length > 0 && (
          <Note>
            {validation.approvable ? "경고만 있어 승인할 수 있습니다." : "오류가 있어 승인할 수 없습니다."} 오류 {validation.error_count}건 · 경고 {validation.warning_count}건
          </Note>
        )}
        {saveBlocked && (
          <StateNotice kind="error" title="입력을 확인하세요">
            저장하기 전에 고칠 입력이 {Object.keys(docErrors).length}건 있습니다(도면에 빨간 테두리, 선택하면 항목별 안내).
          </StateNotice>
        )}
        {editable && (
          <FilterBar>
            <Button variant="primary" onClick={() => void save()} disabled={!contentDirty || busy !== null}>
              {busy === "saving" ? "저장 중…" : "내용 저장"}
            </Button>
            <Button onClick={() => { setDoc(savedDoc); setShowErrors(false); setIssues(null); }} disabled={!contentDirty || busy !== null}>
              ↺ 저장한 내용으로 되돌리기
            </Button>
            {contentDirty && <DirtyIndicator />}
          </FilterBar>
        )}
        {draft && (
          <FilterBar>
            <Button onClick={() => void validate()} disabled={busy !== null || contentDirty} title={contentDirty ? "먼저 저장하세요(검증은 서버에 저장된 내용을 봅니다)" : undefined}>
              {busy === "validating" ? "검증 중…" : "검증"}
            </Button>
            {canApprove(role) && (
              <Button onClick={() => setApproveOpen(true)} disabled={busy !== null || contentDirty || headerDirty} title={contentDirty || headerDirty ? "먼저 저장하세요" : undefined}>
                {busy === "approving" ? "승인 중…" : "승인"}
              </Button>
            )}
          </FilterBar>
        )}
        {draft && !canApprove(role) && <Note>승인은 관리자만 할 수 있습니다.</Note>}
      </Section>
      <ConfirmDialog open={approveOpen} title="이 배치판을 승인할까요?" confirmLabel="승인" onConfirm={() => void approve()} onCancel={() => setApproveOpen(false)}>
        승인하면 이 버전의 점·배치·포트 매핑·경로는 바꿀 수 없습니다. 검증 오류가 있으면 서버가 승인을 거부합니다.
      </ConfirmDialog>
    </>
  );
}
