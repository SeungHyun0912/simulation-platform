# HANDOFF · Frontend · FE-11a (계약 0.16.0: "고칠 곳" 목록·결과 리포트 화면)

- 작업 ID: **FE-11a** (사용자 요청 "고칠 곳 목록과 결과 리포트 화면 연동", BE-18 인계 경유). 상태: **구현완료 / 검증대기**
- 브랜치 `worktree-frontend-fe00-n`, origin/main 병합(PR #62 `cb4fc84` 포함). 계약 **0.16.0** `13fa2fb9afce00b5bc9808d57fdfaa4d9b1dff463745beeeecd4504c478842ad` 재생성. 새 계약 요구 없음.

## 1. 반영 내용
| 항목 | 처리 |
|---|---|
| 후보별 원인 | `BottleneckOut.root_cause`(`RootCauseOut`)·`chain`(`ChainStepOut[]`)을 타입 밖 읽기에서 **정식 타입**으로 전환. 동작은 FE-10b와 같음(null = 판정 불가, 빈 경로는 그리지 않음, 설명은 서버 문장 그대로) |
| 고칠 곳 | 병목 섹션 한계 안내 바로 아래, 멈춘 곳(종류별)보다 먼저 `root_causes` 목록: 순위, 제품 · 단계, 가동률, 묶인 병목 수(수준별 높음·중간·낮음), 관련 순위, 설명, 설비·가동률, 입력 대기, **묶인 멈춘 양 합(참고)**(종류가 달라 겹칠 수 있다는 안내). 실데이터에 20곳이 있어 **상위 5곳 + "고칠 곳 모두 보기(N곳)"**. 빈 목록이면 영역 없음 |
| 병목 표시 공용화 | `BottleneckSummaryView({data})`로 나눠 실행 상세 병목 섹션과 리포트가 같이 씀 |
| 결과 리포트 | 새 경로 `/projects/:projectId/runs/:runId/report`, 실행 상세(결과가 있는 끝난 실행)에 "결과 리포트 보기" 링크. 순서: **한계(항상 펼침)** → 관측 품질·가정 위의 결과 경고 → 요약 문장(서버 규칙 문장 그대로, 정의 버전) → 실행·시나리오(상태·종료 사유, 관측 시간·품질, 이벤트·재공품, 엔진·seed·반복, 입력 해시, 시나리오 코드 v번호 링크, 정지 규칙 원문 키=값, 가정 사유) → 제품별 결과(제품마다 따로, 지표는 `/metric-definitions` 설명 + 키, null = "해당 없음", 부족한 입력) → 병목·고칠 곳 → 가동률 상위 설비 → 대기가 많은 공간 → 쓰인 가정(코드별 묶음, 실행 상세와 공용 `AssumptionGroups`) |
| 상태 | 로딩, 409 `RUN_RESULT_NOT_AVAILABLE` → "결과 리포트가 없습니다" 안내(오류 아님), 그 밖 오류 `QueryErrorNotice`, 정적 예제 모드 `ApiOnlyNotice` |

## 2. 변경 파일
`frontend/src/features/runs/{RunReportPage.tsx(신규),RunAnalysisSections.tsx,RunDetailSections.tsx,RunDetailPage.tsx,queries.ts}`, `src/app/router.tsx`, 생성물(`src/shared/api/generated/*`), `tests/fakeScenarios.ts`(root_cause·chain·root_causes 시드, `/report` 경로), `tests/component/{api-run-analysis,api-run-report(신규)}.test.tsx`, `tests/live/live-scenario-run-ui.test.tsx`, `docs/communication/request-from-frontend.md`(변경 기록 1줄).

## 3. 자체 테스트(frontend/, 실제 결과)
| 명령 | 결과 |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | 0 / 0 / 0 |
| `pnpm check:api` | 0, "생성물이 contract 0.16.0(13fa2fb9afce…)과 같습니다" |
| `pnpm test` | 0, **48 파일 중 38 통과·10 건너뜀(라이브), 700 통과·74 건너뜀** |
| 읽기 전용 live `LIVE_API=http://127.0.0.1:8000/api/v1 pnpm vitest run tests/live/live-scenario-run-ui.test.tsx` | 0, **10 통과**(새 리포트 시험 포함: run c3640d5d 한계 4줄·제품 6개·고칠 곳) |
| 화면(Edge headless, vite 5197 → 8000, run c3640d5d) | 리포트 전체 표시 확인. 고친 것: 분 값이 서버 소수 원문(139069.454545분)으로 나와 소수 1자리 표시로 변경, 고칠 곳 20곳 → 상위 5곳 미리 보기 |

로그: `$CLAUDE_JOB_DIR/tmp/fe11a-{typecheck,lint,check:api,test,build}.log`(세션 임시 폴더).
**미실행:** 실서버 쓰기(이번 작업에는 쓰기 없음). 리포트 인쇄·내보내기(계약 없음).

## 4. 디자인 시스템 §6 점검
- [x] 토큰 외 색·간격·글자 크기 없음(새 CSS 없음, `rg` 16진 색·rgb·px 결과 없음)
- [x] 공통 컴포넌트 사용(`DataTable`·`Button`·`LinkButton`·`StateNotice`·`Section`·`Note`·`PageHeader`, `<button>`·`<table>`·`<input>` 직접 사용 없음)
- [x] 로딩·빈 결과·실패·권한/결과 없음(409) 상태
- [x] 상태를 색 외에 글자로(수준 높음·중간·낮음 글자, 관측 품질 문구)
- [x] 입력 없음(조회 화면) — 해당 없음
- [x] 미정과 0 구분(지표·가동률 null → "해당 없음", 0은 0)

## 5. 관찰(Backend 참고, 결함 아님)
- 실데이터 `root_causes[].finding_ranks`가 리포트의 병목 상위 10개 밖 순위(예: 41·44위)를 가리킴 → 리포트에서는 순위 번호만 보이고 링크하지 않음.
- 리포트 상단 관측 품질 경고와 병목 요약 안의 "불완전한 관측" 경고가 같은 내용으로 두 번 보임(같은 원천). 필요하면 다음 작업에서 하나로 줄임.

## 6. 재검증 방법
1. `frontend/`에서 typecheck·lint·test·check:api·build, `pnpm test:live`(읽기).
2. 수동: 실행 상세(끝난 실행) → "결과 리포트 보기" → 한계가 맨 위인지, 제품별로 따로인지, 고칠 곳 "모두 보기" 확인. 결과 없는 실행 URL에 `/report`를 붙이면 안내가 나오는지.
