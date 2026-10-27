# CR-backend-20261027-be10-bottleneck-analysis
- 요청자: Backend / 작업 BE-10(임시 ID, 결과 분석 API 3종 중 첫째) / 대상: contracts/04 §5(실행 결과 API), 07 §10(지표)
- 상태: **사용자 기준 반영, 승인으로 기록**(2026-10-27 사용자가 병목 판정 기준을 정하고 "후보로 정해준 API들을 순서대로 개발해 줘"라고 지시. API 담당이 이를 이 CR의 권장안 승인으로 해석, 정정 가능).
- 선행: 계약 0.11.0(지표 24종), PR #51 머지(`main` 61f7938).
- 범위: ① 단계별 지표 ② 병목 요약 API ③ 결과의 제품 코드·이름(FE 요청). 계약 **0.12.0**(추가만). 이후 ④ 설비 상태 타임라인 요약(0.13.0) ⑤ 시나리오·run 비교(0.14.0)를 같은 순서로 별도 PR에서 진행한다.

## 1. 왜 필요한가
현재 지표는 설비·대기 공간 단위라 사용자가 "어느 **단계**가 막히는가, 왜 막히는가"를 직접 읽을 수 없다. 병목을 UI가 가동률·대기시간을 조합해 추정해야 하고 원인(설비 가동·공간 부족·적체)이 구분되지 않는다.

## 2. 사용자 결정(병목 판정 기준)
병목은 아래 세 가지로 **멈춰 있는** 곳이다(사용자 지시, 2026-10-27):
1. **다음 저장 공간으로의 이동이 여유 공간 부족으로 멈춤** → `space_full`
2. **다음 생산 설비로의 이동이 그 설비의 가동으로 멈춤** → `equipment_busy`
3. **AMR·지게차는 한 번에 1제품을 옮기므로, 대기 중인 자재가 여러 개 쌓여 있는 곳도 병목으로 판단** → `queue_pileup`

## 3. 판정 방법(이벤트로만, 엔진 변경 없음)
멈춘 양은 **작업물·분(item-minutes)** 으로 잰다(작업물 하나가 멈춰 있던 분의 합).
| 종류 | 위치 | 멈춘 양 |
|---|---|---|
| equipment_busy | 단계(공정 버전·단계 key) | 작업 입력을 확보(INPUT_RESERVED)한 뒤 설비를 배정받기(설비 상태 RESERVED)까지 기다린 시간 × 그 작업의 작업물 수 |
| space_full | 대기 공간 노드 | 다음 공간 자리를 기다린 시간(ENTRY_WAITING → BUFFER_ENTERED) + 단계의 출력이 막힌 시간(OUT_BLOCKED → OUT_UNBLOCKED) |
| queue_pileup | 대기 공간 노드 | 그 노드에 동시에 쌓인 작업물의 최댓값(`buffer_peak_items`)이 기준(3개) 이상일 때, 노드에 머문 작업물·분(`buffer_item_min`). 그 노드의 다음 단계가 운반(`transport_manual`)이면 `transport_related`로 표시하고 운반 단계의 **최대 동시 운반 수**(= 필요한 지게차·AMR 대수, 운반 자원 무제한 가정 위에서)를 근거로 붙인다 |

- 같은 종류 안에서 멈춘 양의 비율(`share`)로 `level`을 정한다: high ≥ 30%, medium ≥ 10%, 그 밖은 low(기준값은 응답의 `thresholds`에 담고 정의 버전으로 관리).
- 서로 다른 종류의 양은 겹치므로(대기 공간에 쌓인 시간에 설비 대기가 포함됨) **합산하지 않고** 종류별로 순위를 매긴다.
- `limitations`에 한계를 명시한다: 공간 용량 무제한 가정이면 `space_full`은 평가되지 않음, 운반 자원(지게차·AMR 대수)은 엔진이 모델링하지 않아 적체와 필요 대수로만 추정, 가동 달력 없음, 미완료 run.

## 4. 추가 지표(정의 버전 1에 더함, 합산 가능한 값은 일 단위로 모아 일·주·월·전체로 합산)
- 단계(차원 `process_version_id`+`step_key`): `step_operations`, `step_processing_time_min`, `step_input_wait_item_min`(입력을 모으며 기다린 시간), `step_equipment_wait_item_min`·`step_equipment_wait_avg_min`·`step_equipment_wait_max_min`, `step_blocked_item_min`, `step_peak_concurrency`(동시에 진행된 작업 수의 최댓값).
- 대기 공간(차원 `node_key`): `space_wait_item_min`·`space_wait_max_min`, `buffer_item_min`, `buffer_peak_items`.

## 5. API
- `GET /projects/{p}/runs/{r}/bottlenecks`(viewer): 공식 결과(선택된 시도)의 병목 요약. 종류·위치·`level`·`share`·멈춘 양·근거 수치·한국어 설명, `limitations`, `thresholds`. 결과가 없으면 409 `RUN_RESULT_NOT_AVAILABLE`.
- `GET /runs/{r}/metrics`: 차원 필터에 `step_key`를 더하고 **여러 차원 필터를 함께 쓸 수 있게 완화**한다(AND, 호환). 지표 정의의 `dimension`에 `step`(공정 버전+단계)을 더한다.
- `result.products[]`에 `product_code`·`product_name`(선택, 실행 요청 당시 스냅샷 값. 이전 run은 현재 제품 목록으로 보충): FE 요청.

## 6. 결정이 필요한 항목(권장안으로 진행)
1. 병목 기준값(적체 3개, level 30%·10%)은 **임시 휴리스틱**이다. 실제 운영 데이터로 보정한다.
2. 지게차·AMR 보유 대수(지게차 3·AMR 2)는 공정 문서의 사실이나 엔진·계약에 값 구조가 없어 이번에는 **필요 대수**만 보여 주고 부족 판정은 하지 않는다(운반 자원 기능이 생기면 반영).

## 7. 구현 계획
migration 없음 → 지표 수집기(이벤트로 계산) → 병목 요약 서비스·API → 시험(손계산 대조·실제 6공정) → 계약 0.12.0 승격 → 인계.
