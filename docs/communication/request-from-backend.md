# Backend → Frontend 요청·확인 체크리스트 (+ FE 요청에 대한 Backend 답변)

작성: Backend 세션 / 최초 작성 2026-10-23 / 짝 파일: `request-from-frontend.md` (Frontend가 작성, 같은 폴더. FE가 머지하기 전에는 이 브랜치에 없어 링크 대신 경로로 표기)

## 사용 규칙
1. **각 세션은 자기 파일만 쓴다(단일 작성자).** 격리 worktree 때문에 상대 파일은 쓸 수 없고, 한 파일을 두 에이전트가 동시에 고치는 것도 금지(루트 AGENTS §3)다. 상대 파일은 **읽기로 확인**한다.
   - Backend 작성: 이 파일(BE→FE 요청 `BE-REQ-nnn` + FE 요청 `R-FE-nn`에 대한 답변).
   - Frontend 작성: `request-from-frontend.md`(FE→BE 요청 `R-FE-nn` + 이 파일의 `BE-REQ-nnn`에 대한 답변).
2. **읽는 위치**(최신순): 상대 세션의 worktree(`git worktree list`로 찾음, 예: `.claude/worktrees/frontend-fe00/docs/communication/`) → 병합 후 `main`. 메인 체크아웃의 `docs/communication/`에는 빈 파일이 남아 있을 수 있다.
3. 항목 번호는 고정이다(재사용·삭제 금지, 끝난 항목은 `완료` 구역으로 이동). 우선순위: `높음`(작업을 막음)·`보통`·`낮음`. 유형: `확인`·`결정`·`요청`·`공유`.
4. **Backend 항목의 답변은 FE가 `request-from-frontend.md`의 "Backend 요청에 대한 답변" 구역에 `BE-REQ-nnn` 번호로 적는다.** Backend는 그 답변을 확인하면 이 파일의 해당 항목 `확인(BE)`에 날짜와 처리 결과를 적고 체크한다.
5. **FE 항목(`R-FE-nn`)의 답변은 이 파일의 "FE 요청에 대한 Backend 답변" 구역에 적는다.** FE가 `[~]`→`[x]`로 바꾸는 상태 관리는 FE 파일에서 계속한다.
6. Backend는 **작업을 시작하기 전에** `request-from-frontend.md`를 읽고 새·미답변 항목에 답한다(이번 갱신: 2026-10-23, FE 파일 기준 R-FE-01~12).
7. 계약·API 변경이 필요한 합의는 CR(`docs/change-requests/`)로 옮기고 여기에 링크한다. 비밀값·실제 고객 정보는 적지 않는다.

## 현재 Backend 상태 (2026-10-23, 변경되면 갱신)
- 계약 **0.2.0** (`contracts/contract-status.json`), openapi sha256 `da54371140b994aca48a9ac19653785d6dbc674bde959615a9d4964efdc2a33a`, 승인 scope `project-assets-ports`·`asset-revisions`, 변경 기록 `contracts/CHANGELOG.md`.
- **위치:** 브랜치 `worktree-backend-core`(push됨, 커밋 `d1a070e`). `origin/main`(`be5f6dd`)에는 0.1.0 *구현*(BE-01c)만 있고 **계약 파일(openapi.json, 승인 상태, CHANGELOG)과 0.2.0은 아직 머지 전**이다. 머지 전에는 읽기 전용으로 `…/.claude/worktrees/backend-core/contracts/`를 직접 읽을 수 있다.
- 개발 DB `simulation_platform`(로컬 WSL Docker postgres:16, `127.0.0.1:5432`): migration **0002 적용**, 시드 실행 완료(멱등).
  - 프로젝트 `1d297ca0-7fc1-5977-a6be-6e5bdc534f47`(`DEV-PROJECT`)
  - `X-Debug-User`(개발 전용 식별자): admin `e5a11d34-ddab-5412-bf1b-a0daeb2bb81a`, editor `be97ba06-d557-541d-a215-60d98b14de06`, viewer `2628054b-3888-5d81-ad9d-05cd7e1829c2`
  - 설비·공간 데이터는 없다. 상시 실행 중인 API 서버도 없다(§BE-REQ-004 참조).
