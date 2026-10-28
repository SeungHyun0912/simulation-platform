# HANDOFF · Frontend · FE-10a (계약 0.12.0~0.15.2 화면 반영: 갱신 흐름·일괄 조회·운반 가정·단계 지표)

- 작업 ID: **FE-10a** (Backend 전달 "0.12.0~0.15.2 UI 반영" 1~10번, 사용자 요청 경유). 상태: **구현완료 / 검증대기**
- 브랜치 `worktree-frontend-fe00-n`, origin/main 병합(`32a26ae`). 계약 **0.15.2** `f4df60cddfdb9edbd282ddb9e194f9ecefd6bc69bd015d471e88238de75d859a` 재생성(0.15.x는 같은 OpenAPI). 새 계약 요구 없음.

## 1. Backend 요청 항목별 처리
| # | 항목 | 처리 |
|---|---|---|
| 1 | 병목 요약 | **FE-09a에서 완료**. 이번에 후보별 "원인" 영역 추가 — 개발 서버가 이미 `root_cause`·`chain`을 보내고 있어(0.16.0, PR #62 **머지 전**) 타입 밖에서 방어적으로 읽어 그림(설명·근본 원인 단계·설비 가동률·막힘이 번진 경로, 모르는 모양은 원문). 요약 `root_causes[]` "고칠 곳" 목록은 0.16.0 머지 뒤 |
| 2·3 | 설비 타임라인·간트 | **FE-09a에서 완료**(used=false 표시 포함) |
| 4 | 단계별 지표 | 지표에 **단계 키 필터(`step_key`)** 추가, 차원 `step_key`를 "단계"로 표시. 정의·단위는 `/metric-definitions` 그대로 |
| 5 | 두 실행 비교 | **FE-09a에서 완료**. 엔진 c0.1↔c0.2 실데이터로 `comparable=false` 안내 확인(live) |
| 6 | 최신 공정으로 갱신 | 시나리오 버전 화면 "최신 공정으로 갱신" 섹션: 초안은 **"최신 승인 공정으로 갱신"**(미저장 변경 있으면 막음, If-Match, 412 충돌), 승인본은 **"새 초안을 만들어 최신 공정으로 갱신"**(복사 → refresh → 그 초안으로 이동). 자산 고정 `latest`(기본)·`keep` 선택. 결과 `process_changes`·`asset_changes` 표와 다음 단계 안내(사전검증 → 승인 → 실행 → 비교) |
| 7 | 전체 공정 일괄 조회 | 프로젝트 전체 공정 화면을 **`GET /process-graphs?mode=summary&basis=…`(50개씩 cursor)** 로 전환, 제품별 그래프 GET 제거(동시 제한 훅 삭제). 공유 표가 **저장 공간**(노드 공간 지정)도 포함("설비·공간", 쓰임 열). 요약에 검증 결과가 없어 줄별 오류·경고 수는 뺌(제품별 플로우차트에서 봄). `/assets/{id}/uses`는 자산 하나씩이라 표 계산에는 쓰지 않음(요약으로 같은 값) |
| 8 | 시나리오 가정 | `carrier_empty_move_minutes`(운반 자원 빈 차 이동 분, 0 이상, 비우면 null)·`out_release`("hold" 명시 / 비우면 서버 기본 hold) 입력 추가, 둘 중 하나라도 쓰면 가정 사유 요구(SCN-ASM-001) |
| 9 | 설비 목록 지게차·AMR | 화면 변경 불필요(설비로 그대로 보임) — 실서버 화면 확인은 하지 않음 |
| 10 | 이벤트·가정 코드 | 이벤트 표에 `CARRIER_MOVED`·`ENTRY_WAITING`·`OUT_BLOCKED` 등 한국어 이름 + 원문, **이동 열(source → destination)**, `item_key` null인 입고 대기는 "(입고 대기)". 결과의 "쓰인 가정"을 **코드별 묶음(건수 + 펼치기)** 으로 바꾸고 `OUT_RELEASE_HOLD`·`CARRIER_EMPTY_MOVE` 등 이름 표시(c0.2 실행에서 수십 줄로 길어짐을 화면에서 확인해 고침) |

### 1-1. Backend 회신 반영(같은 날)
- Backend: 0.16.0 필드는 PR #62 머지 전까지 바뀌지 않음, 머지 시 공지 → 그때 타입 재생성. 타입 밖에서 읽는 `root_cause`(null = 판정 불가)·`chain`(빈 목록)을 처리할 것. 가동률이 낮은 근본 원인은 설명에 "투입 조건 먼저 확인"이 붙으니 설명은 그대로 표시.
- 반영: 원인 null + 빈 경로면 원인 영역을 그리지 않음(전에는 빈 "원인" 제목만 남던 문제 수정), 원인 null + 경로 있음이면 "근본 원인을 판정할 수 없습니다" + 경로만, 원인 있음 + 빈 경로면 경로 줄 없음. 설명은 서버 문장 그대로. 시험 3건 추가. `pnpm test` **691 통과**·73 건너뜀, build 0.

## 2. 변경 파일
`frontend/src/features/runs/{RunAnalysisSections.tsx,RunDetailSections.tsx,queries.ts}`, `src/features/scenarios/{scenarioView.ts,ScenarioProductEditor.tsx,ScenarioVersionPage.tsx,writer.ts}`, `src/features/processes/{ProcessOverviewPage.tsx,processOverview.ts,queries.ts}`, 생성물, `tests/{fakeProcess.ts,fakeScenarios.ts}`, `tests/component/{api-scenarios,api-run-analysis,api-process-overview}.test.tsx`, `tests/unit/scenarioView.test.ts`, `tests/live/{live-scenario-run-ui,live-process-flow-ui}.test.tsx`.

## 3. 자체 테스트(frontend/, 실제 결과)
| 명령 | 결과 |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | 0 / 0 / 0 |
| `pnpm check:api` | OK(0.15.2) |
| `pnpm test` | **47 파일 중 37 통과·10 건너뜀(라이브), 688 통과·73 건너뜀** |
| 읽기 전용 live(8000) `live-scenario-run-ui`·`live-process-flow-ui` | **12 통과**(일괄 조회 전체 공정 6종, c0.1↔c0.2 비교 불가, 병목·타임라인) |
| 화면(Edge headless, run c3640d5d c0.2) | 공간 부족 병목 평가·근본 원인 표시 확인, 가정 목록 묶음으로 수정 |

**미실행:** "최신 공정으로 갱신"·가정 저장의 **실서버 쓰기**(사용자 쓰기 허락 범위 밖 — 가짜 서버로 검증). 결과 리포트 `GET /runs/{r}/report`·`root_causes[]` 목록(0.16.0 머지 전).

## 4. 디자인 시스템 §6 점검
- [x] 토큰 외 색·간격·글자 크기 없음(`rg` 결과: 레이아웃 고정 폭·높이 4건만 — 허용 예외)
- [x] 공통 컴포넌트 사용(`DataTable`·`Button`·`Fields`·`StateNotice`, 기능 화면에 `<button>`·`<table>`·`<input>` 직접 사용 없음)
- [x] 로딩·빈 결과·실패·권한 없음 상태(갱신 버튼은 편집 권한일 때만, 일괄 조회 실패 안내)
- [x] 상태를 색 외에 글자·기호로(변경 상태 문구, 수준 배지 기호+글자)
- [x] 입력 라벨·오류 연결(새 가정 입력 2개, 단계 키)
- [x] 미정과 0/빈칸 구분(빈 차 이동 분: 빈칸=null, 0은 명시 값)

## 5. 재검증 방법
1. `frontend/`에서 typecheck·lint·test·check:api·build, `pnpm test:live`(읽기).
2. 수동(쓰기, 시험 데이터): 공정 승인본 새 초안 → 수정·승인 → 시나리오 승인본에서 "새 초안을 만들어 최신 공정으로 갱신" → 바뀐 공정 버전 표 확인 → 사전검증·승인·실행 → "다른 실행과 비교".
