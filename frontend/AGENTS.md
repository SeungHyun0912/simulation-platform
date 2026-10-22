# Frontend 추가 규칙
루트 AGENTS.md를 먼저 읽습니다.
- 기본 수정은 frontend/**. 서버 모델·계약·공통 예제를 독단 수정하지 않음.
- 시작 시 contracts/contract-status.json의 승인된 scope/hash를 확인.
- DB ERD가 아닌 API DTO로 데이터 접근. 단위·null·enum 임의 변경 금지.
- generated client 수동 수정 금지. 재생성 기준 계약 hash 기록.
- 프로젝트 변경 시 cache·폼·대화 context를 분리하고 미저장 변경을 확인.
- unknown/0/unlimited/not_applicable을 UI와 요청에서 구별.
- 실제 API와 Mock을 명시적으로 분리. Mock 결과를 서버 성공으로 보고하지 않음.
- API 오류 envelope·ETag 412·권한·취소·작업 상태를 다룸.
- 토큰을 로그/예제에 넣지 않으며 서버 비밀값을 프런트엔드 환경변수에 넣지 않음.
- 승인된 디자인 토큰·공통 컴포넌트를 우선 사용한다.
- 기능 화면마다 새로운 색상·버튼·모달·표 스타일을 만들지 않는다.
- 공통 패턴에 없는 요구는 확장 제안을 먼저 기록한다.
- 정상 화면뿐 아니라 로딩·빈 결과·실패·권한 없음 상태를 구현한다.
- 기본 컴포넌트와 대표 화면 검토 전에는 전체 화면을 대량 구현하지 않는다.