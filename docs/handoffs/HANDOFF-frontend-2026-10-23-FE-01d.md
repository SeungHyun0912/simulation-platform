# HANDOFF-frontend-2026-10-23-FE-01d
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Frontend / FE-01d(자산 버전 용량·규칙 저장, 규칙 입력, 제출·승인·반려, 새 초안) + 계약 0.3.1 반영 / A-01
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-frontend-fe00-l / 138ad44(0.3.1 반영) / 5e0aad4
- 계약 버전 / OpenAPI hash / 승인 scope: **반영한 계약 0.3.1 / `4821718a8971abafb26ca1d672b857cde18794fd1131b0bd07d87d8b49c23b5c` / `project-assets-ports`, `asset-revisions`, `products-materials`** (`frontend/src/shared/api/generated/CONTRACT.json`)
- 수정 파일: `frontend/**`, `docs/communication/request-from-frontend.md`, 이 문서. 계약·backend·`request-from-backend.md`는 수정하지 않았다.

## 확인 사항 (사용자 보고용)
- 사용자가 "frontend도 머지했다"고 했지만 FE-01c 브랜치(`worktree-frontend-fe00-k`, 17156e1)는 origin/main·로컬 main에 없었다. 그래서 이 브랜치(`l`)에 병합(877e78b)해 이어 왔다. **main에 FE-01c가 들어갔는지 사용자가 확인해야 한다.**
- backend 소통 파일은 읽기만 했고 BE-REQ-015(공정 CR be04)에 FE 의견을 답했다. R-FE-14는 0.3.1 `/me.timezone`으로 `[x]`.

## 구현한 것 (FE-01d)
**버전 저장 (`PATCH /asset-revisions/{id}`)** — 자산 기본 정보와 **별도 ETag·충돌·저장**(`useRevisionEditor`)
- **바꾼 포트·필드만 전송**(`buildRevisionPatch`). `ports`는 서버가 `port_id`별로 병합하므로 바꾼 포트만 보낸다. 용량은 `finite`만 value·unit을 보내고 그 외 모드는 `mode`만, `status`는 보내지 않는다. 규칙(`dispatch_rule`/`release_rule`)은 판별 객체 **전체**를 교체한다. 변경이 없으면 요청이 없다.
- **If-Match는 편집을 시작한 시점의 버전 `row_version`.** 입력한 변경이 있는 동안에는 조회 캐시가 백그라운드로 바뀌어도 base를 바꾸지 않는다(서버가 412로 거부). 변경이 없으면 항상 서버(캐시) 값을 쓴다. 여러 버전을 오가도 입력 중인 편집본은 버전별로 보관된다.
- **412 충돌**: 입력 유지 + "용량 버전" 충돌 안내. "다시 불러오기"는 내 입력을 버리고, "내 변경을 유지"는 **항목(포트의 용량/이동 규칙/배출 규칙, 저장 용량) 단위 3-way 병합**(`mergeRevisionEdit`)이며 서버도 같은 항목을 바꿨으면 알려 준다. 병합 후 저장은 사용자가 다시 눌러야 한다. 자산 기본 정보 충돌과 서로 독립이다.
- **409 `VERSION_IMMUTABLE`**(다른 곳에서 검토 요청·승인됨): 저장하지 않고 "상태가 바뀌어 저장할 수 없습니다" 안내 + 버전 목록을 서버에서 다시 받아 화면을 맞춘다.
- **422**: `field_path`의 `/ports/{i}/…`는 **요청 본문의 ports 순서**이므로 보낸 본문으로 `port_id`를 찾아 해당 포트의 용량·이동 규칙·배출 규칙에 연결한다(`mapRevisionErrors`). 연결 못 한 것은 검증 패널. 입력을 고치면 그 항목의 오류가 사라진다.
- 403·404·428·네트워크 단절(저장 여부를 알 수 없음)은 `SaveErrorNotice`. 저장 중 버튼 비활성·연속 클릭 시 1회만 전송. 성공하면 응답으로 캐시를 갱신하고 서버가 다시 계산한 `issues`를 그대로 보여 준다(FE가 검증 결과를 만들지 않는다).
**규칙 입력 (`PortRuleInput`, 확장 제안 CR 승인됨)**
- 포트별 이동 조건(미정 / 목적지 가용 시 이동 D-U05)·대기(D-U05)·예약 여부, 배출 조건(미정 / 목적지 수용 시 배출 D-U06)·대기 중 설비 점유. 확정(D-U05·D-U06)과 미정(OPEN-003)을 선택지 문구에 근거와 함께 표시. **미정 세부 값(예약·점유)은 미정으로 시작**하고 FE가 채우지 않는다. 세부 값을 입력한 규칙을 "미정"으로 바꾸면 확인 창을 띄운다(취소하면 유지, 저장 전에는 서버에 가지 않음).
**전이 (`submit`·`approve`·`reject`, 모두 If-Match 필수)**
- 검토 요청은 **저장하지 않은 변경이 없을 때만** 가능(저장된 값이 검토 대상). 승인·반려는 관리자만 버튼이 보이고(편집자는 검토 요청만) **서버 403이 정본**(화면 역할이 오래되어 403이 오면 권한 없음 안내 + 상태 유지).
- **반려 사유 대화상자(`ReasonDialog`, 확장 제안 CR 승인됨)**: 사유 필수(공백만 불가, 1~1000자), 닫으면 입력 폐기·요청 없음. 반려된 버전은 계약대로 **초안으로 돌아가며** `rejection_reason`을 표시한다.
- 승인하면 이전 승인본이 `superseded`가 되고(서버가 계산) 버전·자산·목록 캐시를 다시 불러와 "현재 승인본"·이력이 갱신된다. 승인은 남은 `issues`로 막지 않는다(계약).
**새 초안**
- 버전이 없으면 "용량 설정 시작", 승인본만 있으면 "새 초안 만들기"(승인본 값 복사, 승인본이 없으면 용량은 모두 미정으로 시작 — 서버 동작). 다른 사용자가 먼저 만들어 **409 `REVISION_DRAFT_EXISTS`**가 오면 재시도하지 않고 **열린 버전으로 이동**한다.
**기타**
- 정적 예시 모드에서는 모든 버전 쓰기 버튼이 비활성(요청 없음). `KnownValueInput`에 서버 필드 오류용 `error` 속성 추가(입력 형식 오류가 우선).
- 가짜 서버(`tests/fakeApi.ts`)에 버전 상태·endpoint(GET/PATCH, 전이, 새 초안, 역할별 403, 자산 요약 동기화)를 추가했다. 응답은 생성 타입으로 선언되어 계약과 어긋나면 컴파일에서 걸린다.

