# Frontend → Backend 요청·확인 목록

작성: Frontend 세션 / 최초 작성 2026-10-23 / 기준: origin/main `be5f6dd`(backend BE-01c 병합 포함)

## 사용 방법
- 이 파일은 Frontend가 Backend에게 묻고 요청하는 곳이다. 반대 방향은 `request-from-backend.md`.
- 각 항목의 `Backend 답변:` 줄 아래에 답을 적는다(날짜 포함). 길면 CR·인계 문서 경로를 적는다.
- Backend가 답변하면 `[ ]` → `[~]`(답변됨, FE 확인 대기)로 바꾼다. FE가 확인하고 코드·문서에 반영하면 `[x]`로 바꾸고 `FE 확인:` 줄에 반영 내용을 적는다.
- 우선순위: **P1** FE-01(실제 연동) 착수를 막는 항목 / **P2** 화면 정확도·UX에 영향 / **P3** 후속 참고.
- 계약(contracts/**)은 조정자 소유다. 계약 변경이 필요한 답변은 CR 번호로 연결한다.
- 이 파일에 비밀값·토큰·실제 사용자 ID를 적지 않는다.

## FE가 현재 사실로 삼고 있는 것 (틀리면 알려 주세요)
- 승인 CR `CR-backend-20261023-be01c-first-scope-api`의 11개 endpoint(`/api/v1`): health, me, projects(GET·POST·GET{p}·PATCH{p}), assets(GET·POST·GET{id}·PATCH{id}), assets/{id}/ports.
- 목록 응답은 `{"data":[...],"page":{"limit":n,"next_cursor":s|null}}`, 단건은 `{"data":{...}}`, 오류는 `{"error":{code,message,request_id,details[]}}`.
- 수정은 `ETag`/`If-Match`(정수 row_version), 누락 428, 불일치 412(`EDIT_CONFLICT`). 비멤버와 미존재는 동일 404.
- 자산 응답(`AssetOut`)에는 `capacity`, `group`, 버전 상태(`status`), 포트 위치가 없다(CR §11~12에 명시됨).
- 현재 FE 화면은 모두 정적 예시 데이터이며 실제 API를 호출하지 않는다. 계약 승인(contract-status)이 `PENDING_REVIEW`라 generated client도 만들지 않았다.

---

## P1 — 연동 착수를 막는 항목

- [ ] **R-FE-01 OpenAPI 후보 전달과 계약 승인 일정**
  - 배경: `backend/artifacts/openapi.candidate.json`은 Git 제외라 FE worktree에서 받을 수 없다(BE-01c 인계: sha256 `6bbad0dd…b66e`). `contracts/openapi.json`과 `contract-status.json`은 아직 PENDING_REVIEW.
  - 요청: (1) 후보 파일을 FE가 받을 방법(PR 첨부, 허용된 공유 경로, 또는 조정자의 `contracts/openapi.json` 승격 일정). (2) 후보를 다시 생성했다면 최신 sha256. (3) FE는 승인 스냅샷의 hash를 기준으로 client를 생성하고 그 hash를 인계 문서에 기록한다.
  - FE 임시 가정: 승인 전에는 client 생성·Mock 구현을 시작하지 않는다.
  - Backend 답변:
  - FE 확인:

- [ ] **R-FE-02 로컬 개발 연결: 인증 헤더, CORS, 시드 데이터**
  - 배경: 인증은 `AUTH_MODE=local`의 `X-Debug-User: <app_user.id>`뿐이고, `cors_allowed_origins` 기본값이 빈 문자열이다. 개발 DB에는 0001 migration이 적용되지 않았다고 되어 있다.
  - 요청: (1) FE 개발 서버(Vite)가 호출하는 권장 방식: Vite proxy(`/api` → `localhost:8000`)인지, CORS 허용 origin 설정인지. (2) 로컬에서 쓸 수 있는 시드(조직·사용자·프로젝트·멤버)를 만드는 스크립트 또는 절차와 그 사용자 ID를 FE가 `.env`(개발 전용)에 넣는 방법. (3) CORS를 쓴다면 응답 헤더 `ETag`, `X-Request-ID`, `Location`이 `Access-Control-Expose-Headers`에 포함되는지.
  - FE 임시 가정: 개발 전용 환경변수로만 디버그 사용자 ID를 넣고, 운영 빌드에는 포함하지 않는다. 헤더 이름을 코드에 하드코딩하지 않고 개발 어댑터 한 곳에 둔다.
  - Backend 답변:
  - FE 확인:

- [ ] **R-FE-03 프로젝트 전환 UI의 데이터 출처와 역할 값**
  - 배경: FE 프로젝트 전환 메뉴는 현재 예시 3개 프로젝트다. `GET /me`는 `projects[{id, organization_id, code, name, role}]`를, `GET /projects`는 페이지 목록을 준다.
  - 요청: (1) 전환 메뉴는 `/me`의 `projects`를 기준으로 해도 되는지, 항목 수 상한이 있는지. (2) `role` 문자열의 전체 목록과 의미(예: admin/editor/viewer/reviewer?). FE는 버튼 숨김·읽기 전용 표시에만 쓰고 서버 판정을 대체하지 않는다. (3) 보관(archived)된 프로젝트가 목록에 나오는지(`status` 값 목록 포함).
  - FE 임시 가정: 메뉴는 `/me.projects`, 역할은 표시용.
  - Backend 답변:
  - FE 확인:

- [ ] **R-FE-04 오류 코드·`field_path` 규칙 확정**
  - 배경: 오류 envelope은 04 계약 §2와 같다. 구현에서 `EDIT_CONFLICT`는 HTTP 412이고 details에 `field_path: "/row_version"`이 들어간다. FE는 이 코드로 충돌 안내(재조회/내 변경 유지)를 띄운다.
  - 요청: 구현된 모든 `error.code`와 HTTP 상태의 표(예: 401, 403, 404, 409 프로젝트·자산 코드 중복, 412, 422, 428의 정확한 code 문자열). 422 본문 검증 오류의 `field_path`가 요청 본문 기준 JSON pointer(`/name`, `/equipment/equipment_type`)인지, 쿼리·헤더 오류는 어떻게 표시되는지. 비멤버/미존재 404의 `code` 값.
  - FE 임시 가정: `field_path`는 요청 본문 기준 JSON pointer이며 폼 필드에 매핑한다. 모르는 code는 일반 오류로 표시하고 `request_id`를 보여 준다.
  - Backend 답변:
  - FE 확인:

## P2 — 화면 정확도에 영향을 주는 항목

- [ ] **R-FE-05 용량·그룹·버전 상태·포트 위치의 제공 일정과 DTO 초안**
  - 배경: 현재 FE 자산 화면에는 대기 용량(미정/값+단위/무제한/대기 불가), 버전 상태 배지(초안/검토 중/승인/보관), 그룹, 포트 위치(미정/배치됨)가 있다. 이 값들은 `AssetOut`에 없다(CR §11~12: revision 도입 후 제공).
  - 요청: asset_revision / port_policy / group 묶음의 DTO 초안과 일정. 특히 (1) 용량 객체 모양(03 §3의 `mode/value/unit/status` 그대로인지, `value`는 decimal 문자열인지, `unit` 코드 값), (2) 버전 상태 필드 위치(자산 vs 리비전)와 승인 후 수정 정책의 HTTP 응답(`VERSION_IMMUTABLE`), (3) 포트 위치/배치 상태가 이 묶음에 들어가는지 layout 묶음인지, (4) `field_meta`(unknown/confirmed/assumed 사유) 표현 위치.
  - FE 임시 가정: 첫 연동(FE-01)에서는 용량·그룹·상태·포트 위치 UI를 "계약 필요"로 표시하고 `AssetOut`의 필드만 편집한다. 이 값들을 API 응답에 있는 것처럼 보여 주지 않는다.
  - Backend 답변:
  - FE 확인:

- [ ] **R-FE-06 자산 화면의 필드 대응: 유형·모델·그룹·정렬**
  - 배경: `AssetOut`은 `kind`, `equipment.equipment_type`, `equipment.model_name`, `space.space_type`, `sort_order`, `external_ref`, `notes`, `archived_at`를 준다. FE 화면은 "유형(설비/저장공간/도킹)", "모델", "그룹"을 보여 준다.
  - 요청: (1) `equipment_type`/`space_type`가 자유 문자열인지 허용값 목록이 있는지(자유 문자열이면 FE는 입력 필드, 목록이 있으면 선택 상자). (2) 도킹(`dock`)과 저장공간(`storage`)의 `space_type` 의미 차이. (3) 목록 정렬에 허용된 값(`sort_order | code | name`, `-` 접두)이 최종인지, 다중 정렬 계획.
  - FE 임시 가정: `equipment_type`/`space_type`은 자유 문자열 입력, 정렬은 코드·이름·sort_order만.
  - Backend 답변:
  - FE 확인:

- [ ] **R-FE-07 제품·공정 버전 API 일정과 단계 DTO**
  - 배경: FE는 제품 목록·상세(code, name, specification, 공정 버전 목록)와 공정 표 편집 초안 UI(처리 시간·준비·산출·다음 위치)를 정적으로 만들었다. 이 범위의 API는 CR 제외 범위다.
  - 요청: (1) products / process-versions endpoint의 구현 순서와 일정. (2) `specification` 형식(자유 문자열인지 구조화인지, 미정 표현은 `null`인지 `field_meta`인지). (3) 단계(step) 편집의 저장 단위: 표 편집을 `PATCH steps/{id}` 단위로 할지 `PUT graph` 전체로 할지, ETag가 버전 단위인지 단계 단위인지. (4) 03 §4~7의 `timing_rule`/`output_rule`/`setup`의 JSON 최종 구조와 `kind` 값 목록(FE는 `output_speed`, `per_output_unit`, `per_reference_length`, `none`과 준비 trigger 8종, 산출 `configured_units`/`split_length`/`pass_through`를 쓰고 있음). (5) 서버 `/validate`가 반환할 `rule_id`·`field_path`가 단계를 가리키는 방식(순서 번호인지 step id인지).
  - FE 임시 가정: 승인 전까지 모든 공정 필드는 화면용 뷰 모델이며 DTO가 아니다.
  - Backend 답변:
  - FE 확인:

- [ ] **R-FE-08 목록 응답의 페이지 이동 방식**
  - 배경: 목록은 keyset `cursor`/`next_cursor`(max limit 200 제안)이다. 이전 페이지로 돌아가는 값은 없다.
  - 요청: (1) 기본·최대 `limit`. (2) 정렬·필터를 바꾸면 cursor를 폐기해야 하는지(BE-01c: cursor 재사용 거부 확인됨), 거부 시의 오류 code. (3) 전체 건수(`total`)를 제공할 계획이 없다는 가정이 맞는지.
  - FE 임시 가정: "더 보기" 방식의 목록이며 총 건수는 표시하지 않는다.
  - Backend 답변:
  - FE 확인:

- [ ] **R-FE-13 프로젝트 생성 폼의 서버 규칙**
  - 배경: FE는 `ProjectCreate`(organization_id, code ≤64, name ≤200, timezone ≤64, description ≤4000 비어 있으면 안 됨)에 맞춰 정적 생성 폼을 만들었다. 설명을 비워 두면 필드를 보내지 않는(생략) 방식으로 가정했다.
  - 요청: (1) `organization_id` 선택지의 출처가 `/me.organizations`인지, 사용자가 admin인 조직만 고를 수 있는지(프로젝트 생성 권한 조건). (2) `code` 고유 범위가 조직 안인지 전체인지(409 문구에 반영). (3) `timezone`이 IANA 이름 검증을 받는지, 잘못된 값의 응답(422 `field_path`). (4) 설명 비움은 필드 생략과 `null` 중 어느 쪽을 기대하는지(빈 문자열은 422로 알고 있음). (5) 생성 후 응답으로 받는 `row_version`/ETag와 `Location` 사용 방식.
  - FE 임시 가정: 조직 선택지는 `/me.organizations`, 설명은 비우면 생략, 시간대는 자유 입력(IANA 안내 문구), 서버가 최종 검증.
  - Backend 답변:
  - FE 확인:

## P3 — 후속 참고

- [ ] **R-FE-09 프로젝트 색·표시 속성**
  - 배경: FE는 프로젝트 오입력 방지를 위해 현재 프로젝트 이름·코드와 구분 색 띠를 보여 준다. 색은 현재 FE 임시 값(서버에 없음).
  - 요청: 프로젝트에 표시 색이나 약칭 같은 속성을 둘 계획이 있는지. 없으면 FE가 프로젝트 id로 결정적으로 색을 고르는 방식(서버 저장 없음)을 써도 되는지.
  - Backend 답변:
  - FE 확인:

- [ ] **R-FE-10 단위 코드 목록과 차원 규칙**
  - 배경: 단위 최종 결정은 사용자가 backend 연동 시 하기로 했다. FE 임시 id: `item`, `bobbin`, `strand`, `bobbin_slot`, `pallet_slot`, `m`, `kg`, `m2`, `min`, `m_per_min`(개수 계열은 정수 전용, 서로 환산하지 않음).
  - 요청: 서버가 받는 단위 코드의 정본 목록, 각 코드의 차원(개수/길이/중량/면적/시간/속도), 정수 전용 여부, `INVALID_UNIT` 422가 나는 조건. 03 §3의 "item만 실행 지원" 규칙이 응답(검증 결과)에 어떻게 드러나는지.
  - Backend 답변:
  - FE 확인:

- [ ] **R-FE-11 보관(archive)·복사 기능 일정**
  - 배경: `include_archived` 쿼리는 있으나 asset/project archive endpoint는 CR 밖이다. FE는 보관 상태 표시와 "보관" 동작을 만들지 않았다.
  - 요청: asset·project archive, project clone(job 202) 구현 일정과 보관된 항목에 대한 수정(PATCH) 정책(거부 code).
  - Backend 답변:
  - FE 확인:

- [ ] **R-FE-12 Idempotency-Key 적용 범위**
  - 배경: 04 계약 §1은 실행/복사/가져오기 POST에 `Idempotency-Key`를 요구한다. 자산·프로젝트 생성 POST는 코드 중복을 409로 막는다.
  - 요청: 자산·프로젝트 생성 POST에서 `Idempotency-Key`를 받는지(받는다면 재시도 동작), 받지 않는다면 브라우저 재시도로 중복 요청이 갔을 때 409 외의 보호가 있는지.
  - FE 임시 가정: 생성 POST는 저장 중 버튼을 비활성화해 중복 전송을 막고, 409는 "코드 중복"으로 표시한다. 헤더는 보내지 않는다.
  - Backend 답변:
  - FE 확인:

---

## 변경 이력
| 날짜 | 작성자 | 내용 |
|---|---|---|
| 2026-10-23 | Frontend | 최초 작성(R-FE-01~12) |
| 2026-10-23 | Frontend | R-FE-13(프로젝트 생성 폼의 서버 규칙) 추가 |
