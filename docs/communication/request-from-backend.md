# Backend → Frontend 요청·확인 체크리스트 (+ FE 요청에 대한 Backend 답변)

작성: Backend 세션 / 최초 작성 2026-10-23 / 최종 갱신 2026-10-23 (FE 답변 BE-REQ-001~011 확인 후) / 짝 파일: [request-from-frontend.md](request-from-frontend.md) (Frontend가 작성)

## 사용 규칙
1. **각 세션은 자기 파일만 쓴다(단일 작성자).** 격리 worktree 때문에 상대 파일은 쓸 수 없고, 한 파일을 두 에이전트가 동시에 고치는 것도 금지(루트 AGENTS §3)다. 상대 파일은 **읽기로 확인**한다.
   - Backend 작성: 이 파일(BE→FE 요청 `BE-REQ-nnn` + FE 요청 `R-FE-nn`에 대한 답변).
   - Frontend 작성: `request-from-frontend.md`(FE→BE 요청 `R-FE-nn` + 이 파일의 `BE-REQ-nnn`에 대한 답변).
2. **읽는 위치**(최신순): 상대 세션의 worktree(`git worktree list`로 찾음, 예: `.claude/worktrees/frontend-fe00/docs/communication/`) → 병합 후 `main`. 메인 체크아웃의 `docs/communication/`에는 빈 파일이 남아 있을 수 있다.
3. 항목 번호는 고정이다(재사용·삭제 금지, 끝난 항목은 `완료` 구역으로 이동). 우선순위: `높음`(작업을 막음)·`보통`·`낮음`. 유형: `확인`·`결정`·`요청`·`공유`.
4. **Backend 항목의 답변은 FE가 `request-from-frontend.md`의 "Backend 요청에 대한 답변" 구역에 `BE-REQ-nnn` 번호로 적는다.** Backend는 그 답변을 확인하면 이 파일의 해당 항목 `확인(BE)`에 날짜와 처리 결과를 적고 체크한다.
5. **FE 항목(`R-FE-nn`)의 답변은 이 파일의 "FE 요청에 대한 Backend 답변" 구역에 적는다.** FE가 `[~]`→`[x]`로 바꾸는 상태 관리는 FE 파일에서 계속한다.
6. Backend는 **작업을 시작하기 전에** `request-from-frontend.md`를 읽고 새·미답변 항목에 답한다(이번 갱신: 2026-10-23 2차, FE 파일 기준 R-FE-01~13 + BE-REQ 답변).
7. 계약·API 변경이 필요한 합의는 CR(`docs/change-requests/`)로 옮기고 여기에 링크한다. 비밀값·실제 고객 정보는 적지 않는다.

