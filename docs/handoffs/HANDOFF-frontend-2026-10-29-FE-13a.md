# HANDOFF · Frontend · FE-13a (배치판 화면: 계약 0.17.0 scope layouts)

- 작업 ID: **FE-13a** (Backend 요청 "배치판 화면 개발", PR #68 머지 `4269e93` 확인 후). 상태: **구현완료 / 검증대기**
- 브랜치 `worktree-frontend-fe00-n`, origin/main 병합. 계약 **0.17.0** `71906840a4b8deafdc76bc45763e3051e5241c3c388fe72ac9c9155e6fca9fc7` 재생성. 새 계약 요구 없음.

## 1. 화면
| Backend 요청 | 처리 |
|---|---|
| 1) 배치판 메뉴·버전 목록·새 초안 | 사이드 메뉴 **배치판**(`/projects/:p/layouts`): 버전·상태(초안·승인)·이름·시각 표. "새 초안 만들기"(편집자 이상, 서버가 최근 승인본 복사) → 편집 화면으로 이동. 409 `LAYOUT_DRAFT_EXISTS`는 오류 대신 "이미 열린 초안" + 그 초안 링크 |
| 2) 편집 화면(SVG 도면) | `/projects/:p/layouts/:v`. 좌표계 m·왼쪽 위 원점·y 아래, 배치는 중심 기준·시계 방향 회전. 격자(확대에 따라 0.5~200 m 간격), 도면 테두리, 배경(`attributes.background`: http(s)만, 축척 m_per_px 또는 도면 가로 ÷ width_px, 모르면 깔지 않고 안내). 모드: **선택·이동**(점·배치 끌기, 화살표 0.1 m·Shift 1 m), **점 추가**(빈 곳 클릭), **경로 그리기**(출발 포트 → 그 점에서 시작 → 점 순서 클릭 → 도착 포트, "도착 포트의 점으로 끝내기", 첫·끝 점 불일치 미리 안내). 확대·축소·전체 보기, Ctrl+휠 |
| 점·배치·포트 매핑·경로 속성 | 선택 패널: 점(이름 변경 시 매핑·경로가 따라감, x·y, 연결 포트·연결 풀기, 삭제 시 영향 표시), 배치(중심·가로·세로·회전, **빈칸 = 모름**, 도면에는 크기 모름 표식·회전 0으로 그리되 "모름" 표시, 자산 포트별 점 선택), 경로(출발·도착 포트, 운반 방식 forklift·amr·manual + 직접 입력, 점 순서 다시 그리기, 길이는 **서버 `length_m`**, 바뀐 경로는 "저장 후 계산") |
| 표 편집·붙여 넣기 | 점·배치·경로 표(모름 표시) + **엑셀 붙여 넣기**(탭/쉼표, 제목 줄 건너뜀, 같은 이름·코드는 바꾸고 새것은 추가, 틀린 줄 안내): 점 `이름, x, y` / 배치 `자산 코드, x, y, 가로, 세로, 회전`. 배치 안 된 설비·공간을 골라 도면 가운데에 배치 |
| 3) 저장 | `PUT /content`(통째, If-Match). 저장 전 화면 검사(빈·중복 이름, 숫자 아님, 음수, 0 크기, 회전 범위)로 막고 항목에 표시. 422 `LAY-SAVE-*`는 **보낸 본문 순번**으로 대상 강조, 412는 충돌 안내(자동 덮어쓰기 없음). 저장 뒤 응답(반올림된 값)으로 다시 그림 |
| 4) 머리 수정 | 이름·메모·도면 가로·세로·배경(url·width_px·height_px·m_per_px) PATCH(바뀐 필드만, attributes의 다른 키 유지). 내용 저장과 같은 row_version을 이어 씀 |
| 5) 검증·승인 | "검증"(저장 안 된 변경이 있으면 막음) → 오류·경고 목록 + **key 경로**로 도면 강조. "승인"(관리자, 확인 대화상자) → 422 `LAYOUT_VALIDATION_FAILED`는 목록·강조. 승인본·조회자는 읽기 전용, 승인본에서 "이 버전으로 새 초안 만들기" |
| 상태 | 로딩·오류·정적 모드(ApiOnlyNotice)·빈 목록·권한 없음(편집·승인 버튼 숨김 + 안내)·미저장 이동 확인 |

공통 변경: `shared/api/errors.ts`에 `LAYOUT_DRAFT_EXISTS`(state)·`LAYOUT_VALIDATION_FAILED`(validation) 분류, 앱 배너에 배치판 연결 표시.

## 2. 변경 파일
`frontend/src/features/layouts/{layoutDoc.ts,layoutView.ts,queries.ts,writer.ts,LayoutCanvas.tsx,LayoutCanvas.module.css,LayoutListPage.tsx,LayoutEditorPage.tsx,LayoutPanels.tsx}`(신규), `src/app/router.tsx`, `src/app/layout/AppShell.tsx`, `src/shared/api/errors.ts`, 생성물, `tests/fakeLayouts.ts`(신규), `tests/fakeApi.ts`, `tests/unit/layoutDoc.test.ts`(신규), `tests/component/{api-layouts(신규),api-mode}.test.tsx`, `tests/live/live-layout-ui.test.tsx`(신규).

