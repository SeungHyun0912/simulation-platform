# CR-backend-20261027-be14-scenario-refresh
- 요청자: Backend / 작업 BE-14(임시 ID) / 대상: contracts/04 §5.1(시나리오 버전)
- 상태: **사용자 승인**("시나리오를 최신 승인 공정으로 갱신하는 기능 개발과 공정 일괄 조회 기능 같이 개발해 줘", 2026-10-27). 같은 지시로 CR be13(공정 일괄 조회) 후보도 승인되어 함께 계약 **0.14.0**으로 낸다.
- 선행: 계약 0.13.0(PR #56 머지).

## 1. 왜 필요한가
시나리오 버전은 제품마다 공정 버전을 고정한다. 공정을 고쳐 새 승인본을 만든 뒤 다시 실행하려면 지금은 시나리오 초안을 만들고 제품마다 새 공정 버전 id를 찾아 `products`를 통째로 다시 보내야 한다(도착·가정까지 다시 써야 함). 공정 수정 → 재실행 → 비교 흐름의 가장 번거로운 단계다.

## 2. 범위(계약 0.14.0, 추가만, migration 없음)
`POST /projects/{p}/scenario-versions/{v}/refresh`(editor, If-Match = 시나리오 버전 row_version, **초안만**)
- 본문(선택, 닫힌 객체): `product_ids`(일부 제품만, 생략하면 전부), `assets`: `latest`(기본) | `keep`.
- 제품마다 공정 버전을 그 제품의 **현재 승인본**으로 바꾼다. 도착·가정·우선순위·순서는 그대로 둔다. 승인본이 없는 제품은 그대로 두고 `no_approved_version`으로 알린다.
- 자산 고정: `latest`면 바뀐 공정이 쓰는 자산을 각 자산의 현재 승인 버전으로 다시 고정하고 더 쓰지 않는 자산의 고정은 뺀다(승인 버전이 없는 자산은 고정하지 않음 — 사전검증 경고 SCN-ASSET-001). `keep`이면 기존 고정은 두고 새로 쓰는 자산만 채운다(PATCH의 자동 고정과 같음).
- 응답: 갱신된 시나리오 버전, `process_changes[]`(제품별 이전·새 공정 버전과 `changed|unchanged|no_approved_version|not_requested`), `asset_changes[]`(`pinned|updated|removed`). 감사 로그를 남긴다.
- 승인된 시나리오 버전은 409 `VERSION_IMMUTABLE`(새 초안을 먼저 만든다: `POST /scenarios/{s}/versions`).

## 3. 사용 흐름
공정 승인본에서 새 초안 복제·수정·승인 → `POST /scenarios/{s}/versions`(최근 승인 시나리오 복사) → `POST /scenario-versions/{v}/refresh` → 사전검증·승인 → `POST /runs` → `GET /runs/{a}/compare/{b}`.

## 4. 공정 일괄 조회(CR be13, 이번에 함께 구현)
- `GET /projects/{p}/process-graphs?basis=approved|latest&product_id=…&version_id=…&mode=summary|full&limit&cursor`: 여러 제품의 공정 그래프를 한 번에. `version_id`를 주면 그 버전들(최대 50개), 아니면 제품 코드 순으로 기준(`approved` = 현재 승인본, `latest` = 가장 최근 버전)에 맞는 버전. `mode=summary`(기본)는 노드(키·종류·이름·공간 자산·단계 종류·후보 설비)와 간선만, `full`은 `GraphOut` 그대로. 항목마다 버전 요약과 ETag(row_version). 한 번에 최대 50개.
- `GET /projects/{p}/assets/{asset_id}/uses?basis=approved|latest`: 그 자산을 쓰는 제품·공정 버전·노드(공간 노드 또는 단계의 후보 설비).