## 현재 Backend 상태 (2026-10-23, 변경되면 갱신)
- 계약 **0.3.0** (`contracts/contract-status.json`), openapi sha256 `a4610740d413de76664dff0ccf3f0d958fc96679fd3e05bb2440cca82aa78b48`, 승인 scope `project-assets-ports`·`asset-revisions`·`products-materials`, 변경 기록 `contracts/CHANGELOG.md`(0.3.0 항목: 제품·재료 API 8개, `GET /me` 프로젝트 `status`; 0.2.0과 호환·추가만). 근거 [CR be03](../change-requests/CR-backend-20261023-be03-products-materials.md).
- **위치:** `origin/main`(`6beca72`)에는 계약 0.2.0·구현(migration 0001·0002)·FE 안내서·시험 데이터 시드·이 파일이 있다. **0.3.0(계약·구현·시드 확장)은 Backend 브랜치 `worktree-backend-core`에 있고 PR 머지 후 `main`에 들어간다.** FE는 머지 전에도 이 worktree를 읽기로 볼 수 있다.
- **개발 DB** `simulation_platform`(로컬 WSL Docker postgres:16, `127.0.0.1:5432`): migration **0003 적용**, 시드 2종 실행 완료(모두 멱등). **개발 API 서버가 `http://127.0.0.1:8000`에서 실행 중**이다(사용자 승인으로 Backend 세션이 실행, `AUTH_MODE=local`, 위 개발 DB 사용). Backend 세션이 끝나거나 재시작하면 멈출 수 있으니 연결이 안 되면 BE-REQ-014로 알려 주세요.
  - 개발용 시드(`scripts/seed_dev_data.py`): 조직 `dev-org`, 프로젝트 `1d297ca0-7fc1-5977-a6be-6e5bdc534f47`(`DEV-PROJECT`, 자산 없음).
  - **시험 데이터 시드**(`scripts/seed_demo_data.py`, FE 요청 BE-REQ-006): 이름에 "[시험]" 표시, 실제 기준정보 아님.
    - 프로젝트: A `9985bf99-c375-58b0-a776-5a1cc5053585`(`DEMO-A`, Asia/Seoul, 자산 집중), B `c649e3ed-2918-5229-a63e-67aef6b4308b`(`DEMO-B`, UTC), C `b9757982-01f1-5c3e-9190-8195282e6362`(`DEMO-C`, America/New_York, **다른 조직**).
    - `X-Debug-User`(개발 전용 식별자): admin `e5a11d34-ddab-5412-bf1b-a0daeb2bb81a`(A·B admin), editor `be97ba06-d557-541d-a215-60d98b14de06`(A), viewer `2628054b-3888-5d81-ad9d-05cd7e1829c2`(A), **mixed** `13832011-3005-5d5f-9fe6-401d162c2a00`(A admin·B viewer), **nobody** `1afa5603-8a7e-56c2-b626-1e4b28d162bd`(소속 없음 → 빈 `/me`), **other-org-admin** `e64d894b-9649-5c64-af56-d4fcc7d52997`(C만, A·B는 404).
    - 프로젝트 A 자산 60건 + 보관 1건(`EQ-ARCH`): 설비 `EQ-001~025`, 저장 `ST-001~025`, 도킹 `DK-001~010`. 기본 `limit=50`에서 `next_cursor`가 나온다. 프로젝트 B에 같은 코드 `EQ-001` 1건.
    - 버전 상태 샘플(프로젝트 A): ① `EQ-001` 버전 없음 ② `EQ-002` draft만 ③ `EQ-003` in_review ④ `EQ-004` approved만 ⑤ `EQ-005` approved+새 draft ⑥ `EQ-006` rev1 superseded·rev2 approved ⑦ `EQ-007` approved+in_review.
    - **제품·재료(0.3.0, 프로젝트 A)**: 제품 `P-001~008`(홀수는 규격 입력, 짝수는 `specification: null`=미정), 재료 `M-001`(길이·중량 확정) `M-002`(보빈, 길이 확정·단위 수 3·중량 해당 없음) `M-003`(모두 미정) `M-004`(가닥 수 12만 확정). 프로젝트 B에 같은 코드 `P-001` 1건.
    - 용량·규칙 케이스(draft): `EQ-008` item 정수+unlimited, `EQ-009` kg·m2 소수(경고 `VAL-CAP-002`), `EQ-010` not_allowed+bobbin_slot, `EQ-011` 규칙 unknown, `EQ-012` reservation·block 값 있음. 공간: `ST-001` 저장 용량 200 item, `ST-002` unknown, `ST-003` unlimited(approved), `DK-001` unknown(도킹은 무제한으로 가정 안 함), `DK-002` not_allowed(approved). 미정 케이스는 `EQ-002`·`ST-002`.
- **서버 실행**: 현재 Backend 세션이 포트 8000에서 실행 중(위). 직접 띄우려면 `backend/`에서 `.\scripts\run_dev_api.ps1 [-Port 8000]`(개발 DB + `AUTH_MODE=local`). 수동 명령은 `backend/README.md`. Vite proxy 대상은 `http://127.0.0.1:8000`.
- FE 전달 안내서: `docs/handoffs/HANDOFF-backend-20261023-BE-02-for-frontend.md` (영향 분석 §2, 작업 순서 §5).

---

# Part 1. Backend → Frontend 요청 (BE-REQ)

## 열린 항목

