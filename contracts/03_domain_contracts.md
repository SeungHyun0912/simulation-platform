> 워크스페이스 재배치본 v1.1.0 / 2026-10-23. 경로 변경은 구조 결정이며, 업무 규칙과 기술 제안의 승인 상태는 승격하지 않습니다.

# 03. 도메인·JSON·실행 입력 계약

> PROPOSED. 컬럼은 02, API는 04, 시뮬레이션 의미는 07을 함께 읽는다.
> 아래 JSON은 규격 예시이며 UUID가 필요한 자리에 실제 ID를 제공해야 한다.
> API DTO와 DB ORM을 그대로 같은 객체로 사용하지 않는다.

## 1. 고정 계약

- `schema_version`: 문자열, 초기 `"1.0"`.
- 외부 자원 관계: UUID. EQ/ST/제품명은 표시/입력 해석용, FK 아님.
- API decimal: `"1000.000000"` 형식 문자열. JS number로 긴 숫자를 왕복 저장하지 않음.
- 개수: JSON integer. 좌표·시뮬레이션 시간: finite number.
- null: 값 미정/미적용. `field_meta`로 사유 반드시 표현.
- 빈 문자열은 null이 아님. 숫자 단위가 맞지 않으면 422.
- 저장 규칙 객체에는 discriminator `kind` 또는 `mode` 필수.
- 알려지지 않은 필드를 기본 거부. 확장필드는 명시적인 `extensions` namespace만.
- enum 추가 시 schema migration/하위 호환 전략 기록.

