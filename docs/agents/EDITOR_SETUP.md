# 편집기와 세션
VS Code에서는 루트 simulation-platform.code-workspace를 열 수 있습니다.
공통 문서 검증 task 하나만 제공합니다. 앱 실행 task는 앱 구현 후 추가합니다.
공식 workspace 안내: `https://code.visualstudio.com/docs/editing/workspaces/multi-root-workspaces`

현재 설정은 루트 폴더 하나만 열어 상대 경로를 단순하게 유지합니다.
여러 루트를 열더라도 같은 파일을 중복 편집하지 않게 주의하세요.
추천 확장은 Python 편집 보조이며 자동 설치·버전 검증을 수행한 것은 아닙니다.

worktree 운영 시:
- Backend 세션: backend 작업 트리의 workspace 열기
- Frontend 세션: frontend 작업 트리의 workspace 열기
- 각 터미널에서 현재 경로와 Git branch 확인
- 세션별 AGENTS와 시작 지시문을 직접 읽도록 명시

소문자 agents.md/readme.md 사본은 만들지 않았습니다.
대소문자 구분 환경에서 다른 문서로 갈라지지 않도록 AGENTS.md/README.md로 통일합니다.