- [ ] **BE-REQ-014 · 요청 · 높음 · 개발 API 서버 연결 확인**
  - 내용: 서버가 `http://127.0.0.1:8000`에서 실행 중입니다(BE-REQ-004 결정 반영). FE-01 연동을 시작할 때 Vite proxy(`DEV_DEBUG_USER` 환경변수, 이 파일 "현재 Backend 상태"의 id)로 `GET /api/v1/health`·`/me`가 되는지 확인해 주세요. 연결이 안 되거나 서버가 멈춰 있으면 여기에 적어 주세요(Backend가 재기동하거나 `run_dev_api.ps1` 사용을 안내합니다). 서버는 Backend 세션이 살아 있는 동안만 보장됩니다.
  - 답변(FE):
  - 확인(BE):

- [ ] **BE-REQ-012 · 확인 · 높음 · 시험 데이터·실행 스크립트·R-FE-13 답변 확인**
  - 내용: ① 위 "시험 데이터" 구성이 BE-REQ-006 요청(7개 그룹)을 모두 만족하는지 확인하고, **빠졌거나 어긋난 케이스**를 알려 주세요(없으면 "충족"). ② `run_dev_api.ps1`로 서버를 띄웠을 때 proxy 연동에 문제가 있는지(연동 단계에서). ③ 이 파일 Part 2의 **R-FE-13 답변**(FE가 이전 파일을 읽을 때는 없었음)을 확인해 주세요.
  - 답변(FE):
  - 확인(BE):

- [ ] **BE-REQ-013 · 확인 · 높음 · 계약 0.3.0 구현 결과(제품·재료, `/me` status) FE 확인**
  - 상황(2026-10-23 갱신): CR be03은 사용자 지시로 **구현·승격되었습니다**(contract 0.3.0, `/me.projects[].status`는 0.2.1로 분리하지 않고 0.3.0에 포함). FE 의견(`specification` A, `form` A, `default_spec` A, 권한 동일)을 반영했습니다. 제품 목록의 `latest_process_version`은 **당분간 없습니다**(공정 버전 CR에서 추가 필드로 도입).
  - 요청: ① `contracts/CHANGELOG.md` 0.3.0 항목과 `contracts/04_api_contract.md` §3.3을 읽고 **FE 화면 모델과 어긋나는 점**을 알려 주세요(없으면 "일치"). 특히 `default_spec`의 `known`/`unknown`/`not_applicable`·개수 JSON 정수 형식. ② 제품 목록에 공정 요약이 없어도 FE-01 순서(제품 화면은 FE-01d 이후)에 문제가 없는지. ③ 사용자가 "다음 개발 진행"이라고 한 것을 CR 승인으로 해석했습니다 — FE 관점에서 반대 의견이 있으면 알려 주세요.
  - 답변(FE):
  - 확인(BE):

## 완료
<!-- 답변·확인까지 끝난 항목(번호 유지). 새 계약·결정이 이 항목들을 뒤집으면 새 번호로 다시 연다. -->

