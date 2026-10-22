> 아래 조회 이력은 이전 패키지의 기록입니다. 이번 재구성에서 해당 링크 전체를 재검증하지 않았습니다.

# 99. 기술 근거와 문서 검토 범위

문서 작성 기준일: 2026-10-22.
아래 공식 자료를 이번 작성에서 조회했다. 라이브러리 기능에 관한 짧은 확인 근거이며,
플랫폼의 ERD·업무 규칙·API 이름·큐 설계 전체가 공식 권장안이라는 뜻은 아니다.
current/latest 주소는 향후 내용이 바뀔 수 있다. 착수 때 버전 고정과 호환성 검증이 필요하다.
“최신 제품버전” 추천이나 취약점 검사를 수행한 것은 아니다.

참조기호 [S01] 등은 각 기술서에서 아래 항목을 뜻한다.
제품 공정·설비·공간 데이터의 근거는 외부 웹이 아니라 사용자의 입력과 정정이다.
설계 제안은 사용자 확정 사실과 별도로 표시했다.

<a id="s01"></a>

## S01. PostgreSQL — Constraints

- 공식 주소: `https://www.postgresql.org/docs/current/ddl-constraints.html`
- 확인 범위: CHECK/UNIQUE/FK와 제약/인덱스 경계.

<a id="s02"></a>

## S02. PostgreSQL — Row Security Policies

- 공식 주소: `https://www.postgresql.org/docs/current/ddl-rowsecurity.html`
- 확인 범위: 행보안 및 owner·우회권한 주의.

<a id="s03"></a>

## S03. PostgreSQL — SELECT

- 공식 주소: `https://www.postgresql.org/docs/current/sql-select.html`
- 확인 범위: FOR UPDATE/SKIP LOCKED 큐 claim 검토.

<a id="s04"></a>

## S04. FastAPI — Features

- 공식 주소: `https://fastapi.tiangolo.com/features/`
- 확인 범위: OpenAPI/타입기반 API 설계.

<a id="s05"></a>

## S05. FastAPI — Background Tasks

- 공식 주소: `https://fastapi.tiangolo.com/tutorial/background-tasks/`
- 확인 범위: 무거운 계산의 별도 처리 검토.

<a id="s06"></a>

## S06. SQLAlchemy — asyncio

- 공식 주소: `https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html`
- 확인 범위: 동시 task별 Session 분리.

<a id="s07"></a>

## S07. Alembic — Autogenerate

- 공식 주소: `https://alembic.sqlalchemy.org/en/latest/autogenerate.html`
- 확인 범위: 자동 마이그레이션 결과 수동 검토.

<a id="s08"></a>

## S08. Pydantic — Unions

- 공식 주소: `https://docs.pydantic.dev/latest/concepts/unions/`
- 확인 범위: discriminated union으로 규칙 DTO 검증.

<a id="s09"></a>

## S09. React — Choosing the State Structure

- 공식 주소: `https://react.dev/learn/choosing-the-state-structure`
- 확인 범위: 중복·모순 상태 최소화.

<a id="s10"></a>

## S10. Vite — Guide

- 공식 주소: `https://vite.dev/guide/`
- 확인 범위: React 개발/빌드 도구 제안.

<a id="s11"></a>

## S11. TanStack Query — Query Keys

- 공식 주소: `https://tanstack.com/query/latest/docs/framework/react/guides/query-keys`
- 확인 범위: 프로젝트/버전별 query key 설계.

<a id="s12"></a>

## S12. React Flow — Quick Start

- 공식 주소: `https://reactflow.dev/learn`
- 확인 범위: node/edge 기반 편집 도구 제안.

<a id="s13"></a>

## S13. SimPy — Shared Resources

- 공식 주소: `https://simpy.readthedocs.io/en/stable/topical_guides/resources.html`
- 확인 범위: Resource/Store/Container 및 자원대기.

<a id="s14"></a>

## S14. SimPy — Events

- 공식 주소: `https://simpy.readthedocs.io/en/stable/topical_guides/events.html`
- 확인 범위: 시간·조건 이벤트, AllOf 의미.

<a id="s15"></a>

## S15. SimPy — Environments

- 공식 주소: `https://simpy.readthedocs.io/en/stable/topical_guides/environments.html`
- 확인 범위: 이벤트소진과 until 종료경계.

<a id="s16"></a>

## S16. SimPy — Monitoring

- 공식 주소: `https://simpy.readthedocs.io/en/stable/topical_guides/monitoring.html`
- 확인 범위: 관측대상/시점/저장방식.

<a id="s17"></a>

## S17. ezdxf — Coordinate Systems

- 공식 주소: `https://ezdxf.readthedocs.io/en/stable/concepts/coordinates.html`
- 확인 범위: OCS/WCS 등 좌표체계.

<a id="s18"></a>

## S18. Vitest — Getting Started

- 공식 주소: `https://vitest.dev/guide/`
- 확인 범위: 프런트 테스트 도구 제안.

<a id="s19"></a>

## S19. OWASP — Prompt Injection

- 공식 주소: `https://genai.owasp.org/llmrisk/llm01-prompt-injection/`
- 확인 범위: 비신뢰 문서와 도구권한 경계.

<a id="s20"></a>

## S20. ezdxf — INSERT

- 공식 주소: `https://ezdxf.readthedocs.io/en/stable/blocks/insert.html`
- 확인 범위: 블록참조·삽입·회전·축척·배열.

## 조회 한계

- 브라우저 E2E 도구의 한 문서 경로는 조회 실패했으므로 기능 근거로 사용하지 않았다.
  E2E 도구 선택은 미확정으로 남겼다.
- SQLAlchemy는 2.0 문서를 참조했으며 최신 minor 선택을 의미하지 않는다.
- 배포환경, 인증공급자, LLM공급자, PostGIS/브로커/벡터검색 도입은 확정하지 않았다.
- 사용자 CAD ZIP에서는 manifest를 실제로 열어 확인했으나 형상추출/포트매핑을 새로 수행하지 않았다.
- 코드 저장소/기존 roadmap 원본은 접근하지 못했다.
