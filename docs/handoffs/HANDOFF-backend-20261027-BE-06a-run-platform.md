# HANDOFF-backend-20261027-BE-06a-run-platform
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-06a**(임시 ID, CR be08의 be08a: 실행 요청·입력 스냅샷·DB job queue·별도 worker·취소). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be20 / `339de64`(origin/main, PR #45 병합 후) / 구현 `424475f`, 계약 승격·문서는 PR 본문과 `git log` 참조
- 승인 근거: 사용자 지시 "일단 스냅샷은 괜찮고 PR45 머지 완료 했고 다음 단계 이어가 줘"(2026-10-27) = CR be08 §9 be08a 범위(권장안) 승인으로 해석. 명시적 'be08 승인' 문구는 없어 정정 가능.
- 계약 버전: **0.8.0 → 0.9.0**(추가만, sha256 `229cc091b84e00810e2883455e84257066d3954091e82bc84f9ed86f164aae74`), migration head **0008**.

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/migrations/versions/0008_run_platform.py` | simulation_run·run_input_snapshot·job·run_attempt, 복합 FK(프로젝트 격리), 스냅샷 수정·삭제 금지 트리거 |
| `backend/src/simulation_platform/{models,schemas,repositories,services,api/v1}/run*.py`, `api/deps.py`, `domain/{run,errors}.py` | 실행 요청·조회·입력·취소 API, 멱등 키, 정규화 해시 |
| `backend/src/simulation_platform/worker/{queue,execute,service,__main__}.py`, `scripts/run_dev_worker.ps1` | DB 큐(SKIP LOCKED)·임대·heartbeat·fencing, 엔진 자식 프로세스 실행(취소·시간 제한), 재시도 규칙 |
| `backend/src/simulation_platform/simulation/{runner.py,compiler/assumptions.py}` | 스냅샷 → 엔진 요약 실행기, 시나리오 가정 변환(설비 점유 기본값 hold_for_operation) |
| `backend/tests/**` | API·큐·worker 통합 19, 자식 프로세스 5, 규칙 3, 스키마 head, 계약·예제 |
| `contracts/{openapi.json,contract-status.json,04_api_contract.md,CHANGELOG.md}`, `examples/first-scope/error.run-not-runnable.json` 등 | 계약 0.9.0 승격 |
| `docs/…be08…`, 보드, STATUS, TASK_BOARD, 소통 파일 | 결정·결과 기록 |

## 동작 요약
- `POST /runs`: 승인된 시나리오 버전 + `Idempotency-Key` → 스냅샷·run·job을 한 트랜잭션으로 생성, 202. 스냅샷은 정규화 JSON + SHA-256, DB 트리거가 수정·삭제 금지.
- worker(별도 프로세스): job을 `FOR UPDATE SKIP LOCKED`로 가져가 임대·heartbeat로 유지하고 엔진은 `spawn` 자식 프로세스에서 실행. 취소 요청·시간 초과(기본 1,800초)·임대 상실이면 자식을 종료. 재시도는 worker 소실(최대 3회)만, 엔진 오류·시간 초과는 최종.
- 실행 결과는 요약만 저장(상태·종료 사유·제품별 완료량·부족 입력·잔량). 이벤트·계보·지표는 be08b·be08c.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_api_runs.py` | backend/ (PostgreSQL 16) | 0 | 19 passed |
| `python -m pytest -q tests/integration/test_worker_execute.py tests/unit/test_run_rules.py` | backend/ | 0 | 8 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/contract` | backend/ | 0 | 80 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **613 passed**, 경고 1건(테스트 클라이언트, 기능 영향 없음), 311초 |
| `python -m simulation_platform.api.export_openapi` | backend/ | 0 | sha256 `229cc091…ae74`(= `contracts/openapi.json`) |
| `python tools/check_workspace.py` | 저장소 루트 | 0 | PASS(문서·구조만 검증) |
| `alembic upgrade head`(개발 DB `simulation_platform`) | backend/ | 0 | head 0008 |

## 계약 및 상대 영역에 대한 영향
- **계약 0.9.0(추가만):** operation 5개, 오류 코드 3개, `Idempotency-Key` 헤더(없으면 428). 동작 변경: 사전검증에서 설비 점유를 정하지 않으면 기본값 `hold_for_operation`을 쓴다(`EQUIPMENT_HOLD_POLICY_REQUIRED` 미발생).
- **Frontend:** 실행 화면을 만들 때 CHANGELOG 0.9.0 확인, 타입 재생성(소통 파일 공지).
- **조정자:** 03 §5 본문에 실행·스냅샷 규칙 반영 요청(04 §5.2에 적었다).
- **환경:** 개발 API(포트 8000)는 0.9.0 코드로 재시작했고 worker를 별도로 실행해야 run이 진행된다(`scripts/run_dev_worker.ps1`).

## 통합 검증 담당자의 재검증 방법
1. 계약: `tests/contract` 통과, `contract-status.json` 0.9.0·해시.
2. `$env:REQUIRE_DB="1"; python -m pytest tests/integration/test_api_runs.py -q` → 멱등·스냅샷 불변·권한·취소·동시 claim·fencing·재시도·worker 실행.
3. 수동(API+worker): 승인된 시나리오 버전으로 `POST /runs`(헤더 `Idempotency-Key`) → `GET /runs/{id}`를 polling → `completed`와 `result.products[]` 확인, 같은 키 재전송은 200·같은 run, 실행 중 `cancel`은 요청 시각만 기록 후 `cancelled`.
4. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`.

## 미정·한계
- 이벤트·계보·지표 조회와 `STATE_SNAPSHOT`(일·주·월 관측 상태)는 be08b·be08c에서 구현한다. 지금은 결과 요약만 저장한다.
- 시험 DB는 공유라 worker 시험이 다른 프로젝트의 대기 job을 취소해 간섭을 막는다(시험 전용 처리).
- Windows `spawn` 실행은 시험 통과로 확인했다. 운영 배치·메모리 한도·worker 다중 실행은 미검증.
- 실제 공정 6종을 API로 실행해 보는 개발 DB 시연은 아직 하지 않았다(DEMO-WIRE의 공정은 draft라 승인 절차가 먼저 필요).
