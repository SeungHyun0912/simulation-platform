> 워크스페이스 재배치본 v1.1.0 / 2026-10-23. 경로 변경은 구조 결정이며, 업무 규칙과 기술 제안의 승인 상태는 승격하지 않습니다.

# 07. SimPy 실행 엔진·정확성 계약

> PROPOSED. 실행 입력은 03의 snapshot. 사용자 공정은 08, unresolved는 13.
> 시뮬레이션은 예측 모델이며 생산 제어 시스템이 아니다.

## 1. 책임 분리

DB: 상태·버전·계획·로그 보관.
compiler: DTO 검증, 참조 해석, 단위 통일, handler 구성.
SimPy: 가상 시간의 자원·이벤트 처리.
metrics: 정의된 이벤트로 수치 계산.
LLM: 결과 조회/설명. 계산·실행 의미를 결정하지 않음.

SimPy는 Resource/Store/Container와 이벤트 기반 대기를 제공한다.
이 프로젝트의 규칙·그래프·예약·생산 단위 해석은 우리가 구현할 영역이다. [S13,S14]
“공정 JSON을 SimPy가 자동 실행”하는 구조가 아니다.

## 2. compiler 단계

1. schema_version 지원 확인.
2. snapshot hash/프로젝트 scope/버전 상태 확인.
3. 모든 사용 자산·포트·공간·edge reference resolve.
4. 숫자·시간·용량·가정 승인 검증.
5. handler registry에서 operation_type+handler_version 선택.
6. 후보 자원·물질 입출력·합류/인계 컴파일.
7. logical flow와 physical movement 연결.
8. invariant 및 지원 capability 검사.
9. RuntimeModel 생성. 이후 DB current state 조회 없음.

handler 초기 범위:
- pass_through_length
- split_length
- output_units_by_time
- configured_yield
- supply_delay
- inspection
- transport_manual
- network_transport는 후속

실제 이름은 schema에 확정하되 임의 `eval`, Python 코드 문자열, LLM 생성 코드 실행 금지.

## 3. 실행 객체

- WorkItem: item_id, product_version_key, lot, form, length_m/weight_kg, material_state, location, reserved_by.
- Operation: op_id, step_key, input reservations, output target, asset reservations, state.
- EquipmentRuntime: asset_id, availability, exclusive state, request queue, current setup family.
- BufferRuntime: owner asset/port, occupancy, pending puts/gets, reservations.
- ResidualPool: scope key, product, length, source lineage, disposal policy.
- TransportTask: source/destination, selected mode/resource, reserved slots, travel state.
- RuntimeContext: Environment, random streams, event sink, limits, snapshot.

작업물은 m당 객체가 아니라 보빈/롤/다발 또는 명시적 잔량 객체.
주문량·보빈 수가 커질 때 batch 생성도 지원하지만 보빈별 인계 이벤트를 없애지 않는다.

## 4. 시간과 산출 이벤트

선속 순차 산출: unit_duration = output_length / speed.
단위당 시간: unit_duration = duration_min.
준비시간과 대기시간은 trigger에 따라 별도 처리.
생산 중 outage/calendar 지원 여부는 명시.

예:
- AL 싱글 메인 4,000m/32 = 125분/보빈. 이상 조건이면 t=125,250,...,1250에서 10개 산출.
- 제품6 절연 1,000m/30 = 33.333...분마다 1개, 2개 합계 66.666...분.
- 10보빈 총 시간을 한 번 기다린 뒤 일괄 생성하는 구현은 per_output_unit 인계에 부적합.
- total_batch 인계라면 개별 내부 완료와 외부 가용 이벤트를 분리할 수 있다.

멀티신선처럼 여러 스트림은 별도 계산:
per_stream parallel 12개 × 40,000m @100이면 각 스트림 400분(준비 제외).
aggregate/순차 처리이면 전체 480,000m @100 = 4,800분.
이는 **서로 다른 가정의 설명 예시**이며 제품4의 실측 시간 확정이 아니다.
해당 규칙이 미정인 상태에서 둘 중 하나를 자동 선택하지 않는다.

## 5. 투입 확보·소비·분할

1. 필요한 투입 spec별 작업물을 선택한다.
2. operation 단위 원자 예약; 부족하면 일부만 소비하지 않음.
3. 가용 설비 및 목적지 정책과 조정.
4. 정의된 시점에 consume/attach.
5. 산출마다 새 item 또는 상태 전환/분할로 trace.
6. 잔량 처리, 작업 완료, 예약/설비 해제.

재료가 여러 가닥이면 합계 길이를 제품 길이로 계산하지 않는다.
configured_yield는 입력 확보 한 번 후 지정 출력 생성, 반복 투입은 새로운 operation.
13→10의 abstract_yield는 lineage 관계는 남기되 physical conservation metric에 사용하지 않는다.

