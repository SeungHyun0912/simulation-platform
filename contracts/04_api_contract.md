> 워크스페이스 재배치본 v1.1.0 / 2026-10-23. 경로 변경은 구조 결정이며, 업무 규칙과 기술 제안의 승인 상태는 승격하지 않습니다.

# 04. 공통 API 계약

> **부분 승인(PARTIALLY_APPROVED)**: scope `project-assets-ports`(§3.1, contract 0.1.0), `asset-revisions`(§3.2, contract 0.2.0), `products-materials`(§3.3, contract 0.3.0), `process-versions`(§4.1, contract 0.4.0·0.5.0·0.6.0, 패치 0.6.1, 0.8.0), `scenario-versions`(§5.1, contract 0.7.0, 0.8.0)만 승인되었다.
> 버전별 변경과 프런트 영향은 [CHANGELOG.md](CHANGELOG.md)가 정본이다.
> 정식 스냅샷은 [openapi.json](openapi.json)이며 버전·해시·승인 기록은 [contract-status.json](contract-status.json)이 기준이다.
> 이 문서의 그 밖의 모든 endpoint·규칙은 **PROPOSED**이며 승인 scope 밖 기능은 Mock이어도 PROPOSED로 표시한다.
> Backend가 OpenAPI 후보를 만들고 계약 담당자가 검토·승인한 스냅샷으로 Frontend 타입/클라이언트를 생성한다.
> 필드·타입·제약의 정본은 openapi.json이고, 이 문서는 의미와 규칙을 설명한다(둘이 다르면 변경 요청으로 올린다).
> FastAPI는 OpenAPI 기반 API 명세 생성을 제공한다. [S04](../docs/reference/99_sources.md#s04)
> URL 아래의 p/v/r은 각각 project_id/process_version_id/run_id를 나타내는 설명용 표기다.

## 1. 공통 규약

- base: `/api/v1`
- 외부 business API는 project path 필수: `/projects/{project_id}/...`
- 인증 주체와 조직/프로젝트 멤버십은 서버에서 확인.
- 프로젝트 객체를 못 찾거나 접근 권한이 없으면 외부에는 동일한 404를 반환한다(**승인**: scope 내 모든 endpoint).
  멤버라서 프로젝트 존재를 이미 아는 호출자가 역할이 부족한 경우만 403 `FORBIDDEN`.
- 성공 응답은 단건 `{"data": {...}}`, 목록 `{"data": [...], "page": {"limit": 50, "next_cursor": "..."|null}}`(**승인**).
- 목록: `limit`, `cursor`, 허용된 `sort`, `q`, `status` 필터. max limit=200(**승인**, 기본 50).
  cursor는 서버가 발급한 불투명 문자열이며 정렬·필터·프로젝트가 바뀌면 재사용할 수 없다(422 `INVALID_CURSOR`).
- 숫자 단위는 필드명과 DTO에 명시.
- 실제 시각 ISO8601 UTC, UI에서 KST 변환.
- `X-Request-ID` 응답, 사용자 입력 request ID 검증.
- 수정 응답 `ETag: "17"`; 변경 요청 `If-Match: "17"`.
  버전 누락 428 `PRECONDITION_REQUIRED`, 불일치 412 `EDIT_CONFLICT`(**승인**). 마지막 저장 승리 방식 금지.
  ETag 값은 해당 리소스의 `row_version` 정수이며 응답 body에도 `row_version`을 싣는다.
  `If-Match`는 `"17"`, `W/"17"`, `17`을 허용하고 `*`·비숫자는 422.
- 실행/복사/가져오기 POST: `Idempotency-Key`.
  동일 키+동일 body는 기존 결과, 동일 키+다른 body는 409.
- validator 규칙의 결과는 단순 HTTP 성공과 분리. `/validate`는 오류 목록이 있어도 정상 검증 처리면 200.
- 별도 계약 없는 순서 의존 bulk write 금지.

## 2. 오류 응답

```json
{
  "error": {
    "code": "RUN_VALIDATION_FAILED",
    "message": "필수 실행 조건이 미정입니다.",
    "request_id": "req-demo",
    "details": [
      {
        "severity": "error",
        "rule_id": "VAL-TIME-003",
        "entity_id": "00000000-0000-4000-8000-000000000001",
        "field_path": "/timing_rule/processing/output_schedule",
        "message": "멀티신선 산출 방식이 미정입니다.",
        "resolution": "확정값 입력 또는 시나리오 가정 승인"
      }
    ]
  }
}
```

기타 코드:
PROJECT_SCOPE_MISMATCH, VERSION_IMMUTABLE, PRECONDITION_REQUIRED,
EDIT_CONFLICT, UNSUPPORTED_HANDLER, MISSING_ASSUMPTION_ACK,
NETWORK_ROUTE_NOT_FOUND, INVALID_UNIT, IDEMPOTENCY_CONFLICT, JOB_CANCEL_TOO_LATE.
프레임워크 기본 validation 오류도 위 envelope로 변환.

승인 scope(`project-assets-ports`, `asset-revisions`)에서 추가된 코드:

| code | HTTP | 의미 |
|---|---|---|
| UNAUTHENTICATED | 401 | 인증 정보 없음·무효·비활성 사용자 |
| FORBIDDEN | 403 | 프로젝트 멤버이지만 역할 부족, 또는 조직 멤버이지만 admin이 아님 |
| NOT_FOUND | 404 | 없거나 접근 권한이 없음(구분하지 않음). 존재하지 않는 경로도 동일 |
| EDIT_CONFLICT | 412 | `If-Match` 버전 불일치 |
| PRECONDITION_REQUIRED | 428 | `If-Match` 누락 |
| VALIDATION_ERROR | 422 | 요청 형식 오류. `details[].field_path`는 JSON Pointer이며 본문 전체 규칙 위반은 `/` |
| INVALID_CURSOR | 422 | cursor가 올바르지 않거나 정렬·필터와 맞지 않음 |
| PROJECT_CODE_CONFLICT | 409 | 같은 조직에 같은 프로젝트 코드 |
| PROCESS_DRAFT_EXISTS | 409 | 제품에 이미 열린 공정 버전(draft/in_review)이 있음(0.4.0) |
| PROCESS_VALIDATION_FAILED | 422 | 공정 버전에 구조 오류가 있어 제출·승인할 수 없음(0.4.0, `details`에 오류 목록) |
| ASSET_CODE_CONFLICT | 409 | 같은 프로젝트에 같은 자산 코드 |
| PRODUCT_CODE_CONFLICT | 409 | 같은 프로젝트에 같은 제품 코드(0.3.0) |
| MATERIAL_CODE_CONFLICT | 409 | 같은 프로젝트에 같은 재료 코드(0.3.0) |
| INTERNAL_ERROR | 500 | 예기치 않은 서버 오류(상세 비노출, `request_id`로 추적) |
| VERSION_IMMUTABLE | 409 | 초안이 아닌 버전(검토 중·승인·대체됨)의 내용을 수정하려 함(0.2.0) |
| REVISION_DRAFT_EXISTS | 409 | 자산에 이미 열린 버전(draft/in_review)이 있어 새 초안을 만들 수 없음(0.2.0) |
| INVALID_STATE_TRANSITION | 409 | 허용되지 않는 상태 변경(예: draft를 바로 approve)(0.2.0) |
| SCENARIO_CODE_CONFLICT | 409 | 같은 프로젝트에 같은 시나리오 코드(0.7.0) |
| SCENARIO_DRAFT_EXISTS | 409 | 시나리오에 이미 초안 버전이 있음(0.7.0) |
| SCENARIO_NOT_RUNNABLE | 422 | 실행 사전검증 오류가 있어 시나리오 버전을 승인할 수 없음(0.7.0, `details`에 오류) |

`PROJECT_SCOPE_MISMATCH`는 이 scope에서 사용하지 않는다(타 프로젝트 자원은 404).

## 3. 프로젝트·기준정보 API

| Method | Path | 역할 / 결과 |
|---|---|---|
| GET | /me | 인증 사용자·허용 조직·프로젝트 |
| GET/POST | /projects | 권한 범위 목록 / 생성 |
| GET/PATCH | /projects/{p} | 조회 / 설정 변경 |
| POST | /projects/{p}/archive | 보관 |
| POST | /projects/{p}/clone | 복사 job 202, ID 재매핑 |
| GET/POST/PATCH/DELETE | /projects/{p}/members[/{id}] | 관리자만 역할 관리 |
| GET/POST | /projects/{p}/groups | 그룹 목록/생성 |
| PATCH | /projects/{p}/groups/{id} | 이름·부모 변경 |
| PUT | /projects/{p}/groups/{id}/assets | 매핑 일괄 교체 |
| GET/POST | /projects/{p}/assets | kind 필터, 자산 생성 |
| GET/PATCH | /projects/{p}/assets/{id} | 표시정보 수정; ETag |
| POST | /projects/{p}/assets/{id}/archive | 비활성화 |
| GET | /projects/{p}/assets/{id}/ports | IN/OUT/ACCESS |
| GET/POST | /projects/{p}/assets/{id}/revisions | 버전 조회/초안 생성 |
| GET/PATCH | /projects/{p}/asset-revisions/{id} | 설정 조회/초안 수정 |
| POST | /projects/{p}/asset-revisions/{id}/submit | 검토 요청 (0.2.0 추가) |
| POST | /projects/{p}/asset-revisions/{id}/reject | 반려, 사유 필수 (0.2.0 추가) |
| POST | /projects/{p}/asset-revisions/{id}/approve | 검토권한 승인 |
| GET/POST | /projects/{p}/materials | 재료 목록/생성 |
| GET/PATCH | /projects/{p}/materials/{id} | 재료 조회/수정 |
| GET/POST | /projects/{p}/products | 제품 목록/생성 |
| GET/PATCH | /projects/{p}/products/{id} | 제품 조회/표시 수정 |

자산 생성은 kind에 따라 subtype·포트를 원자 생성한다. FE가 포트를 따로 두 번 요청하지 않음.
설비군 candidate qualification 변경은 공정 새 버전에서 수행.

위 표 중 **승인된 operation은 `/me`, `/projects`(GET·POST), `/projects/{p}`(GET·PATCH),
`/projects/{p}/assets`(GET·POST), `/projects/{p}/assets/{id}`(GET·PATCH), `/projects/{p}/assets/{id}/ports`(GET)**
(0.1.0)와 **`/projects/{p}/assets/{id}/revisions`(GET·POST), `/projects/{p}/asset-revisions/{id}`(GET·PATCH),
`.../submit`, `.../reject`, `.../approve`**(0.2.0, §3.2)와 **`/projects/{p}/products`(GET·POST), `/projects/{p}/products/{id}`(GET·PATCH),
`/projects/{p}/materials`(GET·POST), `/projects/{p}/materials/{id}`(GET·PATCH)**(0.3.0, §3.3)뿐이다. 나머지 행(archive, clone, members, groups)은 PROPOSED.

### 3.1 승인 scope `project-assets-ports` (contract 0.1.0)

정본은 [openapi.json](openapi.json), 예제는 [examples/first-scope](examples/first-scope/)(실제 API 응답에서 생성). 근거 CR:
[CR-backend-20261023-be01c-first-scope-api](../docs/change-requests/CR-backend-20261023-be01c-first-scope-api.md).

**프로젝트**
- `POST /projects` `{organization_id, code, name, timezone, description?}` → 201 + ETag + Location.
  호출자가 조직 admin이어야 하고(조직 비멤버는 404) 생성자는 project admin으로 자동 등록된다.
  `timezone`은 IANA 이름(예: `Asia/Seoul`)이며 기본값이 없다. 같은 조직의 `code` 중복은 409.
- `GET /projects`: 호출자가 멤버인 프로젝트만, `code` 오름차순, `q`·`limit`·`cursor`.
- `PATCH /projects/{p}`: `name`, `timezone`, `description`만(project admin, If-Match 필수). `code`·`organization_id`·`status`는 변경 불가.
- `GET /me`: 사용자, 소속 조직(역할), 소속 프로젝트(역할).

**자산**
- `POST /projects/{p}/assets` `{kind, code, name, sort_order?, external_ref?, notes?, equipment|space}`.
  `kind=equipment`는 `equipment`(`equipment_type`, `model_name?`)만, `storage|dock`는 `space`(`space_type`)만 허용하며 반대 객체가 있으면 422.
  **요청에 포트를 보내지 않는다.** 서버가 같은 트랜잭션에서 포트를 만든다: 설비 `IN`/`OUT`, 공간 `ACCESS-01`(`port_key`와 `label`은 같은 값).
  프로젝트 안에서 `code` 중복은 409. admin·editor만 가능(viewer 403).
- `GET /projects/{p}/assets`: `kind`, `q`(code/name 부분 일치, `%`·`_`는 문자), `include_archived`(기본 false),
  `sort`(`sort_order|code|name`, `-` 접두 내림차순, 단일 필드, 기본 `sort_order`), `limit`, `cursor`. 항목마다 `ports`를 포함한다.
- `PATCH /projects/{p}/assets/{id}`: `code, name, sort_order, external_ref, notes, equipment{equipment_type, model_name}, space{space_type}`.
  `kind`와 포트는 변경할 수 없고(알 수 없는 필드로 422) 설비가 아닌 자산의 `equipment`(반대도 동일)는 422. If-Match 필수.
  하위 상세 변경도 자산의 `row_version`을 올린다.
- 선택 필드(`external_ref`, `notes`, `description`, `model_name`)의 `null`은 "입력 없음"이며 PATCH에서 `null`로 지울 수 있다.
  빈 문자열은 `null`이 아니므로 422. 이 scope에는 숫자 단위 필드가 없다.

**이 scope에 없는 것(FE 주의)**: 그룹은 후속 scope다. 용량과 버전 상태(`VersionStatus`)는 0.2.0의 §3.2에서 제공한다.
자산 `ports`에는 위치(placement)가 없다. 자산 기본 정보(코드·이름·모델 등)는 **버전이 없는 리소스**이며 항상 수정할 수 있다
(버전 상태로 편집을 잠그는 대상은 §3.2의 용량·정책뿐이다). 0.2.0부터 자산 응답에 `current_revision`·`latest_revision`(§3.2)이 추가된다.

**권한(잠정, TECH-006 결정 시 조정)**: 조직 admin=프로젝트 생성. project admin=프로젝트 수정·자산 생성/수정, editor=자산 생성/수정, viewer=조회만.

**인증**: 운영 인증 adapter(TECH-002)는 미결이다. 개발·테스트에서만 `X-Debug-User` 헤더(local 모드)를 쓰며 이는 계약이 아니고 openapi.json에도 없다.
FE의 실제 API 모드는 운영 인증이 정해지기 전까지 local 모드 백엔드에서만 동작한다.

### 3.2 승인 scope `asset-revisions` (contract 0.2.0)

정본은 [openapi.json](openapi.json), 예제는 [examples/first-scope](examples/first-scope/)의 `revision.*`·`error.*`. 근거 CR:
[CR-backend-20261023-be02-asset-revision-capacity](../docs/change-requests/CR-backend-20261023-be02-asset-revision-capacity.md).
자산 설정(용량·배출 규칙)은 자산 기본 정보와 **별도 리소스**인 *자산 버전(asset revision)* 에 둔다. 두 리소스는 각자 `row_version`·ETag를 가진다.

**상태와 흐름** (`status`): `draft → in_review → approved → superseded`, 반려는 `in_review → draft`(사유 필수).
- 자산당 열린 버전(draft/in_review)은 **하나**, 승인본(approved)도 하나. 새 승인이 나면 이전 승인본은 자동으로 `superseded`.
- **내용 수정은 `draft`에서만** 가능하다. 그 밖의 상태에서 PATCH하면 409 `VERSION_IMMUTABLE`. 승인본을 고치려면 새 초안을 만든다.
- 제출·반려·승인 요청도 `If-Match`(화면이 본 `row_version`)가 **필수**다. 검토 도중 내용이 바뀐 버전을 이전 화면에서 승인하는 일을 막는다(412).
- 권한(잠정): 초안 생성·수정·제출 = project admin·editor, **반려·승인 = project admin만**. 제출자와 승인자가 같아도 허용하며 감사 로그에 남는다. 조회는 모든 멤버.

**Operation**
| Method | Path | 설명 |
|---|---|---|
| GET | /projects/{p}/assets/{id}/revisions | 최신 `revision_no`부터, `limit`·`cursor` |
| POST | /projects/{p}/assets/{id}/revisions | 새 초안(201, ETag, Location). 승인본이 있으면 그 설정을 복사, 없으면 용량을 모두 `unknown`으로 시작 |
| GET | /projects/{p}/asset-revisions/{rid} | 단건 + `issues`(계산된 경고) |
| PATCH | /projects/{p}/asset-revisions/{rid} | 초안 수정. If-Match 필수 |
| POST | …/{rid}/submit | draft → in_review (If-Match) |
| POST | …/{rid}/reject | in_review → draft, body `{reason}` (If-Match, admin) |
| POST | …/{rid}/approve | in_review → approved (If-Match, admin) |

**AssetRevision**: `{id, project_id, asset_id, revision_no, status, schema_version, storage_capacity|null, ports[], notes|null, issues[],
submitted_at|by, rejection_reason|null, rejected_at|null, approved_at|by, created_at, updated_at|null, row_version}`
- `storage_capacity`: 공간(storage/dock) 버전에서만 값이 있고 설비 버전은 `null`.
- `ports[]`: **설비(IN/OUT 포트)에만** 있다 — `{port_id, port_key, role, buffer_capacity, dispatch_rule, release_rule}`. 공간의 ACCESS 포트에는
  정책이 없다(공간 용량을 포트와 이중 계산하지 않음). 순서는 IN, OUT.
- PATCH는 보낸 필드만 바꾼다: `storage_capacity`(공간만), `ports[]`(설비만, `port_id`별 병합, 보낸 하위 필드만 교체), `notes`(`null`로 지울 수 있음).
  설비에 `storage_capacity`, 공간에 `ports`, 다른 자산의 `port_id`는 422.

**Capacity** (03 §3): `{mode: unknown|finite|unlimited|not_allowed, value, unit, status}`
- `finite`만 `value`(decimal **문자열**)와 `unit`을 가지며 나머지 mode는 둘 다 `null`(보내면 422).
- `unit`: `item`, `bobbin_slot`, `pallet_slot`, `kg`, `m2`. 개수 계열은 **0보다 큰 정수**, `kg`·`m2`는 **0보다 큰 소수(최대 6자리)**. 선행 0(`007`)은 거부.
  `0`은 용량이 될 수 없다(대기 적재를 허용하지 않으면 `not_allowed`). 그 밖의 단위는 422 `VALIDATION_ERROR`.
- `status`는 보내지 않아도 된다(`unknown` mode → `unknown`, 그 외 → `confirmed`로 서버가 채움). 보낸다면 일치해야 한다.
  master 값에는 `assumed`·`not_applicable`을 쓸 수 없다(가정은 시나리오에서만).
- `item` 외 단위는 등록·승인은 되지만 실행 엔진이 지원하지 않으므로 `issues`에 경고(`VAL-CAP-002`)가 붙는다.

**배출 규칙** (`mode` 필수, 모르는 필드는 거부)
- `dispatch_rule`: `{"mode":"unknown"}` 또는 `{"mode":"when_destination_available","reservation":"unknown|reserve|none","wait_at_in_if_busy":bool}`.
- `release_rule`: `{"mode":"unknown"}` 또는 `{"mode":"when_destination_accepts","block_machine_while_waiting":"unknown|yes|no"}`.
- 새 초안의 기본값은 사용자 확정 결정 D-U05·D-U06을 따라 `when_destination_available`(wait_at_in_if_busy=true)·`when_destination_accepts`이며,
  미정인 `reservation`·`block_machine_while_waiting`(OPEN-003)은 `unknown`이다.

**issues** (읽기 전용, 서버가 계산): `{severity, rule_id, entity_id, field_path, message, resolution?}` — 오류 envelope의 `details`와 같은 구성이다.
미정은 오류가 아니라 **경고**이며 승인을 막지 않는다(ADR-017: 지식 승인과 실행 가능 검증 분리). 규칙:
`VAL-CAP-001`(용량 미정), `VAL-CAP-002`(item 외 단위), `VAL-POLICY-001`(예약 미정), `VAL-POLICY-002`(출력 막힘 시 설비 점유 미정),
`VAL-POLICY-003`·`VAL-POLICY-004`(dispatch·release 규칙 자체가 unknown). `field_path`는 JSON Pointer(`/ports/0/buffer_capacity`, 인덱스는 응답 `ports` 배열 기준).

**자산 응답 추가 필드** (비파괴): `current_revision`(현재 승인본 `{id, revision_no, status, approved_at}`), `latest_revision`(가장 최근 버전 같은 형태). 없으면 `null`.
자산을 만들어도 버전은 자동 생성되지 않는다(`latest_revision=null`). 용량 입력을 시작하려면 `POST …/revisions`를 호출한다.

### 3.3 승인 scope `products-materials` (contract 0.3.0, 패치 0.3.1)

정본은 [openapi.json](openapi.json), 예제는 [examples/first-scope](examples/first-scope/)의 `product.*`·`material.*`·`me.get`. 근거 CR:
[CR-backend-20261023-be03-products-materials](../docs/change-requests/CR-backend-20261023-be03-products-materials.md).
제품·재료 정의는 **버전이 없는 기준정보**다(공정 정의가 버전을 가진다). 자산 기본 정보처럼 항상 수정할 수 있고 `If-Match`가 필수이며, 응답 규약(래퍼·cursor·ETag·404 정책)은 §1·§3.1과 같다.

- 권한(잠정): project admin·editor = 생성·수정, viewer = 조회. 코드(`code`)는 프로젝트 안에서 유일(다른 프로젝트는 같은 코드 가능), 제품과 재료의 코드는 서로 독립이다. 중복은 409 `PRODUCT_CODE_CONFLICT`/`MATERIAL_CODE_CONFLICT`(`field_path=/code`).
- 목록: `q`(code/name 부분 일치, `%`·`_`는 문자), `include_archived`(기본 false), `sort`(`code|name`, `-` 접두, 단일 필드, **기본 `code`**), `limit`·`cursor`. 정렬·필터·프로젝트가 바뀐 cursor는 422 `INVALID_CURSOR`.
- 보관: `archived_at`·`include_archived`만 있고 archive endpoint는 없다. 참조된 기준정보의 hard delete는 지원하지 않는다(DELETE endpoint 없음).

**Product**: `{id, project_id, code, name, specification|null, notes|null, archived_at|null, created_at, updated_at|null, row_version}`
- 생성 `{code, name, specification?, notes?}` → 201 + ETag + Location. `specification`은 **자유 텍스트**(최대 4000자)이며 `null`이 미정, 빈 문자열은 422.
- PATCH 가능: `code, name, specification(null로 지움), notes(null로 지움)`.
- 제품 응답의 `current_process_version`(현재 승인본)·`latest_process_version`(가장 최근 버전) 요약은 0.4.0에서 추가된다(§4.1, 비파괴, 공정 버전이 없으면 `null`).

**Material**: `{id, project_id, code, name, form, default_spec, notes|null, archived_at|null, created_at, updated_at|null, row_version}`
- 생성 `{code, name, form, default_spec?, notes?}`. `form`은 **자유 텍스트**(1~100자, 허용값 목록 없음 — 확정된 목록이 생기면 enum으로 좁히는 계약 변경).
- `default_spec`은 `{length_m, weight_kg, unit_count, strand_count}` 각각 `{mode: unknown|known|not_applicable, value}`이다.
  - `known`만 `value`를 가지며, 나머지 mode에 `value`를 보내면 422. **기본값은 모두 `unknown`(0이 아님).**
  - `length_m`·`weight_kg`: **decimal 문자열**, 0 초과, 소수 6자리까지(`"3000"`, `"2000.500000"`). `unit_count`·`strand_count`: **JSON 정수**, 1 이상(문자열·소수·불리언은 422).
  - 길이·중량·단위 수·가닥 수는 서로 환산하지 않으며 서로 다른 필드다. 알 수 없는 키는 거부한다.
- PATCH: `code, name, form, default_spec, notes`. `default_spec`은 **보낸 필드만 교체**하고 나머지는 유지한다(빈 객체·`null`·필드의 `null`은 422). 확정값을 다시 미정으로 되돌리려면 `{mode: "unknown"}`을 보낸다.

**`GET /me` 보강**: `projects[]`에 `status`(`active|archived`, 0.3.0)와 `timezone`(IANA 이름, 0.3.1)이 추가되었다(`GET /projects`의 `Project.status`·`Project.timezone`과 같은 값, 비파괴). 보관된 프로젝트도 목록에 포함하며 제외 여부는 클라이언트가 정한다. 시각은 항상 UTC(`Z`)로 오므로 화면은 `timezone`으로 변환해 보여 준다. (0.3.0·0.3.1은 `main`에 게시된 뒤 불변이다. 현재 계약 버전은 0.4.0.)

## 4. 공정 버전·그래프 API

| Method | Path | 의미 |
|---|---|---|
| GET/POST | /projects/{p}/products/{id}/process-versions | 목록/새 초안 |
| GET | /projects/{p}/process-versions/{v} | 상태·제품·검증 요약 |
| GET/PUT | /projects/{p}/process-versions/{v}/graph | 그래프 전체 조회/원자 저장 |
| PATCH | /projects/{p}/process-versions/{v}/steps/{step_id} | 공정 상세 수정, 전체 버전 ETag 검사 |
| GET/PUT | /projects/{p}/process-versions/{v}/editor-state | 화면 좌표, 물리 layout 아님(0.5.0, 버전 공용) |
| POST | /projects/{p}/process-versions/{v}/validate | knowledge/run_template 구분 |
| POST | /projects/{p}/process-versions/{v}/submit | 검토 요청 |
| POST | /projects/{p}/process-versions/{v}/approve | 승인 |
| POST | /projects/{p}/process-versions/{v}/reject | 반려 사유 |
| (별도 endpoint 없음) | POST …/process-versions 의 선택 본문 `base_version_id` | 복제 기준 선택(0.5.0, `clone` 경로는 두지 않음) |
| GET | /projects/{p}/process-versions/{v}/diff?against=... | 버전 비교(0.5.0, 쿼리 이름은 `base_id`가 아니라 `against`) |

PUT graph 규칙:
1. 권한/If-Match 확인.
2. 모든 client UUID 또는 새 node 임시 key를 검증.
3. 같은 프로젝트/버전 참조인지 검사.
4. DB 트랜잭션 안에 node/step/spec/edge/resource를 함께 저장.
5. 삭제되는 노드에 연결된 edge 처리 명시; 묵시적으로 엉뚱한 연결 생성 금지.
6. new row_version·validation summary 반환.
7. 위키 갱신 outbox 생성. 승인 정보 공개는 승인 이벤트 때만.

### 4.1 승인 scope `process-versions` — BE-04a (contract 0.4.0), BE-04b (0.5.0), BE-04c (0.6.0)

위 표 중 **승인된 operation은 14개**다: 0.4.0의 11개(제품의 공정 버전 목록/생성, 버전 조회·수정, 그래프 조회/PUT, 단계 PATCH, validate, submit·reject·approve)와
0.5.0의 3개(`diff`, `editor-state` GET·PUT)이며 0.5.0은 새 초안 생성의 **선택 본문**(`base_version_id`)도 더했다. 별도 `clone` endpoint는 두지 않는다.
0.6.0(BE-04c)은 **operation을 늘리지 않고** 단계의 재료 spec·간선의 spec 연결·완제품 milestone 지정 필드를 더했다(§4.1.2). `execution_rule`·`input_match_policy`·`condition_rule`·후보 `parameter_override`(값 구조 미정의)와 join 준비 조건·분할/합류 allocate 규칙은 **PROPOSED**다.
정본은 [openapi.json](openapi.json), 예제는 [examples/first-scope](examples/first-scope/)의 `process-*`·`product.get`·`error.graph-invalid`·`error.process-draft-exists`.
근거 CR: [CR-backend-20261023-be04-process-versions](../docs/change-requests/CR-backend-20261023-be04-process-versions.md)(0.4.0), [CR-backend-20261026-be05-process-clone-diff-editor-state](../docs/change-requests/CR-backend-20261026-be05-process-clone-diff-editor-state.md)(0.5.0), [CR-backend-20261026-be06-process-material-spec-completion](../docs/change-requests/CR-backend-20261026-be06-process-material-spec-completion.md)(0.6.0).

**상태·권한(자산 버전과 같은 방식, 잠정)**: `draft → in_review → approved → superseded`, 반려는 `in_review → draft`(사유 필수).
제품당 열린 버전(draft/in_review)은 하나, 승인본도 하나(새 승인이 나면 이전 승인본은 자동 `superseded`).
**수정(그래프·단계·단위·메모)은 `draft`에서만** 가능하며 그 밖의 상태는 409 `VERSION_IMMUTABLE`(DB 트리거가 노드·간선·단계·자원 요구·후보의 직접 수정도 막는다).
수정·제출 = project admin·editor, 반려·승인 = project admin만, 조회·검증 = 모든 멤버. 제출·반려·승인도 `If-Match` 필수(승인 직전 수정 방지, 412).
제출·승인은 knowledge 검증의 **오류**(구조 오류)가 없어야 하며 있으면 422 `PROCESS_VALIDATION_FAILED`다. 미정은 경고라 막지 않는다(ADR-017).

**버전**: `{id, project_id, product_id, version_no, status, base_version_id|null, schema_version, raw_unit_spec, finished_unit_spec, notes|null, issues[], submitted_*, rejection_*, approved_*, created_at, updated_at|null, row_version}`.
`raw_unit_spec`(원자재 기본 단위)·`finished_unit_spec`(완제품 단위)은 재료 `default_spec`과 같은 값 객체(`length_m`·`weight_kg`·`unit_count`·`strand_count`, 길이·중량·보빈 수·가닥 수를 섞지 않음, 기본 모두 `unknown`)이며 `PATCH /process-versions/{v}`는 보낸 필드만 교체한다.
**새 초안**(`POST …/process-versions`)은 승인본이 있으면 그래프를 **새 id로 복사**하고 `base_version_id`를 기록하며, 없으면 빈 그래프·미정 단위로 시작한다. 열린 버전이 있으면 409 `PROCESS_DRAFT_EXISTS`.
0.5.0부터 본문 `{base_version_id}`로 복사할 버전을 고를 수 있다(아래 §4.1.1).

**그래프**: `GET`은 `{process_version_id, row_version, nodes[], edges[], completion_node_id|null, issues[]}`(노드는 `display_order`, `node_key` 순), `PUT`은 `{nodes[], edges[], completion_node_id?}`로 **전체 교체**한다(0.6.0의 새 필드는 모두 선택이지만 전체 교체이므로 §4.1.2의 주의를 따른다).
- 노드 `{id, node_key, kind: source|buffer|operation|join|milestone|sink, label, asset_id|null, display_order, step|null}`. `id`는 **클라이언트가 만든 UUID**이고 다른 버전이 쓰는 id는 422(`VAL-REF-003`). `node_key`는 버전 안에서 유일.
  `operation`만 `step`을 가지며 그 `step`의 id는 노드 id와 같다. `asset_id`는 source·buffer·sink에만 둘 수 있고 **저장·도킹 공간**만 가능하다(`null` = 위치 미정). operation 노드에 설비를 직접 박지 않는다.
- 간선 `{id, edge_key, from_node_id, to_node_id, edge_kind: material|precedence|supply, movement_rule}`. 없는 노드를 가리키거나 자기 자신을 가리키면 422(`VAL-GRAPH-001`·`003`), material 간선이 sink에서 나가거나 source로 들어가면 422(`VAL-GRAPH-004`).
- 단계 `{operation_type|null, handler_version|null, timing_rule, input_rule, output_rule, handoff_rule, residual_rule, resources[]}`. 자원 요구 `{role_key, resource_kind: equipment|worker, selection_mode: one_of|all_of, required_count, capacity_mode: finite|unlimited, allocation_rule, candidates[{asset_id, eligibility_status: confirmed|unknown}]}`.
  후보는 **같은 프로젝트의 설비 asset UUID**만(표시 코드가 아님), 노동자는 후보가 없고 무제한은 worker만, `one_of`에서 `required_count`가 (후보가 있을 때) 후보 수를 넘으면 422(`VAL-RES-001`).
- 한 요청에서 오류가 하나라도 있으면 **아무것도 저장하지 않는다**. 오류의 `field_path`는 요청 본문 기준 JSON Pointer(`/nodes/1/asset_id`, `/edges/0/to_node_id`)다.
- 실제 순환(재작업)은 저장할 수 있으나 경고(`VAL-GRAPH-011`)이며 실행 판정에서 오류다.

**단계 PATCH**(`PATCH /process-versions/{v}/steps/{step_id}`): **ETag는 단계가 아니라 공정 버전의 `row_version`** 이다(그래프 저장·단계 수정·단위 수정·전이가 모두 같은 값을 올린다).
`label`(노드 이름), `operation_type`·`handler_version`(null로 지움), `timing_rule`·`input_rule`·`output_rule`·`handoff_rule`·`residual_rule`·`resources`는 **보낸 최상위 필드를 통째로 교체**한다(하위 객체를 부분 병합하지 않으며 보내지 않은 하위는 기본 `unknown`).
buffer 같은 비 operation 노드의 id나 다른 버전의 단계 id는 404.

**규칙 표현**(03 §4~7, 모두 판별자가 있는 닫힌 객체, 값은 `{mode: unknown|known|not_applicable, value}`, 기본 `unknown`이며 0이 아님):
`timing_rule.processing.kind` = `unknown|none|output_speed|per_output_unit|per_reference_length`(각각 `speed_m_per_min`·`basis`·`output_schedule`·`parallel_streams` / `duration_min`·`output_schedule` / `reference_length_m`·`duration_min`·`scaling`·`includes_setup`),
`setup`·`precondition_delay`(`duration_min`, `trigger` 8종+`unknown|not_applicable`, 대기는 `occupancy`)는 **0 시간이 유효**하다. 처리 시간·선속·길이는 0 초과 decimal 문자열(소수 6자리까지), 개수는 JSON 정수(1 이상).
`output_rule`(`mode`·`unit_form`·`length_m`·`weight_kg`·`unit_count`·`quantity_basis`·`schedule`·`accounting_mode`), `input_rule`, `handoff_rule`, `residual_rule`의 허용값은 openapi.json이 정본이다.

**검증**(`POST …/validate?scope=knowledge|run_template`, 오류가 있어도 정상 수행이면 200, 버전 조회·그래프 응답의 `issues`는 knowledge 범위): 항목은 `{severity, rule_id, entity_id, field_path, message, resolution?}`이며
`entity_id`는 단계·노드·간선(또는 버전 자체) id, `field_path`는 **그 엔티티 내부** JSON Pointer(예 `/timing_rule/processing`)다. 순서 번호는 쓰지 않는다.
규칙 id: `VAL-TIME-001~005`(처리 방식·값·산출 방식·준비·공급 대기 미정), `VAL-OUT-001~004`(산출), `VAL-INPUT-001`·`VAL-HANDOFF-001`, `VAL-HANDLER-001`(operation_type 미정), `VAL-RES-001`(후보 수 오류)·`002~004`(자원 요구·후보·eligibility 미정),
`VAL-GRAPH-001~004`(구조 오류)·`010~013`(단계 없음·순환·고립 단계·위치 미정 buffer), `VAL-VER-001·002`(원자재·완제품 단위 미정), `VAL-REF-001~003`(저장 시 참조 오류), `VAL-REF-004`(비교 대상 오류)·`005`(편집기 상태의 없는 노드)·`006`(spec이 참조한 재료가 이 프로젝트의 것이 아님), `VAL-GRAPH-005`(완제품 지정 노드 오류)·`014`(완제품 판정 시점 미정, 경고), `VAL-SPEC-001`(spec 수량 모두 미정, 경고)·`002~005`(간선 spec 연결·교체 오류).
**knowledge**에서는 구조 오류만 오류이고 미정은 모두 경고다. **run_template**에서는 실행에 필요한 미정(`VAL-TIME-*`, `VAL-OUT-001~003`, `VAL-RES-002~004`, `VAL-INPUT-001`, `VAL-HANDOFF-001`, `VAL-HANDLER-001`, `VAL-GRAPH-011`)과 **단계가 없는 공정(`VAL-GRAPH-010`, 0.6.1, 보드 DEC-005)** 이 오류로 승격되고,
엔진이 지원하지 않는 handler는 `UNSUPPORTED_HANDLER`(rule_id) 오류가 된다. 지원 handler(07 §2): `pass_through_length`, `split_length`, `output_units_by_time`, `configured_yield`, `supply_delay`, `inspection`, `transport_manual`(handler_version `1`).
등록(저장)은 handler 지원 여부와 무관하며 실행 가능 여부만 막는다(03 §12).

**제품 응답 추가 필드**: `current_process_version`(현재 승인본), `latest_process_version`(가장 최근 버전) — 각각 `{id, version_no, status, approved_at|null}` 또는 `null`.

#### 4.1.1 복제 기준 선택·비교·편집기 상태 (contract 0.5.0, 0.4.0과 호환)

**복제 기준 선택**: `POST …/products/{id}/process-versions` 본문은 **선택**이다(없거나 `{}`·`{"base_version_id": null}`이면 0.4.0 동작 = 현재 승인본 복사).
`base_version_id`는 **같은 제품의 모든 상태**의 버전이 될 수 있으며(실제로는 열린 버전이 있으면 어차피 409이므로 approved·superseded) 복사본은 항상 `draft`다.
그래프·원자재/완제품 단위·메모를 새 id로 복사하되 **제출·승인·반려 기록은 복사하지 않는다**. 다른 제품·다른 프로젝트·없는 버전은 모두 404, 모르는 본문 필드는 422, 열린 버전이 있으면 기준을 지정해도 409 `PROCESS_DRAFT_EXISTS`.
기준 버전의 **편집기 상태(화면 좌표)도 새 노드 id로 옮겨 복사**한다.

**비교**: `GET …/process-versions/{v}/diff?against={other}`는 이 버전(target, after)을 `against`(before)와 비교한다. `against`를 생략하면 이 버전의 `base_version_id`, 없으면 현재 승인본이다. 기준이 없으면 422 `VAL-REF-004`(`/against`), 다른 제품의 버전도 422 `VAL-REF-004`, 없는 버전·접근 불가는 404. 읽기 전용(ETag 없음, 모든 멤버).
- 노드·간선은 **`node_key`·`edge_key`로 맞춘다**(복제하면 id는 바뀌고 key는 유지된다). FE가 key를 새로 만들어 그래프를 통째로 다시 보내면 모두 추가·삭제로 보인다. 간선 끝점은 id가 아니라 `from_node_key`·`to_node_key`로 비교한다.
- 응답 `{target_version_id, against_version_id, header[], nodes{added[],removed[],changed[]}, steps{changed[]}, edges{added[],removed[],changed[]}, summary{added,removed,changed,identical}}`.
  `header`는 `/notes`·`/raw_unit_spec/…`·`/finished_unit_spec/…`, `nodes.changed`는 노드 자체 필드(`/kind`·`/label`·`/asset_id`·`/display_order`), `steps.changed`는 단계 내용(`/timing_rule/…`, 자원 요구는 `/resources/{role_key}/candidates/{asset_id}/…` — 순서가 아니라 role_key·후보 asset_id로 맞춘다).
  각 항목은 `{field_path, change: added|removed|changed, before, after}`이며 없는 쪽 값은 `null`, 값은 입력 그대로(decimal 문자열 유지)다. 모드 `unknown → known`도 변경이다. `added`·`removed`는 전체 노드·간선(added는 target의 id, removed는 against의 id).

**편집기 상태**: `GET·PUT …/process-versions/{v}/editor-state`, 본문 `{node_positions: {"<node_id>": {x, y}}, viewport: {x, y, zoom}|null}`(응답에 `process_version_id`·`row_version`·`updated_at|null`·`updated_by|null`).
- **PoC 결정: 버전당 공용 하나**다(사용자별 저장은 이후 변경으로 도입, DB는 그것을 받을 수 있게 준비됨). 좌표는 JSON 숫자(문자열 거부, 절댓값 1,000,000 이하 유한수), `zoom`은 0 초과, 키는 **그 버전의 노드 id**여야 하며 아니면 422 `VAL-REF-005`(`/node_positions/{id}`). 노드 수 상한(500)이 곧 좌표 수 상한이다.
- **버전 상태와 무관하게 저장할 수 있다**(검토 중·승인본·superseded 포함). 화면 좌표는 공정 내용도 물리 위치도 아니며 **공정 버전의 `row_version`·상태·승인에 영향이 없고 감사 로그도 남기지 않는다**. 저장은 admin·editor, 조회는 모든 멤버.
- **자체 ETag**(이 상태의 `row_version`)를 쓴다: 저장 전 `GET`은 빈 좌표·`row_version: 0`(200, ETag `"0"`)이고 `PUT`은 `If-Match`가 필수(없으면 428, 어긋나면 412 `EDIT_CONFLICT`)이며 첫 저장은 `If-Match: "0"`이다. 전체 교체이므로 보내지 않은 노드의 좌표는 사라진다.

#### 4.1.2 단계 재료 spec·간선 spec 연결·완제품 지정 (contract 0.6.0, 0.5.0과 호환)

**단계 재료 spec** — `StepDto.material_specs[]`(그래프 PUT·단계 PATCH·그래프 조회, 기본 `[]`):
`{spec_key, direction: input|output, material_definition_id|null, state_code|null, form|null, length_m, weight_kg, unit_count, strand_count, quantity_basis}`.
- `spec_key`는 단계 안에서 입력·출력 공통으로 유일(1~64자). 길이·중량은 decimal 문자열(0 초과, 소수 6자리까지), 단위 수·가닥 수는 JSON 정수(1 이상)이며 **서로 환산하거나 섞지 않는다**: 값은 재료 `default_spec`과 같은 `{mode: unknown|known|not_applicable, value}`이고 기본은 모두 `unknown`(0이 아님).
  예) "3.3t×11개 동시 투입"은 `weight_kg=3300`, `unit_count=11`이고 "12가닥 공급"은 `strand_count=12`(보빈 수가 아님).
