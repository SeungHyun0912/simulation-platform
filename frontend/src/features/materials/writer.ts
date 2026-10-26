import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";
import type { MaterialCreateBody, MaterialPatchBody } from "./materialDraft";
import { toMaterialView } from "./materialMappers";
import type { MaterialView } from "./materialView";

/**
 * 재료 쓰기 호출과 캐시 갱신. 화면은 이 함수만 거치고 fetch·If-Match를 직접 다루지 않는다.
 * 성공하면 응답(전체 MaterialOut)으로 캐시를 바로 갱신하고 목록은 다시 불러오게 한다.
 * 실패는 그대로 던진다(자동 재시도 없음: 요청이 처리됐는지 알 수 없을 수 있다).
 */
export function useMaterialWriter(projectId: string) {
  const client = useApiClient();
  const source = useDataSource();
  const qc = useQueryClient();

  return useMemo(() => {
    const detailKey = (id: string) => projectKey(projectId, source, "material", id);
    const listKey = projectKey(projectId, source, "materials");

    return {
      /** 변경한 필드만 PATCH. version은 사용자가 편집을 시작한 시점의 row_version(If-Match). */
      async update(materialId: string, patch: MaterialPatchBody, version: number): Promise<MaterialView> {
        const r = await client.patch<Schemas["Single_MaterialOut_"]>(`/projects/${projectId}/materials/${materialId}`, {
          body: patch,
          ifMatch: version,
        });
        const m = toMaterialView(r.body.data);
        qc.setQueryData(detailKey(materialId), m);
        void qc.invalidateQueries({ queryKey: listKey });
        return m;
      },

      /** 서버의 최신 재료(충돌 후 다시 불러오기). 캐시도 함께 갱신한다. */
      async fetchLatest(materialId: string): Promise<MaterialView> {
        const r = await client.get<Schemas["Single_MaterialOut_"]>(`/projects/${projectId}/materials/${materialId}`);
        const m = toMaterialView(r.body.data);
        qc.setQueryData(detailKey(materialId), m);
        return m;
      },

      async create(body: MaterialCreateBody): Promise<MaterialView> {
        const r = await client.post<Schemas["Single_MaterialOut_"]>(`/projects/${projectId}/materials`, { body });
        const m = toMaterialView(r.body.data);
        qc.setQueryData(detailKey(m.id), m);
        void qc.invalidateQueries({ queryKey: listKey });
        return m;
      },
    };
  }, [client, source, qc, projectId]);
}
