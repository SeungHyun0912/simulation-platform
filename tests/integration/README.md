# 통합 검증(INT) 테스트
실제 PostgreSQL·FastAPI·React(jsdom)를 연결해 UI→API→DB 흐름을 검증한다. **Mock 없음**.
통합 검증 담당(INT)만 이 폴더를 수정한다. 제품 코드(`backend/**`, `frontend/**`)와 계약은 읽기만 한다.
기준·결과·결함은 [통합 작업 보드](../../docs/collaboration/INTEGRATION_BOARD.md)가 정본이다.

## 격리 원칙
- 전용 DB `simulation_platform_int_test`, 전용 API 8100, 전용 프런트엔드 5174. 공유 개발 서버(8000)·DB는 쓰지 않는다.
- 공유 서버(포트 8000)를 가리키거나 DB 이름이 `_int_test`로 끝나지 않으면 테스트가 시작하지 않는다(`conftest.py`, `ui/live.ts`).
- 시험 데이터 코드는 `INT<실행ID>-` 접두사. 시드 데이터는 수정하지 않는다. 정리는 DB를 삭제하고 다시 만든다.

## 환경 준비(저장소 안에서, worktree별)
```powershell
# 1) 백엔드 가상환경(backend/README 의 검증된 명령과 같음)
cd backend; python -m venv .venv; .\.venv\Scripts\python.exe -m pip install -r requirements.lock; .\.venv\Scripts\python.exe -m pip install -e . --no-deps
# 2) 프런트엔드
cd ..\frontend; pnpm install --frozen-lockfile
# 3) 전용 DB 생성(PostgreSQL 127.0.0.1:5432): CREATE DATABASE simulation_platform_int_test;
# 4) migration + 시드(멱등, 전용 DB에만). seed_wire_factory.py 는 저장소에서 제외된 비공개 파일이라
#    data/local/README.md 대로 data/local/private 에서 복원해야 한다(없으면 T8의 DEMO-WIRE P05 기준 데이터가 없다).
cd ..\backend
$env:DATABASE_URL="postgresql+psycopg://postgres:postgres@127.0.0.1:5432/simulation_platform_int_test"
.\.venv\Scripts\python.exe -m alembic upgrade head
foreach ($s in "seed_dev_data","seed_demo_data","seed_wire_factory") { .\.venv\Scripts\python.exe scripts\$s.py --yes }
# 5) API 8100 (AUTH_MODE=local 은 개발·테스트 전용)
$env:AUTH_MODE="local"; $env:APP_ENV="development"
.\.venv\Scripts\python.exe -m uvicorn simulation_platform.api.app:app --port 8100
# 6) (선택, 화면 수동 확인) 프런트엔드 5174
cd ..\frontend
$env:VITE_DATA_SOURCE="api"; $env:DEV_API_TARGET="http://127.0.0.1:8100"; $env:DEV_DEBUG_USER="<app_user.id>"
pnpm exec vite --port 5174 --strictPort
```

## 실행(저장소 루트에서)
```powershell
# API·DB 연동 (pytest + httpx, 실제 서버)
backend\.venv\Scripts\python.exe -m pytest tests/integration -v -p no:cacheprovider
# UI→API→DB (vitest + jsdom, 실제 서버, 프런트엔드 실제 클라이언트·화면 사용)
pnpm --dir frontend exec vitest run --config vitest.config.mjs --root ../tests/integration/ui
```
환경변수: `INT_API`(기본 `http://127.0.0.1:8100/api/v1`), `INT_DATABASE_URL`(읽기 전용 확인용).

## 구성과 시나리오 대응
| 파일 | 시나리오 |
|---|---|
| `test_00_environment_contract.py` | T0 계약 정합(해시·operation·schema·프런트엔드 클라이언트 해시), T1 격리·API→DB·인증 |
| `test_10_scope_auth.py` | T2 프로젝트 간 격리, T3 역할·권한 |
| `test_20_assets.py` | T4 자산 생성·수정·ID/코드, T5 미정·유한·무제한·허용 안 함, T6 412/428 |
| `test_30_process_lifecycle.py` | T7 승인 흐름·불변·대체, 미정 값 보존 |
| `ui/t8-graph-roundtrip.test.ts` | T8 프런트엔드 그래프 저장 후 0.6.0 필드 보존 |
| `ui/ui-live.test.tsx` | T1·T9 서버 중단·권한 없음 표시, T2 프로젝트 전환 잔류 없음, T3 조회 전용, T6 UI 충돌 보호 |
| `evidence/<날짜>/` | 실행 로그(비밀값 없음) |

## 범위 밖·미실행
- T10(실행 입력 스냅샷·결과 연결): 시나리오·실행 API가 PROPOSED·미구현이라 실행하지 않는다.
- 실제 브라우저 렌더링(Playwright 등): 도입 승인 전. 이 폴더의 UI 검사는 jsdom이다.
- 부하·장애 복구·RLS(미구현).
