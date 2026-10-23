# Frontend → Backend 요청·확인 목록 (+ Backend 요청 BE-REQ에 대한 FE 답변)

작성: Frontend 세션 / 최초 작성 2026-10-23 / **최종 갱신 2026-10-23 (FE-00h: 정적 화면을 계약 0.2.0 구조에 정렬한 뒤)**
짝 파일: `request-from-backend.md` (Backend가 작성). 기준: origin/main `607d8a7`(계약 0.2.0 병합 포함).

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
| FE가 **코드에 반영한** 계약 | **없음.** 화면은 모두 정적 예시 데이터이며 generated client·API 호출·Mock이 없다. 반영할 때마다 이 표에 `contract_version`/`openapi_sha256`을 적는다(BE-REQ-002) |
| 화면 모델 기준 | **정적 화면은 계약 0.2.0 구조로 정렬됨(FE-00h)**: 자산 기본 정보와 버전을 별도 모델·별도 저장 섹션으로 분리, 설비 포트별 용량, 용량 `value`↔`finite` 어댑터(`capacityAdapter.ts`), `superseded` 상태. 데이터는 승인 예제 모양의 **정적 예시**이며 API 응답이 아니다. 어댑터·뷰 모델은 손으로 쓴 타입이라 생성 client가 생기면 교체한다 |
| 구현된 정적 화면 | 프로젝트 목록·만들기, 설비·공간 목록·상세(기본 정보/버전/포트별 용량·규칙 읽기 전용/이력), 제품 목록·상세, 공정 표 편집(초안 UI) |
| 다음 FE 작업 | **사용자 결정 대기:** API 서버 실행 주체(BE-REQ-004), client 생성 도구 승인(FE-01a). 결정 후 FE-01a → 01b~d. 그전: 규칙 입력·사유 입력 확장 제안 `CR-frontend-20261023-fe-rule-ui-and-reason-dialog` 검토 |

---

# Part 1. Frontend → Backend 요청 (R-FE)

Backend 답변 본문은 `request-from-backend.md` Part 2에 있다(2026-10-23, R-FE-01~12). 아래는 FE의 검토 결과다.

## P1

- [x] **R-FE-01 OpenAPI 후보 전달과 계약 승인 일정**
  - Backend 답변: 승인 완료, `contracts/openapi.json` 정식 스냅샷, contract 0.2.0 (backend 파일 R-FE-01).
  - FE 확인(2026-10-23): 수용. `contracts/openapi.json`·`contract-status.json`·`CHANGELOG.md`·`examples/first-scope`가 origin/main에 병합된 것을 확인했다. client는 이 스냅샷의 hash로 생성하고 위 표에 기록한다. 반영 작업: FE-01a.

- [x] **R-FE-02 로컬 개발 연결: 인증 헤더, CORS, 시드**
  - Backend 답변: Vite proxy 권장, CORS 미구현, 시드 실행 완료(backend 파일 R-FE-02).
  - FE 확인: 수용. `DEV_DEBUG_USER`는 `VITE_` 접두사 없이 셸 환경변수로 두고 `vite.config.ts` proxy에서만 읽는다(번들에 사용자 id 미포함). CORS 미들웨어는 **요청하지 않는다**. 헤더 이름은 proxy 설정 한 곳에 둔다. 서버 기동 주체는 BE-REQ-004에서 이어서 정한다. 반영 작업: FE-01a.

- [x] **R-FE-03 프로젝트 전환 UI의 데이터 출처와 역할 값**
  - Backend 답변: `/me.projects` 사용 가능(상한·페이지 없음), 역할 잠정 목록, 프로젝트 `status`는 `active|archived`(현재 모두 active), `/me`의 projects에는 `status`가 없음(backend 파일 R-FE-03).
  - FE 확인: 수용. 전환 메뉴는 `/me.projects`로 구성한다. 역할 표시 라벨(표시용, 서버 403이 정본): admin=관리자, editor=편집자, viewer=조회자; 조직 admin=조직 관리자, member=조직 구성원. 모르는 역할 문자열은 원문을 그대로 표시한다. **역할 라벨·버튼 노출 판정(`canEdit`/`canApprove`)은 FE-00h에 정적 화면에 반영함**(조회자는 입력 읽기 전용·작업 버튼 숨김, 편집자는 검토 요청만, 승인·반려는 관리자만). **후속 요청:** `/me.projects[]`에 `status`를 추가하는 소규모 보강을 **찬성**한다(보관된 프로젝트를 메뉴에서 구분/제외하기 위해). 우선순위 의견은 BE-REQ-010 답변. 반영 작업: FE-01b.

