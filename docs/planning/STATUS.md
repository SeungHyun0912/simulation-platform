# 현재 상태 — 2026-10-23
- 워크스페이스 패키지: 1.1.0
- 원본 기술서: 1.0.0, 업로드 파일 그대로 별도 보존
- 계약: **PARTIALLY_APPROVED** — scope `project-assets-ports`(0.1.0)·`asset-revisions`(0.2.0)·`products-materials`(0.3.0)·`process-versions`(0.4.0·0.5.0·0.6.0)만 승인, `main`에 게시된 contract **0.5.0**(변경 기록 contracts/CHANGELOG.md). **0.4.0(공정 버전·그래프 BE-04a, scope `process-versions`)은 구현·승격되어 `main`에 게시됨(PR #18)**(승인은 "다음 단계 진행"의 해석, CR be04 §9). **0.5.0(BE-04b: 복제 기준 선택·버전 비교·편집기 상태)은 구현·승격되어 PR 머지 대기**(승인은 사용자의 PR #21 머지와 결정 답변, CR be05 §7). **0.6.0(BE-04c: 단계 재료 spec·간선 spec 연결·완제품 지정)은 구현·승격되어 PR 머지 대기**(승인은 "확인이 필요한 사항은 그대로 진행"의 해석, CR be06 §7). 값 구조 미정의 규칙 필드는 미승인. 나머지 ERD/DTO/API는 PROPOSED, G0 검토 필요
- 정식 OpenAPI: contracts/openapi.json (승인 scope의 40개 operation, 해시는 contract-status.json)
- Backend 구현(main 반영 여부는 git 이력 확인): FastAPI API 기반(error envelope·request id), migration 0001(조직·프로젝트·멤버십·감사·자산·포트)·0002(자산 버전·포트 정책)·0003(제품·재료)·0004(공정 버전·그래프)·0005(공정 편집기 상태)·0006(단계 재료 spec·완제품 지정),
  project/asset API 11개 + 자산 버전 API 7개(제출·반려·승인 포함) + 제품·재료 API 8개 + 공정 버전·그래프 API 11개 + 비교·편집기 상태 API 3개(복제 기준 선택 본문 포함), `GET /me` 프로젝트 `status`. 인증은 local 전용(운영 인증 adapter 미결), RLS 미구현. pip + requirements.lock(패키지 매니저 ADR 대기)
- DB migration: head 0006. 로컬 테스트 DB(`simulation_platform_test`)와 로컬 개발 DB(`simulation_platform`, 개발용·시험 데이터·**실제 기준정보(DEMO-WIRE: 설비 96·공간 22·제품 6·공정 6 draft) 시드 완료**)에 적용. 운영/공유 DB 미적용. 로컬 개발 API 서버(포트 8000)는 사용자 승인으로 Backend 세션이 실행(세션 종료 시 중지될 수 있음)
- Backend 테스트: pytest 490건 통과(실제 PostgreSQL 16 통합 포함) — 증거 docs/handoffs/HANDOFF-backend-20261023-BE-01c.md, …-contract-0.1.0.md, …-BE-02.md, …-BE-DEMO-SEED.md, …-BE-03.md, …-BE-04a.md, …-BE-04b.md, …-BE-WIRE-SEED.md, …-BE-04c.md, …-C0-engine.md, …-C0-04.md
- Frontend: 정적 화면·공통 컴포넌트(API 연동 없음, 계약 기반 Mock/generated client 미적용) — FE 인계 문서 참조
- SimPy 엔진: **C0 첫 조각 구현**(컴파일러·표준 handler 4종·단일 선형 흐름 실행, `backend/src/simulation_platform/simulation`, ADR-0002 제안, tests/simulation 70건). 여러 제품이 같은 설비를 공유·경쟁하는 다중 공정 실행(C0-04) 포함. 실제 기준정보 공정 6건은 미정 값이 남아 컴파일되지 않음(의도). 합류·잔량·IN/OUT blocking·지표·시나리오·job queue는 미구현
- 원본 공정: 6종 전부 초안, 설비96대/공간22곳
- CAD geometry: 업로드 ZIP에 없음, 설비 IN/OUT 좌표 미승인
- 최신 문서 검증 증거: docs/testing/WORKSPACE_VALIDATION.md
- 다음 행동: FE-01(승인 계약 기반 Mock·실제 연동 — 안내서 docs/handoffs/HANDOFF-backend-20261023-BE-02-for-frontend.md), 공정 버전·그래프 CR be04 승인(FE 의견 BE-REQ-015, FE 화면 모델 대조 목록 포함), group 범위 CR, RLS·DB 계정 분리 제안, 운영 인증 결정(TECH-002)

원본 93개 작업의 완료 체크를 변경하지 않았습니다.
문서 패키지를 받았다는 사실을 설계 전체 승인으로 해석하지 않습니다.
