# Frontend → Backend 요청·확인 목록 (+ Backend 요청 BE-REQ에 대한 FE 답변)

작성: Frontend 세션 / 최초 작성 2026-10-23 / **최종 갱신 2026-10-26 (FE-02b: 공정 그래프 편집)**
짝 파일: `request-from-backend.md` (Backend가 작성). 기준: origin/main `460c364`(계약 0.4.0, FE-01c·01d 병합 포함).

## 사용 규칙 (Backend 파일과 같은 규칙)
1. **각 세션은 자기 파일만 쓴다(단일 작성자).** 이 파일은 Frontend만 쓴다. 상대 파일은 읽기로 확인한다.
   - Frontend 작성: 이 파일(Part 1 FE→BE 요청 `R-FE-nn`, Part 2 `BE-REQ-nnn`에 대한 FE 답변).
   - Backend 작성: `request-from-backend.md`(BE→FE 요청 + `R-FE-nn`에 대한 답변).
2. 읽는 위치(최신순): 상대 세션 worktree(`git worktree list`) → 병합 후 `main`. 사용자 폴더의 `docs/communication/` 빈 파일은 쓰지 않는다.
3. 항목 번호는 고정(재사용·삭제 금지). 우선순위 **P1**=연동을 막음 / **P2**=화면 정확도·UX / **P3**=후속.
4. 상태 표기(FE 관리): `[ ]` 미답변 · `[~]` 답변됨, FE 검토 중이거나 후속 질문이 남음 · `[x]` FE가 답변을 읽고 수용, 후속 질문 없음(구현 반영은 `FE 확인:`의 작업 ID로 추적).
5. 계약·API 변경이 필요한 합의는 CR(`docs/change-requests/`)로 옮기고 링크한다. 비밀값·실제 사용자 ID·실제 고객 정보는 적지 않는다.
6. Frontend는 **작업을 시작하기 전에** `request-from-backend.md`를 읽고 새 항목에 답한다(이번: BE-REQ-001~011).

## FE 현재 상태 (변경되면 갱신)
| 항목 | 값 |
|---|---|
| FE가 **읽은** 계약 | 0.2.0, openapi sha256 `da54371140b994aca48a9ac19653785d6dbc674bde959615a9d4964efdc2a33a`, scope `project-assets-ports`·`asset-revisions` (`contract-status.json` 2026-10-23) |
| FE가 **코드에 반영한** 계약 | **0.4.0 / `1da94db09abb06bb0a08cc6ee40c58d97f5aac85c28d3ec0364e7a4f4b77cb45`** (2026-10-26, FE-01a~02a). scope `project-assets-ports`·`asset-revisions`·`products-materials`·`process-versions`. 생성 타입 `frontend/src/shared/api/generated/schema.d.ts`(도구 openapi-typescript, `pnpm gen:api`; 해시가 `contract-status.json`과 다르면 생성 중단, `pnpm check:api`·단위 테스트가 오래된 생성물을 막음). **연결 범위**: 읽기(`/me`, `GET /projects`, 자산·버전, 제품, **공정 버전·그래프·검증**, `GET /projects/{id}`) + **쓰기: 자산 기본 정보 `PATCH`·생성 `POST`, 자산 버전 `PATCH`·제출·승인·반려·새 초안, 제품 `PATCH`·생성 `POST`, 공정 새 초안 `POST`·그래프 `PUT`·단위 `PATCH`·제출·승인·반려·검증 `POST`**. 프로젝트 생성·수정과 **재료(화면 없음)**는 아직 연결하지 않음. 공정은 단계 `PATCH` endpoint를 쓰지 않고 `PUT graph`로 저장하며, **그래프 구조(노드·간선·이동 규칙)도 직선이 아닌 공정까지 편집**한다. 데이터 출처는 `VITE_DATA_SOURCE=static|api`(기본 static, 실패해도 자동 전환 없음). 반영할 때마다 이 표를 갱신한다(BE-REQ-002) |
| 화면 모델 기준 | **정적 화면은 계약 0.2.0 구조로 정렬됨(FE-00h)**: 자산 기본 정보와 버전을 별도 모델·별도 저장 섹션으로 분리, 설비 포트별 용량, 용량 `value`↔`finite` 어댑터(`capacityAdapter.ts`), `superseded` 상태. 데이터는 승인 예제 모양의 **정적 예시**이며 API 응답이 아니다. 어댑터·뷰 모델은 손으로 쓴 타입이라 생성 client가 생기면 교체한다 |
| 구현된 화면 | 프로젝트 목록·만들기, 설비·공간 목록·상세·만들기, 제품 목록·상세·만들기, **공정 화면(제품 상세의 공정 버전 목록·새 초안, 공정 편집·검토·검증)**. 자산·제품·공정은 `api` 모드에서 서버 데이터로 동작하고 `static` 모드는 같은 모델의 예시 데이터를 쓴다 |
| 다음 FE 작업 | 재료 화면(새 화면 설계 필요), 프로젝트 생성·수정 연동. 공정은 join 규칙·완료 기준(04c)·화면 좌표(04b editor-state)가 계약에 들어오면 이어서 반영 |

---

# Part 1. Frontend → Backend 요청 (R-FE)

Backend 답변 본문은 `request-from-backend.md` Part 2에 있다(2026-10-23, R-FE-01~12). 아래는 FE의 검토 결과다.

## P1

- [x] **R-FE-01 OpenAPI 후보 전달과 계약 승인 일정**
  - Backend 답변: 승인 완료, `contracts/openapi.json` 정식 스냅샷, contract 0.2.0 (backend 파일 R-FE-01).
  - FE 확인(2026-10-23): 수용. `contracts/openapi.json`·`contract-status.json`·`CHANGELOG.md`·`examples/first-scope`가 origin/main에 병합된 것을 확인했다. client는 이 스냅샷의 hash로 생성하고 위 표에 기록한다. 반영 작업: FE-01a.

- [x] **R-FE-02 로컬 개발 연결: 인증 헤더, CORS, 시드**
  - Backend 답변: Vite proxy 권장, CORS 미구현, 시드 실행 완료(backend 파일 R-FE-02).
  - FE 확인: 수용. `DEV_DEBUG_USER`는 `VITE_` 접두사 없이 셸 환경변수로 두고 `vite.config.ts` proxy에서만 읽는다(번들에 사용자 id 미포함). CORS 미들웨어는 **요청하지 않는다**. 헤더 이름은 proxy 설정 한 곳에 둔다. 서버 기동 주체는 BE-REQ-004(사용자 결정: backend 세션 또는 사용자). **반영 완료(2026-10-23):** `vite.config.ts` proxy(`/api` → `DEV_API_TARGET` 기본 `127.0.0.1:8000`, `DEV_DEBUG_USER`를 `X-Debug-User`로 붙임), `.env.example` 갱신. 실제 서버(`/health`·`/me`)를 proxy 경유 브라우저에서 확인함.

- [x] **R-FE-03 프로젝트 전환 UI의 데이터 출처와 역할 값**
  - Backend 답변: `/me.projects` 사용 가능(상한·페이지 없음), 역할 잠정 목록, 프로젝트 `status`는 `active|archived`(현재 모두 active), `/me`의 projects에는 `status`가 없음(backend 파일 R-FE-03).
  - FE 확인: 수용. 전환 메뉴는 `/me.projects`로 구성한다. 역할 표시 라벨(표시용, 서버 403이 정본): admin=관리자, editor=편집자, viewer=조회자; 조직 admin=조직 관리자, member=조직 구성원. 모르는 역할 문자열은 원문을 그대로 표시한다. **역할 라벨·버튼 노출 판정(`canEdit`/`canApprove`)은 FE-00h에 정적 화면에 반영함**(조회자는 입력 읽기 전용·작업 버튼 숨김, 편집자는 검토 요청만, 승인·반려는 관리자만). **후속 요청:** `/me.projects[]`에 `status`를 추가하는 소규모 보강을 **찬성**한다(보관된 프로젝트를 메뉴에서 구분/제외하기 위해). 우선순위 의견은 BE-REQ-010 답변. **반영 완료(FE-01b, 2026-10-23):** 전환 메뉴·역할은 `/me`(`useMe`), 프로젝트 목록은 `GET /projects`에 `/me`의 역할을 id로 합쳐 표시, 프로젝트 만들기의 조직은 `/me.organizations` 중 admin만. 실서버로 확인(관리자·조회자·소속 없음·다른 조직 사용자). 시간대는 `/me`에 없어 상세 화면에서만 `GET /projects/{id}`로 가져온다(R-FE-14).

