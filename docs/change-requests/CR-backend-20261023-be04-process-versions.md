# CR-backend-20261023-be04-process-versions
- 요청자: Backend / 작업 BE-04(제안) / 대상: contracts/04 §4(공정 버전·그래프), contracts/03 §4~8, ERD §5·§9·§14
- 상태: **제안(미승인)**. 승인 전 구현하지 않는다. 승인 시 새 scope `process-versions`로 contract **0.4.0**.
- 근거: FE 요청 R-FE-07(제품·공정 버전 API 일정·단계 DTO, 약속한 "FE 화면 모델 ↔ 03 §4~7 어긋남 목록"), FE 순위 3(BE-REQ-010), FE의 공정 표 편집 초안(FE-00f).
  선행: BE-03 `product`(0.3.x). 입력 대기: FE 의견(§6, `request-from-backend.md` BE-REQ-015).
- 이 문서는 도메인 사실을 만들지 않는다. 미정 값(OPEN-001~020)은 `unknown`/`not_applicable`로 저장하고 기본값으로 채우지 않으며, 제품 6종의 예시 값을 엔진·시드에 하드코딩하지 않는다.

## 1. 범위와 단계 분할 (공정은 크므로 3단계로 쪼개는 것을 제안)
| 단계 | 내용 | 비고 |
|---|---|---|
| **BE-04a** | 공정 버전 생명주기 + 그래프 저장(노드·간선·단계·자원 요구·후보) + 단계 수정 + knowledge 검증 + 제출/승인/반려 | FE 공정 표 편집을 실제 연동하는 최소 단위 |
| BE-04b | 공정 버전 복제(clone-to-draft), 버전 비교(diff), 화면 좌표(`process_editor_state`) | FE 그래프 캔버스가 생길 때 |
| BE-04c | 단계 입출력 재료 spec(`step_material_spec`), join/supply/precedence 간선의 spec 연결, 완료 milestone | 물량 보존·합류 규칙 확정 후 |
이 CR의 승인 대상은 **BE-04a**다(04b·04c는 설계 방향만 §7에 적고 별도 CR로 올린다).

## 2. 데이터 모델 (BE-04a, migration 0004, ERD §5 해석)
- `process_version(id, project_id, product_id, version_no, status, schema_version, base_version_id NULL, raw_unit_spec jsonb, finished_unit_spec jsonb, completion_node_id NULL, notes, submitted/approved/rejected …, row_version)`
  - `UNIQUE(product_id, version_no)`, FK `(project_id, product_id) → product(project_id, id)`(0.3.0이 만든 `uq_product_project_id` 사용).
  - 상태 `draft | in_review | approved | superseded`(03 §2 해석, 자산 버전과 같은 전이 표·트리거 방식). 제품당 열린 버전(draft/in_review)은 하나, 승인본도 하나(자산 버전과 같은 부분 유일 인덱스).
  - `raw_unit_spec`/`finished_unit_spec`(ERD): 원자재 기본 단위·완제품 단위. 길이·중량·보빈 수·가닥 수를 섞지 않는 값 객체(재료 `default_spec`과 같은 판별 객체 형식 `{mode, value}`), 기본 모두 `unknown`.
- `flow_node(id, project_id, process_version_id, node_key, kind, label, asset_id NULL, input_match_policy, display_order, milestone_type NULL)`
  - `kind`: `source | buffer | operation | join | milestone | sink`. `UNIQUE(process_version_id, node_key)`. buffer/source/sink는 `asset_id`(저장·도킹 공간)로 실제 공간을 참조 가능, operation은 설비를 직접 박지 않는다(ERD §5 "연결 모델"). 같은 asset의 재방문은 노드가 달라도 하나의 자원이다.
