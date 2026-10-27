# HANDOFF-backend-20261027-BE-09-discard
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-09**(임시 ID, P05 절연 잔량 폐기와 계약 0.8.0). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be19 / `e250b48`(origin/main, PR #44 병합 후) / 구현 `416a62e`, 계약 승격·문서는 PR 본문과 `git log` 참조
- 승인 근거: 사용자 답변 "P05 잔량은 폐기로 해줘. 나머지는 다 맞아"(2026-10-27) = CR be09 §9의 권장안 승인(계약 0.8.0).
- 계약 버전: **0.7.0 → 0.8.0**(추가만, sha256 `656d57a01d73387c62a3396fa60e1884bbf6ee874132599df045ef1c5bb4cd21`), migration head 0007(변경 없음, 잔량 모드는 JSONB 값이라 DB 제약이 없다).

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/src/simulation_platform/schemas/process.py` | `ResidualRule.mode`에 `discard` |
| `backend/src/simulation_platform/schemas/scenario.py` | `ArrivalDto`: `length_m` 선택, `weight_kg` 추가, 둘 중 하나 필수 |
| `backend/src/simulation_platform/domain/scenario.py` | 사전검증 경고 `SCN-ARR-002`(도착 단위가 공정의 원자재 단위와 다름) |
| `backend/src/simulation_platform/simulation/{compiler/compile,compiler/model,runtime}.py` | `discard`: 분할 단계에서만, 작업이 끝날 때 남은 길이를 폐기·기록(`RESIDUAL_DISCARDED`, 사유 `STEP_REMAINDER`), 계보 균형 유지 |
| `backend/scripts/seed_wire_factory.py` | P05 절연 `discard`, 메모 세대 갱신(개발 DB draft 6건 적용) |
| `backend/tests/**` | 엔진·계약·사전검증·시나리오 API·실제 공정·시드 시험 |
| `contracts/{openapi.json,contract-status.json,04_api_contract.md,CHANGELOG.md}`, `contracts/examples/first-scope/scenario-*.json`·`error.scenario-not-runnable.json` | 계약 0.8.0 승격, 예제 재생성(실제 API 응답) |
| `docs/…be09…`, 보드, STATUS, TASK_BOARD | 결정·결과 기록 |

## 실제 공정 6종의 현재 상태(원자재 24개 입고, 가정: 설비 독점·공간 용량 무제한)
| 제품 | 결과 |
|---|---|
| P01 | 완료, 300m 보빈 240개, 4.6일 |
| P02, P03, P06 | 완료(P06 보빈 96개 1.2일, P01+P02+P03 동시 17.1일) |
| P04 | 정체 `INSUFFICIENT_INPUT`: 4,000m 보빈 1,100개, 96.6일 |
| **P05** | 정체 `INSUFFICIENT_INPUT`: **600m 보빈 4,320개, 44.1일**, 절연 27회 × 4,000m(108,000m) 폐기, 원자재 2개 남음 |

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m pytest -q tests/simulation` | backend/ (.venv, DB 불필요) | 0 | **132 passed in 1.13s** |
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ (로컬 PostgreSQL 16, WSL Docker) | 0 | **584 passed, 경고 1건(테스트 클라이언트, 기능 영향 없음), 242.7초** |
| `python -m simulation_platform.api.export_openapi` | backend/ | 0 | sha256 `656d57a01d73387c62a3396fa60e1884bbf6ee874132599df045ef1c5bb4cd21`(= `contracts/openapi.json`) |
| `python scripts/seed_wire_factory.py --yes` | backend/ (개발 DB `simulation_platform`) | 0 | draft 6건 3차 반영 |

## 계약 및 상대 영역에 대한 영향
- **계약 0.8.0(추가만):** 잔량 모드 값 1개, 시나리오 도착 `weight_kg`(길이는 선택으로). **응답에서 도착의 `length_m`이 null일 수 있고 `weight_kg`가 늘었으므로 타입을 재생성**해야 한다. 요청은 0.7.0이 그대로 유효하다.
- **Frontend:** 시나리오·공정 편집 화면을 만들 때 CHANGELOG 0.8.0을 읽고 재생성. 기존 화면 영향 없음(소통 파일 공지).
- **조정자:** 03 §6 본문(잔량 규칙)에 `discard` 반영 요청, 04 §4.1.3에 의미를 적었다.

## 통합 검증 담당자의 재검증 방법
1. `cd backend; .\.venv\Scripts\python.exe -m pytest tests/simulation/test_residuals.py -q` → discard 시험(폐기 기록·균형·규칙 없으면 실패·분할 단계만).
2. `$env:REQUIRE_DB="1"; python -m pytest tests/integration/test_engine_real_catalog.py -q` → P05 44일·4,320개·108,000m 폐기.
3. 계약: `tests/contract` 통과, `contracts/contract-status.json` 0.8.0·해시, 예제 3개 갱신.
4. 수동(API): 시나리오 버전에 무게만 있는 도착(`weight_kg`)을 저장 → 응답의 `length_m: null`, 도착에 길이·무게가 모두 없으면 422.
5. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`.

## 미정·한계
- 시나리오 API는 도착 정보를 저장·검증만 한다(엔진 실행은 CR be08a). 무게 입고는 엔진이 지원한다.
- 120분 준비는 제품 종류가 바뀔 때만이라 현재 6종에서는 발생하지 않는다(사용자 확인).
- 공간 용량·OUT 규칙은 승인된 자산 버전이 없어 가정, 운반 자원 무제한, 근무 달력 없음(24시간).
- P04는 싱글-1(EQ-094 한 대, 4.4m/min)이 병목이라 한 달 입고를 96.6일에 처리한다(사용자가 값 확인함).
- 실행 플랫폼(CR be08a~c: 스냅샷·job queue·worker·이벤트 저장·지표)은 구현 전이다.