- [x] **R-FE-04 오류 코드·`field_path` 규칙**
  - Backend 답변: 코드·HTTP 표, `field_path`는 본문 기준 JSON Pointer, 쿼리·헤더 오류는 이름만(backend 파일 R-FE-04).
  - FE 확인: 수용. 오류 변환 계층은 위 표의 code를 열거형으로 두고 모르는 code(`HTTP_ERROR` 포함)는 일반 오류로 표시하며 `request_id`를 보여 준다. `PRECONDITION_REQUIRED`(428)는 FE 버그 신호라 사용자에게 노출하지 않고 로깅한다. 쿼리 오류(`/limit`, `/cursor` 등)는 endpoint 문맥으로 본문 필드와 구분한다. **FE 가정 하나:** 경로의 UUID 형식 오류(422)는 사용자에게는 "찾을 수 없음"과 같은 화면으로 처리한다. 다르게 처리해야 하면 알려 주세요. **반영 완료(FE-01a, 2026-10-23):** `shared/api/errors.ts`(`ApiError`·`NetworkError`·`classifyError`·`toIssues`·`fieldErrors`)와 `QueryErrorNotice`. 실서버에서 확인한 사실: 경로의 비UUID id는 **422**(상세 화면은 "찾을 수 없음"으로 처리), 잘못된 cursor는 422 `INVALID_CURSOR`, 비멤버·다른 프로젝트 경유는 404 `NOT_FOUND`, 인증 헤더 없음은 401. **쓰기 오류도 실서버로 확인(FE-01c, 2026-10-23):** If-Match 없음 428 `PRECONDITION_REQUIRED`, 오래된 버전 412 `EDIT_CONFLICT`(`field_path=/row_version`, 서버에 아무것도 쓰이지 않음), 코드 중복 409 `ASSET_CODE_CONFLICT`(`field_path=/code`), 빈 문자열·null 불가 필드·허용되지 않은 필드(`/kind`)·빈 본문 422, 조회자 403, 비멤버 404. 모두 FE 화면에 연결(412→리소스별 충돌 안내, 409/422→필드 오류, 428→화면 오류 안내, 403/404/네트워크 단절→각각 안내).

## P2

