import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";
import type { ValidationIssue } from "../../shared/components/ValidationPanel";
import type { GraphIn } from "./processDoc";
import {
  toGraphView,
  toListItem,
  toIssue,
  toProcessVersionView,
  type DefaultSpecPatch,
  type ProcessGraphView,
  type ProcessVersionListItem,
  type ProcessVersionView,
} from "./processView";
import { editorStateKey, graphKey, toEditorStateView, versionKey, versionListKey, type EditorStateView } from "./queries";

export type ProcessTransition = "submit" | "approve" | "reject";
export type ValidateScope = "knowledge" | "run_template";
export type ValidationResult = { scope: ValidateScope; errorCount: number; warningCount: number; issues: ValidationIssue[] };

/**
 * 공정 버전 쓰기 호출과 캐시 갱신. 그래프 저장·단계·단위 수정·전이는 모두 같은 버전 `row_version`(If-Match)을 올리므로
 * 성공할 때마다 버전·그래프 캐시를 응답으로 맞추고 목록·제품 요약은 다시 불러오게 한다.
 * 실패는 그대로 던진다(자동 재시도 없음: 요청이 처리됐는지 알 수 없을 수 있다).
 */
export function useProcessWriter(projectId: string) {
  const client = useApiClient();
  const source = useDataSource();
  const qc = useQueryClient();

  return useMemo(() => {
    const base = `/projects/${projectId}/process-versions`;

    function refreshSummaries(productId: string | null) {
      if (productId) void qc.invalidateQueries({ queryKey: versionListKey(projectId, source, productId) });
      void qc.invalidateQueries({ queryKey: projectKey(projectId, source, "product") });
      void qc.invalidateQueries({ queryKey: projectKey(projectId, source, "products") });
    }

    function putVersion(v: ProcessVersionView) {
      qc.setQueryData(versionKey(projectId, source, v.id), v);
      refreshSummaries(v.productId);
    }

    return {
      /**
       * 화면 좌표 저장(전체 교체). 공정 버전의 상태·row_version·승인과 무관하며 승인본에도 저장된다. 자체 ETag(`rowVersion`)를 If-Match로
       * 보낸다(저장 전 0). 키는 서버에 저장된 노드 id여야 한다(없는 id는 422 VAL-REF-005)이므로 호출 전에 그래프를 저장해 둔다.
       */
      async saveEditorState(versionId: string, state: Pick<EditorStateView, "positions" | "viewport">, rowVersion: number): Promise<EditorStateView> {
        const r = await client.put<Schemas["Single_EditorStateOut_"]>(`${base}/${versionId}/editor-state`, {
          body: { node_positions: state.positions, viewport: state.viewport },
          ifMatch: rowVersion,
        });
        const v = toEditorStateView(r.body.data);
        qc.setQueryData(editorStateKey(projectId, source, versionId), v);
        return v;
      },

      /** 서버의 최신 화면 좌표(충돌 후 다시 불러오기). */
      async fetchEditorState(versionId: string): Promise<EditorStateView> {
        const r = await client.get<Schemas["Single_EditorStateOut_"]>(`${base}/${versionId}/editor-state`);
        const v = toEditorStateView(r.body.data);
        qc.setQueryData(editorStateKey(projectId, source, versionId), v);
        return v;
      },

      /** 새 초안. 승인본이 있으면 서버가 그래프를 새 id로 복사한다. 열린 버전이 있으면 409 PROCESS_DRAFT_EXISTS. */
      async createDraft(productId: string, baseVersionId?: string): Promise<ProcessVersionView> {
        // 기준 버전을 고르면(0.5.0 base_version_id) 그 버전을 복사하고, 생략하면 서버가 현재 승인본을 복사한다.
        const r = await client.post<Schemas["Single_ProcessVersionOut_"]>(`/projects/${projectId}/products/${productId}/process-versions`, {
          ...(baseVersionId ? { body: { base_version_id: baseVersionId } } : {}),
        });
        const v = toProcessVersionView(r.body.data);
        putVersion(v);
        void qc.invalidateQueries({ queryKey: graphKey(projectId, source, v.id) });
        return v;
      },

      /** 제품의 공정 버전 목록을 서버에서 다시 받아 캐시를 맞춘다(열린 버전을 찾을 때). */
      async listVersions(productId: string): Promise<ProcessVersionListItem[]> {
        const r = await client.get<Schemas["ListOut_ProcessVersionListItem_"]>(`/projects/${projectId}/products/${productId}/process-versions`, {
          query: { limit: 200 },
        });
        const list = r.body.data.map(toListItem);
        qc.setQueryData(versionListKey(projectId, source, productId), list);
        return list;
      },

      /** 그래프 전체 교체. 오류가 하나라도 있으면 서버는 아무것도 저장하지 않는다. */
      async saveGraph(versionId: string, graph: GraphIn, version: number): Promise<ProcessGraphView> {
        const r = await client.put<Schemas["Single_GraphOut_"]>(`${base}/${versionId}/graph`, { body: graph, ifMatch: version });
        const g = toGraphView(r.body.data);
        qc.setQueryData(graphKey(projectId, source, versionId), g);
        // 같은 row_version을 쓰는 버전 캐시도 맞춘다(다음 저장의 If-Match).
        qc.setQueryData<ProcessVersionView>(versionKey(projectId, source, versionId), (cur) =>
          cur ? { ...cur, rowVersion: g.rowVersion, issues: g.issues } : cur,
        );
        refreshSummaries(null);
        return g;
      },

      /**
       * 단계 하나만 수정(PATCH /steps/{id}). 보낸 최상위 필드만 통째로 교체하고 다른 노드·간선은 건드리지 않는다.
       * If-Match는 공정 버전의 row_version이며 성공하면 그 값이 오른다. 응답에 검증 항목이 없어 그래프 캐시의 그 노드만 고치고
       * 검증 결과는 다시 불러온다(화면이 깜박이지 않게 노드를 먼저 바꾼다).
       */
      async patchStep(versionId: string, stepId: string, body: Schemas["StepPatch"], version: number): Promise<{ rowVersion: number; node: { label: string; step: Schemas["StepDto"] } }> {
        const r = await client.patch<Schemas["Single_StepOut_"]>(`${base}/${versionId}/steps/${stepId}`, { body, ifMatch: version });
        const out = r.body.data;
        const rowVersion = out.row_version;
        qc.setQueryData<ProcessGraphView>(graphKey(projectId, source, versionId), (cur) =>
          cur
            ? { ...cur, rowVersion, doc: { ...cur.doc, nodes: cur.doc.nodes.map((n) => (n.id === stepId ? { ...n, label: out.label, step: out.step } : n)) } }
            : cur,
        );
        qc.setQueryData<ProcessVersionView>(versionKey(projectId, source, versionId), (cur) => (cur ? { ...cur, rowVersion } : cur));
        void qc.invalidateQueries({ queryKey: graphKey(projectId, source, versionId) });
        return { rowVersion, node: { label: out.label, step: out.step } };
      },

      /** 원자재·완제품 단위 수정(보낸 필드만 교체). */
      async patchUnits(
        versionId: string,
        patch: { raw_unit_spec?: DefaultSpecPatch; finished_unit_spec?: DefaultSpecPatch },
        version: number,
      ): Promise<ProcessVersionView> {
        const r = await client.patch<Schemas["Single_ProcessVersionOut_"]>(`${base}/${versionId}`, { body: patch, ifMatch: version });
        const v = toProcessVersionView(r.body.data);
        putVersion(v);
        qc.setQueryData<ProcessGraphView>(graphKey(projectId, source, versionId), (cur) =>
          cur ? { ...cur, rowVersion: v.rowVersion, issues: v.issues } : cur,
        );
        return v;
      },

      /** 제출·승인·반려. If-Match 필수, 반려는 사유 필수, 구조 오류가 있으면 제출·승인은 422 PROCESS_VALIDATION_FAILED. */
      async transition(versionId: string, action: ProcessTransition, version: number, reason?: string): Promise<ProcessVersionView> {
        const r = await client.post<Schemas["Single_ProcessVersionOut_"]>(`${base}/${versionId}/${action}`, {
          ifMatch: version,
          body: action === "reject" ? { reason } : undefined,
        });
        const v = toProcessVersionView(r.body.data);
        putVersion(v);
        // 승인 시 이전 승인본이 대체됨으로 바뀌고 반려는 초안으로 돌아가므로 그래프도 서버 값으로 다시 맞춘다.
        void qc.invalidateQueries({ queryKey: graphKey(projectId, source, versionId) });
        return v;
      },

      /** 서버의 최신 버전·그래프(충돌 후 다시 불러오기). 캐시도 함께 갱신한다. */
      async fetchLatest(versionId: string): Promise<{ version: ProcessVersionView; graph: ProcessGraphView }> {
        const [v, g] = await Promise.all([
          client.get<Schemas["Single_ProcessVersionOut_"]>(`${base}/${versionId}`),
          client.get<Schemas["Single_GraphOut_"]>(`${base}/${versionId}/graph`),
        ]);
        const version = toProcessVersionView(v.body.data);
        const graph = toGraphView(g.body.data);
        qc.setQueryData(versionKey(projectId, source, versionId), version);
        qc.setQueryData(graphKey(projectId, source, versionId), graph);
        return { version, graph };
      },

      /** 검증 실행. 오류가 있어도 정상 수행이면 200이며 서버는 아무것도 저장하지 않는다. */
      async validate(versionId: string, scope: ValidateScope): Promise<ValidationResult> {
        const r = await client.post<Schemas["Single_ValidationOut_"]>(`${base}/${versionId}/validate`, { query: { scope } });
        const d = r.body.data;
        return { scope: d.scope, errorCount: d.error_count, warningCount: d.warning_count, issues: d.issues.map(toIssue) };
      },
    };
  }, [client, source, qc, projectId]);
}
