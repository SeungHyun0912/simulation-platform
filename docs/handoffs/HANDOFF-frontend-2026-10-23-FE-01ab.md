# HANDOFF-frontend-2026-10-23-FE-01ab
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Frontend / FE-01a(client 생성·API 계층) + FE-01b(읽기 연동 첫 조각) / A-01
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-frontend-fe00-j / 6beca72(origin/main) / (커밋 후 기록)
- 계약 버전 / OpenAPI hash / 승인 scope: **반영한 계약 0.2.0 / `da54371140b994aca48a9ac19653785d6dbc674bde959615a9d4964efdc2a33a` / `project-assets-ports`, `asset-revisions`** (생성물 `frontend/src/shared/api/generated/CONTRACT.json`에 기록, `pnpm check:api`로 검증)
- 수정 파일: `frontend/**`, `docs/communication/request-from-frontend.md`, 이 문서. 계약·backend·`request-from-backend.md`는 수정하지 않았다.

## 사용자 결정 (2026-10-23) 반영
1. 서버 실행 주체 = backend 개발 세션 또는 사용자. FE는 서버를 기동하지 않았다(작업 중 서버가 올라온 것을 `/health`로 확인하고 사용).
2. client 생성 도구 승인 → **openapi-typescript 7.13.0**(MIT, 비용 없음)을 타입 생성에만 쓰고 요청 계층은 자체 fetch 래퍼로 둔다. 근거: 의존성을 최소로 두고 오류 envelope·ETag·If-Match 처리를 직접 통제.
3. 확장 제안 CR(규칙 입력·사유 입력 창) 승인됨 → FE-01d에서 구현(이번에는 구현하지 않음).
4. backend 기능 우선순위는 backend 세션에서 정리.

## 세션 시작 절차 이행
- backend의 최신 `request-from-backend.md`(main `6beca72`)를 읽고 BE-REQ-004(사용자 결정)·012·013에 답했다. R-FE-14(`/me`에 timezone) 신규. 상세는 `request-from-frontend.md`.

## 실제 구현 내용
**FE-01a: 계약 기반 API 계층**
- `pnpm gen:api`/`check:api`(`scripts/gen-api.mjs`): `contracts/openapi.json`의 sha256이 `contract-status.json`과 다르면 생성을 **중단**(승인되지 않은 스냅샷으로 client를 만들지 않음). 생성물과 `CONTRACT.json` 기록. CRLF 차이 허용.
- `shared/api/client.ts`: 모든 호출이 지나는 계층. 기본 헤더만 사용(인증 정보를 코드에 두지 않음), ETag→정수 row_version, `If-Match`를 `"n"`으로 부착(0도 보냄), 빈 쿼리 값 제외, X-Request-ID·Location 반환, 취소는 그대로 전달, 서버에 닿지 못하면 `NetworkError`.
- `shared/api/errors.ts`: `ApiError`·`classifyError`(401/403/404/412/409 계열/422/428/5xx, 모르는 code는 상태로 대략 분류)·`toIssues`·`fieldErrors`. `QueryErrorNotice`로 오류 종류별 안내(428은 원인을 노출하지 않음).
- `vite.config.ts` proxy(`/api` → `DEV_API_TARGET`, `DEV_DEBUG_USER`→`X-Debug-User`, 번들 미포함), `.env.example`.
- 데이터 출처 `VITE_DATA_SOURCE=static|api`(기본 static). 실패해도 자동 전환 없음. `ApiProvider`/`useDataSource`/`useApiClient`, `Loadable`.
**FE-01b: 읽기 연동**
- `/me`(전환 메뉴·역할·조직), `GET /projects`(+ /me 역할 합치기), 자산 목록(서버 q·kind·sort·limit·cursor, "더 보기", 조건 변경 시 새 조회), 자산 상세(자산 + 버전 목록 → 기존 화면 모델 어댑터), 프로젝트 시간대(`GET /projects/{id}`, 상세에서만).
- 어댑터 `features/assets/apiMappers.ts`, `features/projects/queries.ts`. 계약 승인 예제(`contracts/examples/first-scope`)를 어댑터에 통과시키는 테스트로 계약 변경을 감지.
- 목록 조회 중 정렬·검색 변경 시 같은 프로젝트의 이전 목록을 유지(`placeholderData`), **다른 프로젝트의 데이터는 유지하지 않음**(테스트 있음).
- API 모드에서는 `?state=` 미리보기·"예시 데이터" 문구를 쓰지 않는다. 쓰기(PATCH·POST) 요청은 없다(저장 버튼은 계속 비활성).
- 셸 배너: 정적/API 모드를 구분 표시. `/me` 실패 시 header에 재시도.

