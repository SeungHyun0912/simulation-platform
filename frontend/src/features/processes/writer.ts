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
import { graphKey, versionKey, versionListKey } from "./queries";

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
      /** 새 초안. 승인본이 있으면 서버가 그래프를 새 id로 복사한다. 열린 버전이 있으면 409 PROCESS_DRAFT_EXISTS. */
      async createDraft(productId: string): Promise<ProcessVersionView> {
        const r = await client.post<Schemas["Single_ProcessVersionOut_"]>(`/projects/${projectId}/products/${productId}/process-versions`);
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
