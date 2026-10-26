# CR-backend-20261026-be06-process-material-spec-completion
- 요청자: Backend / 작업 BE-04c / 대상: contracts/04 §4.1(공정 버전), 03 §5·§8, ERD §5(`step_material_spec`·`flow_edge` spec 연결·`process_version.completion_node_id`)
- 상태: **구현·승격됨(contract 0.6.0)** — 사용자가 "다음 과정 진행해 줘. 확인이 필요한 사항들은 모두 그대로 진행하면 될 것 같아"(2026-10-26)라고 지시한 것을 §5의 권장안 승인으로 **해석**했다(명시적 "be06 승인"·CR 머지 없음, FE 의견 없음 → 사용자·FE가 정정 가능). 0.5.0과 호환(추가 필드만, 단 PUT 전체 교체 주의는 §4).
- 선행: CR be04 §7의 04c. 0.5.0은 `main`에 게시되어 있으며 이 CR은 게시된 계약을 바꾸지 않는다.

## 1. 왜 지금 필요한가
실제 기준정보 시드(`seed_wire_factory.py`)를 만들면서, 문서(08 §4~7)에는 있는데 계약 0.5.0 스키마에 담을 곳이 없어 **공정 버전 `notes`에 글로만 적은 값**이 있다: 단계별 투입·산출 수량(태신선 3.3t×11개 동시 투입→1t×36보빈, 멀티신선 2t×2개→40,000m×12보빈 …), 12가닥 공급, "재권취 완료가 완제품" 판정 시점. 글에 있는 값은 엔진·검증·비교가 쓸 수 없다. 이를 구조화한다.

## 2. 범위(ERD에 구조가 정의된 3가지만)
| # | 기능 | 근거 |
|---|---|---|
| 1 | 단계의 입력·출력 **재료 spec**(`step_material_spec`) | ERD §5 `step_material_spec`, 03 §5 |
| 2 | 간선의 **spec 연결**(`source_output_spec` / `target_input_spec`) | ERD §5 `flow_edge`, "연결된 spec이 실제 endpoint step에 속하는지 서비스 검증" |
| 3 | 공정 버전의 **완제품 지정 milestone**(`completion_node_id`) | ERD §5 `process_version.completion_node_id` |

**제외(값 구조가 도메인 문서에 정의되지 않음, 별도 도메인 결정 필요):** 노드 `input_match_policy`, 간선 `condition_rule`, 단계 `execution_rule`, 후보 `parameter_override`, join 준비 조건·분할/합류 allocate 규칙. 구조를 Backend가 지어내지 않는다.

## 3. API(추가만, contract 0.6.0)
### 3-1. 단계 재료 spec — `StepDto.material_specs[]` (그래프 PUT·단계 PATCH·그래프 조회에 포함, 기본 `[]`)
`{spec_key, direction: input|output, material_definition_id|null, state_code|null, form|null, length_m, weight_kg, unit_count, strand_count, quantity_basis}`
- `spec_key`는 단계 안에서 유일(입력·출력 공통, 1~64자). 길이·중량·단위 수·가닥 수는 재료 `default_spec`과 **같은 값 객체**(`{mode: unknown|known|not_applicable, value}`, 길이·중량은 decimal 문자열 0 초과, 개수는 JSON 정수 1 이상, 기본 모두 unknown) — 서로 섞지 않는다.
- `quantity_basis`: `unknown|per_operation|per_input_unit|per_lot|total_plan`(`output_rule`과 같은 어휘). 작업 한 번의 수량과 총 계획 수량을 구분한다.
- `material_definition_id`는 같은 프로젝트의 재료여야 한다(아니면 422 `VAL-REF-006`). `state_code`(예 "1차 조사 후")·`form`(예 "보빈")은 자유 텍스트(각 1~100자·1~50자)이며 enum으로 좁히지 않는다.
- 단계 PATCH는 `material_specs`를 보내면 **통째 교체**(보내지 않으면 그대로, `resources`와 같은 규칙). 간선이 연결한 spec을 제거하거나 방향을 바꾸면 422 `VAL-SPEC-005`.

