# HANDOFF-backend-20261023-BE-03
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Backend(+단일 DB 담당) / BE-03 / A 단계(제품·재료 기준정보, ERD §5·§16)
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-backend-core / 6beca72(origin/main) / 코드 6f07b53, 시험 시드 확장·계약·문서 후속 커밋은 `git log`로 확인
- 계약 버전 / OpenAPI hash / 승인 scope: **0.3.0** / `4821718a8971abafb26ca1d672b857cde18794fd1131b0bd07d87d8b49c23b5c`(기준 commit `64e66c0`; 처음 승격한 `a4610740…`/`6f07b53`에서 FE 요청 R-FE-14로 `/me.projects[].timezone`을 같은 0.3.0에 추가해 바뀜 — 0.3.0이 main에 머지·FE 반영되기 전이라 새 버전을 만들지 않음) / `project-assets-ports`, `asset-revisions`, `products-materials`
- 승인 근거: CR be03(FE 의견 반영본)을 제시한 뒤 사용자가 "다음 개발 진행해주고"(2026-10-23)라고 지시 → 승인으로 해석해 구현·승격. 명시적 "승인" 문구는 없었으므로 사용자가 정정할 수 있다(`contract-status.json` approval_record에 기록).
- 수정 파일: backend/{migrations/versions/0003…, src/simulation_platform/{models/catalog.py, schemas/catalog.py, repositories/catalog.py, services/catalog.py, api/v1/{products,materials}.py, domain/errors.py, schemas/me.py, services/me.py, api/app.py}, scripts/{seed_demo_data,generate_contract_examples}.py, tests/**, README}, contracts/{openapi.json, contract-status.json, CHANGELOG.md, 04_api_contract.md(§3.3), examples/first-scope/*(8개 추가)}, docs/{change-requests/CR-…-be03, planning/STATUS.md, agents/TASK_BOARD.md(BE-03 행), communication/request-from-backend.md}
- 실제 구현 내용:
  - migration 0003: `product`, `material_definition`(UNIQUE(project_id, code)·UNIQUE(project_id, id), 빈 문자열 CHECK, `default_spec` NOT NULL). FK는 project만(공정 버전 테이블 도입 때 복합 FK 추가).
  - API 8개: 제품·재료 각각 목록/생성/조회/수정. 자산과 같은 규약(래퍼, cursor, ETag/If-Match, 404 정책, admin·editor 쓰기). 기본 정렬 `code`, `q`, `include_archived`. 제품과 재료의 구현은 `services/catalog.py` 공통 로직 + 엔티티 설정.
  - 재료 `default_spec`: `length_m`·`weight_kg`(decimal 문자열, 0 초과, 소수 6자리) / `unit_count`·`strand_count`(JSON 정수, 1 이상, strict)를 섞지 않는 판별 객체 `{mode: unknown|known|not_applicable, value}`, 기본 모두 unknown. PATCH는 보낸 필드만 교체.
  - `GET /me`의 프로젝트에 `status`·`timezone` 추가(비파괴, `timezone`은 FE R-FE-14). 새 오류 코드 `PRODUCT_CODE_CONFLICT`·`MATERIAL_CODE_CONFLICT`.
  - 시험 데이터 시드 확장(제품 8·재료 4, 프로젝트 B에 같은 코드 `P-001`), 계약 예제 8개 추가(총 30개).
- DB migration head / 적용 DB / 데이터 변환: **0003** / 테스트 DB(매 세션 재생성)와 로컬 개발 DB `simulation_platform`(0002→0003 적용, 시험 시드 재실행: 제품 8·재료 4 추가) / 변환 없음.
- 추가·변경 API / 예제 / 재생성 필요 여부: 위 8개 신규 + `/me` 필드 1개(비파괴). **FE generated client 재생성 필요**(기반이 0.2.0 → 0.3.0). 상세: `contracts/CHANGELOG.md` 0.3.0.
- 채택 결정과 근거: CR be03 §4-1·§4-2(FE 의견 반영). `form` 자유 텍스트, `specification` 자유 텍스트 nullable, 제품 목록의 `latest_process_version`은 공정 버전 CR로 이월.
- 미정 또는 임시 가정: 역할 권한(TECH-006), 운영 인증(TECH-002), `form` 허용값 목록(확정되면 enum으로 좁히는 비호환 변경 필요), 값 객체 이름(`known` vs 용량의 `finite`)을 공정 CR에서 재검토.
- 상대 담당자에게 필요한 조치: **FE** — BE-REQ-012·013·014(`request-from-backend.md`), 0.3.0 CHANGELOG의 "프런트가 해야 할 일". **사용자/조정자** — BE-03 승인 해석 확인, PR 머지(0.3.0은 아직 main에 없음), 서버 실행(Backend 세션 의존).

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체, 마지막) | backend/ (.venv) | Python 3.12.10, SQLAlchemy 2.1.6, PostgreSQL 16(WSL Docker) | 0 | **219 passed**, 경고 4건(아래) |
| `python -m ruff check .` | backend/ | ruff 0.17.2 | 0 | All checks passed |
| `python -m simulation_platform.api.export_openapi` → `contracts/openapi.json` 비교·해시 | backend/ | — | 0 | sha256 4821718a… 일치(R-FE-14 반영 후, 이전 a4610740…) |
| `python scripts/generate_contract_examples.py ../contracts/examples/first-scope` | backend/ | test DB | 0 | 30 examples |
| `alembic upgrade head` (개발 DB) | backend/ | — | 0 | 0002 → 0003 |
| `python scripts/seed_demo_data.py --yes` (개발 DB) 2회 | backend/ | — | 0 | 1회: `catalog: {'skipped': False, 'products': 8, 'materials': 4}`, 2회: `skipped: True`(멱등) |
| 개발 서버(`run_dev_api.ps1`, 포트 8000) 기동 후 호출 | backend/ | uvicorn 0.54.0, local 인증 | — | `/health` 200, `/me`(프로젝트 status `active`·role), `/products` 8건·`/materials` 4건, `/assets?limit=1` next_cursor 있음. 서버는 현재 실행 중 |
| `python tools/check_workspace.py` | 루트 | Python 3.12.10 | 0 | PASS(승인 해시 검증 포함, 문서·구조만) |

신규 테스트: DB 제약 8건(`test_catalog_constraints.py`), API 43건(`test_api_catalog.py`: 생성·검증 15종 default_spec·충돌·권한·격리·ETag·병합 PATCH·동시성·목록·cursor·감사), 시험 시드 검증 확장, 계약 테스트(경로 일치·`DefaultSpec` 닫힘·`/me` status·예제 DTO 일치·상태 해시).

## 미실행 테스트와 이유
- RLS 정책: 미구현(앱/migration DB 계정 분리 선행).
- FE 연동·generated client 생성: FE 담당, 미실행.
- 부하·성능, 대량 데이터: 미실행.
- 새 venv에서의 lock 재설치 검증: 의존성 변경이 없어 미실행.

## 남은 위험·질문
- pytest 경고 4건: `starlette.testclient`의 httpx 폐기 경고와 FastAPI·pydantic의 `UnsupportedFieldAttributeWarning`(alias, 기능 영향 없음) — 후속 정리 대상.
- 개발 API 서버는 Backend 세션이 살아 있는 동안만 보장된다(프로세스는 세션 종료 시 중지될 수 있음). 장기 운영 방식은 사용자 결정.
- 계약 승인은 사용자의 "다음 개발 진행" 지시 해석이다(위).
- 시험 데이터를 지우는 스크립트는 없다(초기화는 로컬 DB 볼륨 삭제 후 migration·시드 재실행, 사용자 승인 필요).

## 다음 세션의 첫 작업
- `request-from-frontend.md`(FE worktree)에서 BE-REQ-012·013·014 답변 확인.
- 공정 버전·그래프 CR 작성(FE 화면 모델·03 §4~7 대조 어긋남 목록 포함, FE에 전달 약속), 제품 목록의 `latest_process_version` 추가 필드 설계. 이어서 그룹·별칭, 프로젝트·자산 보관, RLS·DB 계정 분리.
