import { useState } from "react";
import { useDataSource } from "../../shared/api/ApiContext";
import { ApiError, classifyError } from "../../shared/api/errors";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import { buildProductPatch, mapProductErrors, mergeProductDraft } from "./productDraft";
import { toProductDraft, type ProductDraft, type ProductField, type ProductView } from "./productView";
import { useProductWriter } from "./writer";

type FieldMap = Partial<Record<ProductField, string>>;

/**
 * 제품 기본 정보의 입력·저장 상태(자산 기본 정보 편집과 같은 규칙).
 * - base: 편집을 시작한 시점(또는 마지막 저장·재조회)의 서버 값과 row_version. If-Match는 항상 이 버전이다.
 *   조회 캐시가 백그라운드로 바뀌어도 사용자가 확인하기 전까지 base를 바꾸지 않는다(조용한 덮어쓰기 방지).
 * - 저장은 바꾼 필드만 보내고 결과 응답으로 base를 갱신한다. 412는 항목 단위 3-way 병합이며 저장은 사용자가 다시 누른다.
 */
export function useProductEditor(product: ProductView, projectId: string, previewConflict: boolean) {
  const source = useDataSource();
  const writer = useProductWriter(projectId);

  const [base, setBase] = useState(() => ({ draft: toProductDraft(product), version: product.rowVersion }));
  const [draft, setDraft] = useState<ProductDraft>(base.draft);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldMap>({});
  const [general, setGeneral] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [conflict, setConflict] = useState(previewConflict);
  const [hints, setHints] = useState<FieldMap>({});

  const dirty = JSON.stringify(draft) !== JSON.stringify(base.draft);

  function clearMessages() {
    setFieldErrors({});
    setGeneral([]);
    setError(null);
  }

  /** 입력 변경. 그 필드의 서버 오류·충돌 안내는 사용자가 고치기 시작하면 지운다. */
  function edit(patch: Partial<ProductDraft>) {
    setDraft((cur) => ({ ...cur, ...patch }));
    setSaved(false);
    const touched: ProductField[] = [];
    if ("code" in patch) touched.push("code");
    if ("name" in patch) touched.push("name");
    if ("specification" in patch || "specUnknown" in patch) touched.push("specification");
    if ("notes" in patch) touched.push("notes");
    const clear = (cur: FieldMap) =>
      touched.some((k) => k in cur) ? { ...cur, ...Object.fromEntries(touched.map((k) => [k, undefined])) } : cur;
    setFieldErrors(clear);
    setHints(clear);
  }

  function handleFailure(e: unknown) {
    const kind = classifyError(e);
    if (kind === "conflict") {
      setConflict(true);
      return;
    }
    if ((kind === "duplicate" || kind === "validation") && e instanceof ApiError) {
      const mapped = mapProductErrors(e);
      setFieldErrors(mapped.fields);
      setGeneral(mapped.general);
      if (Object.keys(mapped.fields).length === 0 && mapped.general.length === 0) setError(e);
      return;
    }
    setError(e);
  }

  async function save() {
    if (saving) return; // 저장 중 중복 전송 방지
    const patch = buildProductPatch(base.draft, draft);
    if (!patch) return;
    setSaving(true);
    setSaved(false);
    clearMessages();
    try {
      const latest = await writer.update(product.id, patch, base.version);
      const next = toProductDraft(latest);
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
      const latest = await writer.fetchLatest(product.id);
      const next = toProductDraft(latest);
      setBase({ draft: next, version: latest.rowVersion });
      setDraft(next);
      setHints({});
      setConflict(false);
    } catch (e) {
      setError(e);
    }
  }

  /** 충돌: 내가 바꾼 필드는 유지하고 안 바꾼 필드는 서버 최신 값으로 맞춘다. 저장은 하지 않는다. */
  async function keepMineAndMerge() {
    clearMessages();
    if (source === "static") {
      setConflict(false);
      return;
    }
    try {
      const latest = await writer.fetchLatest(product.id);
      const server = toProductDraft(latest);
      const merged = mergeProductDraft(base.draft, draft, server);
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
      setDraft(base.draft);
      setHints({});
      clearMessages();
      setSaved(false);
    },
  };
}
