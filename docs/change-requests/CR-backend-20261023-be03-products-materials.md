# CR-backend-20261023-be03-products-materials
- 요청자: Backend / 작업 BE-03(제안) / 대상: contracts/04 §3(products·materials 행), ERD §5(product, material_definition)
- 상태: **제안(미승인)**. 승인 전 구현하지 않는다. 승인 시 새 scope `products-materials`로 contract 0.3.0 승격.
- 근거: FE에 제품 목록·상세 정적 화면이 있고(R-FE-07) 공정 버전·그래프의 선행 데이터다. 우선순위는 FE 답변(BE-REQ-010)으로 조정할 수 있다.
  입력 대기: BE-REQ-011(FE 화면 모델·단위), R-FE-07.

## 1. 범위
포함: `product`, `material_definition` 테이블(migration 0003)과 CRUD(조회·생성·수정). 자산과 같은 규약(응답 래퍼, cursor, ETag/If-Match, 404 정책, 역할).
제외(별도 CR): 공정 버전·그래프·단계·자원 요구(`process_version` 등), 보관(archive) endpoint, 제품 복사, 그룹·별칭.
`product`와 `material_definition`은 **버전이 없는 기준정보**다(제품의 공정 정의가 버전을 가진다). 따라서 자산 기본 정보처럼 항상 수정할 수 있다.
도메인 예제값(제품 P01~P06 등)은 시드·엔진에 하드코딩하지 않는다.

## 2. 데이터 모델 (ERD §5 해석, migration 0003)
- `product(id, project_id, code, name, specification, notes, archived_at, created/updated…, row_version)`
  - `UNIQUE(project_id, code)`, `UNIQUE(project_id, id)`, FK `project_id → project`. `code`는 표시 코드(내부 id는 UUID, ADR-003).
- `material_definition(id, project_id, code, name, form, default_spec jsonb, notes, archived_at, created/updated…, row_version)`
  - `UNIQUE(project_id, code)`, `UNIQUE(project_id, id)`. 공정 단계와 독립된 원자재·반제품 식별(ERD §5).
- 이후 `process_version`이 `(project_id, product_id)`·`(project_id, material_definition_id)` 복합 FK로 참조한다(이 CR에서는 FK를 만들지 않음, ERD §16 "존재하지 않는 테이블을 참조하는 migration 금지").
- 같은 코드의 제품·재료를 프로젝트 2개에 등록할 수 있고 한 프로젝트 안에서는 중복 불가(ERD §13 게이트). 타 프로젝트 id는 404.

## 3. API (제안, 자산과 동일 규약)
| Method | Path | 설명 |
|---|---|---|
| GET/POST | /projects/{p}/products | 목록(`q`, `include_archived`, `sort=code\|name`, `limit`, `cursor`) / 생성(admin·editor) |
| GET/PATCH | /projects/{p}/products/{id} | 조회 / 수정(If-Match) — `code`, `name`, `specification`, `notes` |
| GET/POST | /projects/{p}/materials | 〃 |
| GET/PATCH | /projects/{p}/materials/{id} | 〃 — `code`, `name`, `form`, `default_spec`, `notes` |
- 오류 코드 추가: `PRODUCT_CODE_CONFLICT`, `MATERIAL_CODE_CONFLICT`(409).
- 빈 문자열은 null이 아니며(422), 선택 필드의 `null`은 "입력 없음"으로 PATCH에서 지울 수 있다. 감사 로그 기록(`product.create/update`, `material.create/update`).

## 4. 결정이 필요한 항목 (FE 의견 포함)
1. **`product.specification` 형식**: (제안) 자유 텍스트 nullable(최대 4000자). 구조화가 필요하면 FE 화면 모델(BE-REQ-011)을 받아 후속 CR로 확장. FE 의견?
2. **`material_definition.form` 허용값**: 도메인 문서에 원자재 롤·보빈·파렛트 등이 나오지만 **확정된 목록이 없다**. (제안 A) 자유 텍스트 / (제안 B) enum(`roll|bobbin|pallet|…`)이며 값 목록은 사용자 확정이 필요. 기본 제안은 A(나중에 enum으로 좁히는 것은 호환 변경이 아님에 유의).
3. **`default_spec` 구조와 미정 표현**: 길이(m)·중량(kg)·단위 수·가닥 수를 **섞지 않는다**(도메인 원칙). 미정/해당 없음/값을 구분해야 하므로
   - (제안 A, 권장) 필드별 판별 객체 `{"mode":"unknown|known|not_applicable","value":"2000.000000"|null}`(용량의 `mode` 방식과 일치, FE `KnownValue`와 대응) 
     — 필드: `length_m`, `weight_kg`(decimal 문자열), `unit_count`, `strand_count`(정수), 알 수 없는 필드는 거부.
   - (제안 B) nullable 필드 + `field_meta`(JSON Pointer별 status) — 03 §2 원안, 구현 복잡.
   기본값은 모든 필드 `unknown`(0이 아님).
