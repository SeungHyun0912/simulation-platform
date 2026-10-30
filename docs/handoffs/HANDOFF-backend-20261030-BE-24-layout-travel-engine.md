# HANDOFF-backend-20261030-BE-24-layout-travel-engine
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-24**(임시 ID, 배치판 이동 시간 엔진 반영). BE-23(PR #75) 위에 이어 작업 — #75 먼저 머지
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be37 / be36(`14c7916`, 0.19.0) / 구현 `ffe4c7a`
- 승인 근거: 사용자 지시(2026-10-30) "속도는 전부 4km/h 로 기본 값 … 1,2,3번 모두 진행" 중 3번. CR `docs/change-requests/CR-backend-20261030-be20-process-layout-travel.md` §3.
- 계약 버전: **0.19.0 → 0.19.1**(동작 패치, OpenAPI 해시 불변 `346a84e2…fc20`), 엔진 **c0.3 → c0.4**, migration head 0013 그대로.

## 구현
| 항목 | 내용 |
|---|---|
| 실행 입력 | 시나리오가 배치판을 고르면 스냅샷에 `travel`(배치판 점·선·고정 경로·포트 매핑·자산 포트·운반 자원 종류·이동 설정). 고르지 않으면 넣지 않음(입력 해시·결과 불변) |
| 엔진 이동 모델 | `simulation/travel.py`: 포트 → 포트 경로 길이(고정 경로 우선, 통로 그물 최단 경로, 0.18.0 `/paths`와 같은 계산), 시간 = 길이 ÷ 속도(기본 4 km/h, 상하차 1분) |
| 운반 단계 | 1건 = 상하차 + 앞 공간 → 다음 공간 경로 ÷ 운반 자원 종류 속도(시나리오 `manual_transport_minutes`가 있으면 그 값 우선) |
| 빈 차 이동 | 내려놓은 공간 → 일을 받는 공간 경로 ÷ 속도. 위치를 공간 자산으로 기록해 제품이 달라도 같은 공간이면 같은 곳 |
| 사람 이동 | 간선 이동 조건 `network_route`: 공간 → 설비(고른 설비 IN, 설비를 쥔 채), 설비 → 공간(설비는 놓음), 공간 → 공간. 그 밖은 `NETWORK_ROUTE_SKIPPED`로 알리고 시간 없음 |
| 검증 | 경로 없음 `LAYOUT_PATH_UNREACHABLE`(제품을 가로지르는 운반 자원 빈 차 경로 포함), 운반 앞뒤가 공간이 아님 `LAYOUT_TRANSPORT_ENDS`. 사용한 가정 `LAYOUT_TRAVEL`·`TRAVEL_SPEED_DEFAULT`·`TRAVEL_HANDLING_DEFAULT` |
| 이벤트 | `PERSON_MOVED`(source·destination 노드, asset_key 고른 설비, quantities.minutes) |

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check src tests` | backend/ | 0 | All checks passed |
| `python -m pytest -q tests/simulation tests/unit` | backend/ | 0 | 기존 248 passed(배치판 없는 엔진 동작 그대로) + `tests/simulation/test_travel.py` 6 passed(운반·빈 차·속도 변경·경로 없음·제품 간 빈 차·후보 설비별 사람 이동) |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_api_layout_travel_run.py` | backend/ | 0 | 2 passed(배치판 고른 실행 종료 시각 +1분, 스냅샷 travel 고정, 배치판 없는 실행은 travel 없음, 경로 없으면 실행 불가) |
| 비공개 실제 기준정보 시험(로컬 전용, `data/local/private`에서 복사, 커밋 안 함) | backend/ | 0 | 엔진 실제 공정 시험·시드 대조 시험 모두 통과 — 배치판 없는 실제 공정 결과 그대로 |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 1 | **745 passed, 1 failed**, 825초(로컬 전용 비공개 시험 포함). 실패 1건은 `test_contract_status_hash_matches_snapshot` — 시험 도중 계약 기록을 0.19.1로 바꿔 생긴 버전 불일치이며 아래 계약 시험으로 재확인 |
| `python -m pytest -q tests/contract`(계약 0.19.1 기록 뒤) | backend/ | 0 | **80 passed** |
| `python scripts/generate_contract_examples.py ../contracts/examples/first-scope` | backend/ | 0 | 예제 1개 갱신(engine_version c0.4) |

## 남은 것
- 실제 기준정보 프로젝트의 배치판에 점·통로를 그려야(사용자, FE 화면) 배치판을 고른 실행이 가능하다. 그 전에는 고르면 `LAYOUT_PATH_UNREACHABLE`로 실행 불가.
- 사람 이동 시간을 넣을 간선은 공정 편집에서 이동 조건을 `network_route`로 바꿔야 한다(지금 공정 간선은 그렇지 않아 사람 이동은 시간 없음 그대로).