- `quantity_basis`: `unknown|per_operation|per_input_unit|per_lot|total_plan`(`output_rule`과 같은 어휘). 작업 한 번의 수량과 총 계획 수량을 구분한다.
- `material_definition_id`는 같은 프로젝트의 재료(아니면 422 `VAL-REF-006`), `state_code`("1차 조사 후")·`form`("보빈")은 자유 텍스트(enum 아님).
- `output_rule`(산출 방식 규칙)과 별개의 기록이다: `output_rule`은 handler가 산출을 계산하는 규칙, spec은 단계가 받고 내보내는 재료의 상태·수량이다. 서로 자동으로 맞추거나 검증하지 않는다(물량 보존 판정은 이 범위 밖).
- 단계 PATCH `material_specs`는 보내면 **통째 교체**(`spec_key`로 맞추므로 같은 key는 id가 유지되어 간선 연결이 끊기지 않음), 보내지 않으면 그대로. **간선이 연결한 spec을 제거하거나 방향을 바꾸면 422 `VAL-SPEC-005`**(그래프 PUT으로 간선 연결을 먼저 풀어야 한다).

**간선 spec 연결** — `GraphEdge.source_output_spec_key`, `target_input_spec_key`(둘 다 선택, 기본 `null`): spec id를 따로 만들지 않고 `spec_key`로 연결한다.
`source_output_spec_key`는 **from 노드(operation) 단계의 `output` spec**, `target_input_spec_key`는 **to 노드 단계의 `input` spec**이어야 하며 아니면 422(`VAL-SPEC-002`·`003`, 요청 본문 `field_path` 예 `/edges/1/source_output_spec_key`). `precedence` 간선에는 쓸 수 없다(`VAL-SPEC-004`).
DB도 같은 규칙(단계 소속·방향)을 복합 FK로 강제한다. 버퍼를 사이에 둔 흐름(operation → buffer → operation)에서는 operation에 붙은 간선에만 연결한다. 입력 spec이 둘인 단계(예: 선행 가공 직결 + 공급)는 간선마다 `target_input_spec_key`로 구분한다.

