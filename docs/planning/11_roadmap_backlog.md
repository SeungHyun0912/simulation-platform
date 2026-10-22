> 워크스페이스 재배치본 v1.1.0 / 2026-10-23. 경로 변경은 구조 결정이며, 업무 규칙과 기술 제안의 승인 상태는 승격하지 않습니다.

# 11. 순차 개발 로드맵·백로그

> 패키지1.0.0 / 계획 상태. 기존 roadmap 파일의 완료 체크는 승계하지 않음.
> 모든 체크는 미구현으로 시작하며 실제 코드·테스트 증거가 있을 때만 완료 처리.
> 작업 수보다 완료 게이트가 우선이다. 개발 기간은 팀/기존 코드 확인 전 임의 산정하지 않음.

## 1. 순서

```text
G0 ERD·계약
   ↓
A 프로젝트·공정 CRUD
   ├─ B 위키·공정 LLM
   └─ C0 작은 SimPy 검증
          ↓
C 시나리오·전체 실행 → D 결과 LLM → E CAD·물류 확장
```

F 운영·품질은 전 단계에서 병행하고 배포 전 종합 확인.
공정 데이터 추가는 A 이후 계속 반복하며 임의 승인/기존 run 변경 없이 처리.

## 2. 우선순위

- 필수(P0): project isolation, 버전·포트·단위·검증·snapshot·핵심 정확성.
- 중요(P1): 입력 편의·그래프·위키·결과 설명.
- 후속(P2): 상세 CAD·혼잡·자동 최적화·고급 확률모델.
- AI 기능을 위한 구조 준비는 초기에 하되 LLM 공급자 통합이 첫 CRUD를 막지 않게 한다.

## G0. 계약·ERD 확정

후속 구현의 선행 게이트. 02/03/04를 승인하고 현장 미정과 기술 제안을 분리한다.

- [ ] **G0-01 — 저장소 조사**: 기존 코드·DB·인증·패키지·migration head·CI를 확인하고 차이 보고서를 작성.
- [ ] **G0-02 — 요구사항 동결 기준**: REQ/ADR/OPEN 목록을 리뷰하고 사용자 사실과 설계 제안을 분리.
- [ ] **G0-03 — 프로젝트 보안 경계**: organization/project/member와 공유·복사 범위를 결정.
- [ ] **G0-04 — ERD 검토**: asset/port/version/process graph 관계와 복합 FK를 검토.
- [ ] **G0-05 — 수량·시간 계약**: decimal/unknown/quantity_basis/output_schedule/잔량 계약 확정.
- [ ] **G0-06 — API 계약**: HTTP status, ETag, idempotency, validation envelope 합의.
- [ ] **G0-07 — 기술 의존성 잠금**: React·Python·PostgreSQL·SimPy 및 도구 exact 버전/lock 작성.
- [ ] **G0-08 — 첫 fixture 정의**: 제품6 절연 단일 단계의 테스트 전용 입력·명시 가정을 정의.

**완료 게이트:** ERD·DTO·API 리뷰 기록, 미정 질문 목록, 첫 검증 fixture가 있고 production 가정으로 오인되지 않음.

## A. 프로젝트·기준정보·공정 관리

위키보다 먼저 데이터 관리 기능을 구현. 공정 표 편집을 우선한다.

