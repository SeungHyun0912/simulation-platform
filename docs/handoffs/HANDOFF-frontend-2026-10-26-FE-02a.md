# HANDOFF-frontend-2026-10-26-FE-02a
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Frontend / FE-02a(공정 버전·그래프·단계 연동 화면, 실서버 쓰기 검증) / A-01
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-frontend-fe00-m / 03aefd8(FE-01e 종료, main에는 d5e5575까지 병합 전) / (커밋 후 기록)
- 계약 버전 / OpenAPI hash / 승인 scope: **0.4.0 / `1da94db09abb06bb0a08cc6ee40c58d97f5aac85c28d3ec0364e7a4f4b77cb45` / `project-assets-ports`, `asset-revisions`, `products-materials`, `process-versions`**
- 수정 파일: `frontend/**`, `docs/communication/request-from-frontend.md`, 이 문서. 계약·backend·`request-from-backend.md`는 수정하지 않았다.

## 사용자 요청 반영
- "공정 연동 화면을 먼저, 재료·프로젝트 생성은 API로 기본 데이터만 받아 오면 표현되니 서비스 기능을 확인할 수 있는 부분 먼저" → 공정을 우선 구현했다. 재료 화면·프로젝트 생성·수정은 하지 않았다.
- "실제 서버 쓰기 검증 허락(서버가 개발 중이라 그때그때 다름)" → 개발 서버가 응답하는 동안 쓰기 라이브 검증을 **P-006 하나의 초안**으로 범위를 좁혀 실행했다.

## 구현한 것
**데이터·모델 (`frontend/src/features/processes/`)**
- `processDoc.ts`: 서버 그래프 문서(`GraphDoc`)와 단계 DTO를 **그대로 편집**한다(화면이 모르는 필드도 `PUT graph` 전체 교체에서 빠지지 않는 왕복 안정). 측정값 `{mode, value}`↔입력 어댑터(개수는 JSON 정수, 입력 중 잘못된 값은 지우지 않고 저장 전 검증이 막음). 직선 구조 `parseLinear`/`buildLinear`와 단계 추가·삭제·이동·다음 위치 변경(기존 노드·간선 id·이동 규칙 보존).
- `processView.ts`: 라벨(코드값은 계약 그대로), 표시 문구(미정은 0이 아니라 "미정"), 단위(원자재·완제품) 입력과 PATCH 본문(바꾼 필드만), 클라이언트 **형식** 검증(미정 경고는 서버 `issues`가 정본, FE가 만들지 않음).
- `processDraft.ts`: 노드 단위 3-way 병합, 그래프·단위 저장 422의 `field_path`(요청 본문 기준)를 노드·간선 id와 단위 입력에 매핑.
- `queries.ts`/`writer.ts`/`useProcessEditor.ts`/`useDraftCreator.ts`: 버전 목록·상세+그래프·자산 선택지(모든 페이지), 새 초안·그래프 PUT·단위 PATCH·전이·검증, 편집 상태 훅.
**화면**
- `ProcessEditorPage`(두 모드 공용): 단계 표(설비 코드·처리·준비·산출·다음 위치·검증 개수), 단계 편집 패널, 원자재·완제품 단위, 상태 전환(검토 요청·승인·반려 사유 대화상자·새 초안), 검증 실행(지식/실행 가능 범위), 서버 검증 결과 표시, 충돌 안내.
- `StepEditPanel`: 공정명·작업 종류·처리기 버전, **자원 요구**(설비 후보는 자산 id, 선택 방식·수량·확인 상태 기본 미확인), 처리 시간(5종), 준비·공급 대기, 산출(6종 + 수량 기준·계산 방식), 투입·인계·잔여, 다음 위치(공간 없음/위치 미정/특정 공간). 값이 사라지는 방식 변경은 확인 창.
- `ProcessVersionsSection`: 제품 상세의 공정 버전 목록·새 초안(열린 버전이 있으면 비활성, 409는 열린 버전으로 이동). 정적 예시도 같은 모델·화면을 쓴다(저장 등 쓰기만 비활성).
**저장 규칙**
- 단위가 바뀌었으면 `PATCH` 후 그래프가 바뀌었으면 `PUT`. 둘 다 같은 버전 `row_version`(If-Match)이며 PATCH가 올린 버전을 이어 쓴다. 단위만 성공하고 그래프가 실패하면 단위는 저장된 것으로 base를 갱신해 재전송하지 않는다.
- 412는 노드 단위 병합(구조가 겹치게 바뀌면 자동 병합 없이 다시 불러오기만), 409 `VERSION_IMMUTABLE`·`PROCESS_DRAFT_EXISTS`는 상태 안내와 화면 동기화, 422는 단계 행에 연결, 제출·승인 거부(422 `PROCESS_VALIDATION_FAILED`)는 서버 항목을 단계에 연결.
- 직선이 아닌 그래프(분기·합류·선후/공급 간선·연속 buffer)는 단계 **내용**만 수정하고 구조는 서버에서 받은 그대로 보존해 되돌려 보낸다.
**기타 변경**
- `client.put` 추가, `PROCESS_DRAFT_EXISTS` 오류 분류, `ValidationIssue`는 `entity_id`로 단계에 연결.
- 정적 공정 예시를 새 모델로 교체하고 제품 모델에서 정적 전용 `versions`를 제거했다(요약 `latest/current_process_version`으로 통일).
- 가짜 서버(`tests/fakeProcess.ts`)에 공정 endpoint·규칙을 추가했다(생성 타입으로 선언).

