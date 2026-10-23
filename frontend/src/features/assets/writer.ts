import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";
import { toAssetInfo, toRevisionDetail } from "./apiMappers";
import type { AssetInfo, RevisionDetail } from "./assetView";
import type { AssetPatchBody } from "./infoDraft";
import type { RevisionPatchBody } from "./revisionPatch";

export type TransitionAction = "submit" | "approve" | "reject";

/**
 * 자산 버전(용량·규칙) 쓰기 호출과 캐시 갱신. 자산 기본 정보와 ETag·충돌이 따로이므로 별도 훅이다.
 * 전이(제출·승인·반려)도 If-Match가 필수이며, 승인하면 이전 승인본이 superseded가 되고 자산의
 * current/latest 요약이 바뀌므로 성공 후 버전 목록·자산·목록 캐시를 다시 불러온다.
 */
export function useRevisionWriter(projectId: string) {
  const client = useApiClient();
  const source = useDataSource();
  const qc = useQueryClient();

  return useMemo(() => {
    const revisionsKey = (assetId: string) => projectKey(projectId, source, "asset-revisions", assetId);
    const assetKey = (assetId: string) => projectKey(projectId, source, "asset", assetId);
    const listKey = projectKey(projectId, source, "assets");

    function cache(assetId: string, rev: RevisionDetail) {
      qc.setQueryData<RevisionDetail[]>(revisionsKey(assetId), (cur) =>
        [...(cur ?? []).filter((r) => r.id !== rev.id), rev].sort((a, b) => b.revisionNo - a.revisionNo),
      );
      // 다른 버전의 상태(승인 시 이전 승인본)와 자산 요약이 바뀔 수 있어 서버 값으로 다시 맞춘다.
      void qc.invalidateQueries({ queryKey: revisionsKey(assetId) });
      void qc.invalidateQueries({ queryKey: assetKey(assetId) });
      void qc.invalidateQueries({ queryKey: listKey });
    }

    return {
      /** 변경한 값만 PATCH. version은 편집을 시작한 시점의 버전 row_version(If-Match). */
      async update(assetId: string, revisionId: string, patch: RevisionPatchBody, version: number) {
        const r = await client.patch<Schemas["Single_AssetRevisionOut_"]>(`/projects/${projectId}/asset-revisions/${revisionId}`, {
          body: patch,
          ifMatch: version,
        });
        const rev = toRevisionDetail(r.body.data);
        cache(assetId, rev);
        return rev;
      },

      async fetchLatest(assetId: string, revisionId: string) {
        const r = await client.get<Schemas["Single_AssetRevisionOut_"]>(`/projects/${projectId}/asset-revisions/${revisionId}`);
        const rev = toRevisionDetail(r.body.data);
        cache(assetId, rev);
        return rev;
      },

      /** 이 자산의 버전 목록 전체를 서버에서 다시 받아 캐시를 맞춘다(상태가 바뀐 뒤 화면을 서버와 일치시킬 때). */
      async refreshAll(assetId: string): Promise<RevisionDetail[]> {
        const r = await client.get<Schemas["ListOut_AssetRevisionOut_"]>(`/projects/${projectId}/assets/${assetId}/revisions`, {
          query: { limit: 200 },
        });
        const list = r.body.data.map(toRevisionDetail);
        qc.setQueryData(revisionsKey(assetId), list);
        void qc.invalidateQueries({ queryKey: assetKey(assetId) });
        void qc.invalidateQueries({ queryKey: listKey });
        return list;
      },

      /** 새 초안(승인본 값을 복사). 열린 버전이 있으면 409 REVISION_DRAFT_EXISTS. */
      async createDraft(assetId: string) {
        const r = await client.post<Schemas["Single_AssetRevisionOut_"]>(`/projects/${projectId}/assets/${assetId}/revisions`);
        const rev = toRevisionDetail(r.body.data);
        cache(assetId, rev);
        return rev;
      },

      /** 제출·승인·반려. If-Match 필수, 반려는 사유가 필수다. */
      async transition(assetId: string, revisionId: string, action: TransitionAction, version: number, reason?: string) {
        const r = await client.post<Schemas["Single_AssetRevisionOut_"]>(
          `/projects/${projectId}/asset-revisions/${revisionId}/${action}`,
          { ifMatch: version, body: action === "reject" ? { reason } : undefined },
        );
        const rev = toRevisionDetail(r.body.data);
        cache(assetId, rev);
        return rev;
      },
    };
  }, [client, source, qc, projectId]);
}

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
