# 하나의 저장소에서 여러 에이전트 운영

## 권장: 저장소 하나, 작업 트리 분리
공통 문서는 한 저장소에서 관리하고 에이전트마다 브랜치·작업 폴더를 나눕니다.
Git worktree는 같은 저장소의 추가 작업 트리를 만드는 기능입니다.
공식 참고: `https://git-scm.com/docs/git-worktree`

### 신규 저장소에만 해당하는 준비
압축 해제 후 기존 .git이 없는지 먼저 확인합니다. 기존 저장소에 init/이력 대체하지 않습니다.
Git 설치와 사용자 이름·이메일 설정은 사용자가 준비합니다.
```bash
git init -b main
git add .
git commit -m "docs: initialize simulation platform workspace"
```
이 최초 add는 민감 파일 검토 후 **조정자만** 수행합니다. 이후 에이전트는 자기 파일만 staging합니다.

### 공통 계약 승인 커밋 이후 분리
아래 명령은 조정자만 실행하며 브랜치/경로가 이미 있으면 다른 이름을 선택합니다.
```bash
git worktree add ../simulation-platform-backend -b feat/backend-core main
git worktree add ../simulation-platform-frontend -b feat/frontend-core main
git worktree list
```
각 세션은 자기 작업 트리를 열고 같은 이름의 README/AGENTS를 읽습니다.
별도 창에서 각 트리의 code-workspace를 열어도 됩니다.
공통 저장소 이력은 공유하지만 파일 수정은 즉시 다른 트리에 전파되지 않습니다.
다른 브랜치 변경은 조정자가 병합하고 에이전트가 승인된 commit을 반영해야 합니다.

### 업데이트·병합
1. 각 담당자가 작은 커밋과 handoff를 작성합니다.
2. 조정자가 CR/계약 변경을 먼저 검토합니다.
3. 통합 브랜치에서 계약 → Backend → Frontend 순으로 필요한 변경을 병합합니다.
4. 충돌은 담당자와 해결하고 통합 테스트를 수행합니다.
5. 최신 기준 commit과 계약 hash를 TASK_BOARD에 기록합니다.
6. 각 에이전트가 작업을 저장한 뒤 지정된 기준을 반영합니다. 자동 force push 금지.

## 대안: 같은 물리 폴더 사용
사용자가 요구하면 가능하나 다음을 강제합니다:
- 동시 수정 경로를 backend/frontend로 제한
- git switch/merge/rebase/commit/stash는 조정자만 수행
- agent의 reset/clean/restore 및 상대 변경 덮어쓰기 금지
- root/contracts/infra/공통 문서 수정 직렬화
- 작업 시작/종료마다 상태 확인, 파일 단위 diff 보고
- 에이전트 도구의 허용 디렉터리·명령도 가능한 범위에서 제한
- 공유 DB migration과 의존성 업그레이드는 동시 실행 금지

## 실행 환경 분리
- worktree별 Python venv 및 node_modules
- Backend 8000, Frontend 5173은 초기 포트 제안일 뿐 승인된 설정이 아님
- 여러 서버 실행 시 포트·테스트 DB·artifact 디렉터리·로그 경로를 분리
- Frontend는 공통 계약의 Mock 또는 지정된 단일 개발 API를 사용
- 작업자·프로젝트 데이터가 있는 공유 DB에서 테스트 삭제 금지

## 작업 큐
TASK_BOARD는 조정자만 갱신합니다. 동시 agent가 파일 락 흉내를 내며 차지하지 않습니다.
요청자 파일은 CR-backend-..., HANDOFF-frontend-...처럼 역할/날짜/task로 구분합니다.
긴 세션은 작은 작업 후 handoff를 남기고 다음 세션이 파일부터 읽도록 합니다.
