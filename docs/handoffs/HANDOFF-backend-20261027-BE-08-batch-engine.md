# HANDOFF-backend-20261027-BE-08-batch-engine
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-08**(임시 ID, 사용자 2차 결정 반영: 일괄 확보 순차 산출·길이 없는 원자재·제품 전환 준비·잔량 폐기·입력 부족 진단). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be17 / PR #43 위 / 변경 commit은 PR 본문과 `git log` 참조
- 근거: CR be09 §9(사용자 답변 2026-10-27), 보드 DEC-010. 계약 **0.7.0 그대로**, migration head 0007 그대로(엔진·공정 데이터만 변경).

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/src/simulation_platform/simulation/handlers/{base,standard}.py` | `output_units_by_time` handler(투입 여러 개를 한 번에 확보, 산출을 순차로 하나씩, 단위 길이 또는 단위 무게), 길이 없는 작업물이 길이 단계에 오면 `INPUT_LENGTH_MISSING`으로 실패 |
| `backend/src/simulation_platform/simulation/compiler/{compile,model}.py` | 무게 단위 산출(`unit_weight_kg`), 준비 발생 시점 `on_product_change`(`setup_trigger`), 선속 시간은 산출 길이 필요(일괄 handler), abstract_yield 요구는 `configured_yield`만 |
| `backend/src/simulation_platform/simulation/items.py` | `WorkItem.length_m`은 없을 수 있다(해당 없음), `weight_kg` 추가, 계보 `balanced`는 길이 없는 쪽이 있으면 None |
| `backend/src/simulation_platform/simulation/runtime.py` | 도착의 길이·무게(둘 중 하나), 이벤트 수량은 있는 값만, 제품이 바뀔 때만 준비, 다른 제품이 설비에서 시작되면 설비별 잔량 처리, 입력 부족 진단(`INSUFFICIENT_INPUT`, `RunResult.shortfalls`) |
| `backend/src/simulation_platform/simulation/resources/pools.py` | 요청 단계 이름과 부족 진단(`head`) |
| `backend/scripts/seed_wire_factory.py` | 2차 결정 반영(P01 잔량 범위 설비, 멀티신선·태신선·싱글 메인 순차, 싱글 메인 공급 12보빈), 1차 반영 draft도 갱신 |
| `backend/tests/simulation/test_batch_by_time.py`(신규 10건), `test_compiler.py`, `test_join_supply.py` | 새 기능 시험, 기대값 갱신 |
| `backend/tests/integration/test_engine_real_catalog.py`, `test_seed_wire_factory.py` | 실제 공정 6종 컴파일·실행 시험, 2차 결정 값 대조 |
| `docs/…be09…`, `docs/collaboration/INTEGRATION_BOARD.md`, STATUS, TASK_BOARD | 결정·결과 기록 |

## 실제 공정 6종의 현재 상태(개발 DB `DEMO-WIRE`의 draft, 원자재 24개, 가정: 설비 독점·공간 용량 무제한)
| 제품 | 컴파일 | 실행 |
|---|---|---|
| P01 | 통과 | 완료(300m 보빈 240개, 4.6일) |
| P02, P03, P06 | 통과 | 완료(P06 96개 1.2일; P01+P02+P03 동시 17.1일) |
| P04 | 통과 | 정체 `INSUFFICIENT_INPUT`(1,100개, 96.6일, 싱글-12가 12개 필요한데 9개 남음) |
| P05 | 통과 | 실패 `RESIDUAL_POLICY_UNKNOWN`(절연 4,000m 잔량 정책 없음 — 사용자 결정 필요) |

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m pytest -q tests/simulation` | backend/ (.venv, DB 불필요) | 0 | **129 passed in 1.20s** |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_engine_real_catalog.py tests/integration/test_seed_wire_factory.py` | backend/ (로컬 PostgreSQL 16) | 0 | 통과(전체 실행에 포함) |
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ (로컬 PostgreSQL 16, WSL Docker) | 0 | **576 passed, 경고 2건(테스트 클라이언트 등, 기능 영향 없음), 321.8초** |
| `python scripts/seed_wire_factory.py --yes` | backend/ (개발 DB `simulation_platform`) | 0 | draft 6건 2차 반영(`reapplied` P01~P06) |

## 계약 및 상대 영역에 대한 영향
- **계약·API·DB: 영향 없음.** 개발 DB의 DEMO-WIRE draft 6건의 값이 바뀌었다(P01 잔량 범위, 순차 산출 설정, 싱글 메인 공급 입력 개수).
- **다음 계약 변경(승인 필요, CR be09 §9):** 잔량 규칙 `discard` 모드와 시나리오 도착의 `weight_kg`(길이 선택) → 계약 0.8.0(추가만), CR be08a와 함께 승격 예정.

## 통합 검증 담당자의 재검증 방법
1. `cd backend; .\.venv\Scripts\python.exe -m pytest tests/simulation/test_batch_by_time.py -q` → 새 기능(길이 없는 원자재, 순차 산출, 입력 부족, 제품 전환 준비, 잔량 폐기).
2. `$env:REQUIRE_DB="1"; python -m pytest tests/integration/test_engine_real_catalog.py -q` → 6종 컴파일과 P01·P02·P03·P06 실행, P04 입력 부족, P05 잔량 정책 실패.
3. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`.

## 미정·한계
- P05 절연 4,000m 잔량 처리(폐기 모드는 계약 변경 필요), 싱글 메인 순차 산출·공급 12보빈 해석 확인, P04 싱글-1 선속 4.4m/min 확인.
- 120분 준비는 제품 종류가 바뀔 때만 발생하는데 현재 6종에서는 한 설비를 한 제품만 써서 발생하지 않는다(사용자 확인 해석).
- 공간 용량·OUT 규칙은 승인된 자산 버전이 없어 가정(`unbounded_buffers`)으로 실행했다. 운반 자원은 무제한. 근무 달력 없음(24시간).
- 시나리오 API의 도착은 아직 길이 필수다(무게 입고는 엔진만 지원, API는 계약 0.8.0에서).
- 실행 플랫폼(CR be08a~c)은 구현 전이다.
