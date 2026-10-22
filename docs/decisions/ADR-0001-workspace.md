# ADR-0001: 단일 저장소·서비스 폴더와 문서 배치
- 상태: 이번 사용자 요청에 따른 문서·워크스페이스 구조 반영
- 기준일: 2026-10-23
- 근거: 업로드 MD를 폴더에 분배하고 여러 에이전트용 workspace ZIP을 구성해 달라는 요청
- 범위: 폴더·협업 규칙. 기존 PROPOSED 기술/ERD 승인을 의미하지 않음.

## 결정
루트 backend/frontend/contracts/docs/infra/tools 구조를 채택한다.
Python API·worker·domain·simulation은 backend/src/simulation_platform 내부에서 분리한다.
원본 apps/api·apps/worker·packages 예시는 현재 구조로 대체한다.
contracts/openapi.json을 승인 스냅샷의 단일 위치로 제안하며 아직 파일을 생성하지 않는다.
원본 18개 MD는 역할별로 분배, 통합 원본은 보존 ZIP에만 둔다.
현재 공개된 버전 호환성을 새로 확정하지 않으며 앱 manifest/lockfile은 초기 담당자가 결정한다.

## 결과
경로 충돌이 줄고 각 에이전트의 소유권을 명확히 할 수 있다.
실제 앱·배포 코드는 포함하지 않으므로 실행 준비는 다음 단계다.