## 3. 자체 테스트(frontend/, 실제 결과)
| 명령 | 결과 |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | 0 / 0 / 0 |
| `pnpm check:api` | 0, "생성물이 contract 0.17.0(71906840a4b8…)과 같습니다" |
| `pnpm test` | 0, **730 통과**·81 건너뜀(라이브). 배치판 단위 12 + 화면 17 |
| `LIVE_API=… pnpm vitest run tests/live/live-layout-ui.test.tsx`(읽기) | 1 통과·2 건너뜀 — DEMO-A 목록 빈 상태 확인. 개발 DB에 배치판이 없어 편집 화면 읽기는 건너뜀 |
| 화면(Edge headless, **가짜 서버**로 띄운 임시 확인 페이지, 커밋 안 함) | 격자·배치·경로·점·포트 글자 확인. 고친 것: 크기 모름 배치 글자와 점 이름 겹침, 경로 이름표와 점 이름 겹침(첫 구간 가운데로) |

**미실행:** 배치판 **실서버 쓰기**(DEMO-A 초안 생성·저장·검증) — 사용자 쓰기 허락 범위 밖이라 가짜 서버로만 검증. 시험은 `LIVE_WRITE=1 LIVE_LAYOUT=1`로 준비해 둠(DEMO-A 전용, 승인하지 않음). 실데이터 편집 화면 확인(Backend가 데이터 입력 후).

### 3-1. 실데이터 읽기 확인(FE-13b, 같은 날)
- Backend가 넣은 승인본: DEMO-WIRE v1 `0e7592fb…`, DEMO-WIRE-RUN v1 `c71a3561…`(도면 269.9 × 215.9 m, 설비 96대, 회전 0, 점·경로·ST 없음, attributes.source·inside 원문).
- live 읽기 시험 추가·통과(96대 배치 표, 도면 크기, 읽기 전용, `inside`·`source.anchor=top_left` 원문 표시). 화면(개발 서버 읽기, Edge headless) 확인.
- 고친 것: 전체 보기(1 m ≈ 2.3 px)에서 설비 코드 글자가 서로 겹쳐 **사각형보다 넓은 글자는 숨김**(선택한 배치는 위에 표시, 이름은 툴팁·접근성 이름·표). 배치 속성에 **"원본 값(attributes)"** 펼치기(원문 그대로, 계산에 쓰지 않음).
- 관찰(Backend 전달): 57/96 배치의 x_m·y_m이 `source`(왼쪽 위 x·y + 가로·세로/2)로 다시 계산한 중심과 0.1 m 다름. 원본의 반올림 전 값으로 계산한 결과로 보이나 확인 요청.
- DEMO-A 실서버 쓰기는 **미실행**: 허락이 Backend 세션 메시지로만 전달돼 사용자에게 직접 확인 중.
- `pnpm test` 0(730 통과·82 건너뜀), typecheck·lint·check:api·build 0.

## 4. 디자인 시스템 §6 점검
- [x] 토큰 외 색·간격·글자 크기 없음(새 CSS는 토큰만, 도면 높이 560px 1건 — 플로우차트와 같은 레이아웃 예외)
- [x] 공통 컴포넌트 사용(Button·DataTable·Fields·StateNotice·ValidationPanel·ConflictNotice·ConfirmDialog, `<button>`·`<table>`·`<input>` 직접 사용 없음. 도면은 SVG 요소)
- [x] 로딩·빈 결과·실패·권한 없음 상태
- [x] 상태를 색 외에 글자·모양으로(설비 실선·공간 점선·크기 모름 이중 점선 + "크기 모름" 글자, 오류는 굵은 테두리 + 접근성 이름 "(오류 있음)", 모드 버튼 aria-pressed)
- [x] 입력 라벨·오류 연결(모든 좌표·크기 입력, 붙여 넣기 결과 role=status)
- [x] 미정과 0 구분(크기·회전·운반 방식 빈칸 = null "모름/정하지 않음", 0은 0)
- 허용 기호만 사용(⚠ ↺), 확대·축소는 플로우차트와 같은 ＋ −

## 5. 재검증 방법
1. `frontend/`에서 typecheck·lint·test·check:api·build.
2. 실서버(허락 시): `$env:LIVE_API="http://127.0.0.1:8000/api/v1"; $env:LIVE_WRITE="1"; $env:LIVE_LAYOUT="1"; pnpm vitest run tests/live/live-layout-ui.test.tsx` — DEMO-A에 초안 하나(점 FE1~3, EQ-001·002 배치, 경로 FE-R1), 5.05 → 5.1 반올림·길이 16.9 확인.
3. 수동: 배치판 → 새 초안 → 점 추가·배치·포트 연결·경로 그리기 → 내용 저장 → 검증 → 승인.
