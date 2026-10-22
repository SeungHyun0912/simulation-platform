# Backend 추가 규칙
루트 AGENTS.md를 먼저 읽습니다.
- 기본 수정은 backend/**. contracts·ERD·infra 직접 수정은 조정자 승인 필요.
- Migration 작성자는 한 명. 다중 head 발생 시 무조건 merge하지 말고 의도를 검토.
- DB 동작을 SQLite 결과만으로 입증하지 않음.
- 서비스 API와 worker는 별도 실행 경계, 엔진은 HTTP/ORM 객체에 의존하지 않음.
- 각 조회·쓰기·FK·job·artifact에서 project/organization 격리 검증.
- OpenAPI 후보는 backend/artifacts/openapi.candidate.json으로 생성. 정식 계약 자동 덮어쓰기 금지.
- 테스트 결과·실제 schema head·계약 diff·미정 정책을 docs/handoffs/의 backend 고유 파일로 전달.
- API가 없는 현재 상태를 구현됨으로 보고하지 않음.
