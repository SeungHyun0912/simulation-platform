> 워크스페이스 재배치본 v1.1.0 / 2026-10-23. 경로 변경은 구조 결정이며, 업무 규칙과 기술 제안의 승인 상태는 승격하지 않습니다.

# 14. 다른 AI 에이전트용 시작 프롬프트·인계 템플릿

## 1. 전달할 최소 자료

필수:
- 이 문서 패키지 전체
- 실제 소스 저장소 접근 또는 관련 파일
- 기존 DB schema/migration head
- dependency lockfiles
- 실제 인증/배포 제약
- 마지막 실행한 테스트 결과와 미정사항

선택:
- DXF 또는 cad_extract ZIP
- 실제 사용자 운영 조건
- 기존 roadmap 원본(이 패키지는 대화 기반 재구성본)

이 문서만 전달하면 **설계 검토/새 프로젝트 생성**은 가능하지만
현재 소스에 어떤 구현이 이미 있는지는 알 수 없다. 구현 여부를 추측하지 않는다.

## 2. 공통 시작 프롬프트

```text
이 첨부 Markdown 패키지를 프로젝트 개발 기준으로 사용해 주세요.
기존 대화는 볼 수 없다고 가정해 주세요.

목표는 Project 기반 범용 이산 시뮬레이션 플랫폼이며,
React / Python / PostgreSQL / SimPy를 사용합니다.
전선제품6종은 예제 데이터이며 엔진에 하드코딩하지 마세요.

먼저 AGENTS.md, README, 01, 08, 13을 읽고 실제 저장소를 조사하세요.
다음으로 02 ERD → 03 DTO → 04 API의 정합성을 검토하세요.
아직 구현하지 말고:
1. 저장소 구현현황과 문서의 차이
2. 채택할 ERD/기술 제안
3. 구조 개발을 막는 질문과 실행만 막는 현장 질문
4. 첫 작업 G0/A 범위의 파일·migration·테스트 계획
을 제시해 주세요.

미정값을0/무제한으로 바꾸지 말고, 과거실행 snapshot을 변경하지 마세요.
한국어 문서/주석을 사용하고 실행하지 않은 테스트는 미실행으로 보고하세요.
```

## 3. DB 에이전트 프롬프트

```text
역할: PostgreSQL ERD·migration 담당.
02_erd_database.md를 기준으로 core 단계부터 검토하세요.
project scope 복합FK, 자산 subtype, 필수IN/OUT, 승인불변,
공정그래프/물리네트워크 분리, 시나리오asset revision pin을 우선합니다.

기존DB가 있으면 파괴적재생성하지 마세요.
migration SQL/ORM 차이, nullable/CHECK/UNIQUE/index,
RLS와 앱권한 경계, clone ID map을 설명하세요.

결과:
- 선택한 ERD/DDL 변경과 migration
- 실제PostgreSQL 부정테스트
- API팀이 사용할 관계/enum/null 의미
- 문서/ADR 변경
- 아직미구현인 후속테이블 목록
```

## 4. Backend 에이전트 프롬프트

```text
역할: Python/FastAPI API 및 worker 개발.
승인된02/03/04 계약부터 사용하세요. DB와 API 타입을 따로 임의 정의하지 마세요.
첫 수직 기능: project 생성 → asset 생성 → IN/OUT 원자 생성 → 조회.
그 다음 product/process draft 저장과 validation으로 확장하세요.

HTTP요청 안에서 SimPy를 오래 돌리지 마세요.
project scope, ETag, Idempotency-Key, audit/outbox, snapshot을 구현하세요.
OpenAPI와 예제응답을 생성하고 frontend에게 전달하세요.
현재제품6종 조건은08, 미정값은13을 보세요.
결과와 테스트 실행 여부를 AGENTS 형식으로 보고하세요.
```

## 5. Frontend 에이전트 프롬프트

```text
역할: React/TypeScript 화면 개발.
06을 읽고 승인된04/OpenAPI로부터 DTO를 생성하세요.
ERD/API가 확정되지 않았다면 임의필드·임의단위를 만들지 마세요.

우선 project선택, asset표/상세, 제품공정표 편집을 구현하세요.
서버상태query key에 project/version을 넣고 전환시cache/폼이 섞이지 않게 하세요.
IN/OUT포트, 미정/0/무제한, 승인read-only, ETag충돌을 정확히 표시하세요.
공정그래프좌표는CAD좌표와 분리하세요.
실행UI/LLM/CAD는 roadmap순서대로 연결하세요.
API 미구현 mock은 contracts/examples에서만 만들고 실제지원처럼 표시하지 마세요.
```

## 6. SimPy 에이전트 프롬프트

```text
역할: snapshot→SimPy compiler/handler 개발.
07과12의 의미론과 회귀테스트를 먼저 구현하세요.
제품명/EQ코드 분기 없이 operation_type/handler_version으로 처리하세요.

처음에는P06 절연단일단계 fixture:
2000m1보빈→1000m2보빈,30m/min,준비0,
이동0/설비1/Out제약없음은 테스트가정으로만 둡니다.
출력시각100/3분,200/3분을 확인하세요.

그다음공유EQ재방문,In/Out막힘,P01이월,AL합류/지정10보빈을 검증하세요.
AL/CU멀티신선속도기준이 미정인 상태에서 전체공정시간을 확정하지 마세요.
부족재고/교착/이벤트소진을 completed로 처리하지 마세요.
```

## 7. 단계 종료 인계 메모

```text
HANDOFF
문서 패키지:
저장소/branch/commit:
완료 작업 ID:
미완료 작업 ID:
실행 명령:
환경/의존성 버전:
DB migration head:
추가/변경 API:
생성 OpenAPI 경로:
테스트 결과/로그:
승인한 시나리오 가정:
새 질문/위험:
다음작업:
수정한 문서:
```

## 8. 이 대화로 다시 돌아올 때

문서 최신본 또는 변경 diff와 위 HANDOFF를 제공한다.
소스가 연결되지 않는 이 대화에서는 구현완료 여부를 자동 확인할 수 없다.
새 공정/기획 변경은 source claim ID와 최신문서에 반영한 수정본으로 전달한다.
다른 에이전트가 문서를 고쳤다면 최신파일 없이 과거 대화만으로 덮어쓰지 않는다.
