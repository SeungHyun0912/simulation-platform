> 워크스페이스 재배치본 v1.1.0 / 2026-10-23. 경로 변경은 구조 결정이며, 업무 규칙과 기술 제안의 승인 상태는 승격하지 않습니다.

# 12. 테스트·인수·운영 기술서

> 여기에 적힌 예상값은 단일 공정/가정된 fixture의 수학적 기준이다.
> 실제 전체 시뮬레이션·부하 시험을 실행했다는 뜻이 아니다.

## 1. 테스트 계층

1. domain unit: 단위·수량·시간·정책 검증.
2. database integration: 실제 PostgreSQL FK/RLS/트랜잭션/락.
3. API contract: DTO/OpenAPI/권한/ETag/idempotency.
4. compiler: snapshot→객체, 미지원·미정 차단.
5. deterministic simulation: 정해진 입력에 대한 event/metric.
6. property/invariant: 자원 중복/길이 분할/음수 재고/교착.
7. frontend component + browser: 폼·표·그래프·project 전환.
8. AI evaluation: 근거·권한·미정 처리.
9. CAD fixtures: 변환·매핑·누락.
10. operational: crash/retry/restore/load.

단위 테스트만 통과했다고 시스템 정확성을 보장하지 않는다.
실제 PostgreSQL 기능은 SQLite 대체 시험으로 검증하지 않는다.

## 2. 결정적 계산 시험

공통 fixture 가정:
- 투입물이 t=0에 준비됨.
- 준비시간0, 이동0, Out 막힘없음.
- 설비1개 독점, 산출순차, 보빈별 인계.
- 모든 가정은 테스트 이름/메타에 표시.
- 실제 product master를 수정하지 않음.
- fixture는 격리된 test project에 별도 생성하고 test 승인 이력을 사용한다.
  사용자 실제 제품6의 draft를 몰래 approved로 바꾸지 않는다.

| ID | 입력 | 예상 |
|---|---|---|
| SIM-001 | P06 최초 절연2,000m→1,000×2,30m/min | 출력시각100/3,200/3분 |
| SIM-002 | P04 메인4,000×10,32m/min | 125분 간격10개, 마지막1250분 |
| SIM-003 | P05 재권취12,000→600×20,50m/min | 12분 간격20개, 마지막240분 |
| SIM-004 | P06 재권취1,000→500×2,30m/min | 50/3,100/3분 |
| SIM-005 | P05 절연100,000→24,000×4,160m/min | 150/300/450/600분, 잔량4,000 |
| SIM-006 | 검사자무제한, t=0에5보빈,각10분 | 모두 t=10 완료, 검사자부족 대기0 |
| SIM-007 | 동일 검사 1명 가정,5보빈 | 10/20/30/40/50분 완료 |
| SIM-008 | P01 1,000×3→300m, 이월허용 | 최종10보빈, 잔량0 |
| SIM-009 | P01 1,000m만 처리 후 제품전환 | 300m3개, 잔량100m 폐기 |
| SIM-010 | CU 태신선3.3t×11→1t×36 | 중량차300kg, 길이는 추정 금지 |

SIM-005는 잔량 보관/폐기 처리를 fixture에서 별도 지정해야 실행할 수 있다.
가공시간을 output 기반으로 계산하므로 잔량4,000m에 추가 가공시간을 임의 가산하지 않는다.
실제 잔량 처리시간은 별도 규칙이 확인될 때 추가.
float 비교 허용오차는 test fixture에 명시(예: abs 1e-8분). 화면 반올림값을 비교 기준으로 쓰지 않음.

## 3. 엔진 의미·상태 시험