**완제품 지정** — `GraphIn/GraphOut.completion_node_id`, `ProcessVersionOut.completion_node_id`(선택·null 가능): 같은 요청의 **`kind=milestone` 노드 id**(아니면 422 `VAL-GRAPH-005`)이며 그래프와 원자적으로 교체된다. 미지정은 "완제품 판정 시점 미정"이다.
- **knowledge에서는 경고** `VAL-GRAPH-014`(승인을 막지 않음), **run_template에서는 오류**(엔진이 완제품 시점을 알아야 한다). 단계가 하나도 없는 그래프에는 이 경고가 없다.
- `completion_node_id`는 초안에서만 바뀐다(검토 중·승인본은 동결, DB 트리거).

**주의(전체 교체):** 그래프 `PUT`은 항상 전체 교체이므로 0.5.0 이하 화면이 새 필드를 모르고 그래프를 다시 저장하면 `material_specs`·간선 spec 연결·`completion_node_id`가 **지워진다**.
FE는 조회한 그래프를 그대로 수정해 보내야 하며(모르는 필드 보존) 응답에 없는 필드를 새로 만들어 보내지 않는다.

**비교·복제:** `diff`는 단계의 `/material_specs/{spec_key}/…`(spec_key로 맞춤), 간선의 `/source_output_spec_key`·`/target_input_spec_key`, 헤더의 `/completion_node_key`(id가 아니라 완제품 노드의 `node_key`)를 포함한다. 새 초안 복제는 spec·간선 연결·완제품 지정을 새 id로 함께 복사한다.
예제: `examples/first-scope/process-graph.put-with-specs`·`process-step.patch-material-specs`·`error.spec-link-invalid`.

