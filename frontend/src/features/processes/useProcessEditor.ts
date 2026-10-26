import { useState } from "react";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiError, classifyError, toIssues } from "../../shared/api/errors";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import {
  addStep,
  moveStep,
  removeStep,
  setNextLocation,
  updateNode,
  updateStep,
  type GraphDoc,
  type GraphNode,
  type NextLocation,
  type StepDto,
} from "./processDoc";
import {
  docChanged,
  draftChanged,
  mapGraphErrors,
  mapUnitErrors,
  mergeProcessDraft,
  toGraphIn,
  type ProcessDraft,
  type UnitErrors,
} from "./processDraft";
import { buildUnitSpecPatch, type ProcessGraphView, type ProcessVersionView, type UnitSpecEdit } from "./processView";
import { useProcessWriter, type ProcessTransition, type ValidateScope, type ValidationResult } from "./writer";

/** 편집을 시작한 시점의 서버 값(base)과 row_version, 그리고 입력 중인 값(draft) */
type Entry = { base: ProcessDraft & { version: number }; draft: ProcessDraft };

type Ui = {
  notice: string | null;
  error: unknown;
  /** 서버가 저장·전이를 거부하며 알려 준 항목(entity_id별로 단계에 연결된다) */
  rejected: ValidationIssue[];
  unitErrors: UnitErrors;
  conflict: boolean;
  /** 충돌 후 병합에서 서버 값과 겹친 항목(노드 id 또는 `raw:필드`) */
  hints: string[];
  /** 구조가 바뀌어 자동 병합이 불가능한 충돌 */
  mergeBlocked: boolean;
};

const EMPTY_UI = (conflict: boolean): Ui => ({
  notice: null,
  error: null,
  rejected: [],
  unitErrors: {},
  conflict,
  hints: [],
  mergeBlocked: false,
});

const TRANSITION_NOTICE: Record<ProcessTransition, string> = {
  submit: "검토를 요청했습니다.",
  approve: "승인했습니다.",
  reject: "반려했습니다. 이 버전은 초안으로 돌아갔습니다.",
};

/**
 * 공정 버전의 입력·저장·전이 상태.
 * - 저장은 단위(PATCH) → 그래프(PUT) 순서이며 둘 다 같은 버전 `row_version`(If-Match)을 쓴다. 단위가 먼저 저장되고
 *   그래프가 실패하면 단위는 저장된 것으로 base를 갱신하고 그래프 변경만 남긴다(다시 저장해도 단위를 중복 전송하지 않는다).
 * - If-Match는 편집을 시작한 시점의 버전이다. 입력한 변경이 있는 동안에는 조회 캐시가 바뀌어도 base를 바꾸지 않고,
 *   변경이 없으면 항상 서버 값을 쓴다(조용한 덮어쓰기 방지).
 * - 412 충돌은 노드 단위 3-way 병합("내 변경 유지")이며 구조가 바뀐 경우에는 다시 불러오기만 가능하다. 저장은 사용자가 다시 누른다.
 * - 제출·승인·반려는 저장하지 않은 변경이 없을 때만 가능하다(저장된 값이 검토 대상이어야 한다).
 */
