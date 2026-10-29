# 현재 상태 — 2026-10-23
- 워크스페이스 패키지: 1.1.0
- 원본 기술서: 1.0.0, 업로드 파일 그대로 별도 보존
- 계약: **PARTIALLY_APPROVED** — scope `project-assets-ports`(0.1.0)·`asset-revisions`(0.2.0)·`products-materials`(0.3.0)·`process-versions`(0.4.0·0.5.0·0.6.0)만 승인, `main`에 게시된 contract **0.5.0**(변경 기록 contracts/CHANGELOG.md). **0.4.0(공정 버전·그래프 BE-04a, scope `process-versions`)은 구현·승격되어 `main`에 게시됨(PR #18)**(승인은 "다음 단계 진행"의 해석, CR be04 §9). **0.5.0(BE-04b: 복제 기준 선택·버전 비교·편집기 상태)은 구현·승격되어 PR 머지 대기**(승인은 사용자의 PR #21 머지와 결정 답변, CR be05 §7). **0.6.0(BE-04c: 단계 재료 spec·간선 spec 연결·완제품 지정)은 구현·승격되어 PR 머지 대기**(승인은 "확인이 필요한 사항은 그대로 진행"의 해석, CR be06 §7). 값 구조 미정의 규칙 필드는 미승인. 나머지 ERD/DTO/API는 PROPOSED, G0 검토 필요
- 정식 OpenAPI: contracts/openapi.json (승인 scope의 operation 전체, 0.9.0은 실행 API 5개 포함, 해시는 contract-status.json)
- Backend 구현(main 반영 여부는 git 이력 확인): FastAPI API 기반(error envelope·request id), migration 0001(조직·프로젝트·멤버십·감사·자산·포트)·0002(자산 버전·포트 정책)·0003(제품·재료)·0004(공정 버전·그래프)·0005(공정 편집기 상태)·0006(단계 재료 spec·완제품 지정),
  project/asset API 11개 + 자산 버전 API 7개(제출·반려·승인 포함) + 제품·재료 API 8개 + 공정 버전·그래프 API 11개 + 비교·편집기 상태 API 3개(복제 기준 선택 본문 포함), `GET /me` 프로젝트 `status`. 인증은 local 전용(운영 인증 adapter 미결), RLS 미구현. pip + requirements.lock(패키지 매니저 ADR 대기)
- DB migration: head 0011(배치판, BE-21). 로컬 테스트 DB(`simulation_platform_test`)와 로컬 개발 DB(`simulation_platform`, 개발용·시험 데이터·**실제 기준정보(DEMO-WIRE: 설비 96·공간 22·제품 6·공정 6 draft) 시드 완료**)에 적용. 운영/공유 DB 미적용. 로컬 개발 API 서버(포트 8000)는 사용자 승인으로 Backend 세션이 실행(세션 종료 시 중지될 수 있음)
- Backend 테스트: pytest 730건(BE-21: head 고정값 1건 외 729 통과, 고친 뒤 스키마 18·계약 80 통과)(실제 PostgreSQL 16 통합 포함) — 증거 docs/handoffs/HANDOFF-backend-20261023-BE-01c.md, …-contract-0.1.0.md, …-BE-02.md, …-BE-DEMO-SEED.md, …-BE-03.md, …-BE-04a.md, …-BE-04b.md, …-BE-WIRE-SEED.md, …-BE-04c.md, …-C0-engine.md, …-C0-04.md, …-C0-06.md, …-DEC005-C0-05.md, …-C0-07.md, …-BE-05a.md, …-BE-07-intake.md, …-BE-08-batch-engine.md, …-BE-09-discard.md, …-BE-06a-run-platform.md, …-BE-06b-events-lineage.md, …-BE-06c-metrics.md, …-BE-06d-real-run-demo.md, …-BE-10-bottleneck.md, …-BE-11-12-timeline-compare.md, …-BE-13-14-refresh-graphs.md, …-BE-15-capacity-carriers.md, …-BE-16-yard-capacity-seed.md, …-BE-17-front-slots.md, …-BE-18-root-cause-report.md, …-BE-19-hold-handoff.md, …-BE-20-root-cause-rank.md, …-BE-21-layout.md
- Frontend: 정적 화면·공통 컴포넌트(API 연동 없음, 계약 기반 Mock/generated client 미적용) — FE 인계 문서 참조
- SimPy 엔진: **C0 첫 조각 구현**(컴파일러·표준 handler 4종·단일 선형 흐름 실행, `backend/src/simulation_platform/simulation`, ADR-0002 제안, tests/simulation 132건). 여러 제품이 같은 설비를 공유·경쟁하는 다중 공정 실행(C0-04)·잔량 이월/폐기(C0-06)·저장공간 자리와 OUT 막힘(C0-05, DEC-006 대응표)·저장공간 분기/단계 합류/공급과 configured_yield·supply_delay·준비 대기(C0-07) 포함. 계약 0.8.0(0.6.1 DEC-005: 빈 공정은 실행 판정 오류). 실제 기준정보 공정 6건은 사용자 정리(CR be09) 후 **모두 컴파일**되고(원자재 24개 입고 기준) P01·P02·P03·P06은 끝까지 실행된다(P06 보빈 96개 1.2일). P04는 입력 부족(`INSUFFICIENT_INPUT`)으로 정체(96.6일), P05는 절연 4,000m 잔량을 폐기(계약 0.8.0 `discard`)하며 600m 보빈 4,320개를 약 44일에 만들고 원자재 2개가 남아 입력 부족으로 끝난다. 병렬 스트림 산출(output_units_by_time)·설비 IN 용량·지표·실행 job queue·worker는 미구현(시나리오 버전·실행 사전검증 API는 계약 0.7.0로 구현)
- 원본 공정: 6종 전부 초안, 설비96대/공간22곳
- CAD geometry: 업로드 ZIP에 없음, 설비 IN/OUT 좌표 미승인
- 최신 문서 검증 증거: docs/testing/WORKSPACE_VALIDATION.md
- 다음 행동: FE-01(승인 계약 기반 Mock·실제 연동 — 안내서 docs/handoffs/HANDOFF-backend-20261023-BE-02-for-frontend.md), 공정 버전·그래프 CR be04 승인(FE 의견 BE-REQ-015, FE 화면 모델 대조 목록 포함), group 범위 CR, RLS·DB 계정 분리 제안, 운영 인증 결정(TECH-002)

원본 93개 작업의 완료 체크를 변경하지 않았습니다.
문서 패키지를 받았다는 사실을 설계 전체 승인으로 해석하지 않습니다.
