# CR-backend-20261023-be02-asset-revision-capacity
- 요청자: Backend / 작업 BE-02(제안) / 대상: contracts/04 §3, contracts/03 §2·§3, ERD §4(asset_revision, port_policy)
- 상태: **제안(미승인)**. 승인 전 구현하지 않는다. 승인 시 새 scope `asset-revisions`로 contract 0.2.0 승격.
- 근거: ERD §16 "두 번째 묶음", FE-00b 인계가 요구한 용량(미정/값/무제한/대기 불가)·버전 상태 DTO,
  contract 0.1.0은 의도적으로 용량·상태를 제외함(contracts/04 §3.1).

## 1. 범위
포함: `asset_revision`, `port_policy` 테이블(migration 0002)과 API — 자산별 revision 목록·초안 생성, revision 조회·초안 수정, 제출·반려·승인, 승인본에서 새 초안 복제.
제외(별도 CR): group/alias, 장비 가동 달력·처리 능력(properties의 나머지), 공정(process)에서의 revision 참조, scenario_asset 핀, CAD 배치.

## 2. 데이터 모델 (ERD §4 해석, migration 0002)
- `asset_revision(id, project_id, asset_id, revision_no, status, schema_version, storage_capacity jsonb, notes, field_meta jsonb, row_version, created/updated…, submitted_at/by, approved_at/by)`
  - `UNIQUE(asset_id, revision_no)`, `UNIQUE(project_id, asset_id, id)`, FK `(project_id, asset_id) → asset`.
  - `status`: `draft | in_review | approved | superseded` (03 §2; 반려는 `in_review → draft`).
  - **제안:** ERD의 범용 `properties jsonb` 대신 이번 scope에 필요한 컬럼(`storage_capacity`)만 둔다.
    속성이 늘면 새 migration으로 컬럼/스키마를 추가(JSONB에 숨기지 않음, 03 §1 "알려지지 않은 필드 거부").
  - `storage_capacity`는 공간(storage/dock) revision에서만 의미가 있다(설비는 NULL 고정, CHECK는 서비스+트리거).
- `port_policy(id, project_id, asset_id, asset_revision_id, port_id, buffer_capacity jsonb, dispatch_rule jsonb, release_rule jsonb, …)`
  - 복합 FK: `(project_id, asset_id, asset_revision_id) → asset_revision`, `(project_id, asset_id, port_id) → asset_port` (다른 자산의 포트 불가, ERD §9).
  - `UNIQUE(asset_revision_id, port_id)`. revision 생성 시 자산의 모든 포트에 대한 행을 같은 트랜잭션에서 만든다.
- 용량 JSON(03 §3): `{"mode": "unknown|finite|unlimited|not_allowed", "value": "4"|null, "unit": "item"|null, "status": "confirmed|unknown|assumed|not_applicable"}`
  - 새 revision의 모든 용량·정책 기본값은 `mode=unknown`(0·무제한으로 기본 채우지 않음). `finite`는 value>0, unit=item이면 정수 문자열.
  - 지원 unit은 `item`만 등록·실행 허용, 그 외 unit(`bobbin_slot|pallet_slot|kg|m2`)은 등록 가능하나 `supported_by_engine=false` 경고 표시(03 §3 "초기 엔진은 item만").
  - `dispatch_rule`/`release_rule`은 03 §7의 enum 필드를 `unknown` 기본으로 저장(discriminator `mode`, schema_version).
- **불변성(ERD §14):** `approved` revision과 그 `port_policy` 자식 행의 UPDATE/DELETE는 DB 트리거로 거부(부모 상태만 API에서 검사하지 않음). `superseded` 전환만 허용.
- 승인 정보(`approved_by/at`)는 서버가 인증 주체와 서버 시각으로만 기록한다(클라이언트 값 무시).

## 3. API (제안)
| Method | Path | 설명 |
|---|---|---|
| GET/POST | /projects/{p}/assets/{id}/revisions | 목록 / 초안 생성(최신 approved가 있으면 그 값을 복사, 없으면 모두 unknown). draft가 이미 있으면 409 `REVISION_DRAFT_EXISTS` |
| GET/PATCH | /projects/{p}/asset-revisions/{id} | 조회 / 초안 수정(`storage_capacity`, `ports[]{port_id, buffer_capacity, dispatch_rule, release_rule}`, `notes`, `field_meta`). If-Match, approved면 409 `VERSION_IMMUTABLE` |
| POST | .../asset-revisions/{id}/submit | draft → in_review |
| POST | .../asset-revisions/{id}/reject | in_review → draft, 사유 필수 |
| POST | .../asset-revisions/{id}/approve | in_review → approved. 직전 approved는 `superseded`. 검토 권한 필요 |
- `Asset` 응답에 `current_revision`(최신 approved의 id·revision_no, 없으면 null)과 `latest_revision_status`를 **추가 필드**로 제공(0.1.0 클라이언트는 추가 필드 무시 가능한 비파괴 변경).
- 승인 가능 조건: 구조 오류(V0~V3) 없음. `unknown` 용량은 경고로 허용(ADR-017 "지식 승인과 실행 가능 검증 분리"). 실행 가능성은 시나리오에서 검증.
- 오류 코드 추가: `VERSION_IMMUTABLE`(409, 계약 04 기존 코드 사용), `REVISION_DRAFT_EXISTS`(409), `INVALID_STATE_TRANSITION`(409), `INVALID_UNIT`(422, 기존).

## 4. 결정이 필요한 항목
1. **권한:** 승인/반려 가능 역할. 제안: project admin만(editor는 초안·제출). TECH-006 미결이라 잠정.
2. **승인자 이중 확인:** 제출자와 승인자가 같은 사용자일 때 허용 여부(제안: 허용하되 audit에 기록. 소규모 팀 가정).
3. **properties 일반 JSONB를 두지 않는 것** 동의 여부(§2 제안).
4. **in_review 편집 정책:** 제안은 편집 불가(draft로 반려 후 수정). FE-00b가 같은 가정을 사용.
5. **`superseded` 자동 전환** 허용 여부.
6. **FE 영향:** 0.2.0 승인 후 `AssetView`의 capacity/status를 API 값으로 대체. 기존 0.1.0 endpoint 응답은 추가 필드만 늘어남.

## 5. 구현 계획(승인 후)
1. migration 0002 + 불변 트리거 + 모델, DB 통합 테스트(복합 FK·불변·타 자산 포트 거부·unknown 기본값 보존).
2. 서비스/API/스키마, 상태 전이·동시성(승인 직전 PATCH 경쟁) 테스트.
3. OpenAPI 후보 → contract 0.2.0 승격(스냅샷·해시 갱신, 예제 추가), 인계 문서.
- 이어서 RLS + 앱/migration DB 계정 분리 제안은 별도 CR.
