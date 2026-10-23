import { ApiError, classifyError } from "../api/errors";
import { StateNotice } from "./StateNotice";

/**
 * 저장·전이 요청이 실패했을 때의 안내(조회 실패는 QueryErrorNotice). 충돌(412)과 필드 오류(422·409 코드 중복)는
 * 호출한 화면이 전용 UI로 처리하므로 이 컴포넌트는 그 밖의 실패를 설명한다.
 * 428은 FE가 If-Match를 빠뜨렸다는 버그 신호라 사용자에게 원인을 설명하지 않고 요청 ID만 알린다.
 */
export function SaveErrorNotice({ error }: { error: unknown }) {
  if (error === null || error === undefined) return null;
  const kind = classifyError(error);
  const requestId = error instanceof ApiError ? error.requestId : null;
  const trace = requestId ? (
    <>
      {" "}
      문의할 때 요청 ID <code>{requestId}</code>를 알려 주세요.
    </>
  ) : null;

  switch (kind) {
    case "forbidden":
      return (
        <StateNotice kind="forbidden" title="저장할 권한이 없습니다">
          역할이 바뀌었을 수 있습니다. 화면을 새로 불러온 뒤 다시 시도하세요.
        </StateNotice>
      );
    case "not-found":
      return (
        <StateNotice kind="error" title="대상을 찾을 수 없습니다">
          삭제되었거나 접근할 수 없게 되었습니다. 목록으로 돌아가 확인하세요.{trace}
        </StateNotice>
      );
    case "unauthenticated":
      return (
        <StateNotice kind="forbidden" title="인증이 필요합니다">
          로그인 정보가 없거나 만료되었습니다. 저장되지 않았습니다.
        </StateNotice>
      );
    case "network":
      return (
        <StateNotice kind="error" title="서버에 연결하지 못했습니다">
          저장되었는지 알 수 없습니다. 화면을 새로 불러와 확인한 뒤 다시 저장하세요.
        </StateNotice>
      );
    case "state":
      return (
        <StateNotice kind="conflict" title="상태가 바뀌어 저장할 수 없습니다">
          다른 곳에서 상태가 바뀌었습니다. 화면을 새로 불러오세요.{trace}
        </StateNotice>
      );
    case "precondition":
      return (
        <StateNotice kind="error" title="저장 요청에 문제가 있습니다">
          화면 오류로 요청이 거부되었습니다. 저장되지 않았습니다.{trace}
        </StateNotice>
      );
    default:
      return (
        <StateNotice kind="error" title="저장하지 못했습니다">
          {error instanceof ApiError ? error.message : "알 수 없는 오류가 발생했습니다."}
          {trace}
        </StateNotice>
      );
  }
}