| ID | 시험 | 합격 조건 |
|---|---|---|
| SIM-011 | 같은EQ-036 1차/2차 재방문 | 자원은1개, 단계별속도 다름 |
| SIM-012 | 두제품 동일설비 경쟁 | 동시점유 capacity 초과없음 |
| SIM-013 | 후보2개 배정 | 중복예약/유실없음, 안정 tie-break |
| SIM-014 | IN full | slot 미확보 자재가 도착공간을 초과하지 않음 |
| SIM-015 | Out full/hold | 설비가 BLOCKED, 다음 가공 못 시작 |
| SIM-016 | Out buffer/free | Out 적재 가능 시 설비 해제 |
| SIM-017 | reserve-on-dispatch | 자재 이동 중 RESERVED와 PROCESSING 구분 |
| SIM-018 | no-reservation/busy arrival | In 대기 기록 |
| SIM-019 | 다중 자원 acquire | 일부자원 영구점유로 교착하지 않음 |
| SIM-020 | AL 준비합류 | 두조건 충족 전 메인 시작금지 |
| SIM-021 | configured10 | 투입13개 매 출력 재소비하지 않음 |
| SIM-022 | 이벤트소진+WIP | completed 아닌 stalled/부족재고 |
| SIM-023 | 미래입고 존재 | 즉시deadlock 단정금지 |
| SIM-024 | horizon=10,완료10 | [0,10) 결과에서 제외 |
| SIM-025 | 동일snapshot/seed/engine | 이벤트순서·결과 재현 |
| SIM-026 | 미정선속기준 | validation 실패, 임의직렬/병렬 선택금지 |
| SIM-027 | 잘못된분모0/NaN | metric null/not_applicable 또는 validation 오류 |
| SIM-028 | lineage 잔량 | 중복소비·음수길이·부모누락없음 |
| SIM-029 | 반복제어event만 존재 | watchdog/limit로 진단, 무한run 방지 |
| SIM-030 | 알수없는handler | 실행거부, pass-through로 fallback금지 |

property 검증:
- material conservation 적용 공정만 입력=산출+잔량+폐기(차원별).
- abstract_yield는 conservation 예외 표시가 필수.
- 각 item은 한 시각에 한 소유 위치/운반 상태만.
- 모든 reserve가 종료/취소 시 해제됨.
- 자원 상태시간 합계가 관측시간과 일치.
- 완료량은 milestone 최초 도달만 집계.

## 4. DB·권한·API 시험

| ID | 시험 |
|---|---|
| DB-001 | 같은 EQ코드를 서로 다른 project에 등록 가능 |
| DB-002 | cross-project asset/port/group/edge/scenario FK 모두 거부 |
| DB-003 | 다른 process version의 node를 edge에 연결 거부 |
| DB-004 | 설비IN/OUT 중복/누락 commit 거부 |
| DB-005 | approved row/subgraph 수정 거부 |
| DB-006 | master rename 후 과거snapshot 내용 유지 |
| DB-007 | project clone 모든UUID 재매핑, 원본에 쓰기없음 |
| DB-008 | RLS 앱계정으로 다른project 접근거부, pool scope 누출없음 |
| API-001 | If-Match 누락428, stale412 |
| API-002 | 동일Idempotency-Key 동시POST에 run1개 |
| API-003 | 같은key 다른body409 |
| API-004 | invalid unit/enum/negative/overflow 422 |
| API-005 | 역할별 승인/실행/취소 권한거부 |
| API-006 | OpenAPI와 실제응답 일치 |
| API-007 | graph PUT 부분오류 시 전체rollback |
| API-008 | 취소된run을 rerun하면 새run/attempt, 과거유지 |

## 5. 프런트엔드 시험

- FE-001 프로젝트 전환 중 오래된 응답이 새 화면에 표시되지 않음.
- FE-002 0/미정/무제한/미적용 round-trip.
- FE-003 100,000m와 100,000m/min 선택 구분.
- FE-004 같은EQ 재방문을 서로 다른 node로 표현하고 동일asset 참조.
- FE-005 graph 위치 변경이 물리좌표에 영향없음.
- FE-006 표↔graph↔DB round-trip.
- FE-007 승인버전 readonly, clone 편집.
- FE-008 버전충돌 diff/reload, 자동덮어쓰기없음.
- FE-009 키보드/오류라벨/색맹에도 상태 구분.
- FE-010 cancel_requested와 cancelled 구분.
- FE-011 무한검사자도10분 표시.
- FE-012 과거run 입력/가정 확인 가능.