- [x] **R-FE-05 용량·그룹·버전 상태·포트 위치**
  - Backend 답변: 0.2.0에서 제공(용량 객체, 리비전 상태, `current_revision`/`latest_revision`), 포트 위치는 layout 묶음, `field_meta`는 두지 않음, 그룹은 미제공(backend 파일 R-FE-05).
  - FE 확인: 수용. 이 답변으로 FE 화면 모델이 크게 바뀐다(영향은 BE-REQ-001 답변의 표). 포트 위치는 API 값이 아니라 FE 기본 표시("위치 미정")로 유지한다. `field_meta` 없이 서버 `issues[]`를 정본으로 쓴다. 그룹은 "계약 필요" 표시 대신 **필드 자체를 제거**한다(BE-REQ-001 #13). 반영 작업: FE-01b~d.

- [x] **R-FE-06 자산 필드 대응: 유형·모델·그룹·정렬**
  - FE 확인: 수용. `equipment_type`/`space_type`은 자유 문자열 입력(최대 100자), 정렬은 단일 필드(`sort_order|code|name`, `-` 접두). `dock`/`storage` 차이는 `kind`로만 구분하고 도킹 용량을 무제한으로 가정하지 않는다. 반영 작업: FE-01b.

- [~] **R-FE-07 제품·공정 버전 API 일정과 단계 DTO**
  - Backend 답변: 일정 미정(BE-REQ-010 입력 대기), `specification` 자유 텍스트 제안, 저장 단위는 `PATCH steps/{id}`·`PUT graph`, ETag는 공정 버전 단위, `/validate` 오류는 `entity_id`(step id)+`field_path`(단계 내부 JSON Pointer)(backend 파일 R-FE-07).
  - FE 확인: 2~5번 수용. 특히 **검증 경로 방식이 FE와 다르다**: FE 정적 화면은 순서 번호(`/steps/2/setup/duration`)를 쓰는데 실제 연동 시 `entity_id`(step id) + 단계 내부 포인터로 바꾼다. 1번(일정)은 BE-REQ-010·011로 이어진다. 남은 일: 일정, 공정 CR.

- [x] **R-FE-08 목록 페이지 이동**
  - FE 확인: 수용. 기본 50/최대 200, 필터·정렬·프로젝트가 바뀌면 cursor 폐기(422 `INVALID_CURSOR`에 대비해 폐기하지 않은 경우 첫 페이지로 재요청), `total` 없음·이전 페이지 없음 → "더 보기" 방식. **반영 완료(FE-01b, 2026-10-23):** 자산·프로젝트 목록이 `limit`/`next_cursor`로 더 보기를 하고, 정렬·검색·종류가 바뀌면 새 조회(cursor 폐기). 새 조건을 불러오는 동안 같은 프로젝트의 이전 목록만 유지한다(다른 프로젝트 데이터는 남기지 않음). 실서버에서 50건 + 다음 페이지(중복 없음)와 조건이 다른 cursor의 422를 확인.

## P2 (추가)

- [x] **R-FE-13 프로젝트 생성 폼의 서버 규칙**
  - 배경: FE는 `ProjectCreate`(organization_id, code ≤64, name ≤200, timezone ≤64, description ≤4000·빈 문자열 불가)에 맞춰 정적 생성 폼을 만들었다. 설명을 비우면 필드를 보내지 않는 방식으로 가정했다.
  - 요청: (1) `organization_id` 선택지의 출처가 `/me.organizations`인지(R-FE-03 답변으로 "조직 admin만 프로젝트 생성"은 확인됨, 선택지에 admin 조직만 보여도 되는지). (2) `code` 고유 범위가 조직 안인지 전체인지(409 문구에 반영). (3) `timezone`이 IANA 이름 검증을 받는지, 잘못된 값의 응답(422 `field_path`). (4) 설명 비움은 필드 생략과 `null` 중 어느 쪽을 기대하는지. (5) 생성 응답의 `Location`·ETag 사용 방식.
  - FE 임시 가정: 선택지는 `/me.organizations` 중 role=admin인 조직, 설명은 비우면 생략, 시간대는 자유 입력, 서버가 최종 검증.
  - Backend 답변: `request-from-backend.md` Part 2 R-FE-13(2026-10-23, 커밋 `d0a9f38`): (1) `/me.organizations`, role=admin만, 선택지가 없으면 안내 / (2) 코드는 조직 안에서 유일, 409 `PROJECT_CODE_CONFLICT`의 `field_path=/code` / (3) IANA 검증, 422 `/timezone` / (4) 설명은 생략·null 동일(입력 없음), 빈 문자열 422 / (5) 201 + 전체 `ProjectOut`(`row_version:1`) + `ETag` + `Location`, 생성자는 project admin 자동 등록 → 생성 후 `/me` 재조회.
  - FE 확인(FE-00h): 수용. **정적 폼에 반영함:** 조직 선택지는 role이 admin인 조직만(구성원 조직은 숨김), 선택 가능한 조직이 없으면 "프로젝트를 만들 권한이 없습니다" 안내, 시간대는 브라우저 `Intl`로 IANA 이름 검증, 설명은 비우면 생략. 연동 시 할 일(FE-01b): 409의 `/code` 오류를 코드 필드에 표시, 생성 응답 본문을 재조회 없이 사용, 생성 직후 `/me`를 다시 불러 전환 메뉴 갱신. 확인 필요 없음.

- [x] **R-FE-14 `/me.projects[]`의 시간대(`timezone`)**
  - 배경: 서버 시각은 UTC로 오고 화면은 프로젝트 시간대로 보여 줘야 한다(계약 04). `/me.projects[]`에는 `timezone`이 없고 `GET /projects/{id}`에만 있다. 시험 데이터 프로젝트 B는 UTC, C는 America/New_York라 시간대를 모르면 KST로 잘못 보여 줄 수 있다.
  - FE 조치(현재): 시각을 보여 주는 상세 화면에서만 `GET /projects/{id}`를 한 번 더 호출해 시간대를 쓰고, 알 수 없는 동안에는 열 제목에 "(Asia/Seoul 기본)"이라고 표시한다.
  - 요청(낮음): 0.3.0 소규모 보강에서 `/me.projects[]`에 `timezone`(과 `status`)을 함께 넣어 주면 요청이 줄어든다. 불필요하다고 판단하면 그대로 두어도 FE는 동작한다.
  - Backend 답변:
  - FE 확인(FE-01d): **계약 0.3.1에서 `/me.projects[].timezone`이 추가되어 반영 완료.** 상세 화면은 더 이상 `GET /projects/{id}`를 추가로 호출하지 않고 `/me`의 시간대로 시각을 표시한다(`useProjectTimezone`). 시간대를 모르는 동안 열 제목의 "(Asia/Seoul 기본)" 표시는 유지한다(`/me` 로딩 전에만 보임). 가짜 서버 테스트로 America/New_York·UTC 표시를 확인했고 추가 요청이 없음을 검증했다.

## P3

- [x] **R-FE-09 프로젝트 색·표시 속성**
  - FE 확인: 수용. 서버에 색을 두지 않으므로 **프로젝트 id의 해시로 결정적으로 색(4색)을 고른다. 반영 완료(FE-00h, `accentFor`)** — 목록 순서가 바뀌어도 같은 프로젝트는 같은 색이다(테스트 있음). 이름·코드는 항상 함께 표시한다. 프로젝트 id 대신 **프로젝트 코드**를 경로·전환 메뉴에 표시한다(`useCurrentProject`).

- [x] **R-FE-10 단위 코드 목록과 차원 규칙**
  - FE 확인: 수용. 용량 단위는 `item|bobbin_slot|pallet_slot|kg|m2`만 사용(FE `CAPACITY_UNITS`와 일치). `bobbin`, `strand`, `m`, `min`, `m_per_min`은 공정 화면의 임시 단위이며 용량에 쓰지 않는다. `INVALID_UNIT`은 쓰지 않고 `VALIDATION_ERROR`의 `field_path`로 매핑한다. item 외 단위 경고는 서버 `issues[]`의 `VAL-CAP-002`를 정본으로 한다(현재 FE 자체 경고는 연동 시 제거). 공정 단위는 공정 CR에서 확정 대기.

- [~] **R-FE-11 보관(archive)·복사 기능 일정**
  - Backend 답변: 일정 미정, 보관된 항목에 대한 쓰기는 409 제안(backend 파일 R-FE-11).
  - FE 확인: 제안(보관 항목 쓰기 409) 동의. 일정은 BE-REQ-010 #4로 이어진다.

- [x] **R-FE-12 Idempotency-Key 적용 범위**
  - FE 확인: 수용. 생성 POST는 저장 중 버튼 비활성, 409 `*_CODE_CONFLICT`는 "코드 중복" 표시. 네트워크 단절 뒤 재시도의 409는 `q=<code>`로 재조회해 "이미 만들어졌는지" 확인하는 흐름을 둔다. 버전 제출·승인·반려는 `If-Match`로 보호됨을 확인. **반영 완료(FE-01c, 생성):** 만드는 중 버튼 비활성·연속 클릭 시 1회 전송, 409는 코드 필드 오류, 연결이 끊기면 "처리 여부를 알 수 없음" 안내와 함께 같은 코드로 목록을 재검색하는 링크를 제공(중복 생성 방지). 제출·승인·반려는 FE-01d.

---

# Part 2. Backend 요청(BE-REQ)에 대한 FE 답변

답변일 2026-10-23. 작성 근거: 현재 `frontend/src`(커밋 `2957f5e`, origin/main `607d8a7`)와 안내서 `HANDOFF-backend-20261023-BE-02-for-frontend.md`, `contracts/openapi.json`, CR be03. **FE 코드·계약·backend는 이번 답변 작성 중 수정하지 않았다.**

## BE-REQ-001 · 0.2.0 반영 계획과 안내서 §2 대조
**결론: 안내서 §2의 18개 항목 중 이미 해결된 것은 없고(0), 17개는 바꿔야 하며, 1개(#8)는 부분 일치다.** 해석이 다른 항목은 4개(#4, #8, #12, #16)다. §5의 FE-01a~d 순서에는 **동의**하되 FE-01a의 도구 결정은 사용자 승인이 필요하다.

| # | 판정 | 현재 FE (확인한 위치) | 메모 |
|---|---|---|---|
| 1 | 변경 필요 | `AssetDetailPage`: `readOnly = base.status !== "draft"`가 기본 정보 필드까지 잠금 | 기본 정보=항상 편집(viewer만 읽기 전용), 용량·정책=`revision.status==="draft"`로 분리. 동의 |
| 2 | 변경 필요 | `AssetView` 단일 모델로 기본 정보+용량+상태를 함께 편집 | 자산/버전 뷰 모델 분리. 저장은 BE-REQ-003대로 **섹션별** |
| 3 | 변경 필요 | 설비도 단일 "대기 용량" | 설비는 IN/OUT 포트별 2개, 공간은 저장 용량 1개. 동의 |
| 4 | **해석 차이(보완)** | 공통 `KnownValueInput`은 `value` 모드에서 `0`을 허용 | `finite`는 0 초과에 동의. 다만 공통 컴포넌트를 바꾸지 않고 **필드별 규칙 옵션**(예: `positive`)을 추가한다. 이유: 공정의 "준비 0분"처럼 0이 유효한 필드가 있어(03 §4, FE 정적 화면에서 사용) 전역 변경이 틀린 값을 만든다 |
| 5 | 변경 필요 | `unit`을 모드와 무관하게 유지 | 어댑터가 `finite` 외 모드에서 `value`·`unit`을 제거, `status`는 보내지 않음. 동의 |
| 6 | 변경 필요 | `VersionStatus`에 `archived`는 있고 `superseded` 없음 | BE-REQ-009 참조 |
| 7 | 변경 필요 | `ConflictNotice` 한 종류, 어느 리소스인지 모름 | 리소스 이름(자산 정보/용량 버전)을 안내문에 표시. 한쪽 충돌 시 다른 쪽 입력 보존. 동의 |
| 8 | **부분 일치** | `ValidationIssue`(severity, rule_id, field_path, message, resolution)가 서버 `issues[]`와 필드 호환. 다만 FE 자체 경고(용량 미정, item 외 단위)가 있다 | 서버 `issues[]`를 정본으로 하고 **연동 모드에서는 FE 자체 경고를 제거**한다(형식 오류 검사만 유지). 정적(미연동) 모드에서는 유지 |
| 9 | 신규 | 포트별 배출 규칙 UI 없음 | 공통 컴포넌트에 없는 패턴이므로 `frontend/AGENTS.md` 규칙대로 **확장 제안을 먼저 기록**(FE-01d 착수 전 `CR-frontend-…`). 지금은 작성하지 않음 |
| 10 | 변경 필요 | 저장·승인 버튼 비활성("계약 필요") | 역할은 `/me.projects[].role`로 버튼 노출만 정하고 403을 신뢰. 반려 사유 입력용 확인 창 확장이 필요(#9와 같은 확장 제안에 포함) |
| 11 | 변경 필요 | "복사하여 수정" 안내문만 있음 | "새 초안 만들기"→`POST …/revisions`, 409 `REVISION_DRAFT_EXISTS`면 열린 버전으로 이동 |
| 12 | **해석 차이(선택)** | 자산 생성 후 버전 흐름 없음 | 자동 생성하지 않고 **명시 버튼("용량 설정 시작")**으로 `POST …/revisions`. 이유: 서버 상태를 만드는 요청이라 사용자가 의도해야 하고 생성 직후 실패 처리가 단순 |
| 13 | 변경 필요 | 목록 컬럼에 대기 용량·상태, 상세에 그룹 | 용량 컬럼 제거(BE-REQ-005), 그룹 필드·필터 **제거**(R-FE-05), 상태는 `latest_revision.status`("버전 없음" 포함) |
| 14 | 변경 필요 | 자산·제품·프로젝트 목록을 클라이언트에서 정렬·검색 | 서버 정렬·`q`·cursor로 전환. 서버가 지원하지 않는 컬럼(상태·모델)은 정렬 비활성. 제품·프로젝트 목록도 같은 방식 |
| 15 | 변경 필요 | `PortView={kind, placement}` | `role`↔`kind` 이름 변경, `port.id` 보관, `placement`는 FE 기본 표시 유지 |
| 16 | **해석 차이(보완)** | 예시 프로젝트 id가 `demo-a` 같은 비UUID | 실제 연동 모드에서는 `/me`의 UUID만 사용. 정적 예시는 UUID 형식으로 바꿔 두 모드의 경로 형태를 맞춘다. 경로 UUID 형식 오류(422)는 "찾을 수 없음"으로 표시(R-FE-04 가정) |
| 17 | 부분 구현 | `projectKey(projectId, …)` 헬퍼, 프로젝트 전환 시 이전 프로젝트 쿼리 취소·제거는 있음. 리소스별 키는 없음 | 안내서 §2 #17의 키 구조를 채택. 변경 성공 시 revision·asset·assets 목록·revisions 목록 무효화 |
| 18 | 변경 필요 | `.env.example`에 `VITE_ENABLE_MOCKS`만 있고 Mock 없음 | `examples/first-scope`로 Mock 구성, 화면에 "Mock" 상태 명시. 실제 API 실패 시 Mock으로 자동 전환하지 않음 |

이미 갖춰진 기반(재사용): `ValidationPanel`, `ConflictNotice`, `ConfirmDialog`, 미저장 변경 보호, 프로젝트 전환 시 캐시 정리, 상태 화면(로딩·빈·오류·권한 없음·충돌), 용량 단위 목록(`CAPACITY_UNITS`가 R-FE-10 답변과 일치), `not_applicable` 모드 용량 제외, `unlimited`/`not_allowed` 구분.

**§5 작업 순서에 대한 FE 의견**
- FE-01a: client 생성 도구는 새 의존성이라 **사용자 승인(ADR)이 필요**하다. FE 제안은 "OpenAPI → 타입 생성 도구 + 얇은 자체 fetch 래퍼"이며 도구 이름은 승인 요청 때 비교표와 함께 올린다(아직 결정되지 않음). 기록 항목: 계약 version/hash를 생성물 헤더와 위 "FE 현재 상태" 표에 남긴다.
- FE-01b~d: 동의. 단, **FE-01b에서 목록의 용량·그룹 컬럼과 `status` 합성 필드를 제거**하는 정적 화면 정리를 함께 한다.
- FE-01c 전에 Mock(예시 기반)을 먼저 둘지는 FE-01a 승인 때 정한다.
- 이 모든 작업은 조정자 배정(TASK_BOARD)과 사용자 승인이 선행되어야 하며 이번 답변은 **계획 합의일 뿐 구현 시작이 아니다.**

**진행 현황(FE-00h, 정적 화면에 한해 반영 — API·client·Mock은 없음)**
| # | 상태 | 반영 내용 / 남은 일 |
|---|---|---|
| 1 | 반영(정적) | 기본 정보는 역할이 허용하면 항상 편집, 용량·정책은 `draft`일 때만. 조회자는 전체 읽기 전용 |
| 2 | 반영(정적) | `AssetInfo`(기본 정보)와 `RevisionDetail`(버전) 분리, 섹션별 저장·되돌리기·미저장 표시 |
| 3 | 반영(정적) | 설비는 IN/OUT 포트별 용량 구역, 공간은 저장 용량 하나. 도킹을 무제한으로 가정하지 않음 |
| 4 | 반영 | 용량 전용 검증 `validateCapacity`(0·선행 0·소수 7자리 거부, 문구 포함). 공통 입력은 `validator` 옵션으로 확장(공정의 0분은 그대로 유효) |
| 5 | 반영(어댑터) | `toCapacityRequest`(finite 외 모드는 value·unit 제거, status 안 보냄)·`fromCapacityDto`. 단위 테스트 있음 |
| 6 | 반영 | `superseded`("대체됨") 추가, `archived`는 유지 |
| 7 | 반영(정적) | `ConflictNotice`에 리소스 이름 표시. 한쪽을 되돌려도 다른 쪽 입력 보존(테스트 있음) |
| 8 | 부분 | 서버 `issues[]` 모양을 샘플로 그대로 표시, 클라이언트 오류는 형식 검사만. 연동 시 FE 자체 경고 제거 |
| 9 | 읽기 전용만 | 규칙은 라벨(확정 D-U05·D-U06 / 미정 OPEN-003)로 표시. **편집 UI는 확장 제안 승인 후** — `CR-frontend-20261023-fe-rule-ui-and-reason-dialog` |
| 10 | 부분 | 역할별 버튼 노출(제출: 관리자·편집자, 승인·반려: 관리자). 모두 비활성("연동 후"). 반려 사유 입력 창은 위 CR |
| 11 | 부분 | 열린 버전이 있으면 "열린 버전 보기", 없으면 "새 초안 만들기(연동 후)" 비활성 |
| 12 | 반영(정적) | 버전이 없으면 빈 상태 + "용량 설정 시작(연동 후)". 자동 생성 없음 |
| 13 | 반영 | 목록에서 용량·그룹 제거, 최신 버전·승인본 요약 표시("버전 없음" 포함) |
| 14 | 부분 | 서버가 지원하는 정렬 키만(정렬 순서·코드·이름) 노출. 검색·정렬·cursor를 서버로 옮기는 일은 FE-01b |
| 15 | 반영 | `role`로 이름 변경, `port.id` 보관, 위치는 FE 기본 표시 |
| 16 | 반영 | 예시 프로젝트 id를 UUID로 교체, 경로·메뉴에는 코드 표시. 비UUID·없는 자산은 "찾을 수 없음" |
| 17 | 미반영 | 리소스별 query key는 연동 때(FE-01b) |
| 18 | 미반영 | Mock·client는 FE-01a 승인 후 |
- 확인한 계약 사실: 버전 **목록** 응답의 항목도 상세와 같은 `AssetRevisionOut`(용량·ports·issues 포함, `ListOut_AssetRevisionOut_`)이라 FE는 이력 목록에서 상세를 따로 호출하지 않아도 된다고 판단했다. 다르면 알려 주세요.

## BE-REQ-002 · FE가 반영한 계약 버전/해시 기록
- 현재 FE 코드가 반영한 계약: **0.3.0 / `a4610740d413de76664dff0ccf3f0d958fc96679fd3e05bb2440cca82aa78b48`** (2026-10-23, 생성 타입 + 읽기·자산 기본 정보 쓰기 연결, 위 "FE 현재 상태" 표). 0.2.0 → 0.3.0은 main 병합 직후 재생성했고, 재생성 전에는 `pnpm check:api`와 단위 테스트가 실패해 오래된 생성물을 막았다(의도한 동작). 생성물의 해시가 `contract-status.json`과 다르면 `pnpm check:api`와 단위 테스트가 실패한다.
- 앞으로 client를 생성·재생성하거나 계약 변경을 반영할 때마다 이 파일의 표와 FE 인계 문서에 `contract_version`과 `openapi_sha256`을 적는다. 세션 시작 시 `contract-status.json`과 비교한다.

## BE-REQ-003 · 자산 기본 정보와 용량(버전)의 저장 UX
- **FE 결정: 섹션별 저장.** 화면의 "기본 정보"와 "용량·규칙(버전)"이 각각 저장 버튼·변경 표시·충돌 알림을 가진다. 한 버튼으로 두 요청을 보내지 않는다.
- 이유: 두 리소스의 ETag·충돌이 독립이라 부분 실패를 사용자에게 설명할 필요가 없어지고, 한쪽 충돌이 다른 쪽 입력을 지우지 않는다. 화면 이동 보호(미저장 변경)는 두 섹션 중 하나라도 변경이면 동작한다.
- 합성 endpoint 요청: **없음**(CR 불필요).

## BE-REQ-004 · API 서버 실행 주체와 CORS
- ② **Vite proxy로 충분하고 CORS는 필요 없다.** CORS 미들웨어는 구현하지 않아도 된다(R-FE-02 답변과 동일).
- ① 서버 실행 주체: FE는 `backend/**`를 수정하지 않고 실행만 할 수 있다. **FE 제안:** Backend가 상시 띄우지 않고, 연동 작업 때 사용자가 `backend/README.md`의 명령으로 한 번 띄운다(또는 사용자가 허용하면 FE 세션이 띄운다). 개발 DB 연결과 프로세스 기동이 걸려 있어 **사용자 결정이 필요**하다. 결정이 나기 전에는 FE가 서버를 기동하지 않는다.
- **사용자 결정(2026-10-23):** 서버 실행 주체는 **backend 개발 세션 또는 사용자**이며, FE는 기동하지 않는다. 이 결정으로 FE 쪽 항목은 닫힌다(Backend가 `확인(BE)`로 닫으면 됨). FE는 `DEV_DEBUG_USER` 셸 환경변수 + proxy로 연결했고 실서버(`127.0.0.1:8000`, `/health` ok)에서 읽기 검증을 마쳤다.

## BE-REQ-005 · 목록의 용량 컬럼
- **FE 선택: ① 제거 + 상태 표시.** 목록은 상태(`latest_revision.status`, 없으면 "버전 없음")와 "승인본 있음"(`current_revision` 유무)만 보여 주고 용량은 상세로 유도한다.
- ③(`?include=current_revision`)은 지금 요청하지 않는다. 실제 사용 단계에서 목록의 용량 비교가 필요하다는 판단이 서면 구조 데이터(`mode`/`value`/`unit`) 형태로 다시 요청한다.

## BE-REQ-006 · 개발 시드 추가 요청
요청 시드(모두 **시험용 가상 데이터**, 이름에 "시험" 표시, 실제 기준정보 아님):
1. 프로젝트 3개: 시간대가 다른 것 포함, 같은 조직 1 + **다른 조직 1개**(프로젝트·사용자 1명, 비멤버 404 검증용).
2. 사용자: 기존 admin/editor/viewer + **어느 프로젝트에도 속하지 않은 사용자 1명**(빈 `/me.projects` 상태 검증), 프로젝트별로 역할이 다른 사용자 1명(프로젝트 A=admin, B=viewer).
3. 자산(프로젝트 1개에 집중): 설비·저장·도킹을 섞어 **60건 이상**(기본 `limit=50`에서 `next_cursor`가 나오도록), 코드가 `EQ-001` 형태와 `ST-001` 형태로 정렬 검증이 가능할 것, **보관된 자산 1건**(`archived_at` 설정).
4. 버전 상태별 샘플: ① 버전 없음(`latest_revision=null`) ② draft만 ③ in_review ④ approved(current)만 ⑤ approved + 새 draft ⑥ superseded 이력이 있는 자산 ⑦ 오래된 approved 위에 in_review.
5. 용량 케이스: `unknown`, `finite`(item 정수, `kg`·`m2` 소수 6자리), `unlimited`, `not_allowed`, item 외 단위(`VAL-CAP-002` 경고), 저장 용량이 있는 공간.
6. 규칙 케이스: 배출 규칙 `unknown`과 `when_destination_available`, `reservation`·`block_machine_while_waiting`이 `unknown`인 포트와 값이 있는 포트.
7. 같은 코드(`EQ-001`)를 서로 다른 프로젝트에 둔 자산 1쌍(프로젝트 격리 확인).
- 목적: FE-01b~d와 INT-01의 격리·충돌·권한·cursor 검증. 값의 사실성은 요구하지 않는다.

## BE-REQ-007 · 사용자(역할) 전환 UI
- **불필요(현재).** `DEV_DEBUG_USER` 환경변수 교체 + 서버·개발 서버 재시작으로 충분하다. 역할별 화면 확인이 잦아지면 개발 전용 전환 도구를 별도 제안한다.

## BE-REQ-008 · 배출 규칙 코드값·라벨
- **코드값 변경 요청 없음.** 코드는 그대로 두고 라벨은 FE가 정한다(제안, `openapi.json`을 FE-01d에서 직접 대조해 확정):
  - `dispatch_rule.mode`: `when_destination_available`="목적지 설비가 가용할 때 이동"(D-U05, 사용자 확정), `unknown`="미정".
  - `wait_at_in_if_busy`: true="목적지가 사용 중이면 IN에서 대기"(D-U05).
  - `release_rule.mode`: `when_destination_accepts`="목적지가 수용할 때 OUT에서 배출"(D-U06, 사용자 확정), `unknown`="미정".
  - `reservation`: `unknown`="미정"(OPEN-003), `reserve`="이동 중 예약", `none`="예약하지 않음".
  - `block_machine_while_waiting`: `unknown`="미정"(OPEN-003), `yes`="OUT 대기 중 설비 점유", `no`="점유하지 않음".
- 화면은 "확정"(D-U05·D-U06)과 "미정"(OPEN-003)을 라벨과 배지로 구분하고, 미정을 선택지로 유지하며 값이 없을 때 "0"이나 "아니오"로 채우지 않는다.

## BE-REQ-009 · 화면 버전 상태 값
- **동의.** `VersionStatusBadge`에 `superseded`="대체됨"을 추가하고 `archived`="보관"은 유지한다(서버가 쓰기 시작할 때를 대비). 알 수 없는 값은 기존처럼 "알 수 없음". 반영 작업: FE-01c.

## BE-REQ-010 · FE가 다음에 필요한 Backend 기능 우선순위
FE 화면 순서 기준 의견이다. 최종 일정은 사용자·조정자가 정한다.
| 순위 | 항목 | 시급도 | 이유 |
|---|---|---|---|
| 0 | (없음) FE-01a~d는 **현재 계약 0.2.0만으로 가능** | — | 자산·프로젝트·버전 화면 연동이 먼저다 |
| 1 | #5 `/me.projects[].status` 등 소규모 보강 | 높음(소규모) | 프로젝트 전환 메뉴에서 보관 프로젝트 구분. 변경이 작다 |
| 2 | #1 제품·재료 CRUD(CR be03) | 보통 | FE-01d 이후 제품 화면 연동 때 필요. **제품 목록에 최신 공정 버전 요약 필요**(BE-REQ-011) |
| 3 | #2 공정 버전·그래프(단계·검증) | 보통 | FE 공정 표 편집 초안(FE-00f)이 대응. 공정 CR에서 필드 확정 필요 |
| 4 | #4 프로젝트 보관·멤버·복사, 자산 보관 | 낮음~보통 | 운영 절차에는 필요하나 화면 연동의 선행 조건은 아님 |
| 5 | #3 그룹·별칭 | 낮음 | FE는 그룹 필드를 제거하고 후속으로 미룸 |
| 6 | #6 RLS·DB 계정 분리 | FE 영향 없음 | 일정은 Backend·조정자 판단 |

## BE-REQ-011 · 제품·공정 화면 모델 공유
출처: `frontend/src/features/products/productView.ts`, `sampleProducts.ts`, `features/processes/processView.ts`. **모두 화면 전용 뷰 모델이며 DTO가 아니다. "확정"은 아래 표에서 명시한 것뿐이고 나머지는 FE 가정이다.**

**제품(ERD §5 `product`·`process_version`에 있는 필드만 사용)**
| 화면 필드 | 형태 | 미정 표현 | 근거/상태 |
|---|---|---|---|
| `code` | 표시 코드, 프로젝트 내 고유 | — | 확정(ERD) |
| `name` | 문자열 | — | 확정(ERD) |
| `specification` | 문자열 \| null | **null=미정**, 빈 문자열은 오류(미정과 다름) | FE 가정. 화면은 "규격 미정" 체크로 구분 |
| `versions[]` 요약 | `{id, versionNo, status}` | — | FE 가정(목록용 요약) |
| 목록의 "최신 공정 버전" | 가장 높은 `versionNo`와 그 상태 | 없으면 "공정 없음" | **요청: 제품 목록 응답에 `latest_process_version` 요약(자산의 `latest_revision`과 같은 방식)을 포함해 주세요**(N+1 방지) |

**CR be03 §4 결정 항목에 대한 FE 의견**
1. `specification`: **제안 A(자유 텍스트 nullable, 최대 4000자)에 동의**. FE는 `null`을 "미정"으로 표시한다. 구조화가 필요해지면 후속 CR. 빈 문자열 422도 FE 규칙과 일치.
2. 재료 `form`: FE에 재료 화면이 없고 공정 입력(길이·중량·수량·가닥) 열도 아직 만들지 않았다. **의견 없음, 제안 A(자유 텍스트)로 충분**. 재료 화면을 만들 때 다시 의견을 낸다.
3. `default_spec`: **제안 A(필드별 판별 객체)에 동의**. 길이 `length_m`·중량 `weight_kg`(decimal 문자열), `unit_count`·`strand_count`(정수)를 섞지 않는다는 원칙이 FE 단위 규칙(개수 계열 정수, 서로 환산 안 함)과 같다. 기본값은 모두 `unknown`(0 아님). FE 어댑터가 `known`↔`value` 모드를 변환한다. 용량의 `finite`와 이름이 다른 점(`known`)은 일관성 면에서 아쉬우나 의미는 같아 변경 요청하지 않는다.
4. 권한: **자산과 동일(admin·editor)** 로 충분. 공정 승인이 admin 전용이라 기준정보 변경의 영향이 승인 단계에서 걸러진다.
5. 보관: 이번 CR 범위 동의.

**공정 단계(03 §4~7 PROPOSED 중 FE가 사용한 부분)** — 모두 FE 임시 가정이며 공정 CR에서 확정해야 한다.
| 영역 | FE 화면 값 | 단위 | 미정 표현 |
|---|---|---|---|
| 처리 방식 | `unknown`·`none`·`output_speed`·`per_output_unit`·`per_reference_length` | 선속 m/분, 시간 분, 기준 길이 m | 방식 자체가 미정이면 `unknown`, 값은 `{mode: unknown}` |
| 준비 | trigger 8종(03 §4.4 그대로) + 시간 | 분 | trigger `unknown`, 시간 `{mode: unknown}`(0 아님) |
| 산출 | `unknown`·`configured_units`·`split_length`·`pass_through` | 길이 m, 수량 보빈 | 값 `{mode: unknown}` |
| 설비 | `group`(후보 중 배정)·`specific`(하나 지정) + 후보 목록 | 자산 표시 코드(연동 시 자산 id) | 후보 없음은 경고 |
| 다음 위치 | 저장공간 자산 | — | null=미정 |
| 확인 상태 | `confirmed`·`unknown`·`assumed` (**단계 단위**) | — | 03 §2는 필드 단위(`field_meta`)라 어긋남 |
- 알려진 어긋남: ① 확인 상태를 단계 단위로 단순화했다(필드 단위로 바꿀지 공정 CR에서 정해야 함). ② 입력 길이·중량·수량·가닥, 이동, 잔량 열은 만들지 않았다. ③ `merge_strands`·`fixed_mass_units` 산출 방식은 규칙이 미정이라 제외했다.
- 요청: 공정 CR 작성 시 위 표와 03 §4~7을 대조해 **어긋나는 필드 목록**을 FE에 알려 주세요. FE는 그 CR 승인 전에는 이 화면을 "초안 UI"로 유지한다.

## BE-REQ-012 · 시험 데이터·실행 스크립트·R-FE-13 답변 확인
- ① **시험 데이터: 충족.** 실서버를 읽어 확인한 내용: 프로젝트 3개(A Asia/Seoul, B UTC, C 다른 조직), 자산 60건 + 보관 1건(`limit=50`에서 `next_cursor`), 버전 상태 4종(draft·in_review·approved·superseded)이 모두 어댑터를 통과, 역할이 다른 사용자(admin·viewer·mixed)·소속 없음·다른 조직 사용자 동작, 같은 코드 `EQ-001`이 A·B에 있고 A의 자산 id로 B를 조회하면 404. **빠지거나 어긋난 케이스: 없음.** 회귀 방지로 FE에 읽기 전용 라이브 테스트 `tests/live/live-api.test.ts`(13건)를 두었다. 시드 id가 바뀌면 이 파일의 상수를 맞춘다.
- ② `run_dev_api.ps1`로 띄운 서버와 proxy 연동: **문제 없음**. FE는 서버를 직접 띄우지 않았고 backend 세션이 띄운 서버를 사용했다. proxy 경유 `/api/v1/me`, 자산 목록·상세를 브라우저에서 확인했고 `localhost`와 `127.0.0.1` 모두 응답한다.
- ③ R-FE-13 답변 확인: **수용, 정적 폼에 반영 완료**(R-FE-13 `[x]`).

## BE-REQ-013 · 계약 0.3.0(제품·재료, `/me` status) FE 확인
main 병합(`00cf26e`) 직후 `contracts/CHANGELOG.md` 0.3.0과 `04 §3.3`을 읽고 FE 모델과 대조했다. 계약 0.3.0으로 생성 타입을 재생성했고 기존 코드는 호환 추가라 `/me` fixture 3곳(필수 `status`)만 컴파일 단계에서 걸러졌다.
- ① **FE 모델과 어긋나는 점**(제품 화면은 아직 정적 예시이고 FE-01d 이후 연동):
  1. 제품 `notes`(nullable) 필드가 FE `ProductView`에 없다 → 연동 때 추가.
  2. FE 제품 상세·목록에 있는 **공정 버전 요약**(`versions[]`, "최신 공정 버전")은 0.3.0 API에 없다(공정 CR 이월, 예상된 것) → 연동 모드에서는 해당 열·표를 "공정 계약 필요"로 바꾼다. 정적 예시와 섞어 보여 주지 않는다.
  3. `specification` 최대 4000자·빈 문자열 422·`null`=미정은 FE 규칙과 일치한다. 4000자 검증은 연동 때 추가.
  4. 제품 목록 기본 정렬이 `code`(자산은 `sort_order`)라서 화면별 기본 정렬을 따로 둔다.
  5. 재료 화면은 FE에 없다. `default_spec`의 `known` ↔ `value` 어댑터(개수는 JSON 정수, 길이·중량은 decimal 문자열, `unknown` 기본값)는 재료 화면을 만들 때 둔다. `default_spec` 형식(`known`/`unknown`/`not_applicable`·개수 JSON 정수)은 FE 단위 규칙과 **일치**한다.
- ② 제품 목록에 공정 요약이 없어도 FE-01 순서에 **문제 없다**(위 2번).
- ③ "다음 개발 진행"을 CR 승인으로 해석한 데 **반대 의견 없다.** 사용자의 승인 기록은 `contract-status.json`의 `approval_record`가 정본이므로 backend가 정확히 남겨 주길 바란다.
- 반영한 것: `/me.projects[].status` → 전환 메뉴에서 보관 프로젝트를 "(보관됨)"으로 표시(제외하지 않음).
- **제품 연동 반영(FE-01e, 2026-10-26):** ① `notes`(nullable) 추가·편집, 4000자 검증 추가 ② 제품 목록의 공정 요약은 0.4.0의 `latest/current_process_version`으로 표시(0.3.0에는 없었음), API 모드에서는 정적 공정 화면 링크를 열지 않음 ③ 기본 정렬 `code`(자산은 `sort_order`)는 화면별로 따로 둠 ④ `include_archived`는 "보관된 제품 포함" 체크로 노출. 재료 화면은 아직 없어 `default_spec` 어댑터는 재료 화면을 만들 때 둔다.
- 0.3.1(`/me.projects[].timezone`) 반영 확인: FE-01d에서 생성 타입을 재생성하고 시간대를 `/me`에서 읽는다(R-FE-14 `[x]`). 이 항목의 "남은 요청"(0.3.0 어긋남 대조)은 위 ①~③으로 답했다.

## BE-REQ-014 · 개발 API 서버 연결 확인
- **연결 정상.** `GET /api/v1/health`가 `{"data":{"status":"ok"}}`이고 Vite proxy(`DEV_DEBUG_USER` 셸 환경변수) 경유 `/me`·자산 API를 브라우저와 실서버 테스트로 확인했다.
- 실서버 검증: 읽기 전용 13건(`tests/live/live-api.test.ts`) + **쓰기 7건**(`tests/live/live-write.test.ts`, `LIVE_WRITE=1`일 때만 실행). 쓰기 검증은 공유 개발 DB를 바꾸므로 범위를 좁혔다: 시험 데이터 자산 **`EQ-025` 하나**에 `PATCH`만 하고 마지막에 원래 값으로 되돌렸다(원복 확인: 메모·모델 비어 있음). 부작용은 그 자산의 `row_version`이 1→5로 오른 것과 `updated_at` 변경뿐이다. **삭제 endpoint가 없어 흔적이 남는 자산 생성(POST)은 실서버로 실행하지 않았다**(가짜 서버로만 검증, 본문 타입은 생성 타입으로 컴파일 검사).
- 서버는 backend 세션이 살아 있는 동안만 보장되는 점을 확인했다. 멈추면 이 파일에 적겠다.

## BE-REQ-015 · 공정 버전·그래프 CR(be04) FE 의견
[CR be04](../change-requests/CR-backend-20261023-be04-process-versions.md) §5(13항목)와 §6을 읽고 FE 정적 공정 화면(`processView.ts`)과 대조했다. **구현은 CR 승인 전이라 하지 않았다.** 요약: 13항목 모두 FE 쪽 변경으로 흡수할 수 있고 계약 해석이 다르다고 보는 항목은 없다(#7만 제약 조건이 붙는다).
- **(a) `assumed` 단계 상태: 동의.** 마스터 공정 버전은 확인된 사실만 담고 가정은 시나리오 입력이어야 한다(03 §2). FE 단계 상태에서 `assumed`를 제거하고 필드 단위 `confirmed|unknown|not_applicable`로 바꾼다. 단계 요약 배지는 서버 `issues`에서 파생해 표시만 한다. 가정을 입력받는 화면은 시나리오 단계에서 새로 설계한다.
- **(b) 직선 표 ↔ 그래프 어댑터: 동의(편의 `steps[]` endpoint 없음).** 조건 두 가지: ① **직선(operation → buffer → operation)이 아닌 그래프(join·supply·분기·다중 buffer·precedence)는 FE가 표로 저장하지 않는다.** `PUT graph`가 전체 교체라서 표가 표현하지 못하는 노드·간선을 조용히 지우게 되기 때문이다. 이런 버전은 읽기 전용 표시 + "그래프 편집은 후속 화면"으로 안내한다. ② 노드·간선 id는 FE가 UUID로 만들어 보내고 `node_key`는 UUID 기반으로 만든다. 응답이 임시 key↔서버 id 대응을 돌려주는지, `node_key`의 허용 형식·길이를 계약에 명시해 주길 부탁한다.
- **(c) 값 표현 `{mode: unknown|known|not_applicable, value}`: 동의.** 자산 용량의 `finite`↔`value` 어댑터와 같은 방식으로 FE 어댑터가 `known`↔`value`를 변환한다. 공정 값에는 `unlimited`·`not_allowed`가 없다는 것도 확인했다(노동자 무제한은 `resource_kind=worker`+`capacity_mode=unlimited`).
- **(d) 추가 입력 필드: 화면에 넣을 수 있고, 우선순위는 다음과 같다.** (1) `parallel_streams`·`basis`·`output_schedule`(미정이면 full run 차단, 멀티신선 대표 케이스) — 먼저. (2) `quantity_basis`(작업당 vs 총 계획 수량 혼동 방지)·`required_count`·후보별 `eligibility_status`(OPEN-001) — 그다음. (3) `precondition_delay`(점유 여부 포함, AL 싱글-12 케이스)·`unit_form` — 그다음. (4) `accounting_mode`(표시)·`operation_type`/`handler_version`·`input/handoff/residual/execution_rule` — 04a에서는 구조만 저장하고 값 입력은 후속, FE는 읽기 전용 표시. 새 입력 패턴(규칙 판별 객체 선택)이 필요하면 자산 규칙과 같은 `PortRuleInput` 방식으로 CR-frontend를 먼저 올린다.
- **(e) 04a만 승인해도 FE 공정 표 연동이 가능하다.** 단 다음이 함께 와야 한다: `GET /products`의 `latest_process_version`(#13, 제품 목록의 "최신 공정 버전" 열), 서버 `issues`의 `entity_id`+`field_path` 계약(FE는 이미 순서 번호 경로를 쓰지 않도록 준비), 새 초안 409 `PROCESS_DRAFT_EXISTS` 처리(자산의 `REVISION_DRAFT_EXISTS`와 같은 UX 재사용). 단계 `PATCH`는 버전 단위 ETag이므로 같은 버전의 단계 수정은 직렬화되어, FE는 단계 저장을 버전 단위 충돌(412)로 처리한다(용량 버전과 같은 병합 UX).
- 부가 의견: ① 자산 버전과 같은 전이·권한(제출 admin·editor, 승인·반려 admin)에 **동의**. ② 승인 시 남은 `issues`가 막지 않는 것(자산과 동일)에 동의하며 FE는 경고를 승인 대화에서 요약해 보여 준다. ③ §5 말미의 배출 규칙 어휘 불일치(03 §7 vs 07 §6~7)는 FE UI 라벨(`ruleLabels.ts`)이 03 §7 코드값을 따르고 있으므로, 어휘를 바꾸는 계약 변경이 생기면 라벨 매핑 한 곳만 바뀐다(코드값 변경은 자산 규칙 화면의 선택지에 영향이 있어 CR로 알려 주길 바란다).

## BE-REQ-016(FE 자체 기록) · FE-01d 구현 결과 요약
Backend 요청 항목은 아니며 BE-REQ-001 #9·R-FE-05·확장 제안 CR의 구현 결과를 공유한다. 상세는 `docs/handoffs/HANDOFF-frontend-2026-10-23-FE-01d.md`.
- 버전(용량·규칙) 쓰기를 자산 기본 정보와 **별도 ETag·충돌·저장**으로 연결했다: `PATCH /asset-revisions/{id}`(바꾼 포트·필드만, 규칙은 판별 객체 전체), `submit`·`approve`·`reject`(반려 사유 필수 대화상자, 1~1000자), `POST /assets/{id}/revisions`(새 초안, 버전이 없으면 "용량 설정 시작").
- 서버 계약대로 처리한 것: 초안만 수정(409 `VERSION_IMMUTABLE`은 화면을 서버와 맞춤), 열린 버전 하나(409 `REVISION_DRAFT_EXISTS`는 열린 버전으로 이동), 반려는 `in_review → draft`(사유가 작성자에게 표시), 승인은 남은 issues로 막지 않음, PATCH 422의 `/ports/{i}`는 **요청 본문의 ports 순서**로 해석.
- **Backend에 알리는 점:** (1) 위 동작은 가짜 서버(생성 타입으로 검증)로만 확인했고 **실서버 쓰기 검증은 하지 않았다** — 버전 쓰기는 삭제 endpoint가 없어 공유 개발 DB에 흔적(row_version·상태 전이)이 남는다. 허락을 받으면 시험 데이터 자산 하나(예: `EQ-008`)로 최소 범위만 실행하겠다. (2) 제출은 검증 오류가 있어도 가능하다는 계약 설명을 그대로 따랐다(화면은 서버 `issues`를 표시만 한다).

## BE-REQ-017(FE 자체 기록) · FE-01e 구현 결과 요약
Backend 요청 항목은 아니며 계약 0.4.0 반영과 제품 연동 결과를 공유한다. 상세는 `docs/handoffs/HANDOFF-frontend-2026-10-26-FE-01e.md`.
- **계약 0.4.0 반영:** 생성 타입을 재생성했고 기존 코드는 호환(컴파일 오류 없음). 공정 API는 아직 화면에 연결하지 않았다.
- **제품 연동:** 목록(검색 `q`·정렬 `code|name`·`include_archived`·cursor), 상세, 생성 `POST`, 수정 `PATCH`(바꾼 필드만, 규격 미정=`null`, 메모 비움=`null`, 빈 문자열은 보내지 않음, If-Match=편집 시작 버전, 412 항목 단위 병합, 409 `PRODUCT_CODE_CONFLICT`/422 필드 연결). 자산 기본 정보와 같은 규칙이다.
- **FE 버그 수정 1건(알림):** FE의 오류 분류가 `PRODUCT_CODE_CONFLICT`·`MATERIAL_CODE_CONFLICT`를 "코드 중복"으로 인식하지 못해 코드 필드 오류로 연결되지 않던 것을 고쳤다(가짜 서버 테스트로 발견). Backend 조치는 없다.
- **Backend에 알리는 점:** (1) 실서버 검증은 하지 못했다 — 작성 시점에 개발 서버(`127.0.0.1:8000`)가 응답하지 않았다. 읽기 전용 라이브 테스트 3건은 작성만 했고 **미실행**이다. (2) 개발 DB의 0004 적용 여부는 서버가 떠야 확인할 수 있다(`request-from-backend.md`는 PR 머지 전 Backend가 적용한다고 적었으나 이미 머지됨). 서버를 다시 띄웠으면 이 파일에 알려 주면 라이브 읽기 테스트를 실행한다. (3) **BE-REQ-015(공정 CR) `확인(BE)`가 아직 없다**: Backend는 FE 의견 전에 권장안으로 0.4.0을 구현했으므로, 내 답변(직선이 아닌 그래프는 표로 저장하지 않음, `node_key` 형식·임시 key↔id 대응 요청 등)이 0.4.0 구현과 어긋나는 곳이 있는지 알려 주길 바란다.

## BE-REQ-018(FE 자체 기록) · FE-02a 공정 연동 결과와 실서버 검증
Backend 요청 항목은 아니며 계약 0.4.0 공정 연동 결과를 공유한다. 상세는 `docs/handoffs/HANDOFF-frontend-2026-10-26-FE-02a.md`.
- **연결한 것:** 제품의 공정 버전 목록·새 초안(`POST`, 409 `PROCESS_DRAFT_EXISTS`는 열린 버전으로 이동), 버전·그래프 조회, **그래프 `PUT`(전체 교체)**, 단위 `PATCH`, 제출·승인·반려(반려 사유 대화상자), 검증(`knowledge`·`run_template`). 단계 편집은 단계 `PATCH`를 쓰지 않고 `PUT graph`로 저장한다(원자 저장·하나의 If-Match). 저장 순서는 단위 `PATCH` → 그래프 `PUT`이며 같은 버전 `row_version`을 이어 쓴다.
- **BE-REQ-015에서 FE가 답한 내용의 구현:** 마스터 공정에 `assumed` 상태 없음(필드 단위 미정만), 직선 표 ↔ 그래프 어댑터(직선이 아닌 그래프는 구조 편집을 막고 노드·간선을 받은 그대로 되돌려 보내 보존), 값 표현 `{mode, value}`↔화면 입력 어댑터, 추가 필드(`parallel_streams`·`basis`·`output_schedule`·`quantity_basis`·`precondition_delay`·`accounting_mode`·`required_count`·후보 `eligibility_status` 등)를 입력 UI로 제공. `edge.movement_rule`(이동 규칙)과 `residual_rule` 일부는 **보존만 하고 이 화면에서 편집하지 않는다**(별도 설계).
- **FE가 만들어 보내는 키 형식(실서버가 받아들임):** 노드 id·간선 id는 FE가 만든 UUID, `node_key`는 `src`·`sink`·`op-<uuid 앞 8자>`·`buf-<uuid 앞 8자>`, `edge_key`는 `e-<uuid 앞 8자>`. 서버가 받은 값은 그대로 보존한다. 형식 제약이 있으면 알려 주길 바란다(이전 답변의 요청 ②).
- **실서버 검증(사용자 허락, 2026-10-26, 개발 서버 `127.0.0.1:8000`):** 읽기 전용 라이브 테스트 **24건**(자산·제품·공정·화면 렌더) 통과, 쓰기 라이브 테스트 **16건** 통과(자산 EQ-025 7건 원복 + 공정 P-006 9건: FE가 만든 그래프 본문 수락·왕복 안정, 422 field_path 매핑, 428·412, 단위 PATCH(개수 JSON 정수), 검증, 제출 후 `VERSION_IMMUTABLE`, 조회자 403·비멤버 404, 반려, 화면 조작으로 저장·재저장(ETag 연쇄)·검토 요청·반려). **가짜 서버와 다른 동작은 발견하지 못했다.**
- **서버에 남은 흔적(삭제 endpoint가 없어 되돌리지 못함):** 프로젝트 A의 제품 **P-006에 공정 초안 v1 하나**(제출·반려를 되풀이해 `row_version`이 올라 있음, 단계 하나 "[FE 시험] …" 포함), 자산 EQ-025의 `row_version` 증가. **승인(`approve`)은 승인본이 되돌릴 수 없어 실서버에서 실행하지 않았다.**
- **Backend에 요청·질문:** (1) **BE-REQ-015 `확인(BE)`가 아직 없다**: FE 의견이 구현된 0.4.0과 어긋나는 곳이 있는지. (2) `approve` 실서버 검증을 원하면 전용 제품(예: P-007)을 알려 주세요. 승인본이 영구히 남으므로 사용자 허락 후 실행한다. (3) 제품의 공정 버전 목록은 `limit=200` 첫 페이지만 읽는다(제품당 버전 수가 그보다 많아질 가능성이 있으면 알려 주세요). (4) 개발 서버가 재기동·초기화되면 시드 id(제품 id가 UUID 난수)가 바뀔 수 있어 라이브 테스트는 제품을 **코드(P-001~)로 찾는다**.

## BE-REQ-019(FE 자체 기록) · FE-02b 공정 그래프 편집 결과와 실서버 검증
Backend 요청 항목은 아니며 계약 0.4.0 그래프 편집 구현 결과를 공유한다. 상세는 `docs/handoffs/HANDOFF-frontend-2026-10-26-FE-02b.md`.
- **구현:** 노드(시작·대기 공간·공정 단계·합류·완료 기준·끝)와 간선(물류·선후·공급)의 추가·수정·삭제, 간선 이동 규칙(`movement_rule`: 미정·사람이 정한 시간·경로망·직결 공급 + 이동 시간), 노드 표시 순서, 자동 배치 도식(좌표는 저장하지 않음). 직선이 아닌 공정(분기·합류)도 구조 편집을 허용한다(BE-REQ-015 FE 답변의 "그래프 화면은 후속"을 이행).
- **계약 규칙 준수:** 노드 삭제는 연결된 간선을 함께 지우며 앞뒤를 **자동으로 잇지 않는다**(삭제 전에 지워질 간선 목록을 보여 줌, 04 PUT graph 규칙 5). 직결 공급(`direct_feed`)도 이동 시간을 0으로 채우지 않는다(03 §7). 저장·도킹 공간은 시작·대기·끝 노드에만 지정하고 작업·합류에는 직접 지정하지 않는다. 되돌아가는(순환) 연결은 막지 않는다(서버가 경고 VAL-GRAPH-011). 물류 간선이 끝에서 나가거나 시작으로 들어오는 것, 자기 간선, 같은 연결의 중복은 저장 전에 클라이언트가 미리 막는다(최종 판정은 서버 422).
- **하지 않은 것(계약 미확정):** 합류(join) 입력 매칭 규칙(`input_match_policy`, 이월), 완료 기준 연결(`completion_node_id`, 04c), 간선 `condition_rule`·후보 `parameter_override`(이월), 화면 좌표 저장(04b `editor-state` 제안). 이들은 값을 건드리지 않고 받은 그대로 보존한다.
- **실서버 검증(사용자 허락, P-006 하나, 마지막에 원래 직선 구조로 복원):** FE가 만든 분기·합류·선후 간선·이동 규칙(사람이 정한 5분)·순환을 `PUT graph`가 **200**으로 받아들이고 서버가 돌려준 문서를 그대로 다시 보내도 변하지 않음(왕복 안정), 순환은 경고 `VAL-GRAPH-011`, 끝에서 나가는 물류 간선은 **422 `VAL-GRAPH-004`**이며 `field_path`(`/edges/{i}/…`, 요청 본문 기준)가 간선 id로 매핑됨, 화면 조작(합류 노드 추가 → 간선·이동 규칙 → 저장 → 삭제 → 저장)도 통과. 라이브 전체 **42건**(읽기 24·쓰기 18) 두 번 연속 통과.
- **알림:** 라이브 실행 중 개발 서버가 한 번 응답하지 않아(`ECONNREFUSED`) 테스트가 실패했다. 서버가 돌아온 뒤 P-006이 깨끗한(노드 4·간선 3) 상태인지 확인했고 정리할 것은 없었다. 서버 재기동 여부는 Backend가 아는 대로 알려 주면 된다.
- **서버에 남은 흔적:** P-006 공정 초안 v1 하나(저장·제출·반려 반복으로 `row_version` 증가, 같은 이름의 "[FE 시험] 단계"가 2개). `approve`는 여전히 실서버에서 실행하지 않았다.

---
## 변경 이력
| 날짜 | 작성자 | 내용 |
|---|---|---|
| 2026-10-23 | Frontend | 최초 작성(R-FE-01~12) |
| 2026-10-23 | Frontend | R-FE-13 추가 |
| 2026-10-23 | Frontend | Backend 답변(R-FE-01~12) 검토 반영, 상태 규칙 정리, Part 2에 BE-REQ-001~011 답변 작성 |
| 2026-10-23 | Frontend | FE-01a/b: 생성 타입(openapi-typescript, 계약 0.2.0)·공통 API 클라이언트·오류 변환·proxy, 읽기 API(`/me`, 프로젝트·자산 목록, 자산 상세·버전) 연결, 실서버 읽기 검증 13건. BE-REQ-004(사용자 결정)·012·013 답변, R-FE-14 추가, R-FE-02·03·04·08 반영 완료 기록 |
| 2026-10-23 | Frontend | FE 세션 시작 절차 이행: backend 커밋 `d0a9f38`의 R-FE-13 답변 확인 → `[x]`. FE-00h로 정적 화면을 0.2.0 구조에 정렬하고 BE-REQ-001 진행 현황 표 추가. 코드에 반영한 계약은 여전히 없음(client 미생성) |
| 2026-10-23 | Frontend | FE-01c: 계약 0.3.0으로 재생성(main 병합 확인), `/me.status` 반영(보관됨 표시), **자산 기본 정보 저장(PATCH)·자산 생성(POST) 연결**(바꾼 필드만 전송, 편집 시작 버전으로 If-Match, 412 후 필드 단위 병합, 409/422 필드 오류, 428·403·404·네트워크 단절 안내). 실서버 읽기 13건 + 쓰기 7건(EQ-025, 원복) 검증. BE-REQ-012·013(0.3.0 대조)·014 답변 갱신 |
| 2026-10-23 | Frontend | FE-01d: 계약 0.3.1로 재생성(`/me.timezone` 반영, R-FE-14 `[x]`), **버전 용량·규칙 저장(PATCH)·제출·승인·반려(사유 대화상자)·새 초안·용량 설정 시작 연결**(별도 ETag·412 항목 단위 병합·409 VERSION_IMMUTABLE/REVISION_DRAFT_EXISTS·422 포트 매핑). BE-REQ-015(공정 CR be04) FE 의견 답변, FE-01d 구현 요약 기록. 실서버 쓰기 검증은 미실행(허락 대기) |
| 2026-10-26 | Frontend | FE-01e: main 병합(FE-01c·01d, PR #19) 확인, 계약 0.4.0으로 재생성(호환), **제품 목록·상세·생성·수정 연결**(자산 기본 정보와 같은 저장·충돌·오류 규칙), 오류 분류에 `PRODUCT/MATERIAL_CODE_CONFLICT` 추가. BE-REQ-013에 제품 연동 반영 기록, FE-01e 요약 기록. 개발 서버 무응답으로 실서버 검증 미실행 |
| 2026-10-26 | Frontend | FE-02a: 공정 연동(버전 목록·새 초안·그래프 PUT·단위 PATCH·전이·검증), 정적 공정 화면을 계약 0.4.0 모델로 교체, `PUT` 클라이언트·`PROCESS_DRAFT_EXISTS` 분류 추가. **실서버 읽기·쓰기 라이브 검증 통과**(P-006 초안 하나에서만 쓰기, 승인은 미실행). 상태 표·BE-REQ-018 기록 |
| 2026-10-26 | Frontend | FE-02b: 공정 그래프 편집(노드·간선·이동 규칙·표시 순서, 자동 배치 도식), 직선이 아닌 공정의 구조 편집, 삭제 영향 확인, 실서버 분기·합류·순환·이동 규칙 저장 검증(P-006). 상태 표·BE-REQ-019 기록 |
