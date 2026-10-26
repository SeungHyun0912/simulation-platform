# HANDOFF-frontend-2026-10-26-FE-03a
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Frontend / FE-03a(재료 목록·상세·생성·수정 연동) + 공정 `approve` 실서버 검증 / A-01
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-frontend-fe00-m / 81aef41(FE-02b 종료) / 061caa6
- 계약 버전 / OpenAPI hash / 승인 scope: **0.4.0 / `1da94db09abb06bb0a08cc6ee40c58d97f5aac85c28d3ec0364e7a4f4b77cb45` / `products-materials`(재료 API) 포함 4개 scope** (변경 없음)
- 수정 파일: `frontend/**`, `docs/communication/request-from-frontend.md`, 이 문서. 계약·backend·`request-from-backend.md`는 수정하지 않았다.

## 사용자 요청 반영
1. **"P-007로 approve 실행"** → 실행했다(아래). 되돌릴 수 없는 작업이라 `LIVE_APPROVE=1`일 때만 실행하는 전용 테스트로 만들고, 이미 승인 이력이 있으면 건너뛰게 했다.
2. **"재료 화면을 먼저 개발, 반응형은 고려하지 않고 전체 화면(FullScreen)으로 먼저"** → 재료 화면을 전체 화면 기준으로 구현했고 좁은 화면 검증은 하지 않았다(QA §11에 보류로 기록). 공통 컴포넌트가 이미 가지고 있던 반응형 처리는 그대로 두었다.

## `approve` 실서버 검증 결과 (P-007, 사용자 허락)
- 새 초안 → FE가 만든 그래프 저장 → knowledge 검증(오류 0) → 제출 → 편집자·조회자 승인 **403**, If-Match 없음 **428**, 오래된 버전 **412**, 관리자 승인 **200** → 승인본 수정 **409 `VERSION_IMMUTABLE`** → 제품의 `current_process_version`·`latest_process_version`이 승인본으로 바뀜 → 승인본에서 새 초안(그래프 **새 id 복사**, `base_version_id` 기록, 열린 버전 있으면 409 `PROCESS_DRAFT_EXISTS`) → 제출·승인 → **이전 승인본이 `superseded`**.
- 결과 상태: P-007 = v1(대체됨), v2(승인본). **되돌릴 수 없다.** 재실행하면 "이미 승인 이력이 있어 건너뜁니다"로 통과한다(승인본이 늘지 않음). 가짜 서버와 다른 동작은 없었다.

## 구현한 것 (재료, `frontend/src/features/materials/`)
- **모델:** `materialView.ts`(뷰·초안·검증: 코드 64·이름 200·형태 100·메모 4000자), `materialMappers.ts`, `materialDraft.ts`(PATCH·생성 본문, 3-way 병합, 오류 매핑). 기본 규격(길이·중량·단위 수·가닥 수)은 공정의 원자재·완제품 단위와 같은 값 객체라 `UnitSpecEdit`·`UnitSpecEditor`를 재사용한다.
- **저장 규칙(계약 0.3.0):** 바꾼 필드만 보낸다. `default_spec`은 **바꾼 하위 필드만**(서버가 보낸 필드만 교체; 빈 객체·null은 422), 확정값을 미정으로 되돌리면 `{mode:"unknown"}`, 해당 없음은 `{mode:"not_applicable"}`, 개수는 JSON 정수, 길이·중량은 decimal 문자열. 메모를 비우면 null, `code`·`name`·`form`은 null 불가. If-Match는 편집을 시작한 `row_version`, 412는 항목 단위 병합(규격은 값별, 서버 값을 "미정" 등으로 알림), 409 `MATERIAL_CODE_CONFLICT`·422는 입력에 연결, 403·404·428·네트워크 단절 안내, 중복 전송 방지.
- **화면:** 사이드 메뉴 "재료", 목록(검색·정렬·보관 포함·더 보기, 규격 네 값을 미정·해당 없음·확정으로 구분), 상세(기본 정보·기본 규격·충돌·역할), 생성(규격 모두 미정으로 시작, 값을 정한 항목만 본문에 담고 비운 메모는 생략, 네트워크 단절 시 같은 코드 재검색 링크). 정적 모드는 예시 재료 4건(M-001~004, 백엔드 시험 데이터와 같은 모양)을 쓴다.
- **기타:** 공통 `KnownValueInput` 정렬 보정(`align-content: start`), 상단 배너에 재료 반영, 가짜 서버(`tests/fakeMaterials.ts`)에 재료 endpoint·규칙 추가.

