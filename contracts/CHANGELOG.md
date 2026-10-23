# 계약 변경 기록 (프런트 영향 정본)

`contract-status.json`의 `contract_version`·`openapi_sha256`이 바뀌면 **이 파일의 해당 버전 항목을 먼저 읽고**
generated client를 재생성한다. 각 항목은 호환성, 변경 요약, 프런트가 해야 할 일, 상세 안내서 링크를 담는다.
계약을 바꿀 때는 CR 승인 → 코드 → `export_openapi` → `contracts/openapi.json`·해시·이 파일 갱신 순서를 지킨다
(백엔드 계약 테스트가 스냅샷·해시 불일치를 실패로 처리한다).

## 0.2.0 — 2026-10-23 · scope `asset-revisions` · sha256 `da543711…a33a` · 기준 commit `e2f3bba`
- **호환성: 0.1.0 클라이언트와 호환(추가만).** 기존 operation의 요청·응답 필드는 그대로이며 자산 응답에 필드 2개가 늘었다.
  단, 0.1.0 *화면 코드*가 가정한 것 중 바꿔야 하는 항목이 있다(아래).
- **추가 operation 7개:** 자산 버전 목록/생성, 버전 조회/수정, 제출·반려·승인.
- **자산 응답 추가:** `current_revision`, `latest_revision` (둘 다 nullable 요약).
- **새 오류 코드:** `VERSION_IMMUTABLE`, `REVISION_DRAFT_EXISTS`, `INVALID_STATE_TRANSITION` (모두 409).
- **프런트가 해야 할 일(요약):**
  1. 버전 상태 `superseded` 추가(`archived`는 서버가 쓰지 않음).
  2. 자산 기본 정보는 항상 편집 가능, **용량·정책만** `draft`에서 편집(지금 화면은 모두 잠금).
  3. 저장은 두 리소스(자산 PATCH, 버전 PATCH)·두 ETag. 설비 용량은 **포트(IN/OUT)별**.
  4. 용량 모드 `value`↔`finite` 매핑, `0` 불허, 단위 5종.
  5. 서버 `issues[]`를 ValidationPanel에 그대로 표시, 규칙 UI(dispatch/release) 신규.
  6. 제출·승인·반려 UI와 권한 표시, 전이 요청의 `If-Match`.
  7. 목록의 용량·그룹 컬럼 제거/대체, 상태는 `latest_revision`/`current_revision`.
- **상세:** [FE 안내서](../docs/handoffs/HANDOFF-backend-20261023-BE-02-for-frontend.md)

## 0.1.0 — 2026-10-23 · scope `project-assets-ports` · sha256 `6bbad0dd…b66e` · 기준 commit `82eb6a2`
- 최초 승인. `/me`, 프로젝트 목록·생성·조회·수정, 자산 목록·생성·조회·수정·포트 조회(11 operation).
- 공통 규약: 응답 래퍼(`data`/`page`), cursor, 404 정책, ETag/If-Match(428/412), 오류 envelope.
- 용량·그룹·버전 상태는 이 버전에 없다(0.2.0에서 용량·버전 상태 추가, 그룹은 후속).
- 예제: [examples/first-scope](examples/first-scope/).