#### 4.1.3 잔량 폐기 `discard` (contract 0.8.0, 0.7.0과 호환)
- 단계의 `residual_rule.mode`에 `discard`가 더해졌다(기존 값 `unknown`·`none`·`carry_same_product`는 그대로). **그 단계가 계획한 산출을 만들고 남은 길이를 그 자리에서 폐기한다**
  (예: 100,000m 투입 → 24,000m × 4 산출 + 4,000m 폐기). 폐기 길이는 실행 이벤트(`RESIDUAL_DISCARDED`, 사유 `STEP_REMAINDER`)와 계보에 남고 물량 보존 검증은 그대로 맞는다
  (자식 합 + 폐기 = 부모). `carry_same_product`와 달리 잔량을 모아 두지 않으므로 `scope`·`on_product_change`·`on_run_end`·`physical_join_mode`는 쓰지 않는다(기본 `unknown` 그대로).
- 분할(`split_length`) 단계에만 쓸 수 있다(엔진 컴파일 `RESIDUAL_MODE_UNSUPPORTED`). 규칙이 없으면(`unknown`·`none`) 잔량이 생긴 실행은 그대로 실패한다(성공으로 덮지 않는다).
- 근거: 보드 DEC-010, CR be09 §9(P05 절연 4,000m, 사용자 결정 2026-10-27). 03 §6 본문 반영은 조정자.