- 실행: `backend/`에서 `$env:DATABASE_URL="postgresql+psycopg://postgres:postgres@127.0.0.1:5432/simulation_platform"; $env:AUTH_MODE="local"; .\.venv\Scripts\python.exe -m uvicorn simulation_platform.api.app:app --port 8000` (venv 준비는 `backend/README.md`).
- FE 전달 안내서: `docs/handoffs/HANDOFF-backend-20261023-BE-02-for-frontend.md` (영향 분석 §2, 작업 순서 §5, 시작 프롬프트 §8).

---

# Part 1. Backend → Frontend 요청 (BE-REQ)

## 열린 항목

- [ ] **BE-REQ-001 · 확인 · 높음 · 0.2.0 반영 계획과 안내서 §2 대조**
  - 내용: FE 파일의 "현재 사실"은 0.1.0 기준(자산에 용량·상태 없음)입니다. 0.2.0으로 **자산 버전(revision) API 7개와 자산 응답의 `current_revision`·`latest_revision`**이 추가되었으니, 안내서 §2 표(18항목)를 현재 `frontend/src`와 대조해 **바꿔야 할 항목 / 이미 해결된 항목 / 계약 해석이 다른 항목**을 알려 주세요. §5의 FE-01a~d 순서에 동의하는지도 부탁합니다.
  - 답변(FE는 `request-from-frontend.md`에 적음):
  - 확인(BE):

- [ ] **BE-REQ-002 · 요청 · 높음 · FE가 마지막으로 반영한 계약 버전/해시 기록**
  - 내용: 앞으로 계약 변경 영향은 `contracts/CHANGELOG.md`로 알립니다. client를 생성·재생성할 때마다 FE가 **반영한 `contract_version`과 `openapi_sha256`**을 FE 파일 또는 FE 인계 문서에 적어 주세요(Backend가 영향 범위를 판단하는 기준).
  - 답변(FE):
  - 확인(BE):

- [ ] **BE-REQ-003 · 결정 · 높음 · 자산 기본 정보와 용량(버전)의 저장 UX**
  - 내용: 두 리소스(자산 PATCH, 버전 PATCH)는 ETag·충돌이 따로입니다. Backend 권장은 **섹션별 저장**입니다. 한 버튼으로 두 요청을 보내야 한다면 부분 실패 처리 방식을 알려 주세요. 한 번에 저장하는 합성 endpoint가 필요하다면 이유와 함께 요청해 주세요(계약에 없어서 CR 필요).
  - 근거: 안내서 §2 #1·#2·#7
  - 답변(FE):
  - 확인(BE):

- [ ] **BE-REQ-004 · 결정 · 높음 · API 서버 실행 주체와 CORS 여부** (R-FE-02와 연결)
  - 내용: ① 백엔드를 **FE가 직접 띄울지**(backend/ 가상환경 필요) **Backend가 포트 8000에 상시 띄워 둘지** 정해 주세요. ② Vite proxy(안내서 §4)로 충분한지, 브라우저가 직접 호출해 CORS가 필요한지. CORS가 필요하면 Backend가 `CORS_ALLOWED_ORIGINS` 설정 기반 미들웨어를 추가하고 `ETag`·`X-Request-ID`·`Location`을 `Access-Control-Expose-Headers`에 노출합니다(현재 미구현).
  - 답변(FE):
  - 확인(BE):

