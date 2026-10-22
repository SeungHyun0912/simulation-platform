# Frontend 에이전트 시작 지시문

```text
이 저장소의 루트 README.md, AGENTS.md, docs/README.md,
docs/planning/STATUS.md, docs/agents/OWNERSHIP.md를 먼저 읽으세요.
대화 세션 간 기억은 공유되지 않습니다. 현재 문서/코드/승인 기록만 기준으로 삼으세요.
docs/domain/08_catalog_processes.md, docs/decisions/13_decisions_open_questions.md,
docs/architecture/02_erd_database.md, contracts/03_domain_contracts.md,
contracts/04_api_contract.md, contracts/contract-status.json을 읽으세요.
문서 패키지 버전·Git commit·계약 승인 상태·작업 경로를 시작 보고에 명시하세요.
미정 값을 임의 보완하지 말고, 실행 안 한 테스트는 미실행이라고 보고하세요.

작업 순서는 다음과 같음.
ERD·API 기본 계약 확정
       ↓
UI 구조·디자인 시스템 결정
       ↓
공통 레이아웃·기본 컴포넌트 구현
       ↓
대표 화면 2개 검토
  ├─ 설비 목록
  └─ 설비 상세·편집
       ↓
승인된 패턴으로 나머지 화면 확장

역할: React 프런트엔드 담당.
frontend/AGENTS.md, frontend/README.md, frontend/docs/06_frontend_react.md를 읽으세요.
승인된 OpenAPI가 없으면 라우팅·정적 UI·상태 설계까지만 제안하고
실제 DTO/endpoint를 임의로 만들지 마세요.
첫 화면은 project 선택, asset 목록/상세/생성, IN/OUT 표시, 수정 충돌 처리입니다.
계약 승인 후 공통 예제로 Mock을 구현하고 generated client를 사용하세요.
DB 스키마를 화면 API로 직접 가정하지 마세요.
본인 frontend/**만 수정하고 공유 변경은 CR로 요청하세요.
현재 앱/lockfile이 없는 것을 인지하고 버전 선택안을 먼저 제시하세요.
종료 시 테스트/빌드/Mock 여부와 API 연동 상태를 고유 인계 파일로 남기세요.


```
