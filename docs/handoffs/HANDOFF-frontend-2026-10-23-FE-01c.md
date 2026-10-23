# HANDOFF-frontend-2026-10-23-FE-01c
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Frontend / FE-01c(자산 기본 정보 저장·자산 생성) + 계약 0.3.0 반영 / A-01
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-frontend-fe00-k / 2682fa9(origin/main) → 00cf26e(0.3.0 병합 후) / (커밋 후 기록)
- 계약 버전 / OpenAPI hash / 승인 scope: **반영한 계약 0.3.0 / `a4610740d413de76664dff0ccf3f0d958fc96679fd3e05bb2440cca82aa78b48` / `project-assets-ports`, `asset-revisions`, `products-materials`** (`frontend/src/shared/api/generated/CONTRACT.json`)
- 수정 파일: `frontend/**`, `docs/communication/request-from-frontend.md`, 이 문서. 계약·backend·`request-from-backend.md`는 수정하지 않았다.

## 사용자 요청 반영: backend 최신 커밋 확인 (작업 중 전달됨)
- main에 병합된 backend 커밋(`00cf26e`)을 받아 계약이 **0.2.0 → 0.3.0**(제품·재료 8개 operation, `/me.projects[].status`)이 된 것을 확인했다.
- 재생성 전에는 `pnpm check:api`와 단위 테스트가 실패해 오래된 생성물을 막았다(안전장치 의도대로). `pnpm gen:api`로 재생성한 뒤 생성 타입이 `/me` fixture 3곳의 누락된 필수 `status`를 컴파일 단계에서 걸러 냈고 수정했다. 나머지 코드는 호환되어 변경이 없었다.
- 반영: `/me.status` → 전환 메뉴에서 보관 프로젝트를 "(보관됨)"으로 표시(제외하지 않음). 제품 API는 FE 제품 화면(정적 예시)과의 차이만 문서화하고 연동하지 않았다(BE-REQ-013 답변).
- backend 소통 파일은 읽기만 했고 BE-REQ-012·013·014에 답했다. R-FE-14(`/me`의 timezone)는 backend 미답변이라 `[ ]`로 두었다.

## 구현한 것 (FE-01c)
**자산 기본 정보 저장 (`PATCH /projects/{p}/assets/{id}`)**
- **바꾼 필드만 전송**(`buildAssetPatch`). 비운 선택 필드는 `null`(입력 없음), 빈 문자열은 보내지 않음, 정렬 순서는 숫자. `kind`·포트는 본문에 없음. 변경이 없으면 요청 자체가 없음.
- **If-Match는 항상 편집을 시작한 시점의 `row_version`**(훅 상태 `base.version`). 조회 캐시가 백그라운드에서 최신으로 바뀌어도 쓰지 않는다 → 다른 사용자의 변경을 서버가 412로 거부한다(테스트 있음).
- **412 충돌**: 입력 유지 + "자산 기본 정보" 충돌 안내(용량 버전 입력은 건드리지 않음). 선택지 2개:
  - 최신 내용으로 다시 불러오기: 내 입력 버림.
  - 내 변경을 유지하고 계속 편집: **필드 단위 3-way 병합**(`mergeInfoDraft`) — 내가 안 바꾼 필드는 서버 최신 값, 바꾼 필드는 내 값. 같은 필드를 서버도 바꿨다면 서버 값을 안내하고 저장 때 내 값으로 바뀐다. 병합 직후에는 저장하지 않고 새 버전으로 다시 저장. (병합 없이 "내 변경 유지"하면 안 바꾼 필드를 옛 값으로 덮어쓸 수 있어 이 방식을 택함)
- 409 `ASSET_CODE_CONFLICT`/422 → `field_path`를 폼 필드에 연결(연결 못 한 것은 검증 패널), 고치기 시작하면 해당 오류 제거. 403·404·401·428·5xx·네트워크 단절은 각각 다른 안내(`SaveErrorNotice`). 네트워크 단절은 "저장 여부를 알 수 없음".
- 저장 중 버튼 비활성·연속 클릭 시 1회만 전송. 성공 시 응답으로 상태·캐시 갱신, 목록 캐시 무효화. 조회자는 읽기 전용·저장 불가(서버 403이 정본).
- 정적 예시 모드에서는 저장하지 않음("저장 (정적 예시)" 비활성).
**자산 생성 (`POST /projects/{p}/assets`, `/projects/:projectId/assets/new`)**
- 종류별 본문(`buildAssetCreate`): 설비는 `equipment`, 저장공간·도킹은 `space`만. 포트는 보내지 않음(서버가 같은 트랜잭션에서 생성). 비운 선택 필드는 생략.
- 성공하면 상세로 이동(미저장 확인 창 없이). 409는 코드 필드 오류, 네트워크 단절 시 같은 코드로 목록을 재검색하는 링크 제공(backend 권고: 중복 생성 확인).
- 목록의 "자산 추가"는 관리자·편집자에게만 링크, 조회자는 비활성. 조회자가 생성 화면에 직접 들어가도 권한 안내만 보인다.
**기타**
- 가짜 서버(`tests/fakeApi.ts`)를 상태 있는 쓰기 서버로 확장(If-Match·412·409·422·428·201 흉내, 테스트마다 새 상태).
- 셸 배너가 계약 버전(생성물에서 읽음)과 현재 연결 범위를 정확히 안내.

