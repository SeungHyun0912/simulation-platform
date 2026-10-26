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

## 검증된 명령 (BE-01a, backend/ 에서 실행, Python 3.12)
```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m pip install -e . --no-deps
.\.venv\Scripts\python.exe -m pytest -q        # 단위·계약·통합 전체(DB 없으면 통합은 skip)
.\.venv\Scripts\python.exe -m ruff check .
```
- 엔진(`src/simulation_platform/simulation`, SimPy 4.1.2 고정, ADR-0002)은 HTTP·ORM에 의존하지 않아 DB 없이 시험한다: `.\.venv\Scripts\python.exe -m pytest tests/simulation -q`. 구성: `compiler`(snapshot → RuntimeModel, 시나리오 가정 보고), `handlers`(명시 registry·순수 계획 함수), `resources`(설비 allocator), `runtime`(SimPy 실행, 지평선 `[0,H)`), `monitoring`(이벤트).
- DB 통합 테스트(실제 PostgreSQL 필요, 기본 대상 `simulation_platform_test`):
  ```powershell
  $env:REQUIRE_DB="1"; .\.venv\Scripts\python.exe -m pytest tests/integration -q
  ```
  세션 시작 시 테스트 DB를 `downgrade base → upgrade head`로 재생성한다. DB 이름이 `_test`로 끝나지
  않으면 거부한다. 다른 대상은 `TEST_DATABASE_URL`로 지정. `REQUIRE_DB`가 없으면 DB 미연결 시 skip된다.
- Migration 수동 적용(대상 DB를 반드시 확인): `$env:DATABASE_URL="..."; .\.venv\Scripts\python.exe -m alembic upgrade head`
  (현재 head `0006`). 개발/공유 DB에는 자동 적용하지 않는다.
- 의존성 정확한 버전은 `requirements.lock`(pip freeze 산출)이 기준이다. 패키지 매니저 확정은 ADR 대기.
- 로컬 PostgreSQL: 루트 `docker-compose.yml`(WSL에서 `docker compose up -d postgres`).
- 앱 import 경로: `simulation_platform.api.app:app`.
- 앱 실행(대상 DB 확인 필수): `$env:DATABASE_URL="postgresql+psycopg://..."; $env:AUTH_MODE="local"; python -m uvicorn simulation_platform.api.app:app --port 8000`
  `AUTH_MODE=local`은 개발·테스트 전용이며 `APP_ENV=production`이면 기동을 거부한다. 요청은 `X-Debug-User: <app_user.id>` 헤더로 주체를 지정한다.
- OpenAPI 후보 생성: `python -m simulation_platform.api.export_openapi` → `artifacts/openapi.candidate.json`(Git 제외, 정식 계약 아님).
- 구현된 API(`/api/v1`, 정본은 `contracts/openapi.json`): `GET /me`, 프로젝트 `GET·POST /projects`, `GET·PATCH /projects/{p}`,
  자산 `GET·POST /projects/{p}/assets`, `GET·PATCH .../assets/{id}`, `GET .../assets/{id}/ports`(0.1.0),
  자산 버전 `GET·POST .../assets/{id}/revisions`, `GET·PATCH /projects/{p}/asset-revisions/{rid}`, `POST .../submit|reject|approve`(0.2.0),
  제품 `GET·POST /projects/{p}/products`, `GET·PATCH .../products/{id}`, 재료 `GET·POST /projects/{p}/materials`, `GET·PATCH .../materials/{id}`(0.3.0, `GET /me` 프로젝트에 `status` 추가),
  공정 버전 `GET·POST /projects/{p}/products/{id}/process-versions`, `GET·PATCH /projects/{p}/process-versions/{v}`, `GET·PUT .../graph`, `PATCH .../steps/{step}`, `POST .../validate`, `POST .../submit|reject|approve`(0.4.0), 복제 기준 선택(`POST .../process-versions` 선택 본문 `base_version_id`)·`GET .../process-versions/{v}/diff`·`GET·PUT .../process-versions/{v}/editor-state`(0.5.0), 단계 재료 spec·간선 spec 연결·완제품 지정은 기존 그래프·단계 operation의 선택 필드(0.6.0).
  사양: `contracts/04_api_contract.md` §3.1·§3.2, 변경 기록: `contracts/CHANGELOG.md`.
- 개발용 시드(조직·사용자 3·프로젝트 1, 멱등, 로컬 전용): `DATABASE_URL=... python scripts/seed_dev_data.py --yes`. 개발 DB에는 migration을 먼저 적용해야 한다.
- **실제 기준정보 시드**(프로젝트 `DEMO-WIRE`: 설비 96·공간 22·제품 6·공정 버전 6 draft, `docs/domain/08_catalog_processes.md` 기준, 멱등, 로컬 전용): `DATABASE_URL=... python scripts/seed_wire_factory.py --yes`. 자산·제품·공정은 실제 API(서비스 계층)로 만들며 시험 데이터와 분리된 프로젝트다.
- **시험 데이터 시드**(프로젝트 3·사용자 추가·자산 60+·버전 상태/용량/규칙 케이스, "[시험]" 표시, 멱등, 로컬 전용): `DATABASE_URL=... python scripts/seed_demo_data.py --yes`.
  자산·버전은 실제 API(서비스 계층)로 생성하므로 검증 규칙·감사 로그가 운영 경로와 같다. 구성은 `docs/communication/request-from-backend.md`의 "현재 Backend 상태".
- 개발 API 서버 한 줄 실행(개발 DB + `AUTH_MODE=local`): `.\scripts\run_dev_api.ps1 [-Port 8000]`.
- 계약 변경 절차: CR 승인 → 코드 → `python -m simulation_platform.api.export_openapi` → `contracts/openapi.json`·`contract-status.json` 해시·`contracts/CHANGELOG.md` 갱신.
  `python scripts/generate_contract_examples.py ../contracts/examples/first-scope`로 예제 재생성(스키마가 head인 `_test` DB 필요).
  계약 테스트(`tests/contract`)가 스냅샷·해시·예제의 불일치를 실패로 처리한다.
