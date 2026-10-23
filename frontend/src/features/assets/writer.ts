import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";
import { toAssetInfo } from "./apiMappers";
import type { AssetInfo } from "./assetView";
import type { AssetPatchBody } from "./infoDraft";

/**
 * 자산 쓰기 호출과 캐시 갱신. 화면은 이 함수만 거치고 fetch·If-Match를 직접 다루지 않는다.
 * 성공하면 응답(전체 AssetOut)으로 캐시를 바로 갱신하고 목록은 다시 불러오게 한다.
 * 실패는 그대로 던진다(ApiError·NetworkError). 자동 재시도는 하지 않는다(요청이 처리됐는지 알 수 없을 수 있음).
 */
export function useAssetWriter(projectId: string) {
  const client = useApiClient();
  const source = useDataSource();
  const qc = useQueryClient();

  return useMemo(() => {
    const detailKey = (assetId: string) => projectKey(projectId, source, "asset", assetId);
    const listKey = projectKey(projectId, source, "assets");

    return {
      /** 변경한 필드만 PATCH. version은 사용자가 편집을 시작한 시점의 row_version(If-Match). */
      async update(assetId: string, patch: AssetPatchBody, version: number): Promise<AssetInfo> {
        const r = await client.patch<Schemas["Single_AssetOut_"]>(`/projects/${projectId}/assets/${assetId}`, {
          body: patch,
          ifMatch: version,
        });
        const info = toAssetInfo(r.body.data);
        qc.setQueryData(detailKey(assetId), info);
        void qc.invalidateQueries({ queryKey: listKey });
        return info;
      },

      /** 서버의 최신 자산(충돌 후 다시 불러오기). 캐시도 함께 갱신한다. */
      async fetchLatest(assetId: string): Promise<AssetInfo> {
        const r = await client.get<Schemas["Single_AssetOut_"]>(`/projects/${projectId}/assets/${assetId}`);
        const info = toAssetInfo(r.body.data);
        qc.setQueryData(detailKey(assetId), info);
        return info;
      },

      /** 자산 생성. 포트는 서버가 kind에 맞춰 같은 트랜잭션에서 만든다(요청에 보내지 않는다). */
      async create(body: Schemas["AssetCreate"]): Promise<AssetInfo> {
        const r = await client.post<Schemas["Single_AssetOut_"]>(`/projects/${projectId}/assets`, { body });
        const info = toAssetInfo(r.body.data);
        qc.setQueryData(detailKey(info.id), info);
        void qc.invalidateQueries({ queryKey: listKey });
        return info;
      },
    };
  }, [client, source, qc, projectId]);
}
