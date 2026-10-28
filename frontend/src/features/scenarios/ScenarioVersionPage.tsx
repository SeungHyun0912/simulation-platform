import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiError, classifyError, toIssues } from "../../shared/api/errors";
import type { Schemas } from "../../shared/api/types";
import { ApiOnlyNotice } from "../../shared/components/ApiOnlyNotice";
import { Button } from "../../shared/components/Button";
import { ConfirmDialog } from "../../shared/components/ConfirmDialog";
import { ConflictNotice } from "../../shared/components/ConflictNotice";
import { DataTable, type Column } from "../../shared/components/DataTable";
import { SelectField, TextAreaField, TextField } from "../../shared/components/Fields";
import { Block, DirtyIndicator, FieldGrid, Note, Section } from "../../shared/components/Layout";
import { PageHeader } from "../../shared/components/PageHeader";
import { QueryErrorNotice } from "../../shared/components/QueryErrorNotice";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { StateNotice } from "../../shared/components/StateNotice";
import { ValidationPanel, type ValidationIssue } from "../../shared/components/ValidationPanel";
import { VersionStatusBadge } from "../../shared/components/VersionStatusBadge";
import { useUnsavedChangesGuard } from "../../shared/hooks/useUnsavedChangesGuard";
import { canApprove, canEdit } from "../projects/projectView";
import { useCurrentProject } from "../projects/useCurrentProject";
import { RunRequestSection } from "../runs/RunRequestSection";
import { ScenarioProductEditor } from "./ScenarioProductEditor";
import { useProductOptions, useScenario, useScenarioVersion } from "./queries";
import {
  assumptionsUsed,
  emptyProduct,
  isDirty,
  serverPathToDraftPath,
  toPatch,
  validateDraft,
  type ScenarioDraft,
  type ScenarioVersionView,
} from "./scenarioView";
import { useScenarioWriter } from "./writer";

/** 시나리오 버전 화면: 초안 편집·저장, 실행 사전검증, 승인(관리자), 승인본의 실행 요청. 승인본은 읽기 전용이다. */
export function ScenarioVersionPage() {
  const { versionId = "" } = useParams();
  const { projectId, label } = useCurrentProject();
  const source = useDataSource();
  const version = useScenarioVersion(projectId, versionId);
  const scenarioId = version.status === "success" ? version.data.scenarioId : "";
  const scenario = useScenario(projectId, scenarioId);
  const [notice, setNotice] = useState<string | null>(null);
  // 갱신 결과: 같은 화면에서 갱신했거나(state) 승인본에서 새 초안을 만들며 갱신하고 넘어온 경우(location.state)
  const location = useLocation();
  const [refreshedHere, setRefreshed] = useState<Schemas["ScenarioRefreshOut"] | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const fromRoute = (location.state as { refresh?: Schemas["ScenarioRefreshOut"] } | null)?.refresh ?? null;
  const refreshedAll = refreshedHere ?? fromRoute;
  const refreshed = refreshedAll && refreshedAll.version.id !== dismissed ? refreshedAll : null;

  const scenarioLabel = scenario.status === "success" ? scenario.data.code : "시나리오";
  const crumbs = [
    { label: "프로젝트", to: "/" },
    { label },
    { label: "시나리오", to: `/projects/${projectId}/scenarios` },
    ...(scenarioId ? [{ label: scenarioLabel, to: `/projects/${projectId}/scenarios/${scenarioId}` }] : []),
  ];
  const head = (title: string, extra?: React.ReactNode) => (
    <PageHeader title={title} breadcrumbs={[...crumbs, { label: title }]} renderLink={(c) => <Link to={c.to!}>{c.label}</Link>} actions={extra} />
  );

  if (source === "static") return <>{head("시나리오 버전")}<ApiOnlyNotice subject="시나리오" /></>;
  if (version.status === "pending") return <>{head("시나리오 버전")}<StateNotice kind="loading" /></>;
  if (version.status === "error") return <>{head("시나리오 버전")}<QueryErrorNotice error={version.error} subject="시나리오 버전" onRetry={version.retry} /></>;

  const v = version.data;
  return (
    <>
      {head(`${scenarioLabel} v${v.versionNo}`)}
      <p>
        <VersionStatusBadge status={v.status} />
      </p>
      {notice && <p role="status">{notice}</p>}
      {refreshed && refreshed.version.id === v.id && <RefreshResult result={refreshed} onClose={() => { setRefreshed(null); setDismissed(refreshed.version.id); }} />}
      {/* 서버 값이 바뀌면(저장·승인·다시 불러오기) 편집 상태를 서버 값으로 다시 시작한다 */}
      <VersionEditor key={`${v.id}:${v.rowVersion}`} projectId={projectId} version={v} onNotice={setNotice} onRefreshed={setRefreshed} />
    </>
  );
}

