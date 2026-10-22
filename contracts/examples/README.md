# 공통 요청·응답 예제
error.proposed.json은 업로드한 API 문서의 오류 응답 예제를 그대로 옮긴 것입니다.
상태 PROPOSED, 더미 UUID, 실제 실행 결과/fixture 승인본 아님.

첫 계약 승인 때 다음 예제를 추가합니다:
- 프로젝트 목록/생성, 자산 생성·포트 조회, 수정 성공
- 권한 없는 프로젝트 404, 형식 오류 422, If-Match 누락 428, 충돌 412
- 빈 목록·cursor 페이지
각 예제는 endpoint, 상태 코드, schema 기준 버전, 민감값 제거 여부를 index에 기록합니다.
FE Mock과 Backend 계약 테스트가 같은 예제를 사용하도록 구성합니다.
