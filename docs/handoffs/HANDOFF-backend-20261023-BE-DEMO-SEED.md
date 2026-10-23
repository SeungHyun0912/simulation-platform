# HANDOFF-backend-20261023-BE-DEMO-SEED
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Backend / BE-DEMO-SEED(FE 요청 BE-REQ-006 이행) + FE 소통 파일 2차 답변 / 해당 없음(개발 도구)
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-backend-core / d0a9f38(main `b55c98a` 병합 후) / 커밋 후 `git log`로 확인
- 계약 버전 / OpenAPI hash / 승인 scope: 0.2.0 / `da54371140b994aca48a9ac19653785d6dbc674bde959615a9d4964efdc2a33a` / **계약 변경 없음**
- 수정 파일: backend/scripts/{seed_demo_data.py, run_dev_api.ps1}, backend/tests/integration/test_seed_demo_data.py, backend/README.md, docs/communication/request-from-backend.md, docs/change-requests/CR-backend-20261023-be03-products-materials.md(§4-1·§4-2), 이 문서
- 실제 구현 내용:
  - 시험 데이터 시드: 프로젝트 3개(Asia/Seoul·UTC·America/New_York, 조직 2개), 사용자 추가 3명(nobody/mixed/other-org-admin), 프로젝트 A에 자산 60건+보관 1건(설비 25·저장 25·도킹 10), 버전 상태 ①~⑦, 용량·규칙 케이스, 프로젝트 B의 같은 코드(`EQ-001`). 프로젝트·사용자는 고정 UUID(멱등), 자산·버전은 실제 API 경로로 생성. 이미 시험 자산이 있으면 건너뜀.
  - `run_dev_api.ps1`: 개발 DB + `AUTH_MODE=local`로 uvicorn 실행.
  - 소통 파일: FE의 BE-REQ-001~011 답변 확인(`완료` 이동), 신규 BE-REQ-012·013, Part 2에 2차 답변.
  - CR be03에 FE 의견(§4-1)과 `/me.projects[].status` 보강(§4-2) 반영.
- DB migration head / 적용 DB / 데이터 변환: head 0002(변경 없음) / **로컬 개발 DB `simulation_platform`에 시험 시드 실행**(프로젝트 4·사용자 6·자산 62·버전 19 확인) / 마이그레이션 없음
- 추가·변경 API / 예제 / 재생성 필요 여부: 없음(재생성 불필요).
- 채택 결정과 근거: 시험 데이터는 DB에 직접 넣지 않고 서비스 계층을 통해 생성(검증·감사·상태 전이 트리거 통과). 실제 설비 96대·공간 22곳은 미승인 값을 섞을 수 있어 사용하지 않음("[시험]" 이름·`EQ-nnn` 가상 코드).
- 미정 또는 임시 가정: 개발 DB를 시험 데이터로 채운 것은 로컬 개발용이다(운영 불가). 서버 실행 주체(BE-REQ-004)는 사용자 결정 대기.
- 상대 담당자에게 필요한 조치: FE — BE-REQ-012(시험 데이터 충족 여부·R-FE-13 답변 확인)·BE-REQ-013(CR be03 확인사항). 사용자 — BE-REQ-004 결정, CR be03 승인.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_seed_demo_data.py` | backend/ (.venv) | PostgreSQL 16(WSL Docker) | 0 | 7 passed |
| `python scripts/seed_demo_data.py --yes` (DATABASE_URL=개발 DB) | backend/ | 〃 | 0 | `assets: {'skipped': False, 'assets': 61}` |
| 같은 명령 재실행 | backend/ | 〃 | 0 | `assets: {'skipped': True}`(멱등) |
| 개발 DB 집계(`psql`) | WSL | 〃 | 0 | project 4 / app_user 6 / asset 62 / asset_revision 19, 상태별 approved 6·draft 10·in_review 2·superseded 1 |
| `scripts/run_dev_api.ps1 -Port 8766` 기동 후 `/health`·`/me`·`/assets?sort=code` 호출 | backend/ | uvicorn, local 인증 | — | 모두 200, 기동 후 종료 확인(남은 프로세스 없음) |
| `python tools/check_workspace.py` | 루트 | Python 3.12.10 | 0 | PASS(문서·구조만) |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체, 커밋 직전) | backend/ (.venv) | Python 3.12.10, PostgreSQL 16 | 0 | **156 passed** |
| `python -m ruff check .` | backend/ | ruff 0.17.2 | 0 | All checks passed |

## 미실행 테스트와 이유
- FE에서 시험 데이터로 화면을 확인하는 작업: FE 담당, 미실행(BE-REQ-012로 확인 요청).
- 새 venv에서의 전체 테스트: 의존성 변경이 없어 미실행.
- 부하·성능: 미실행.

## 남은 위험·질문
- 시험 시드는 개발 DB만을 대상으로 한다. 다른 DB URL에 실수로 실행하지 않도록 `--yes`와 대상 DB 출력, production 거부를 두었으나 `_test`/개발 이름 검사는 하지 않는다(개발용 시드와 동일 정책).
- 시험 데이터를 지우는 스크립트는 없다. 초기화는 `docker compose down -v`(볼륨 삭제, 로컬 전용) 후 migration·시드 재실행으로 한다(사용자 승인 필요).

## 다음 세션의 첫 작업
- `request-from-frontend.md`에서 BE-REQ-012·013·004 답변 확인.
- CR be03 승인 시: migration 0003(product·material_definition) + API + `/me` 보강 → contract 0.3.0.
