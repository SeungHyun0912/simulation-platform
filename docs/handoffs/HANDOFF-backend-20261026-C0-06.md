# HANDOFF-backend-20261026-C0-06
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-C0-06**(임시 ID, 로드맵 C0-06 잔량 fixture: 동일 제품 이월·제품 전환 폐기·scope 가정 표시). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit / 변경 commit: worktree-backend-core-be11 / `93d63b9`(origin/main, INT 3회차 병합 후) / PR 본문과 `git log` 참조
- 보드 확인: 착수 전 `docs/collaboration/INTEGRATION_BOARD.md`(`93d63b9`)를 읽었다. INT-F-002는 3회차에서 해소, API 쪽 새 관찰 INT-O-001, 결정 대기 DEC-003·004. 보드 §5에는 Backend 정식 TASK가 없어 사용자의 직접 지시("남은 기능 개발 계속 진행")를 승인 근거로 했다.
- **순서 조정:** 직전 인계에서 C0-05(IN/OUT 용량·막힘)를 먼저 예고했으나, 배출 정책 어휘가 03 §7(자산 버전 0.2.0 구현)과 07 §7로 갈려 결정 없이 구현하면 의미를 지어내게 된다 → 보드 **DEC-006** 등록 후 보류하고, 의미가 03 §6·`residual_rule`로 정해진 C0-06을 먼저 했다.
- 선행 작업·계약 버전: BE-C0(C0-01~03), BE-C0-04(다중 공정), 계약 **0.6.0**(변경 없음, 해시 `509a71f1…38ef`), migration head 0006(변경 없음).

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/src/simulation_platform/simulation/compiler/{assumptions,model,compile}.py` | `ResidualModel`, `ScenarioAssumptions.residual_scope`, 이월 단계 검사(`RESIDUAL_SCOPE_UNKNOWN`·`RESIDUAL_SCOPE_INVALID`·`RESIDUAL_JOIN_MODE_UNKNOWN`) |
| `backend/src/simulation_platform/simulation/handlers/{base,standard}.py` | 계획 함수가 이월받은 길이를 받는다(`split_length`는 투입+이월 길이를 같은 길이 풀로 분할), `OperationPlan.carried_in_m` |
| `backend/src/simulation_platform/simulation/runtime.py` | 잔량 풀(범위별), 이월·제품 전환·실행 종료 처리, `RunResult.residuals`, 이벤트 `RESIDUAL_CREATED/CARRIED/DISCARDED` |
| `backend/src/simulation_platform/simulation/{items,monitoring/events}.py` | `LineageRecord.carried_in_m`(길이 합계 검증에 반영), 잔량 이벤트 상수 |
| `backend/tests/simulation/test_residuals.py`(신규 14건), `fixtures.py`, `test_runtime.py` | 잔량 시험, fixture의 잔량 규칙·산출 기준 지정, 기존 기대값 갱신 |
| `docs/collaboration/INTEGRATION_BOARD.md` | §7 DEC-005·DEC-006, §9 API 행(낡은 중복 API 행 정리), §13.7 INT-O-001 API 답변 |
| `docs/decisions/ADR-0002-simpy-engine-boundary.md`, `docs/planning/STATUS.md`, `docs/agents/TASK_BOARD.md` | 결정 10, 현황 |

## 구현 내용(03 §6, 07 §3 ResidualPool)
- **이월(`carry_same_product`)**: 분할에서 남은 길이를 범위별 잔량 풀에 넣고, 같은 범위의 다음 작업이 투입 길이에 더해 분할한다. 물리 접속이 아니라 **길이 풀(`abstract_length_pool`)** 로만 표현하며, 이 표시가 없으면 컴파일이 막는다.
- **범위(scope)**: `machine`(설비)·`product`(공정 버전)·`operation`(공정 버전+단계)·`lot`. 공정에 scope가 미정이면 **시나리오 가정 `residual_scope`로만** 정하고 결과의 가정 목록에 남긴다. lot 범위인데 작업물에 lot이 없으면 실행 실패(`RESIDUAL_LOT_UNKNOWN`).
- **제품 전환(`on_product_change`)**: 풀의 잔량이 다른 제품의 것이면 `discard`→폐기 이벤트(`PRODUCT_CHANGE`), `carry`→이어 받음, `unknown`→**그 상황이 실제로 생길 때만** 실패(`RESIDUAL_PRODUCT_CHANGE_POLICY_UNKNOWN`). 같은 제품만 흐르면 정책이 필요 없다.
- **실행 종료(`on_run_end`)**: 정상 완료된 실행에만 적용(`discard`→폐기 이벤트 `RUN_END`, `carry`→남김, `unknown`→처리하지 않고 미정으로 보고). 관측 중단·정체는 `open`으로 보고. 모두 `RunResult.residuals`에 남는다.
- **계보**: `carried_in_m`를 기록하고 "자식 + 잔량 = 부모 + 이월받은 길이"로 물량 보존을 검증한다.
- 이월하지 않는 단계(`none`·`unknown`)에서 잔량이 생기면 지금처럼 실패(성공으로 덮지 않음). 이월 단계는 실제 시작 시점의 풀로 계획해야 하므로 설비를 쥔 뒤 계획한다(이월 없는 단계는 설비를 쥐기 전에 계획해 일찍 실패).
- 사례(시험 전용 입력, P01 쉬스와 같은 수치): 1,000m 보빈 3개를 300m로 → `300×3+100`, `(1,000+100)→300×3+200`, `(1,000+200)→300×4+0` = **300m×10, 합계 3,000m**(문서 08 §4의 P01 규칙과 같은 결과).

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m pytest -q tests/simulation` | backend/ (.venv, DB 불필요) | 0 | **83 passed**(컴파일 26 + 실행 31 + 공유 자원 12 + 잔량 14; 실행 시험은 잔량 이월 매개변수 1건을 잔량 시험으로 옮김) |
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **503 passed**, 경고 4건(starlette 테스트클라이언트·pydantic alias, 기능 영향 없음) |
| `python tools/check_workspace.py` | 루트 | 0 | PASS(문서·구조만, 엔진/API/DB 검증 아님) |

