# HANDOFF-backend-20261026-DEC005-C0-05
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-DEC-005**(임시 ID, 보드 DEC-005: 빈 공정의 실행 판정) + **BE-C0-05**(임시 ID, 로드맵 C0-05 IN/OUT blocking: 명시 용량·해제 정책별 대기). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit / 변경 commit: worktree-backend-core-be12 / `1b79d76`(origin/main, PR #36·#37 병합 후) / `d5b1ce9`(DEC-005 코드·시험), `337d74d`(계약 0.6.1 문서·보드 결정 기록), C0-05 커밋은 PR 본문과 `git log` 참조
- 보드 확인: 착수 전 `docs/collaboration/INTEGRATION_BOARD.md`(`1b79d76`)를 읽었고, 저장 직전 origin/main의 보드가 그 뒤 바뀌지 않았음을 확인했다(`git diff HEAD origin/main`에 내 변경만).
- 승인 근거: 사용자 지시 "머지 완료 했고 권장사항으로 진행해 줘"(2026-10-26)를 DEC-003(시드 유지)·DEC-005(VAL-GRAPH-010 실행 차단)·DEC-006(0.2.0 `release_rule` 정본) **권장안 승인**으로 해석해 보드 §7에 기록했다(정정 가능).
- 선행 작업·계약 버전: BE-C0-04, BE-C0-06, 계약 **0.6.0 → 0.6.1**(OpenAPI 해시 불변 `509a71f1…38ef`, 동작 패치), migration head 0006(변경 없음).

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/src/simulation_platform/domain/process.py` | DEC-005: `RUN_BLOCKING`에 `VAL-GRAPH-010` 추가 |
| `backend/tests/unit/test_process_rules.py`, `backend/tests/integration/test_api_process.py`, `backend/tests/contract/test_openapi.py` | DEC-005 시험 2건, 계약 버전 0.6.1 |
| `contracts/04_api_contract.md`, `contracts/contract-status.json`, `contracts/CHANGELOG.md` | 0.6.1 패치(실행 판정 승격 목록에 `VAL-GRAPH-010`) |
| `backend/src/simulation_platform/simulation/compiler/{snapshot,model,compile}.py` | `ProcessSnapshot.assets`, `OutPolicy`, `StepModel.out_policies`, `RuntimeModel.spaces`, 공간 용량·OUT 정책 검사 |
| `backend/src/simulation_platform/simulation/resources/spaces.py`(신규), `resources/__init__.py` | `SpaceAllocator`(자리 수, FIFO, 끼어들기 없음) |
| `backend/src/simulation_platform/simulation/runtime.py` | 공간 자리 차지·반환, 도착 대기, OUT 막힘(hold)·OUT 보관(release_after_out), 일괄 인계를 설비 해제 전에 |
| `backend/src/simulation_platform/simulation/monitoring/events.py` | 이벤트 `OUT_BLOCKED`·`OUT_UNBLOCKED`·`OUT_STORED`·`ENTRY_WAITING`, 설비 상태 `BLOCKED` |
| `backend/tests/simulation/test_spaces.py`(신규 20건) | C0-05 컴파일·실행·배정기 시험 |
| `docs/collaboration/INTEGRATION_BOARD.md` | §7 DEC-003·005·006 결정 기록, §9 API 행 |
| `docs/decisions/ADR-0002-simpy-engine-boundary.md`, `docs/planning/STATUS.md`, `docs/agents/TASK_BOARD.md` | 결정 11(DEC-006 대응표), 현황 |

## 구현 내용
### DEC-005(계약 0.6.1)
- 단계가 하나도 없는 공정: `validate?scope=run_template`에서 `VAL-GRAPH-010`이 **오류**(`field_path=/nodes`). knowledge에서는 지금처럼 경고라 승인(지식 등록)을 막지 않는다. OpenAPI 해시·필드 변경 없음.

### C0-05(07 §9, DEC-006)
- **공간 자리**: 승인된 자산 버전의 `storage_capacity`가 `finite`+`item`이면 자리 수, `unlimited`면 제한 없음, `unknown`·없음은 시나리오 `unbounded_buffers` 필요(무제한 가정 금지), `not_allowed`·item 외 단위는 컴파일 오류. 같은 asset은 공정이 달라도 하나의 용량(공정마다 용량이 다르면 실행 거부).
- **OUT 배출 정책(대응표)**: `block_machine_while_waiting` yes → hold, no → release_after_out(OUT 용량 unlimited 또는 finite item), OUT `not_allowed` → hold, 그 밖 → `OUT_RELEASE_POLICY_UNKNOWN`. **하류 공간이 유한할 때만** 요구한다(막힐 수 없는 곳에 정책을 강요하지 않음).
- **실행**: 작업물은 공간에 들어갈 때 자리를 쥐고 다음 단계가 설비를 확보해 가져갈 때 놓는다. 도착·milestone에서 다음 공간이 차면 `ENTRY_WAITING`. hold는 자리가 날 때까지 설비 `BLOCKED`(생산 정지 → 다음 산출이 늦어짐), release_after_out은 `OUT_STORED` 후 생산 계속(OUT이 차면 막힘). 일괄 인계는 설비를 놓기 전에 내보낸다.
- 사례(시험 전용 입력): 1단계 2,000m → 1,000m×2(33⅓분/보빈), 중간 공간 1자리, 2단계 100분/보빈, 원자재 2개. hold: 100분·500/3분에 막히고 400/3분·700/3분에 풀림, 설비1 해제 700/3분. release_after_out(OUT 1자리): 설비1 해제 400/3분(막힘 없는 경우와 같음).

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m pytest -q tests/simulation` | backend/ (.venv, DB 불필요) | 0 | **103 passed**(기존 83 + 공간 20) |
| `python -m ruff check src tests` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ (로컬 PostgreSQL 16, WSL Docker) | 0 | **525 passed**, 경고 1건(starlette 테스트클라이언트, 기능 영향 없음), 187.8초 |

## 계약 및 상대 영역에 대한 영향
- **계약 0.6.1**: OpenAPI 불변, 동작만 변경(빈 공정 실행 판정 오류). FE 타입 재생성 불필요. 빈 공정의 실행 판정 화면에 오류 1건이 보이며, 검증 오류 수를 고정 비교하는 FE·INT 시험이 있으면 갱신 필요.
- **C0-05: 계약·API·DB 영향 없음**(엔진 내부). 엔진 입력에 자산 버전(이미 0.2.0으로 게시된 응답 모양)을 더 받는다.
- **조정자**: 07 §7 배출 정책 어휘와 0.2.0 `release_rule`의 대응을 ADR-0002 결정 11로 기록했다. 07 문서 정정은 조정자 소유라 하지 않았다.

## 통합 검증 담당자의 재검증 방법
1. DEC-005: 노드 없는 초안 공정에 `POST …/process-versions/{id}/validate?scope=run_template` → `error_count=1`, `rule_id=VAL-GRAPH-010`, `field_path=/nodes`. `scope=knowledge`는 `error_count=0`. 시험: `tests/integration/test_api_process.py::test_empty_process_is_not_runnable_but_still_approvable_dec005`(PostgreSQL 필요).
2. `contracts/contract-status.json`의 `contract_version=0.6.1`, OpenAPI sha256이 0.6.0과 같은지(`tests/contract/test_openapi.py`).
3. C0-05: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/simulation/test_spaces.py -q` → 20 passed. 핵심 `test_hold_keeps_the_machine_blocked_until_the_next_space_has_a_slot`, `test_release_after_out_frees_the_machine_while_out_holds_the_output`, `test_out_policy_left_undecided_blocks_the_run`, `test_unknown_or_missing_space_capacity_is_not_treated_as_unlimited`, `test_a_space_that_feeds_and_receives_the_same_machine_can_stall`.
4. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`(실제 PostgreSQL 필요).

## 미정·미실행·한계
- 엔진에 자산 버전을 넣는 API·worker 경로(실행 snapshot 저장, C-07~C-10)는 아직 없다. 지금은 엔진 시험에서 snapshot에 직접 넣는다.
- 설비 IN 포트 용량·`dispatch_rule`(단계 간 직접 인계 대기)은 모형에 없다 → 그 대기는 계속 `unbounded_buffers` 가정이 필요하다.
- item 외 단위(`bobbin_slot`·`pallet_slot`·`kg`·`m2`)의 공간 용량은 작업물 개수 환산 규칙이 없어 실행하지 않는다.
- milestone 뒤 유한 공간은 작업물이 milestone에서 기다린다(설비 막힘으로 보지 않음).
- 실제 기준정보 공정은 자산 버전의 용량·배출 규칙이 대부분 unknown이라 시나리오 가정 없이는 컴파일되지 않는다(의도).
- 미실행: 대규모·성능, RLS, FE 화면 확인.