- [ ] **A-01 — 개발 환경**: API/DB/worker placeholder/frontend dev 환경, secret 없는 env example.
- [ ] **A-02 — 마이그레이션 기반**: organization/project/user/member 테이블과 재현 가능한 migration.
- [ ] **A-03 — 인증·권한**: 로그인 연동, project 역할 확인, project scope repository.
- [ ] **A-04 — 프로젝트 CRUD**: 생성·목록·전환·보관 화면/API와 권한 테스트.
- [ ] **A-05 — 자산·포트**: asset/subtype/IN/OUT/ACCESS 원자 생성 및 scope 제약.
- [ ] **A-06 — 자산 설정 버전**: asset_revision/port_policy 초안·승인·수정 충돌 처리.
- [ ] **A-07 — 자산 관리 UI**: 설비/공간/도킹, 별칭·그룹·미정 표시.
- [ ] **A-08 — 그룹·공유 매핑**: 한 자산 여러 논리 그룹, 실행 자원 중복 방지 기초.
- [ ] **A-09 — 제품·재료**: 제품 규격/재료 기본 단위/원자재와 목표량 분리.
- [ ] **A-10 — 공정 버전 DB**: node/step/spec/requirements/edge와 복합 FK migration.
- [ ] **A-11 — 그래프 저장 API**: 전체 저장 트랜잭션, dangling/cross-version 검증.
- [ ] **A-12 — 공정 표 편집**: 선속·산출·준비·인계·잔량·다음 공간 입력.
- [ ] **A-13 — 설비 후보 선택**: candidate qualification, one_of/all_of, override.
- [ ] **A-14 — 검증 엔진 기초**: V0~V3 검사와 field_path UI 연결.
- [ ] **A-15 — 검토·승인**: 초안/검토/승인/반려/clone, immutable guard.
- [ ] **A-16 — 변경 이력**: audit·원문 근거·사용자 정정 diff.
- [ ] **A-17 — 예제 seed**: 08 문서 기준96설비22공간6제품, 모두 초안.
- [ ] **A-18 — 프로젝트 복사**: ID 재매핑, source provenance, 결과 제외, 충돌 보고.
- [ ] **A-19 — 공정 그래프 UI**: IN/OUT handle, source/buffer/join/milestone, 표와 round-trip.
- [ ] **A-20 — 권한·회귀 검증**: 다른 project의 ID·cache·import 접근 거부.

**완료 게이트:** 두 프로젝트의 격리된 CRUD가 작동하고, 제품6 최신 경로를 표/그래프로 저장·재조회할 수 있음.

## B. 위키·읽기전용 공정 질의

A의 승인된 DB를 원본으로 사용. C0의 소규모 SimPy 검증을 병행한다.

- [ ] **B-01 — 위키 projection**: 공정 DB에서 Markdown/flow 요약 생성, source version/hash.
- [ ] **B-02 — 수동 설명 분리**: manual notes와 정형 수치 필드 분리.
- [ ] **B-03 — 검색 갱신**: 승인/폐기/수정 outbox와 index generation 처리.
- [ ] **B-04 — 정형 조회 도구**: 공정·설비·정책 읽기전용 tool API.
- [ ] **B-05 — LLM adapter**: 공급자 추상화·timeout·비용한도·키 관리.
- [ ] **B-06 — 프로젝트 질문 UI**: 선택 범위·초안 표시·근거 링크·미정 응답.
- [ ] **B-07 — 보안 평가**: 악성 문서 지시·다른 project 요청·도구 인수 검증.
- [ ] **B-08 — 정확성 평가**: 제품5/6 정정·미정·공유 설비 질문 세트.
- [ ] **B-09 — 장애 대체 경로**: LLM 없이도 위키/구조화 조회 가능.

**완료 게이트:** 공정 질의가 project/version 근거를 반환하며, 수정/실행 권한 없이 동작.

## C0. 초기 SimPy 수직 검증

B와 병행 가능. 전체6종 완성을 기다리지 않는다.

- [ ] **C0-01 — compiler skeleton**: snapshot→RuntimeModel, registry, unknown 검증.
- [ ] **C0-02 — 단일 설비 처리**: 제품6 절연2,000→1,000×2, 보빈별 완료 이벤트.
- [ ] **C0-03 — 보빈 분할 trace**: parent/child/remaining과 길이 합계 검증.
- [ ] **C0-04 — 공유 자원**: 같은 조사기 재방문/다른 제품 경쟁 mini fixture.
- [ ] **C0-05 — IN/OUT blocking**: 명시 용량과 해제 정책별 대기 테스트.
- [ ] **C0-06 — 잔량 fixture**: P01 동일제품 이월/제품전환 폐기, scope 가정 표시.
- [ ] **C0-07 — AL 합류 fixture**: singles 준비 후 configured10 산출, 소비/점유 가정 표시.
- [ ] **C0-08 — 필요 schema 수정**: 검증에서 발견한 계약 문제를 ADR·ERD·API에 반영.

**완료 게이트:** 소규모 결정적 테스트를 통과하고 JSON 구조로 실행 가능함을 확인. 실제 전체 공장 검증 아님.

