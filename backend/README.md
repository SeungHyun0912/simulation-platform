# Python 백엔드

상태: 구조·기술서만 있음. API/worker 실행 파일, pyproject.toml, lockfile, migration은 아직 없습니다.
기술안: FastAPI/Pydantic/SQLAlchemy/Alembic, 요구 기술 Python/PostgreSQL/SimPy.
추가 라이브러리는 G0에서 검토·고정합니다.

읽기: 루트 AGENTS → 이 폴더 AGENTS → docs/05_backend_python.md →
docs/07_simulation_engine.md → 공통 ERD/DTO/API/검증 문서.

## 배치
- src/simulation_platform/api: HTTP adapter
- schemas: API DTO, DB ORM과 분리
- auth: 인증·조직/프로젝트 권한
- services: 업무 트랜잭션
- repositories / models: DB 접근·ORM
- domain: 단위·정책·오류, HTTP/ORM 비의존
- validation: 단계별 검증
- simulation: compiler/handlers/resources/logistics/monitoring
- worker: 독립 프로세스 실행·job 처리
- integrations: LLM/storage/CAD adapter
- migrations: Backend 단일 작성·조정자 적용 승인
- tests: unit / integration / contract / simulation
- artifacts: OpenAPI 후보·로컬 테스트 결과, Git 제외

## 최초 작업
ERD 결정과 첫 API DTO 합의 → 패키지/lockfile 생성 → 인증 adapter 범위 결정 →
project/asset/port migration → 생성·조회·수정 API → OpenAPI 후보 →
실제 PostgreSQL 테스트 → FE 인계.

계약 없이 전체 미래 테이블을 선행 생성하지 않습니다.
앱 실행·OpenAPI 내보내기·테스트 명령은 구현 후 이 문서에 검증한 명령만 추가합니다.