가중치 없는 모호한 parent-child 링크를 재료 질량의 정확한 비율처럼 보여주지 않는다.
split_length는 부모 남은 길이 감소와 자식 생성이 원자적으로 일어나야 한다.
실패/취소 시 이미 만들어진 output과 아직 확보 중인 input을 구분해 기록.

## 6. 설비 선택과 예약

실제 설비마다 Resource를 구성한다. 같은 asset_id는 run에 한 번 생성.
여러 후보 중 선택은 FIFO/우선순위/최초가용 등의 설정이며 후보 미확정은 실행 차단.
동시 확보 설비는 allocator가 전체 확보를 조정, 각 공정이 임의 순서로 하나씩 쥐고 대기하지 않게 한다.

`AllOf`는 이벤트 완료의 결합이지 여러 자원을 원자적으로 확보하는 allocator가 아니다. [S14](../../docs/reference/99_sources.md#s14)
AL line의 준비 완료와 설비 점유 생명주기는 분리:
싱글-1 가공 종료가 메인 시작조건이라는 사실과 메인 중 싱글-1 설비를 계속 점유하는지는 별개다.

reservation:
- reserve_on_dispatch: 출발 전에 자원/slot 예약; transport 동안 RESERVED_TRAVEL 상태.
- no_reservation: 출발 당시 조건만 확인; 도착 시 busy면 IN 대기.
- unknown: 특정 scenario 선택 필요.

예약한 채 운반 자원을 기다려 비효율이 생길 수 있으므로 RESERVED를 PROCESSING에 합치지 않는다.
전체 운반/설비/공간 lock 순서와 취소 시 해제 정책 테스트 필수.

## 7. IN/OUT와 blocking

IN:
- 구조상 항상 존재.
- capacity not_allowed이면 가공에 바로 인계 가능한 handshake만 허용.
- finite이면 slot 확보 후 이동/입고.
- busy 도착 시 대기 허용 규칙과 capacity가 모순이면 실행 전 검증.

OUT:
- machine_hold_until_departure: 배출까지 설비 점유 유지.
- release_after_out_storage: OUT에 놓을 수 있으면 설비 해제; buffer가 차면 생산 완료 후 막힘.
- output_transfer_only: 별도 저장 없이 다음 지점과 직접 인계.
- 정책 unknown은 필수 실행 질문.

Store는 객체 보관 수용량에 적합하지만 kg/m2 용량은 별도 capacity controller가 필요하다. [S13](../../docs/reference/99_sources.md#s13)
0 용량 Store를 만들어 handshake를 흉내내지 않는다.
OUT 슬롯 하나와 생산중 자재 하나를 같은 물량으로 중복 집계하지 않는다.

## 8. 이동

수동시간 모드와 네트워크 모드를 동일 TransportService interface로 제공.

manual:
- 거리 없어도 명시적인 duration으로 실행 가능.
- 0분은 사용자가 승인한 가정일 때만 허용.
- 운반자원이 미정인데 무제한으로 해석하지 않음. 시나리오 가정 기록.

network:
- from selected equipment OUT / space ACCESS
- port-network attachment
- 허용 mode와 directed edges
- 경로 거리, 속도/상하차/배차 대기
- destination IN/ACCESS

첫 단계는 혼잡 없는 경로시간 계산; 구간 용량/교차로 예약은 추가 handler.
유클리드 직선을 실제 통로 이동거리로 보고하지 않음.
ST-020→ST-021 지게차 후 AMR 전환은 두 task, 무조건 한 AMR 이동으로 묶지 않음.

## 9. 이벤트 표준

공통:
project_id, attempt_id, event_seq, sim_time_min, event_type, operation_id,
step_key, asset_key, item_key, source/destination, quantities, reason, definition_version.

최소 event:
- MATERIAL_ARRIVED, INPUT_RESERVED, INPUT_CONSUMED
- DISPATCH_REQUESTED, DISPATCH_STARTED, ARRIVED_AT_IN
- SETUP_STARTED/FINISHED, PROCESS_STARTED, OUTPUT_UNIT_READY, PROCESS_FINISHED
- BUFFER_ENTERED/LEFT, OUT_BLOCKED/UNBLOCKED
- RESIDUAL_CREATED/CARRIED/DISCARDED
- INSPECTION_STARTED/FINISHED
- MILESTONE_REACHED, RUN_TERMINATED

상태시간은 exclusive asset states 기준:
IDLE, RESERVED, SETUP, PROCESSING, BLOCKED, DOWN, OFF_SHIFT.
IN 대기는 item 상태이며 설비 상태와 별도로 기록.
“자재 부족”과 “순수 idle”을 세분할 경우 reason 필드.
관측할 대상·시점·저장 방식을 미리 정하는 것이 SimPy 계측 가이드의 핵심이다. [S16](../../docs/reference/99_sources.md#s16)

## 10. 결과 지표

| 지표 | 정의 초안 |
|---|---|
| 생산 완료량 | 제품 completion milestone에 최초 도달한 산출 item 수 및 길이 |
| 검사 완료량 | 검사 완료 item 수 및 길이 |
| 적재 완료량 | 지정 sink 도달 item 수 및 길이 |
| throughput | 지정 완료량 / 관측 기간; 분모 단위 표시 |
| lead_time | 완료 시각 - 시나리오가 정의한 시작 시각(입고/출고 등) |
| in_wait | PROCESS_STARTED - ARRIVED_AT_IN, setup 포함 여부 별도 |
| transport_wait | DISPATCH_STARTED - DISPATCH_REQUESTED |
| utilization | PROCESSING 시간 / 지정 eligible calendar 시간 |
| occupancy | buffer occupancy 시간적분 / 관측 시간 |
| WIP | 미완료 item, m, kg 별도 |
| loss | 길이 폐기 m, 중량 폐기 kg 각각 |
| blocked_time | 배출 불가로 설비가 BLOCKED인 시간 |

분모가 0이면 null/not_applicable, 0%나 Infinity 금지.
여러 공정 생산량을 합산해 최종 생산량으로 표시하지 않는다.
중간 보빈에서 최종 보빈으로 분할되면 completion count는 최종 item 기준.
미완료 run은 observed/censored 결과로 표시.
무한 작업자 검사라도 각 보빈에 10분 경과 필요, 동시 검사는 허용.

## 11. 종료와 교착 진단

SimPy `run()`은 이벤트 소진 시 종료하며, 숫자 until=H는 H 시각 이벤트를 처리하지 않는 경계를 갖는다. [S15](../../docs/reference/99_sources.md#s15)
본 엔진의 fixed horizon은 `[0,H)`로 정의하고 UI/metric에 명시한다.
end-inclusive 옵션을 도입하려면 경계 검증 후 별도 계약으로 확장.

- event queue empty + 목표 달성 → completed
- event queue empty + WIP/미완료 목표 → state=stalled, 진단된 termination_reason을 별도 저장(예: INSUFFICIENT_INPUT)
- future arrivals 존재 → 단순 starvation일 수 있으므로 즉시 deadlock 단정 금지
- calendar/monitor event만 무한 발생 → progress watchdog, event cap으로 진단
- 안전 제한 종료 → limit_reached, 성공 아님
- cancellation → cancelled, 남은 WIP/로그 완전성 표시

“진행 없음 N분”만으로 공정이 길다는 이유로 deadlock 처리하지 않는다.
실행 대기 그래프와 미래 가용 이벤트를 함께 진단한다.

## 12. 재현성과 검증

같은 snapshot/hash, engine version, dependency lock, seed, tie-break order면 재현되도록 설계.
resource 후보/동시 이벤트 정렬은 안정된 UUID 또는 snapshot 순서로 명시.
각 확률요소에 독립 random stream; 글로벌 random 사용 금지.
엔진 변경 후 같은 seed라도 같은 결과를 보장한다고 주장하지 않음.
통계 비교는 동일 조건 반복 실행과 분산/불확실성 보고를 후속으로 구현.

실행 모델에 대해 모든 장비의 물리 정확도를 보장하지 않는다.
현재 입력에는 abstract yield와 UNKNOWN이 있으므로 capability/assumption 보고서를 결과에 함께 제공.


## 13. 작업 중 공유 자원의 잠금 구간

하나의 operation이 여러 보빈을 산출할 때 설비를 언제 해제하는지는 별도 정책이다.
hold_for_operation이면 모든 설정 산출이 끝날 때까지 점유,
release_per_output_unit이면 보빈마다 해제 후 재배정.
사용자 자료의 “보빈별 인계”는 downstream 가용시점이지 설비 재배정 정책 확정이 아니다.
현재 사실로 전자를 자동 적용하지 말고 시나리오 가정으로 명시한다.
제품전환 판단은 실제 선택된 설비의 직전 작업 제품/교체군 기준으로 기록한다.
공정상 절연과 쉬스가 같은 설비를 사용할 때 교체시간0이라는 입력 외에
추가 교체 matrix를 임의로 가산하지 않는다.


---
기술 참조 [Sxx]의 공식 주소와 확인 범위: [99_sources.md](../../docs/reference/99_sources.md).
