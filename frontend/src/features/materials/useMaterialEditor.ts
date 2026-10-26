import { useState } from "react";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiError, classifyError } from "../../shared/api/errors";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import type { UnitSpecEdit, UnitSpecField } from "../processes/processView";
import { buildMaterialPatch, mapMaterialErrors, mergeMaterialDraft } from "./materialDraft";
import { toMaterialDraft, type MaterialDraft, type MaterialField, type MaterialView } from "./materialView";
import { useMaterialWriter } from "./writer";

type FieldMap = Partial<Record<MaterialField, string>>;
type SpecMap = Partial<Record<UnitSpecField, string>>;

const sameDraft = (a: MaterialDraft, b: MaterialDraft) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 재료 기본 정보·기본 규격의 입력·저장 상태(제품·자산 기본 정보 편집과 같은 규칙).
 * - base: 편집을 시작한 시점(또는 마지막 저장·재조회)의 서버 값과 row_version. If-Match는 항상 이 버전이다.
 *   조회 캐시가 백그라운드로 바뀌어도 사용자가 확인하기 전까지 base를 바꾸지 않는다(조용한 덮어쓰기 방지).
 * - 저장은 바꾼 필드만 보내고(기본 규격은 바꾼 값만) 결과 응답으로 base를 갱신한다. 412는 항목 단위 3-way 병합이며 저장은 사용자가 다시 누른다.
 */
export function useMaterialEditor(material: MaterialView, projectId: string, previewConflict: boolean) {
  const source = useDataSource();
  const writer = useMaterialWriter(projectId);

  const [base, setBase] = useState(() => ({ draft: toMaterialDraft(material), version: material.rowVersion }));
  const [draft, setDraft] = useState<MaterialDraft>(base.draft);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldMap>({});
  const [specErrors, setSpecErrors] = useState<SpecMap>({});
  const [general, setGeneral] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [conflict, setConflict] = useState(previewConflict);
  const [hints, setHints] = useState<Record<string, string>>({});

  const dirty = !sameDraft(draft, base.draft);

  function clearMessages() {
    setFieldErrors({});
    setSpecErrors({});
    setGeneral([]);
    setError(null);
  }

  /** 입력 변경. 그 항목의 서버 오류·충돌 안내는 사용자가 고치기 시작하면 지운다. */
  function edit(patch: Partial<Omit<MaterialDraft, "spec">>) {
    setDraft((cur) => ({ ...cur, ...patch }));
    setSaved(false);
    const keys = Object.keys(patch);
    setFieldErrors((cur) => (keys.some((k) => k in cur) ? { ...cur, ...Object.fromEntries(keys.map((k) => [k, undefined])) } : cur));
    setHints((cur) => Object.fromEntries(Object.entries(cur).filter(([k]) => !keys.includes(k))));
  }

  function editSpec(spec: UnitSpecEdit) {
    setDraft((cur) => ({ ...cur, spec }));
    setSaved(false);
    // 값이 바뀐 규격 입력의 서버 오류·충돌 안내만 지운다
    setSpecErrors((cur) =>
      Object.fromEntries(Object.entries(cur).filter(([k]) => JSON.stringify(spec[k as UnitSpecField]) === JSON.stringify(draft.spec[k as UnitSpecField]))),
    );
    setHints((cur) =>
      Object.fromEntries(
        Object.entries(cur).filter(([k]) => !k.startsWith("spec:") || JSON.stringify(spec[k.slice(5) as UnitSpecField]) === JSON.stringify(draft.spec[k.slice(5) as UnitSpecField])),
      ),
    );
  }

  function handleFailure(e: unknown) {
    const kind = classifyError(e);
    if (kind === "conflict") {
      setConflict(true);
      return;
    }
    if ((kind === "duplicate" || kind === "validation") && e instanceof ApiError) {
      const mapped = mapMaterialErrors(e);
      setFieldErrors(mapped.fields);
      setSpecErrors(mapped.spec);
      setGeneral(mapped.general);
      if (Object.keys(mapped.fields).length + Object.keys(mapped.spec).length + mapped.general.length === 0) setError(e);
      return;
    }
    setError(e);
  }

  async function save() {
    if (saving) return; // 저장 중 중복 전송 방지
    const patch = buildMaterialPatch(base.draft, draft);
    if (!patch) return;
    setSaving(true);
    setSaved(false);
    clearMessages();
    try {
      const latest = await writer.update(material.id, patch, base.version);
      const next = toMaterialDraft(latest);
      setBase({ draft: next, version: latest.rowVersion });
      setDraft(next);
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
      setDraft(base.draft);
      setConflict(false);
      return;
    }
    try {
      const latest = await writer.fetchLatest(material.id);
      const next = toMaterialDraft(latest);
      setBase({ draft: next, version: latest.rowVersion });
      setDraft(next);
      setHints({});
      setConflict(false);
    } catch (e) {
      setError(e);
    }
  }

  /** 충돌: 내가 바꾼 항목은 유지하고 안 바꾼 항목은 서버 최신 값으로 맞춘다. 저장은 하지 않는다. */
  async function keepMineAndMerge() {
    clearMessages();
    if (source === "static") {
      setConflict(false);
      return;
    }
    try {
      const latest = await writer.fetchLatest(material.id);
      const server = toMaterialDraft(latest);
      const merged = mergeMaterialDraft(base.draft, draft, server);
      setBase({ draft: server, version: latest.rowVersion });
      setDraft(merged.draft);
      setHints(merged.conflicts);
      setConflict(false);
    } catch (e) {
      setError(e);
    }
  }

  return {
    draft,
    edit,
    editSpec,
    dirty,
    saving,
    saved,
    save,
    fieldErrors,
    specErrors,
    general,
    error,
    conflict,
    hints,
    reloadFromServer,
    keepMineAndMerge,
    /** 되돌리기: 입력을 마지막 서버 값으로 */
    reset: () => {
      setDraft(base.draft);
      setHints({});
      clearMessages();
      setSaved(false);
    },
  };
}
