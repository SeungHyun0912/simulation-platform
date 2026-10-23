import { useState } from "react";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiError, classifyError } from "../../shared/api/errors";
import type { KnownValue } from "../../shared/components/KnownValueInput";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import {
  isOpenStatus,
  toRevisionEdit,
  type DispatchRule,
  type ReleaseRule,
  type RevisionDetail,
  type RevisionEdit,
} from "./assetView";
import { buildRevisionPatch, mapRevisionErrors, mergeRevisionEdit, type EditKey } from "./revisionPatch";
import { useRevisionWriter, type TransitionAction } from "./writer";

/** 버전 하나의 편집 상태. base는 편집을 시작한(또는 마지막 저장·재조회한) 서버 값과 row_version이다. */
type Entry = { base: RevisionEdit; version: number; draft: RevisionEdit };

/** 화면에 보이는 메시지·충돌 상태. 어느 버전 것인지(forId)를 함께 담아, 다른 버전으로 옮기면 저절로 비워진다. */
type Ui = {
  forId: string;
  notice: string | null;
  error: unknown;
  fieldErrors: Partial<Record<EditKey, string>>;
  general: ValidationIssue[];
  conflict: boolean;
  hints: EditKey[];
};

const TRANSITION_NOTICE: Record<TransitionAction, string> = {
  submit: "검토를 요청했습니다.",
  approve: "승인했습니다.",
  reject: "반려했습니다. 이 버전은 초안으로 돌아갔습니다.",
};

const emptyUi = (forId: string, conflict: boolean): Ui => ({
  forId,
  notice: null,
  error: null,
  fieldErrors: {},
  general: [],
  conflict,
  hints: [],
});

const clean = (rev: RevisionDetail): Entry => {
  const e = toRevisionEdit(rev);
  return { base: e, version: rev.rowVersion, draft: e };
};

const isDirty = (e: Entry) => JSON.stringify(e.draft) !== JSON.stringify(e.base);

/**
 * 자산 버전(용량·규칙)의 입력·저장·전이 상태. 자산 기본 정보와 ETag·충돌·저장이 따로다.
 * - 저장은 바꾼 값만 보내고 If-Match는 **편집을 시작한 시점의 버전**이다. 입력한 변경이 있는 동안에는
 *   조회 캐시가 백그라운드로 바뀌어도 base를 바꾸지 않는다(조용한 덮어쓰기 방지). 변경이 없으면 항상 서버 값을 쓴다.
 * - 412 충돌 후 "내 변경 유지"는 항목 단위 3-way 병합이며 저장은 사용자가 다시 누른다.
 * - 제출·승인·반려는 저장되지 않은 변경이 없을 때만 가능하다(저장된 값이 검토 대상이어야 한다).
 * 버전은 여러 개를 오가며 볼 수 있어, 입력 중인 편집본은 버전별로 보관한다.
 */
