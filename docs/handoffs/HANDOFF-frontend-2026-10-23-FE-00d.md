# HANDOFF-frontend-2026-10-23-FE-00d
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Frontend / FE-00(제품 목록·상세 정적 화면) / A-01
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-frontend-fe00-d / 2688290(origin/main) / (커밋 후 기록)
- 계약 버전 / OpenAPI hash / 승인 scope: 없음(PENDING_REVIEW). API 연동은 사용자 지시로 제외.
- 수정 파일: frontend/** (아래), 이 문서

## 실제 구현 내용 (정적·예시 데이터, API 호출 없음)
- 제품 목록(`/projects/:projectId/products`): 코드·이름 검색, 정렬(URL 상태), 최신 공정 버전·상태 표시, 로딩/오류/빈/검색 결과 없음/권한 없음 상태.
- 제품 상세·편집(`/projects/:projectId/products/:productId`): 내부 ID(읽기 전용), 표시 코드, 이름, 규격(미정 체크박스로 미정과 빈 값을 구분), 공정 버전 목록(최신순, 상태 배지), 미저장 변경 보호, 수정 충돌 안내, 검증 패널.
- 공정 편집·새 초안 만들기·제품 생성·저장은 비활성이며 "계약 필요"로 표시. 성공을 가장하지 않는다.
- 공통화: `ConflictNotice`, `Layout`(Section·Note·FieldGrid·FilterBar·SampleDataNotice·PreviewStateLinks·DirtyIndicator·Block), `CheckboxField`, `usePreviewState`를 shared로 이동. 자산 상세는 `ConflictNotice`를 사용하도록 변경(동작 동일).
- 메뉴의 "제품" 활성화.

## 채택 결정과 근거
- 제품 필드는 ERD 02 §5의 product(code, name, specification)와 process_version(version_no, status)만 사용했다. 원자재/완제품 판정, 규격 세부 구조, 제품 분류는 정의가 없어 만들지 않았다.
- 규격은 `string | null`(null=미정). 미정을 해제하고 비우면 오류. 03 계약 §1 "빈 문자열은 null이 아님"을 따른 UI 가정이다.
- 제품에는 자체 버전 상태가 없다고 보고(ERD) 항상 편집 가능으로 두었다. 보관(archived)·권한별 읽기 전용은 계약 후 반영한다.

## 미정 또는 임시 가정
- 규격이 자유 문자열인지 구조화된 값인지 미정(계약 필요).
- 제품 코드 중복 검증은 서버 책임이며(프로젝트 내 고유) 화면에서 확인하지 않는다.
- 자산 화면 일부가 아직 `Layout` 공통 조각을 쓰지 않고 자체 CSS 모듈을 쓴다(외형은 동일). 후속 정리 후보.

## 상대 담당자에게 필요한 조치
- 조정자/Backend: 제품 DTO(규격 형식, 목록의 최신 버전 요약 포함 여부), 버전 목록 응답, 제품 보관 정책 확정.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| pnpm typecheck | frontend/ | Node 24.17.0, TS 6.0.3 | 0 | 오류 없음 |
| pnpm lint | frontend/ | ESLint 10.13.0 | 0 | 경고·오류 없음 |
| pnpm test | frontend/ | Vitest 5.0.5 | 0 | 파일 6개, 64개 통과 |
| pnpm build | frontend/ | Vite 8.3.5 | 0 | 빌드 성공 |
| python tools/check_workspace.py | 루트 | Python 3.12 | 0 | PASS(문서·구조만) |

## 미실행 테스트와 이유
- 실제 API 연동·계약 기반 Mock: 사용자 지시로 제외, 계약 미승인.
- 브라우저 수동 확인·키보드·포커스 복귀·스크린리더·색 대비·반응형: 미실행(jsdom 컴포넌트 테스트만).

## 남은 위험·질문
- 제품 화면은 자산 화면과 같은 패턴이라 별도 디자인 검토 없이 확장했다. 패턴 변경 요청이 있으면 두 화면을 함께 고쳐야 한다.
- 공정 표 편집(06 §6)은 공정 버전·단계 계약이 정해지지 않아 시작하지 않았다.

## 다음 세션의 첫 작업
- 사용자 검토 반영. 접근성·반응형 수동 검증 체크리스트 정리.
- 공정 표 편집의 정적 구조는 범위 승인 후 시작(단계 필드가 03 계약에 PROPOSED 상태임을 전제로 "초안 UI"로 표시).
- 계약 승인 후 FE-01: generated client, Mock, 실제 연동, 예시 데이터·상태 미리보기 제거.
