import { useState } from "react";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiError, classifyError } from "../../shared/api/errors";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import { toInfoDraft, type AssetInfo, type InfoDraft } from "./assetView";
import { buildAssetPatch, mapServerErrors, mergeInfoDraft } from "./infoDraft";
import { useAssetWriter } from "./writer";

type FieldMap = Partial<Record<keyof InfoDraft, string>>;

/**
 * 자산 기본 정보의 입력·저장 상태. 버전(용량·규칙)과 별개의 리소스이므로 ETag·충돌·저장도 따로 둔다.
 * - base: 편집을 시작한 시점(또는 마지막 저장·재조회)의 서버 값과 row_version. If-Match는 항상 이 버전이다.
 *   조회 캐시가 백그라운드로 바뀌어도 base는 사용자가 확인하기 전까지 바꾸지 않는다(조용한 덮어쓰기 방지).
 * - 저장은 바꾼 필드만 보내고, 결과 응답으로 base를 갱신한다.
 */
export function useInfoEditor(asset: AssetInfo, projectId: string, previewConflict: boolean) {
  const source = useDataSource();
  const writer = useAssetWriter(projectId);

  const [base, setBase] = useState(() => ({ draft: toInfoDraft(asset), version: asset.rowVersion }));
  const [info, setInfo] = useState<InfoDraft>(base.draft);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldMap>({});
  const [general, setGeneral] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [conflict, setConflict] = useState(previewConflict);
  const [hints, setHints] = useState<FieldMap>({});

  const dirty = JSON.stringify(info) !== JSON.stringify(base.draft);

  function clearMessages() {
    setFieldErrors({});
    setGeneral([]);
    setError(null);
  }

  /** 입력 변경. 그 필드의 서버 오류·충돌 안내는 사용자가 고치기 시작하면 지운다. */
  function edit<K extends keyof InfoDraft>(key: K, value: InfoDraft[K]) {
    setInfo((cur) => ({ ...cur, [key]: value }));
    setSaved(false);
    setFieldErrors((cur) => (key in cur ? { ...cur, [key]: undefined } : cur));
    setHints((cur) => (key in cur ? { ...cur, [key]: undefined } : cur));
  }

  function handleFailure(e: unknown) {
    const kind = classifyError(e);
    if (kind === "conflict") {
      setConflict(true);
      return;
    }
    if ((kind === "duplicate" || kind === "validation") && e instanceof ApiError) {
      const mapped = mapServerErrors(e);
      setFieldErrors(mapped.fields);
      setGeneral(mapped.general);
      if (Object.keys(mapped.fields).length === 0 && mapped.general.length === 0) setError(e);
      return;
    }
    setError(e);
  }

  async function save() {
    if (saving) return; // 저장 중 중복 전송 방지
    const patch = buildAssetPatch(base.draft, info, asset.kind);
    if (!patch) return;
    setSaving(true);
    setSaved(false);
    clearMessages();
    try {
      const latest = await writer.update(asset.id, patch, base.version);
      const draft = toInfoDraft(latest);
      setBase({ draft, version: latest.rowVersion });
      setInfo(draft);
      setHints({});
      setSaved(true);
    } catch (e) {
      handleFailure(e);
    } finally {
      setSaving(false);
    }
  }

  /** 충돌: 내 변경을 버리고 서버의 최신 값으로 다시 불러온다. */
  async function reloadFromServer() {
    clearMessages();
    if (source === "static") {
      setInfo(base.draft);
      setConflict(false);
      return;
    }
    try {
      const latest = await writer.fetchLatest(asset.id);
      const draft = toInfoDraft(latest);
      setBase({ draft, version: latest.rowVersion });
      setInfo(draft);
      setHints({});
      setConflict(false);
    } catch (e) {
      setError(e);
    }
  }

  /**
   * 충돌: 내가 바꾼 필드는 유지하고 안 바꾼 필드는 서버 최신 값으로 맞춘다. 같은 필드를 서버도 바꿨다면 서버 값을 안내한다.
   * 이 시점에는 저장하지 않고, 병합 결과를 확인한 뒤 새 버전으로 다시 저장한다.
   */
  async function keepMineAndMerge() {
    clearMessages();
    if (source === "static") {
      setConflict(false);
      return;
    }
    try {
      const latest = await writer.fetchLatest(asset.id);
      const server = toInfoDraft(latest);
      const merged = mergeInfoDraft(base.draft, info, server);
      setBase({ draft: server, version: latest.rowVersion });
      setInfo(merged.draft);
      setHints(merged.conflicts);
      setConflict(false);
    } catch (e) {
      setError(e);
    }
  }

  return {
    info,
    edit,
    dirty,
    saving,
    saved,
    save,
    fieldErrors,
    general,
    error,
    conflict,
    hints,
    reloadFromServer,
    keepMineAndMerge,
    /** 되돌리기: 입력을 마지막 서버 값으로 */
    reset: () => {
      setInfo(base.draft);
      setHints({});
      clearMessages();
      setSaved(false);
    },
  };
}