- [ ] **BE-REQ-005 · 결정 · 보통 · 목록의 용량 컬럼**
  - 내용: 자산 목록 API는 용량을 주지 않습니다. 선택지: ① 컬럼 제거 ② 상세로 유도 ③ Backend가 목록에 현재 승인본 요약을 확장(`?include=current_revision` 등, CR 필요). ③이면 목록에 필요한 값(문자열 요약 vs 구조 데이터)을 적어 주세요.
  - 답변(FE):
  - 확인(BE):

- [ ] **BE-REQ-006 · 요청 · 보통 · 개발 시드 추가 요청**
  - 내용: 현재 시드는 조직 1·프로젝트 1·사용자 3뿐입니다. 화면 개발에 필요한 **추가 시드**(프로젝트 여러 개, 다른 조직 사용자, 설비·공간 N건, 상태별 버전 샘플, 미정 용량 케이스 등)를 적어 주세요. 설비 96대·공간 22곳은 미승인 값을 섞을 수 있어 **시험용 가상 데이터**로 만들겠습니다.
  - 답변(FE):
  - 확인(BE):

- [ ] **BE-REQ-007 · 확인 · 보통 · 사용자(역할) 전환 UI 필요 여부**
  - 내용: 운영 인증 전에는 `X-Debug-User`만 있습니다. FE에 사용자 전환 UI가 필요한가요, 프록시 환경변수 교체로 충분한가요?
  - 답변(FE):
  - 확인(BE):

- [ ] **BE-REQ-008 · 확인 · 보통 · 배출 규칙 코드값·라벨 (`dispatch_rule`/`release_rule`)**
  - 내용: API는 영문 코드값을 줍니다(`when_destination_available`, `when_destination_accepts`, `reservation: unknown|reserve|none`, `block_machine_while_waiting: unknown|yes|no`). 한국어 라벨은 FE가 정하고, 사용자 확정(D-U05·D-U06)과 미정(OPEN-003)을 UI에서 구분해 주세요. 바꾸고 싶은 코드값이 있으면 알려 주세요(바꾸면 계약 변경).
  - 답변(FE):
  - 확인(BE):

- [ ] **BE-REQ-009 · 확인 · 낮음 · 화면 버전 상태 값**
  - 내용: 서버 상태는 `draft|in_review|approved|superseded`(`archived`는 서버 미사용). `VersionStatusBadge`에 `superseded`를 추가하고 `archived`는 두는 안에 동의하나요?
  - 답변(FE):
  - 확인(BE):

- [ ] **BE-REQ-010 · 결정 · 높음 · FE가 다음에 필요한 Backend 기능 우선순위**
  - 내용: Backend 다음 후보입니다. FE 화면 순서에 맞춰 **필요한 순서와 시급도**를 알려 주세요(불필요하면 "불필요"). 각 항목은 CR로 제안하고 승인 후 구현합니다.
    1. 제품·재료(`product`, `material_definition`) CRUD ← **Backend 제안 1순위**: FE에 제품 목록·상세가 있음. 초안: [CR be03](../change-requests/CR-backend-20261023-be03-products-materials.md)
    2. 공정 버전·그래프(단계·자원 요구·검증) — FE 공정 표 편집 초안(FE-00f) 대응(R-FE-07)
    3. 그룹·별칭 — 자산 그룹 컬럼·필터
    4. 프로젝트 보관·멤버 관리·복사, 자산 보관(R-FE-11)
    5. `GET /me`의 프로젝트에 `status` 추가 등 소규모 계약 보강(R-FE-03)
    6. RLS·DB 계정 분리(FE 영향 없음)
  - 답변(FE):
  - 확인(BE):

- [ ] **BE-REQ-011 · 요청 · 보통 · 제품·공정 화면 모델 공유** (R-FE-07과 연결)
  - 내용: 제품·공정 화면(`productView.ts`, `sampleProducts.ts`, 공정 표 편집 초안)이 가정한 **필드 목록·단위·미정 표현**과 "확정/가정" 표시를 알려 주세요(원칙: 길이·보빈 수·가닥 수·작업 목표를 섞지 않음). CR be03 §3의 `specification`·재료 `form` 결정이 여기에 달려 있습니다.
  - 답변(FE):
  - 확인(BE):

