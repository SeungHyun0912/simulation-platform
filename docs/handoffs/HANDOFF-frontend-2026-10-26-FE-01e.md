# HANDOFF-frontend-2026-10-26-FE-01e
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Frontend / FE-01e(제품 목록·상세·생성·수정 연결) + 계약 0.4.0 반영 / A-01
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-frontend-fe00-m / 460c364(origin/main, PR #19 병합 후) / d5e5575
- 계약 버전 / OpenAPI hash / 승인 scope: **반영한 계약 0.4.0 / `1da94db09abb06bb0a08cc6ee40c58d97f5aac85c28d3ec0364e7a4f4b77cb45` / `project-assets-ports`, `asset-revisions`, `products-materials`, `process-versions`** (`frontend/src/shared/api/generated/CONTRACT.json`)
- 수정 파일: `frontend/**`, `docs/communication/request-from-frontend.md`, 이 문서. 계약·backend·`request-from-backend.md`는 수정하지 않았다.

## 시작 확인 (세션 시작 절차)
- FE-01c(`17156e1`)·FE-01d(`e69667c`)는 **PR #19로 main에 병합된 것을 확인**했다(이전 인계의 "FE-01c가 main에 없음" 우려는 해소). 새 브랜치 `worktree-frontend-fe00-m`을 origin/main에서 만들었다.
- 계약이 0.3.1 → **0.4.0**(공정 버전·그래프, BE-04a, PR #18 병합)으로 올라 `pnpm gen:api`로 재생성했다. 추가만이라 컴파일 오류 없이 통과(`check:api` 0).
- `request-from-backend.md`(main 기준)에는 BE-REQ-015 `확인(BE)`가 아직 없다. Backend는 FE 의견 전에 권장안으로 0.4.0을 구현했다고 적었다. backend worktree의 더 최신 파일은 읽지 못했다(공통 worktree 명령 제한으로 목록 조회 불가).

## 구현한 것 (FE-01e)
- **제품 목록**(`useProductList`): 서버 쿼리 `q`·`sort(code|name, -)`·`include_archived`·`limit/cursor`가 URL 상태에서 그대로 만들어진다. 더 보기(cursor), 로딩·빈·오류·검색 결과 없음, 보관됨 표시, 조회자는 "제품 추가" 비활성. 열: 코드·이름·규격(미정은 "미정")·최신 공정 버전(서버 요약, 없으면 "공정 없음")·승인본.
- **제품 상세·수정**(`useProductEditor`, 자산 기본 정보와 같은 규칙): 바꾼 필드만 PATCH, 규격 미정=`null`, 메모 비움=`null`, 빈 문자열은 보내지 않음, If-Match는 편집을 시작한 시점의 `row_version`, 412는 항목 단위 3-way 병합(저장은 사용자가 다시 누름), 409 `PRODUCT_CODE_CONFLICT`·422는 `field_path`로 필드 연결, 403·404·428·네트워크 단절 안내, 저장 중 중복 전송 방지. 규격은 "미정"과 값을 따로 다루며 미정을 해제하고 비우면 오류다.
- **제품 생성**(`ProductCreatePage`, `/projects/:id/products/new`): 규격은 **미정으로 시작**, 미정 규격·빈 메모는 본문에서 생략, 성공하면 상세로 이동, 연결이 끊기면 같은 코드로 목록을 재검색하는 링크(중복 생성 방지).
- **정적 예시와 API 모드 분리**: API 모드의 제품 상세 "공정 버전"은 서버 요약(최신·현재 승인본)만 보이고 **정적 공정 편집 화면 링크를 열지 않는다**(서버 데이터와 정적 예시를 섞지 않음). 정적 모드는 기존 동작을 유지한다.
- **FE 버그 수정(테스트로 발견):** `classifyError`가 `PRODUCT_CODE_CONFLICT`·`MATERIAL_CODE_CONFLICT`를 "중복"으로 분류하지 않아 코드 필드 오류로 연결되지 않던 것을 고쳤다(`errors.ts`, 분류 표 단위 테스트에 추가).
- 가짜 서버(`tests/fakeApi.ts`)에 제품 상태·endpoint(목록·상세·생성·수정, cursor 조건 서명, 보관, 코드 중복 409, 역할별 403, If-Match/412)를 추가했다. 응답은 생성 타입으로 선언되어 계약과 어긋나면 컴파일에서 걸린다.
- 상단 배너 문구를 현재 연결 범위(자산·제품 연결, 공정·재료 미연결)로 고쳤다.

## 범위 밖(의도적으로 하지 않은 것)
- **재료 화면:** FE에 재료 화면이 없다. 길이·중량·단위 수·가닥 수의 판별 입력(`unknown|known|not_applicable`)이 필요한 새 화면 설계이므로 "기본 컴포넌트와 대표 화면 검토 전 대량 구현 금지" 규칙에 따라 별도 작업(FE-01f)으로 남긴다. 필요하면 공통 컴포넌트 확장 제안(CR-frontend)을 먼저 올린다.
- **공정 연동:** 0.4.0 API는 있으나 FE 공정 화면은 정적 예시이며 어긋남 목록(CR be04 §5)을 반영한 모델 재설계가 먼저 필요하다.

## 채택 결정과 근거
- 제품 편집 로직은 자산 기본 정보와 같은 구조(`productDraft`·`useProductEditor`·`useProductWriter`)로 분리해 순수 함수를 단위 테스트했다.
- 목록의 공정 요약은 정적 `versions`가 아니라 서버의 `latest/current_process_version`을 쓴다(0.4.0). 정적 샘플은 `versions`에서 같은 요약을 만들어 두 모드가 같은 열을 쓴다.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| pnpm gen:api | frontend | Node v24.17.0 / pnpm | 0 | 생성 완료: contract 0.4.0, sha256 `1da94db0…cb45` |
| pnpm typecheck | frontend | 동일 | 0 | `$CLAUDE_JOB_DIR/tmp/fe01e-typecheck.log` |
| pnpm lint | frontend | 동일 | 0 | `…/fe01e-lint.log` |
| pnpm test | frontend | 동일, Vitest 5 | 0 | 17 파일 통과·2 파일 skip(라이브), **351 통과 · 23 skip**(`…/fe01e-test.log`). 신규: `api-products.test.tsx` 33건, `productDraft.test.ts` 18건 + 오류 분류 2건(표 항목) |
| pnpm build | frontend | 동일 | 0 | `…/fe01e-build.log` |
| pnpm check:api | frontend | 동일 | 0 | 생성물 해시 = `contract-status.json` |
| python tools/check_workspace.py | 루트 | Python | 0 | `…/fe01e-workspace.log`, 문서·구조만 검증(API/DB/SimPy 검증 아님) |

## 미실행 테스트와 이유
- **실서버 검증 전부 미실행.** 작성 시점에 개발 서버(`http://127.0.0.1:8000/api/v1/health`)가 응답하지 않았다. 따라서 이번에 추가한 **읽기 전용 라이브 테스트 3건(`tests/live/live-api.test.ts`, 제품)은 작성만 했고 실행하지 않았다**(`LIVE_API` 없이 skip). 제품 쓰기의 실서버 검증도 하지 않았다. 지금까지의 검증은 **가짜 서버(생성 타입으로 선언)** 기준이며 "서버 성공"으로 보고하지 않는다.
- 브라우저 수동 확인(키보드·스크린리더·대비·좁은 화면)은 `frontend/docs/QA_CHECKLIST.md` §8이 모두 미확인.

## 남은 위험·질문
- 서버가 떠 있을 때 라이브 읽기 테스트가 시험 데이터(P-001~008 홀수 규격 입력·짝수 미정)와 실제로 맞는지 확인이 필요하다. 시드가 바뀌었으면 상수를 맞춘다.
- 재료 화면 범위·우선순위(FE-01f)와 프로젝트 생성·수정 연동 순서는 사용자 결정 대기.
- BE-REQ-015(공정 CR) `확인(BE)` 대기: 내 의견이 구현된 0.4.0과 어긋나는 곳이 있는지.

## 상대 담당자에게 필요한 조치
- Backend: 개발 서버 재기동 여부 알림(이 파일 BE-REQ-014 방식), BE-REQ-015 `확인(BE)` 작성. 요청 상세는 `request-from-frontend.md`의 FE-REC-017.

## 다음 세션의 첫 작업
- 서버가 떠 있으면 `$env:LIVE_API="http://127.0.0.1:8000/api/v1"; pnpm test:live`로 읽기 전용 라이브 테스트 실행(쓰기는 사용자 허락 후, 시험 자산·제품 하나로 최소 범위).
- 그 뒤 FE-01f(재료 화면 설계 확인 → 필요 시 CR-frontend) 또는 프로젝트 생성·수정 연동.
민감값·실제 고객 도면·토큰을 인계 로그에 붙이지 않는다.
