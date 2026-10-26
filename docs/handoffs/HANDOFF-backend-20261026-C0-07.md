# HANDOFF-backend-20261026-C0-07
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-C0-07**(임시 ID, 로드맵 C0-07 AL 합류: 싱글 준비 후 configured10 산출, 소비/점유 표시). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit / 변경 commit: worktree-backend-core-be13 / `bf93a63`(origin/main, PR #38 병합 후) / PR 본문과 `git log` 참조
- 보드 확인: 착수 전 `docs/collaboration/INTEGRATION_BOARD.md`(`bf93a63`)를 읽었다. API 대상 새 결함·결정 없음, FE 요청 파일(`request-from-frontend.md`)에 미답변 항목 없음. 사용자 지시 "머지는 완료 했고 다음 개발 이어가줘"(2026-10-26)를 근거로 로드맵 다음 항목(C0-07)을 진행했다.
- 선행 작업·계약 버전: BE-C0-05, 계약 **0.6.1**(변경 없음, 해시 `509a71f1…38ef`), migration head 0006(변경 없음).
- 방향: 사용자 지시("공정·설비 정보는 사용자 입력으로 달라지므로 표준화된 기능에 먼저")에 따라 제품4 수치를 엔진에 넣지 않고, 분기·합류·확보 수·지정 산출·공급·준비 대기를 **공정 데이터(입력 spec·규칙)로만** 결정하는 표준 기능으로 만들었다.

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/src/simulation_platform/simulation/compiler/compile.py` | 위상 순서 경로(저장공간 분기·단계 합류·공급 간선), 입력별 확보 수(`_inputs`), 준비 대기(`_delay`), 지정 산출 규칙 검사 |
| `backend/src/simulation_platform/simulation/compiler/model.py` | `InputModel`, `DelayModel`, `StepModel.inputs/consume_policy/delay`, `NodeModel.next_keys` |
| `backend/src/simulation_platform/simulation/handlers/{base,standard}.py` | 계획 함수가 투입 묶음(tuple)을 받음, `configured_yield`·`supply_delay` 등록, `HandlerDef.batch/consume_policies` |
| `backend/src/simulation_platform/simulation/resources/pools.py`(신규), `resources/__init__.py` | `BatchPool`(묶음 단위 원자 확보, FIFO, 끼어들기 없음) |
| `backend/src/simulation_platform/simulation/runtime.py` | 입력 pool·묶음 확보 dispatcher, 여러 투입 작업, 준비 대기, supply·yield 관계, 소비 시점 |
| `backend/src/simulation_platform/simulation/{items,monitoring/events}.py` | `LineageRecord.parent_keys/accounting_mode`(`balanced`는 abstract_yield면 None), 이벤트 `PRECONDITION_DELAY_STARTED/FINISHED` |
| `backend/tests/simulation/test_join_supply.py`(신규 12건), `test_compiler.py`(2건 기대 변경) | C0-07 시험; 엔진 미구현 예시를 `output_units_by_time`로, 준비 대기는 이제 실행 |
| `backend/tests/integration/test_engine_real_catalog.py` | P04: 분기·합류 구조 오류가 사라지고 실제 미정(멀티신선 handler, 공급 입력 단위 수)이 남는 것을 고정 |
| `docs/decisions/ADR-0002-simpy-engine-boundary.md`, `docs/planning/STATUS.md`, `docs/agents/TASK_BOARD.md`, `docs/collaboration/INTEGRATION_BOARD.md` | 결정 12, 현황, §9 API 행 |

## 구현 내용(ADR-0002 결정 12)
- **경로**: material·supply 간선, 저장공간 → 여러 단계 분기(공유 입력 pool, 요청 순서), 단계 합류. 단계에서 갈라짐·비단계 합류·join 노드·precedence·순환은 이유 코드로 차단.
- **확보 수**: 간선에 연결된 입력 spec의 `unit_count`(작업당). 모일 때까지 일부만 가져가지 않음. 미정이면 `INPUT_COUNT_UNKNOWN`(가닥 수로 추정 금지).
- **configured_yield**: 지정 산출(단위 길이 × 개수, 순차), abstract_yield·per_operation만, 계보 `yield`(투입 전부 기록, 물량 보존 주장 안 함). `consume`=시작 때 소비, `transfer`=끝날 때 소비.
- **supply_delay**: 같은 작업물을 공급 상태로(복제 없음), `transfer`만.
- **준비 대기**: per_operation, `occupies_machine`(설비 쥔 채)·`releases_machine`(설비 쥐기 전).
- 사례(시험 전용 입력): 공간 하나 → 선행(1개, 100분) + 공급 준비(12개, 120분 대기·설비 점유) → 메인(1+12 확보, 32m/min, 4,000m×10). 메인은 120분에 시작해 245·370…1,370분에 산출 10개, 작업물은 13+10개(공급이 복제하지 않음). 26개 도착이면 메인 2회(두 번째는 설비가 비는 1,370분).

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m pytest -q tests/simulation` | backend/ (.venv, DB 불필요) | 0 | **115 passed**(기존 103 + 합류·공급 12) |
| `python -m ruff check src tests` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_engine_real_catalog.py` | backend/ (로컬 PostgreSQL 16) | 0 | 10 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ (로컬 PostgreSQL 16, WSL Docker) | 0 | **537 passed, 경고 1건(starlette 테스트클라이언트, 기능 영향 없음), 110.3초** |

## 계약 및 상대 영역에 대한 영향
- **계약·API·DB: 영향 없음**(엔진 내부, 계약 0.6.1 그대로). 이미 저장 가능한 필드(입력 spec `unit_count`, 간선 `target_input_spec_key`, `edge_kind=supply`, `precondition_delay`, `input_rule.consume_policy`)를 실행 의미로 연결했다.
- **Frontend: 영향 없음.** 참고: 합류 단계는 들어오는 간선마다 입력 spec 연결과 그 spec의 단위 수가 있어야 실행된다(편집기 안내 문구 후보).
- **엔진 내부 인터페이스(호환 깨짐, 엔진 안에서만):** handler `plan(step, items, carried)`의 두 번째 인자가 작업물 하나에서 투입 묶음(tuple)으로 바뀌었다.

## 통합 검증 담당자의 재검증 방법
1. `cd backend; .\.venv\Scripts\python.exe -m pytest tests/simulation -q` → 115 passed.
2. 핵심: `tests/simulation/test_join_supply.py::test_main_starts_when_both_inputs_are_ready_and_yields_the_configured_units`, `test_supply_does_not_duplicate_items_and_yield_is_not_a_conservation_claim`, `test_steps_sharing_a_space_take_their_batches_in_request_order`.
3. 미정 처리: `test_strand_count_is_never_turned_into_an_item_count`, `test_an_incomplete_batch_waits_and_is_reported_as_stalled`, `test_other_branches_joins_precedence_and_cycles_stay_blocked`.
4. 실제 기준정보: `$env:REQUIRE_DB="1"; python -m pytest tests/integration/test_engine_real_catalog.py -q` — P04에서 분기·합류 오류가 사라지고 `ENGINE_HANDLER_NOT_AVAILABLE`(멀티신선)·`INPUT_COUNT_UNKNOWN`(공급 입력 단위 수)이 남는다.
5. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`(실제 PostgreSQL 필요).

## 미정·미실행·한계
- 실제 P04는 여전히 컴파일되지 않는다(의도): 멀티신선 `output_units_by_time`(병렬 스트림, 동시/순차 미정), 싱글 메인 공급 입력의 단위 수(가닥 수 12만 있음), 소비 시점·확보 범위(VAL-INPUT-001), 준비 대기 발생 주기·feeder 점유(VAL-TIME-005), 운반 시간.
- 메인 작업 동안 공급 설비를 계속 점유하는지(feeder 점유)는 모형에 없다: 공급 단계의 설비는 그 단계가 끝나면 놓는다.
- 합류 단계가 여러 입력을 차례로 확보하는 동안 먼저 확보한 입력은 그 단계에 예약된 채 기다린다(공유 공간 사이의 원자 확보는 미구현).
- `consume_policy=reserve`, `acquire_scope=per_lot`, 단일 작업물 handler의 소비 시점 검사는 이번 범위 밖.
- 미실행: 대규모·성능, RLS, FE 화면 확인.
