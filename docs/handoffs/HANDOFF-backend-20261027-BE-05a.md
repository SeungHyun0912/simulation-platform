# HANDOFF-backend-20261027-BE-05a
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-05a**(임시 ID, 로드맵 C-01·C-02·C-04·C-05·C-06: 시나리오 버전과 실행 사전검증). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit / 변경 commit: worktree-backend-core-be15 / `22f5c1f`(origin/main, PR #40 CR 병합 후) / 구현 `f776dc3`, 계약 승격·문서는 PR 본문과 `git log` 참조
- 승인 근거: CR be07 / 보드 **DEC-007**. 사용자가 PR #40을 머지하고 "권당안대로 진행해줘"(2026-10-27)라고 지시해 CR §5의 권장안 1~5를 승인으로 기록했다.
- 보드 확인: 착수 전 `docs/collaboration/INTEGRATION_BOARD.md`(`22f5c1f`)를 읽었다. API 대상 새 결함·관찰 없음.
- 계약 버전: **0.6.1 → 0.7.0**(추가만, sha256 `d687fdfd68a3776b36f5e03d1afdf61bfc0c6af5d7bdfe9871d67e5090915b09`). migration head **0006 → 0007**.

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/migrations/versions/0007_scenario_versions.py`(신규) | `scenario`·`scenario_version`·`scenario_product`·`scenario_asset`, 동결 트리거 2개, `process_version (project_id, product_id, id)` 유일 제약 |
| `backend/src/simulation_platform/models/{scenario,process,__init__}.py` | 시나리오 모델, 공정 버전 유일 제약(모델·migration 일치) |
| `backend/src/simulation_platform/schemas/scenario.py`(신규) | 요청·응답 DTO(닫힌 객체, decimal 문자열·정수 구분, 종료 규칙 판별자) |
| `backend/src/simulation_platform/domain/{scenario,errors}.py` | 사전검증 순수 규칙(SCN-*·엔진 컴파일 결과 수집), 오류 3종 |
| `backend/src/simulation_platform/{repositories,services}/scenarios.py`, `api/v1/scenarios.py`, `api/app.py` | 저장소·서비스·라우터 10개 |
| `backend/tests/integration/test_api_scenarios.py`(신규 12건), `tests/unit/test_scenario_rules.py`(신규 3건), `tests/contract/*`, `tests/integration/test_schema_constraints.py` | API·DB 동결·참조 시험, 계약 범위·스냅샷, head 0007 |
| `backend/scripts/generate_contract_examples.py`, `contracts/examples/first-scope/{scenario.create,scenario-version.patch,scenario-version.validate,error.scenario-not-runnable}.json` | 실제 API 응답에서 만든 예제 4개 |
| `contracts/openapi.json`, `contract-status.json`, `04_api_contract.md`(§2 오류 코드, §5.1), `CHANGELOG.md` | 계약 0.7.0 승격 |
| `docs/change-requests/CR-backend-20261026-be07-scenario-versions.md` | 상태·§7 구현 결과(원안과의 차이) |
| `docs/collaboration/INTEGRATION_BOARD.md`, `docs/planning/STATUS.md`, `docs/agents/TASK_BOARD.md`, `docs/communication/request-from-backend.md` | DEC-007 결정, §9 API 행, 현황, FE 공지 |

## 구현 내용(04 §5.1)
- **초안 저장과 실행 가능 판정 분리:** 저장 시에는 참조만 검사(`SCN-REF-001~004`: 이 프로젝트의 제품·그 제품의 승인됐던 공정 버전·그 자산의 승인됐던 자산 버전). 도착 없음·가정 사유 없음 등은 저장을 막지 않고 사전검증 오류로 보인다.
- **사전검증:** 시나리오 수준(`SCN-PROD-001`, `SCN-ARR-001`, `SCN-ASM-001` 오류 / `SCN-ASSET-001·002` 경고) + 제품마다 엔진 `compile_snapshot` 결과(오류·사용한 가정·면제 항목)를 **번역하지 않고** 반환. 고정한 자산 버전의 용량·배출 규칙이 엔진에 들어가고(C0-05), 고정하지 않은 자산은 모르는 값으로 판정(무제한 아님).
- **자산 버전 자동 고정:** `products`만 저장하면 공정이 참조하는 자산(공간 노드·설비 후보) 중 미고정을 현재 승인 버전으로 채움. `assets`를 함께 보내면 그대로.
- **승인:** project admin, 사전검증 오류 0일 때만(422 `SCENARIO_NOT_RUNNABLE`). 승인 후 버전·제품·자산 고정은 DB 트리거가 동결(직접 SQL 수정도 거부). 새 초안은 최근 승인 버전(또는 지정 버전)을 복사.
- **격리:** 모든 쿼리 `project_id` 조건, 복합 FK로 다른 제품의 공정 버전·다른 자산의 자산 버전을 DB가 거부, 비멤버·타 프로젝트 경로 404.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_api_scenarios.py` | backend/ (로컬 PostgreSQL 16) | 0 | 12 passed |
| `python -m pytest -q tests/contract tests/unit` | backend/ | 0 | 122 passed(계약 스냅샷·해시 0.7.0 일치) |
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ (로컬 PostgreSQL 16, WSL Docker) | 0 | **558 passed, 경고 2건(테스트 클라이언트 등, 기능 영향 없음), 154.5초** |
| `python tools/check_workspace.py` | 루트 | 0 | PASS(문서·구조만) |

## 계약 및 상대 영역에 대한 영향
- **계약 0.7.0(추가만):** 새 operation 10개, 오류 코드 3개. 기존 operation·필드 변경 없음 → 기존 FE 화면 영향 없음.
- **Frontend:** 시나리오 화면을 만들 때 타입 재생성. `compile_issues[].rule_id`는 열린 목록이라 enum으로 고정하지 말고 `message`를 표시. 소통 파일 공지(16차).
- **DB:** migration 0007(새 테이블만, 이관 없음). 공유 DB 자동 적용 없음.
- **조정자:** ERD §6의 `layout_version_id`·`calendar_rule`·`initial_wip`·`engine_options`는 만들지 않았다(정의 없음, CR §4).

## 통합 검증 담당자의 재검증 방법
1. `cd backend; $env:REQUIRE_DB="1"; .\.venv\Scripts\python.exe -m pytest tests/integration/test_api_scenarios.py -q` → 12 passed.
2. 수동(API): 승인된 공정 버전과 승인된 자산 버전이 있는 프로젝트에서 `POST /scenarios` → `PATCH /scenario-versions/{v}`(`products`만) → 응답 `assets`에 현재 승인 버전이 채워졌는지 → `POST …/validate`의 `runnable` → admin `POST …/approve`(If-Match) → 승인본 `PATCH`가 409 `VERSION_IMMUTABLE`.
3. 미정: `assets: []`로 고정을 비우면 사전검증에 `BUFFER_POLICY_UNKNOWN`(엔진 코드 그대로)과 경고 `SCN-ASSET-001`, `unbounded_buffers` 가정만 넣으면 `SCN-ASM-001`, 사유를 넣으면 `assumptions_used=[UNBOUNDED_BUFFERS]`로 실행 가능.
4. 계약: `contracts/contract-status.json` 0.7.0·해시, `tests/contract` 통과, 예제 4개.
5. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`.

## 미정·미실행·한계
- 실행(스냅샷·job queue·worker·이벤트 저장·지표)은 없다 — CR be08. 사전검증은 컴파일만 하고 실행하지 않는다.
- 초기 WIP, 근무 달력, 주기·확률 입고, 완제품 목표 종료, 배치 버전은 정의가 없어 제외.
- 실제 기준정보(DEMO-WIRE) 시나리오는 시드하지 않았다: 공정이 모두 draft라 시나리오에 넣을 수 없다(승인은 사용자 결정).
- 미실행: FE 화면 확인, 대규모·성능, RLS.
