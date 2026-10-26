import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import { projectKey } from "../../shared/api/queryKeys";
import type { Schemas } from "../../shared/api/types";
import type { ProductCreateBody, ProductPatchBody } from "./productDraft";
import { toProductView } from "./productMappers";
import type { ProductView } from "./productView";

/**
 * 제품 쓰기 호출과 캐시 갱신. 화면은 이 함수만 거치고 fetch·If-Match를 직접 다루지 않는다.
 * 성공하면 응답(전체 ProductOut)으로 캐시를 바로 갱신하고 목록은 다시 불러오게 한다.
 * 실패는 그대로 던진다(ApiError·NetworkError). 자동 재시도는 하지 않는다(요청이 처리됐는지 알 수 없을 수 있음).
 */
export function useProductWriter(projectId: string) {
  const client = useApiClient();
  const source = useDataSource();
  const qc = useQueryClient();

  return useMemo(() => {
    const detailKey = (id: string) => projectKey(projectId, source, "product", id);
    const listKey = projectKey(projectId, source, "products");

    return {
      /** 변경한 필드만 PATCH. version은 사용자가 편집을 시작한 시점의 row_version(If-Match). */
      async update(productId: string, patch: ProductPatchBody, version: number): Promise<ProductView> {
        const r = await client.patch<Schemas["Single_ProductOut_"]>(`/projects/${projectId}/products/${productId}`, {
          body: patch,
          ifMatch: version,
        });
        const p = toProductView(r.body.data);
        qc.setQueryData(detailKey(productId), p);
        void qc.invalidateQueries({ queryKey: listKey });
        return p;
      },

      /** 서버의 최신 제품(충돌 후 다시 불러오기). 캐시도 함께 갱신한다. */
      async fetchLatest(productId: string): Promise<ProductView> {
        const r = await client.get<Schemas["Single_ProductOut_"]>(`/projects/${projectId}/products/${productId}`);
        const p = toProductView(r.body.data);
        qc.setQueryData(detailKey(productId), p);
        return p;
      },

      async create(body: ProductCreateBody): Promise<ProductView> {
        const r = await client.post<Schemas["Single_ProductOut_"]>(`/projects/${projectId}/products`, { body });
        const p = toProductView(r.body.data);
        qc.setQueryData(detailKey(p.id), p);
        void qc.invalidateQueries({ queryKey: listKey });
        return p;
      },
    };
  }, [client, source, qc, projectId]);
}
