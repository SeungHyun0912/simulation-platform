# HANDOFF · Frontend · FE-05a (데이터 출처 기본값 api, 프로젝트 생성 연동)

- 작업 ID: **FE-05a** (보드에 정식 ID 없음 — 사용자 지시 "API 연동 가능한 화면은 데이터를 조회해 표시"). 상태: **구현완료 / 검증대기**
- 브랜치: `worktree-frontend-fe00-n` (origin/main `93d63b9` 병합 기준). 계약 0.6.0 `509a71f1…`(변경 없음)
- 보드 확인: `docs/collaboration/INTEGRATION_BOARD.md` §13.7(3회차) — INT-F-002 UI 부분 병합 후 재검증 통과, DEC-003·DEC-004(milestone 공정 표 편집 UX) 결정 대기. 이번 작업과 무관하므로 건드리지 않음.

## 변경
1. `ApiContext.defaultDataSource`: 기본값을 `api`로(`VITE_DATA_SOURCE=static`을 명시할 때만 정적 예시). 실패 시 자동 전환 없음은 그대로. `.env.example`·`README.md` 갱신. 이미 모든 목록·상세(프로젝트·자산·제품·재료·공정)는 api 모드에서 서버 조회로 동작하고 있었다.
2. 프로젝트 만들기(`/projects/new`): `POST /projects` 연결(`features/projects/writer.ts`). 조직은 `/me`의 admin 조직, 409 `PROJECT_CODE_CONFLICT`·422는 필드에 연결, 중복 전송 방지, 네트워크 단절 시 "처리 여부를 알 수 없음" 안내, 성공하면 `/me`·목록 캐시 갱신 후 새 프로젝트의 자산 화면으로 이동. 정적 모드는 버튼 비활성.
3. 낡은 문구 정리: 자산 목록 빈 상태("생성은 아직 연결되지 않음"), 제품 만들기("공정 화면은 아직…"), 앱 배너에 프로젝트 생성 추가.

## 변경 파일
`frontend/src/shared/api/ApiContext.tsx`, `src/features/projects/{writer.ts(신규),ProjectCreatePage.tsx}`, `src/features/assets/AssetListPage.tsx`, `src/features/products/ProductCreatePage.tsx`, `src/app/layout/AppShell.tsx`, `frontend/.env.example`, `frontend/README.md`, `tests/fakeApi.ts`(POST /projects), `tests/component/{api-project-create(신규),projects}.test.tsx`, 문서 `docs/communication/request-from-frontend.md`.

## 자체 테스트(frontend/, 실제 결과)
`pnpm typecheck` 0 · `pnpm lint` 0 · `pnpm test` 27 파일 통과·7 건너뜀, **546 통과·55 건너뜀** · `pnpm check:api` OK(0.6.0) · `pnpm build` 0 · 읽기 전용 `LIVE_API=…:8000 pnpm test:live` 29 통과·26 건너뜀.
**미실행:** 프로젝트 생성의 실서버 쓰기(공유 DB에 프로젝트가 남고 삭제 endpoint 없음 — 사용자 허락 필요), 새 0.6.0 필드 실서버 쓰기, 브라우저 수동 확인.

## 영향·재검증
- 계약·Backend 영향 없음(기존 `POST /projects` 소비). 프로젝트 수정(`PATCH`)은 상세 화면이 없어 미연결.
- 재검증: 전용 DB(INT)에서 조직 admin 사용자로 `/projects/new` 생성 → 409(같은 코드 재시도) → 새 프로젝트가 전환 메뉴·목록에 나타나는지. viewer/member만 있는 사용자는 "권한 없음" 화면.