## C. 시나리오·실행 플랫폼

C0 의미론을 운영 실행 경로와 연결한다.

- [ ] **C-01 — 시나리오 버전**: process/asset/layout pin, 실행 조건 저장.
- [ ] **C-02 — 생산·입고 계획**: 원자재 수량·입고 시각/주기·완제품 목표 구분.
- [ ] **C-03 — 초기 WIP**: 작업물 상태/위치/길이/가용시각 입력.
- [ ] **C-04 — 근무·종료 정책**: calendar·horizon·target·안전한도.
- [ ] **C-05 — 가정 승인 UI**: 미정을 별도 시나리오 가정으로 해소, master 보존.
- [ ] **C-06 — 실행 사전검증**: V4~V6 사용 범위 검사, 지원하지 않는 handler 차단.
- [ ] **C-07 — 스냅샷 생성**: 완전 불변 input/hash/engine/dependencies/seed.
- [ ] **C-08 — job queue**: 트랜잭션 run/snapshot/job, claim·lease·fencing.
- [ ] **C-09 — worker supervision**: child process·heartbeat·wall timeout·메모리 제한.
- [ ] **C-10 — 취소·재시도**: 중복 요청·cancel_requested·stale attempt 처리.
- [ ] **C-11 — 배정·예약**: 자원 선택/예약/다중 자원 allocator.
- [ ] **C-12 — 수량·시간 handler**: pass/split/configured/supply/inspection, 보빈 인계.
- [ ] **C-13 — 수동 운반**: 명시 이동시간/상하차/대기, 운반 미정 가정.
- [ ] **C-14 — 잔량·부족분**: carry/discard/unknown·부분 재고·실행 종료.
- [ ] **C-15 — 이벤트 저장**: 안정 event_seq·batch flush·불완전 로그 상태.
- [ ] **C-16 — 지표 엔진**: 생산/검사/적재·대기·가동률·폐기·WIP.
- [ ] **C-17 — 실행 UI**: queue/status/events/metrics/snapshot/assumptions.
- [ ] **C-18 — 대표6종 검증**: 미정 조건을 실제 확정 또는 승인 가정으로 채운 경우만 full run.
- [ ] **C-19 — 비교·반복**: 동일 입력과 변경조건 diff, seed/반복 결과.
- [ ] **C-20 — 실패/성능 시험**: 교착·부족입고·worker crash·대규모 작업물.

**완료 게이트:** 실행이 API와 분리되고, 성공/실패/취소/정체가 구분되며 당시 입력과 근거 이벤트가 남음.

## D. 결과 LLM 질의

수치 계산은 백엔드, 설명은 LLM.

- [ ] **D-01 — 결과 조회 tool**: run/metric/window/lineage/asset timeline.
- [ ] **D-02 — 분석 요약 API**: 자원 상태·대기 원인 증거를 제한 크기로 반환.
- [ ] **D-03 — 비교 tool**: 입력 차이/관측 기간/지표 정의 차이 포함.
- [ ] **D-04 — 근거형 답변**: 확인사실/가설/미정/가정/부분결과 구분.
- [ ] **D-05 — 결과 질문 UI**: 선택 run 고정, 이전 run 스냅샷 근거.
- [ ] **D-06 — 정량 평가**: API 수치와 답변 수치 일치, 무실행 예측 금지.
- [ ] **D-07 — 보안·운영**: 외부 전송 최소화·budget·감사·실패 대체조회.

**완료 게이트:** 과거 실행을 현재 설정으로 설명하지 않고, 증설 효과는 실행 없는 확정 수치로 답하지 않음.

## E. CAD·배치·운반 네트워크

앞 단계는 수동 이동시간으로 가능. 물리 schema는 처음부터 분리해 둔다.

