# HANDOFF-backend-20261027-BE-10-bottleneck
- 상태: **구현완료 / 검증대기**(자체 테스트·실행 확인만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-10**(임시 ID, 결과 분석 API 3종 중 첫째: 단계별 지표·병목 요약·결과의 제품 코드). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be24 / `61f7938`(origin/main, PR #52 병합 후) / 구현 `6738ff7`, 계약 승격·문서는 PR 본문과 `git log` 참조
- 승인 근거: 사용자가 병목 판정 기준을 정하고 "후보로 정해준 API들을 순서대로 개발해 줘"(2026-10-27) = CR be10(`docs/change-requests/CR-backend-20261027-be10-bottleneck-analysis.md`)의 권장안 승인으로 해석, 정정 가능. 기준값(적체 3개, level 30%·10%, 60작업물·분)은 **임시 휴리스틱**이다.
- 계약 버전: **0.11.0 → 0.12.0**(추가만 + 지표 필터 완화, sha256 `f0250383ed652ed3702f447ffbd9151abdc82a369e218ce39a6f0c768b299689`), migration head **0010**(변경 없음, 지표는 기존 `metric_result` 행으로 저장).

## 사용자 병목 기준과 구현
| 사용자 기준 | `kind` | 멈춘 양(작업물·분) |
|---|---|---|
| 다음 저장 공간으로의 이동이 여유 공간 부족으로 멈춤 | `space_full` | 다음 공간 자리 대기(`space_wait_item_min`, ENTRY_WAITING→BUFFER_ENTERED) + 단계 출력 막힘(`step_blocked_item_min`, OUT_BLOCKED→OUT_UNBLOCKED) |
| 다음 생산 설비로의 이동이 설비의 가동으로 멈춤 | `equipment_busy` | 입력 확보 후 설비 배정까지 대기(`step_equipment_wait_item_min`, INPUT_RESERVED→설비 RESERVED, 단계별·작업물 수만큼) |
| AMR·지게차는 한 번에 1제품 → 대기 자재가 쌓인 곳 | `queue_pileup` | 한 대기 공간에 동시에 쌓인 최대(`buffer_peak_items` ≥ 3)일 때 `buffer_item_min`. 다음 단계가 운반(`transport_manual`)이면 `transport_related` + 운반 단계의 최대·평균 동시 운반 수(= 필요한 지게차·AMR 대수) |

종류가 다르면 멈춘 시간이 겹쳐 합산하지 않고 종류 안의 비율(`share`)로 `level`(high ≥ 30%, medium ≥ 10%, low)을 정한다. 응답에 `limitations`(공간 무제한 가정 실행은 `space_full` 평가 불가, 운반 자원 대수 미모델링, 24시간 기준)와 `thresholds`가 들어간다.

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/src/simulation_platform/simulation/metrics.py` | 단계별 지표(작업 수·처리 시간·입력 대기·설비 대기·출력 막힘·최대 동시 진행)와 대기 공간 지표(공간 대기·체류 작업물·분·최대 적체) 12종, 일 단위 최댓값 추적(이벤트 없는 날도 직전 수준 반영) |
| `backend/src/simulation_platform/domain/bottleneck.py` | 병목 판정 순수 로직(DB 없음): 종류별 후보·순위·level·근거·한국어 설명·한계 |
| `backend/src/simulation_platform/services/runs.py`, `repositories/runs.py`, `api/v1/runs.py`, `schemas/run.py` | `GET /runs/{r}/bottlenecks`, 지표 차원 필터 조합(AND)·`step_key`, 결과 제품 코드·이름 보충 |
| `backend/src/simulation_platform/domain/{run,scenario}.py`, `services/scenarios.py`, `simulation/runner.py` | 실행 요청 스냅샷에 제품 코드·이름 고정, 결과 요약 `products[].product_code/name` |
| `backend/tests/**` | 지표 엔진(단계·공간·적체) 7, 판정 규칙 7, 병목 API·단계 필터·제품 코드 6, 기존 시험 갱신 |
| `contracts/**`, `docs/**` | 계약 0.12.0, CR be10, 보드·STATUS·TASK_BOARD·소통 파일 |

## 실제 6공정 실행 결과(월초 24개 입고, 공간 용량 무제한 가정, 개발 DB `DEMO-WIRE-RUN`)
`GET /runs/{id}/bottlenecks` 결과(quality `incomplete`, 가상 96.6일):
- **#1 [high, 85%] equipment_busy — P04 · 싱글 메인 집합:** 작업물이 평균 18,580분(최대 37,159분) 설비를 기다림(총 26,568,750작업물·분). 후보 설비 중 **EQ-096 AL 집합 싱글 가동률 98.9%**.
  → 앞서 확인받은 병목(싱글-1, EQ-094)은 **P04 · 싱글-1 선행 가공**(#5, low 8%, 평균 대기 21,400분, EQ-094 가동률 72.6%)이고, P04 전체 기간(96.6일)을 좌우하는 곳은 **싱글 메인 집합(EQ-096)** 이다. 사용자 확인이 필요하다.
- 그 밖의 equipment_busy(모두 low): P03 · 실리콘 편조 4%(EQ-003 17.3%), P04 · AL 멀티신선 3%(EQ-089 41.4%), P01 절연 압출 0%.
- **queue_pileup:** #2 ST-019 AL 집합 싱글 대기 공간 최대 **61개** 쌓임(high 54%, 평균 대기 1,974분 — #1 병목 앞단), #3 ST-004 실리콘 편조 대기 **113개**(medium 21%), #4 ST-006 CU 멀티신선 대기 **48개**(medium 16%), ST-002 실리콘 압출 대기 72개(low 8%).
- **space_full: 없음** — 공간 용량 무제한 가정이라 평가되지 않는다(`limitations`에 명시).
- **운반(지게차·AMR) 수요:** 동시 운반 최대 P04 지게차·AMR 각 1건(평균 0.03), P06 각 1건, P05 지게차 1건·**AMR 2건**(평균 0.01). 1제품씩 4분(이동 3 + 상하차 1)이라 운반 자체는 병목이 아니다. P05 AMR 최대 2건은 보유 AMR 2대와 같고 P05·P06이 같은 AMR 경로(ST-022→ST-009)를 써서 합치면 3건일 수 있다 — 운반 자원 기능이 생기면 확인 필요.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `python -m pytest -q tests/simulation tests/unit/test_bottleneck.py` | backend/ (DB 불필요) | 0 | 163 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_api_run_bottlenecks.py tests/integration/test_api_run_metrics.py` | backend/ (PostgreSQL 16) | 0 | 15 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/contract` | backend/ | 0 | 80 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **672 passed**, 경고 4건(테스트 클라이언트·pydantic alias, 기능 영향 없음), 819초(개발 API·worker가 같은 PC에서 함께 돌아 느려졌다) |
| `python scripts/demo_run_wire_factory.py --yes` 후 `GET /runs/{id}/bottlenecks` | 개발 API·worker(재시작) | 0 | 위 실제 결과 |
| `python -m simulation_platform.api.export_openapi` | backend/ | 0 | sha256 `f0250383…9689` |
| `python tools/check_workspace.py` | 저장소 루트 | 0 | PASS(문서·구조만 검증) |

## 계약 및 상대 영역에 대한 영향
- **계약 0.12.0:** operation 1개, `result.products[]`에 `product_code`·`product_name`, 지표 `step_key` 필터와 차원 필터 조합 허용(0.11.0에서 둘 이상 보내면 422였던 요청이 AND로 동작), 지표 정의 `dimension`에 `step`.
- **Frontend:** CHANGELOG 0.12.0 확인. 병목 화면은 `findings`를 `rank`순·`kind`별로 보이고 `limitations`·`thresholds`를 함께 표시한다. `result.products[].product_code`가 생겼으므로 제품 목록으로 id를 바꾸는 대신 이 값을 우선한다(FE가 약속한 대로, 소통 파일 공지).
- **조정자:** 03 §5·07 §10에 단계별 지표·병목 판정 정의 반영 요청.
- **환경:** migration 없음. 개발 API·worker를 새 코드로 재시작했다. 실행 결과는 새 run부터 단계별 지표가 있다(이전 run은 단계별 지표가 없어 병목 후보가 비거나 적체만 나올 수 있다 — 재실행 필요).

## 재검증 방법
1. `$env:REQUIRE_DB="1"; python -m pytest tests/unit/test_bottleneck.py tests/simulation/test_metrics.py tests/simulation/test_bottleneck_metrics.py tests/integration/test_api_run_bottlenecks.py -q`.
2. 손계산 대조: 설비 한 대에 작업이 동시에 들어오는 경우 둘째 작업의 설비 대기 = 첫 작업 처리 시간(`test_metrics.py`).
3. 개발 서버: `python scripts/demo_run_wire_factory.py --yes`로 새 run을 만든 뒤 `GET /projects/{DEMO-WIRE-RUN}/runs/{id}/bottlenecks`.
4. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`.

## 미정·한계
- 기준값(적체 3개, level 30%·10%, 60작업물·분)은 임시 휴리스틱이다. 실제 운영 데이터와 사용자 판단으로 보정해야 한다.
- 지게차·AMR 대수(3·2)는 엔진·계약에 값 구조가 없어 필요 대수만 보이고 부족 판정은 하지 않는다. 운반 자원 기능이 생기면 `transport_related` 근거를 대수 대비로 바꾼다.
- `space_full`은 공간 용량이 확정된 실행(승인된 자산 버전 고정)에서만 의미가 있다. 지금 시연 실행은 무제한 가정이라 평가되지 않았다.
- 대기 공간 지표의 `node_key`는 공정 버전 없이 노드 key만 가진다. 서로 다른 공정이 같은 key를 쓰면 합쳐 센다(공유 저장 공간 관례). 노드 key가 우연히 같고 서로 다른 공간이면 섞일 수 있다.
- `queue_pileup`의 멈춘 양(`buffer_item_min`)에는 입력 묶음을 모으는 대기와 설비 대기가 포함된다(같은 종류 안에서만 비교).
- 다음 작업: 설비 상태 타임라인 요약 API(0.13.0), 시나리오·run 비교 API(0.14.0)를 같은 순서로 진행한다.