## 5. 시나리오·실행 API

> 아래 표에서 시나리오 6행(목록~승인)은 §5.1로, 실행 5행(요청·목록·조회·input·cancel)은 §5.2로 **승인**(contract
> 0.7.0·0.9.0)되었다. `rerun`·`events`·`metrics`·`lineage`·비교 행은 PROPOSED이며 CR be08(be08b·be08c)에서 다룬다.

| Method | Path | 의미 |
|---|---|---|
| GET/POST | /projects/{p}/scenarios | 목록/생성 |
| GET/POST | /projects/{p}/scenarios/{id}/versions | 버전 조회/초안 |
| GET/PATCH | /projects/{p}/scenario-versions/{id} | 입력·가정·계획 편집 |
| POST | /projects/{p}/scenario-versions/{id}/validate | 사용 자원·경로 기반 실행 검증 |
| POST | /projects/{p}/scenario-versions/{id}/approve | 가정 포함 승인 |
| POST | /projects/{p}/runs | 202, snapshot+run+job 원자 생성 |
| GET | /projects/{p}/runs | 실행 목록 |
| GET | /projects/{p}/runs/{r} | 상태·attempt·진행·종료사유 |
| GET | /projects/{p}/runs/{r}/input | 당시 입력 snapshot |
| POST | /projects/{p}/runs/{r}/cancel | 취소 요청, 실제 취소와 구분 |
| POST | /projects/{p}/runs/{r}/rerun | 동일 snapshot의 새 run |
| GET | /projects/{p}/runs/{r}/events | event_seq cursor, step/asset/item 필터 |
| GET | /projects/{p}/runs/{r}/metrics | 집계 조회, window·definition 포함 |
| GET | /projects/{p}/runs/{r}/items/{item_key}/lineage | 분할·합류·이월 |
| POST | /projects/{p}/comparisons | 승인된 run pair 비교 |
| GET | /projects/{p}/comparisons/{id} | 조건 차이·비교가능성·지표 |