## 실서버 검증 (공유 개발 DB, 사용자 허락)
- 재료 읽기: 목록·상세 어댑터(미정·해당 없음·확정 구분), 검색·정렬, 프로젝트 B 격리(404)·비멤버 404, 조회자 읽기.
- 재료 쓰기(M-003 수정 후 원복, 전용 재료 FE-LIVE-M1 한 건): 428·412, FE가 만든 PATCH 본문 수락(보낸 규격 필드만 교체·나머지 유지), **개수를 문자열로 보내면 422**, 빈 `default_spec`·null·`form` null/빈 문자열 422, 코드 중복 409, 조회자 403, 생성 본문 수락 후 재생성 409, 화면 조작으로 M-003 편집·화면으로 원복.
- 라이브 전체 **55건**(읽기 29·쓰기 26) 통과. 가짜 서버와 다른 동작은 없었다.
- **남은 흔적:** 재료 `FE-LIVE-M1`(삭제 불가), M-003 `row_version` 증가(값은 원복), P-007 승인 이력, P-006 공정 초안(이전).

## 채택 결정과 근거
- 규격 입력은 별도 새 컴포넌트를 만들지 않고 공정 단위 입력을 재사용했다(같은 계약 값 객체, 기본 컴포넌트 우선 규칙). 입력 라벨은 "기본 규격 길이" 등으로 달랐다.
- 재료 `form`은 계약이 자유 텍스트라 텍스트 입력이다(허용값 목록은 없음).
- 단위 수의 "단위"는 보빈 등 한 번에 다루는 단위의 개수이며 길이·중량·가닥 수와 환산하지 않는다는 안내를 화면에 둔다.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| pnpm typecheck / lint / build / check:api | frontend | Node v24.17.0 / pnpm | 0 / 0 / 0 / 0 | `$CLAUDE_JOB_DIR/tmp/fe03-*.log` |
| pnpm test | frontend | Vitest 5 | 0 | 24 파일 통과·7 파일 skip(라이브), **518 통과 · 55 skip**(`fe03-test.log`). 신규: `materialDraft.test.ts` 16건, `materials.test.tsx` 14건, `api-materials.test.tsx` 29건 |
| LIVE_API=… LIVE_WRITE=1 LIVE_APPROVE=1 pnpm vitest run tests/live | frontend | 개발 서버 127.0.0.1:8000, AUTH_MODE=local | 0 | 7 파일 **55 통과**(`fe03-live.log`). `approve` 테스트는 최초 실행에서 실제로 승인했고 이후는 건너뜀 |
| Edge 헤드리스 스크린샷(1440px, 정적 재료 상세) | frontend + Vite | 정적 모드 | — | 전체 화면 레이아웃 정상(`tmp/m-detail.png`, `m-list.png`) |
| python tools/check_workspace.py | 워크트리 루트 | Python | 0 | `fe03-workspace.log`, 문서·구조만 검증(API/DB/SimPy 검증 아님) |

## 미실행·미확인
- 좁은 화면(≤768px)은 사용자 결정으로 이번 범위에서 제외(미확인). 키보드·스크린리더·대비 수동 확인 미확인(`QA_CHECKLIST.md` §11).
- `KnownValueInput` 정렬 보정(`align-content: start`)은 Edge 헤드리스 캡처(`tmp/m-detail2.png`)로 4열 규격 입력의 라디오 줄 높이가 맞는 것을 확인했다.

## 남은 위험·질문
- 재료 `form` 허용값이 정해지면 계약 변경과 함께 선택 입력으로 바꾼다.
- 프로젝트 생성·수정은 아직 연결하지 않았다.
- BE-REQ-015·018·019·020 `확인(BE)` 대기.

## 상대 담당자에게 필요한 조치
- Backend: `request-from-frontend.md`의 BE-REQ-020을 읽고 `확인(BE)`를 남겨 주세요. 시험 데이터 초기화 시 P-007·FE-LIVE-M1·P-006 흔적을 알려 주세요.

## 다음 세션의 첫 작업
- 사용자 선택: 프로젝트 생성·수정 연동, 반응형 레이아웃 복원(보류 해제), 공정 이동 규칙 `network_route` 세부 입력 등 계약 후속.
민감값·실제 고객 도면·토큰을 인계 로그에 붙이지 않는다.