## 계약 및 상대 영역에 대한 영향
- **계약·API·DB: 영향 없음**(엔진 내부). 계약 변경이 필요한 두 가지는 구현하지 않고 결정 요청만 등록했다: **DEC-005**(INT-O-001, 빈 공정의 실행 판정), **DEC-006**(C0-05 배출 정책 어휘).
- **Frontend: 영향 없음.**
- **엔진 내부 인터페이스(추가만):** handler `plan(step, item, carried)`의 세 번째 인자(기본 0), `RunResult.residuals`, `LineageRecord.carried_in_m`, 이벤트 3종. `ScenarioAssumptions.residual_scope`.

## 통합 검증 담당자의 재검증 방법
1. `cd backend; .\.venv\Scripts\python.exe -m pytest tests/simulation -q` → 83 passed.
2. 핵심: `tests/simulation/test_residuals.py::test_three_bobbins_of_1000m_become_ten_300m_units_by_carrying_the_remainder`(300m×10, 이월 100·200, 계보 균형).
3. 미정 처리: `test_carry_needs_a_scope_which_only_a_scenario_assumption_may_fill`, `test_product_change_with_unknown_policy_fails_only_when_it_actually_happens`, `test_residual_left_at_the_end_follows_on_run_end_and_is_reported`.
4. 관측 중단: `test_residual_is_not_settled_when_the_run_was_cut_by_the_horizon`(종료 정책을 적용하지 않고 `open`).
5. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`(실제 PostgreSQL 필요).
6. 보드: §9 API 행·§7 DEC-005/006·§13.7 INT-O-001 답변이 병합본에 있는지.

## 미정·미실행·한계
- 실제 기준정보 P01은 잔량 범위(scope)·생산 종료 처리가 문서상 미정이라 시나리오 가정 없이는 컴파일되지 않는다(`RESIDUAL_SCOPE_UNKNOWN`, 다른 미정과 함께). P05 절연의 4,000m 잔량은 처리 정책이 미정(`unknown`)이라 실행되면 실패로 드러난다.
- 이번 범위 밖: 중량 잔량(kg), 잔량 손실 지표(C-16), IN/OUT 용량·막힘(C0-05, DEC-006 대기), AL 합류(C0-07), 시나리오·job queue.
- 미실행: 대규모·성능, RLS.