실행 요청:
```json
{
  "scenario_version_id": "00000000-0000-4000-8000-000000000101",
  "seed": 42,
  "replicate_index": 0,
  "assumption_acknowledgments": ["ASM-TRAVEL-001"]
}
```

실행 응답:
```json
{
  "data": {
    "id": "00000000-0000-4000-8000-000000000201",
    "status": "queued",
    "input_hash": "실제_해시로_대체",
    "links": {"status": "/api/v1/projects/.../runs/..."}
  }
}
```

초기 진행 조회는 polling. 실제 동작 검증 후 SSE를 추가해도 됨.
target-based run은 정확한 진행률을 알 수 없으면 percent=null, 현재 시각·생산량 표시.

### 5.1 승인 scope `scenario-versions` — BE-05a (contract 0.7.0)
근거: `docs/change-requests/CR-backend-20261026-be07-scenario-versions.md`(보드 DEC-007). 필드·타입의 정본은 openapi.json.

| Method | Path | 권한 | 결과 |
|---|---|---|---|
| GET/POST | /projects/{p}/scenarios | viewer / editor | 목록(code 순, 최근 버전 요약 포함) / 생성 → 첫 초안(version 1, 비어 있음, 종료 규칙 drain) 함께 생성. 코드 중복 409 `SCENARIO_CODE_CONFLICT` |
| GET/PATCH | /projects/{p}/scenarios/{id} | viewer / editor | 이름·설명(If-Match = 시나리오 row_version) |
| GET/POST | /projects/{p}/scenarios/{id}/versions | viewer / editor | 버전 목록(최신부터) / 새 초안(본문 선택 `from_version_id`, 생략하면 최근 승인 버전 복사, 없으면 빈 초안). 초안은 시나리오당 하나(409 `SCENARIO_DRAFT_EXISTS`) |
| GET/PATCH | /projects/{p}/scenario-versions/{v} | viewer / editor | 초안 수정(If-Match 필수, 보낸 최상위 필드를 통째로 교체). 승인본은 409 `VERSION_IMMUTABLE` |
| POST | /projects/{p}/scenario-versions/{v}/validate | viewer | 실행 사전검증(저장 안 함, 오류가 있어도 200) |
| POST | /projects/{p}/scenario-versions/{v}/approve | project admin | draft → approved. 사전검증 오류가 있으면 422 `SCENARIO_NOT_RUNNABLE`. 승인 후 내용·제품·자산 고정은 DB가 동결 |

