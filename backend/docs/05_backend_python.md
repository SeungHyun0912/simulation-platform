> 워크스페이스 재배치본 v1.1.0 / 2026-10-23. 경로 변경은 구조 결정이며, 업무 규칙과 기술 제안의 승인 상태는 승격하지 않습니다.

# 05. Python 백엔드 개발 기술서

> 선행: ERD/DTO/API 승인. 본 문서는 구현안이며 코드 실행 결과가 아니다.
> React/Python/PostgreSQL/SimPy는 요구사항. 나머지는 PROPOSED.

## 1. 권장 구성

| 영역 | 제안 | 선택 이유 / 경계 |
|---|---|---|
| HTTP API | FastAPI + Pydantic | typed DTO, OpenAPI; framework 기능 근거 [S04,S08] |
| ORM | SQLAlchemy 2.x | 테이블·트랜잭션·repository 관리 |
| migration | Alembic | 스키마 변경 추적, 생성 결과 수동 검토 [S07](../../docs/reference/99_sources.md#s07) |
| DB | PostgreSQL | FK·UNIQUE·트랜잭션·RLS 사용 [S01,S02] |
| simulation | SimPy 4.x 계열 | 자원·이벤트 기반 모델, exact 버전 잠금 |
| job execution | 별도 Python worker + PostgreSQL job queue | 초기 외부 브로커 없이 시작 |
| artifact | 로컬 개발 volume / 운영 object storage adapter | 원본 CAD·대형 파일을 DB에 직접 넣지 않음 |
| test | pytest, 실제 PostgreSQL 통합 테스트 | SQLite로 RLS/락 의미 대체 금지 |
| code quality | 타입 검사·format/lint·dependency lock | 도구 exact 버전 착수 시 결정 |

런타임 Python 버전은 개발자 환경을 고려해 3.12를 검토 기준으로 제안하되,
전체 의존성 호환성을 CI로 확인하고 lockfile에 정확히 고정한다. “최신”이라고 간주하지 않는다.

### 동기/비동기 선택

제안안은 API DB I/O에 AsyncSession, worker 저장에 독립적인 sync Session.
동일 Session을 concurrent task 또는 다른 process와 공유하지 않는다. SQLAlchemy도 AsyncSession을
동시 작업 간 공유하지 말고 task별로 분리하도록 설명한다. [S06](../../docs/reference/99_sources.md#s06)
개발팀이 sync-only API를 선택하면 ADR로 바꾸되, sync DB 호출을 async handler에서 무분별하게 직접 실행하지 않는다.

## 2. 저장소 예시

```text
backend/
  src/simulation_platform/
    api/
    auth/
    schemas/
    services/
    repositories/
    models/
    validation/
    domain/
    simulation/
    worker/
    integrations/
  migrations/
  tests/
contracts/
  openapi.json           # 승인 후 생성하는 정식 스냅샷, 현재 미생성
  examples/
docs/
  architecture/
```

이 패키지에서는 API·worker·domain·simulation을 하나의 Python 패키지 내부 모듈로
먼저 구분한다. 별도 프로세스로 실행하되 내부 모듈을 나중에 독립 배포 패키지로
분리할 필요가 생기면 ADR로 결정한다. 기존 apps/api·apps/worker·packages 예시는
이 배치로 대체한다. 아직 pyproject/lockfile/애플리케이션은 구현하지 않았다.


순환 의존성 금지:
API → service → domain/repository.
worker → domain/compiler/simulation.
simulation은 FastAPI Request, ORM Session, LLM SDK에 의존하지 않는다.

## 3. 요청 생명주기

1. 인증 token/session 확인.
2. 조직·프로젝트 멤버 권한 확인.
3. DTO 타입/단위 검증.
4. 프로젝트 범위 DB transaction 시작.
5. repository query 모두 project predicate + scope FK.
6. 업무 검증: 승인 불변, candidate/edge 일치, ETag.
7. 변경 및 audit/outbox 원자 저장.
8. commit 후 응답. 외부 인덱스/LLM 호출은 별도 job.
9. 안전한 로그에 request_id, actor, project, latency만; 민감 원문 기본 금지.

OIDC 또는 기존 인증 연동은 인증 adapter로 구현. 개발 모드의 테스트 주체는 local에서만 허용.
운영에서 사용자 지정 header만으로 admin이 되는 mock auth 금지.

## 4. 서비스 목록

- ProjectService: 생성·권한·복사·보관
- AssetService: subtype/포트 생성, 별칭, revision, archive
- ProcessService: graph 저장/검증/버전/승인
- ValidationService: knowledge/compile/run scope 검사
- ScenarioService: production/arrivals/WIP/assumptions/asset pins
- RunService: snapshot/run/job 생성, cancel, rerun
- MetricsService: 정의된 지표 계산·비교·window 필터
- WikiService: DB에서 문서 생성, manual explanation overlay
- QuestionService: 읽기전용 도구 orchestration
- CadService: 업로드·변환·mapping 검토·layout 버전
- ArtifactService: project 권한·해시·보존·다운로드

## 5. 검증 단계와 오류

V0 transport: JSON 형식, UUID, decimal, enum.
V1 integrity: 동일 프로젝트/버전 FK, 포트 및 subtype.
V2 graph: dangling edge, 시작·끝, input spec 연결, source 공급 경로.
V3 domain: 단위·투입/산출 의미·잔량·수량 basis.
V4 execution: handler 지원, 필수 용량/시간/예약/인계 조건 확정.
V5 scenario: 입고/초기 WIP, 재고 부족, horizon/target, 승인 가정.
V6 physical: network mode일 때만 좌표·연결·통행 가능 검증.

knowledge 승인은 V0~V3 구조 오류가 없어야 함.
UNKNOWN에 대한 warning은 승인 가능하지만, 사용되는 기능의 V4~V6 필수 미정은 실행 차단.
수량 추상화를 명시적으로 승인한 공정은 conservation 오류가 아니라 annotation으로 다룬다.

각 오류는 rule_id, field_path, entity_id, severity, resolution을 포함.
여러 오류를 한 번에 반환하며 첫 오류만 보여 반복 수정하게 하지 않는다.

## 6. 실행 제출 트랜잭션

- 입력은 승인된 scenario_version.
- validation이 참조한 row_version/hash가 여전히 맞는지 다시 검사.
- 필요한 공정/자산/배치/시나리오 내용을 읽어 불변 snapshot 구성.
- snapshot hash + engine_version + seed 저장.
- simulation_run + run_input_snapshot + job을 한 transaction에서 commit.
- 응답 202 후 worker가 처리.
- LLM/클라이언트가 보낸 compiled code는 실행하지 않음.

FastAPI BackgroundTasks는 같은 프로세스에서 작은 후처리에 쓰일 수 있으나 무거운 계산에는
별도 작업 처리 도구 사용이 안내된다. 이 플랫폼은 긴 SimPy 실행을 독립 worker로 분리한다. [S05](../../docs/reference/99_sources.md#s05)

## 7. PostgreSQL job queue 제안

`FOR UPDATE SKIP LOCKED`로 다른 worker가 점유한 job을 피하는 claim 패턴을 사용한다.
SKIP LOCKED의 일반 조회 결과 일관성 제한 때문에 큐 작업에 한정한다. [S03](../../docs/reference/99_sources.md#s03)

절차:
1. 짧은 transaction에서 queued/available job 1개 선택 및 lease 생성.
2. run_attempt와 fencing_token 생성 후 commit. 실행 동안 DB row lock 유지 금지.
3. 별도 child process에서 compile/run. API worker와 메모리 공유 금지.
4. supervisor가 heartbeat·취소·wall timeout 감시.
5. batch event flush 시 attempt/fencing token 검증.
6. 성공 후 결과와 run.selected_attempt_id 확정.
7. lease 만료 실행은 stale 처리. 이전 worker의 늦은 쓰기는 fencing으로 거부.
8. queue transport 실패 재시도와 simulation retry는 분리.
9. 동일 snapshot 재실행은 새 attempt; 미지원 resume를 가능하다고 광고하지 않음.

큐가 커지면 broker 기반 구현으로 교체 가능한 JobDispatcher interface를 둔다.
초기부터 여러 큐 제품을 동시에 도입하지 않는다.
작업별 project scope, 사용자 quotas, max events/items/wall-time 제한 필수.

## 8. 취소·실패·복구

상태:
queued → running → completed
queued → cancelled
running → cancel_requested → cancelled
running → failed / stalled / limit_reached

- UI cancel 버튼은 “취소 요청됨”을 먼저 표시.
- child process 종료 전 확보 중인 artifact 처리, attempt 상태 저장.
- OOM/프로세스 종료로 마지막 이벤트를 못 기록했으면 로그 완전성 false.
- stale worker는 동일 run을 completed로 되돌리지 못함.
- 이벤트 commit은 UNIQUE(attempt,event_seq)로 중복 방지.
- 초기 checkpoint resume는 미지원. rerun은 시작점부터 재실행.

## 9. 성능 원칙

- simulation 이벤트마다 HTTP나 DB 조회하지 않는다.
- 입력 snapshot은 한 번 읽고 엔진 내부 상태로 운영.
- event buffer는 크기/시간 기준 batch 저장, buffer limit 초과 시 정책 명시.
- 거대한 CAD를 API process에서 파싱하지 않는다.
- 표·이벤트 조회는 cursor pagination.
- run 진행은 time/target/terminal 상태로 알리며 허위 100% 금지.
- DB/CPU/메모리 성능 목표는 측정 후 확정. 초깃값을 성능 보장으로 제시하지 않음.

## 10. 배포·환경

환경 예시:
DATABASE_URL, AUTH_ISSUER, AUTH_AUDIENCE, ARTIFACT_BACKEND,
WORKER_MAX_WALL_SECONDS, WORKER_MAX_EVENTS, LLM_PROVIDER, LLM_ENABLED.
.env.example에는 변수 이름과 가짜 값만, 실키 금지.
API/worker/migration DB 역할 분리. migration은 배포 단계 1회.
readiness는 DB/schema 호환 확인, liveness는 프로세스 상태.
object storage 없는 local 모드는 개발용임을 표시.

## 11. 백엔드 완료 기준

- ERD 복합 FK/불변/RLS 부정 테스트 통과
- 생성 API로 설비 IN/OUT이 원자 생성
- graph round-trip 및 최신 제품 정정 보존
- 실행 snapshot으로 master 없이 compile
- 동일 입력/seed/엔진에서 이벤트 재현 테스트 통과
- 중복 실행/취소/worker crash 테스트 통과
- API OpenAPI와 실제 응답 일치
- 계산된 지표 정의·단위·기간·입력 hash 제공


---
기술 참조 [Sxx]의 공식 주소와 확인 범위: [99_sources.md](../../docs/reference/99_sources.md).


## 12. 단계별 데이터 전달물

DB 담당 → BE:
- ERD 승인 버전, 실제 migration, 제약/enum/null 규약, seed fixture.
BE → FE:
- 저장한 OpenAPI 파일, 생성 client 버전, 요청/응답 examples, 오류 rule_id 사전.
BE → engine:
- frozen snapshot JSON fixture, schema_version, 검증된 단위/assumptions.
engine → metrics:
- event schema와 state 전이, definition version, partial completeness.
metrics → LLM:
- 제한된 summary DTO, unit/window/source snapshot, quality warnings.
각 전달물에 commit/hash를 기록하고 API팀이 임의로 필드를 바꾼 뒤 FE에 알리지 않는 일을 방지한다.
