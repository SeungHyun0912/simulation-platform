# G0: 첫 병렬 개발 전 승인 체크리스트
현재 모두 미승인. 전체 미래 기능이 아닌 첫 project/assets scope부터 승인 가능합니다.

## 담당·환경
- [ ] 조정자, Backend, Frontend, DB migration 작성자 지정
- [ ] 저장소 접근/AI 외부 전송 허용/비공개 범위 결정
- [ ] worktree 또는 동일 폴더 직렬 Git 운영 선택
- [ ] Python/Node/PostgreSQL 및 패키지 매니저 버전 검증·고정
- [ ] 인증 adapter와 로컬 테스트 주체 정책 결정
- [ ] DB 포트·담당별 테스트 DB·artifact 저장 경로 결정

## 데이터·API
- [ ] project/organization 경계와 멤버십·권한
- [ ] UUID와 EQ/ST 표시 코드, 중복 범위, 보관 처리
- [ ] asset subtype와 필수 IN/OUT 원자 생성
- [ ] project scope FK·조회·다른 프로젝트 404 정책
- [ ] unknown/0/unlimited/not_applicable과 field_meta
- [ ] decimal 문자열·개수 정수·시간 단위
- [ ] 요청·응답·cursor·오류 envelope·ETag
- [ ] 첫 scope OpenAPI + 성공/실패 예제
- [ ] migration 적용·복구 전략
- [ ] FE Mock과 생성 client 기준 hash

## 첫 통합 인수
- [ ] 프로젝트 생성→선택→설비/공간 등록→포트 조회
- [ ] 목록/빈 화면/필수값/오류/재시도
- [ ] 프로젝트 전환 시 이전 cache·폼 혼입 없음
- [ ] 다른 프로젝트 ID 접근 차단
- [ ] If-Match 누락/충돌 동작
- [ ] 미정값은 그대로 보존되고 승인 불변 규칙 위반 없음
- [ ] 실제 API 모드에서 Mock 개입 없음

승인 기록: 담당자 / 날짜 / scope / baseline commit / OpenAPI hash / 제외 범위.
현장 미정은 docs/decisions 목록에서 계속 추적하며 실행 조건만 차단할 수 있다.
