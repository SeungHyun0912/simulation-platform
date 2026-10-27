import { StateNotice } from "./StateNotice";

/**
 * 서버 연동 전용 화면(시나리오·실행)의 정적 예시 모드 안내. 정적 모드에는 예시 데이터를 만들지 않는다
 * (가짜 실행 결과를 실제처럼 보이지 않게 하기 위해). 서버 호출도 하지 않는다.
 */
export function ApiOnlyNotice({ subject }: { subject: string }) {
  return (
    <StateNotice kind="contract-pending" title={`${subject}은(는) 서버 연동 모드에서만 사용할 수 있습니다`}>
      정적 예시 모드에서는 {subject} 예시 데이터를 제공하지 않습니다. 개발 서버 연동 모드(`VITE_DATA_SOURCE=api`, 기본값)로 실행하세요.
    </StateNotice>
  );
}
