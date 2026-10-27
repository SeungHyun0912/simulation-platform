import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef } from "react";
import { useApiClient, useDataSource } from "../../shared/api/ApiContext";
import type { Schemas } from "../../shared/api/types";
import { runKey, runListKey } from "./queries";
import { requestSignature, type RunOut } from "./runView";

/** 실행 요청 키. 브라우저의 UUID를 쓰고, 없는 환경에서도 충분히 유일한 값을 만든다(서버는 1~128자만 요구한다). */
function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && "randomUUID" in c) return c.randomUUID();
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * 실행 쓰기 호출. 요청은 `Idempotency-Key`가 필수다(없으면 428). 같은 본문을 다시 보낼 때(네트워크 재시도·중복 클릭)는
 * 같은 키를 다시 쓰고, 본문(시나리오 버전·seed·replicate)이 바뀌면 새 키를 쓴다. 같은 키로 본문이 다르면 409 IDEMPOTENCY_CONFLICT다.
 */
export function useRunWriter(projectId: string) {
  const client = useApiClient();
  const source = useDataSource();
  const qc = useQueryClient();
  const lastKey = useRef<{ sig: string; key: string } | null>(null);

  return useMemo(() => {
    const base = `/projects/${projectId}`;
    return {
      /** 202(새 run) 또는 200(같은 키·같은 본문 = 기존 run). 응답의 run id로 상세 화면에 간다. */
      async create(body: { scenarioVersionId: string; seed: number; replicateIndex: number }): Promise<{ run: RunOut; reused: boolean }> {
        const sig = requestSignature(body.scenarioVersionId, body.seed, body.replicateIndex);
        if (!lastKey.current || lastKey.current.sig !== sig) lastKey.current = { sig, key: newIdempotencyKey() };
        const payload: Schemas["RunCreate"] = { scenario_version_id: body.scenarioVersionId, seed: body.seed, replicate_index: body.replicateIndex };
        const r = await client.post<Schemas["Single_RunOut_"]>(`${base}/runs`, { body: payload, headers: { "Idempotency-Key": lastKey.current.key } });
        void qc.invalidateQueries({ queryKey: runListKey(projectId, source) });
        return { run: r.body.data, reused: r.status === 200 };
      },

      /** 취소 요청(202). 대기 중이면 즉시 취소되고, 실행 중이면 요청 시각만 기록된다(요청 ≠ 실제 취소). */
      async cancel(runId: string): Promise<RunOut> {
        const r = await client.post<Schemas["Single_RunOut_"]>(`${base}/runs/${runId}/cancel`);
        qc.setQueryData(runKey(projectId, source, runId), r.body.data);
        void qc.invalidateQueries({ queryKey: runListKey(projectId, source) });
        return r.body.data;
      },
    };
  }, [client, source, qc, projectId]);
}
