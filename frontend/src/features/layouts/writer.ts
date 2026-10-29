import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import type { Schemas } from "../../shared/api/types";
import { layoutListKey, layoutVersionKey } from "./queries";

type Version = Schemas["LayoutVersionOut"];

/**
 * 배치판 쓰기 호출(계약 0.17.0)과 캐시 갱신. 머리 수정(PATCH)과 내용 교체(PUT /content)는 같은 row_version을 쓰므로
 * 호출한 쪽이 응답의 row_version을 다음 If-Match로 쓴다. 실패는 그대로 던진다(자동 재시도 없음).
 */
export function useLayoutWriter(projectId: string) {
  const client = useApiClient();
  const source = useDataSource();
  const qc = useQueryClient();
  return useMemo(() => {
    const base = `/projects/${projectId}/layout-versions`;
    const store = (v: Version) => {
      qc.setQueryData(layoutVersionKey(projectId, source, v.id), v);
      void qc.invalidateQueries({ queryKey: layoutListKey(projectId, source) });
      return v;
    };
    return {
      /** 새 초안. 없으면 서버가 최근 승인본을 복사하고, 그것도 없으면 빈 초안. 프로젝트당 초안 하나(409 LAYOUT_DRAFT_EXISTS). */
      async createDraft(fromVersionId?: string): Promise<Version> {
        const r = await client.post<Schemas["Single_LayoutVersionOut_"]>(base, { body: fromVersionId ? { from_version_id: fromVersionId } : {} });
        return store(r.body.data);
      },
      async patchHeader(versionId: string, patch: Schemas["LayoutVersionPatch"], version: number): Promise<Version> {
        return store((await client.patch<Schemas["Single_LayoutVersionOut_"]>(`${base}/${versionId}`, { body: patch, ifMatch: version })).body.data);
      },
      /** 점·배치·포트 매핑·경로를 통째로 교체. 구조 오류는 422 VALIDATION_ERROR(LAY-SAVE-*, field_path = 본문 순번). */
      async putContent(versionId: string, body: Schemas["LayoutContentIn"], version: number): Promise<Version> {
        return store((await client.put<Schemas["Single_LayoutVersionOut_"]>(`${base}/${versionId}/content`, { body, ifMatch: version })).body.data);
      },
      /** 승인 전 검증(저장하지 않음). field_path = key 경로. */
      async validate(versionId: string): Promise<Schemas["LayoutValidationOut"]> {
        return (await client.post<Schemas["Single_LayoutValidationOut_"]>(`${base}/${versionId}/validate`)).body.data;
      },
      /** 승인(관리자). 검증 오류가 있으면 422 LAYOUT_VALIDATION_FAILED. 승인 후 내용은 고정된다. */
      async approve(versionId: string, version: number): Promise<Version> {
        return store((await client.post<Schemas["Single_LayoutVersionOut_"]>(`${base}/${versionId}/approve`, { ifMatch: version })).body.data);
      },
      async reload(versionId: string): Promise<Version> {
        return store((await client.get<Schemas["Single_LayoutVersionOut_"]>(`${base}/${versionId}`)).body.data);
      },
    };
  }, [client, projectId, qc, source]);
}