## 실서버 검증 (공유 개발 DB, 사용자 허락)
- 읽기: 24건(자산·제품·공정·화면 렌더) 통과. 쓰기: 16건 통과 — 자산 EQ-025(원복) 7건 + **공정 P-006 9건**(API 8건 + 화면 조작 1건): FE가 만든 그래프 본문 수락과 왕복 안정, 그래프 422 매핑(저장되지 않음), 428·412, 단위 PATCH(JSON 정수)·422 매핑, 검증, 제출 후 `VERSION_IMMUTABLE`, 조회자 403·비멤버 404, 반려, 화면 조작으로 저장→재저장(ETag 연쇄)→검토 요청→반려. 두 번 연속 실행해도 통과(같은 열린 초안을 재사용).
- **가짜 서버와 다른 동작은 발견하지 못했다.**
- **남은 흔적:** P-006에 공정 초안 v1 하나(제출·반려로 `row_version` 증가, 단계 "[FE 시험] …" 하나). **`approve`는 되돌릴 수 없어 실서버에서 실행하지 않았다**(가짜 서버 테스트만).

## 채택 결정과 근거
- 단계 저장은 단계 `PATCH`가 아니라 `PUT graph` 하나로 통일했다: 원자 저장·하나의 If-Match·구조 변경과 같은 경로. 대신 항상 전체 그래프를 보내므로 서버가 준 문서를 그대로 보존한다.
- 구조 편집은 직선에만 허용한다(BE-REQ-015 FE 답변). 그래프 캔버스는 별도 설계.
- 자원 후보 확인 상태(eligibility)는 확인됨으로 가정하지 않고 미확인으로 시작한다. 준비·대기 시점을 바꿀 때 시간은 미정에서 시작한다(0분이 아님).

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| pnpm typecheck / lint / build / check:api | frontend | Node v24.17.0 / pnpm | 0 / 0 / 0 / 0 | `$CLAUDE_JOB_DIR/tmp/fe02-*.log` |
| pnpm test | frontend | Vitest 5 | 0 | 19 파일 통과·4 파일 skip(라이브), **416 통과 · 40 skip**(`fe02-test.log`) |
| LIVE_API=… LIVE_WRITE=1 pnpm vitest run tests/live | frontend | 개발 서버 127.0.0.1:8000, AUTH_MODE=local | 0 | 4 파일 **40 통과**(`fe02-live.log`) |
| python tools/check_workspace.py | 워크트리 루트 | Python | 0 | PASS(Markdown 88·JSON 50·링크 142), 문서·구조만 검증(API/DB/SimPy 검증 아님) |
| Edge 헤드리스 스크린샷(데스크톱 1280px) | frontend + Vite 개발 서버 | 실서버 데이터(P-004 초안) | — | 레이아웃 정상 확인(`tmp/p-desktop.png`) |

## 미실행·미확인
- **`approve` 실서버 검증: 미실행**(승인본이 영구히 남음, 전용 제품과 사용자 허락이 필요).
- **좁은 화면(≤768px) 레이아웃: 미확인** — Edge 헤드리스 최소 창 너비 때문에 390px 캡처가 오른쪽이 잘려 판정할 수 없었다. `QA_CHECKLIST.md` §9에 남겼다.
- 키보드·스크린리더·대비 수동 확인은 모두 미확인(§9).

## 남은 위험·질문
- 서버는 계속 개발 중이라 라이브 테스트가 계약 변경으로 깨질 수 있다(깨지면 `pnpm gen:api`·시드 id 확인 후 조정). 라이브 테스트는 제품을 **코드로** 찾는다(제품 id가 난수).
- `edge.movement_rule`(이동 규칙)·잔여 규칙 일부는 보존만 하고 편집하지 않는다. 우선순위는 사용자 결정.
- BE-REQ-015 `확인(BE)` 대기(구현된 0.4.0과 FE 의견이 어긋나는 곳).

## 상대 담당자에게 필요한 조치
- Backend: `request-from-frontend.md`의 BE-REQ-018을 읽고 키 형식·`approve` 검증용 제품·목록 limit 질문에 답해 주세요. 시드를 초기화하면 알려 주세요.

## 다음 세션의 첫 작업
- 사용자 선택: 재료 화면, 프로젝트 생성·수정, 공정 `approve` 실서버 검증(전용 제품 필요), 이동 규칙 편집.
민감값·실제 고객 도면·토큰을 인계 로그에 붙이지 않는다.