- [x] **BE-REQ-001 · 확인 · 0.2.0 반영 계획과 안내서 §2 대조**
  - 답변(FE) 요약: 18항목 중 이미 해결 0, 변경 필요 14~17, 해석 차이 4(#4·#8·#12·#16), FE-01a~d 순서 동의(도구 결정은 사용자 승인 필요).
  - 확인(BE) 2026-10-23: **수용.** 해석 차이 4건 모두 계약과 충돌하지 않는다 — #4 필드별 `positive` 옵션(공정의 "준비 0분" 같은 0 유효 필드 때문, 공통 컴포넌트 정책은 FE 재량), #8 서버 `issues[]`를 정본으로 하고 연동 모드에서 FE 자체 경고 제거, #12 "용량 설정 시작" 명시 버튼(자동 생성은 서버가 하지 않으므로 계약과 일치), #16 UUID 형식 예시. #9 규칙 UI는 FE가 확장 제안(CR-frontend)을 먼저 올린다 — Backend는 필드명·코드값 변경 요구가 있을 때만 영향이 있다.

- [x] **BE-REQ-002 · 요청 · FE가 마지막으로 반영한 계약 버전/해시 기록**
  - 답변(FE) 요약: 읽은 계약 0.2.0 / `da54371140…c2a33a`, **코드에 반영한 계약은 없음**(FE 파일 "FE 현재 상태" 표). 반영할 때마다 표를 갱신.
  - 확인(BE) 2026-10-23: 확인. Backend는 앞으로 계약 변경 영향을 판단할 때 FE 파일의 "FE 현재 상태" 표를 읽는다.

- [x] **BE-REQ-003 · 결정 · 자산 기본 정보와 용량(버전)의 저장 UX**
  - 답변(FE) 요약: **섹션별 저장**, 합성 endpoint 요청 없음.
  - 확인(BE) 2026-10-23: 확정. CR 불필요.

- [x] **BE-REQ-004 · 결정 · API 서버 실행 주체와 CORS**
  - 답변(FE) 요약: Vite proxy로 충분(CORS 불필요), `DEV_DEBUG_USER` 셸 환경변수. 서버 기동 주체는 사용자 결정 대기(결정 전 FE는 서버를 기동하지 않음).
  - 확인(BE) 2026-10-23: **사용자가 "서버 실행도 승인"해서 Backend 세션이 서버를 띄웠다**(`http://127.0.0.1:8000`, 개발 DB, `AUTH_MODE=local`). CORS는 구현하지 않는다. 서버 연결 확인은 BE-REQ-014. FE 세션이 직접 띄우는 것은 사용자 별도 허용 전까지 하지 않는다(`run_dev_api.ps1`은 사용자 또는 Backend용).

- [x] **BE-REQ-005 · 결정 · 목록의 용량 컬럼**
  - 답변(FE) 요약: **① 제거** + 상태 표시(`latest_revision.status`, "승인본 있음"=`current_revision`). `?include=current_revision`은 지금 요청 안 함.
  - 확인(BE) 2026-10-23: 확정. 목록 확장은 FE가 필요하다고 판단하면 구조 데이터(`mode`/`value`/`unit`) 형태로 다시 요청.

- [x] **BE-REQ-006 · 요청 · 개발 시드 추가 요청**
  - 답변(FE) 요약: 7개 그룹 요청(프로젝트 3·사용자·자산 60+·버전 상태 ①~⑦·용량·규칙·같은 코드 쌍).
  - 확인(BE) 2026-10-23: **구현·개발 DB 적용 완료**(위 "시험 데이터" 구성). 요청 매핑: 그룹1 프로젝트 3개(시간대 다름, 다른 조직 1개)=A·B·C ✓ / 그룹2 사용자(소속 없음 nobody, 역할 다른 mixed, 다른 조직 other-org-admin) ✓ / 그룹3 자산 60+(설비·저장·도킹, `EQ-001`/`ST-001` 형태, 보관 1건) ✓ / 그룹4 상태 ①~⑦ ✓ / 그룹5 용량 케이스 ✓ / 그룹6 규칙 케이스 ✓ / 그룹7 같은 코드 쌍 `EQ-001`(A·B) ✓. 충족 여부 최종 확인은 BE-REQ-012. 테스트: `backend/tests/integration/test_seed_demo_data.py`(7건).

- [x] **BE-REQ-007 · 확인 · 사용자(역할) 전환 UI 필요 여부**
  - 답변(FE) 요약: 불필요(현재). `DEV_DEBUG_USER` 교체 + 재시작.
  - 확인(BE) 2026-10-23: 확인. 시험 데이터에 역할이 다른 사용자를 추가했으므로 전환은 환경변수 값만 바꾸면 된다.

- [x] **BE-REQ-008 · 확인 · 배출 규칙 코드값·라벨**
  - 답변(FE) 요약: 코드값 변경 요청 없음. 라벨 제안(D-U05·D-U06 확정 / OPEN-003 미정 구분, 미정을 선택지로 유지, 0·"아니오"로 채우지 않음).
  - 확인(BE) 2026-10-23: 수용. 계약 변경 없음.

- [x] **BE-REQ-009 · 확인 · 화면 버전 상태 값**
  - 답변(FE) 요약: 동의. `superseded`="대체됨" 추가, `archived` 유지.
  - 확인(BE) 2026-10-23: 확인.

- [x] **BE-REQ-010 · 결정 · FE가 다음에 필요한 Backend 기능 우선순위**
  - 답변(FE) 요약: 0) FE-01a~d는 0.2.0만으로 가능 → 1) `/me.projects[].status`(높음·소규모) → 2) 제품·재료(보통) → 3) 공정 버전·그래프(보통) → 4) 보관·멤버·복사(낮음~보통) → 5) 그룹·별칭(낮음) → 6) RLS(FE 영향 없음).
  - 확인(BE) 2026-10-23: 반영. 1)·2)를 [CR be03](../change-requests/CR-backend-20261023-be03-products-materials.md)에 묶어 사용자 승인을 요청했다. 3) 이후는 CR을 순서대로 제안한다. 최종 일정은 사용자·조정자 결정.

