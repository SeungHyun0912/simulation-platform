# HANDOFF-frontend-2026-10-23-FE-00
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Frontend / FE-00(FE-00-b 일부) / A-01(개발 환경)
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-frontend-fe00 / 9f32312 / (커밋 후 기록)
- 계약 버전 / OpenAPI hash / 승인 scope: 없음(PENDING_REVIEW, 승인 scope 없음). 생성 클라이언트 없음.
- 수정 파일: frontend/** (package.json, pnpm-lock.yaml, 설정, src, tests), 이 문서

## 실제 구현 내용
- 앱 스캐폴딩: React + TypeScript + Vite, TanStack Query, react-router, Radix(radix-ui), CSS Modules, Vitest.
- 디자인 토큰(`src/shared/styles/tokens.css`)과 전역 스타일.
- 앱 셸: 현재 프로젝트 상시 표시, 주 메뉴, 본문 건너뛰기, 계약 미승인 배너.
- 공통 컴포넌트: Button, PageHeader, StateNotice, VersionStatusBadge, KnownValueInput.
- `projectKey()` query key 헬퍼(항상 project/projectId로 시작).
- 화면은 모두 정적 자리표시자("계약 필요")이다. API 호출·Mock·실제 연동은 없다.

## 채택 결정과 근거 (사용자 승인 2026-10-23)
| 항목 | 결정 |
|---|---|
| 패키지 매니저 / Node | pnpm 11.9.0 / Node v24.17.0 (engines `>=24.17.0 <25`) |
| UI | Radix 헤드리스 프리미티브(`radix-ui` 1.8.1) + CSS 변수 토큰 + CSS Modules. 모두 MIT, 라이선스 비용 없음 |
| 스택 | TypeScript, Vite, TanStack Query, react-router 채택. **React Flow는 제외** |
| 테스트·검사 | Vitest + Testing Library(jsdom), ESLint(typescript-eslint). E2E 도구는 미도입 |
| TypeScript 6.0.3 고정 | typescript-eslint 8.72.0의 peer 범위가 `<6.1.0`이라 7.0.2를 쓸 수 없음. 지원되면 재검토 |
- 버전은 pnpm-lock.yaml로 고정한다. package.json은 caret 범위다.

## 미정 또는 임시 가정
- KnownValueInput의 모드(unknown/value/unlimited/not_applicable)는 03 계약의 값 상태·용량 모드를 UI용으로 단순화한 것이다. 서버 DTO와의 매핑(finite→value, not_allowed 등)은 계약 승인 후 확정한다.
- 입력 검증은 decimal 문자열 형식만 확인한다. 단위·item 정수 규칙은 계약 후 추가.
- 한글 글꼴(Pretendard 등)은 로컬 설치 시에만 쓰이고 웹폰트는 번들하지 않았다. 기본 폴백은 시스템 글꼴.

## 상대 담당자에게 필요한 조치
- 조정자/Backend: 첫 scope(project-assets-ports) DTO 확정(응답 래퍼, 목록 cursor, /me, field_meta 위치), `EDIT_CONFLICT`와 HTTP 412의 관계, 인증 방식(TECH-002).

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| pnpm typecheck | frontend/ | Node 24.17.0, TS 6.0.3 | 0 | 오류 없음 |
| pnpm lint | frontend/ | ESLint 10.13.0 | 0 | 경고·오류 없음 |
| pnpm test | frontend/ | Vitest 5.0.5 | 0 | 파일 2개, 테스트 14개 통과 |
| pnpm build | frontend/ | Vite 8.3.5 | 0 | dist 생성(JS 342KB, gzip 108KB) |

## 미실행 테스트와 이유
- 실제 API 연동 테스트: 승인된 계약·백엔드가 없어 미실행.
- Mock 기반 화면 테스트: 승인된 계약 예제가 없어 Mock 미구현.
- 브라우저 실제 렌더링·키보드 수동 확인, 스크린리더, 색 대비 측정, E2E: 미실행(`pnpm dev`로 띄워 보지 않음).

## 남은 위험·질문
- 색 대비는 토큰 값만 보수적으로 골랐을 뿐 도구로 측정하지 않았다.
- 대표 화면 2개(설비 목록, 설비 상세·편집)는 아직 없다. DataTable·QuantityInput·ValidationPanel·확인 대화상자·미저장 변경 보호·충돌 안내 컴포넌트도 미구현.

## 다음 세션의 첫 작업
- 사용자에게 현재 토큰·셸·공통 컴포넌트 검토를 받는다.
- 계약 승인 전까지: DataTable, QuantityInput, UnsavedChangesGuard를 정적 데이터로 구현하고 설비 목록·상세 정적 화면을 만든다.
- 계약 승인 후: FE-01(generated client, 승인 예제 기반 Mock, 실제 연동).
