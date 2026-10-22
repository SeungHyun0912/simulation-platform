# 인프라
현재 compose, Dockerfile, 운영 배포, PostgreSQL 인스턴스는 제공/실행하지 않았습니다.
실제 버전·포트·인증·비밀 관리 결정 후 조정자가 추가합니다.

권장 분리:
- API 프로세스
- worker 프로세스
- PostgreSQL
- artifact 로컬 volume 또는 운영 object storage
- frontend 개발 서버 또는 배포 정적 자산

추가할 파일 후보: compose.yaml, API/worker Dockerfile, .env.example, 복구 runbook.
컨테이너 latest 태그 대신 검증한 버전을 고정합니다.
migration은 자동 각 replica 시작마다 실행하지 말고 단일 승인 작업으로 수행합니다.
development/test/production DB·자격증명 분리, 단순 예제 비밀번호 운영 사용 금지.
운영 로그·백업 보관·CAD 접근권한·외부 LLM 전송 정책을 기록합니다.

문서 CI만으로 서비스 배포 가능하다고 판단하지 않습니다.