### 3-2. 간선 spec 연결 — `GraphEdge.source_output_spec_key`, `target_input_spec_key` (둘 다 선택, 기본 `null`)
- 연결은 **node_key가 아니라 spec_key**로 쓴다(spec id를 따로 만들지 않음). `source_output_spec_key`는 간선의 **from 노드**(operation) 단계의 `output` spec, `target_input_spec_key`는 **to 노드** 단계의 `input` spec이어야 한다. 아니면 422(`VAL-SPEC-002`·`003`, 본문 `field_path`). `precedence` 간선에는 쓸 수 없다(`VAL-SPEC-004`).
- 버퍼를 사이에 둔 흐름(operation → buffer → operation)에서는 operation에 붙은 간선에만 spec을 연결한다(버퍼는 spec이 없음).

### 3-3. 완제품 milestone — `GraphIn/GraphOut.completion_node_id`, `ProcessVersionOut.completion_node_id` (선택, 기본 `null`)
- 그래프 PUT 본문의 **최상위 선택 필드**이며 같은 요청의 `kind=milestone` 노드 id여야 한다(아니면 422 `VAL-GRAPH-005`). 그래프와 함께 원자적으로 교체된다.
- 미지정(`null`)은 "완제품 판정 시점 미정"이며 **knowledge에서는 경고** `VAL-GRAPH-014`, **run_template에서는 오류**(엔진이 완제품 시점을 알아야 함). 문서가 완제품 시점을 정하지 않은 제품(P01~P03)은 미정으로 둔다.

### 3-4. 검증·비교·복제
- 새 경고 `VAL-SPEC-001`(spec의 길이·중량·단위 수·가닥 수가 모두 미정). 저장 시 참조 오류는 `VAL-SPEC-002~005`·`VAL-REF-006`·`VAL-GRAPH-005`.
- `diff`: 단계의 `/material_specs/{spec_key}/…`, 간선의 `/source_output_spec_key`·`/target_input_spec_key`, 헤더의 `/completion_node_key`(node_key로 비교)를 포함한다.
- 새 초안 복제: spec·간선 연결·완제품 지정을 새 id로 함께 복사한다.

## 4. 호환성과 주의
- 모든 필드는 선택·기본값이 있어 0.5.0 클라이언트의 요청이 그대로 유효하고 응답은 필드가 늘 뿐이다.
- **주의(기존 의미 그대로):** 그래프 PUT은 전체 교체다. 0.5.0 이하 화면이 새 필드를 모르고 그래프를 다시 저장하면 `material_specs`·간선 연결·`completion_node_id`가 **지워진다**. 그래서 FE는 반드시 조회한 그래프를 그대로 수정해 보내야 하며(모르는 필드 보존) CHANGELOG에 명시한다.

## 5. 결정이 필요한 항목(권장안 적용)
1. 범위: 위 3가지(권장) / 이월 규칙 필드 포함(구조가 없어 비권장).
2. spec 수량 저장: 재료 `default_spec`과 같은 값 객체(권장, 단위 혼용 방지) vs 숫자 컬럼(`unknown`과 `해당 없음`을 구분 못 함).
3. 간선 연결 키: `spec_key`(권장) vs 별도 spec UUID.
4. 완제품 지정: 그래프 PUT의 `completion_node_id`(권장) vs 노드의 `milestone_type`.
5. 미정 완제품 시점: knowledge 경고 + run_template 오류(권장).

## 6. 구현 계획
1. migration 0006: `step_material_spec`, `flow_edge` spec 연결 컬럼·복합 FK(방향까지 DB가 강제), `process_version.completion_node_id`(milestone 노드만, 동결 대상) + 자식 가드 트리거.
2. 순수 규칙(구조 검증·경고)·diff 확장 → 서비스·API → DB 통합 테스트 → 계약 0.6.0 승격(스냅샷·해시·예제·CHANGELOG·04 §4.1.2).
3. 실제 기준정보 시드의 공정을 새 필드로 옮기고(`notes`의 구조화 가능한 값 제거) 이미 만든 개발 DB의 draft 공정에 멱등하게 보충한다.