## 6. 업무 정정 회귀

- DATA-001 자산118=설비96+공간22, 포트 초기214.
- DATA-002 P04 원자재2t×2, 24개로 회귀금지.
- DATA-003 P05 연선100,000→100,000.
- DATA-004 P05 절연24,000×4, 조사1:1.
- DATA-005 P05 절연잔량4,000 처리UNKNOWN.
- DATA-006 P06 최초절연은쉬스압출기.
- DATA-007 P06 테이핑없음.
- DATA-008 P06 쉬스·2차조사1,000m, 검사500m.
- DATA-009 P01~03 검사자UNKNOWN, P04~06 unlimited.
- DATA-010 ST-004 실리콘편조대기, ST-005 CU원자재.
- DATA-011 ST-021/ST-022 별도.
- DATA-012 미사용설비13대, 공간ST-015. candidate기준임을 표시.
- DATA-013 실리콘P03이AL신선라인을 자동통과하지 않음.
- DATA-014 공정seed 상태draft, 승인기록 조작금지.

## 7. LLM·CAD 검증

09/10 문서의 평가항목을 각각 AI-*, CAD-* case로 구현.
LLM 답변 정확도·보안은 정적 답변 비교와 tool trace를 함께 검사.
CAD는 작은 synthetic DXF fixture로 좌표변환을 먼저 검증.
원본첨부의 실제포트 현장확인은 자동테스트로 대체할 수 없음.

## 8. 작업·장애 시험

- OPS-001 queued 중 worker restart: job 유실없음.
- OPS-002 실행중 worker crash: stale attempt 진단, 같은 결과중복 집계없음.
- OPS-003 이전worker 늦은쓰기: fencing 거부.
- OPS-004 event flush재시도: seq unique, 공식attempt만 집계.
- OPS-005 API timeout 후 client 재전송: run중복없음.
- OPS-006 CPU/메모리/event 제한: 명시 종료사유.
- OPS-007 DB잠시중단: 로그완전성/실패 상태 명시.
- OPS-008 LLM장애: 기본조회/시뮬레이션 기능 유지.
- OPS-009 잘못된ZIP/path traversal/외부참조: 안전거부.
- OPS-010 백업restore 후 artifact hash/스냅샷연결 검증.

## 9. CI 순서

lint/type → domain → migrations from empty → PostgreSQL integration
→ API/OpenAPI contract → compiler/simulation fixtures → frontend component/build
→ browser E2E → security/negative → package artifacts.

migration 기존판에서 upgrade도 별도 시험.
외부 LLM 호출 테스트는 제한된 별도 pipeline, 일반 CI는 fake provider.
성능테스트는 하드웨어/데이터양/버전/측정방법을 결과에 기록.

## 10. 성능·운영 지표

아직 사용자 규모/SLO가 없으므로 다음을 측정한 뒤 목표를 확정:
API p95, graph 저장size/latency, snapshot 생성시간,
queue wait, events/sec, run peakRSS, DB write량,
CAD import peakRSS, LLM cost/latency, 프로젝트별 quota.

장애 runbook:
- 인증/권한 오류
- DB migration 실패/rollback 가능성
- queue stale/worker OOM
- 실행 정체/부족재고
- artifact 접근불가
- wiki index stale
- provider rate limit
- 잘못된 데이터 승인 발견

승인 데이터 정정은 새버전 발행, 해당 run 결과에 영향안내.
과거 snapshot을 몰래 수정해 숫자를 맞추지 않는다.

## 11. 개발 완료 정의

코드 작성 + migration + 자동테스트 + API 계약 + 문서 업데이트 + 인계 메모가 모두 필요.
이 문서의 체크리스트는 실제 테스트 실행 전에는 “검증 예정”이다.
