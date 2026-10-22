# 공통 에이전트 작업 규칙

이 저장소의 모든 에이전트가 직접 읽어야 하는 공통 운영 계약입니다.
폴더별 AGENTS.md는 추가 제한이며 루트 규칙을 약화하지 않습니다.
자동 파일 검색/우선순위는 도구별로 다를 수 있으므로 시작 프롬프트에서 필수 파일을 명시하세요.

## 1. 시작 절차
1. 루트 README, 이 파일, 담당 폴더 AGENTS를 읽는다.
2. docs/README.md → docs/planning/STATUS.md → docs/domain/08_catalog_processes.md →
   docs/decisions/13_decisions_open_questions.md를 읽는다.
3. ERD → contracts/03_domain_contracts.md → contracts/04_api_contract.md →
   contracts/contract-status.json을 읽는다.
4. 실제 git status, branch, commit, 기존 코드, lockfile, DB migration 상태를 조사한다.
5. docs/agents/TASK_BOARD.md에서 범위를 확인한다. 조정자가 작업을 할당하기 전 범위를 넓히지 않는다.
6. 시작 보고에 역할·기준 commit·계약 버전·수정 경로·테스트 계획·차단 질문을 남긴다.

## 2. 사실과 제안
- 이 대화의 기억에 의존하지 않는다. 최신 문서·승인 기록과 코드만 근거로 사용한다.
- 우선순위: 기록된 최신 사용자 정정 → 도메인 확정 결정 → 승인된 계약/ADR → 기술 제안 → 과거 예시.
- 충돌은 근거를 보존해 변경 요청으로 올린다. 마지막 수정일만으로 승인된 것으로 간주하지 않는다.
- 원본의 상세 도메인 금지 규칙도 준수한다: docs/reference/original_agent_rules.md.
- 예제 제품명·EQ/ST 코드를 엔진 분기에 하드코딩하지 않는다.
- 한 프로젝트 안의 동일 설비 ID는 재방문하더라도 하나의 자원이다.
- organization 권한과 project scope를 서버에서 검증한다. 화면의 프로젝트 선택은 권한 검증이 아니다.
- 모르는 값은 unknown, 0·무제한·해당 없음과 다르다.
- 단위·보빈 수·가닥 수·작업 목표를 섞지 않는다.
- 승인 버전과 실행 스냅샷은 불변. 원본 도메인 조건을 편의상 변경하지 않는다.
- 한국어 문서·주석, 영어 식별자 허용. CAD 원문은 증거 보존하고 표시값을 별도 정규화한다.

## 3. 소유권
- Backend: backend/**, 본인 인계 파일. DB migration 작성권은 Backend 단일 담당자.
- Frontend: frontend/**, 본인 인계 파일. ORM/DB 컬럼을 직접 API DTO로 가정하지 않는다.
- 조정자: contracts/**, ERD, 공통 규칙, 루트 설정, infra, 승인/통합.
- 계약 후보는 Backend가 backend/artifacts/openapi.candidate.json에 생성할 수 있다.
  정식 contracts/openapi.json 갱신은 조정자가 diff 검토 후 수행한다.
- 한 파일을 두 에이전트가 동시에 수정하지 않는다. 생성된 클라이언트 수동 수정 금지.
- 스펙 수정 필요 시 docs/change-requests/에 역할별 고유 이름으로 요청한다.
- 소유권은 운영 규칙일 뿐 보안 장벽이 아니다. 토큰·파일 접근권한도 최소화한다.

## 4. Git·환경 안전
- 별도 worktree/브랜치를 기본으로 하고 상대 폴더의 작업을 삭제/복원/덮어쓰지 않는다.
- git reset --hard, git clean, force push, DB drop, migration reset은 명시적 사람 승인 없이는 금지.
- 같은 물리 폴더에서는 git add . 및 일괄 커밋 금지. 작업 파일만 지정한다.
- .env와 실제 CAD, DB 덤프, 키를 커밋하지 않는다. .env.example에는 자리표시자만 넣는다.
- 운영/공유 DB에 자동 migration 금지. 테스트 DB는 실행별/담당별 분리한다.
- 패키지 매니저·정확한 버전·업그레이드는 ADR 후 lockfile로 고정한다.
- UI 표시용 공개 환경변수에 서버 키를 넣지 않는다.

## 5. 계약·완료
- 승인되지 않은 API로 FE/BE를 동시에 확정 구현하지 않는다. 탐색 코드는 spike로 표시한다.
- Mock은 승인된 예제 기반이며 화면에 Mock 상태를 명시한다.
- 미정 필드가 있어도 초안 저장과 실행 가능 판정을 구분한다.
- 완료 보고에는 실제 명령·종료 코드·로그 위치를 기록한다. 실행 안 한 테스트는 미실행.
- 문서 검증 성공을 API/DB/SimPy 테스트 성공으로 보고하지 않는다.
- 변경 요청·인계·테스트 결과를 같은 작업 단위로 남긴다.
- 마지막 보고는 docs/handoffs/TEMPLATE.md 형식을 따른다.
