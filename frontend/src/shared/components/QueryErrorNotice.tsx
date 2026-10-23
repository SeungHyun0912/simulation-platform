import { ApiError, classifyError } from "../api/errors";
import { Button } from "./Button";
import { StateNotice } from "./StateNotice";

type Props = {
  error: unknown;
  /** 오류가 난 대상(예: "자산 목록")을 문장에 쓴다. */
  subject: string;
  onRetry?: () => void;
};

/**
 * 조회 실패를 오류 종류별로 다른 안내로 보여 준다. 서버가 거부한 이유를 숨기지 않고,
 * 접근 불가와 없음은 서버가 구분하지 않으므로(404) 같은 안내로 둔다.
 * 428(If-Match 누락)은 FE 버그 신호라 사용자에게 원인을 설명하지 않는다.
 */
export function QueryErrorNotice({ error, subject, onRetry }: Props) {
  const kind = classifyError(error);
  const requestId = error instanceof ApiError ? error.requestId : null;
  const retry = onRetry ? <Button onClick={onRetry}>다시 시도</Button> : undefined;
  const trace = requestId ? <> 문의할 때 요청 ID <code>{requestId}</code>를 알려 주세요.</> : null;

  switch (kind) {
    case "forbidden":
      return <StateNotice kind="forbidden">{subject}을(를) 볼 권한이 없습니다.</StateNotice>;
    case "not-found":
      return (
        <StateNotice kind="empty" title={`${subject}을(를) 찾을 수 없습니다`}>
          없거나 접근할 수 없는 항목입니다.
        </StateNotice>
      );
    case "unauthenticated":
      return (
        <StateNotice kind="forbidden" title="인증이 필요합니다">
          로그인 정보가 없거나 유효하지 않습니다. 개발 서버에서는 <code>DEV_DEBUG_USER</code> 환경변수를
          확인하세요.
        </StateNotice>
      );
    case "network":
      return (
        <StateNotice kind="error" title="서버에 연결하지 못했습니다" action={retry}>
          API 서버가 실행 중인지 확인한 뒤 다시 시도하세요. 요청이 처리되었는지는 알 수 없습니다.
        </StateNotice>
      );
    case "validation":
      return (
        <StateNotice kind="error" title="요청 형식이 올바르지 않습니다" action={retry}>
          {error instanceof ApiError ? error.message : null}
          {trace}
        </StateNotice>
      );
    default:
      return (
        <StateNotice kind="error" action={retry}>
          {subject}을(를) 불러오지 못했습니다.{trace}
        </StateNotice>
      );
  }
}
