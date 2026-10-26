# 계약 변경 기록 (프런트 영향 정본)

`contract-status.json`의 `contract_version`·`openapi_sha256`이 바뀌면 **이 파일의 해당 버전 항목을 먼저 읽고**
generated client를 재생성한다. 각 항목은 호환성, 변경 요약, 프런트가 해야 할 일, 상세 안내서 링크를 담는다.
계약을 바꿀 때는 CR 승인 → 코드 → `export_openapi` → `contracts/openapi.json`·해시·이 파일 갱신 순서를 지킨다
(백엔드 계약 테스트가 스냅샷·해시 불일치를 실패로 처리한다).

## 0.6.0 — 2026-10-26 · scope `process-versions`(BE-04c) · sha256 `509a71f1…38ef` · 기준 commit `03f21ba`
- **호환성: 0.5.0 클라이언트와 호환(추가 필드만, operation 변경 없음).** 요청 쪽 새 필드는 모두 선택·기본값이 있고, 응답은 필드가 늘어난다(그래프 응답의 `completion_node_id`·버전 응답의 `completion_node_id`는 항상 있으며 null 가능). **단, 그래프 PUT은 전체 교체이므로 아래 주의를 따라야 한다.**
- **단계 재료 spec** `StepDto.material_specs[]`: `{spec_key, direction: input|output, material_definition_id, state_code, form, length_m, weight_kg, unit_count, strand_count, quantity_basis}`. 길이·중량·단위 수·가닥 수는 서로 섞지 않는 별개 값 객체(`{mode, value}`, 기본 unknown). "3.3t×11개 동시 투입"은 `weight_kg=3300`+`unit_count=11`, "12가닥 공급"은 `strand_count=12`. 단계 PATCH로도 통째 교체할 수 있다.
- **간선 spec 연결** `GraphEdge.source_output_spec_key`·`target_input_spec_key`: `spec_key`로 from 단계의 output spec·to 단계의 input spec을 잇는다(버퍼를 낀 흐름에서는 operation에 붙은 간선에만). 소속·방향이 어긋나면 422(`VAL-SPEC-002~004`), 간선이 연결한 spec을 단계 PATCH로 제거하면 422 `VAL-SPEC-005`.
- **완제품 지정** `completion_node_id`(그래프 PUT 최상위, 응답에도 포함): 같은 그래프의 milestone 노드 id. 미정이면 knowledge **경고** `VAL-GRAPH-014`(승인을 막지 않음), run_template에서는 **오류**. 문서가 완제품 시점을 정하지 않은 공정은 미정으로 둔다.
- **새 검증 항목:** `VAL-SPEC-001`(spec 수량 모두 미정, 경고), `VAL-GRAPH-014`(경고→run 오류), 저장 오류 `VAL-SPEC-002~005`·`VAL-GRAPH-005`·`VAL-REF-006`(다른 프로젝트의 재료).
- **비교·복제:** `diff`가 spec(`/material_specs/{spec_key}/…`)·간선 연결·완제품(`/completion_node_key`)을 포함하고, 새 초안 복제가 이를 새 id로 함께 복사한다.
- **주의(FE 필독):** 그래프 PUT은 전체 교체다. 새 필드를 모르는 화면(0.5.0 이하)이 그래프를 다시 저장하면 spec·간선 연결·완제품 지정이 **지워진다.** 조회한 그래프를 그대로 수정해 보내고 응답에 있는 필드를 보존해야 한다.
- **프런트가 해야 할 일(모두 선택):** ① 타입 재생성 ② 공정 화면을 만들 때 단계의 입력·출력 spec 표시(길이·중량·개수·가닥 구분), 간선 spec 연결, "완제품" milestone 지정 UI ③ 그래프 저장 시 모르는 필드 보존. 완제품 미정 경고 `VAL-GRAPH-014`를 검증 패널에 표시.
- **아직 없는 것:** 값 구조가 정의되지 않은 `execution_rule`·`input_match_policy`·`condition_rule`·`parameter_override`, join 준비 조건·분할/합류 allocate 규칙, 사용자별 편집기 상태.
- **상세:** [04 §4.1.2](04_api_contract.md), [CR be06](../docs/change-requests/CR-backend-20261026-be06-process-material-spec-completion.md), 예제 `examples/first-scope/process-graph.put-with-specs`·`process-step.patch-material-specs`·`error.spec-link-invalid`.