- `process_step(node_id UNIQUE, operation_type, handler_version, timing_rule, output_rule, input_rule, handoff_rule, execution_rule, …)` — node.kind=operation만. 규칙은 JSONB(판별 객체, `schema_version` 필수, 모르는 키 거부), §3 참조.
- `resource_requirement(step_id, role_key, resource_kind, selection_mode, required_count, capacity_mode, allocation_rule)` + `requirement_candidate(requirement_id, asset_id, eligibility_status, parameter_override)`.
  - `resource_kind`: `equipment | worker`(노동자 무제한 = `worker`+`capacity_mode=unlimited`, 가짜 EQ 설비를 만들지 않음). `selection_mode`: `one_of | all_of`. 후보는 **asset UUID**이며 같은 project의 asset만(복합 FK). 그룹 전체가 미래에 후보로 자동 확장되지 않는다(후보 id 고정).
  - `eligibility_status`(후보 qualification): `confirmed | unknown`(OPEN-001). `unknown` 후보는 knowledge 승인은 가능하지만 시나리오에서 가정 승인 전 실행 불가.
- `flow_edge(from_node_id, to_node_id, edge_kind, movement_rule, condition_rule, edge_key)` — `edge_kind`: `material | precedence | supply`. 양끝은 같은 버전의 노드(복합 FK). 이동 규칙(`movement_rule`)은 03 §7의 `travel_rule`(`unknown|manual_duration|network_route|direct_feed`)을 따르며 기본 `unknown`.
- 모든 하위 테이블은 `project_id`와 `(project_id, process_version_id, …)` 복합 FK로 같은 프로젝트·버전만 묶는다(ERD §9). **승인(approved)·검토 중·대체된 버전의 자식 행(노드·간선·단계·후보) 변경·삭제도 트리거로 거부**한다(ERD §14 "부모 상태만 API에서 검사하면 불변성이 깨진다").
- 그래프 저장 경쟁: 자식 변경은 모두 부모 `process_version.row_version`을 올리며 같은 행 잠금을 쓴다(ERD §14).

## 3. API (BE-04a, 04 §4의 일부, 자산과 같은 규약)
| Method | Path | 설명 |
|---|---|---|
| GET / POST | /projects/{p}/products/{id}/process-versions | 목록(최신 `version_no`부터, cursor) / 새 초안(본문 없음 또는 `base_version_id`로 승인본 복사). 열린 버전이 있으면 409 `PROCESS_DRAFT_EXISTS` |
| GET | /projects/{p}/process-versions/{v} | 상태·제품·`issues`(계산된 검증 요약)·`row_version` |
| GET / PUT | /projects/{p}/process-versions/{v}/graph | 그래프 전체 조회 / **원자 저장**(If-Match). 04 §4의 PUT 규칙 1~7: 권한·If-Match → client UUID/임시 key 검증 → 같은 프로젝트·버전 참조 → 한 트랜잭션 → 삭제 노드의 간선 처리 명시(묵시 생성 금지) → 새 `row_version`·검증 요약 반환 |
| PATCH | /projects/{p}/process-versions/{v}/steps/{step_id} | 단계 상세 수정, **버전 단위 ETag**(`row_version`) 검사, 같은 잠금 |
| POST | …/{v}/validate | `scope=knowledge|run_template`(실행 가능 판정은 04c 이후 확대). 오류 목록이 있어도 정상 검증이면 200 |
| POST | …/{v}/submit · reject · approve | 자산 버전과 같은 흐름·권한(제출 admin·editor, 반려·승인 project admin), 전이도 If-Match 필수, 승인 시 이전 승인본은 `superseded` |
- 제품 목록(`GET /products`)에 `latest_process_version`(요약, 자산의 `latest_revision`과 같은 방식) **추가 필드**를 도입한다(BE-03에서 이월, FE 요청).
- 오류 코드 추가: `PROCESS_DRAFT_EXISTS`(409), `UNSUPPORTED_HANDLER`(04 기존, run_template에서만), 그 밖은 자산 버전과 같은 `VERSION_IMMUTABLE`·`INVALID_STATE_TRANSITION`.
- 검증 오류의 대상 지정: `entity_id`(node/step/edge id) + `field_path`(그 엔티티 내부 JSON Pointer, 예 `/timing_rule/processing/output_schedule`) — 순서 번호는 쓰지 않는다(FE 확인됨).
- 단계 검증(knowledge, 03 §5 V0~V3): 구조 오류는 승인을 막고(`severity=error`), 미정은 경고로 승인을 막지 않는다(ADR-017). 규칙 id: `VAL-TIME-xxx`(처리 시간), `VAL-OUT-xxx`(산출), `VAL-RES-xxx`(자원), `VAL-GRAPH-xxx`(그래프: dangling edge, 시작·끝, 노드 종류별 제약, 실제 순환은 등록 경고·실행 차단).