- [x] **R-FE-04 오류 코드·`field_path` 규칙**
  - Backend 답변: 코드·HTTP 표, `field_path`는 본문 기준 JSON Pointer, 쿼리·헤더 오류는 이름만(backend 파일 R-FE-04).
  - FE 확인: 수용. 오류 변환 계층은 위 표의 code를 열거형으로 두고 모르는 code(`HTTP_ERROR` 포함)는 일반 오류로 표시하며 `request_id`를 보여 준다. `PRECONDITION_REQUIRED`(428)는 FE 버그 신호라 사용자에게 노출하지 않고 로깅한다. 쿼리 오류(`/limit`, `/cursor` 등)는 endpoint 문맥으로 본문 필드와 구분한다. **FE 가정 하나:** 경로의 UUID 형식 오류(422)는 사용자에게는 "찾을 수 없음"과 같은 화면으로 처리한다. 다르게 처리해야 하면 알려 주세요. 반영 작업: FE-01a.

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
  - FE 확인: 수용. 기본 50/최대 200, 필터·정렬·프로젝트가 바뀌면 cursor 폐기(422 `INVALID_CURSOR`에 대비해 폐기하지 않은 경우 첫 페이지로 재요청), `total` 없음·이전 페이지 없음 → "더 보기" 방식. 반영 작업: FE-01b.

## P2 (추가)

- [x] **R-FE-13 프로젝트 생성 폼의 서버 규칙**
  - 배경: FE는 `ProjectCreate`(organization_id, code ≤64, name ≤200, timezone ≤64, description ≤4000·빈 문자열 불가)에 맞춰 정적 생성 폼을 만들었다. 설명을 비우면 필드를 보내지 않는 방식으로 가정했다.
  - 요청: (1) `organization_id` 선택지의 출처가 `/me.organizations`인지(R-FE-03 답변으로 "조직 admin만 프로젝트 생성"은 확인됨, 선택지에 admin 조직만 보여도 되는지). (2) `code` 고유 범위가 조직 안인지 전체인지(409 문구에 반영). (3) `timezone`이 IANA 이름 검증을 받는지, 잘못된 값의 응답(422 `field_path`). (4) 설명 비움은 필드 생략과 `null` 중 어느 쪽을 기대하는지. (5) 생성 응답의 `Location`·ETag 사용 방식.
  - FE 임시 가정: 선택지는 `/me.organizations` 중 role=admin인 조직, 설명은 비우면 생략, 시간대는 자유 입력, 서버가 최종 검증.
  - Backend 답변: `request-from-backend.md` Part 2 R-FE-13(2026-10-23, 커밋 `d0a9f38`): (1) `/me.organizations`, role=admin만, 선택지가 없으면 안내 / (2) 코드는 조직 안에서 유일, 409 `PROJECT_CODE_CONFLICT`의 `field_path=/code` / (3) IANA 검증, 422 `/timezone` / (4) 설명은 생략·null 동일(입력 없음), 빈 문자열 422 / (5) 201 + 전체 `ProjectOut`(`row_version:1`) + `ETag` + `Location`, 생성자는 project admin 자동 등록 → 생성 후 `/me` 재조회.
  - FE 확인(FE-00h): 수용. **정적 폼에 반영함:** 조직 선택지는 role이 admin인 조직만(구성원 조직은 숨김), 선택 가능한 조직이 없으면 "프로젝트를 만들 권한이 없습니다" 안내, 시간대는 브라우저 `Intl`로 IANA 이름 검증, 설명은 비우면 생략. 연동 시 할 일(FE-01b): 409의 `/code` 오류를 코드 필드에 표시, 생성 응답 본문을 재조회 없이 사용, 생성 직후 `/me`를 다시 불러 전환 메뉴 갱신. 확인 필요 없음.

## P3

- [x] **R-FE-09 프로젝트 색·표시 속성**
  - FE 확인: 수용. 서버에 색을 두지 않으므로 **프로젝트 id의 해시로 결정적으로 색(4색)을 고른다. 반영 완료(FE-00h, `accentFor`)** — 목록 순서가 바뀌어도 같은 프로젝트는 같은 색이다(테스트 있음). 이름·코드는 항상 함께 표시한다. 프로젝트 id 대신 **프로젝트 코드**를 경로·전환 메뉴에 표시한다(`useCurrentProject`).

