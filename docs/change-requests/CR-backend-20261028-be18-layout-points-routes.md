# CR-backend-20261028-be18-layout-points-routes
- 요청자: Backend / 작업 BE-21(임시 ID) / 대상: ERD §7(배치·통로), contracts/04 §7(CAD·배치 API) 일부를 앞당김
- 상태: **사용자 지시**(2026-10-28) "ERD 변경점이나 API 변경 사항을 검토해서 반영해줘. 배치판 관리는 그대로 유지". 확정 값은 아래 §1.
- 선행: 계약 0.16.2(PR #66 머지). migration head 0010 → 0011.

## 1. 사용자 확정(2026-10-28)
- 단위 m, **소수 첫째 자리까지**(그 아래는 반올림).
- 좌표는 웹에서 도면 이미지를 따서 쓴다: **원점은 도면 왼쪽 위(11시 방향)**, x는 오른쪽, y는 아래쪽으로 커진다.
- 설비·저장공간의 x·y는 **중심**이다. 가로(x 방향)·세로(y 방향) 크기를 둔다.
- 통로를 따로 모델링하지 않는다. **점(P1, P2, …)을 x·y로 관리**하고, 설비의 In/Out(공간은 Access) 포트를 점에 매핑한다.
- 이동 경로는 **점의 순서 배열**(예: [P1, P2, P5, P7])이며 직선 구간의 이음이다.
- 배치판은 버전으로 관리한다(초안 → 승인, 승인본은 불변, 복제로 새 초안).

## 2. ERD 변경(ERD §7 계획 대비)
| ERD 계획 | 이번 결정 |
|---|---|
| `layout_version` | 그대로(프로젝트당 version_no, 초안 하나, 승인 후 불변). 좌표계는 고정(m, 왼쪽 위 원점, y 아래). 도면 크기 `canvas_width_m`·`canvas_height_m`(선택), 배경 이미지 등은 `attributes`(JSONB) |
| `asset_placement`(footprint JSON) | **개별 컬럼** `x_m`·`y_m`(중심)·`width_m`·`height_m`·`rotation_deg`(모르면 null) + 확장 `attributes`(JSONB) |
| `port_placement`(x,y,z) | **`layout_point`**(점: `point_key`·`x_m`·`y_m`·`attributes`) + **`layout_port_point`**(포트 → 점 매핑, 버전 안에서 포트당 하나) |
| `network_node`·`network_edge`·`port_network_attachment` | **두지 않는다.** 대신 **`layout_route`**(`route_key`, 출발 포트·도착 포트, `mode`, `attributes`) + **`layout_route_point`**(경로의 점 순서) |
| `zone` | 범위 밖(후속) |

- 좌표·크기는 `NUMERIC(9,1)`. 저장 전에 소수 첫째 자리로 반올림(ROUND_HALF_UP). x·y는 0 이상, 가로·세로는 0보다 크다. 회전은 도 단위(0 이상 360 미만), 모르면 null.
- 같은 배치판 안에서만 참조하도록 복합 FK(배치판·점), 프로젝트 격리(자산·포트는 같은 프로젝트).
- 승인 후 배치판과 모든 하위 행은 DB 트리거로 동결(시나리오 버전과 같은 방식).

## 3. API(계약 0.17.0, 새 scope `layouts`, 추가만)
| Method | Path | 권한 | 결과 |
|---|---|---|---|
| GET | /projects/{p}/layout-versions | viewer | 목록(최신 version_no부터) |
| POST | /projects/{p}/layout-versions | editor | 새 초안. 본문(선택) `from_version_id`, 없으면 최근 승인본 복사, 그것도 없으면 빈 초안. 초안이 있으면 409 `LAYOUT_DRAFT_EXISTS` |
| GET | /projects/{p}/layout-versions/{v} | viewer | 배치판 전체: 머리 + `points[]` + `placements[]` + `port_points[]` + `routes[]`(점 key 배열·출발/도착 자산·계산한 길이) |
| PATCH | /projects/{p}/layout-versions/{v} | editor | 머리 수정(`name`·`notes`·`canvas_width_m`·`canvas_height_m`·`attributes`). If-Match, 초안만 |
| PUT | /projects/{p}/layout-versions/{v}/content | editor | 점·배치·포트 매핑·경로를 통째로 교체. If-Match, 초안만. 참조 오류는 422 |
| POST | /projects/{p}/layout-versions/{v}/validate | viewer | 검증(저장 안 함): 오류·경고 목록 |
| POST | /projects/{p}/layout-versions/{v}/approve | admin | 초안 → 승인. 검증 오류가 있으면 422 `LAYOUT_VALIDATION_FAILED` |

- 저장(PUT) 때 검사: 점 key·경로 key 중복, 경로·매핑이 없는 점을 가리킴, 이 프로젝트에 없는 자산·포트, 배치 자산 중복, 포트 매핑 중복, 경로 점이 2개 미만, 연속된 같은 점(422 `VALIDATION_ERROR`).
- 검증(validate/approve) 규칙: 경로의 첫 점 = 출발 포트의 점, 끝 점 = 도착 포트의 점(오류). 경로의 출발·도착 포트가 점에 매핑돼 있지 않음(오류). 매핑된 포트의 자산이 배치되지 않음(경고). 도면 크기를 벗어난 점·배치(경고). 크기를 모르는 배치(경고).
- 경로 길이 = 연속한 점 사이 직선 거리의 합, 소수 첫째 자리 반올림(응답에만, 저장하지 않음).
- `mode`는 열린 문자열(예: forklift·amr·manual), 없으면 null(정하지 않음).

## 4. 범위 밖(후속)
- 시나리오가 배치판을 고르는 것(`scenario_version.layout_version_id`)과 경로 길이로 이동 시간을 계산하는 엔진 반영. 지금 엔진 결과는 바뀌지 않는다.
- CAD 파일 가져오기, zone, z(층).
