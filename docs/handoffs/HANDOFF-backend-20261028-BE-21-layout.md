# HANDOFF-backend-20261028-BE-21-layout
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-21**(임시 ID, 배치판·점·포트 매핑·점 순서 경로). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be34 / main `8742d06`(0.16.2, PR #66 머지) / 구현 `79c017c`
- 승인 근거: 사용자 결정·지시(2026-10-28) — 단위 m 소수 첫째 자리(반올림), 원점 도면 왼쪽 위(11시 방향), x·y 기준점 중심, 통로 대신 점(P1…)을 x·y로 관리하고 설비 In/Out을 점에 매핑, 이동 경로는 점 순서 배열(직선 구간), 배치판 관리 유지, "ERD 변경점이나 API 변경 사항을 검토해서 반영해줘". CR `docs/change-requests/CR-backend-20261028-be18-layout-points-routes.md`.
- 계약 버전: **0.16.2 → 0.17.0**(새 scope `layouts`, 추가만, OpenAPI sha `71906840…a9fc7`(FE 검토 반영 후)), migration head **0010 → 0011**, 엔진 c0.3 그대로(결과 불변).

## ERD 변경(docs/architecture/02_erd_database.md §7 갱신)
| 테이블 | 내용 |
|---|---|
| layout_version | 프로젝트당 version_no, draft → approved, 초안 하나, `name`·`notes`·`canvas_width_m`·`canvas_height_m`·`attributes`(JSONB) |
| layout_point | `point_key`(배치판 안 유일)·`x_m`·`y_m`·`attributes` |
| asset_placement | 설비·공간 `asset_id`(배치판 안 한 번)·`x_m`·`y_m`(중심)·`width_m`·`height_m`·`rotation_deg`(모르면 null)·`attributes` |
| layout_port_point | 포트(설비 IN/OUT, 공간 ACCESS) → 점, 배치판 안 포트당 하나 |
| layout_route | `route_key`·출발 포트·도착 포트·`mode`(열린 문자열)·`attributes` |
| layout_route_point | 경로의 점 순서(`seq`) |

- 좌표·크기 `NUMERIC(9,1)`, 반올림은 앱(ROUND_HALF_UP). 같은 배치판의 점만 참조(복합 FK), 자산·포트는 같은 프로젝트. 승인본과 하위 행은 트리거로 동결.
- ERD 계획의 port_placement·network_node·network_edge·port_network_attachment는 두지 않았다(사용자 결정). zone·층(z)·CAD 가져오기는 후속.

## API(04 §7.1)
`GET/POST /layout-versions`, `GET/PATCH /layout-versions/{v}`, `PUT /layout-versions/{v}/content`(통째로 교체, If-Match), `POST …/validate`, `POST …/approve`(admin). 응답에 고정 좌표계(`coordinate_system`), 배치의 자산 코드·이름, 포트 매핑의 포트 key·역할·자산, 경로의 출발·도착 자산과 계산한 `length_m`. 저장 오류 `LAY-SAVE-001~010`(422), 검증 `LAY-001~007`(오류는 승인 차단, 경고는 표시만).

## FE 검토 반영(머지 전, 같은 PR)
- 검증 오류 `field_path`를 key 기준으로 바꿈(`/points/{point_key}`, `/placements/{asset_id}`, `/port_points/{port_id}`, `/routes/{route_key}`). 저장 오류는 요청 본문 순번 그대로. 응답 목록 순서가 저장 순서와 달라 순번으로는 화면이 대상을 찾을 수 없었다(커밋 `c145a97`).
- 회전: 회전 전 가로·세로, 중심 기준, y 아래 화면에서 시계 방향 +. 배경 도면 약속 키 `attributes.background = {url, width_px, height_px, m_per_px}`(서버는 저장만). 초안 폐기 endpoint 없음.
- 재확인: `REQUIRE_DB=1 pytest -q tests/contract tests/unit/test_layout_rules.py tests/integration/test_api_layouts.py` → 88 passed(종료 코드 0).

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check src tests migrations` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/unit/test_layout_rules.py tests/integration/test_api_layouts.py` | backend/ | 0 | 8 passed(반올림·길이·저장 오류·검증·승인 동결·복사·권한·If-Match) |
| `python -m pytest -q tests/contract`(계약 0.17.0 갱신 뒤) | backend/ | 0 | 80 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 1 | **729 passed, 1 failed**, 552초. 실패 1건은 `test_schema_constraints.py::test_head_and_no_model_drift`가 head를 '0010'으로 고정해 둔 것 → '0011'로 고침 |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_schema_constraints.py`(고친 뒤) | backend/ | 0 | 18 passed(head 0011, 모델-migration 차이 없음) |
| `alembic upgrade head`(로컬 개발 DB `simulation_platform`) | backend/ | 0 | 0010 → 0011, 개발 API 재시작 |

## 남은 결정·후보
- 시나리오가 배치판을 고르고(`scenario_version.layout_version_id`) 경로 길이로 운반 시간을 계산할지(지금은 운반 1건 3분 + 싣기·내리기 1분 고정), 계산한다면 지게차·AMR 속도.
- 경로 방향성: 지금은 출발 → 도착 한 방향. 같은 길을 되돌아오는 경로는 별도 경로로 둔다.