## 실서버 검증 (공유 개발 DB — 범위 제한)
- 읽기 13건: 통과.
- **쓰기 7건**(`LIVE_WRITE=1`일 때만 실행): 시험 데이터 자산 **`EQ-025` 하나**에 PATCH 후 **원복**. 428·412(서버에 쓰이지 않음)·정상 저장(ETag=새 row_version, 어댑터 통과)·모델 null 지우기·409(`/code`)·422(`/name`·`/kind`·`/equipment/model_name`·빈 본문)·403(조회자)·404(비멤버) 모두 **가짜 서버와 같은 동작**. 원복 확인(메모·모델 비어 있음, 정렬 250). 부작용: `EQ-025`의 `row_version` 1→5, `updated_at` 변경.
- **자산 생성(POST)은 실서버로 실행하지 않았다.** 삭제 endpoint가 없어 흔적이 남기 때문이다. 가짜 서버 검증 + 본문 타입의 컴파일 검사로만 확인.

## 채택 결정과 근거
- 쓰기 로직을 `useInfoEditor`/`useAssetWriter`/`infoDraft`로 분리해 화면은 상태를 보여 주기만 한다. 순수 함수(`buildAssetPatch`·`mergeInfoDraft`·`mapServerErrors`·`buildAssetCreate`)는 단위 테스트(19건).
- 충돌 후 병합은 필드 단위로 자동 처리하되 **저장은 사용자가 다시 눌러야** 한다(자동 덮어쓰기 금지 원칙).

## 미정 또는 임시 가정
- 라이브 쓰기 테스트의 대상(`EQ-025`)과 id는 backend 시험 데이터 시드에 의존한다.
- `/me`의 역할 문자열은 잠정(TECH-006). 버튼 노출만 제한하며 최종 판정은 서버.
- 병합 시 "서버가 필드를 지운 경우"도 서버 값(비어 있음)으로 맞춘다.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| pnpm gen:api / check:api | frontend/ | openapi-typescript 7.13.0 | 0 / 0 | 계약 0.3.0 재생성·일치(재생성 전 check는 실패 확인) |
| pnpm typecheck | frontend/ | TS 6.0.3 | 0 | 오류 없음 |
| pnpm lint | frontend/ | ESLint 10.13.0 | 0 | 경고·오류 없음 |
| pnpm test | frontend/ | Vitest 5.0.5 | 0 | 파일 13개 통과·2개 건너뜀(라이브), 테스트 258개 통과·20개 건너뜀 |
| LIVE_API=… pnpm test:live | frontend/ | 실서버(backend 세션) | 0 | 읽기 13개 통과(쓰기 7개는 LIVE_WRITE 없이 건너뜀) |
| LIVE_API=… LIVE_WRITE=1 vitest run tests/live/live-write.test.ts | frontend/ | 실서버, 개발 DB | 0 | 쓰기 7개 통과, EQ-025 원복 확인 |
| vite(api 모드, proxy) + Edge 헤드리스 스크린샷(1280px) | frontend/ | Vite 8.3.5 | 0 | 자산 추가 화면·자산 목록 육안 확인, vite 종료 확인 |
| pnpm build | frontend/ | Vite 8.3.5 | 0 | 빌드 성공 |
| python tools/check_workspace.py | 루트 | Python 3.12 | 0 | PASS(문서·구조만) |

## 미실행 테스트와 이유
- 자산 생성의 실서버 실행(위), 버전(용량·규칙) 저장·전이: FE-01d 전이라 미구현.
- 브라우저 수동 확인(키보드·포커스·스크린리더·색 대비), 500px 미만 폭, 충돌·병합 흐름의 실제 화면 조작: 미실행(QA_CHECKLIST.md에 추가). 이 흐름들은 jsdom 컴포넌트 테스트로만 검증했다.

## 남은 위험·질문
- **사용자 결정:** 실서버로 자산 생성을 한 번 확인해도 되는지(`DEV-PROJECT`에 자산 1건이 남음).
- 충돌 병합 안내 문구("저장하면 아래 항목은 내 값으로 바뀝니다")가 이해하기 쉬운지 실제 사용자 검토가 필요하다.
- 같은 사용자가 두 탭에서 편집하는 경우 등 다중 탭 동기화는 다루지 않았다.

## 다음 세션의 첫 작업
- `request-from-backend.md`(최신 worktree 또는 main)와 `request-from-frontend.md`를 읽고 새 답변 반영(R-FE-14 등).
- FE-01d: 버전 용량 저장(PATCH, 버전 ETag)·규칙 입력(확장 제안 CR 승인됨, 라벨 BE-REQ-008)·제출/승인/반려(사유 입력 창)·새 초안(`REVISION_DRAFT_EXISTS`→열린 버전으로 이동)·`VERSION_IMMUTABLE` 처리.