function VersionEditor({
  projectId,
  version,
  onNotice,
  onRefreshed,
}: {
  projectId: string;
  version: ScenarioVersionView;
  onNotice: (t: string | null) => void;
  onRefreshed: (r: Schemas["ScenarioRefreshOut"]) => void;
}) {
  const navigate = useNavigate();
  const { project } = useCurrentProject();
  const writer = useScenarioWriter(projectId);
  const productOptions = useProductOptions(projectId);
  const [draft, setDraft] = useState<ScenarioDraft>(version.draft);
  const [serverIssues, setServerIssues] = useState<ValidationIssue[]>([]);
  const [serverPaths, setServerPaths] = useState<Record<string, string>>({});
  const [precheck, setPrecheck] = useState<Schemas["PrecheckOut"] | null>(null);
  const [busy, setBusy] = useState<null | "saving" | "validating" | "approving" | "refreshing">(null);
  const [assetMode, setAssetMode] = useState<"latest" | "keep">("latest");
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [approveOpen, setApproveOpen] = useState(false);

  const editable = version.status === "draft" && canEdit(project?.role);
  const mayApprove = version.status === "draft" && canApprove(project?.role);
  const dirty = editable && isDirty(version.draft, draft);
  const guard = useUnsavedChangesGuard(dirty);
  const issues = useMemo(() => validateDraft(draft), [draft]);
  const errors = useMemo(() => {
    const out: Record<string, string> = { ...serverPaths };
    for (const i of issues) if (!(i.path in out)) out[i.path] = i.message;
    return out;
  }, [issues, serverPaths]);
  const products = productOptions.status === "success" ? productOptions.data.products : [];
  const used = draft.products.some((p) => assumptionsUsed(p.assumptions));
  const needsReason = used && draft.assumptionReason.trim() === "";

  function change(next: ScenarioDraft) {
    setDraft(next);
    setPrecheck(null);
    setServerPaths({});
    setServerIssues([]);
  }

  async function save() {
    if (!editable || !dirty || issues.length > 0 || busy) return;
    setBusy("saving");
    setError(null);
    setServerIssues([]);
    setServerPaths({});
    setConflict(false);
    const snapshot = draft;
    try {
      await writer.patchVersion(version.id, toPatch(version.draft, draft), version.rowVersion);
      onNotice("시나리오 버전을 저장했습니다.");
    } catch (e) {
      const k = classifyError(e);
      if (k === "conflict") setConflict(true);
      else if (k === "validation" && e instanceof ApiError && e.details.length > 0) {
        const paths: Record<string, string> = {};
        const rest: ValidationIssue[] = [];
        for (const i of toIssues(e)) {
          const p = serverPathToDraftPath(i.field_path, snapshot);
          if (p && !(p in paths)) paths[p] = i.message;
          else rest.push(i);
        }
        setServerPaths(paths);
        setServerIssues(rest);
      } else setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function reload() {
    setConflict(false);
    setError(null);
    try {
      await writer.fetchLatest(version.id); // 캐시가 바뀌면 key가 달라져 편집기가 서버 값으로 다시 시작한다
      onNotice("서버의 최신 내용을 불러왔습니다. 이 화면의 변경은 사라졌습니다.");
    } catch (e) {
      setError(e);
    }
  }

  async function validate() {
    if (busy) return;
    setBusy("validating");
    setError(null);
    try {
      setPrecheck(await writer.validate(version.id));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  /** 초안: 바로 갱신. 저장하지 않은 입력이 있으면 먼저 저장해야 한다(갱신은 서버 값을 바꾼다). */
  async function refreshDraft() {
    if (busy || dirty) return;
    setBusy("refreshing");
    setError(null);
    try {
      const r = await writer.refresh(version.id, { assets: assetMode }, version.rowVersion);
      onRefreshed(r.result);
      onNotice("최신 승인 공정·자산 버전으로 갱신했습니다. 바뀐 내용을 확인한 뒤 사전검증·승인하세요.");
    } catch (e) {
      if (classifyError(e) === "conflict") setConflict(true);
      else setError(e);
    } finally {
      setBusy(null);
    }
  }

  /** 승인본: 이 버전을 복사한 새 초안을 만들고 곧바로 갱신해 그 초안으로 이동한다(재시뮬레이션 흐름). */
  async function draftAndRefresh() {
    if (busy) return;
    setBusy("refreshing");
    setError(null);
    try {
      const d = await writer.createDraft(version.scenarioId, version.id);
      const r = await writer.refresh(d.id, { assets: assetMode }, d.rowVersion);
      navigate(`/projects/${projectId}/scenarios/versions/${d.id}`, { state: { refresh: r.result } });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    setApproveOpen(false);
    if (busy) return;
    setBusy("approving");
    setError(null);
    setServerIssues([]);
    try {
      await writer.approve(version.id, version.rowVersion);
      onNotice("시나리오 버전을 승인했습니다. 이제 이 버전으로 실행을 요청할 수 있습니다.");
    } catch (e) {
      // 사전검증 오류가 있으면 422 SCENARIO_NOT_RUNNABLE: 서버 사유를 그대로 보인다
      if (e instanceof ApiError && classifyError(e) === "validation" && e.details.length > 0) setServerIssues(toIssues(e));
      else if (classifyError(e) === "conflict") setConflict(true);
      else setError(e);
    } finally {
      setBusy(null);
    }
  }

  const clientIssues: ValidationIssue[] = issues.map((i) => ({ severity: "error", message: i.message, field_path: i.path }));
  const canSave = editable && dirty && issues.length === 0 && busy === null;
  const mayRun = canEdit(project?.role);

  return (
    <>
      {guard}
      {dirty && <DirtyIndicator />}
      <SaveErrorNotice error={error} />
      {conflict && <ConflictNotice resource="시나리오 버전" onReload={() => void reload()} onKeepEditing={() => setConflict(false)} />}
      {serverIssues.length > 0 && (
        <Block>
          <ValidationPanel issues={serverIssues} />
        </Block>
      )}
      {!editable && version.status === "approved" && <Note>승인된 버전은 수정할 수 없습니다. 바꾸려면 시나리오 화면에서 이 버전으로 새 초안을 만드세요.</Note>}
      {!editable && version.status === "draft" && <Note>이 역할은 초안을 수정할 수 없습니다(관리자·편집자만).</Note>}

      <fieldset disabled={!editable} style={{ border: "none", padding: 0, margin: 0 }}>
        <Section id="sec-products" title="제품·도착">
          <Note>제품 하나가 실행의 공정 하나입니다. 목록 순서는 같은 시각에 도착한 것의 처리 순서입니다.</Note>
          {productOptions.status === "error" && <QueryErrorNotice error={productOptions.error} subject="제품 목록" onRetry={productOptions.retry} />}
          {errors.products && <p role="alert">{errors.products}</p>}
          {draft.products.length === 0 && <Note>제품이 없습니다. 제품을 하나 이상 추가하세요(없으면 사전검증 오류 SCN-PROD-001).</Note>}
          {draft.products.map((p, i) => (
            <ScenarioProductEditor
              key={p.key}
              projectId={projectId}
              index={i}
              product={p}
              products={products}
              errors={errors}
              onChange={(next) => change({ ...draft, products: draft.products.map((x) => (x.key === p.key ? next : x)) })}
              onRemove={() => change({ ...draft, products: draft.products.filter((x) => x.key !== p.key) })}
            />
          ))}
          <div>
            <Button onClick={() => change({ ...draft, products: [...draft.products, emptyProduct()] })}>제품 추가</Button>
          </div>
        </Section>

        <Section id="sec-stopping" title="종료 규칙">
          <FieldGrid>
            <SelectField
              label="종료 방식"
              hint="소진: 모든 작업물이 끝나거나 더 진행할 사건이 없을 때까지. 고정 지평선: [0, H)까지(H 시각의 사건은 처리하지 않음)."
              value={draft.stopping.mode}
              onChange={(e) => change({ ...draft, stopping: { ...draft.stopping, mode: e.target.value === "fixed_horizon" ? "fixed_horizon" : "drain" } })}
            >
              <option value="drain">소진될 때까지</option>
              <option value="fixed_horizon">고정 지평선</option>
            </SelectField>
            {draft.stopping.mode === "fixed_horizon" && (
              <TextField
                label="지평선(분)"
                inputMode="decimal"
                value={draft.stopping.horizonMin}
                error={errors["stopping.horizonMin"]}
                onChange={(e) => change({ ...draft, stopping: { ...draft.stopping, horizonMin: e.target.value } })}
              />
            )}
          </FieldGrid>
        </Section>

        <Section id="sec-notes" title="가정 사유·메모">
          <TextAreaField
            label="가정 사유"
            hint={needsReason ? "가정을 하나라도 쓰면 사유가 필요합니다(없으면 사전검증 오류 SCN-ASM-001)." : "가정을 쓰는 경우에만 필요합니다. 비우면 입력 없음"}
            value={draft.assumptionReason}
            error={errors.assumptionReason ?? (needsReason ? "가정을 썼으므로 사유를 입력하세요." : undefined)}
            onChange={(e) => change({ ...draft, assumptionReason: e.target.value })}
          />
          <TextAreaField label="메모" hint="비우면 입력 없음" value={draft.notes} error={errors.notes} onChange={(e) => change({ ...draft, notes: e.target.value })} />
        </Section>
      </fieldset>

      <Section id="sec-assets" title="고정 자산">
        <Note>
          공정이 쓰는 자산은 저장할 때 그 자산의 현재 승인 버전으로 자동 고정됩니다. 현재 {version.pinnedAssets}개가 고정되어 있습니다. 개별 고정 변경은 아직 지원하지 않습니다(서버 값을 유지).
        </Note>
      </Section>

      <Section id="sec-actions" title="저장·검증·승인">
        {clientIssues.length > 0 && <ValidationPanel issues={clientIssues} />}
        <div>
          <Button variant="primary" disabled={!canSave} onClick={() => void save()}>
            {busy === "saving" ? "저장 중…" : "저장"}
          </Button>{" "}
          <Button disabled={busy !== null || dirty} onClick={() => void validate()} title={dirty ? "저장한 값을 검증합니다. 먼저 저장하세요." : undefined}>
            {busy === "validating" ? "검증 중…" : "실행 사전검증"}
          </Button>{" "}
          {version.status === "draft" && (
            <Button disabled={!mayApprove || busy !== null || dirty} onClick={() => setApproveOpen(true)} title={!mayApprove ? "승인은 관리자만 할 수 있습니다" : dirty ? "먼저 저장하세요" : undefined}>
              {busy === "approving" ? "승인 중…" : "승인"}
            </Button>
          )}
        </div>
        <Note>사전검증은 저장된 값을 서버 엔진으로 컴파일해 실행 가능한지 판정합니다(저장하지 않음). 승인은 오류가 없을 때만 되며 승인 후 내용은 고정됩니다.</Note>
        {precheck && <PrecheckResult precheck={precheck} products={products} />}
      </Section>

      <ConfirmDialog open={approveOpen} title="이 버전을 승인할까요?" confirmLabel="승인" onConfirm={() => void approve()} onCancel={() => setApproveOpen(false)}>
        승인하면 제품·도착·가정·종료 규칙과 고정 자산이 영구히 고정되며 수정할 수 없습니다. 사전검증 오류가 있으면 승인되지 않습니다.
      </ConfirmDialog>

      {canEdit(project?.role) && (
        <Section id="sec-refresh" title="최신 공정으로 갱신">
          <Note>
            공정이나 자산 용량을 고쳐 승인했다면 시나리오를 최신 승인본으로 맞춥니다. 도착·가정·우선순위·순서는 그대로이고 공정 버전·자산 고정만 바뀝니다. 그다음 사전검증 → 승인 →
            실행 → 이전 실행과 비교로 이어집니다.
          </Note>
          <FieldGrid>
            <SelectField label="자산 고정" value={assetMode} onChange={(e) => setAssetMode(e.target.value === "keep" ? "keep" : "latest")}>
              <option value="latest">쓰는 자산을 현재 승인 버전으로 다시 고정(안 쓰는 고정은 뺌)</option>
              <option value="keep">기존 고정은 두고 새로 쓰는 자산만 채움</option>
            </SelectField>
          </FieldGrid>
          <div>
            {version.status === "draft" ? (
              <Button disabled={busy !== null || dirty} onClick={() => void refreshDraft()} title={dirty ? "먼저 저장하세요(갱신은 서버의 초안을 바꿉니다)" : undefined}>
                {busy === "refreshing" ? "갱신 중…" : "최신 승인 공정으로 갱신"}
              </Button>
            ) : (
              <Button disabled={busy !== null} onClick={() => void draftAndRefresh()}>
                {busy === "refreshing" ? "만드는 중…" : "새 초안을 만들어 최신 공정으로 갱신"}
              </Button>
            )}
          </div>
        </Section>
      )}

      {version.status === "approved" && <RunRequestSection projectId={projectId} scenarioVersionId={version.id} mayRun={mayRun} />}
    </>
  );
}

/** 사전검증 결과. 엔진·도메인 검증 코드는 번역하지 않고 서버 메시지를 그대로 보여 준다. */
function PrecheckResult({ precheck, products }: { precheck: Schemas["PrecheckOut"]; products: { id: string; code: string; name: string }[] }) {
  const issues: ValidationIssue[] = precheck.issues.map((i) => ({
    severity: i.severity,
    rule_id: i.rule_id,
    message: i.message,
    ...(i.field_path ? { field_path: i.field_path } : {}),
  }));
  const productLabel = (id: string) => {
    const p = products.find((x) => x.id === id);
    return p ? `${p.code} ${p.name}` : id.slice(0, 8);
  };
  return (
    <div aria-label="사전검증 결과">
      {precheck.runnable ? (
        <StateNotice kind="empty" title="실행할 수 있습니다">오류 0건 · 경고 {precheck.warning_count}건 · 엔진 {precheck.engine_version}</StateNotice>
      ) : (
        <StateNotice kind="error" title="아직 실행할 수 없습니다">오류 {precheck.error_count}건 · 경고 {precheck.warning_count}건 · 엔진 {precheck.engine_version}</StateNotice>
      )}
      {issues.length > 0 && <ValidationPanel issues={issues} />}
      {precheck.products.map((p) => (
        <section key={p.process_version_id} aria-label={`${productLabel(p.product_id)} 컴파일 결과`}>
          <h4>
            {productLabel(p.product_id)} — {p.compiled ? "컴파일됨" : "컴파일 안 됨"}
          </h4>
          {p.compile_issues.length > 0 && (
            <ul>
              {p.compile_issues.map((c, i) => (
                <li key={`${c.rule_id}-${i}`}>
                  <code>{c.rule_id}</code> {c.node_key ? `(${c.node_key}) ` : ""}
                  {c.message}
                </li>
              ))}
            </ul>
          )}
          {p.assumptions_used.length > 0 && (
            <>
              <h5>쓰인 가정</h5>
              <ul>
                {p.assumptions_used.map((a, i) => (
                  <li key={`${a.code}-${i}`}>
                    <code>{a.code}</code> {a.node_key ? `(${a.node_key}) ` : ""}
                    {a.message}
                  </li>
                ))}
              </ul>
            </>
          )}
          {p.waived.length > 0 && (
            <>
              <h5>가정으로 면제된 항목</h5>
              <ul>
                {p.waived.map((c, i) => (
                  <li key={`${c.rule_id}-${i}`}>
                    <code>{c.rule_id}</code> {c.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
    </div>
  );
}

const PROCESS_STATUS_TEXT: Record<string, string> = {
  changed: "새 승인본으로 바뀜",
  unchanged: "그대로(이미 최신)",
  no_approved_version: "승인본 없음(그대로)",
  not_requested: "갱신 대상 아님",
};
const ASSET_CHANGE_TEXT: Record<string, string> = { pinned: "새로 고정", updated: "새 버전으로 바뀜", removed: "고정 해제(안 씀)" };

/** 갱신 결과: 바뀐 공정 버전·자산 고정을 보여 준다(사용자가 확인한 뒤 사전검증·승인). */
function RefreshResult({ result, onClose }: { result: Schemas["ScenarioRefreshOut"]; onClose: () => void }) {
  const procCols: Column<Schemas["ProcessChangeOut"]>[] = [
    { key: "product", header: "제품", render: (c) => c.product_code ?? c.product_id.slice(0, 8) },
    { key: "status", header: "결과", render: (c) => PROCESS_STATUS_TEXT[c.status] ?? c.status },
    { key: "from", header: "이전 공정 버전", render: (c) => (c.from_version_no !== null ? `v${c.from_version_no}` : c.from_process_version_id.slice(0, 8)) },
    { key: "to", header: "새 공정 버전", render: (c) => (c.to_version_no !== null ? `v${c.to_version_no}` : c.to_process_version_id.slice(0, 8)) },
  ];
  const assetCols: Column<Schemas["AssetPinChangeOut"]>[] = [
    { key: "asset", header: "자산", render: (c) => c.asset_code ?? c.asset_id.slice(0, 8) },
    { key: "change", header: "변경", render: (c) => ASSET_CHANGE_TEXT[c.change] ?? c.change },
    { key: "from", header: "이전 자산 버전", render: (c) => c.from_revision_id?.slice(0, 8) ?? "없음" },
    { key: "to", header: "새 자산 버전", render: (c) => c.to_revision_id?.slice(0, 8) ?? "없음" },
  ];
  const changed = result.process_changes.filter((c) => c.status === "changed").length;
  return (
    <Section id="sec-refresh-result" title="갱신 결과">
      <p>
        공정 {changed}개가 새 승인본으로 바뀌었고 자산 고정 {result.asset_changes.length}건이 달라졌습니다.
      </p>
      <DataTable caption="공정 버전 변경" columns={procCols} rows={result.process_changes} getRowKey={(c) => c.product_id} />
      {result.asset_changes.length > 0 ? (
        <DataTable caption="자산 고정 변경" columns={assetCols} rows={result.asset_changes} getRowKey={(c) => c.asset_id} wrapCells />
      ) : (
        <Note>자산 고정은 바뀌지 않았습니다.</Note>
      )}
      <Note>다음: 아래에서 실행 사전검증 → 승인 → 실행 요청. 실행이 끝나면 실행 상세의 "다른 실행과 비교"로 이전 결과와 비교합니다.</Note>
      <div>
        <Button onClick={onClose}>갱신 결과 닫기</Button>
      </div>
    </Section>
  );
}