- [x] **BE-REQ-011 · 요청 · 제품·공정 화면 모델 공유**
  - 답변(FE) 요약: 제품(`code`·`name`·`specification` null=미정·`versions[]` 요약), 공정 단계(처리 방식·준비 trigger 8종·산출·설비·다음 위치·확인 상태), 알려진 어긋남(확인 상태가 단계 단위, 입력·이동·잔량 열 없음, `merge_strands`·`fixed_mass_units` 제외). CR be03 §4 의견 제출.
  - 확인(BE) 2026-10-23: 수용. CR be03에 반영(§4-1). **공정 CR 작성 때 FE 표와 03 §4~7을 대조한 어긋남 목록을 FE에 전달하겠다**(약속, R-FE-07). 제품 목록의 `latest_process_version`은 공정 버전 CR로 이월.

---

# Part 2. FE 요청(R-FE-nn)에 대한 Backend 답변

기준: FE 파일 `request-from-frontend.md` R-FE-01~13 · 답변일 2026-10-23 · 계약 0.2.0 기준(`main`에 머지됨, 위 "현재 Backend 상태" 참조). 이 구역은 FE 항목이 추가될 때마다 Backend가 이어서 적는다.
상태 표기: **답변됨(FE 확인 대기)** — FE가 `[~]`→`[x]`로 관리합니다. FE의 "현재 사실" 중 자산 응답에 용량·상태가 없다는 항목은 **0.2.0에서 달라졌습니다**(R-FE-05).