## 완료
<!-- 답변·확인까지 끝난 항목을 이 아래로 옮긴다(번호 유지). -->

---

# Part 2. FE 요청(R-FE-nn)에 대한 Backend 답변

기준: FE 파일 `request-from-frontend.md` 최초 작성본(R-FE-01~12) · 답변일 2026-10-23 · 계약 0.2.0 기준(0.2.0은 머지 전, 위 "현재 Backend 상태" 참조).
상태 표기: **답변됨(FE 확인 대기)** — FE가 `[~]`→`[x]`로 관리합니다. FE의 "현재 사실" 중 자산 응답에 용량·상태가 없다는 항목은 **0.2.0에서 달라졌습니다**(R-FE-05).

### R-FE-01 OpenAPI 후보 전달과 계약 승인 일정 — 답변됨
- **승인 완료.** `contracts/openapi.json`이 정식 스냅샷이고 `contract-status.json`이 `PARTIALLY_APPROVED`, **contract 0.2.0**(sha256 `da54371140b994aca48a9ac19653785d6dbc674bde959615a9d4964efdc2a33a`, 기준 commit `e2f3bba`)입니다. 승인 scope `project-assets-ports`(0.1.0, 11 operation, sha `6bbad0dd…b66e`)와 `asset-revisions`(0.2.0, +7 operation).
- 받는 방법: 브랜치 `worktree-backend-core`에 있고 **아직 main에 머지되지 않았습니다**(PR 머지 필요 — 사용자 몫). 머지 전에는 읽기 전용으로 `…/.claude/worktrees/backend-core/contracts/openapi.json`을 직접 읽으세요. 후보 파일(`backend/artifacts`)은 Git 제외라 쓰지 않아도 됩니다. 정식 파일은 후보를 바이트 그대로 승격한 것입니다.
- FE는 이 스냅샷의 hash를 기준으로 client를 생성하고 hash를 기록해 주세요(BE-REQ-002). 예제: `contracts/examples/first-scope/*.json`(22개, 실제 응답에서 생성). 변경 알림은 `contracts/CHANGELOG.md`.

### R-FE-02 로컬 개발 연결: 인증 헤더, CORS, 시드 — 답변됨
1. **권장은 Vite proxy**(`/api` → `127.0.0.1:8000`)이며 프록시가 `X-Debug-User`를 붙이게 합니다(번들에 사용자 id가 들어가지 않도록 `VITE_*` 대신 셸 환경변수, 안내서 §4). CORS는 **미구현**(`cors_allowed_origins` 설정만 있음)이라 브라우저 직접 호출은 현재 불가합니다. 필요하면 BE-REQ-004로 알려 주세요.
2. **시드 완료**: `backend/scripts/seed_dev_data.py`(멱등, 로컬 전용, `--yes` 필요). 개발 DB에 migration 0002 적용 후 실행했고 id는 위 "현재 Backend 상태"에 있습니다(개발 전용 식별자). `.env`(개발 전용)에는 `DEV_DEBUG_USER=<위 id 중 하나>`처럼 **`VITE_` 접두사 없이** 두고 Vite 설정에서 `process.env`로 읽는 방식을 권장합니다. 헤더 이름은 개발 어댑터 한 곳에 두는 FE 가정이 맞습니다.
3. CORS를 쓰게 되면 `ETag`, `X-Request-ID`, `Location`을 expose 헤더에 포함하도록 구현하겠습니다(현재는 해당 없음).
- 이 인증은 **계약이 아니며** 운영 인증(TECH-002) 결정 시 바뀝니다. `APP_ENV=production`에서는 서버가 기동을 거부합니다.