- **내용:** `products[]`(제품 하나 = 실행의 공정 하나, 목록 순서 = 같은 시각 동순위 순서) — `product_id`, `process_version_id`(그 제품의 **승인됐던** 버전: approved 또는 superseded), `priority`, `arrivals[]`(`at_min` decimal ≥ 0, `count` 정수 ≥ 1, `length_m` decimal > 0 또는 null, `weight_kg` decimal > 0 또는 null(**둘 중 하나는 필수**, 0.8.0: 길이 없는 원자재는 무게만 보낸다, 서로 환산하지 않음), `lot`), `assumptions`(`equipment_hold`, `unbounded_buffers`, `manual_transport_minutes{node_key: 분}`, `residual_scope{node_key: machine|product|operation|lot}`). `assets[]`(`asset_id`, `asset_revision_id`: 그 자산의 승인됐던 자산 버전). `stopping_rule`: `{"mode":"drain"}` 또는 `{"mode":"fixed_horizon","horizon_min":"…"}`(`[0,H)`). `assumption_reason`, `notes`.
- **저장 시 참조 오류(422 `VALIDATION_ERROR`):** `SCN-REF-001` 이 프로젝트의 제품이 아니거나 그 제품의 공정 버전이 아님, `SCN-REF-002` 승인되지 않은 공정 버전, `SCN-REF-003` 그 자산의 자산 버전이 아님, `SCN-REF-004` 승인되지 않은 자산 버전. 중복 공정 버전·자산은 422. 그 밖의 미정(도착 없음·가정 사유 없음 등)은 **초안 저장을 막지 않고** 사전검증에서 오류로 보인다.
- **자산 버전 자동 고정:** `products`만 보내고 `assets`를 보내지 않으면, 공정이 참조하는 자산(공간 노드·설비 후보) 가운데 아직 고정되지 않은 것을 그 자산의 **현재 승인 버전**으로 채운다(이미 고정한 것은 그대로, 승인 버전이 없으면 비워 둠). `assets`를 함께 보내면 보낸 그대로다(빈 목록 = 고정 안 함).
- **사전검증 응답:** `runnable`, `error_count`, `warning_count`, `engine_version`, `issues[]`(시나리오 수준: `SCN-PROD-001` 제품 없음, `SCN-ARR-001` 도착 없음, `SCN-ASM-001` 가정을 썼는데 사유 없음 — 오류; `SCN-ASSET-001` 공정이 쓰는 자산에 고정 버전 없음, `SCN-ASSET-002` 쓰지 않는 자산 고정, `SCN-ARR-002` 도착의 단위(길이·무게)가 공정의 원자재 단위와 다름(0.8.0) — 경고), `products[]`(제품마다 엔진 컴파일 결과: `compiled`, `compile_issues[]`, `assumptions_used[]`, `waived[]`). **엔진·도메인 실행 검증 코드(`VAL-*`, `BUFFER_POLICY_UNKNOWN`, `ENGINE_HANDLER_NOT_AVAILABLE` 등)를 번역하지 않고 그대로** 준다. `runnable`은 오류 0이고 모든 제품이 컴파일될 때만 true. 고정하지 않은 자산의 용량·배출 규칙은 모르는 값으로 판정한다(무제한으로 보지 않음).
- 예제: `examples/first-scope/scenario.create`·`scenario-version.patch`·`scenario-version.validate`·`error.scenario-not-runnable`.

