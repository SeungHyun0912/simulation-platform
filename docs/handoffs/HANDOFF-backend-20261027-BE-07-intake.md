# HANDOFF-backend-20261027-BE-07-intake
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-07**(임시 ID, 실행 가능 판정을 막던 도메인 미정 6묶음의 정리 결과를 공정 데이터·엔진에 반영). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be17 / `3225fd5`(origin/main, PR #42 병합 후) / 변경 commit은 PR 본문과 `git log` 참조
- 근거: CR be09(`docs/change-requests/CR-backend-20261027-be09-process-assumptions.md` §2·§6)의 사용자 결정(2026-10-27 대화)과 보드 DEC-010.
- 계약·migration: **변경 없음**(계약 0.7.0, head 0007). API·DB 구조 변경 없이 공정 데이터(draft)와 엔진 컴파일러만 바꿨다.

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/scripts/seed_wire_factory.py` | 사용자 정리 반영: 후보 설비 자격 확정·`first_available`, 입력 확보 `per_operation`·소비 시점, 인계 보빈별, 값이 없는 준비·대기 0분, 120분 준비 `on_product_change`, 싱글-12 대기 120분 = 작업마다·설비 점유, 실리콘 3종 검사 작업자 무제한·완제품 milestone(쉬스 완료), P04·P05 원자재 길이 해당 없음, P05 출발 공간 ST-005, 운반 단계 4분(보빈 1개씩)·운반 자원 무제한. 이미 만든 draft에 적용하는 `_apply_intake`(멱등, 시드가 쓴 메모가 그대로일 때만, node id 유지) |
| `backend/src/simulation_platform/simulation/compiler/compile.py` | 수동 운반의 이동 시간을 **공정 데이터**(처리 방식 `per_output_unit`)에서 읽는다. 시나리오 가정(`manual_transport_minutes`)은 그 시나리오에서만 덮어쓰고 가정으로 보고한다 |
| `backend/tests/simulation/test_compiler.py`, `test_runtime.py` | 데이터 기반 운반 시간 시험 3건 |
| `backend/tests/integration/test_engine_real_catalog.py`(전면 개정, 9건), `test_seed_wire_factory.py`(개정·신규 1건) | 실제 공정 컴파일·실행 시험, 시드 값 대조, 옛 draft 반영 시험 |
| `docs/change-requests/CR-backend-20261027-be09-process-assumptions.md`, `docs/collaboration/INTEGRATION_BOARD.md` 등 | 결정·결과 기록 |

## 실제 공정 6종의 현재 상태(개발 DB `DEMO-WIRE`의 draft, 시나리오 가정: 점유 정책 `hold_for_operation`·공간 용량 `unbounded_buffers`)
| 제품 | 엔진 컴파일 | 남은 것 |
|---|---|---|
| **P02, P03, P06** | **통과, 끝까지 실행됨** | 없음 |
| P01 | 막힘 | 쉬스 잔량 이월 범위(machine·product·operation·lot) 미정 — 사용자 결정 필요 |
| P04 | 막힘 | 멀티신선 12보빈 동시/순차(`VAL-TIME-003`), 일괄 확보 handler `output_units_by_time` 미구현, 싱글 메인 공급 입력의 개수(가닥 수만 있음) |
| P05 | 막힘 | 멀티신선 동시/순차(`VAL-TIME-003`), 일괄 확보 handler 미구현(태신선 11개·멀티신선 24개), 제품 전환 시 준비(`on_product_change`) 엔진 미구현 |

실행 결과(시험으로 고정, 원자재 24개 입고): **P06 단독 → 500m 보빈 96개, 1,733분(1.2일), 이벤트 4,465건, 정상 완료.** P02+P03+P06 동시(ST-001 순차) → 보빈 528개(192+240+96), 약 12.9일, 이벤트 14,881건, 정상 완료(실리콘 편조 1.5m/min·8대가 병목). 설비는 후보 목록 순서(코드 순서)로 쓰이며 앞 번호가 더 많이 쓰인다.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m pytest -q tests/simulation` | backend/ (.venv, DB 불필요) | 0 | **119 passed in 1.31s** |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_seed_wire_factory.py tests/integration/test_engine_real_catalog.py` | backend/ (로컬 PostgreSQL 16) | 0 | 28 passed |
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ (로컬 PostgreSQL 16, WSL Docker) | 0 | **562 passed, 경고 2건(테스트 클라이언트 등, 기능 영향 없음), 237.6초** |
| `python scripts/seed_wire_factory.py --yes` | backend/ (개발 DB `simulation_platform`) | 0 | draft 6건 반영(`reapplied` P01~P06). 승인본이 없어 불변 위반 없음 |

## 계약 및 상대 영역에 대한 영향
- **계약·API·DB: 영향 없음.** 공정 draft의 내용이 바뀌었다(개발 DB의 DEMO-WIRE 6건). FE가 이 프로젝트를 보고 있다면 노드 id는 유지되고(새 milestone 노드만 추가) 후보 설비 상태가 `confirmed`로 바뀐 것이 보인다.
- **보드:** DEC-010 결정 기록.

## 통합 검증 담당자의 재검증 방법
1. `cd backend; $env:REQUIRE_DB="1"; .\.venv\Scripts\python.exe -m pytest tests/integration/test_engine_real_catalog.py -q` → 9 passed(P02·P03·P06 실행, P01·P04·P05 막힘 이유).
2. 값 대조: `tests/integration/test_seed_wire_factory.py::test_user_decisions_of_the_six_groups_are_applied_to_every_step`.
3. 엔진 시험: `.\.venv\Scripts\python.exe -m pytest tests/simulation -q`.
4. 수동: `GET /process-versions/{id}/graph`에서 P06의 후보 설비 `eligibility_status=confirmed`, 운반 단계의 `timing_rule.processing = per_output_unit 4`, `POST …/validate?scope=run_template` 오류 0.

## 미정·미실행·한계
- 공간 용량·OUT 배출 규칙은 승인된 자산 버전이 없어 모른다 → `unbounded_buffers` 가정으로 실행했다(결과에 가정으로 표시).
- 운반 자원(지게차 3대·AMR 2대)은 이번에는 무제한이라 대수 때문에 기다리지 않는다. 120분 준비의 "제품" 뜻은 임시로 제품 종류(현재 6종에서는 발생하지 않음) — 사용자 확인 대기(CR be09 §6-④).
- 엔진 남은 작업: 길이 없는 원자재 입고, 일괄 확보 `output_units_by_time`(동시/순차 선택 포함), `on_product_change` 준비, 입력 부족 진단(`INSUFFICIENT_INPUT`), 작업 중 재료의 재공품 집계.
- 근무 달력은 없다(24시간 연속). 실행 플랫폼(CR be08: 스냅샷·job queue·worker·이벤트 저장·지표)은 아직 구현 전이다.