- [x] **R-FE-10 단위 코드 목록과 차원 규칙**
  - FE 확인: 수용. 용량 단위는 `item|bobbin_slot|pallet_slot|kg|m2`만 사용(FE `CAPACITY_UNITS`와 일치). `bobbin`, `strand`, `m`, `min`, `m_per_min`은 공정 화면의 임시 단위이며 용량에 쓰지 않는다. `INVALID_UNIT`은 쓰지 않고 `VALIDATION_ERROR`의 `field_path`로 매핑한다. item 외 단위 경고는 서버 `issues[]`의 `VAL-CAP-002`를 정본으로 한다(현재 FE 자체 경고는 연동 시 제거). 공정 단위는 공정 CR에서 확정 대기.

- [~] **R-FE-11 보관(archive)·복사 기능 일정**
  - Backend 답변: 일정 미정, 보관된 항목에 대한 쓰기는 409 제안(backend 파일 R-FE-11).
  - FE 확인: 제안(보관 항목 쓰기 409) 동의. 일정은 BE-REQ-010 #4로 이어진다.

- [x] **R-FE-12 Idempotency-Key 적용 범위**
  - FE 확인: 수용. 생성 POST는 저장 중 버튼 비활성, 409 `*_CODE_CONFLICT`는 "코드 중복" 표시. 네트워크 단절 뒤 재시도의 409는 `q=<code>`로 재조회해 "이미 만들어졌는지" 확인하는 흐름을 둔다. 버전 제출·승인·반려는 `If-Match`로 보호됨을 확인. 반영 작업: FE-01b·d.

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
- 현재 FE 코드가 반영한 계약: **없음**(위 "FE 현재 상태" 표). 읽은 최신 계약은 0.2.0 / `da54371140…c2a33a`.
- 앞으로 client를 생성·재생성하거나 계약 변경을 반영할 때마다 이 파일의 표와 FE 인계 문서에 `contract_version`과 `openapi_sha256`을 적는다. 세션 시작 시 `contract-status.json`과 비교한다.

## BE-REQ-003 · 자산 기본 정보와 용량(버전)의 저장 UX
- **FE 결정: 섹션별 저장.** 화면의 "기본 정보"와 "용량·규칙(버전)"이 각각 저장 버튼·변경 표시·충돌 알림을 가진다. 한 버튼으로 두 요청을 보내지 않는다.
- 이유: 두 리소스의 ETag·충돌이 독립이라 부분 실패를 사용자에게 설명할 필요가 없어지고, 한쪽 충돌이 다른 쪽 입력을 지우지 않는다. 화면 이동 보호(미저장 변경)는 두 섹션 중 하나라도 변경이면 동작한다.
- 합성 endpoint 요청: **없음**(CR 불필요).

## BE-REQ-004 · API 서버 실행 주체와 CORS
- ② **Vite proxy로 충분하고 CORS는 필요 없다.** CORS 미들웨어는 구현하지 않아도 된다(R-FE-02 답변과 동일).
- ① 서버 실행 주체: FE는 `backend/**`를 수정하지 않고 실행만 할 수 있다. **FE 제안:** Backend가 상시 띄우지 않고, 연동 작업 때 사용자가 `backend/README.md`의 명령으로 한 번 띄운다(또는 사용자가 허용하면 FE 세션이 띄운다). 개발 DB 연결과 프로세스 기동이 걸려 있어 **사용자 결정이 필요**하다. 결정이 나기 전에는 FE가 서버를 기동하지 않는다.

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

---

## 변경 이력
| 날짜 | 작성자 | 내용 |
|---|---|---|
| 2026-10-23 | Frontend | 최초 작성(R-FE-01~12) |
| 2026-10-23 | Frontend | R-FE-13 추가 |
| 2026-10-23 | Frontend | Backend 답변(R-FE-01~12) 검토 반영, 상태 규칙 정리, Part 2에 BE-REQ-001~011 답변 작성 |
| 2026-10-23 | Frontend | FE 세션 시작 절차 이행: backend 커밋 `d0a9f38`의 R-FE-13 답변 확인 → `[x]`. FE-00h로 정적 화면을 0.2.0 구조에 정렬하고 BE-REQ-001 진행 현황 표 추가. 코드에 반영한 계약은 여전히 없음(client 미생성) |
