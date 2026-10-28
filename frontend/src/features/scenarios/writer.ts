import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import type { Schemas } from "../../shared/api/types";
import { scenarioKey, scenarioListKey, scenarioVersionKey, scenarioVersionsKey } from "./queries";
import { toScenarioView, toVersionView, type ScenarioVersionView, type ScenarioView } from "./scenarioView";

/**
 * 시나리오 쓰기 호출과 캐시 갱신. 화면은 이 함수만 거치고 fetch·If-Match를 직접 다루지 않는다.
 * 실패는 그대로 던진다(자동 재시도 없음: 요청이 처리됐는지 알 수 없을 수 있다).
 */
export function useScenarioWriter(projectId: string) {
  const client = useApiClient();
  const source = useDataSource();
  const qc = useQueryClient();

  return useMemo(() => {
    const base = `/projects/${projectId}`;
    const refreshLists = (scenarioId: string) => {
      void qc.invalidateQueries({ queryKey: scenarioListKey(projectId, source) });
      void qc.invalidateQueries({ queryKey: scenarioVersionsKey(projectId, source, scenarioId) });
      void qc.invalidateQueries({ queryKey: scenarioKey(projectId, source, scenarioId) });
    };
    const store = (v: ScenarioVersionView) => qc.setQueryData(scenarioVersionKey(projectId, source, v.id), v);

    return {
      /** 시나리오 생성은 첫 초안(version 1, 비어 있음)을 함께 만든다. */
      async createScenario(body: Schemas["ScenarioCreate"]): Promise<ScenarioView> {
        const r = await client.post<Schemas["Single_ScenarioOut_"]>(`${base}/scenarios`, { body });
        void qc.invalidateQueries({ queryKey: scenarioListKey(projectId, source) });
        return toScenarioView(r.body.data);
      },

      /** 새 초안. `fromVersionId`를 생략하면 서버가 가장 최근 승인 버전을 복사한다. 시나리오당 초안 하나(409 SCENARIO_DRAFT_EXISTS). */
      async createDraft(scenarioId: string, fromVersionId?: string): Promise<ScenarioVersionView> {
        const r = await client.post<Schemas["Single_ScenarioVersionOut_"]>(`${base}/scenarios/${scenarioId}/versions`, {
          body: fromVersionId ? { from_version_id: fromVersionId } : {},
        });
        const v = toVersionView(r.body.data);
        store(v);
        refreshLists(scenarioId);
        return v;
      },

      /** 바꾼 최상위 필드만 PATCH. version은 편집을 시작한 시점의 row_version(If-Match). */
      async patchVersion(versionId: string, patch: Schemas["ScenarioVersionPatch"], version: number): Promise<ScenarioVersionView> {
        const r = await client.patch<Schemas["Single_ScenarioVersionOut_"]>(`${base}/scenario-versions/${versionId}`, { body: patch, ifMatch: version });
        const v = toVersionView(r.body.data);
        store(v);
        refreshLists(v.scenarioId);
        return v;
      },

      /** 실행 사전검증. 저장하지 않으며 오류가 있어도 200이다. */
      async validate(versionId: string): Promise<Schemas["PrecheckOut"]> {
        return (await client.post<Schemas["Single_PrecheckOut_"]>(`${base}/scenario-versions/${versionId}/validate`)).body.data;
      },

      /**
       * 최신 공정으로 갱신(0.14.0): 초안의 제품별 공정 버전을 현재 승인본으로, 자산 고정을 현재 승인 버전으로 맞춘다.
       * 도착·가정·순서는 그대로다. If-Match = 시나리오 버전 row_version. 승인본은 409, 바뀐 내용은 process_changes·asset_changes.
       */
      async refresh(versionId: string, body: Schemas["ScenarioRefreshIn"], version: number): Promise<{ version: ScenarioVersionView; result: Schemas["ScenarioRefreshOut"] }> {
        const r = await client.post<Schemas["Single_ScenarioRefreshOut_"]>(`${base}/scenario-versions/${versionId}/refresh`, { body, ifMatch: version });
        const v = toVersionView(r.body.data.version);
        store(v);
        refreshLists(v.scenarioId);
        return { version: v, result: r.body.data };
      },

      /** 승인(관리자). 사전검증 오류가 있으면 422 SCENARIO_NOT_RUNNABLE. 승인 후 내용은 고정된다. */
      async approve(versionId: string, version: number): Promise<ScenarioVersionView> {
        const r = await client.post<Schemas["Single_ScenarioVersionOut_"]>(`${base}/scenario-versions/${versionId}/approve`, { ifMatch: version });
        const v = toVersionView(r.body.data);
        store(v);
        refreshLists(v.scenarioId);
        return v;
      },

      /** 서버의 최신 버전(충돌 후 다시 불러오기). 캐시도 함께 갱신한다. */
      async fetchLatest(versionId: string): Promise<ScenarioVersionView> {
        const r = await client.get<Schemas["Single_ScenarioVersionOut_"]>(`${base}/scenario-versions/${versionId}`);
        const v = toVersionView(r.body.data);
        store(v);
        return v;
      },
    };
  }, [client, source, qc, projectId]);
}
