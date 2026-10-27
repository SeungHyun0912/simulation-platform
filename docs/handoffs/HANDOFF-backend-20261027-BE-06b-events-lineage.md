# HANDOFF-backend-20261027-BE-06b-events-lineage
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-06b**(임시 ID, CR be08의 be08b: 이벤트·작업물·계보 저장, 하루·주·월 상태 요약, 조회 API). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be21 / `de74230`(origin/main, PR #46 병합 후) / 구현 `9b84398`, 계약 승격·문서는 PR 본문과 `git log` 참조
- 승인 근거: 사용자 지시 "머지 완료 했고 개발 이어가 줘"(2026-10-27) = CR be08 §4 be08b 범위(권장안) 승인으로 해석. 명시적 'be08b 승인' 문구는 없어 정정 가능.
- 계약 버전: **0.9.0 → 0.10.0**(추가만, sha256 `d3af644b0eedef19a635cce064ded3015ed9f96f9d7ebaee544c2f41d741b658`), migration head **0009**.

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/migrations/versions/0009_run_events_lineage.py` | simulation_event(PK `(attempt_id, event_seq)`, 필터별 부분 인덱스)·work_item·work_item_relation, `run_attempt (project_id, id)` 유일 제약 |
| `backend/src/simulation_platform/models/run.py`, `models/__init__.py` | `SimulationEvent`·`RunWorkItem`·`RunWorkItemRelation` |
| `backend/src/simulation_platform/simulation/{monitoring/events,runtime,runner}.py`, `resources/allocator.py` | `EventLog` 배치 sink·메모리 비보관, 하루 경계 `STATE_SNAPSHOT`(옵션), 요약을 이벤트 통과 중에 집계, 작업물·계보 행 변환 |
| `backend/src/simulation_platform/worker/{queue,execute,service}.py` | 자식 → 부모 배치 전달, `write_batch`(임대·fencing 확인 + 임대 연장 + 취소 확인), 메시지가 계속 와도 시간 제한·임대 갱신 유지 |
| `backend/src/simulation_platform/{repositories,services,api/v1}/runs.py`, `schemas/run.py`, `domain/errors.py` | 이벤트·계보 조회 API, `RUN_RESULT_NOT_AVAILABLE` |
| `backend/tests/**` | 상태 요약·스트리밍(엔진 6), 이벤트·계보·fencing·DB 제약(통합 11), 계약 |
| `contracts/{openapi.json,contract-status.json,04_api_contract.md,CHANGELOG.md}` | 계약 0.10.0 승격 |
| `docs/…be08…`, 보드, STATUS, TASK_BOARD, 소통 파일 | 결정·결과 기록 |

## 동작 요약
- worker의 자식 프로세스가 엔진을 돌리며 이벤트를 2,000건씩 부모에 보내고, 부모가 임대·fencing을 확인하며 DB에 쓴다. 엔진은 이벤트 전체를 메모리에 모으지 않는다. 끝나면 작업물·계보 행을 같은 방식으로 보낸다.
- 공식 결과는 `simulation_run.selected_attempt_id`의 시도뿐이다. 실패·취소·버려진 시도의 부분 기록은 지우지 않고 조회에서만 제외한다(재시도 때 새 시도 번호로 저장).
- 상태 요약은 SimPy 이벤트를 더하지 않고 "경계 시각 이하의 이벤트가 나오기 직전 상태"를 기록하므로 실행 순서·결과가 바뀌지 않는다(시험으로 확인).

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `python -m pytest -q tests/simulation` | backend/ (DB 불필요) | 0 | 엔진 시험 통과(상태 요약 6건 포함) |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_api_run_events.py` | backend/ (PostgreSQL 16) | 0 | 11 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/contract` | backend/ | 0 | 80 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **630 passed**, 경고 1건(테스트 클라이언트, 기능 영향 없음), 554.74초(이벤트 저장으로 전체 시간이 늘었다) |
| `python -m simulation_platform.api.export_openapi` | backend/ | 0 | sha256 `d3af644b…b658`(= `contracts/openapi.json`) |
| `python tools/check_workspace.py` | 저장소 루트 | 0 | PASS(문서·구조만 검증) |
| `alembic upgrade head`(개발 DB `simulation_platform`) | backend/ | 0 | head 0009 |

## 계약 및 상대 영역에 대한 영향
- **계약 0.10.0(추가만):** operation 2개(`GET /runs/{r}/events`, `GET /runs/{r}/items/{item_key}/lineage`), 오류 코드 `RUN_RESULT_NOT_AVAILABLE`. `result.event_count`는 이제 저장된 이벤트 수(상태 요약 포함)와 같다.
- **Frontend:** 결과 화면 설계 시 CHANGELOG 0.10.0 확인, 타입 재생성(소통 파일 공지).
- **조정자:** 03 §5·07 §9 본문에 `STATE_SNAPSHOT`·실행 이벤트 조회 규칙 반영 요청(04 §5.3에 적었다).
- **환경:** 개발 DB는 0009 적용, 개발 API(포트 8000)와 worker를 새 코드로 재시작했다(worker는 별도 프로세스).

## 통합 검증 담당자의 재검증 방법
1. 계약: `tests/contract` 통과, `contract-status.json` 0.10.0·해시.
2. `$env:REQUIRE_DB="1"; python -m pytest tests/integration/test_api_run_events.py tests/simulation/test_state_snapshots.py -q`.
3. 수동(API+worker): 승인된 시나리오로 실행 → 상태가 `completed`가 되면 `GET /runs/{id}/events?limit=50`을 cursor로 끝까지 읽고 `event_seq`가 1부터 빠짐없는지, 마지막이 `RUN_TERMINATED`인지 확인. `?event_type=STATE_SNAPSHOT`으로 하루 경계 요약, 완제품 작업물의 `/items/{key}/lineage` 확인. 실행 중 run은 409.
4. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`.

## 미정·한계
- 지표(생산량·대기·가동률·WIP)와 window 집계, 비교·rerun은 be08c 이후다. 상태 요약의 `wip`는 **설비 안에서 처리 중인 재료를 포함하지 않는다**(`operations_in_progress` 수만 있음). 재공품 정의는 be08c에서 정한다.
- 이벤트 규모: 한 달치 실제 공정을 API로 끝까지 돌려 저장하는 시연·측정은 아직 하지 않았다(개발 DB의 공정이 draft). 이벤트 한도 기본값은 200만이며 저장 속도는 이벤트 2,000건 묶음 insert 기준이고 측정 전이다.
- 상태 요약은 매 경계마다 모든 작업물을 훑으므로 작업물이 수십만 개가 되면 느려질 수 있다(측정 전).
- 실패한 시도의 부분 기록은 삭제하지 않고 남긴다(저장 공간 정리 정책은 미정).