## 실제 서버에서 확인한 사실
- `/health` ok. proxy 경유 브라우저 렌더링(프로젝트 목록·자산 목록·EQ-005 상세) 확인.
- 비UUID 경로 id → **422**(FE는 상세에서 "찾을 수 없음"). `limit=500`, 알 수 없는 `sort` → 422. 잘못된 cursor → 422 `INVALID_CURSOR`. 비멤버·다른 프로젝트 경유 → 404 `NOT_FOUND`. 인증 헤더 없음 → 401. ETag = row_version.
- 시험 데이터 전 자산(60+1)의 버전 목록이 어댑터를 통과, 상태 4종(draft·in_review·approved·superseded) 모두 확인.
- 발견: `/me.projects[]`에 시간대가 없어 승인 시각을 KST로 잘못 보일 수 있었다 → 상세에서만 `GET /projects/{id}` 호출로 수정, R-FE-14로 backend에 보고.

## 채택 결정과 근거
- 저장 연동(FE-01c·d)은 이번에 하지 않았다. 읽기 연동을 실서버로 검증한 뒤 쓰기로 넘어가는 편이 위험이 작다.
- 정적 예시는 삭제하지 않고 정적 모드로 유지한다(화면 구조 검토, 서버 없는 개발, 제품·공정 화면).
- 정적과 API가 같은 `Loadable` 인터페이스를 쓰므로 화면 코드는 출처를 몰라도 되고 오류 분기는 API 모드에서만 실제로 발생한다.

## 미정 또는 임시 가정
- 라이브 테스트의 시험 데이터 id는 backend 시드의 개발 전용 식별자이며 시드가 바뀌면 `tests/live/live-api.test.ts`의 상수를 맞춘다.
- `pnpm peers check`에 openapi-typescript의 TypeScript 5.x peer 경고가 남는다(실제 생성은 동작).
- 역할은 `/me`의 문자열(admin/editor/viewer)이며 TECH-006 결정 시 바뀔 수 있다.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| pnpm gen:api / check:api | frontend/ | Node 24.17.0, openapi-typescript 7.13.0 | 0 / 0 | 계약 0.2.0 생성, 일치 확인 |
| pnpm typecheck | frontend/ | TS 6.0.3 | 0 | 오류 없음(fixture·예제도 생성 타입으로 검사) |
| pnpm lint | frontend/ | ESLint 10.13.0 | 0 | 경고·오류 없음 |
| pnpm test | frontend/ | Vitest 5.0.5 | 0 | 파일 11개 통과·1개 건너뜀, 테스트 208개 통과·13개 건너뜀(라이브) |
| LIVE_API=http://127.0.0.1:8000/api/v1 pnpm test:live | frontend/ | 실서버(backend 세션이 기동), 개발 DB 시험 데이터 | 0 | 13개 통과(읽기 전용 GET만) |
| pnpm vite(api 모드, proxy) + Edge 헤드리스 스크린샷(1280px) | frontend/ | Vite 8.3.5 | 0 | 프로젝트 목록·자산 목록·EQ-005 상세 육안 확인, vite 종료 확인 |
| pnpm build | frontend/ | Vite 8.3.5 | 0 | 빌드 성공 |
| python tools/check_workspace.py | 루트 | Python 3.12 | 0 | PASS(문서·구조만) |

## 미실행 테스트와 이유
- **쓰기(PATCH·POST·전이) 연동**: FE-01c·d에서 구현 예정이라 미실행. 412·428·409(VERSION_IMMUTABLE 등) 실서버 동작은 검증하지 않았다.
- 브라우저 수동 확인(키보드·포커스·스크린리더·색 대비), 500px 미만 폭, 느린 서버·오프라인 상태의 실제 화면: 미실행(QA_CHECKLIST.md 갱신).
- 제품·공정 화면의 API 연동: 계약 0.3.0 이후.

## 남은 위험·질문
- API 모드에서 상세 화면의 입력은 편집 가능하지만 저장되지 않는다(안내 문구와 비활성 버튼으로 알림). 사용자가 오해하지 않는지 검토 필요.
- `/me` 호출은 프로젝트와 무관해 캐시 키에 프로젝트 id가 없다. 사용자가 바뀌면(운영 인증 도입) 로그아웃 시 캐시 폐기가 필요하다(지금은 개발 모드 고정 사용자).

## 다음 세션의 첫 작업
- `request-from-backend.md`(최신 worktree 또는 main)와 `request-from-frontend.md`를 읽고 새 답변 반영.
- FE-01c: 자산 기본 정보 저장(PATCH + If-Match, 412 → 리소스별 충돌 안내, 409 `ASSET_CODE_CONFLICT` → 코드 필드 오류, 422 → `field_path`로 폼 필드 매핑, 저장 성공 시 응답으로 상태·ETag 갱신), 자산 생성.
- FE-01d: 버전 용량 저장·규칙 입력(확장 CR)·제출/승인/반려(사유 입력 창)·새 초안.
