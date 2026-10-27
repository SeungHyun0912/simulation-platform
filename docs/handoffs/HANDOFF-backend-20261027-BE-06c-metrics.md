# HANDOFF-backend-20261027-BE-06c-metrics
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-06c**(임시 ID, CR be08의 be08c: 지표 엔진·저장·조회, 설비 안 재료를 포함하는 재공품). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be22 / `ca09d19`(origin/main, PR #48 병합 후) / 구현 `1a16559`, 계약 승격·문서는 PR 본문과 `git log` 참조
- 승인 근거: 사용자 지시 "전체 머지 완료 했어. be08c 시작해 줘"(2026-10-27) = CR be08 §4 be08c 범위(권장안) 승인으로 해석. 명시적 'be08c 승인' 문구는 없어 정정 가능.
- 계약 버전: **0.10.0 → 0.11.0**(추가만, sha256 `d6189bb841e61e26c59485e28d1d6af098b505f21f708a7f051a647215455d49`), migration head **0010**.

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/migrations/versions/0010_metric_result.py`, `models/run.py`, `models/__init__.py` | `metric_result`(시도 단위, 지표×차원×구간 유일, 구간·품질 CHECK, 시도 복합 FK) |
| `backend/src/simulation_platform/simulation/metrics.py` | 지표 정의 상수와 `MetricCollector`(이벤트 스트림 → 하루 단위 누적 → 하루·주·월·전체 합산) |
| `backend/src/simulation_platform/simulation/{runtime,runner}.py` | 상태 요약을 SimPy 단계 사이에서 정확히 기록, `in_machine`·`wip_total`, 종료 이벤트의 `wip_total`, 지표 행을 `metrics` 배치로 전달 |
| `backend/src/simulation_platform/worker/queue.py` | `metrics` 배치 저장(임대·fencing) |
| `backend/src/simulation_platform/{repositories,services}/runs.py`, `api/v1/{runs,metrics}.py`, `api/app.py`, `schemas/run.py` | `GET /runs/{r}/metrics`, `GET /metric-definitions` |
| `backend/tests/**` | 지표 엔진 11, 지표 API·DB 9, 상태 요약 8, 실제 P05 한 달치 지표 1, 계약 |
| `contracts/{openapi.json,contract-status.json,04_api_contract.md,CHANGELOG.md}` | 계약 0.11.0 승격(04의 6장 제목 줄이 0.10.0 승격 때 지워진 것도 복구) |
| `docs/…be08…`, 보드, STATUS, TASK_BOARD, 소통 파일 | 결정·결과 기록 |

## 동작 요약
- 지표는 **이벤트로만** 계산한다(07 §10, CR be08 §3). 자식 프로세스에서 이벤트가 지나가는 동안 하루(1,440분) 단위로 누적하고 끝나면 하루·주(7일)·월(30일)·전체 구간으로 합산해 `metric_result`에 저장한다(분모는 구간의 관측 시간, 마지막 구간은 종료 시각까지로 잘림).
- 지표 24개: 공정 버전별(입고·완료·적재·폐기·처리량·리드타임·WIP), 대기 공간별(대기·점유), 설비별(처리·준비·예약·막힘 시간, 가동률). 정의 정본은 `GET /metric-definitions`.
- **WIP는 설비 안에서 처리 중인 재료를 포함**한다: 분할·지정 산출로 소비된 부모는 처리가 끝날 때까지 남은 길이로 센다. 수·길이·무게는 따로 센다.
- 분모 0·해당 없음은 null, 관측한 0은 0. 공정 간 합산 없음. 가동률의 분모는 24시간 연속 구간 길이(가동 달력 없음).
- **버그 수정(0.10.0의 상태 요약):** 경계 상태가 다음 이벤트가 나올 때 지연 기록되어 그 이벤트가 이미 바꾼 상태가 섞일 수 있었다. 이제 SimPy를 한 단계씩 진행하며 다음 이벤트 처리 **전에** 경계 상태를 기록한다(시험으로 확인, 실행 순서·결과 불변).

## 실제 공정 확인(P05, 원자재 3.3t × 24)
- 이벤트 스트림 65,541건·지표 17,710행·시험 포함 약 18초. 완료 4,320개(2,592,000m), 폐기 108,000m, 끝 시점 재공품 2개(6,600kg, 길이 없음 → null), 일 구간 45개의 합 = 4,320, `quality_status` = incomplete(입력 부족). 요약 값과 지표 값이 일치한다.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `python -m pytest -q tests/simulation` | backend/ (DB 불필요) | 0 | 151 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_api_run_metrics.py` | backend/ (PostgreSQL 16) | 0 | 9 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_engine_real_catalog.py` | backend/ | 0 | 13 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/contract` | backend/ | 0 | 80 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **653 passed**, 경고 7건(테스트 클라이언트 1건 + 동시성 시험의 pydantic alias 경고, 기능 영향 없음), 411초 |
| `python -m simulation_platform.api.export_openapi` | backend/ | 0 | sha256 `d6189bb8…5d49`(= `contracts/openapi.json`) |
| `python tools/check_workspace.py` | 저장소 루트 | 0 | PASS(문서·구조만 검증) |
| `alembic upgrade head`(개발 DB `simulation_platform`) | backend/ | 0 | head 0010 |

## 계약 및 상대 영역에 대한 영향
- **계약 0.11.0(추가만):** operation 2개. `STATE_SNAPSHOT`·`RUN_TERMINATED`의 `quantities`에 필드가 늘었다(열린 구조).
- **Frontend:** 결과 화면 설계 시 CHANGELOG 0.11.0 확인. 지표 이름·단위는 `GET /metric-definitions`로 가져오고, null을 0과 다르게 표시한다(소통 파일 공지).
- **조정자:** 03 §5·07 §10 본문에 확정된 지표 정의(24개, 정의 버전 1)와 WIP 정의 반영 요청. 04 §5.4에 적었다.
- **환경:** 개발 DB는 0010 적용, 개발 API(포트 8000)와 worker를 새 코드로 재시작했다.

## 통합 검증 담당자의 재검증 방법
1. 계약: `tests/contract` 통과, `contract-status.json` 0.11.0·해시.
2. `$env:REQUIRE_DB="1"; python -m pytest tests/simulation/test_metrics.py tests/simulation/test_state_snapshots.py tests/integration/test_api_run_metrics.py tests/integration/test_engine_real_catalog.py -q`.
3. 손계산 대조: 2,000m 원자재를 30m/min 설비 한 대가 1,000m 둘로 나누는 실행에서 완료 2·리드타임 평균 50분·처리량 43.2개/일·가동률 1.0(`test_metrics.py`).
4. 수동(API+worker): 실행이 끝난 뒤 `GET /runs/{id}/metrics?window=day&metric_key=completed_items`로 일별 완료 수를 보고 `window=run` 값과 합이 같은지 확인. null 지표(`arrived_weight_kg` 등)와 0 지표를 구분해서 본다.
5. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`.

## 미정·한계
- **검사 완료량·운반 대기 지표는 없다**(엔진에 검사 완료·이동 이벤트가 없음). 07 §10의 `inspected`·`transport_wait`는 해당 이벤트가 생기면 추가한다.
- 가동률은 24시간 연속 기준(가동 달력 없음, 사용자 결정). 사용 기록이 없는 설비는 행이 없다 — "설비가 놀았다(0)"와 구분되지만, 화면에서 후보 설비 전체를 보여 주려면 공정 정의와 대조해야 한다.
- WIP 수는 단위가 다른 작업물(원자재 롤·보빈)을 섞어 센다. 통과(transform) 단계의 작업물은 설비 안에서도 직전 대기 위치에 있는 것으로 보인다(작업물 수는 정확, 노드 귀속만 근사).
- 리드타임은 "완료 − 원자재 입고"다(시나리오가 다른 시작 시각을 정의하지 않음). 합류 작업물은 가장 이른 부모의 입고 시각을 쓴다.
- 지표 값은 소수 6자리 반올림 표시값이다. 정확한 분수는 이벤트의 `sim_time.exact`로 재계산해야 한다.
- 이벤트·지표 저장 규모와 시간은 P05 기준만 측정했다. 6개 공정을 한 실행에서 함께 돌린 저장 시연과 운영 환경 측정은 하지 않았다.