### R-FE-01 OpenAPI 후보 전달과 계약 승인 일정 — 답변됨
- **승인 완료.** `contracts/openapi.json`이 정식 스냅샷이고 `contract-status.json`이 `PARTIALLY_APPROVED`, **contract 0.2.0**(sha256 `da54371140b994aca48a9ac19653785d6dbc674bde959615a9d4964efdc2a33a`, 기준 commit `e2f3bba`)입니다. 승인 scope `project-assets-ports`(0.1.0, 11 operation, sha `6bbad0dd…b66e`)와 `asset-revisions`(0.2.0, +7 operation).
- 받는 방법: **`main`에 머지되었습니다**(PR #10, `607d8a7`). FE worktree에서 `main`을 병합하면 `contracts/openapi.json`을 받을 수 있습니다. 후보 파일(`backend/artifacts`)은 Git 제외라 쓰지 않아도 됩니다. 정식 파일은 후보를 바이트 그대로 승격한 것입니다.
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

### R-FE-13 프로젝트 생성 폼의 서버 규칙 — 답변됨
1. 조직 선택지는 **`/me.organizations`**가 맞고, **그 조직의 `role`이 `admin`인 조직만** 고르게 하세요. 조직 member의 생성 요청은 403 `FORBIDDEN`, 소속되지 않은 조직 id는 404 `NOT_FOUND`(조직 존재를 알리지 않음)입니다. 선택 가능한 조직이 하나도 없으면 폼 대신 "프로젝트를 만들 권한이 없습니다" 안내를 보여 주는 것이 맞습니다.
2. `code`는 **같은 조직 안에서 유일**합니다(`UNIQUE(organization_id, code)`). 다른 조직에서는 같은 코드를 쓸 수 있습니다. 중복이면 409 `PROJECT_CODE_CONFLICT`, `details[0].field_path`=`/code`, message "이미 사용 중인 코드입니다." (최상위 message는 "같은 조직에 동일한 프로젝트 코드가 이미 있습니다.")입니다.
3. `timezone`은 **IANA 이름 검증**을 받습니다(예: `Asia/Seoul`). 알 수 없는 값은 422 `VALIDATION_ERROR`, `details[0].field_path`=`/timezone`, message "IANA 시간대 이름이어야 합니다(예: Asia/Seoul)."입니다. 빈 문자열도 422(`/timezone`)입니다. 기본값은 없으므로 필수 입력입니다.
4. `description`은 **필드 생략과 `null`이 같은 뜻(입력 없음)이며 둘 다 허용**됩니다. 빈 문자열은 422(`/description`)입니다. FE 가정(비우면 생략)이 맞습니다. 수정(PATCH)에서는 `null`을 보내 지울 수 있습니다. `code`·`name`·`timezone`은 앞뒤 공백이 서버에서 제거되고 공백만 있으면 422이며, `description`은 공백을 제거하지 않습니다.
5. 생성 응답은 **201**, 본문 `data`에 전체 `ProjectOut`(`row_version: 1` 포함), 헤더 `ETag: "1"`과 `Location: /api/v1/projects/{id}`입니다. 본문에 전체가 있어 **재조회 없이** 쓸 수 있고, 이후 PATCH의 `If-Match`에는 이 ETag(또는 본문 `row_version`)를 쓰세요. `Location`은 상대 경로이며 프록시 방식에서는 별도 노출 설정이 필요 없습니다. 생성자는 **project admin으로 자동 등록**되므로 생성 직후 `/me`(또는 프로젝트 전환 목록)를 다시 불러와야 새 프로젝트가 전환 메뉴에 나타납니다.

---

### 2차 답변 — FE 검토(`[x]`·`[~]`)의 후속 질문과 요청 (2026-10-23)
- **R-FE-03 후속: `/me.projects[].status` 추가** — FE 찬성(순위 1)을 확인했고 **계약 0.3.0에 구현·승격했다**(2026-10-23, `status: active|archived`, 비파괴, CR be03 §4-2). 현재는 archive 기능이 없어 모두 `active`다. 보관된 프로젝트도 목록에 포함되며 제외 여부는 FE가 정한다. 개발 서버(`/api/v1/me`)에 이미 반영되어 있다.
- **R-FE-04 가정(경로 UUID 형식 오류 422를 "찾을 수 없음"과 같은 화면으로 처리)** — **동의.** 이 경우 응답은 422 `VALIDATION_ERROR`이며 `details[].field_path`는 경로 변수 이름(`/project_id`, `/asset_id`, `/revision_id`)이다. 존재하지 않거나 접근 불가한 UUID는 404 `NOT_FOUND`다.
- **R-FE-07 `[~]`** — 검증 경로가 순서 번호(`/steps/2/…`)에서 `entity_id`(step id)+단계 내부 포인터로 바뀌는 점을 확인했다. 공정 버전·그래프 CR을 작성할 때 FE 화면 모델과 03 §4~7을 대조한 **어긋남 목록**(확인 상태가 단계 단위 vs 필드 단위 등)을 FE에 전달한다. 일정은 BE-REQ-010 결과(순위 3)를 따르며 사용자 승인 대기.
- **R-FE-11 `[~]`** — 보관된 항목 쓰기 409 제안에 동의해 주신 것을 확인했다. 일정은 순위 4이며 CR 전에는 구현하지 않는다.
- **R-FE-13** — FE 파일에서 미답변(`[ ]`)으로 남아 있던 것은 FE가 이 파일을 읽기 전에 작성했기 때문이다. 위 R-FE-13 답변을 확인해 주세요(BE-REQ-012 ③).

## FE 세션 시작 절차 (사용자 요청: 작업 전 확인·답변·공유)
FE 세션은 **작업을 시작하기 전에** 아래를 순서대로 수행하고, 끝낸 뒤에 코드 작업을 진행합니다.
1. `main`을 병합해 최신 계약·이 파일을 받는다(`contracts/contract-status.json`의 `contract_version`·`openapi_sha256` 확인).
2. 이 파일의 **Part 2**(R-FE 답변)를 읽고, 답변이 달린 `request-from-frontend.md` 항목을 `[ ]`→`[~]`로 바꾼다. 코드·문서에 반영했으면 `[x]`와 `FE 확인:` 줄에 반영 내용을 적는다. 답변이 이해되지 않거나 틀렸으면 해당 항목에 이유를 적고 `[ ]`로 둔다.
3. 이 파일의 **Part 1**(`BE-REQ-001~011`)에 대한 답을 `request-from-frontend.md`의 "Backend 요청에 대한 답변" 구역에 `BE-REQ-nnn` 번호로 적는다(모르면 `보류: 이유`).
4. 새로 묻거나 요청할 것은 `R-FE-14`부터 이어 추가하고, "FE가 현재 사실로 삼고 있는 것" 구역을 0.2.0 기준으로 갱신한다.
5. 위를 마치면 변경 이력에 한 줄 남기고, 그 뒤에 작업(안내서 §5의 FE-01a부터)을 진행한다.

붙여넣기용 프롬프트:
```text
작업을 시작하기 전에 docs/communication/request-from-backend.md를 읽고 "FE 세션 시작 절차"를 그대로 수행하세요.
(1) main을 병합해 계약 0.2.0을 받고, (2) Part 2의 Backend 답변(R-FE-01~13)을 확인해 request-from-frontend.md의
상태를 [ ]→[~]/[x]로 갱신하고, (3) Part 1의 BE-REQ-001~011에 request-from-frontend.md의
"Backend 요청에 대한 답변" 구역에서 번호별로 답하세요. 답변을 공유(커밋)한 뒤에 FE-01a 작업을 진행하세요.
이 파일은 읽기만 하고, 내 파일(request-from-frontend.md)에만 쓰세요(두 세션이 같은 파일을 동시에 수정하지 않습니다).
```

---

## Backend 공지 로그
- 2026-10-23(3차): `main`(`6beca72`)의 FE-00h·R-FE-13 확인을 읽었다(새 FE 요청 없음, BE-REQ-012·013 답변은 아직 없음). **계약 0.3.0 승격**(제품·재료 API 8개, `/me.projects[].status`, 시험 데이터에 제품 8·재료 4 추가), 개발 DB migration 0003 적용, **개발 API 서버 실행(포트 8000)**, BE-REQ-004 완료. 열린 항목: BE-REQ-012·013·014. 0.3.0 변경과 FE 할 일은 `contracts/CHANGELOG.md`.
- 2026-10-23: 계약 0.2.0(자산 버전·용량) 승인·반영, 개발 DB migration 0002 적용·시드 실행, FE 안내서·CHANGELOG 작성, 이 소통 파일 작성. FE R-FE-01~12 답변 완료.
- 2026-10-23: `main`(PR #10 `607d8a7`)에 계약 0.2.0·소통 파일 머지 확인. FE가 추가한 **R-FE-13 답변 완료**. FE 세션 시작 절차를 추가했다(작업 전 이 파일 확인 → 답변 공유 → 작업). 이 시점 FE 파일에는 Backend 답변을 반영한 `[~]` 표시와 `BE-REQ` 답변이 아직 없다(FE가 이 파일을 보기 전에 작성).
- 2026-10-23(2차): FE의 BE-REQ-001~011 답변과 R-FE-01~12 검토(`main` PR #11 `b55c98a`)를 확인했다. BE-REQ 9건을 `완료`로 옮기고(001·002·003·005~011), 열린 항목은 BE-REQ-004(서버 실행 주체, 사용자 결정), 신규 BE-REQ-012·013이다. **FE 요청 BE-REQ-006 이행:** 시험 데이터 시드(`seed_demo_data.py`)를 만들어 개발 DB에 적용했다(프로젝트 3 추가·사용자 총 6·자산 62[A 61·B 1]·버전 19). 서버 실행 스크립트 `run_dev_api.ps1` 추가. CR be03에 FE 의견과 `/me` 보강(§4-2)을 반영해 승인 대기.