### R-FE-03 프로젝트 전환 UI의 데이터 출처와 역할 값 — 답변됨
1. 메뉴는 **`/me`의 `projects`** 기준이어도 됩니다. `/me`는 페이지네이션·상한이 없고 호출자의 모든 프로젝트 멤버십을 줍니다(`GET /projects`는 `code` 오름차순 cursor 목록).
2. **역할(잠정, TECH-006 결정 시 조정)**: 프로젝트 `admin`|`editor`|`viewer`, 조직 `admin`|`member`. 의미: project admin = 프로젝트 수정·자산 생성/수정·버전 제출/승인/반려, editor = 자산 생성/수정·버전 편집/제출, viewer = 조회만. 조직 admin = 프로젝트 생성. `reviewer` 역할은 없습니다(승인은 project admin). FE는 표시용으로만 쓰고 서버 판정(403)이 정본입니다.
3. 프로젝트 `status` 값은 `active`|`archived`이지만 **archive 기능이 없어 현재 모두 `active`**입니다. 보관된 프로젝트의 목록 노출 정책은 archive 설계 때 정합니다. **`/me`의 `projects` 항목에는 `status`가 아직 없습니다**(`GET /projects`에는 있음) — 필요하면 `status`를 추가하는 소규모 계약 보강을 제안합니다(BE-REQ-010 #5).

### R-FE-04 오류 코드·`field_path` 규칙 — 답변됨
구현된 `error.code`와 HTTP 상태(전체, `contracts/04_api_contract.md` §2 표와 동일):

| HTTP | code | 상황 |
|---|---|---|
| 401 | `UNAUTHENTICATED` | 인증 헤더 없음·무효·비활성 사용자·local 모드 꺼짐 |
| 403 | `FORBIDDEN` | 멤버지만 역할 부족, 조직 member의 프로젝트 생성 |
| 404 | `NOT_FOUND` | 없음 **또는** 접근 불가(비멤버·타 프로젝트 id, 구분 안 함). 존재하지 않는 경로도 동일 |
| 409 | `PROJECT_CODE_CONFLICT`, `ASSET_CODE_CONFLICT` | 코드 중복 |
| 409 | `VERSION_IMMUTABLE`, `REVISION_DRAFT_EXISTS`, `INVALID_STATE_TRANSITION` | 자산 버전(0.2.0) |
| 412 | `EDIT_CONFLICT` | If-Match 불일치. `details[].field_path`는 `/row_version`, message에 현재 버전 |
| 422 | `VALIDATION_ERROR`, `INVALID_CURSOR` | 형식 오류 / 잘못된 cursor |
| 428 | `PRECONDITION_REQUIRED` | If-Match 누락 |
| 500 | `INTERNAL_ERROR` | 상세 비노출, `request_id`로 추적 |
| 그 외 | `HTTP_ERROR` | 위에 없는 프레임워크 HTTP 오류(예: 405). 계약 목록에는 없는 임시 코드 — 모르는 code는 일반 오류로 표시하는 FE 가정이 맞습니다 |
- `field_path`: **요청 본문 기준 JSON Pointer**(`/name`, `/equipment/equipment_type`, `/ports/0/buffer_capacity/value`). 본문 전체 규칙 위반은 `/`(예: 설비인데 `equipment` 누락). **쿼리·헤더 오류도 위치 접두사 없이 이름만** 표시합니다(`/limit`, `/kind`, `/sort`, `/cursor`, `/if-match`) — 본문 필드와 이름이 겹칠 수 있으니 endpoint 문맥으로 구분하세요. 예제: `contracts/examples/first-scope/error.*.json`.

### R-FE-05 용량·그룹·버전 상태·포트 위치 — 답변됨 (**0.2.0에서 제공**)
- **용량·버전 상태: 구현·승인 완료.** 상세는 `contracts/04_api_contract.md` §3.2와 FE 안내서. 질문별:
  1. 용량 객체는 03 §3 그대로 `{mode: unknown|finite|unlimited|not_allowed, value, unit, status}`. `value`는 **decimal 문자열**, `unit`은 `item|bobbin_slot|pallet_slot|kg|m2`. `finite`만 value·unit을 가지며 0 초과.
  2. 상태는 **자산이 아니라 리비전**에 있습니다(`AssetRevision.status`). 자산 응답에는 요약(`current_revision`, `latest_revision`)만. 초안이 아닌 버전 수정은 409 `VERSION_IMMUTABLE`.
  3. **포트 위치/배치 상태는 이 묶음에 없습니다.** layout 묶음(CAD·좌표, 로드맵 E)이며 일정 미정입니다. FE는 "위치 미정(미배치)" 기본 표시를 유지하세요(API에서 오는 값이 아님).
  4. **`field_meta`는 두지 않았습니다.** 미정은 용량의 `status`(unknown/confirmed)와 `mode: unknown`으로 표현하고, 서버 계산 `issues[]`(경고)가 사유를 설명합니다. 다른 필드에 사유가 필요해지면 추가를 제안합니다.
- **그룹은 아직 없습니다**(BE-REQ-010 #3 우선순위 입력 대기). FE의 "계약 필요" 표시 유지.

### R-FE-06 자산 화면의 필드 대응: 유형·모델·그룹·정렬 — 답변됨
1. `equipment_type`/`space_type`은 **자유 문자열**입니다(앞뒤 공백 제거 후 비어 있으면 안 됨, 최대 100자, 서버 허용값 목록 없음). FE 가정(입력 필드)이 맞습니다. 허용값 목록이 필요해지면 도메인 확정 후 enum으로 바꾸는 계약 변경이 됩니다.
2. `dock`과 `storage`는 **`kind`로만 구분**됩니다(둘 다 `space` 객체와 ACCESS 포트 1개). 서버가 `space_type`의 의미를 해석하지 않습니다. 도메인상 dock은 AMR 도킹 위치(ST-021/022 계열, 적재 허용 여부·용량은 미정이라 무제한으로 가정하지 않음)입니다.
3. 정렬은 `sort_order | code | name` + `-` 접두 **단일 필드가 최종**이며 다중 정렬 계획은 없습니다(동률은 code, id로 안정 정렬).

### R-FE-07 제품·공정 버전 API 일정과 단계 DTO — 답변됨 (일정 입력 대기)
1. **일정 미정.** 우선순위는 BE-REQ-010 답변으로 정합니다. Backend 제안은 제품·재료 → 공정 버전·그래프 순서이며 제품·재료 초안 CR을 올렸습니다([CR be03](../change-requests/CR-backend-20261023-be03-products-materials.md), **미승인 제안**).
2. `specification`: 현재 제안은 **자유 텍스트(nullable, null=입력 없음)** — CR be03 §3에서 FE 의견 요청(BE-REQ-011).
3. 저장 단위(계약 04 §4·ERD §14 기준, **PROPOSED**): 표 편집은 `PATCH steps/{id}` 단위, 그래프 구조 변경은 `PUT graph` 전체. **ETag는 단계가 아니라 공정 버전(`process_version.row_version`) 단위**이며 step PATCH도 같은 버전 락·ETag를 씁니다.
4. `timing_rule`/`output_rule`/`setup` 구조는 계약 03 §4~7(PROPOSED)이 정본입니다. FE가 쓰는 `output_speed`·`per_output_unit`·`per_reference_length`·`none`, 준비 trigger 8종, 산출 `configured_units`/`split_length`/`pass_through`는 03 문서와 일치합니다(03에는 `merge_strands`·`fixed_mass_units`도 있음). **최종 JSON 구조는 공정 CR에서 확정**하며 그 전에는 화면 뷰 모델로 유지하는 FE 가정이 맞습니다.
5. `/validate` 오류의 대상 지정은 04 §2 예시 기준 **`entity_id`(step id) + `field_path`(단계 내부 JSON Pointer, 예 `/timing_rule/processing/output_schedule`)**입니다(PROPOSED). 순서 번호는 쓰지 않습니다.

### R-FE-08 목록 응답의 페이지 이동 방식 — 답변됨
1. 기본 `limit` **50**, 최대 **200**(범위 밖은 422 `VALIDATION_ERROR`, field_path `/limit`).
2. **정렬·필터·프로젝트·자산이 바뀐 요청에 이전 cursor를 쓰면 422 `INVALID_CURSOR`**(field_path `/cursor`)이므로 폐기해야 합니다. 형식이 깨진 cursor도 같은 코드.
3. **`total`은 제공하지 않습니다**(계획 없음). 이전 페이지용 cursor도 없습니다. "더 보기" 방식 가정이 맞습니다.

### R-FE-09 프로젝트 색·표시 속성 — 답변됨
- 색·약칭 속성은 **두지 않습니다**(계획 없음). 프로젝트 id로 결정적으로 색을 고르는 FE 방식(서버 저장 없음)을 써도 됩니다. 짧은 식별자는 조직 안에서 유일한 `code`(최대 64자)를 쓰세요.

### R-FE-10 단위 코드 목록과 차원 규칙 — 답변됨
- 용량이 받는 단위 정본: **`item`, `bobbin_slot`, `pallet_slot`(개수 계열, 정수·0 초과), `kg`(중량), `m2`(면적)(0 초과 decimal, 소수 최대 6자리)**. FE의 `CAPACITY_UNITS`와 일치합니다.
- `bobbin`, `strand`, `m`, `min`, `m_per_min`은 **용량에는 사용할 수 없습니다**(enum 위반 → 422 `VALIDATION_ERROR`, field_path 예 `/storage_capacity/unit`). 서로 환산하지 않는 원칙은 유지합니다. 공정 필드에 쓰는 단위는 공정 CR에서 확정합니다.
- **`INVALID_UNIT`은 0.2.0에서 쓰지 않습니다**(위 enum 위반과 형식 오류 모두 `VALIDATION_ERROR`). "item만 실행 지원" 규칙은 응답의 `issues[]`에 **경고 `VAL-CAP-002`**(field_path `…/unit`)로 드러나며 등록·승인은 막지 않습니다.

### R-FE-11 보관(archive)·복사 기능 일정 — 답변됨 (일정 입력 대기)
- 일정 미정(BE-REQ-010 #4). **보관된 항목 수정 정책은 미정**이며 제안: 보관된 프로젝트/자산에 대한 쓰기는 409로 거부(code는 CR에서 확정). 현재 `include_archived`·`archived_at`은 있으나 보관 동작·거부 규칙은 없습니다.

### R-FE-12 Idempotency-Key 적용 범위 — 답변됨
- 프로젝트·자산 생성 POST는 **`Idempotency-Key`를 받지 않습니다**(04 §1은 실행/복사/가져오기 POST 대상). 재시도로 같은 본문이 다시 가면 코드 중복이라 **409 `*_CODE_CONFLICT`**가 나고 데이터는 한 건만 만들어지므로(트랜잭션 원자성) FE 가정(저장 중 버튼 비활성, 409는 "코드 중복" 표시)이 맞습니다. 네트워크 단절 후 재시도의 409는 이미 생성되었을 수 있으니 `q=<code>`로 재조회해 확인하는 흐름을 권장합니다. 버전 제출·승인·반려는 `If-Match`로 중복 적용이 막힙니다(412).

---

## Backend 공지 로그
- 2026-10-23: 계약 0.2.0(자산 버전·용량) 승인·반영, 개발 DB migration 0002 적용·시드 실행, FE 안내서·CHANGELOG 작성, 이 소통 파일 작성. FE R-FE-01~12 답변 완료.