export function useRevisionEditor(args: {
  projectId: string;
  assetId: string;
  selected: RevisionDetail | null;
  previewConflict: boolean;
  /** 새 초안을 만들었거나 열린 버전으로 이동해야 할 때 화면이 선택을 바꾼다 */
  onSelect: (revisionId: string) => void;
}) {
  const { projectId, assetId, selected, previewConflict, onSelect } = args;
  const source = useDataSource();
  const writer = useRevisionWriter(projectId);

  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [busy, setBusy] = useState<null | "saving" | "transition" | "creating">(null);
  const [ui, setUi] = useState<Ui>(() => emptyUi("", false));

  const id = selected?.id ?? "";
  const fresh = selected ? clean(selected) : null;
  const dirtyIds = Object.entries(entries)
    .filter(([, e]) => isDirty(e))
    .map(([k]) => k);
  const dirty = id !== "" && dirtyIds.includes(id);
  const entry = dirty ? entries[id]! : fresh;

  // 다른 버전의 메시지는 보이지 않는다. 미리보기 충돌은 처음 그 버전을 볼 때만 켜진다.
  const view = ui.forId === id ? ui : emptyUi(id, previewConflict);

  /** 지금 보는 버전(또는 지정한 버전)의 메시지 상태를 바꾼다 */
  function show(partial: Partial<Omit<Ui, "forId">>, forId = id) {
    setUi((cur) => ({
      ...(cur.forId === forId ? cur : emptyUi(forId, forId === id ? previewConflict : false)),
      ...partial,
    }));
  }
  const clearMessages = () => show({ notice: null, error: null, fieldErrors: {}, general: [] });

  function change(fn: (draft: RevisionEdit) => RevisionEdit) {
    if (!selected || !fresh) return;
    show({ notice: null });
    setEntries((cur) => {
      const stored = cur[selected.id];
      const e = stored && isDirty(stored) ? stored : fresh;
      return { ...cur, [selected.id]: { ...e, draft: fn(e.draft) } };
    });
  }

  const clearField = (key: EditKey) =>
    show({
      fieldErrors: { ...view.fieldErrors, [key]: undefined },
      hints: view.hints.filter((k) => k !== key),
    });

  function setCapacity(portId: string, capacity: KnownValue) {
    clearField(`${portId}:capacity`);
    change((d) => ({ ...d, ports: { ...d.ports, [portId]: { ...d.ports[portId]!, capacity } } }));
  }
  function setDispatch(portId: string, dispatch: DispatchRule) {
    clearField(`${portId}:dispatch`);
    change((d) => ({ ...d, ports: { ...d.ports, [portId]: { ...d.ports[portId]!, dispatch } } }));
  }
  function setRelease(portId: string, release: ReleaseRule) {
    clearField(`${portId}:release`);
    change((d) => ({ ...d, ports: { ...d.ports, [portId]: { ...d.ports[portId]!, release } } }));
  }
  function setStorage(storageCapacity: KnownValue) {
    clearField("storage");
    change((d) => ({ ...d, storageCapacity }));
  }

  function dropEntry(revisionId: string) {
    setEntries((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => k !== revisionId)));
  }
  function discard() {
    if (selected) dropEntry(selected.id);
  }

  function handleFailure(e: unknown, sent: ReturnType<typeof buildRevisionPatch> = null) {
    const kind = classifyError(e);
    if (kind === "conflict") {
      show({ conflict: true });
      return;
    }
    if (kind === "validation" && e instanceof ApiError) {
      const mapped = mapRevisionErrors(e, sent);
      show({
        fieldErrors: mapped.byKey,
        general: mapped.general,
        error: Object.keys(mapped.byKey).length === 0 && mapped.general.length === 0 ? e : null,
      });
      return;
    }
    show({ error: e });
    // 다른 곳에서 상태가 바뀌었다(409): 화면의 버전 상태를 서버와 맞춘다.
    if (kind === "state") void writer.refreshAll(assetId).catch(() => {});
  }

  async function save() {
    if (busy || !selected || !entry) return;
    const patch = buildRevisionPatch(entry.base, entry.draft);
    if (!patch) return;
    setBusy("saving");
    clearMessages();
    try {
      const rev = await writer.update(assetId, selected.id, patch, entry.version);
      dropEntry(rev.id);
      show({ hints: [], notice: "용량·규칙을 저장했습니다." });
    } catch (e) {
      handleFailure(e, patch);
    } finally {
      setBusy(null);
    }
  }

  /** 충돌: 내 변경을 버리고 서버의 최신 값으로 다시 불러온다. */
  async function reloadFromServer() {
    if (!selected) return;
    clearMessages();
    if (source === "static") {
      discard();
      show({ conflict: false });
      return;
    }
    try {
      await writer.fetchLatest(assetId, selected.id);
      discard();
      show({ hints: [], conflict: false });
    } catch (e) {
      show({ error: e });
    }
  }

  /** 충돌: 내가 바꾼 항목은 유지하고 안 바꾼 항목은 서버 최신 값으로 맞춘다. 저장은 하지 않는다. */
  async function keepMineAndMerge() {
    if (!selected || !entry) return;
    clearMessages();
    if (source === "static") {
      show({ conflict: false });
      return;
    }
    try {
      const rev = await writer.fetchLatest(assetId, selected.id);
      const server = toRevisionEdit(rev);
      const merged = mergeRevisionEdit(entry.base, entry.draft, server);
      setEntries((cur) => ({ ...cur, [selected.id]: { base: server, version: rev.rowVersion, draft: merged.draft } }));
      show({ hints: merged.conflicts, conflict: false });
    } catch (e) {
      show({ error: e });
    }
  }

  async function transition(action: TransitionAction, reason?: string) {
    if (busy || !selected || !entry || dirty) return;
    setBusy("transition");
    clearMessages();
    try {
      await writer.transition(assetId, selected.id, action, entry.version, reason);
      show({ notice: TRANSITION_NOTICE[action] });
    } catch (e) {
      handleFailure(e);
    } finally {
      setBusy(null);
    }
  }

  /** 새 초안. 열린 버전이 이미 있으면(409) 그 버전으로 이동한다. */
  async function createDraft() {
    if (busy) return;
    setBusy("creating");
    clearMessages();
    try {
      const rev = await writer.createDraft(assetId);
      show({ notice: "새 초안을 만들었습니다." }, rev.id);
      onSelect(rev.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "REVISION_DRAFT_EXISTS") {
        try {
          const list = await writer.refreshAll(assetId);
          const open = list.find((r) => isOpenStatus(r.status));
          if (open) {
            show({ notice: "이미 열린 버전이 있어 그 버전으로 이동했습니다." }, open.id);
            onSelect(open.id);
            return;
          }
        } catch (e2) {
          show({ error: e2 });
          return;
        }
      }
      show({ error: e });
    } finally {
      setBusy(null);
    }
  }

  return {
    edit: entry?.draft ?? null,
    dirty,
    /** 저장하지 않은 변경이 있는 모든 버전(화면 이동 보호용) */
    anyDirty: dirtyIds.length > 0,
    busy,
    notice: view.notice,
    error: view.error,
    fieldErrors: view.fieldErrors,
    general: view.general,
    conflict: view.conflict,
    hints: view.hints,
    setCapacity,
    setDispatch,
    setRelease,
    setStorage,
    save,
    reset: () => {
      discard();
      show({ notice: null, error: null, fieldErrors: {}, general: [], hints: [] });
    },
    reloadFromServer,
    keepMineAndMerge,
    transition,
    createDraft,
  };
}
