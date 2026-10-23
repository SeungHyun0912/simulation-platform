# 계약 변경 기록 (프런트 영향 정본)

`contract-status.json`의 `contract_version`·`openapi_sha256`이 바뀌면 **이 파일의 해당 버전 항목을 먼저 읽고**
generated client를 재생성한다. 각 항목은 호환성, 변경 요약, 프런트가 해야 할 일, 상세 안내서 링크를 담는다.
계약을 바꿀 때는 CR 승인 → 코드 → `export_openapi` → `contracts/openapi.json`·해시·이 파일 갱신 순서를 지킨다
(백엔드 계약 테스트가 스냅샷·해시 불일치를 실패로 처리한다).

## 0.3.0 — 2026-10-23 · scope `products-materials` · sha256 `a4610740…8b48` · 기준 commit `6f07b53`
- **호환성: 0.2.0 클라이언트와 호환(추가만).** 기존 operation의 요청·응답 필드는 그대로이며 `GET /me`의 프로젝트 항목에 `status`가 늘었다.
- **추가 operation 8개:** 제품 목록/생성/조회/수정, 재료 목록/생성/조회/수정(`/projects/{p}/products`, `/projects/{p}/materials`).
- **`GET /me`:** `projects[].status`(`active|archived`) 추가. 보관된 프로젝트도 목록에 포함하며 제외 여부는 클라이언트가 정한다(현재 archive 기능이 없어 모두 `active`).
- **새 오류 코드:** `PRODUCT_CODE_CONFLICT`, `MATERIAL_CODE_CONFLICT`(409, `field_path=/code`).
- **제품·재료는 버전이 없는 기준정보**다. 자산 기본 정보처럼 항상 수정할 수 있고(`If-Match` 필수), 보관은 `archived_at`·`include_archived`만 있다(archive endpoint 없음).
- **제품:** `{code, name, specification|null, notes|null}`. `specification`은 자유 텍스트이며 `null`이 미정, 빈 문자열은 422.
- **재료:** `{code, name, form, default_spec, notes|null}`. `form`은 자유 텍스트(1~100자). `default_spec`은 `length_m`·`weight_kg`(decimal **문자열**, 0 초과, 소수 6자리까지)와 `unit_count`·`strand_count`(**JSON 정수**, 1 이상)를 **섞지 않는** 필드별 판별 객체 `{mode: unknown|known|not_applicable, value}`이며 기본값은 모두 `unknown`(0이 아님). `known`만 `value`를 가진다. PATCH는 보낸 필드만 교체한다.
- **아직 없는 것:** 제품 목록의 `latest_process_version` 요약(공정 버전 CR에서 **추가 필드**로 도입).
- **프런트가 해야 할 일(요약):**
  1. `/me.projects[].status`로 보관 프로젝트를 전환 메뉴에서 구분(필드가 `GET /projects`와 같은 값).
  2. 제품 화면: 목록·생성·수정 연동(`code` 중복 409), `specification`의 `null`=미정 표시, 서버 정렬(`code|name`)·`q`·cursor. 제품 목록에 공정 요약은 아직 없다.
  3. 재료 화면은 FE에 아직 없다. 만들 때 `default_spec`의 `known`↔`value` 어댑터(개수는 정수, 길이·중량은 문자열)와 `unknown` 기본값을 사용.
- **상세:** [04 §3.3](04_api_contract.md), [CR be03](../docs/change-requests/CR-backend-20261023-be03-products-materials.md), 예제 `examples/first-scope/{product,material,me}.*`.

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
