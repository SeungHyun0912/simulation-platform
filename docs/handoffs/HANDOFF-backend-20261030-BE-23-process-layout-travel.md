# HANDOFF-backend-20261030-BE-23-process-layout-travel
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-23**(임시 ID, 공정 ↔ 배치판 연결·시나리오 배치판 선택·이동 설정). 엔진 반영은 BE-24(다음 PR)
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be36 / main `bb0fa53`(0.18.0) / 구현 `9103d03`
- 승인 근거: 사용자 지시(2026-10-30) "일단 속도는 전부 4km/h 로 기본 값을 설정해주고, 나중에 사용자가 변경할 수 있게만 해 줘. 1,2,3번 모두 진행해주길 바래." CR `docs/change-requests/CR-backend-20261030-be20-process-layout-travel.md`.
- 계약 버전: **0.18.0 → 0.19.0**(추가만, OpenAPI sha `346a84e2…fc20`), migration head **0012 → 0013**, 엔진 c0.3 그대로(결과 불변).

## 구현
| 항목 | 내용 |
|---|---|
| 공정 ↔ 배치판 연결 | `GET /layout-versions/{v}/process-links`: 공정마다 이동 구간(위치 = 자산 있는 공간·후보 설비 있는 단계, 위치 없는 노드는 거쳐 감, 운반 단계를 지나면 운반 자원 이동) → 포트 쌍(후보 설비마다) → 경로·길이·이동 시간(길이 ÷ 속도, 운반은 + 상하차). 저장 안 함, 자동 재계산 |
| 시나리오 배치판 선택 | `scenario_version.layout_version_id`(승인 배치판, 같은 프로젝트, SCN-REF-005·006), 복사·동결 포함 |
| 이동 설정 | `scenario_version.travel_rule` = `{speeds_kmh{person·운반 자원 종류}, carrier_handling_minutes}`, 비면 기본 4 km/h·1분(키는 데이터의 equipment_type 그대로 — 예제 이름 하드코딩 없음) |
| 갱신 | `refresh`의 `layout`(latest 기본): 최근 승인 배치판으로, 응답 `layout_change` |

## 개발 DB 확인(로컬, 개발 API 재시작 후)
- 로컬 개발 DB의 실제 기준정보 프로젝트에서 모든 공정의 이동 구간(사람 이동·운반 단계)이 뽑혔고, 운반 단계는 운반 자원 종류별 속도 키(기본 4 km/h)와 상하차 1분으로 계산됐다. 세부 공정·설비 정보는 공개 저장소에 적지 않는다(사용자 결정 2026-10-30, `data/local/README.md`).
- 배치판에 아직 점이 없어 모든 쌍이 `PORT_NOT_MAPPED`(예상대로). 사용자가 화면에서 점·통로를 그리면 자동으로 계산된다.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check src tests migrations` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/unit/test_process_moves.py tests/integration/test_api_process_links.py tests/integration/test_api_layouts.py tests/integration/test_schema_constraints.py` | backend/ | 0 | 26 passed(이동 구간 추출, 기본·시나리오 속도, 배치판 갱신, 참조 오류, head 0013·모델 차이 없음) |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_api_scenarios.py tests/integration/test_api_refresh_and_graphs.py` | backend/ | 0 | 23 passed(기존 시나리오 동작 그대로) |
| `python -m pytest -q tests/contract`(계약 0.19.0 갱신 뒤) | backend/ | 0 | 80 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **704 passed**, 경고 2건, 474초. 직전(735)보다 적은 것은 main 커밋 `45c62df`(사용자, 실제 공장 데이터·시드·그 시험 2개 파일을 공개 저장소 추적에서 제외)로 `test_engine_real_catalog.py`·`test_seed_wire_factory.py`가 빠졌기 때문이며, 이번 변경의 시험은 모두 포함 |
| `alembic upgrade head`(로컬 개발 DB) | backend/ | 0 | 0012 → 0013, 개발 API 재시작 |
| `python scripts/generate_contract_examples.py ../contracts/examples/first-scope` | backend/ | 0 | 예제 1개 갱신(시나리오 버전 응답에 새 필드) |

## 다음(BE-24)
- 엔진 반영: 배치판을 고른 시나리오는 실행 입력에 배치판·이동 설정을 고정하고, 운반 시간 = 상하차 + 경로 ÷ 속도, 빈 차 이동 = 경로 ÷ 속도, 사람 이동은 이동 조건 `network_route`인 간선만 경로 ÷ 속도. 배치판을 고르지 않은 시나리오는 결과 불변.
