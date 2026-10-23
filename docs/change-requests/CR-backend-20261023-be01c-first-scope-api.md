# CR-backend-20261023-be01c-first-scope-api
- 요청자: Backend / 작업 BE-01c / 대상: contracts/04_api_contract.md §3 (첫 scope `project-assets-ports`)
- 상태: **제안(미승인)**. 승인 전에는 이 DTO로 BE/FE를 확정 구현하지 않는다.
- 근거: 04 §3은 자산 생성을 "kind별 subtype·포트 원자 생성"으로만 정의하고 필드가 없음.
  FE-00b 인계(HANDOFF-frontend-2026-10-23-FE-00b)가 자산 DTO, cursor 응답, 412↔EDIT_CONFLICT 확정을 요청함.
  DB는 migration 0001(main 반영)에 맞춘다.

## 1. 범위
포함: `GET /me`, `GET/POST /projects`, `GET/PATCH /projects/{p}`, `GET/POST /projects/{p}/assets`,
`GET/PATCH /projects/{p}/assets/{id}`, `GET /projects/{p}/assets/{id}/ports`.
제외(후속 묶음): project archive/clone/members API, asset archive, revision·승인·**용량**·그룹·별칭·port_policy.
따라서 FE `AssetView`의 `capacity`, `group`, `status(VersionStatus)`는 이 scope의 API에 없다(revision 도입 후 제공).

## 2. 공통 (04 §1·§2 해석 확정 요청)
- 단건 `{"data": {...}}`, 목록 `{"data": [...], "page": {"limit": 50, "next_cursor": "opaque|null"}}`.
- 목록 쿼리: `limit`(기본 50, 최대 200), `cursor`(서버가 발급한 불투명 문자열, 변조 시 422 `INVALID_CURSOR`),
  `sort`(자산: `sort_order|code|name`, `-` 접두 내림차순, 기본 `sort_order,code`), `q`(code/name 부분 일치),
  `kind`, `include_archived`(기본 false).
- ETag/If-Match: 수정 가능 리소스는 `row_version`을 ETag(`"17"`)로 반환. PATCH는 If-Match 필수.
  누락 428 `PRECONDITION_REQUIRED`, 불일치 412 `EDIT_CONFLICT`(이 매핑 확정 요청). 응답 body에도 `row_version` 포함.
- 오류 코드 추가 요청: `NOT_FOUND`(404), `VALIDATION_ERROR`(422), `INVALID_CURSOR`(422),
  `PROJECT_CODE_CONFLICT`(409), `ASSET_CODE_CONFLICT`(409), `FORBIDDEN`(403, 프로젝트 존재를 이미 아는 경우의 역할 부족).
- 프로젝트 미존재/비멤버는 동일하게 404 `NOT_FOUND`(04 §1 제안 채택 요청). 자산 id가 다른 프로젝트 것이어도 404.
- 알려지지 않은 필드는 422. 빈 문자열은 null이 아니며 code/name은 공백 제거 후 비어 있으면 422.

## 3. DTO
**Project** `{id, organization_id, code, name, timezone, description|null, status, created_at, updated_at|null, row_version}`
- 생성 `POST /projects` `{organization_id, code, name, timezone, description?}` → 201 + ETag. 조직 admin만. 생성자는 project admin으로 자동 등록.
- PATCH 가능: `name, description, timezone`. `code`, `organization_id`, `status`는 변경 불가(archive는 후속).
- 목록: 호출자가 멤버인 프로젝트만.

**Asset** `{id, project_id, kind, code, name, sort_order, external_ref|null, notes|null, archived_at|null,
  equipment|null, space|null, ports[], created_at, updated_at|null, row_version}`
- `equipment`: `{equipment_type, model_name|null}`(kind=equipment일 때만), `space`: `{space_type}`(storage/dock일 때만).
- `ports[]`: `{id, port_key, role: IN|OUT|ACCESS, label}`. 목록에도 포함(자산당 2~수 개).
- 생성 `POST /projects/{p}/assets`: `{kind, code, name, sort_order?=0, external_ref?, notes?, equipment|space}`.
  kind별 필수 객체가 없거나 반대 객체가 있으면 422. **포트는 요청에 없다.** 서버가 같은 트랜잭션에서 생성:
  equipment → `IN`/`OUT`(label 동일), storage/dock → `ACCESS-01`. 201 + ETag + Asset.
  동일 project의 code 중복 409 `ASSET_CODE_CONFLICT`.