export function useProcessEditor(args: {
  projectId: string;
  productId: string;
  version: ProcessVersionView;
  graph: ProcessGraphView;
  previewConflict: boolean;
}) {
  const { projectId, version, graph, previewConflict } = args;
  const source = useDataSource();
  const writer = useProcessWriter(projectId);

  const [entry, setEntry] = useState<Entry | null>(null);
  const [busy, setBusy] = useState<null | "saving" | "transition" | "validating">(null);
  const [ui, setUi] = useState<Ui>(() => EMPTY_UI(previewConflict));
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  const freshVersion = Math.max(version.rowVersion, graph.rowVersion);
  const fresh: ProcessDraft & { version: number } = {
    doc: graph.doc,
    raw: version.rawUnitSpec,
    finished: version.finishedUnitSpec,
    version: freshVersion,
  };
  const dirty = entry !== null && draftChanged(entry.base, entry.draft);
  const base = dirty ? entry.base : fresh;
  const draft: ProcessDraft = dirty ? entry.draft : fresh;

  const show = (partial: Partial<Ui>) => setUi((cur) => ({ ...cur, ...partial }));
  const clearMessages = () => show({ notice: null, error: null, rejected: [], unitErrors: {} });

  function edit(fn: (d: ProcessDraft) => ProcessDraft) {
    const next = fn(draft);
    show({ notice: null });
    setEntry({ base: dirty ? entry.base : fresh, draft: next });
  }

  const editDoc = (fn: (doc: GraphDoc) => GraphDoc | null) => {
    const next = fn(draft.doc);
    if (next) edit((d) => ({ ...d, doc: next }));
  };

  const dropRejected = (id: string) => show({ rejected: ui.rejected.filter((i) => i.entity_id !== id) });

  /** 단계 내용을 고친다(그 단계의 서버 거부 메시지는 지운다) */
  function editStep(id: string, fn: (s: StepDto, n: GraphNode) => StepDto) {
    dropRejected(id);
    edit((d) => ({ ...d, doc: updateStep(d.doc, id, fn) }));
  }
  function setLabel(id: string, label: string) {
    dropRejected(id);
    edit((d) => ({ ...d, doc: updateNode(d.doc, id, (n) => ({ ...n, label })) }));
  }
  function setUnits(which: "raw" | "finished", value: UnitSpecEdit) {
    show({ unitErrors: Object.fromEntries(Object.entries(ui.unitErrors).filter(([k]) => !k.startsWith(`${which}:`))) });
    edit((d) => ({ ...d, [which]: value }));
  }

  /** 단계 추가. 직선이 아니면 추가하지 않고 null을 돌려준다. */
  function add(): string | null {
    const r = addStep(draft.doc);
    if (!r) return null;
    edit((d) => ({ ...d, doc: r.doc }));
    return r.id;
  }

  function handleFailure(e: unknown, phase: "units" | "graph" | "transition", sent?: ReturnType<typeof toGraphIn>) {
    const kind = classifyError(e);
    if (kind === "conflict") {
      show({ conflict: true });
      return;
    }
    if (kind === "validation" && e instanceof ApiError) {
      if (phase === "units") {
        const mapped = mapUnitErrors(e);
        show({
          unitErrors: mapped.byField,
          rejected: mapped.general,
          error: Object.keys(mapped.byField).length === 0 && mapped.general.length === 0 ? e : null,
        });
      } else {
        const issues = phase === "graph" && sent ? mapGraphErrors(e, sent) : toIssues(e);
        show({ rejected: issues, error: issues.length === 0 ? e : null });
      }
      return;
    }
    show({ error: e });
    // 다른 곳에서 상태가 바뀌었다(409): 화면을 서버와 맞춘다.
    if (kind === "state") void writer.fetchLatest(version.id).catch(() => {});
  }

  async function save() {
    if (busy || !dirty) return;
    const { base: b, draft: d } = entry;
    setBusy("saving");
    clearMessages();
    let phase: "units" | "graph" = "units";
    let sent: ReturnType<typeof toGraphIn> | undefined;
    let current = b.version;
    try {
      const rawPatch = buildUnitSpecPatch(b.raw, d.raw);
      const finPatch = buildUnitSpecPatch(b.finished, d.finished);
      if (rawPatch || finPatch) {
        const v = await writer.patchUnits(
          version.id,
          { ...(rawPatch ? { raw_unit_spec: rawPatch } : {}), ...(finPatch ? { finished_unit_spec: finPatch } : {}) },
          current,
        );
        current = v.rowVersion;
        // 단위는 저장됐다: 이후 실패해도 다시 보내지 않도록 base를 맞춘다.
        setEntry({ base: { ...b, version: current, raw: d.raw, finished: d.finished }, draft: d });
      }
      phase = "graph";
      if (docChanged(b.doc, d.doc)) {
        sent = toGraphIn(d.doc);
        await writer.saveGraph(version.id, sent, current);
      }
      setEntry(null);
      show({ hints: [], conflict: false, mergeBlocked: false, notice: "공정을 저장했습니다." });
    } catch (e) {
      handleFailure(e, phase, sent);
    } finally {
      setBusy(null);
    }
  }

  /** 충돌: 내 변경을 버리고 서버의 최신 값으로 다시 불러온다. */
  async function reloadFromServer() {
    clearMessages();
    if (source === "static") {
      setEntry(null);
      show({ conflict: false, hints: [], mergeBlocked: false });
      return;
    }
    try {
      await writer.fetchLatest(version.id);
      setEntry(null);
      show({ conflict: false, hints: [], mergeBlocked: false });
    } catch (e) {
      show({ error: e });
    }
  }

  /** 충돌: 내가 바꾼 단계는 유지하고 안 바꾼 단계는 서버 최신 값으로 맞춘다. 구조가 바뀌었으면 합치지 않는다. */
  async function keepMineAndMerge() {
    if (!entry) return;
    clearMessages();
    if (source === "static") {
      show({ conflict: false });
      return;
    }
    try {
      const latest = await writer.fetchLatest(version.id);
      const serverVersion = Math.max(latest.version.rowVersion, latest.graph.rowVersion);
      const server: ProcessDraft = { doc: latest.graph.doc, raw: latest.version.rawUnitSpec, finished: latest.version.finishedUnitSpec };
      const merged = mergeProcessDraft(entry.base, entry.draft, server);
      if (!merged) {
        show({ mergeBlocked: true });
        return;
      }
      setEntry({ base: { ...server, version: serverVersion }, draft: merged.draft });
      show({ hints: merged.conflicts, conflict: false, mergeBlocked: false });
    } catch (e) {
      show({ error: e });
    }
  }

  async function transition(action: ProcessTransition, reason?: string) {
    if (busy || dirty) return;
    setBusy("transition");
    clearMessages();
    try {
      await writer.transition(version.id, action, freshVersion, reason);
      show({ notice: TRANSITION_NOTICE[action] });
      setValidation(null);
    } catch (e) {
      handleFailure(e, "transition");
    } finally {
      setBusy(null);
    }
  }

  async function validate(scope: ValidateScope) {
    if (busy) return;
    setBusy("validating");
    clearMessages();
    try {
      setValidation(await writer.validate(version.id, scope));
    } catch (e) {
      show({ error: e });
    } finally {
      setBusy(null);
    }
  }

  return {
    draft,
    base,
    dirty,
    busy,
    notice: ui.notice,
    error: ui.error,
    rejected: ui.rejected,
    unitErrors: ui.unitErrors,
    conflict: ui.conflict,
    hints: ui.hints,
    mergeBlocked: ui.mergeBlocked,
    validation,
    /** 서버 저장·전이에 쓰는 현재 버전 번호 */
    currentVersion: freshVersion,
    editStep,
    setLabel,
    setUnits,
    editDoc,
    add,
    remove: (id: string) => editDoc((doc) => removeStep(doc, id)),
    move: (id: string, delta: -1 | 1) => editDoc((doc) => moveStep(doc, id, delta)),
    setNext: (id: string, next: NextLocation) => editDoc((doc) => setNextLocation(doc, id, next)),
    save,
    reset: () => {
      setEntry(null);
      show({ hints: [], rejected: [], unitErrors: {}, error: null, notice: null });
    },
    reloadFromServer,
    keepMineAndMerge,
    transition,
    validate,
  };
}
