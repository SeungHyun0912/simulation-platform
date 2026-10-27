# HANDOFF · Frontend · FE-08b (플로우차트 상태 전환·단계 단위 자동 저장·프로젝트 전체 공정)

- 작업 ID: **FE-08b** (사용자 결정: FE-08a 결정 3건 모두 진행 + "프로젝트에 종속된 공정 정보를 한눈에"). 상태: **구현완료 / 검증대기**
- 브랜치 `worktree-frontend-fe00-n`, origin/main `d81bd33` 병합. 계약 **0.12.0** `f0250383ed652ed3702f447ffbd9151abdc82a369e218ce39a6f0c768b299689`로 재생성(병목 요약·단계 지표·결과의 제품 코드). 새 계약 요구 없음.

## 1. 구현
1. **플로우차트 상태 전환**: 초안 "검토 요청"(미저장 변경이 있으면 막음), 검토 중 "승인"·"반려"(사유 대화상자, 관리자), 승인본·대체됨 "이 버전으로 새 초안 만들기"(`base_version_id`로 그 버전 복사 → 새 초안 플로우차트로 이동, 열린 버전이 있으면 막고 그 버전 링크).
2. **단계 단위 저장(PATCH `/steps/{id}`)**: 기본 **자동 저장**(입력이 1.2초 멈추면 고른 단계만 저장, 다른 노드를 고르면 남은 변경을 바로 저장, 입력 오류가 있으면 보내지 않음), 끄면 "이 단계만 저장" 버튼. 본문은 `label` + 단계 최상위 필드(통째 교체 규칙), If-Match = 공정 버전 row_version, 응답 버전으로 이어 감. 구조 변경(노드·간선)은 계속 그래프 PUT이며 단계 저장 뒤의 버전으로 보낸다. 새로 추가한 단계는 PATCH하지 않고(서버에 없음) 공정 저장으로 저장하라고 안내. 412·422 시 자동 저장을 멈추고 알림(덮어쓰지 않음). `useProcessEditor.saveStep`·`stepState` 추가.
3. **프로젝트 전체 공정**(`/projects/:p/flow/all`, 플로우차트 화면 상단 탭 "제품별 플로우차트 / 프로젝트 전체 공정"): 공정이 있는 모든 제품을 제품별 줄로 한 화면에(읽기 전용, `GraphDiagram` 재사용), 줄마다 버전·상태·단계/노드/간선 수·검증 오류/경고·완제품 지정 여부, 제품 이름 → 그 버전의 플로우차트. "보는 버전" 최신(기본)/승인본. **여러 제품이 함께 쓰는 설비** 표(단계 자원 요구의 설비 후보를 모음, 사용처가 같은 호기는 한 줄로 묶음, 5줄 미리보기 + 모두 보기)와 **설비 강조**(모든 제품 도식에서 그 설비를 쓰는 단계 강조, 접근 가능한 이름에 "(강조)"). 제품 간 생산량은 합산하지 않음. 그래프 읽기는 일괄 API가 없어 **동시 6개 제한**(`shared/api/concurrency.ts`, Backend 권장 6~8), 캐시 키는 제품별 화면과 공유. 한 제품 실패는 그 줄에만 오류·다시 시도.
4. 0.12.0: 실행 결과의 `product_code`·`product_name`을 우선 표시(없으면 제품 목록).
5. 디자인 시스템(`frontend/docs/DESIGN_SYSTEM.md`, main에 새로 병합됨) 반영: 플로우차트 CSS의 글자 크기를 토큰으로(`--text-2xs`·`--text-xs`·`--text-sm`), 허용 목록 밖 기호(★ ⛓ ▶ ⏸ ⏹ ✕ ⊘)를 허용 기호(● ✓ ⚠ ! ○ …)와 글자로 교체.

## 2. 변경 파일
신규 `frontend/src/features/processes/{ProcessOverviewPage.tsx,processOverview.ts,FlowTabs.tsx}`, `src/shared/api/concurrency.ts`, `tests/component/{api-process-flow-ops,api-process-overview}.test.tsx`, `tests/unit/processOverview.test.ts` · 수정 `ProcessFlowPage.tsx`·`.module.css`, `FlowCanvas.tsx`·`.module.css`, `GraphDiagram.tsx`·`.module.css`(강조·이름·범례 숨김), `useProcessEditor.ts`(saveStep), `useDraftCreator.ts`·`writer.ts`(base_version_id, patchStep), `queries.ts`(useProcessGraphs), `src/app/router.tsx`, `src/features/runs/{runView.ts,RunDetailSections.tsx}`, 생성물(0.12.0), `tests/fakeProcess.ts`(단계 PATCH·base_version_id), `tests/live/live-process-flow-ui.test.tsx`(+1).

## 3. 자체 테스트(frontend/, 실제 결과)
| 명령 | 결과 |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | 종료 0 / 0 / 0 |
| `pnpm check:api` | OK(0.12.0 `f0250383ed65…`) |
| `pnpm test` | **46 파일 중 36 통과·10 건너뜀(라이브), 656 통과·70 건너뜀**, 151 s |
| 읽기 전용 live(8000, DEMO-WIRE) `live-process-flow-ui` | **3 통과**(6종 노드·간선 수 일치, 전체 공정 화면 6종·공용 설비 표, P04 단계 패널) |
| 화면(Edge headless, 실서버 DEMO-WIRE) | 전체 공정: 6개 공정이 한 화면, 공용 설비 63대가 사용처 9줄로 묶임. 처음 그린 화면에서 표가 길어 도식이 밀리고 긴 도식이 페이지를 넘는 문제를 찾아 고침(도식 먼저·표 접기·줄 안 가로 스크롤) |

**미실행:** 단계 PATCH·상태 전환·새 초안·배치 저장의 **실서버 쓰기**(이번 지시에 실서버 쓰기 범위가 없어 실행하지 않음, 가짜 서버로 검증). 병목 화면(0.12.0 `bottlenecks`)은 범위 밖으로 만들지 않았다.

## 4. Backend 전달(SendMessage, 2026-10-27)
단계 PATCH 사용 시작(본문·If-Match·실패 처리), `base_version_id` 사용, 프로젝트 전체 공정 화면과 **일괄 조회 CR 후보**(`GET /projects/{p}/process-graphs?version_ids=…|basis=…`, 선택: 설비 사용처 서버 계산) — 급하지 않으며 시점은 사용자 결정. 0.12.0 제품 코드 우선 사용.

## 5. 재검증 방법
1. `frontend/`에서 typecheck·lint·test·check:api·build.
2. `$env:LIVE_API="http://127.0.0.1:8000/api/v1"; pnpm test:live`(읽기).
3. 수동(전용 시험 데이터 권장): 플로우차트 초안에서 단계 이름을 고치고 1~2초 뒤 재조회 시 유지(그래프 PUT 없이), 노드 추가 후 단계 수정→"저장" 시 둘 다 유지, 검토 요청→승인→승인본에서 새 초안. 전체 공정에서 설비 강조 시 여러 제품의 해당 단계가 강조되는지.
