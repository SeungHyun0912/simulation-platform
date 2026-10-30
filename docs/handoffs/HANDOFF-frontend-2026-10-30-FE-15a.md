# HANDOFF · Frontend · FE-15a (배치판 통로(W)·경로 계산 — 계약 0.18.0)

- 작업 ID: **FE-15a** (Backend 전달 "계약 0.18.0 통로·경로 계산, 사용자 결정·FE 개발 진행", PR #72). 상태: **구현완료 / 검증대기**
- 브랜치 `worktree-frontend-fe00-n`. 계약 **0.18.0** `78905102896674298473dedcac1ce408c4c47e69555433ddce2a87543dcf2dde`(PR #72 머지 후 재생성해 커밋). 새 계약 요구 없음(검토 요청한 `reason_code`는 0.18.0에 반영됨).

## 1. 반영
| 항목 | 처리 |
|---|---|
| 통로 모델 | `aisles[]`(key·점 순서·attributes)를 읽고 **저장 때 항상 보냄**(PUT은 통째 교체 — 빼면 서버에서 지워짐). 점 이름 바꾸기·삭제가 통로에도 반영, "쓰지 않는 점"은 통로까지 확인 |
| 통로 그리기 | 도면 모드 "통로 그리기": 빈 곳은 새 점(자동), 기존 점(근처 12px)은 그 점을 지나 **갈림길**. 포트 없음. 더블클릭·Enter·"통로 끝내기", Backspace·Esc, 도면 위 상태 줄. 통로는 굵은 회색 선(경로는 얇은 파란 선), 이름표 |
| 통로 편집 | 통로 선 더블클릭 → 점 끼워 넣기. 통로 속성: 점 순서(빼기)·끝에 기존 점 추가·다시 그리기·삭제, **다른 선과 공유하는 점**(이어짐 확인), 길이는 서버 `length_m`(바뀌면 "저장 후 계산") |
| 표·붙여 넣기 | 통로 목록 표, 통로 붙여 넣기("W1  P1 P2 P5", 탭·쉼표·공백, 없는 점은 그 줄 건너뜀) |
| 경로 보기(계산) | `POST …/paths`: 출발 포트 1 → 도착 포트 여러 개(다음 설비 후보 비교, 최대 500). 결과 표(갈 수 있음·고정 경로 R…/통로로 계산, 길이, 점 순서, 갈 수 없음 + `reason_code` 한국어·서버 문장, 포트 미연결이면 그 포트 보기). **가장 짧은 후보를 도면에 녹색으로 강조**, 행별 표시·지우기. 저장 안 한 변경이 있으면 "저장된 내용 기준" 안내 |
| 오류·경고 | 저장 422 `/aisles/{i}…`(LAY-SAVE-011·003·008·009) → 통로 강조, 검증 `/aisles/{key}`·LAY-008·009 → 통로·점·포트 강조, 화면 검사(통로 이름 빈칸·중복·64자, 점 2개 미만) |
| 기타 | 앱 배너에 통로·경로 계산 표시 |

## 2. 변경 파일
`frontend/src/features/layouts/{layoutDoc.ts,LayoutCanvas.tsx,LayoutCanvas.module.css,LayoutEditorPage.tsx,LayoutPanels.tsx,LayoutPaths.tsx(신규),writer.ts}`, `src/app/layout/AppShell.tsx`, 생성물, `tests/fakeLayouts.ts`(통로·LAY-SAVE-011·경로 계산 Dijkstra), `tests/component/{api-layouts,api-mode}.test.tsx`, `tests/unit/layoutDoc.test.ts`, `tests/live/live-layout-ui.test.tsx`.

## 3. 자체 테스트(frontend/, 실제 결과)
| 명령 | 결과 |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | 0 / 0 / 0 |
| `pnpm check:api` | 0(0.18.0). **PR #72 머지(`3a9813a`) 후 main 병합·재생성 — 생성물 변화 없음**, check:api·typecheck·lint·build 0, test 755 통과 |
| `pnpm test` | 0, **755 통과**·83 건너뜀(라이브). 배치판 화면 34 + 단위 20 |
| 실서버 읽기(`LIVE_API`) `live-layout-ui` | **4 통과**(DEMO-A 목록·초안, DEMO-WIRE v1·v2) |
| 실서버 쓰기(`LIVE_WRITE=1 LIVE_LAYOUT=1`, DEMO-A 초안 하나·승인 안 함, 사용자 허락 범위) | **통과**: 통로 FE-W1(FE2 → FE4 → FE3) 저장·길이 **22.2 m**, 경로 계산 EQ-001 OUT → EQ-002 IN = **고정 경로 FE-R1**, 반대 방향 = **통로로 계산** |
| 화면(개발 서버 읽기, Edge headless, DEMO-A 초안) | 통로(굵은 회색)·경로(파란 선)·공유 점 FE2 확인 |

**미실행:** 통로 그리기 클릭 조작의 실서버 화면 확인(쓰기 시험은 붙여 넣기로 만듦, 그리기는 가짜 서버 시험), 승인의 실서버 쓰기.

## 4. 디자인 시스템 §6 점검
- [x] 토큰 외 색·간격·글자 크기 없음(새 CSS: 통로·계산 경로 강조, 토큰만)
- [x] 공통 컴포넌트 사용(경로 보기도 SelectField·DataTable·Button·StateNotice)
- [x] 상태를 색 외에 글자·모양으로(통로는 굵은 선 + "통로 W…" 이름, 계산 경로는 role=img 이름, 갈 수 없음 ⚠ + 이유 문장)
- [x] 입력 라벨(출발·도착 포트, 통로 이름·붙여 넣기)
- [x] 미정과 0 구분(갈 수 없음의 길이는 "해당 없음")

## 5. 재검증 방법
1. PR #72 머지 후 `pnpm gen:api` → check:api·typecheck·test.
2. `$env:LIVE_API=…; $env:LIVE_WRITE="1"; $env:LIVE_LAYOUT="1"; pnpm vitest run tests/live/live-layout-ui.test.tsx`(DEMO-A).
3. 수동: 배치판 초안 → "통로 그리기"로 가로·세로 통로를 가운데 점 공유로 그림 → 내용 저장 → "경로 보기"에서 출발 1·도착 여러 개 계산 → 도면 강조 확인.