- [ ] **E-01 — artifact 업로드**: project 권한·해시·압축 해제 안전 한도.
- [ ] **E-02 — 추출 파이프라인**: DXF/추출ZIP parser, manifest/geometry 누락 보고.
- [ ] **E-03 — 좌표 정규화**: OCS/WCS/단위/중첩/회전/배열·모델공간 시험.
- [ ] **E-04 — 후보 매핑**: EQ/ST 대응 후보·confidence·검토·현장확인.
- [ ] **E-05 — 배치 버전**: 설비 footprint·IN/OUT·공간 boundary.
- [ ] **E-06 — 구역 편집**: 물리 zone, 문·벽·기둥·접근 지점.
- [ ] **E-07 — 통로 graph**: direction/width/mode/port attachments.
- [ ] **E-08 — 운반 자원 설정**: 대수·속도·상하차·적재·근무 버전.
- [ ] **E-09 — 네트워크 이동**: manual→network adapter, 최단 허용 경로.
- [ ] **E-10 — 물류 검증**: 연결단절·차단·차량 불가·폭미정 표시.
- [ ] **E-11 — layout UI**: pan/zoom/layer/선택/매핑/검토; flow좌표와 분리.
- [ ] **E-12 — 공유구간 혼잡**: 필요성이 확인되면 capacity/교차로 handler 추가.
- [ ] **E-13 — 배치 비교**: 동일 생산조건에서 layout 변경 run 비교.

**완료 게이트:** 도면 표기 후보와 실제 승인 포트를 구분하고, 이동 경로가 실제 통행 graph를 사용.

## F. 서비스 운영·템플릿 확장

운영 검증은 앞 단계마다 병행, 배포 직전 종합 게이트.

- [ ] **F-01 — 환경·보안**: 개발/검증/운영 분리, 인증·RLS·secret·quota.
- [ ] **F-02 — 백업·복구**: DB/artifact 백업과 restore drill.
- [ ] **F-03 — 관측**: API·queue·worker·LLM·CAD 실패와 비용 대시보드.
- [ ] **F-04 — 보존 정책**: 실행·이벤트·도면·채팅 데이터 보관/삭제 승인.
- [ ] **F-05 — 템플릿**: project clone/import/export와 버전 호환.
- [ ] **F-06 — 플러그인 확장**: 새 공정 유형 handler/schema/capability/test 패키지.
- [ ] **F-07 — 운영 문서**: 배포/rollback/장애대응/키회전/데이터정정.
- [ ] **F-08 — 인계 패키지**: 최신 docs/OpenAPI/migration/test/lock/CHANGELOG 동봉.

**완료 게이트:** 운영 복구·권한·데이터 경계가 검증되고 새 사업체 프로젝트를 하드코딩 없이 생성 가능.

## 3. 바로 시작할 첫 작업 묶음

1. G0-01: 저장소 조사 결과를 받아 기존 구현 여부부터 확인.
2. G0-03~06: ERD와 DTO/API의 프로젝트·포트·수량/시간 계약을 리뷰.
3. A-01~05: 프로젝트 생성, 설비 생성과 IN/OUT, 공간 생성까지 수직 구현.
4. A-09~12: 제품6의 1단계 절연을 draft로 저장·재조회.
5. C0-01~03: 시험 가정을 명시한 단일 공정 실행과 보빈 산출 이벤트 확인.
6. 이후 A 나머지와 B/C0를 진행.

첫 프롬프트는 [14_handoff_prompts.md](../agents/14_handoff_prompts.md)를 사용한다.

## 4. 공정 추가·수정의 상시 흐름

사용자 입력 → 원문 보존 → 기존 자산/공간 대응 → 새 초안 → 미정/정정 확인
→ validation → 검토 승인 → 위키 갱신 → 시나리오에서 새 버전 선택.

새 공정 유형이면 handler capability를 확인한다.
데이터 저장은 가능해도 엔진 비지원이면 “등록됨/실행 미지원”으로 구분한다.
기존 실행은 영향받지 않으며 새 조건으로 비교 run을 생성한다.

## 5. 변경 요청 템플릿

```text
변경 ID:
요청일:
요청자:
대상 문서/REQ/ADR/작업 ID:
이유:
기존 조건:
새 조건:
DB/API/FE/엔진/위키/CAD/테스트 영향:
미정 사항:
마이그레이션·하위호환:
승인:
구현 commit:
검증 결과:
```

**현재 완료 표시: 0개. 전체 계획 작업: 93개.** 이는 작업 분해 수이며 개발기간 추정이나 구현 증거가 아닙니다.
