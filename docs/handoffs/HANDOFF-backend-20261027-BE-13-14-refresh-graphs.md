# HANDOFF-backend-20261027-BE-13-14-refresh-graphs
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-13**(공정 일괄 조회·자산 사용처)·**BE-14**(시나리오를 최신 승인 공정으로 갱신), 임시 ID. 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be27 / `5b1eb6d`(origin/main, PR #56 병합 후) / 구현 `0980ab1`, 계약 승격·문서는 PR 본문과 `git log` 참조
- 승인 근거: 사용자 명시 지시 "시나리오를 최신 승인 공정으로 갱신 하는 기능 개발과 공정 일괄 조회 기능 같이 개발해 줘"(2026-10-27) — CR be13(FE 제안)·be14.
- 계약 버전: **0.13.0 → 0.14.0**(추가만, sha256 `48dd386b7e8b30806aa975a9f89194a3bdc4fa5852450663bbd61f0f7b24d4d5`), migration head **0010**(변경 없음).
- 같은 메시지의 사용자 확인: **P04 싱글 메인 입력값(32m/min, 1회 4,000m×10 산출, 싱글-1 보빈 1개 소비)이 실제와 맞음** → P04 병목은 EQ-096(싱글 메인)이 맞는 판정으로 둔다(EQ-094는 싱글 메인을 빠르게 하면 병목이 된다, BE-11·12 인계 문서의 재실행 표).

## API
| Method | Path | 내용 |
|---|---|---|
| GET | /process-graphs | 여러 제품의 공정 그래프(제품 코드 순, 최대 50개). `basis` approved(현재 승인본)\|latest(가장 최근), `product_id`·`version_id`(반복), `mode` summary(노드·간선 요약, 기본)\|full. 항목마다 ETag |
| GET | /assets/{asset_id}/uses | 그 자산을 쓰는 제품·공정 버전·노드(`space` 공간 노드 / `equipment_candidate` 단계 후보 설비) |
| POST | /scenario-versions/{v}/refresh | 초안의 제품별 공정 버전을 현재 승인본으로, 자산 고정을 현재 승인 버전으로(`assets` latest\|keep). 도착·가정·순서 유지, 바뀐 내용 `process_changes`·`asset_changes` |

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/src/simulation_platform/services/process_batch.py`(새) | 일괄 조회·자산 사용처(읽기 전용) |
| `backend/src/simulation_platform/services/scenarios.py` | `refresh_version` |
| `backend/src/simulation_platform/schemas/{process,scenario}.py`, `api/v1/{process_versions,scenarios}.py` | DTO·라우터 |
| `backend/tests/integration/test_api_refresh_and_graphs.py`(새) | 갱신 4(공정·자산 latest/keep·권한·재실행→비교 전체 흐름), 일괄 조회 2, 사용처 1, 다른 프로젝트 2 |
| `contracts/**`, `docs/**` | 계약 0.14.0, CR be13(승인으로 갱신)·be14, 보드·STATUS·TASK_BOARD·소통 파일 |

## 실제 데이터 확인(개발 서버, `DEMO-WIRE-RUN`)
- `GET /process-graphs?limit=50`: 6개 제품(P01~P06, 노드 11·11·11·23·28·22개), summary **0.10초·51KB**, full 0.19초·155KB.
- `GET /assets/{EQ-001}/uses`: P01·P02·P03의 절연(`insulate`) 후보. `GET /assets/{ST-001}/uses`: P01·P02·P03·P06의 원자재 입고 공간 — 사용자가 확정한 "ST-001은 P01→P02→P03→P06 공유"와 일치.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_api_refresh_and_graphs.py` | backend/ (PostgreSQL 16) | 0 | 9 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/contract` | backend/ | 0 | 80 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **696 passed**, 경고 1건(테스트 클라이언트, 기능 영향 없음), 426초 |
| `python -m simulation_platform.api.export_openapi` | backend/ | 0 | sha256 `48dd386b…d4d5` |
| `python tools/check_workspace.py` | 저장소 루트 | 0 | PASS(문서·구조만 검증) |

## 계약 및 상대 영역에 대한 영향
- **Frontend:** CHANGELOG 0.14.0. 프로젝트 전체 공정 화면은 `GET /process-graphs?mode=summary`로, 설비 공유 표는 `GET /assets/{id}/uses`로 바꿀 수 있다. "최신 공정으로 갱신"은 `POST /scenarios/{s}/versions` → `POST /scenario-versions/{v}/refresh`(If-Match) 순서.
- **조정자:** 04 §5.8에 적었다.

## 재검증 방법
1. `$env:REQUIRE_DB="1"; python -m pytest tests/integration/test_api_refresh_and_graphs.py -q`(특히 `test_rerunning_after_a_refresh_shows_the_change_in_the_comparison`: 공정 새 승인본 + 공간 용량 변경 → 갱신 → 재실행 → 비교의 `input_changes`).
2. 개발 서버: `GET /projects/{DEMO-WIRE-RUN}/process-graphs`, `GET /projects/{…}/assets/{ST-001 id}/uses`.
3. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`.

## 미정·한계
- 갱신은 공정 버전·자산 고정만 바꾼다. 공정 그래프 구조가 바뀌어 도착 단위(길이·무게)가 맞지 않게 되면 사전검증 경고·오류로 알게 된다(갱신 자체는 막지 않음).
- 일괄 조회는 한 번에 50개. 수백 종이면 cursor로 나눠 받는다. 자산 사용처는 프로젝트의 모든 제품을 본다(제품 수천 종이면 측정 필요).
- "승인본이 없는 제품"(`no_approved_version`)은 시나리오에 넣을 때 이미 승인본이 필요해 현재 흐름에서는 드물다(시험하지 않음).
