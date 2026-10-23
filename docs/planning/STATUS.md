# 현재 상태 — 2026-10-23
- 워크스페이스 패키지: 1.1.0
- 원본 기술서: 1.0.0, 업로드 파일 그대로 별도 보존
- 계약: **PARTIALLY_APPROVED** — scope `project-assets-ports`(0.1.0)·`asset-revisions`(0.2.0)·`products-materials`(0.3.0)만 승인, `main`에 게시된 contract **0.3.1**(0.3.0 위의 패치 — `/me.projects[].timezone`; 변경 기록 contracts/CHANGELOG.md). 다음 후보 0.4.0(공정 버전·그래프)은 CR be04 승인 대기. 나머지 ERD/DTO/API는 PROPOSED, G0 검토 필요
- 정식 OpenAPI: contracts/openapi.json (승인 scope의 26개 operation, 해시는 contract-status.json)
- Backend 구현(main 반영 여부는 git 이력 확인): FastAPI API 기반(error envelope·request id), migration 0001(조직·프로젝트·멤버십·감사·자산·포트)·0002(자산 버전·포트 정책)·0003(제품·재료),
  project/asset API 11개 + 자산 버전 API 7개(제출·반려·승인 포함) + 제품·재료 API 8개, `GET /me` 프로젝트 `status`. 인증은 local 전용(운영 인증 adapter 미결), RLS 미구현. pip + requirements.lock(패키지 매니저 ADR 대기)
- DB migration: head 0003. 로컬 테스트 DB(`simulation_platform_test`)와 로컬 개발 DB(`simulation_platform`, 2026-10-23 적용·개발용·시험 데이터 시드 완료)에 적용. 운영/공유 DB 미적용. 로컬 개발 API 서버(포트 8000)는 사용자 승인으로 Backend 세션이 실행(세션 종료 시 중지될 수 있음)
- Backend 테스트: pytest 219건 통과(실제 PostgreSQL 16 통합 포함) — 증거 docs/handoffs/HANDOFF-backend-20261023-BE-01c.md, …-contract-0.1.0.md, …-BE-02.md, …-BE-DEMO-SEED.md, …-BE-03.md
- Frontend: 정적 화면·공통 컴포넌트(API 연동 없음, 계약 기반 Mock/generated client 미적용) — FE 인계 문서 참조
- SimPy 앱 테스트: 미실행(엔진 미구현)
- 원본 공정: 6종 전부 초안, 설비96대/공간22곳
- CAD geometry: 업로드 ZIP에 없음, 설비 IN/OUT 좌표 미승인
- 최신 문서 검증 증거: docs/testing/WORKSPACE_VALIDATION.md
- 다음 행동: FE-01(승인 계약 기반 Mock·실제 연동 — 안내서 docs/handoffs/HANDOFF-backend-20261023-BE-02-for-frontend.md), 공정 버전·그래프 CR be04 승인(FE 의견 BE-REQ-015, FE 화면 모델 대조 목록 포함), group 범위 CR, RLS·DB 계정 분리 제안, 운영 인증 결정(TECH-002)

원본 93개 작업의 완료 체크를 변경하지 않았습니다.
문서 패키지를 받았다는 사실을 설계 전체 승인으로 해석하지 않습니다.