## 채택 결정과 근거
- 버전 편집 상태를 `useRevisionEditor`로 분리해 화면은 상태만 보여 준다. 메시지·충돌 상태는 버전 id에 묶어 파생값으로 처리했다(효과 안 setState 금지 규칙 준수).
- `D-U05` 기본값: "미정 → 확정 규칙"으로 바꿀 때 `wait_at_in_if_busy=true`(확정 결정), 예약·점유는 미정. 계약이 필수값을 요구하기 때문이며 사용자가 바꿀 수 있다.
- 제출 가능 조건은 FE에서 "저장된 변경만 검토 대상"으로만 제한하고, issues 오류 여부는 서버 판정에 맡긴다(계약: 제출은 검증 오류가 있어도 가능).

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| pnpm typecheck | frontend | Node v24.17.0 / pnpm | 0 | `$CLAUDE_JOB_DIR/tmp/fe01d-typecheck.log` |
| pnpm lint | frontend | 동일 | 0 | `…/fe01d-lint.log` |
| pnpm test | frontend | 동일, Vitest 5 | 0 | 15 파일 통과·2 파일 skip(라이브), **298 통과 · 20 skip**(`…/fe01d-test.log`). 신규: `api-revision.test.tsx` 28건, `revisionPatch.test.ts` 12건 |
| pnpm build | frontend | 동일 | 0 | `…/fe01d-build.log` |
| pnpm check:api | frontend | 동일 | 0 | 생성물 해시 = `contract-status.json` |
| python tools/check_workspace.py | 루트 | Python 3.12 | 0 | PASS(문서·구조만, API/DB/SimPy 검증 아님) |

## 미실행 테스트와 이유
- **실서버 쓰기 검증(버전 PATCH·전이·새 초안): 미실행.** 삭제 endpoint가 없어 공유 개발 DB에 흔적(row_version·상태 전이·새 버전)이 남는다. 사용자 허락 시 시험 자산 하나(예: `EQ-008`)로 최소 범위만 실행한다. 지금까지의 검증은 **가짜 서버(생성 타입으로 선언)** 기준이므로 "서버 성공"으로 보고하지 않는다.
- 실서버 읽기 라이브 테스트(`LIVE_API`)·쓰기 라이브 테스트(`LIVE_WRITE`): 이번에 실행하지 않음(skip). FE-01c의 읽기 13건·쓰기 7건 결과는 그 인계 문서 참고.
- 브라우저 수동 확인(키보드 조작·스크린리더·대비)은 `frontend/docs/QA_CHECKLIST.md`의 새 항목이 모두 미확인.

## 남은 위험·질문
- 규칙의 기본값(위 D-U05)과 "미정" 표기가 도메인 의도와 같은지 사용자 확인이 필요하다.
- 승인 시 남은 경고(issues)를 요약해 보여 줄지(BE-REQ-015 부가 의견 ②)는 UX 결정 대기.
- 용량 단위 5종 외 단위(예: 길이·중량)가 필요한 용량이 생기면 계약 변경이 필요하다.
- FE-01c가 main에 들어갔는지 확인(위 "확인 사항").

## 상대 담당자에게 필요한 조치
- Backend: BE-REQ-015의 FE 답변을 읽고 `확인(BE)`을 남겨 주세요(노드 key 형식·임시 key↔id 대응 요청 포함). 실서버 쓰기 검증 허락 여부는 사용자에게 문의 중.

## 다음 세션의 첫 작업
- 제품·재료 연동(FE-01e, 계약 0.3.0 API) 또는 프로젝트 생성·수정 연동. 공정은 CR be04 승인·계약 0.4.0 이후.
민감값·실제 고객 도면·토큰을 인계 로그에 붙이지 않는다.
