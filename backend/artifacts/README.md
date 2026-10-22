# 로컬 생성 후보
OpenAPI 후보: openapi.candidate.json.
Backend가 생성하고 diff·버전·생성 명령을 handoff에 기록합니다.
승인 스냅샷은 조정자가 contracts/openapi.json에 반영합니다.
이 폴더의 생성물은 Git 제외이므로 다른 worktree 담당자에게 자동 전달되지 않습니다.
PR artifact 또는 명시적으로 허용된 전달 채널을 사용하고 해시를 전달하세요.
