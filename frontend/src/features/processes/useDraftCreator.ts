import { useState } from "react";
import { ApiError } from "../../shared/api/errors";
import { isOpenProcessStatus } from "./processView";
import { useProcessWriter } from "./writer";

/**
 * 제품의 새 공정 초안 만들기. 승인본이 있으면 서버가 그래프를 복사해 시작한다.
 * 열린 버전(draft·in_review)이 이미 있으면(409 PROCESS_DRAFT_EXISTS) 다시 만들지 않고 그 버전으로 이동한다.
 */
export function useDraftCreator(projectId: string, productId: string, onOpen: (versionId: string) => void) {
  const writer = useProcessWriter(projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** 기준 버전(승인본·대체됨)을 주면 그 버전을 복사하고, 생략하면 서버가 현재 승인본을 복사한다. */
  async function create(baseVersionId?: string) {
    if (busy) return; // 연속 클릭으로 중복 생성하지 않는다
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const v = await writer.createDraft(productId, baseVersionId);
      onOpen(v.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "PROCESS_DRAFT_EXISTS") {
        try {
          const open = (await writer.listVersions(productId)).find((v) => isOpenProcessStatus(v.status));
          if (open) {
            setNotice("이미 열린 공정 버전이 있어 그 버전을 엽니다.");
            onOpen(open.id);
            return;
          }
        } catch (e2) {
          setError(e2);
          return;
        }
      }
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return { create, busy, error, notice };
}
