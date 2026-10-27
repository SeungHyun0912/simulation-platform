import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError, classifyError, toIssues } from "../../shared/api/errors";
import { Button } from "../../shared/components/Button";
import { TextField } from "../../shared/components/Fields";
import { Block, FieldGrid, Note, Section } from "../../shared/components/Layout";
import { SaveErrorNotice } from "../../shared/components/SaveErrorNotice";
import { ValidationPanel } from "../../shared/components/ValidationPanel";
import { parseNonNegativeInt, SEED_MAX } from "./runView";
import { useRunWriter } from "./writer";

/**
 * 승인된 시나리오 버전의 실행 요청. 요청은 서버가 입력 스냅샷·run·job을 한 번에 만들고 202로 응답하며(진행은 상세 화면에서 polling),
 * 같은 seed·반복 번호를 다시 요청하면 같은 Idempotency-Key로 기존 run을 돌려받는다(중복 실행 방지).
 */
export function RunRequestSection({ projectId, scenarioVersionId, mayRun }: { projectId: string; scenarioVersionId: string; mayRun: boolean }) {
  const writer = useRunWriter(projectId);
  const navigate = useNavigate();
  const [seed, setSeed] = useState("0");
  const [replicate, setReplicate] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [issues, setIssues] = useState<ReturnType<typeof toIssues>>([]);

  const seedN = parseNonNegativeInt(seed);
  const repN = parseNonNegativeInt(replicate);
  const range = `0~${SEED_MAX.toLocaleString("en-US")}의 정수`;
  const canSubmit = mayRun && seedN !== null && repN !== null && !busy;

  async function submit() {
    if (!canSubmit || seedN === null || repN === null) return;
    setBusy(true);
    setError(null);
    setIssues([]);
    try {
      const r = await writer.create({ scenarioVersionId, seed: seedN, replicateIndex: repN });
      navigate(`/projects/${projectId}/runs/${r.run.id}`);
    } catch (e) {
      // 승인되지 않은 버전·사전검증 실패(422 RUN_NOT_RUNNABLE)는 서버 사유를 그대로 보인다
      if (e instanceof ApiError && classifyError(e) === "validation" && e.details.length > 0) setIssues(toIssues(e));
      else setError(e);
    } finally {
      setBusy(false);
    }
  }

  const networkUncertain = !!error && classifyError(error) === "network";
  return (
    <Section id="sec-run" title="실행 요청">
      <Note>
        이 승인 버전의 입력을 고정해 실행합니다. seed가 같으면 같은 결과가 나오며, 반복 번호로 같은 조건의 다른 반복을 구분합니다. 같은 값으로 다시 요청하면 새 실행을 만들지 않고 기존 실행으로 이동합니다.
      </Note>
      <SaveErrorNotice error={error} />
      {networkUncertain && (
        <Block>
          <Note>
            요청이 처리되었는지 알 수 없습니다. 다시 요청해도 같은 요청 키를 쓰므로 실행이 중복되지 않습니다. 또는 <Link to={`/projects/${projectId}/runs`}>실행 목록</Link>에서 확인하세요.
          </Note>
        </Block>
      )}
      {issues.length > 0 && (
        <Block>
          <ValidationPanel issues={issues} />
        </Block>
      )}
      <FieldGrid>
        <TextField label="seed" hint={range} inputMode="numeric" value={seed} error={seedN === null ? `${range}여야 합니다.` : undefined} onChange={(e) => setSeed(e.target.value)} />
        <TextField
          label="반복 번호"
          hint={range}
          inputMode="numeric"
          value={replicate}
          error={repN === null ? `${range}여야 합니다.` : undefined}
          onChange={(e) => setReplicate(e.target.value)}
        />
      </FieldGrid>
      <div>
        <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()} title={mayRun ? undefined : "이 역할은 실행을 요청할 수 없습니다(관리자·편집자만)"}>
          {busy ? "요청하는 중…" : "실행 요청"}
        </Button>
      </div>
    </Section>
  );
}
