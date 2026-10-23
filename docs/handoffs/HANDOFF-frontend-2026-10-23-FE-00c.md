# HANDOFF-frontend-2026-10-23-FE-00c
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Frontend / FE-00(QuantityInput·프로젝트 전환 UI) / A-01
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-frontend-fe00-c / aa6eab1(origin/main) / (커밋 후 기록)
- 계약 버전 / OpenAPI hash / 승인 scope: 없음(PENDING_REVIEW). API 연동은 사용자 지시로 제외.
- 수정 파일: frontend/** (아래), 이 문서

## 실제 구현 내용 (정적·예시 데이터, API 호출 없음)
- 단위 레지스트리 `src/shared/units/units.ts`: 개수(개·보빈·가닥·보빈 슬롯·팔레트 슬롯)·길이(m)·중량(kg)·면적(㎡)·시간(분)·선속(m/분)을 차원별로 정의. 개수 계열은 정수 전용.
- `QuantityInput`: decimal 문자열 값 + 단위. 단위가 하나면 고정 문구, 여럿이면 선택 상자. 단위별 규칙으로 즉시 검증(빈 값은 입력 누락이며 0이 아님, 지수·음수·무한대·천 단위 쉼표 거부).
- `KnownValueInput`에 `units` 추가: 미정/값/무제한/대기 불가와 단위 선택을 함께 처리. 모드를 바꿔도 선택한 단위를 유지. `KnownValue.unit` 필드 추가.
- 설비 상세의 용량이 03 계약 §3의 지원 단위(item, bobbin_slot, pallet_slot, kg, m2)를 선택하도록 변경. item 외 단위는 "등록 가능, 실행 엔진은 item만 지원" 경고.
- `ProjectSwitcher`(Radix DropdownMenu): 현재 프로젝트 이름·코드를 상시 표시, 프로젝트별 구분 띠(색 + 이름·코드 병기). 앱 셸 상단에 적용.
- 전환 동작(`AppShell`): 같은 메뉴의 목록으로 이동(자산 ID 등 상세 경로는 가져가지 않음), 미저장 변경이 있으면 확인 대화상자, 이전 프로젝트의 쿼리 취소·캐시 제거(다른 프로젝트 캐시는 보존).
- 예시 프로젝트 3개(`features/projects/sampleProjects.ts`)와 화면의 "예시" 표시.
- 테스트 헬퍼 `tests/renderApp.tsx`, jsdom 보완(`tests/setup.ts`).

## 채택 결정과 근거
- 단위 id는 03 계약의 예시 코드(item, bobbin_slot, pallet_slot, kg, m2)를 따르고 나머지는 화면용 값이다. 계약 승인 후 맞춘다.
- 프로젝트 목록은 `ProjectOption` 뷰 모델이며 DTO가 아니다. accent 값은 서버 속성이 아니라 화면 가정이다(06 기술서 §4 "project color" 요구의 임시 구현).
- 프로젝트 전환 후 이동 경로는 "같은 메뉴의 목록"으로 정했다. 다른 프로젝트의 자산·버전 ID를 URL에 붙이지 않기 위해서다.

## 미정 또는 임시 가정
- 프로젝트 색은 서버가 주는지, 사용자가 정하는지 미정이다.
- 단위 선택에 변환 기능은 없다. 단위를 바꿔도 값을 환산하지 않으며 사용자가 다시 입력해야 한다(환산은 하지 않는다는 보수적 선택).
- 프로젝트 전환 시 대화(LLM)·시나리오 마법사 context 분리는 해당 기능이 없어 미구현이다.

## 상대 담당자에게 필요한 조치
- 조정자/Backend: 단위 코드 목록과 차원 규칙, 프로젝트 DTO(이름·색·권한), `/me` 응답, 접근 불가 프로젝트의 404 정책 확정.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| pnpm typecheck | frontend/ | Node 24.17.0, TS 6.0.3 | 0 | 오류 없음 |
| pnpm lint | frontend/ | ESLint 10.13.0 | 0 | 경고·오류 없음 |
| pnpm test | frontend/ | Vitest 5.0.5 | 0 | 파일 5개, 48개 통과 |
| pnpm build | frontend/ | Vite 8.3.5 | 0 | JS 460KB(gzip 146KB) |
| python tools/check_workspace.py | 루트 | Python 3.12 | 0 | PASS(문서·구조만) |

## 미실행 테스트와 이유
- 실제 API 연동·계약 기반 Mock: 사용자 지시로 제외, 계약 미승인.
- 브라우저 수동 확인(`pnpm dev`)·키보드 흐름·포커스 복귀·스크린리더·색 대비·반응형: 미실행(jsdom 컴포넌트 테스트만).
- ProjectSwitcher의 메뉴 키보드 조작(화살표·Esc)은 Radix에 의존하며 직접 검증하지 않았다.
- 프로젝트 전환 중 진행 중인 실제 네트워크 요청 취소는 요청이 없어 검증하지 못했다(`cancelQueries` 호출만 구현).

## 남은 위험·질문
- React StrictMode 개발 모드에서 정리 함수가 한 번 더 실행되어 현재 프로젝트 캐시가 개발 중에만 추가로 지워질 수 있다(운영 영향 없음, 실제 쿼리 도입 시 재확인).
- 좁은 화면에서 상단 바의 프로젝트 전환 배치는 확인하지 않았다.

## 다음 세션의 첫 작업
- 사용자 디자인 검토 반영.
- 후보: 제품 목록/상세 정적 구조, 공정 표 편집 정적 구조(범위 승인 필요), 접근성·반응형 수동 검증 체크리스트.
- 계약 승인 후 FE-01: generated client, Mock, 실제 연동, 상태 미리보기·예시 데이터 제거.