## 0.5.0 — 2026-10-26 · scope `process-versions`(BE-04b) · sha256 `62e3529c…f02d` · 기준 commit `c9de49a`
- **호환성: 0.4.0 클라이언트와 호환(추가만).** 기존 operation의 응답·요청 필드는 그대로이고, 새 초안 생성(`POST …/process-versions`)에 **선택** 본문이 늘었다. 본문 없이 호출하면 0.4.0과 똑같이 동작한다.
- **추가 operation 3개:** `GET …/process-versions/{v}/diff`(버전 비교), `GET·PUT …/process-versions/{v}/editor-state`(화면 좌표). 별도 `clone` endpoint는 없다.
- **복제 기준 선택:** 본문 `{base_version_id}`로 같은 제품의 어느 버전(승인본·superseded)이든 복사해 새 초안을 만든다. 승인·제출 기록은 복사하지 않고, 기준의 화면 좌표도 새 노드 id로 옮겨 복사한다. 다른 제품·프로젝트의 버전은 404.
- **버전 비교:** `against` 생략 시 base 버전, 없으면 현재 승인본. **노드·간선은 `node_key`·`edge_key`로 맞춘다**(FE가 key를 새로 만들어 그래프를 다시 보내면 전부 추가·삭제로 나온다). 결과는 헤더·노드·단계·간선별 `{field_path(JSON Pointer), change, before, after}`와 요약. 기준이 없거나 다른 제품이면 422 `VAL-REF-004`.
- **편집기 상태(화면 좌표):** **버전당 공용 하나**(PoC; 사용자별은 이후 변경). 어떤 버전 상태에서도 저장되며(승인본 포함) 공정 버전의 ETag·승인에 영향이 없다. **자체 ETag**: 저장 전 `row_version 0`, 첫 저장은 `If-Match: "0"`(428/412 규칙은 동일). 키는 그 버전의 노드 id여야 하고(422 `VAL-REF-005`) 좌표는 JSON 숫자다.
- **프런트가 해야 할 일(요약, 모두 선택):** ① 타입 재생성(해시 `62e3529c…`) ② 새 초안 만들기에서 "기준 버전 선택" UI가 필요하면 `base_version_id` 사용 ③ 그래프 편집 화면의 노드 배치를 `editor-state`로 저장·복원(배치는 공정 버전의 ETag와 무관, 충돌은 편집기 상태 ETag로 처리) ④ 승인본·초안 비교 화면은 `diff` 사용(`node_key`를 안정적으로 유지해야 한다).
- **아직 없는 것:** 사용자별 편집기 상태, 단계 입출력 재료 spec·합류/공급 간선의 spec 연결·완료 milestone(BE-04c), 값 구조가 정의되지 않은 `execution_rule`·`input_match_policy`·`condition_rule`·`parameter_override`.
- **상세:** [04 §4.1.1](04_api_contract.md), [CR be05](../docs/change-requests/CR-backend-20261026-be05-process-clone-diff-editor-state.md), 예제 `examples/first-scope/process-version.{create-from-base,diff}`·`process-editor-state.*`.

