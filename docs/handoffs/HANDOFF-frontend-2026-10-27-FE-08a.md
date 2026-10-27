# HANDOFF · Frontend · FE-08a (공정 플로우차트: 조회·노드 단위 수정·배치 저장)

- 작업 ID: **FE-08a** (사용자 지시: 제품별 전체 공정을 API로 받아 FlowChart로 보고, 그 안에서 공정 정보를 하나씩 수정). 상태: **구현완료 / 검증대기**
- 브랜치 `worktree-frontend-fe00-n`. 계약 0.11.0 `d6189bb8…`(변경 없음). 사용 operation: `GET /products`, `GET …/products/{p}/process-versions`, `GET·PUT …/process-versions/{v}/graph`, `GET …/process-versions/{v}`, `GET·PUT …/process-versions/{v}/editor-state`(0.5.0).

## 1. Backend 확인(backend-dev, 2026-10-27, SendMessage)
- Q1 여러 제품 전체 공정 일괄 조회: **없음.** 제품당 `GET graph`(+버전)가 맞다. 권장: 필요한 제품만 지연 로딩, 병렬 6~8 제한, ETag 키 캐시. 수백 종·"전체 공정 한 장" 화면이 필요해지면 일괄 조회 CR 후보.
  → FE는 **선택한 제품 하나만** 읽는다(제품 선택 시 지연 로딩, 캐시 키는 프로젝트·버전).
- Q2 `editor-state`: 0.5.0 그대로 유효, 승인본 포함 **어떤 상태에서도 저장**, 버전당 공용, 자체 ETag(`"0"` 시작), 없는 노드 id는 422 `VAL-REF-005`, 전체 교체. → 그대로 구현.
- Q3 단계 PATCH vs 그래프 PUT: ETag 범위는 같다. 속성 한 단계 수정은 PATCH가 낫고(다른 노드를 건드리지 않음), 구조 변경은 PUT. → **FE는 그래프 PUT 하나로 저장**한다(이유: 플로우차트는 단계 수정과 구조 변경을 한 번에 저장하는 편집 문서 모델이고, 조회한 문서를 그대로 고쳐 보내 새 필드·spec 연결·완제품 지정을 보존함을 FE-04a 이후 테스트로 확인). 단계만 바꾸는 즉시 저장 UX가 필요해지면 PATCH 경로를 추가 검토.

## 2. 구현
- 경로 `/projects/:p/flow`(공정이 있는 첫 제품으로 이동), `/projects/:p/products/:productId/flow?version=…`(기본 최신 버전). 사이드 메뉴 "공정 플로우차트", 공정 목록 행의 "플로우차트" 링크, 공정 편집 화면 머리의 "플로우차트로 보기".
- `FlowCanvas.tsx`(라이브러리 없이 SVG, React Flow 제외 결정 유지): 노드 종류별 모양·색·글자, 완제품 ★, 오류 테두리, 간선 종류별 선, 재료 연결 표시, Ctrl+휠·버튼 확대/축소, 빈 곳 끌어 이동, **노드 끌어 배치**, **선택 노드 화살표 키 이동**(Shift=크게), 노드·간선 키보드 선택.
- `ProcessFlowPage.tsx`: 제품·버전 선택, 오른쪽 **속성 패널** — 공정 단계는 기존 `StepEditPanel`(처리·설비·재료 spec 등 전체), 그 밖의 노드는 `NodeEditForm`, 간선은 `EdgeEditForm`(끝점·종류·이동 규칙·재료 연결). 도구: 노드 추가(화면 가운데에 배치), **간선 연결 모드**(시작→끝 클릭, 규칙 위반은 이유 표시), 선택 삭제(연결 간선 함께, 확인), 화면 맞춤, 자동 배치, 되돌리기, 저장.
- 저장: 공정 내용(그래프 PUT, If-Match=편집 시작 버전, 412 병합/다시 불러오기는 기존 편집기와 동일) → 성공 후 **배치(editor-state PUT, 모든 노드 좌표, 정수·한도 내)**. 내용은 초안+관리자·편집자만, 배치는 관리자·편집자면 승인본에서도 저장. 배치 412는 "서버 배치로 다시 불러오기 / 내 배치로 덮어쓰기". 좌표를 못 불러오면 자동 배치로 보여 주고 배치 저장만 막음.
- 리팩터: `GraphEditor`의 노드·간선 편집 양식을 `GraphForms.tsx`(`NodeEditForm`·`EdgeEditForm`)로 분리해 두 화면이 공유(동작 동일, 기존 테스트 통과). `useProcessEditor.save()`가 성공 여부(boolean)를 돌려준다.
- 정적 예시 모드: 서버 연동 전용 안내만(예시 데이터 없음).
- 테스트 안정화: `vite.config.ts` `test.maxWorkers: 6`. 14코어에서 jsdom worker 경합으로 **전체 실행 때 일부 파일의 worker가 시작 시간 초과로 빠지고(파일 수 38~39/43 집계) 20초 시간 초과가 나던 문제**를 확인해 해소.

