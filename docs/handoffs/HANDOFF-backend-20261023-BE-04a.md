# HANDOFF-backend-20261023-BE-04a
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Backend(+단일 DB 담당) / BE-04a / 공정 버전·그래프(ERD §5·§9·§14, 03 §4~8)
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-backend-core / 99c5137(origin/main) / 코드 18754cf, 계약·문서·시드 후속 커밋은 `git log`로 확인
- 계약 버전 / OpenAPI hash / 승인 scope: **0.4.0**(머지 대기), sha256 `1da94db09abb06bb0a08cc6ee40c58d97f5aac85c28d3ec0364e7a4f4b77cb45`, 기준 commit `18754cf` / `process-versions` 추가(앞선 3개 scope 유지). 0.3.0·0.3.1 게시본은 바꾸지 않았다.
- 승인 근거: CR be04 제시 후 사용자의 "다음 단계 진행해 줘"를 **권장안(BE-04a 범위) 승인으로 해석**. 명시적 승인 문구 없음, FE의 BE-REQ-015 답변 없음 → 사용자·FE가 정정 가능(`contract-status.json` approval_record).
- 수정 파일: backend/{migrations/versions/0004…, src/simulation_platform/{models/process.py, schemas/{process,catalog}.py, domain/{process,errors}.py, repositories/process.py, services/{process,catalog}.py, api/v1/process_versions.py, api/app.py}, scripts/{seed_demo_data,generate_contract_examples}.py, tests/**, README}, contracts/{openapi.json, contract-status.json, CHANGELOG.md, 04_api_contract.md(§4.1), examples/first-scope/*(40개)}, docs/{change-requests/CR-…-be04(§9), planning/STATUS.md, agents/TASK_BOARD.md, communication/request-from-backend.md}
- 실제 구현 내용:
  - migration 0004: `process_version`·`flow_node`·`process_step`·`resource_requirement`·`requirement_candidate`·`flow_edge`. 제품당 열린/승인 버전 각 1개(부분 unique), 복합 FK `(project_id, …)`, 전이 표·내용 동결 트리거(`process_version_guard`), 자식 5개 테이블은 부모가 draft일 때만 변경(`process_graph_child_guard`), 노드 종류별 asset 종류 CHECK.
  - API 11개: 버전 목록/생성(승인본 그래프를 새 id로 복사), 조회·수정, 그래프 조회/PUT(전체 교체), 단계 PATCH, `validate?scope=knowledge|run_template`, 제출·반려·승인. ETag는 버전 단위.
  - 규칙 JSON은 판별자가 있는 닫힌 모델. 미정은 경고, `run_template`에서만 필수 미정이 오류. 지원 handler 7종, 그 외는 `UNSUPPORTED_HANDLER`(검증 항목).
  - 제품 응답에 `current_process_version`·`latest_process_version`(nullable, 추가 필드).
  - 시험 시드: 프로젝트 A에 P-001 승인본(확정된 직선 그래프), P-002 초안, P-003 검토 중(미정 경고만), P-004 승인본+복사 초안.
- DB migration head / 적용 DB / 데이터 변환: **0004** / 테스트 DB(매 세션 재생성), 로컬 개발 DB `simulation_platform`(0003→0004, 시험 시드 2회 실행: 1회 `process: versions 5`, 2회 `skipped`) / 변환 없음.
- 추가·변경 API / 예제 / 재생성 필요 여부: 신규 11개 + 제품 응답 필드 2개(비파괴). **FE generated client 재생성 필요**(0.3.1 → 0.4.0). 상세: `contracts/CHANGELOG.md` 0.4.0, 04 §4.1.
- 채택 결정과 근거: CR be04 §6 권장안. 원안과 달라진 점은 CR §9(추가 `PATCH /process-versions/{v}`; 이월 `execution_rule`·`input_match_policy`·`condition_rule`·`parameter_override`).
- 미정 또는 임시 가정: 역할 권한(TECH-006), 운영 인증(TECH-002), 03 §7과 엔진 문서 07 §6~7의 어휘 불일치(03 우선), 열거값 일부(CR §9), FE의 `assumed` 단계 상태 제거 등 FE 의견(BE-REQ-015).
- 상대 담당자에게 필요한 조치: **FE** — BE-REQ-015 의견, CHANGELOG 0.4.0의 "프런트가 해야 할 일". **사용자/조정자** — 승인 해석 확인, PR 머지.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ (.venv) | Python 3.12.10, PostgreSQL 16(WSL Docker) | 0 | **310 passed**, 경고 5건(pydantic alias 경고·starlette 테스트클라이언트, 기능 영향 없음) |
| `python -m ruff check .` | backend/ | ruff | 0 | All checks passed |
| OpenAPI 후보 → `contracts/openapi.json` 바이트 일치·해시 | backend/ | — | 0 | sha256 1da94db0… = `contract-status.json` |
| `python scripts/generate_contract_examples.py ../contracts/examples/first-scope` | backend/ | test DB | 0 | 40 examples |
| `python tools/check_workspace.py` | 루트 | Python 3.12.10 | 0 | PASS(문서·구조만, API/DB/SimPy 검증 아님) |
| `alembic upgrade head` (개발 DB) | backend/ | — | 0 | 0003 → 0004 (`alembic current` = 0004 head) |
| `seed_demo_data.py --yes` (개발 DB) 2회 | backend/ | — | 0 | 1회 `process: versions 5`, 2회 `skipped: True`(멱등) |
| 개발 서버(포트 8000) 재기동 후 `GET /products` | — | local 인증 | — | P-001 approved/v1, P-002 draft, P-003 in_review, P-004 draft(current v1), P-005 없음 |

신규 테스트: DB 제약 19건(`test_process_constraints.py`), API 42건(`test_api_process.py`), 규칙 단위 15건(`test_process_rules.py`), 시험 시드 공정 샘플 1건, 계약·예제 테스트 갱신.

## 미실행 테스트와 이유
- RLS: 미구현. FE 연동·generated client 생성: FE 담당, 미실행.
- SimPy handler 실행(공정 → 엔진): 엔진 미구현, 미실행. 검증 규칙은 순수 함수 단위 테스트만.
- 부하·대량 그래프 성능: 미실행.
