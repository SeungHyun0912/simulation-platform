> 참고 전용: 업로드한 원본 내용의 읽기용 사본입니다. 현재 작업 지침은 루트 README.md와 AGENTS.md입니다. 원본 ZIP은 별도 보존합니다.

# 프로젝트 기반 이산 시뮬레이션 플랫폼 — 개발 인계 문서

- 문서 패키지: `1.0.0`
- 작성 기준일: `2026-10-22` / 표시 시간대: `Asia/Seoul`
- 상태: **개발 설계 제안서 / 사용자 공정정보를 포함한 검토용 기준본**
- 요청 기술: **React / Python / PostgreSQL / SimPy**
- 대상: 대화에 접근할 수 없는 다른 개발 AI 에이전트와 개발자
- 구현 상태: **소스 저장소, 구현 여부, 기존 DB와 CI 결과는 확인하지 못함. 체크리스트는 구현 완료를 의미하지 않음.**
- 과거 로드맵 MD 원본은 이번 파일 저장소에 없음. 이 패키지는 대화의 최신 합의를 토대로 재구성했으며 기존 체크리스트의 완료 상태를 승계하지 않음.

## 1. 먼저 알아야 할 것

플랫폼은 특정 전선 공장에 고정되지 않는다. **Project가 사용자가 선택하는 최상위 시뮬레이션 작업 범위**다.
사업체 간 보안 경계는 별도 `organization`으로 두고, 한 조직에 여러 프로젝트를 허용한다.
공장 전체, 일부 라인, 가상 검토 모델 모두 하나의 프로젝트가 될 수 있다.

현재 전선 제품 6종, 설비 96대, 공간 22곳은 **첫 번째 예제 프로젝트의 데이터**다.
개발 엔진, 화면, API에 제품명·설비 번호를 조건문으로 하드코딩하지 않는다.

현재 공정은 사람이 제공한 대표 모델이며 모두 검토용 초안이다.
정보 정리가 끝났다는 말은 모든 실행 조건이 확정되었다는 뜻이 아니다.
용량·예약·운반·일부 준비 발생 주기 등은 미정이다. 미정을 0 또는 무제한으로 바꾸지 않는다.

## 2. 권장 읽기 및 개발 순서

1. [AGENTS.md](original_agent_rules.md): 에이전트 금지사항과 작업 절차
2. [01_context_requirements.md](../architecture/01_context_requirements.md): 배경·범위·용어
3. [08_catalog_processes.md](../domain/08_catalog_processes.md): 최신 사용자 데이터, 정정 이력
4. [13_decisions_open_questions.md](../decisions/13_decisions_open_questions.md): 확정/제안/미정 구분
5. **[02_erd_database.md](../architecture/02_erd_database.md): ERD·테이블·제약을 먼저 검토**
6. [03_domain_contracts.md](../../contracts/03_domain_contracts.md): JSON·상태·수량 계약
7. [04_api_contract.md](../../contracts/04_api_contract.md): FE/BE 공통 API 계약
8. [05_backend_python.md](../../backend/docs/05_backend_python.md): Python 구현
9. [06_frontend_react.md](../../frontend/docs/06_frontend_react.md): React 구현
10. [07_simulation_engine.md](../../backend/docs/07_simulation_engine.md): SimPy 실행 의미론
11. [11_roadmap_backlog.md](../planning/11_roadmap_backlog.md): 작업 순서·게이트
12. [12_testing_operations.md](../testing/12_testing_operations.md): 테스트·운영

후속 기능:
- [09_llm_wiki.md](../features/09_llm_wiki.md)
- [10_cad_layout.md](../features/10_cad_layout.md)
- [14_handoff_prompts.md](../agents/14_handoff_prompts.md)
- [15_change_log.md](../planning/15_change_log.md)
- [99_sources.md](99_sources.md)

## 3. 결정 상태의 의미

| 표기 | 의미 |
|---|---|
| USER_CONFIRMED | 사용자가 직접 확인한 제품·운영 조건 |
| PROPOSED | 이 문서에서 제안한 기술·설계, 구현 전 검토 |
| UNKNOWN | 답을 얻지 못함. 개발자가 임의 추정하지 않음 |
| SCENARIO_ASSUMPTION | 특정 시험 시나리오에서 명시·승인한 가정 |
| IMPLEMENTED | 코드·마이그레이션·테스트 증거가 확보되어야 사용 가능 |

사용자 도메인 사실과 기술 제안을 혼동하지 않는다. 예: React/Python/PostgreSQL은 사용자 선택,
FastAPI·SQLAlchemy·React Flow·작업 큐 방식은 제안이다.

## 4. 이번 문서의 실행 가능한 첫 목표

프로젝트 생성 → 설비와 IN/OUT 생성 → 저장공간 연결 → 제품 공정 초안 저장
→ 사전 검증 → 승인/가정 분리 → 단일 공정 시험 실행 → 이벤트·결과 확인.

현재 제품 6종 전체를 바로 정상 실행시키거나, 먼저 고급 CAD/자율 에이전트를 만드는 것이 첫 목표가 아니다.

## 5. 변경 관리

- 문서 파일은 저장소 `docs/platform/`에 넣고 Git으로 관리할 것을 제안한다.
- 루트 `AGENTS.md`에서 이 폴더의 AGENTS 문서를 읽도록 연결한다.
- 파일은 같은 이름으로 유지, 패키지 버전과 변경 이력을 갱신한다.
- DB → 도메인 DTO → API → 생성된 FE 타입 → 테스트 → 문서 순으로 영향 확인.
- 데이터 정정은 승인된 버전을 덮어쓰지 않고 새 초안/마이그레이션으로 남긴다.
- 이 대화와 외부 에이전트의 저장소는 자동 동기화되지 않는다.
  후속 변경 시 **최신 문서·관련 소스·마이그레이션 head·테스트 요약**을 함께 전달해야 한다.

## 6. 범위와 증거 한계

- 이 패키지는 기술 설계와 개발 작업 지시서다. 전체 운영용 코드·완성 DDL·실행된 테스트가 아니다.
- 날짜는 문서 작성 기준일이며 개별 SDK의 최신 버전을 보장하지 않는다. 정확한 의존성 버전은 착수 시 잠근다.
- 첨부 CAD ZIP에는 manifest/layers/texts/inserts만 있고 geometry는 없다.
  CAD 문자 위치를 실제 설비 중심 또는 IN/OUT으로 확정하지 않는다.
- 관련 공식 문서와 확인 범위는 [99_sources.md](99_sources.md)에 정리했다.
