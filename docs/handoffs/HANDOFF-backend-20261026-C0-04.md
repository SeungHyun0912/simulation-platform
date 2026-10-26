# HANDOFF-backend-20261026-C0-04
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다. 통합 검증 담당자의 재검증 후 완료)
- 작업 ID: **BE-C0-04** (로드맵 C0-04 공유 자원: 같은 설비를 서로 다른 제품이 경쟁)
- 역할 / workspace 버전: Backend / 1.1.0
- branch / 기준 commit / 변경 commit: worktree-backend-core-be09 / 0043d1b(origin/main, PR #29 머지 이후) / 변경 커밋은 PR 본문과 `git log` 참조
- **통합 보드 확인 결과(규칙 준수 기록):** 새 공통 기준 `docs/collaboration/INTEGRATION_BOARD.md`를 작업 시작 시 확인하려 했으나 **`main`·메인 체크아웃·FE 워크트리·전체 브랜치 이력 어디에도 이 파일이 없다**(조정자 세션에서 아직 병합·전달되지 않은 것으로 보임). 보드의 담당 배정·선행 작업·계약 버전을 직접 확인하지 못했다. 그래서 (1) 공통 파일을 임의로 만들지 않았고(다른 세션 기록 충돌 방지) (2) 이 고유 인계 파일에 보드가 요구하는 항목을 갖춰 기록했으며 (3) 보드가 병합되면 같은 내용을 보드에 옮겨 적는다. 승인 근거는 사용자의 직접 지시("머지 완료, 다음 단계를 이어서 진행")와 직전 인계(`HANDOFF-backend-20261026-C0-engine`)에서 제시한 C0-04~07 순서다. **조정자가 보드의 배정과 다르면 알려 주면 되돌린다**(이 변경은 엔진 내부이고 API·계약·DB를 바꾸지 않는다).
- 선행 작업·계약 버전: C0-01~03(PR #29 머지), 계약 **0.6.0**(변경 없음, `contracts/contract-status.json` 기준 해시 `509a71f1…38ef`), migration head 0006(변경 없음).

## 변경 파일·커밋
| 파일 | 변경 |
|---|---|
| `backend/src/simulation_platform/simulation/runtime.py` | 다중 공정 실행: `Lane`, `run_models()`(기존 `run_model()`은 한 lane 래퍼), lane별 store·작업 카운터, 전역 allocator 공유, 입력 검증(프로젝트 동일·공정 버전 중복 금지), 설비 직전 공정 기록, `RunResult.process_version_ids` |
| `backend/src/simulation_platform/simulation/monitoring/events.py` | `Event.process_version_id`(추가 필드, `to_dict`에 포함) |
| `backend/src/simulation_platform/simulation/items.py` | `WorkItem.process_version_id`, `LineageRecord.process_version_id`(추가 필드) |
| `backend/tests/simulation/test_shared_resources.py`(신규 12건), `fixtures.py`, `test_runtime.py` | 공유 설비 경쟁 시험, fixture의 `project_id` 지정, 내부 생성자 시그니처 반영 |
| `docs/decisions/ADR-0002-simpy-engine-boundary.md`, `docs/handoffs/…-C0-04.md`, `docs/planning/STATUS.md`, `docs/agents/TASK_BOARD.md`, `backend/README.md` | 결정·인계·현황 기록 |

## 구현 내용
- 같은 프로젝트의 서로 다른 공정 버전(제품)을 한 SimPy 환경에서 실행하고, **같은 asset_id는 실행에 한 번만 생성된 하나의 자원**으로 경쟁한다(ADR-015). 공정마다 후보 설비 목록이 달라도 allocator가 전역 요청 순서(FIFO)로 배정한다.
- 같은 시각 동순위는 `lanes` 순서(그 안에서는 도착 순서)로 결정해 재현 가능하다. 서로 다른 제품이 같은 `step_key`를 써도 lane별 store로 섞이지 않는다.
- 설비 전환 판단 기록(07 §13): 설비가 `RESERVED`될 때 `previous_process_version_id`(직전 처리 공정)를 이벤트에 남긴다. **교체 시간은 임의로 더하지 않는다**(입력에 교체 matrix가 없음).
- 이벤트·작업물·계보에 공정 버전 id가 붙어 제품별 필터·집계가 가능하다. 실패 이벤트(`RUN_TERMINATED`)도 실패한 공정 버전을 가리킨다.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m pytest -q tests/simulation` | backend/ (.venv, DB 불필요) | 0 | **70 passed**(컴파일러 26 + 실행 32 + 공유 자원 12) |
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **490 passed**, 경고 2건(starlette 테스트클라이언트·pydantic alias, 기능 영향 없음) |
| `python tools/check_workspace.py` | 루트 | 0 | PASS(문서·구조만, 엔진/API/DB 검증 아님) |

## 계약 및 상대 영역에 대한 영향
- **계약(OpenAPI·DTO·예제·`contract-status.json`): 영향 없음.** API·DB schema·migration 변경 없음. 계약 변경 결정 요청도 필요하지 않다.
- **Frontend: 영향 없음, 조치 없음.** 엔진은 API에 연결되어 있지 않다(시나리오·실행 API는 PROPOSED).
- **조정자/다른 Backend 작업: ** 엔진 내부 공개 인터페이스에 *추가*만 있다(`run_models`·`Lane`·이벤트/작업물/계보의 `process_version_id`). 기존 `run_model` 호출과 이벤트 필드는 그대로이며 `Event.to_dict()`에 `process_version_id` 키가 늘었다(소비자가 키 집합을 고정 비교하면 갱신 필요).

## 통합 검증 담당자의 재검증 방법
1. 이 브랜치/병합본에서 `cd backend; .\.venv\Scripts\python.exe -m pytest tests/simulation -q` → 70 passed.
2. 핵심 시나리오 직접 확인: 두 제품(2,000m→1,000m×2 @30 / @60)이 같은 설비를 쓰면 A가 먼저 쥐고 B는 `200/3`분에 시작한다. `tests/simulation/test_shared_resources.py::test_two_products_compete_for_one_equipment_in_lane_order`.
3. 경계·재현성: `test_lane_order_decides_ties_and_the_run_is_reproducible`(lane 순서를 뒤집으면 선후만 바뀌고 같은 입력은 같은 이벤트).
4. "교체 시간을 더하지 않는다": `test_previous_product_on_the_selected_asset_is_recorded_without_adding_changeover_time`.
5. 경계 확인: 다른 프로젝트 공정을 한 실행에 넣으면 `ValueError`(ADR-015).
6. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`(실제 PostgreSQL 필요).
7. **보드 항목 반영 확인:** `INTEGRATION_BOARD.md`가 병합된 뒤 이 인계의 작업 ID(BE-C0-04)·상태(검증대기)가 보드에 옮겨졌는지 확인한다(현재는 보드를 볼 수 없어 이 파일만 기록).

## 미정·미실행·한계
- 이번 범위 밖: IN/OUT 용량·blocking(C0-05), 잔량(C0-06), AL 합류·공급(C0-07), 설비 교체 matrix, 여러 설비 동시 확보, 병렬 스트림, 지표, 시나리오·job queue·worker. 실제 기준정보 공정은 도메인 미정 값이 남아 컴파일되지 않는다(`HANDOFF-backend-20261026-C0-engine` 참조).
- 미실행: 대규모 작업물·성능, worker crash, RLS.
