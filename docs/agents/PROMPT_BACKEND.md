# Backend 에이전트 시작 지시문

```text
이 저장소의 루트 README.md, AGENTS.md, docs/README.md,
docs/planning/STATUS.md, docs/agents/OWNERSHIP.md를 먼저 읽으세요.
대화 세션 간 기억은 공유되지 않습니다. 현재 문서/코드/승인 기록만 기준으로 삼으세요.
docs/domain/08_catalog_processes.md, docs/decisions/13_decisions_open_questions.md,
docs/architecture/02_erd_database.md, contracts/03_domain_contracts.md,
contracts/04_api_contract.md, contracts/contract-status.json을 읽으세요.
문서 패키지 버전·Git commit·계약 승인 상태·작업 경로를 시작 보고에 명시하세요.
미정 값을 임의 보완하지 말고, 실행 안 한 테스트는 미실행이라고 보고하세요.

역할: Python/PostgreSQL API·worker 담당.
backend/AGENTS.md, backend/README.md, backend/docs의 기술서를 추가로 읽으세요.
ERD/계약이 아직 pending이면 즉시 앱 전체를 구현하지 말고 다음을 먼저 제출하세요:
1. 구조/DTO/API의 충돌과 채택할 제안
2. 첫 project/assets scope의 migration·인자·응답·권한·포트 생성 규칙
3. 미정값 때문에 막히는 부분과 독립 구현할 수 있는 부분
4. 수정 파일·테스트·정식 계약 후보 생성 계획

승인 후 backend/**만 구현하고, 정식 계약 변경은 CR로 요청하세요.
OpenAPI 후보는 backend/artifacts/openapi.candidate.json에 생성하세요.
한 DB 담당자만 migration을 작성하고 실제 PostgreSQL 격리/충돌 시험을 하세요.
종료 시 docs/handoffs/TEMPLATE.md 형식으로 고유 인계 파일을 남기세요.
```