4. **권한**: 자산과 동일(project admin·editor 생성·수정, viewer 조회). 기준정보 변경은 이후 공정 승인에 영향을 주므로 admin 전용으로 제한할지 여부.
5. **보관**: 이 CR에서는 archive endpoint 없이 `archived_at`·`include_archived`만 둔다(자산과 동일). 참조된 기준정보의 hard delete는 계속 금지(DELETE endpoint 없음).

## 4-1. FE 의견 반영 (2026-10-23, `request-from-frontend.md` BE-REQ-010·011)
- §4-1 `specification`: FE **동의**(자유 텍스트 nullable, `null`=미정, 빈 문자열 422).
- §4-2 `form`: FE 의견 없음(재료 화면 없음) → **자유 텍스트(제안 A)** 로 진행. 재료 화면 설계 시 FE가 enum 필요 여부를 다시 알린다(좁히는 변경은 비호환이므로 그때 별도 CR).
- §4-3 `default_spec`: FE **동의**(제안 A, 필드별 판별 객체). FE가 `known`↔`value` 변환을 맡는다. 용량의 `finite`와 이름이 다른 점은 FE도 아쉬워하지만 변경은 요청하지 않음 — 일관성을 위해 Backend는 `known`을 유지하고, 공정 CR에서 값 객체 이름을 한 번에 정리할지 재검토한다.
- §4-4 권한: FE **동의**(자산과 동일, admin·editor).
- §4-5 보관: FE **동의**.
- FE 순위: 1) `/me` 보강(아래) → 2) 제품·재료(이 CR) → 3) 공정 버전·그래프. FE-01a~d는 0.2.0만으로 가능.
- **제품 목록의 `latest_process_version` 요약(FE 요청)**: `process_version` 테이블이 아직 없어 이 CR에서는 제공하지 않는다. 공정 버전 CR에서 **추가 필드**(자산의 `latest_revision`과 같은 방식, 비파괴)로 도입한다. 그 전 제품 목록은 요약 없이 나가며 FE는 "공정 없음" 표시를 API 값으로 만들지 않는다.

## 4-2. 소규모 계약 보강 (같은 contract 0.3.0): `GET /me`의 프로젝트에 `status`
- 근거: R-FE-03 후속(FE 찬성, FE 순위 1). 보관(archive)된 프로젝트를 전환 메뉴에서 구분·제외해야 한다.
- 변경: `Me.projects[]`에 `status: "active"|"archived"` 추가(`GET /projects`의 `Project.status`와 같은 값). **비파괴(필드 추가)**. 현재는 archive 기능이 없어 모두 `active`다.
- 정책 제안: `/me.projects`는 보관된 프로젝트도 `status`와 함께 돌려주고 제외 여부는 FE가 정한다(archive 설계 때 `include_archived` 쿼리를 추가할지 재검토).

## 5. 구현 계획(승인 후)
1. migration 0003, 모델, DB 통합 테스트(프로젝트 격리·코드 중복 정책·복합 FK·타 프로젝트 거부).
2. 서비스/API/스키마 + 동시 수정·ETag·권한 테스트(자산 테스트 패턴 재사용).
3. OpenAPI 후보 → contract 0.3.0 승격(스냅샷·해시·CHANGELOG·예제), FE 안내 갱신, 인계 문서.
4. `/me` 보강(§4-2)은 작아서 첫 커밋으로 먼저 구현·승격해도 되며(0.2.1), 승인 때 분리 여부를 정한다(기본: 한 번에 0.3.0).
