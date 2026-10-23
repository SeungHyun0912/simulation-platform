# HANDOFF-frontend-2026-10-23-FE-00b
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Frontend / FE-00(대표 화면 정적 구현) / A-01
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-frontend-fe00-b / 6d7210f(origin/main) / (커밋 후 기록)
- 계약 버전 / OpenAPI hash / 승인 scope: 없음(PENDING_REVIEW). API 연동은 사용자 지시로 제외.
- 수정 파일: frontend/** (아래), 이 문서

## 실제 구현 내용 (모두 정적·예시 데이터, API 호출 없음)
- 공통 컴포넌트 추가: DataTable(정렬 aria-sort, 스크롤 영역), TextField·SelectField, ConfirmDialog(Radix Dialog), ValidationPanel, useUnsavedChangesGuard(react-router useBlocker + beforeunload).
- KnownValueInput 확장: `not_allowed`(대기 불가) 모드, `numberKind`(decimal/integer).
- 대표 화면 2개: 설비·공간 목록(`/projects/:projectId/assets`), 상세·편집(`/projects/:projectId/assets/:assetId`).
  - 목록: 검색·유형 필터·정렬을 URL 상태로 유지, 빈 결과/검색 결과 없음/로딩/오류/권한 없음.
  - 상세: 기본 정보, 고정 IN/OUT 포트(삭제 불가·위치 미정 표시), 용량(미정/값/무제한/대기 불가), 읽기 전용(초안이 아닌 버전), 미저장 변경 보호, 수정 충돌 안내(자동 덮어쓰기 없음), 검증 패널(미정은 경고, 필수값 누락은 오류).
  - 프로젝트·자산이 바뀌면 폼 상태를 key로 폐기한다.
- 정적 상태 미리보기: URL `?state=loading|error|empty|forbidden|conflict` (`usePreviewState`). API 연동 시 제거한다.
- 저장·자산 추가 버튼은 비활성이며 "계약 필요"로 표시한다. 저장 성공을 가장하지 않는다.

## 채택 결정과 근거
- 화면 전용 뷰 모델 `AssetView`를 쓴다. 승인된 DTO가 아니며 계약 승인 후 어댑터로 변환한다.
- 예시 데이터는 `sampleAssets.ts`에 있으며 실제 기준정보가 아니고 화면에 "예시 데이터"로 표시한다. `src/mocks`(계약 기반 Mock)와 구분하기 위해 mocks에 두지 않았다.
- 목록은 cursor 페이지 이동을 구현하지 않았다(cursor 응답 모양 미정).
- 유형(kind)은 서브타입·포트를 결정하므로 상세에서 읽기 전용으로 두었다. 표시 코드는 편집 가능, 내부 ID만 읽기 전용(06 기술서 §5 해석). 확인 필요.

## 미정 또는 임시 가정
- 용량 모드와 서버 DTO의 매핑(finite↔값 있음 등)은 계약 후 확정.
- "초안만 편집 가능"은 기술서의 승인 불변 규칙을 UI로 옮긴 가정이며, in_review 상태의 편집 정책은 확인 필요.
- 접근 불가·없는 자산을 동일하게 "찾을 수 없음"으로 표시하는 것은 04 계약 §1의 404 정책 제안을 가정한 것이다.

## 상대 담당자에게 필요한 조치
- 조정자/Backend: 자산 목록·상세 DTO(용량 객체 모양, field_meta 위치, 포트 DTO), 목록 cursor 응답, 412와 EDIT_CONFLICT의 관계.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| pnpm typecheck | frontend/ | Node 24.17.0, TS 6.0.3 | 0 | 오류 없음 |
| pnpm lint | frontend/ | ESLint 10.13.0 | 0 | 경고·오류 없음 |
| pnpm test | frontend/ | Vitest 5.0.5 | 0 | 파일 3개, 33개 통과 |
| pnpm build | frontend/ | Vite 8.3.5 | 0 | JS 418KB(gzip 132KB) |
| python tools/check_workspace.py | 루트 | Python 3.12 | 0 | PASS(문서·구조만) |

## 미실행 테스트와 이유
- 실제 API 연동·계약 기반 Mock 테스트: 사용자 지시로 API 제외, 계약 미승인.
- 브라우저 수동 확인(키보드 흐름, 포커스 복귀, 스크린리더), 색 대비 측정, 반응형·스크롤 검증, E2E: 미실행(jsdom 컴포넌트 테스트만 수행).
- ConfirmDialog의 포커스 복귀는 Radix에 의존하며 직접 검증하지 않았다.

## 남은 위험·질문
- 디자인 검토 전이다. 토큰, 목록·상세 레이아웃의 승인이 필요하다.
- 정렬은 클라이언트 측 예시 구현이다. 서버 정렬·cursor로 바뀌면 재작업이 필요하다.
- QuantityInput(단위 선택 포함)은 미구현이다. 현재는 KnownValueInput의 고정 단위 문자열만 사용한다.

## 다음 세션의 첫 작업
- 사용자 디자인 검토 반영.
- 다음 정적 후보: 프로젝트 전환 UI(미저장 확인 연동), 제품 목록/상세 또는 공정 표 편집의 정적 구조(승인 필요), QuantityInput.
- 계약 승인 후 FE-01: generated client, Mock, 실제 연동, 상태 미리보기 제거.
