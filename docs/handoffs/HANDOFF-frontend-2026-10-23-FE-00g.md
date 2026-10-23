# HANDOFF-frontend-2026-10-23-FE-00g
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Frontend / FE-00(공정 편집 확인 창, 프로젝트 목록·생성 정적 화면) / A-01
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-frontend-fe00-g / be5f6dd(origin/main) / (커밋 후 기록)
- 계약 버전 / OpenAPI hash / 승인 scope: 없음(PENDING_REVIEW). API 연동은 사용자 지시로 제외. 참고용으로 backend 후보 sha256 `6bbad0dd…b66e`(BE-01c 인계 기재값)를 기준으로 필드를 맞췄으나 client는 생성하지 않았다.
- 수정 파일: frontend/**, docs/communication/request-from-frontend.md(신규), 이 문서

## 사용자 결정 (2026-10-23)
1. 표 편집은 "요약 표 + 단계별 편집 패널" 방식 유지(셀 안 직접 편집 안 함).
2. 처리 방식 변경으로 값이 사라질 때 확인 창을 추가.
3. Backend 세션과는 `docs/communication/request-from-frontend.md`(FE→BE)와 `request-from-backend.md`(BE→FE)로 소통. 작업 전 backend 요청 파일을 확인하고, backend의 답변도 함께 확인한다.

## 소통 파일 확인 결과
- 작업 시작 시 `request-from-backend.md`를 확인했다: 비어 있음(0바이트). 답변할 요청 없음.
- `request-from-frontend.md`에 backend 구현·인계 문서(BE-01a~c, CR §11~12, 스키마)를 근거로 R-FE-01~13 작성.
- 주의: 사용자 작업 폴더의 두 파일은 Git 미추적 상태로 존재한다. 이 세션은 worktree 격리 때문에 공유 경로에 직접 쓸 수 없어, 같은 경로의 worktree 파일을 만들어 커밋했다. 병합하려면 사용자 폴더의 빈 미추적 `docs/communication/request-from-frontend.md`를 먼저 삭제하거나 이동해야 한다(그렇지 않으면 병합이 "untracked file would be overwritten"로 실패). Backend 세션도 같은 방식이면 `request-from-backend.md`도 동일.

## 실제 구현 내용 (정적·예시 데이터, API 호출 없음)
- 공정 편집: 처리 방식·산출 방식 변경으로 입력한 값이 지워질 때만 확인 창("입력한 값이 사라집니다", 지워질 값 목록). 취소하면 선택·값 유지. 같은 단위(분)로 바뀌는 방식 사이는 값을 유지하고 확인하지 않는다.
- 프로젝트 목록(`/`): 코드·이름·시간대·내 역할·상태·설명, 검색(URL 상태), 로딩/오류/빈/검색 결과 없음/권한 없음, 프로젝트 열기(→ 설비·공간).
- 프로젝트 만들기(`/projects/new`): 조직·코드·이름·시간대·설명. backend `ProjectCreate` 제약(코드 64자·이름 200자·시간대 64자·설명 4000자, 설명은 선택)을 입력 검증에 반영. 건드린 필드만 오류 표시. 저장은 "계약 필요"로 비활성. 미저장 변경 보호.
- 임시 `HomePlaceholder`를 목록 화면으로 대체.
- 공통: `LinkButton`, `TextAreaField`. 프로젝트 전환 메뉴는 `ProjectView`에서 `toProjectOption`으로 만든다.

## 채택 결정과 근거
- 프로젝트 역할·상태는 backend 문자열을 그대로 표시한다(값 목록 미확정, R-FE-03). 한국어 라벨 변환은 값 목록이 확정된 뒤에 한다.
- 프로젝트 표시 색은 목록 순서로 정한 화면 임시 값이다(R-FE-09).
- `PROJECT_LIMITS`는 backend 스키마의 현재 값이다. 계약 승인 후 계약 값으로 교체한다.

## 미정 또는 임시 가정
- 설명 비움은 필드 생략으로 보낸다고 가정(R-FE-13). 조직 선택지는 `/me.organizations` 가정.
- 프로젝트 수정(PATCH, admin 전용)·보관·멤버 화면은 만들지 않았다.

## 상대 담당자에게 필요한 조치
- Backend: `request-from-frontend.md`의 P1 R-FE-01~04 우선 답변. 특히 OpenAPI 후보 전달 방법(R-FE-01)과 로컬 연결 방식(R-FE-02).
- 조정자: contracts/04 반영, contract-status 승인 기록(BE-01c 인계 기재).

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| pnpm vite --port 5199 + Edge 헤드리스 스크린샷(1280px) | frontend/ | Edge(설치본), Vite 8.3.5 | 0 | 프로젝트 목록·만들기 육안 확인 |
| pnpm typecheck | frontend/ | Node 24.17.0, TS 6.0.3 | 0 | 오류 없음 |
| pnpm lint | frontend/ | ESLint 10.13.0 | 0 | 경고·오류 없음 |
| pnpm test | frontend/ | Vitest 5.0.5 | 0 | 파일 8개, 110개 통과 |
| pnpm build | frontend/ | Vite 8.3.5 | 0 | JS 494KB(gzip 153KB) |
| python tools/check_workspace.py | 루트 | Python 3.12 | 0 | PASS(문서·구조만) |

## 미실행 테스트와 이유
- 실제 API 연동·계약 기반 Mock: 사용자 지시로 제외, 계약 미승인.
- 확인 창의 실제 키보드·포커스 복귀, 프로젝트 목록·만들기의 키보드·스크린리더, 500px 미만: 미실행(QA_CHECKLIST.md에 항목 추가).
- Backend 서버와의 호환성 확인(필드명·응답 모양)은 코드를 읽고 맞춘 것이며 실제 호출로 검증하지 않았다.

## 남은 위험·질문
- 프로젝트가 선택되지 않은 화면에는 사이드 메뉴가 없다(의도). 사용성 검토 필요.
- 자산·제품 화면의 일부 필드(용량·그룹·상태·포트 위치)는 backend `AssetOut`에 없다. FE-01 때 "계약 필요" 표시로 바꾸거나 revision 묶음을 기다려야 한다(R-FE-05).

## 다음 세션의 첫 작업
- `request-from-backend.md`와 `request-from-frontend.md`의 답변을 먼저 확인하고 반영.
- 계약 승인(또는 후보 전달) 후 FE-01: client 생성 도구 제안·승인 → generated client → 어댑터 → Mock → 실제 연동.
- 그 전까지: 프로젝트 설정(PATCH) 화면, 접근성 도구 도입 제안.