### 5.2 승인 scope `runs` — BE-06a (contract 0.9.0)
근거: `docs/change-requests/CR-backend-20261027-be08-run-platform.md`(보드 DEC-008). 필드·타입의 정본은 openapi.json.

| Method | Path | 권한 | 결과 |
|---|---|---|---|
| POST | /projects/{p}/runs | project editor | **202** `queued` run. 스냅샷·run·job을 한 트랜잭션으로 만든다. 같은 `Idempotency-Key`+같은 본문이면 기존 run을 **200**으로 돌려준다 |
| GET | /projects/{p}/runs | viewer | 최신 요청부터(keyset cursor). 필터 `status`·`scenario_version_id`, `limit`·`cursor` |
| GET | /projects/{p}/runs/{r} | viewer | 상태·attempt 목록·종료 사유·결과 요약 |
| GET | /projects/{p}/runs/{r}/input | viewer | 실행 당시 입력 스냅샷(`snapshot`)과 `sha256`, 저장본을 다시 해시한 `hash_verified` |
| POST | /projects/{p}/runs/{r}/cancel | project editor | **202**. 대기 중이면 즉시 `cancelled`, 실행 중이면 `cancel_requested_at`만 기록(요청 ≠ 실제 취소) |

- **요청 본문(닫힌 객체):** `scenario_version_id`(필수, **승인된** 시나리오 버전), `seed`(정수 0~2³¹−1, 기본 0), `replicate_index`(같은 범위, 기본 0). 승인되지 않은 버전은 422 `RUN_NOT_RUNNABLE`(`RUN-SCN-001`)이다. 다른 프로젝트의 버전은 404. 이전 설계안의 `assumption_acknowledgments`는 받지 않는다(가정은 시나리오 승인에 포함됨).
- **`Idempotency-Key` 헤더 필수**(1~128자): 없으면 428 `PRECONDITION_REQUIRED`, 길이 위반은 422. 같은 키로 본문이 다르면 409 `IDEMPOTENCY_CONFLICT`. 키는 (프로젝트, 요청자) 안에서 유일하다.
- **입력 스냅샷은 불변:** 정규화 JSON(키 정렬·공백 없음·UTF-8)의 SHA-256이 `input_hash`이며, DB 트리거가 스냅샷의 수정·삭제를 막는다. 스냅샷은 시나리오 버전·제품별 공정 그래프·도착·가정·고정한 자산 버전·시드·엔진 버전·이벤트 한도를 담아, 이후 원본이 바뀌어도 같은 입력을 다시 보여 준다.
- **상태:** `queued`, `running`, 엔진 종료 상태(`completed`·`stalled`·`horizon_reached`·`failed`·`limit_reached`), `cancelled`. 종료 상태는 다시 바뀌지 않는다. `stalled`는 실행 실패가 아니라 **더 진행할 수 없는 상태**이며 결과에 부족한 입력(`shortfalls`)이 들어간다. 종료 사유 예: `CANCELLED_BEFORE_START`, `CANCELLED`, `WALL_TIMEOUT`, `ENGINE_ERROR`, `WORKER_LOST`, `SNAPSHOT_HASH_MISMATCH`, `COMPILE_FAILED`.
- **결과 요약(`result`):** 종료 시 한 번 기록되는 작은 요약 — `state`·`reason`·`censored`·`end_time{min,exact}`·`horizon`·`event_count`·`engine_version`·`seed`·`products[]`(완제품 수·길이·최초/최종 완료 시각·폐기 길이)·`assumptions`·`shortfalls`·`residuals`·`wip_items`·`failure`·`compile_issues`. 시각은 가상 시간(분)이며 표시용 소수 6자리 `min`과 정확한 분수 `exact`를 함께 준다. 이벤트·지표·계보는 be08b·be08c에서 조회 API가 생긴다.
- **취소 의미:** 대기 중 취소는 즉시 `cancelled`/`CANCELLED_BEFORE_START`. 실행 중 취소는 요청 시각만 남기고 worker가 다음 heartbeat에서 자식 프로세스를 멈춘 뒤 `cancelled`가 된다. 이미 끝난 run은 409 `JOB_CANCEL_TOO_LATE`.
- **worker(참고):** API와 별도 프로세스가 DB 큐(`FOR UPDATE SKIP LOCKED`)에서 job을 가져가 엔진을 자식 프로세스로 실행한다. 임대·heartbeat·fencing 토큰으로 죽은 worker를 대체하고, worker가 사라진 경우만 최대 3회 재시도한다(엔진 오류·시간 초과는 재시도하지 않음). FE는 polling으로 상태를 본다.
- **권한:** 조회 viewer, 요청·취소 editor 이상. organization·project 범위는 서버가 검증하며 다른 프로젝트의 run은 404다.
- 예제: `examples/first-scope/error.run-not-runnable`(초안 버전). 성공 응답은 승인 시나리오가 필요해 시험(`tests/integration/test_api_runs.py`)이 정본이다.

## 6. LLM·위키 API

| Method | Path | 의미 |
|---|---|---|
| GET | /projects/{p}/wiki | 승인 정보 기본, 권한 있는 초안 토글 |
| GET | /projects/{p}/wiki/{id} | 근거/버전 표시 |
| POST | /projects/{p}/questions | 질문, run/version 선택, 읽기전용 답변 |
| GET | /projects/{p}/conversations/{id} | 프로젝트에 고정된 대화 |
| POST | /projects/{p}/questions/{id}/feedback | 근거성 평가 |

정형 값은 API 계산/조회 결과로 답하고, 모든 수치에 source_ref 연결.
외부 모델 장애 시 실패 메시지와 일반 화면 대체 조회 제공.
확정하지 않은 분석은 fact/hypothesis로 구분.

## 7. CAD·배치 API — 후속

artifact upload init/complete → import job → candidates → mapping approval → layout draft.
`/layouts`, `/layout-versions/{id}`, `/ports`, `/network`, `/validate`, `/approve`.
직접 DWG 지원은 초기 약속 아님. DXF 또는 추출 ZIP 기준, 미지원 형상 보고.
물리 network를 route editor의 임의 노드 좌표로 덮어쓰지 않음.

## 8. API 테스트 계약

- OpenAPI snapshot diff, 변경 시 generated client 갱신.
- 허용되지 않은 enum/NaN/Infinity/음수/모호한 단위 422.
- 다른 프로젝트 UUID로 요청하면 조회/변경 모두 거부.
- 버전 충돌과 승인 직후 PATCH 거부.
- Idempotency-Key 동시 요청은 같은 run 하나 생성.
- 승인 직후 위키 인덱스가 늦더라도 SQL 도구는 올바른 버전 반환.
- 취소/실패 실행 결과를 성공으로 노출하지 않음.


---
기술 참조 [Sxx]의 공식 주소와 확인 범위: [99_sources.md](../docs/reference/99_sources.md).