## 3. 변경 파일
신규 `frontend/src/features/processes/{FlowCanvas.tsx,FlowCanvas.module.css,ProcessFlowPage.tsx,ProcessFlowPage.module.css,flowLayout.ts,GraphForms.tsx}`, `tests/component/api-process-flow.test.tsx`(21), `tests/unit/flowLayout.test.ts`(7), `tests/live/live-process-flow-ui.test.tsx`(2, 읽기 전용) · 수정 `GraphEditor.tsx`, `ProcessEditorPage.tsx`, `ProcessListPage.tsx`, `queries.ts`(editor-state), `writer.ts`(saveEditorState·fetchEditorState), `useProcessEditor.ts`, `src/app/router.tsx`, `src/app/layout/AppShell.tsx`, `tests/fakeProcess.ts`(editor-state), `vite.config.ts`.

## 4. 자체 테스트(frontend/, 실제 결과)
| 명령 | 결과 |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | 종료 0 / 0 / 0 |
| `pnpm check:api` | OK(0.11.0) |
| `pnpm test` | **43 파일 중 33 통과·10 건너뜀(라이브), 632 통과·69 건너뜀**, 346 s(maxWorkers 6). 제한 전 실행에서는 4건 시간 초과·파일 집계 누락 → 해당 3파일 단독 79건 통과로 부하 원인 확인 후 제한 |
| 읽기 전용 live `live-process-flow-ui` (8000, DEMO-WIRE) | **2 통과**: P01~P06 6종 모두 서버 노드·간선 수와 같은 수로 그림·완제품 지정 표시, P04(분기)에서 단계 편집 패널 열림 |
| 화면(Edge headless, 실서버 P04) | 렌더링 확인. 첫 배율이 너무 작아(가로 24단) 시작 배율을 0.6 이상·왼쪽 위 기준으로 고침 |

**미실행:** 플로우차트의 **실서버 쓰기**(그래프 PUT·editor-state PUT) — 이번 지시에 실서버 쓰기 허락 범위가 명시되지 않아 실행하지 않았다(가짜 서버로 검증). 실제 마우스 끌기는 jsdom의 포인터 이벤트로만 검증.

## 5. 검토 의견(사용자 요청 "플로우차트 안에서 하나씩 수정" 검토)
- **가능·구현함:** 노드 클릭 → 속성 패널에서 단계 전체 수정, 간선 클릭 → 연결·이동 규칙·재료 연결 수정, 노드 추가·연결·삭제, 배치 저장.
- **한계/위험:** ① 저장 단위는 버전 전체(그래프 PUT)라 여러 사람이 같은 초안을 동시에 고치면 412(노드 단위 병합 제공, 구조가 겹치면 다시 불러오기). ② 배치는 버전당 공용이라 다른 사람의 배치를 덮어쓸 수 있다(412로 알리고 선택하게 함, 사용자별 배치는 Backend 후속 변경). ③ 승인본은 내용 수정 불가 — 새 초안을 만들어야 한다(플로우차트에서 새 초안 버튼은 아직 없음, 표 편집 화면에 있음). ④ 수백 노드는 SVG로 그리되 성능 시험은 하지 않았다(현재 최대 28노드). ⑤ 합류 규칙·조건 등 계약 미정 필드는 보존만 하고 편집 UI가 없다.
- 제안(결정 필요): 플로우차트에서 "새 초안 만들기"·"검토 요청"까지 할지, 단계 단위 즉시 저장(PATCH)이 필요한지, 여러 제품을 한 장에 보는 전체 공정 화면이 필요한지(필요하면 Backend 일괄 조회 CR).

## 6. 재검증 방법
1. `frontend/`에서 typecheck·lint·test·check:api·build.
2. `$env:LIVE_API="http://127.0.0.1:8000/api/v1"; pnpm test:live`(읽기).
3. 수동: `DEV_DEBUG_USER` 지정 후 `pnpm dev` → 사이드 메뉴 "공정 플로우차트" → 제품·버전 선택 → 노드 클릭(오른쪽 패널) → 초안이면 수정·저장 후 재조회 시 유지, 노드를 끌어 저장 후 새로고침 시 위치 유지, 승인본은 내용 잠김·배치는 저장 가능.