## 0.4.0 — 2026-10-23 · scope `process-versions`(BE-04a) · sha256 `1da94db0…cb45` · 기준 commit `18754cf`
- **호환성: 0.3.1 클라이언트와 호환(추가만).** 기존 operation의 요청·응답 필드는 그대로이며 `ProductOut`에 nullable 필드 2개(`current_process_version`, `latest_process_version`)가 늘었다.
- **추가 operation 11개:** 제품의 공정 버전 목록/생성, 버전 조회·수정(원자재 기본 단위·완제품 단위·메모), 그래프 조회/전체 교체(PUT), 단계 수정, 검증(`validate?scope=knowledge|run_template`), 제출·반려·승인.
- **새 오류 코드:** `PROCESS_DRAFT_EXISTS`(409, 제품당 열린 버전 하나), `PROCESS_VALIDATION_FAILED`(422, 구조 오류가 있어 제출·승인 불가). 승인·불변·충돌은 자산 버전과 같은 `VERSION_IMMUTABLE`·`INVALID_STATE_TRANSITION`·`EDIT_CONFLICT`·`PRECONDITION_REQUIRED`.
- **핵심 규칙(FE가 알아야 할 것):**
  - 공정 버전은 `draft → in_review → approved → superseded`. **수정은 draft에서만**(그래프·단계·단위·메모 모두), 제출·승인·반려도 `If-Match` 필수, 승인·반려는 project admin만.
  - 그래프는 **노드·간선 전체 교체(PUT, 한 트랜잭션)** 이며 보내지 않은 노드·간선은 삭제된다. 노드·간선 `id`는 **클라이언트가 만든 UUID**(다른 버전이 쓰는 id는 422 `VAL-REF-003`). 간선이 없는 노드를 가리키거나 자기 자신을 가리키면 422.
  - **ETag는 단계가 아니라 공정 버전(`row_version`) 단위**다. 그래프 저장·단계 수정·단위 수정·전이가 모두 같은 버전 ETag를 올린다. 단계 id = operation 노드 id.
  - 단계 PATCH는 보낸 **최상위 필드를 통째로 교체**한다(`timing_rule`을 보내면 `setup` 등 하위도 보낸 값으로 교체, 보내지 않은 하위는 기본 `unknown`). `resources`도 통째 교체.
  - 모든 규칙은 판별자가 있는 닫힌 객체이며 기본값은 **`unknown`(0이 아님)**. 값은 `{mode: unknown|known|not_applicable, value}`(처리 시간·선속·길이는 0 초과, **준비·대기 시간은 0 허용**, 개수는 JSON 정수).
  - 설비 후보는 표시 코드가 아니라 **asset UUID**(같은 프로젝트의 설비만), 노드의 위치는 저장·도킹 공간 asset UUID. 노동자는 `resource_kind=worker`(+`capacity_mode=unlimited`).
  - **미정은 경고라 승인을 막지 않고, 실행 가능성(`validate?scope=run_template`)에서만 필수 미정이 오류**다. 검증 항목은 `{severity, rule_id, entity_id, field_path, message, resolution}`이며 `entity_id`는 단계·노드·간선 id, `field_path`는 그 엔티티 내부 JSON Pointer(순서 번호가 아님).
  - 새 초안은 승인본이 있으면 **그래프를 새 id로 복사**하고(`base_version_id` 기록), 없으면 빈 그래프·미정 단위로 시작한다.
  - 단계는 `operation_type`·`handler_version` 문자열로 엔진 handler를 지정한다. 등록은 자유롭고 지원하지 않는 handler는 `run_template`에서 `UNSUPPORTED_HANDLER` 오류.
- **프런트가 해야 할 일(요약):** [CR be04 §5](../docs/change-requests/CR-backend-20261023-be04-process-versions.md)의 어긋남 13항목 참조. 핵심: ① 직선 표 ↔ 그래프 어댑터(operation → buffer → operation, 자산 UUID 매핑) ② 단계의 `assumed` 확인 상태 제거(마스터 값에 불가) ③ 03 필수 입력 추가(`parallel_streams`·`basis`·`output_schedule`·`precondition_delay`·`quantity_basis`·`accounting_mode`·`required_count`·후보 `eligibility_status`) ④ 검증 경로를 `entity_id`+내부 포인터로 ⑤ 제출·승인·반려 UI와 버전 단위 ETag 처리.
- **아직 없는 것(BE-04b/c):** 복제 선택(`base_version_id` 지정)·버전 비교(diff)·`process_editor_state`, 단계 입출력 재료 spec, 합류(join)·공급(supply) 간선의 spec 연결, 완료 milestone.
- **상세:** [04 §4.1](04_api_contract.md), [CR be04](../docs/change-requests/CR-backend-20261023-be04-process-versions.md), 예제 `examples/first-scope/process-*`.

## 0.3.1 — 2026-10-23 · scope `products-materials`(패치) · sha256 `4821718a…3b5c` · 기준 commit `64e66c0`
- **호환성: 0.3.0 클라이언트와 호환(필드 추가만).** operation은 그대로이고 `GET /me`의 `projects[]`에 `timezone`이 늘었다.
- **`GET /me`:** `projects[].timezone`(IANA 이름, 예 `Asia/Seoul`, `GET /projects/{id}`의 `timezone`과 같은 값) 추가. 서버 시각은 항상 UTC(`Z`)이므로 화면은 이 값으로 변환해 보여 준다. FE 요청 R-FE-14.
- **프런트가 해야 할 일:** 생성 타입을 0.3.1 해시로 재생성하고(`pnpm gen:api` 류, 해시가 `contract-status.json`과 다르면 중단), 시각 표시 기준을 `/me.projects[].timezone`으로 바꾼다(`GET /projects/{id}` 추가 호출 불필요).
- **정정 기록:** 이 필드를 처음에는 0.3.0 안에서 해시를 바꿔 넣으려 했으나 0.3.0이 이미 `main`에 게시된 뒤라 **게시된 버전은 바꾸지 않고** 0.3.1로 분리했다.

## 0.3.0 — 2026-10-23 · scope `products-materials` · sha256 `a4610740…8b48` · 기준 commit `6f07b53` (PR #15로 `main`에 게시, 불변)
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