- PATCH(If-Match 필수) 가능: `code, name, sort_order, external_ref, notes, equipment.equipment_type/model_name, space.space_type`.
  `kind` 변경 시도는 422(subtype 변경은 PATCH 불가, ERD §14). 포트 추가/삭제 API 없음.
- 미정 표현: `external_ref`, `notes`, `model_name`의 null은 "입력 없음". 이 scope에는 숫자 필드가 없어 field_meta/unknown 모드는 불필요.

**Port** `GET /assets/{id}/ports` → `{"data": [Port...]}`. 위치(placement)는 layout 단계라 이 scope에 없음
(FE의 placement "unknown"은 API 값이 아니라 FE 기본 표시).

**Me** `{user: {id, display_name}, organizations: [{id, code, name, role}], projects: [{id, organization_id, code, name, role}]}`

## 4. 인증/권한 (잠정)
- `AUTH_MODE=local`에서만 `X-Debug-User: <app_user.id>` 헤더로 주체를 지정(개발/테스트 전용, `APP_ENV=production`이면 기동 거부).
- 운영 인증 adapter(TECH-002)는 미결. local 모드는 계약이 아니며 OpenAPI에 노출하지 않는다.
- 역할 권한(잠정): 조직 admin=프로젝트 생성, project admin/editor=자산 생성·수정, viewer=조회만. TECH-006 결정 시 조정.

## 4-1. 구현 중 확정한 세부 사항 (승인 범위 내 해석, 계약 반영 시 확인 요청)
- 사용자: 2026-10-23 "CR 전부 승인". 아래는 승인된 CR을 구현하며 CR에 명시되지 않아 Backend가 정한 값이다.
- 추가 오류 코드: `UNAUTHENTICATED`(401, 헤더 누락·미등록·비활성 사용자·local 모드 꺼짐), `INTERNAL_ERROR`(500, 상세 비노출).
- `sort`는 단일 필드(`sort_order|code|name`, `-` 접두)만 지원. 동률은 `code`, `id`로 안정 정렬(기본 `sort_order` → `code` → `id`).
  프로젝트 목록은 `code` 오름차순 고정(`sort` 파라미터 없음).
- cursor는 정렬·필터·프로젝트가 바뀌면 재사용 불가(422 `INVALID_CURSOR`). 서명은 하지 않는다(값에 비밀 없음, 범위 검증은 매 요청 서버가 수행).
- 프로젝트 PATCH는 project admin만 허용(CR은 자산 수정만 admin/editor로 명시). 자산 PATCH/POST는 admin·editor.
- 선택 필드 `external_ref`, `notes`, `description`, `model_name`: 빈 문자열은 422(null과 구분), null은 "입력 없음"/지우기.
- PATCH 본문에서 null 허용: `external_ref`, `notes`, `description`, `model_name`. 나머지 null은 422. 빈 본문·빈 중첩 객체도 422.
- 자산 `sort_order`는 0 이상 정수(DB `integer` 상한).
- If-Match 형식: `"17"`, `W/"17"`, `17` 허용. `*`·비숫자는 422, 누락은 428.
- 감사 로그(`audit_log`)에 `project.create/update`, `asset.create/update`를 같은 트랜잭션으로 기록(변경된 업무 필드만).
- 동기 SQLAlchemy Session + `def` 엔드포인트(스레드풀)로 구현. 기술서 05는 AsyncSession을 제안했으나 Windows에서
  psycopg async와 기본 이벤트 루프가 맞지 않아 동기를 채택. ADR 후보이며 조정자 판단 요청.
- 이 CR은 contracts/04에 아직 반영되지 않았다(Backend는 contracts/** 수정 권한 없음). 반영은 조정자.

## 5. 승인 요청 항목
1. §2 응답 래퍼·cursor·오류 코드 추가·404 정책, 412=EDIT_CONFLICT
2. §3 Project/Asset/Port DTO와 포트 자동 생성 규칙(포트 key `IN`/`OUT`/`ACCESS-01`, label 기본값)
3. §4 권한 매트릭스(잠정)
4. 위 승인 후 contracts/04에 반영하고 `contract-status.json`에 scope 승인 기록(조정자).
