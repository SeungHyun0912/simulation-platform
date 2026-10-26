# React 프런트엔드
상태: 앱 골격(셸·토큰·공통 컴포넌트 일부)만 있고 화면은 정적 자리표시자입니다. API 연동·Mock은 없습니다.
채택(2026-10-23 사용자 승인): pnpm, Node v24.17.0, TypeScript, Vite, TanStack Query, react-router,
Radix 프리미티브 + CSS Modules, Vitest. React Flow는 제외(공정 그래프 단계에서 재검토).

## 명령 (frontend/ 에서 실행, 결과는 docs/handoffs 참고)
```bash
pnpm install
pnpm dev        # 개발 서버
pnpm typecheck  # tsc --noEmit
pnpm lint       # eslint
pnpm test       # vitest run
pnpm build
pnpm gen:api    # 승인된 계약(contracts/openapi.json)에서 API 타입 생성. 해시가 contract-status.json과 다르면 중단
pnpm check:api  # 생성물이 승인 스냅샷과 같은지 확인(파일을 바꾸지 않음)
pnpm test:live  # 실제 API 서버 대상 읽기 전용 검증(LIVE_API 환경변수가 없으면 건너뜀)
                # 쓰기 검증은 공유 개발 DB를 바꾸므로 LIVE_WRITE=1을 함께 줄 때만 실행(시험 자산 EQ-025만 PATCH 후 원복, 생성은 하지 않음)
```

## 데이터 출처와 실제 API 연결 (로컬 개발)
- `VITE_DATA_SOURCE=api`(기본): 실제 API(계약 0.6.0). **실패해도 정적 데이터로 자동 전환하지 않는다.** 프로젝트·자산·제품·재료·공정의 조회와 저장이 연결되어 있다(범위는 앱 상단 배너와 `docs/communication/request-from-frontend.md` 상태 표).
- `VITE_DATA_SOURCE=static`: 정적 예시 데이터(화면 검토용). 서버 호출 없음, 화면에 "예시" 표시. 명시했을 때만 쓴다.
- 서버는 backend 세션 또는 사용자가 띄운다(`backend/scripts/run_dev_api.ps1`). FE는 기동하지 않는다.
- 개발 서버의 proxy가 `/api`를 `DEV_API_TARGET`(기본 `http://127.0.0.1:8000`)으로 전달하고 `X-Debug-User`를 붙인다.
  개발용 사용자 id는 번들에 들어가지 않도록 `VITE_` 접두사 없는 셸 환경변수로만 넘긴다.
  ```powershell
  $env:DEV_DEBUG_USER="<app_user.id>"; pnpm dev
  ```
  값(개발 전용 식별자)은 `docs/communication/request-from-backend.md`의 "현재 Backend 상태"를 본다. 이 인증은 계약이 아니며 운영 인증이 정해지면 바뀐다.
- `src/shared/api/generated/`는 생성물이므로 직접 수정하지 않는다. 계약이 바뀌면 `contracts/CHANGELOG.md`를 읽고 `pnpm gen:api`로 다시 만든다.
- 알려진 경고: `openapi-typescript`의 peer가 TypeScript 5.x인데 이 프로젝트는 6.0.x를 쓴다(typescript-eslint 호환 범위 때문). 생성기는 이 조합에서 동작을 확인했다.
TypeScript는 typescript-eslint 호환 범위(<6.1.0) 때문에 6.0.x에 고정했습니다.

읽기: 루트 AGENTS → 이 폴더 AGENTS → docs/06_frontend_react.md →
contracts의 승인 상태·DTO/API → 도메인 문서와 미정 목록.

## 구조
- src/app: 라우팅·provider·프로젝트 context
- src/features: 프로젝트/자산/제품/공정/시나리오/실행/위키/질문/배치
- src/shared/api: 생성 클라이언트와 adapter; 정식 OpenAPI 승인 전 생성하지 않음
- src/shared/components / units / hooks / validation: 공통 UI
- src/mocks: 승인된 예제 기반 Mock
- tests: unit / component / e2e

## 최초 작업
계약이 아직 pending이면 UI 구조·정적 wireframe·공통 입력 컴포넌트를 먼저 작업할 수 있습니다.
DTO와 실제 endpoint는 임의 확정하지 않습니다.
승인 후 project 목록/생성/선택 → asset 목록/폼/IN·OUT 조회 → 412 충돌 표시 →
실제 API 연동 순으로 진행합니다.
Mock은 비운영 모드이며 같은 API client 경계를 통과하도록 구성합니다.

사용 패키지 매니저를 한 가지로 정하고 해당 lockfile만 유지합니다.
설치·개발·타입 검사·테스트·빌드 명령은 구현 후 실제 검증한 내용으로 추가합니다.

공통 UI 컴포넌트는 특정 API·제품·프로젝트에 의존하지 않음
기능별 데이터 조회·업무 동작은 해당 features에서 담당
서버 데이터, 입력 중인 폼, 화면 선택 상태를 분리
같은 상태를 여러 저장소에 중복 보관하지 않음
공정 계산의 기준 구현은 백엔드에 둠

[영역과 먼저 정할 내용]
디자인 토큰	: 색상, 글꼴, 간격, 크기, 테두리, 그림자
앱 레이아웃	: 프로젝트 선택, 좌측 메뉴, 상단 제목·경로, 작업 영역
기본 컴포넌트 : 버튼, 입력, 선택, 탭, 모달, 알림
업무 컴포넌트 : 단위 입력, 미정값 입력, 상태 배지, 버전 선택
목록 패턴 : 검색·필터·정렬·페이지 이동·선택 작업
상세·편집 패턴 : 섹션, 저장·취소, 미저장 경고, 읽기 전용 상태
상태 표현 : 로딩, 빈 결과, 오류, 권한 없음, 수정 충돌
접근성 : 키보드 조작, 포커스, 레이블, 색상 외 상태 구분

[다음과 같은 공통 컴포넌트 구조 검토]
ProjectSwitcher      프로젝트 전환
PageHeader           제목·경로·작업 버튼
DataTable            공통 목록
QuantityInput        값·단위 입력
KnownValueInput      미정 / 값 있음 / 무제한 구분
VersionStatusBadge   초안·승인·보관 상태
ValidationPanel      오류·경고·해결 안내
RevisionConflict     동시 수정 충돌
UnsavedChangesGuard  미저장 변경 보호