## 4. 단계 규칙 JSON (03 §4~7, schema_version "1.0", 모르는 키 거부, 모든 규칙에 판별자)
숫자 값은 03이 이름에 단위를 넣은 필드(`speed_m_per_min`, `duration_min`, `reference_length_m` …)를 쓰되, 미정 표현은 자산 용량·재료와 같은 **판별 객체 `{mode: unknown|known|not_applicable, value}`** 를 쓴다(03 §2 "null=미정, field_meta로 사유"의 단순화 — 아래 §5 #2). 요지:
- `timing_rule.processing`: `kind`=`unknown|none|output_speed|per_output_unit|per_reference_length`.
  - `output_speed`: `speed_m_per_min`, `basis`(`per_stream|aggregate_output`), `output_schedule`(`sequential_units|…`), `parallel_streams`(정수).
  - `per_output_unit`: `duration_min`, `output_schedule`. `per_reference_length`: `reference_length_m`, `duration_min`, `scaling`(`unknown|linear`), `includes_setup`(`unknown|yes|no`).
- `timing_rule.setup`: `{duration_min, trigger}`(trigger 8종 + `unknown|not_applicable`). `timing_rule.precondition_delay`: `{duration_min, trigger, occupancy}`(AL 싱글-12의 120분 대기, `occupancy` 미정 허용).
- `output_rule`: `mode`(`unknown|configured_units|split_length|pass_through|merge_strands|fixed_mass_units`), `unit_form`, `length_m`, `unit_count`, `quantity_basis`(`per_operation|per_input_unit|per_lot|total_plan`), `schedule`, `accounting_mode`(`abstract_yield` 등).
- `input_rule`(`acquire_scope`, `consume_policy`), `handoff_rule`(`mode`), `residual_rule`(03 §6), `execution_rule`(핸들러별 옵션) — 04a에서는 구조만 저장하고 값은 `unknown`을 기본으로 둔다.
- `operation_type`/`handler_version`: 엔진의 handler registry 이름(07 §2: `pass_through_length`, `split_length`, `output_units_by_time`, `configured_yield`, `supply_delay`, `inspection`, `transport_manual`)을 **등록 가능한 문자열**로 저장하고, 실행 가능 여부는 run_template에서 `UNSUPPORTED_HANDLER`로 막는다(등록과 실행 가능을 분리, 03 §12).

## 5. FE 화면 모델 ↔ 03 §4~7 어긋남 목록 (FE에 약속한 대조 결과)
기준: FE `processView.ts`(StepView·ProcessVersionDetail)와 `request-from-frontend.md` BE-REQ-011 표. **FE 변경이 필요한 것 / Backend 결정이 필요한 것**을 구분한다.
| # | FE 화면 | 03·ERD·07 | 영향 / 제안 |
|---|---|---|---|
| 1 | `processing`: `kind` + 값 하나(`value`) + `referenceLength` | `output_speed`는 `basis`·`output_schedule`·`parallel_streams` 필수(03 §4.1, 미정이면 full run 차단). `per_reference_length`는 `scaling`·`includes_setup` | **FE 필드 추가 필요**(AL/CU 멀티신선 `parallel_streams`·`basis`가 대표 케이스). 값 하나만으로는 03을 표현하지 못한다 |
| 2 | 값 표현 `{mode: unknown\|value\|unlimited\|…, value, unit}` | 03 §2는 `null`+`field_meta`, 이 CR은 판별 객체 `{mode: unknown\|known\|not_applicable, value}` 제안 | **이름만 다름**(`value`↔`known`, FE 어댑터가 변환 — BE-03에서 이미 합의). `unlimited`/`not_allowed`는 용량 전용이라 공정 값에는 없음 |
| 3 | `setup{trigger, duration}` | `setup{duration_min, trigger}` + **별도 `precondition_delay{duration_min, trigger, occupancy}`** | FE에 `precondition_delay`(공급 대기, 점유 여부) **없음** → 추가 필요 |
| 4 | `output{mode, unitCount, length}`(`unitCount` 단위 `bobbin`) | `output_rule{mode, unit_form, length_m, unit_count, quantity_basis, schedule, accounting_mode}`, mode에 `merge_strands`·`fixed_mass_units` | `quantity_basis`(작업당 vs 총 계획 수량 혼동 방지)·`unit_form`·`accounting_mode`(`abstract_yield` 표시) **없음**. 단위 `bobbin`은 `unit_form`이며 길이·중량·보빈 수·가닥 수를 섞지 않는 원칙은 일치 |
| 5 | `confirmation: confirmed\|unknown\|assumed`(**단계 단위**) | 03 §2: `assumed`는 **시나리오 가정**이며 master 승인 사실로 승격 금지. 확인 상태는 **필드 단위**(`field_meta`) | **FE의 `assumed` 단계 상태는 마스터 공정 버전에 둘 수 없다.** 제안: 마스터에는 `confirmed|unknown|not_applicable`만, 가정은 시나리오 입력으로 이동. 단계 단위 요약은 필드 상태에서 파생(서버 계산 `issues`)해 FE는 표시만 |
| 6 | `equipment{mode: group\|specific, candidateCodes[]}`(표시 코드) | `resource_requirement{role_key, resource_kind, selection_mode: one_of\|all_of, required_count, capacity_mode, allocation_rule}` + `requirement_candidate{asset_id UUID, eligibility_status, parameter_override}` | ① 코드가 아니라 **asset UUID**(FK, 코드는 표시용) → FE는 자산 목록으로 코드↔id 매핑 ② `group/specific`은 `one_of`(후보 중 `required_count`개)와 후보 1개의 경우로 표현 가능 ③ `required_count`·`resource_kind`(worker 무제한)·후보별 `eligibility_status`(OPEN-001) **없음** |
| 7 | `nextLocation`: 단계당 저장공간 하나 | 공정 그래프는 **명시적 buffer 노드**(`asset_id`)와 간선(`edge_kind`, `movement_rule`). 한 단계 뒤에 buffer가 여러 개(물류 경유 ST-022→ST-009)이거나 join/supply/precedence 간선이 있을 수 있음 | **직선 표(operation → buffer → operation)로 표현 가능한 부분만** FE 어댑터가 그래프로 변환. join·supply·분기·다중 buffer는 표로 표현 불가 → 그래프 캔버스 전까지 읽기 전용 표시. `nextLocation=null`은 "다음 buffer 노드 없음/미정"을 구분해야 함(미정은 buffer 노드의 `asset_id=null`) |
| 8 | 단계 `id`(클라이언트 UUID), `name` | `flow_node`에 안정적인 `node_key`(버전 안 유일)와 `label`, `display_order`, `kind` | FE는 `node_key`를 새로 만들어 보내야 함(예: `name`에서 파생하지 말고 UUID 기반). `name`→`label` |
| 9 | 검증 경로 `/steps/{순서}/…` | `entity_id`(node/step id) + 엔티티 내부 포인터 | FE가 이미 변경 예정(R-FE-07 확인) |
| 10 | 버전 상태 `draft\|in_review\|approved\|archived` | `draft\|in_review\|approved\|superseded` | 자산 버전과 같이 `superseded` 추가(FE BE-REQ-009 합의) |
| 11 | 제품 상세에 원자재·완제품 단위 없음 | `process_version.raw_unit_spec`/`finished_unit_spec`(예: "2t 롤 3,000m") | 공정 버전 헤더에 입력 화면 필요(미정 기본) |
| 12 | 단계에 `operation_type`·`handler_version`·`input_rule`·`handoff_rule`·`residual_rule`·`execution_rule` 없음 | 03 §5~7, 07 §2 | 04a는 구조만 저장(`unknown` 기본). 값 입력 UI는 필드별 확정 뒤 단계적으로 추가 |
| 13 | 제품 목록의 "최신 공정 버전" | `latest_process_version` 요약(이월 약속) | 이 CR에서 추가 필드로 제공 |
**참고(계약 내부 불일치, Backend가 정리할 것):** 03 §7(`reservation: unknown`, `wait_at_in_if_busy`, `block_machine_while_waiting`)과 07 §6~7(`reserve_on_dispatch|no_reservation|unknown`, OUT 정책 `machine_hold_until_departure|release_after_out_storage|output_transfer_only`)의 어휘가 다르다. 자산 버전(0.2.0)은 03 §7을 따랐다. 엔진 compile CR 전에 어휘를 하나로 맞추는 계약 변경(0.2.0 필드 값 정리)을 별도로 제안한다.

## 6. 결정이 필요한 항목
1. **범위**: BE-04a만 승인(권장) / 04b·04c 포함. 04a만으로 FE 공정 표 편집이 연동된다(직선 표 어댑터).
2. **값 표현**: 판별 객체 `{mode: unknown|known|not_applicable, value}`(권장, BE-03과 일관) vs 03 §2 원안(`null`+`field_meta`). FE는 BE-03에서 `known` 이름에 동의함.
3. **`assumed`**: FE 단계 상태에서 제거하고 마스터에는 필드 단위 `confirmed|unknown|not_applicable`만 두는 안(권장). FE 의견 필요(BE-REQ-015).
4. **`operation_type`/`handler_version`**: 등록 가능한 문자열 + run_template에서 `UNSUPPORTED_HANDLER`(권장) vs 지금 enum으로 고정. handler 이름 목록은 07의 초기 범위를 사용하되 엔진 CR에서 확정.
5. **권한**: 자산 버전과 같게(수정·제출 admin·editor, 승인·반려 project admin).
6. **그래프 PUT 입력 형식**: 노드·간선 전체를 보내는 04 §4 원안(권장) vs FE 직선 표용 `steps[]` 편의 endpoint 추가. 편의 endpoint는 계약 표면이 늘어 FE 어댑터를 권장.
7. **0.3.x와의 호환**: 모든 변경은 추가(비파괴). 자산 버전 어휘 정리(§5 참고)는 별도 CR.

## 7. 04b·04c 방향(승인 대상 아님)
- 04b: clone-to-draft(원본 UUID·children 전체 재매핑, 승인 기록 위조 금지), diff, `process_editor_state`(화면 좌표 전용, 물리 위치와 무관).
- 04c: `step_material_spec`(입출력 재료·상태·길이·중량·수량·가닥), 간선의 `source_output_spec`/`target_input_spec` 연결 검증, join 준비 조건, `completion_node_id`, 분할/합류 allocate 규칙(fan-out이 아닌 split/allocate).

## 8. 구현 계획(승인 후)
1. migration 0004(+자식 불변·상태 전이 트리거·복합 FK) + DB 통합 테스트(프로젝트 격리·타 프로젝트 asset 후보 거부·승인본 자식 변경 거부·열린 버전 유일성).
2. 규칙 JSON 판별 유니온·그래프 검증 도메인 로직(순수) 단위 테스트 → 서비스·API(버전 단위 ETag·PUT graph 원자성·동시 저장 경쟁 테스트).
3. 계약 0.4.0 승격(스냅샷·해시·CHANGELOG·예제), FE 안내, 인계.