Pydantic의 discriminated union으로 정책 종류별 검증을 구성하는 것을 제안한다. [S08](../docs/reference/99_sources.md#s08)

## 2. 상태 구분

버전: `draft → in_review → approved`; 반려 시 `in_review → draft`.
승인 버전은 superseded/deprecated 표시가 가능하되 내용 수정은 금지.
초안 보관 상태는 archived; 승인 해제 대신 새 버전 작성.

값 상태:
- confirmed: 사용자가 확인한 값
- unknown: 답 없음
- not_applicable: 적용 대상 아님
- assumed: 특정 시나리오 가정. master 승인 사실로 승격 금지

```json
{
  "length_m": null,
  "weight_kg": "2000",
  "field_meta": {
    "/length_m": {"status": "unknown", "reason": "입력되지 않음"},
    "/weight_kg": {"status": "confirmed", "source_ref": "USR-P04-RAW"}
  }
}
```

임의 크기 UNKNOWN을 `-1`, `Infinity`, `99999999`로 표현하지 않는다.

## 3. 용량 계약

```json
{
  "mode": "finite",
  "value": "4",
  "unit": "item",
  "status": "confirmed"
}
```

mode:
- unknown: value/unit null 가능, 실행할 때 해소
- finite: value>0, item이면 정수
- unlimited: value null
- not_allowed: 해당 포트에 대기 적재 불가. “0 용량 Store” 생성하지 않음

지원 unit: item, bobbin_slot, pallet_slot, kg, m2 등.
초기 엔진은 item만 지원하고 다른 단위는 등록 가능/실행 비지원으로 명시한다.
공간 body와 ACCESS 포트가 동일 물량을 이중 점유하지 않도록 storage owner를 지정한다.

## 4. 시간 계약

### 4.1 길이 기반 순차 산출

```json
{
  "schema_version": "1.0",
  "processing": {
    "kind": "output_speed",
    "speed_m_per_min": "32",
    "basis": "per_stream",
    "output_schedule": "sequential_units",
    "parallel_streams": 1
  },
  "setup": {"duration_min": "0", "trigger": "not_applicable"},
  "precondition_delay": {"duration_min": "0", "trigger": "not_applicable"}
}
```

- per_stream + sequential_units: 한 산출 보빈 L/v, 다음 보빈도 같은 속도로 순차 가공.
- per_stream + parallel_streams: 각 가닥/보빈이 동시에 v로 생성. 그룹 산출 시점을 별도 정의.
- aggregate_output: 총 산출 길이 합계의 처리속도. 개별 보빈 배출 스케줄도 별도 필요.
- 산출 스케줄/속도 기준이 미정이면 full run 차단; 현재 AL/CU 멀티신선이 해당.

`parallel_streams=1`은 모든 공정의 자동 기본이 아니라 위 예시의 명시적 설정이다.

### 4.2 산출 단위당 고정시간

```json
{
  "processing": {
    "kind": "per_output_unit",
    "duration_min": "22",
    "output_schedule": "sequential_units"
  },
  "setup": {"duration_min": "0", "trigger": "not_applicable"}
}
```

CU 태신선 22분/보빈, 검사 10분/보빈을 표현할 수 있다.
다만 여러 보빈을 병렬 처리할 능력과 시간 기준은 별도 자원 설정이다.

### 4.3 기준 길이당 시간

```json
{
  "processing": {
    "kind": "per_reference_length",
    "reference_length_m": "1000",
    "duration_min": "720",
    "scaling": "unknown",
    "includes_setup": "unknown"
  }
}
```

scaling=linear를 확인하기 전 다른 길이로 자동 비례 계산 금지.
시간에 준비 포함이면 setup을 추가하여 중복 가산하지 않음.

### 4.4 공급 지연

```json
{
  "processing": {"kind": "none"},
  "precondition_delay": {
    "duration_min": "120",
    "trigger": "unknown",
    "occupancy": "unknown"
  }
}
```

AL 싱글-12. `speed=0`을 나누거나, 별도 생산 120분으로 매 보빈에 반복 적용하지 않음.

준비 trigger: per_operation, per_input_replacement, per_output_replacement,
on_product_change, on_shift_start, once_per_run, unknown, not_applicable.
제품 교체시간은 이전→다음 제품군 matrix와 fallback UNKNOWN을 지원하는 후속 handler.

## 5. 수량·소비·산출 계약

```json
{
  "output_rule": {
    "mode": "configured_units",
    "unit_form": "bobbin",
    "length_m": "4000",
    "unit_count": 10,
    "quantity_basis": "per_operation",
    "schedule": "sequential_units",
    "accounting_mode": "abstract_yield"
  },
  "input_rule": {
    "acquire_scope": "per_operation",
    "consume_policy": "unknown"
  },
  "handoff_rule": {"mode": "per_output_unit"}
}
```

- configured_units: 산출 목표를 직접 지정. AL 싱글 메인에 적용.
- split_length: 원재료 길이에서 목표 단위로 분할.
- pass_through: 길이·수량 유지, 새 처리 상태로 전이.
- merge_strands: 가닥 합류; 산출 길이는 스트림/투입 길이 규칙으로 결정. 단순 합산 금지.
- fixed_mass_units: 중량 단위 산출, 길이는 미정 허용.

quantity_basis=per_operation/per_input_unit/per_lot/total_plan.
총 시나리오 생산 목표와 공정 한 작업의 산출 수량은 서로 다르다.
입력 한 번 확보하고 10개를 만드는 공정에서 매 산출마다 입력 13개를 재요청하지 않는다.
abstract_yield는 물량보존 검증 예외이며 원가·원자재 효율 지표에 경고를 붙인다.

투입 상태:
- reserve: 작업에 배정되었지만 아직 소비 전
- consume: 더는 다른 작업에서 사용할 수 없는 시점
- transfer/support: 공급 설비에 장착되어 메인 작업 동안 쓰는 관계
시점이 UNKNOWN이면 해당 handler의 실행을 막거나 승인된 시나리오 가정으로만 진행.

## 6. 잔량 계약

```json
{
  "residual_rule": {
    "mode": "carry_same_product",
    "on_product_change": "discard",
    "on_run_end": "unknown",
    "scope": "unknown",
    "physical_join_mode": "abstract_length_pool"
  }
}
```

제품1은 동일 제품 중 이월/전환 시 폐기만 확정.
실제 케이블 접속 방식이 확인된 것이 아니므로 abstract_length_pool이라고 표시.
scope=machine/product/operation/lot 중 사용자가 승인한 값이 필요.
제품5 절연의 4,000m는 잔량량만 알며 discard는 미정.
길이 폐기와 중량 폐기는 별개 지표. 가공 중 추가되는 절연/쉬스 재료 중량은 현재 모델 범위 밖.

## 7. 이동·예약·Out 정책

```json
{
  "dispatch_rule": {
    "condition": "destination_equipment_available",
    "reservation": "unknown",
    "wait_at_in_if_busy": true
  },
  "release_rule": {
    "condition": "destination_accepts",
    "block_machine_while_waiting": "unknown"
  },
  "travel_rule": {
    "mode": "unknown",
    "transport_mode": "amr",
    "duration_min": null
  }
}
```

travel mode: unknown, manual_duration, network_route, direct_feed.
direct_feed도 항상 이동시간 0이라고 확정하지 않는다. 실제 직결 선행/지연 설정 필요.
선택 설비가 이동 중 변경되는 경우 재배정 정책과 예약 취소 규칙을 명시한다.
용량 예약과 실제 운반 자원 배차는 별도 상태이다.

## 8. 그래프 계약

```json
{
  "schema_version": "1.0",
  "process_version_id": "00000000-0000-4000-8000-000000000001",
  "nodes": [
    {
      "id": "00000000-0000-4000-8000-000000000011",
      "node_key": "insulation",
      "kind": "operation",
      "step": {"operation_type": "processing", "handler_version": "1"}
    },
    {
      "id": "00000000-0000-4000-8000-000000000012",
      "node_key": "irradiation_wait_1",
      "kind": "buffer",
      "asset_id": "00000000-0000-4000-8000-000000000021"
    }
  ],
  "edges": [
    {
      "id": "00000000-0000-4000-8000-000000000031",
      "from_node_id": "00000000-0000-4000-8000-000000000011",
      "to_node_id": "00000000-0000-4000-8000-000000000012",
      "edge_kind": "material"
    }
  ]
}
```

위 예시는 구조 발췌이며 실행 가능한 전체 모델은 아니다.
operation에 시간/spec/resource가 모두 있어야 실행 가능.
FE node 좌표는 process_editor_state에 별도 저장.
batch graph PUT은 전체 유효성 검사 후 한 트랜잭션으로 변경하고 revision을 증가.

## 9. 실행 입력 스냅샷

compiler 입력은 다음을 포함해야 한다.

```text
schema_version
project_snapshot: id, name, organization scope
process_versions: frozen graph + rules + product specs
asset_revisions: frozen ports/capacities/candidate qualifications
layout: frozen network/placements or explicit manual travel rules
production_plan / arrivals / initial_wip
calendar / timezone / stopping_rule
scenario_assumptions with acknowledgments
seed / per-replication random streams
engine_version / dependency_lock_hash / code_commit
source_refs / validation_report / snapshot_hash
```

임의 외부 파일 경로나 평가 가능한 Python 문자열은 snapshot에서 금지.
실행 중 DB 현재 선속·현재 좌표를 다시 읽지 않는다.
스냅샷 내용 hash는 문서 정의 canonical JSON 직렬화로 생성. 정렬키·공백·decimal 문자열 표현을 고정.
hash 계산 대상에서 자기 hash와 생성 시각 등 비결정적 필드를 제외.

## 10. 종료·가용시간 계약

stopping_rule:
- fixed_horizon: `[0,H)` 기준, H 시각 이벤트 처리 여부를 명시.
- target_completed: 특정 완제품 milestone의 목표 보빈/길이 도달.
- drain_after_last_arrival: 마지막 입고 후 WIP 소진.
- max_events/max_wall_seconds: 안전 제한.

입고: scheduled, periodic, stochastic(분포 검증 후 후속).
생산 계획: 투입 원자재 수량과 완제품 목표를 별도 컬럼.
초기 WIP: 품목·길이·단위 수·공정 위치·처리 상태·가용 시각.
달력: 휴무/근무 외 진행 작업 정책 continuous/pause/finish_current 명시.
아직 없는 고장/수리/불량 기능은 일반 JSON에 숨겨 “지원”이라고 표시하지 않는다.

## 11. import/export

- export는 schema_version + project manifest + 참조된 설정만 포함.
- 복사/가져오기 시 ID map을 생성하고 FK 전체 변환, 코드 충돌은 사용자 해결.
- 원본 코드·원본 ID는 provenance에 보존하되 새 FK로 사용하지 않음.
- dry-run은 추가/수정/누락/충돌/UNKNOWN 보고.
- import는 idempotent external_key 또는 import_batch_id 적용.
- 실행 결과는 기본 복사 제외, 실행 기록을 복사할 때는 읽기전용 artifact로 구분.
- 승인된 생산 데이터와 fixture의 assumed 값을 섞지 않는다.


## 12. 지원 기능과 데이터 등록의 차이

운영 화면은 등록가능/검증가능/실행가능 상태를 분리한다.
예:
- kg 용량 공간 등록은 가능, 초기 item-only capacity handler에서는 실행 차단.
- 재작업 순환 graph는 저장할 수 있어도 유효한 반복 종료 규칙/handler 없으면 실행 차단.
- 신규 공정명 입력이 곧 새로운 물리 모델 지원을 의미하지 않음.
- 입고가 영구 반복되면 drain termination과 충돌할 수 있으므로 종료/입고계획 검증.
- supply 관계의 “산출12보빈”은 별도 가공 산출 복제가 아니라 원래 투입의 공급 상태가 될 수 있음.
  AL 싱글-12에 동일 item을 중복 생성하지 않는다.

## 13. 초기 수량 계획의 과잉 해석 방지

제품 정의의 “입력24개/산출9개”는 작업 구성이지 전체 생산물량이 아니다.
P05 태신선 한 작업36개가 다음 멀티신선24개를 채운 뒤12개 남을 수 있다.
이 잔여 **미투입 재고**는 태신선 가공 중량 잔량300kg과 다른 개념이다.
다음 작업 재고 매칭/입고 계획이 없으면 사용가능12개를 자동폐기하거나 원자재를 무한 생성하지 않는다.


---
기술 참조 [Sxx]의 공식 주소와 확인 범위: [99_sources.md](../docs/reference/99_sources.md).
