# CR-backend-20261026-be05-process-clone-diff-editor-state
- 요청자: Backend / 작업 BE-04b(제안) / 대상: contracts/04 §4.1(공정 버전), ERD §5 `process_editor_state`·clone, 03 §8
- 상태: **제안(미승인)**. 승인 전 구현하지 않는다. 승인 시 contract **0.5.0**(0.4.0과 호환, 추가만).
- 선행: CR be04 §7의 04b. 0.4.0은 `main`에 게시되어 있으며 이 CR은 게시된 계약을 바꾸지 않는다.

## 1. 범위
04b 중 **도메인 정의가 이미 있는 3가지만** 포함한다.

| # | 기능 | 근거 |
|---|---|---|
| 1 | 새 초안 생성 시 **복제 기준 버전 선택**(`base_version_id`) | CR be04 §7, ERD `process_version.base_version_id` |
| 2 | **버전 비교(diff)** 조회 | CR be04 §7 |
| 3 | **`process_editor_state`**(화면 좌표 전용) 조회·저장 | ERD §5, 03 §8 "FE node 좌표는 별도 저장" |

**제외(정의 부족, 별도 결정 필요):** 단계 `execution_rule`·노드 `input_match_policy`·간선 `condition_rule`·후보 `parameter_override`. ERD는 컬럼 이름만 있고 03·도메인 문서에 값 구조가 없다. 지금 만들면 구조를 Backend가 지어내게 되므로, 도메인 결정(`docs/decisions/`)으로 구조가 정해진 뒤 별도 CR로 올린다. 04c(`step_material_spec`·간선 spec 연결·`completion_node_id`)도 별도.

## 2. API
### 2-1. 복제 기준 선택 — `POST /projects/{p}/products/{id}/process-versions` (기존 operation 확장)
- 요청 본문을 **선택**으로 추가: `{ "base_version_id": uuid | null }`. 본문이 없거나 `null`이면 0.4.0 동작(현재 승인본, 없으면 빈 그래프)과 같다 → **0.4.0 클라이언트 호환**.
- `base_version_id`는 **같은 제품의 어떤 상태의 버전**(draft·in_review·approved·superseded)이어도 된다. 복사본은 항상 `draft`이며 승인·제출 기록은 복사하지 않는다(승인 기록 위조 금지).
- 그래프는 새 id로 복사(0.4.0과 같음), `base_version_id` 기록. 다른 제품·다른 프로젝트의 버전은 404(존재 여부를 숨김). 열린 버전이 이미 있으면 기존대로 409 `PROCESS_DRAFT_EXISTS`.
- 원자재 기본 단위·완제품 단위·메모도 기준 버전 값을 복사한다.

### 2-2. 비교 — `GET /projects/{p}/process-versions/{v}/diff?against={other_version_id}`
- `against` 생략 시 `v`의 `base_version_id`, 그것도 없으면 현재 승인본. 비교 대상이 없으면 422.
- 두 버전은 같은 제품이어야 한다(다른 제품 422 `VAL-REF-004`, 다른 프로젝트·접근 불가는 404). 읽기 전용이라 ETag·권한 제한 없음(프로젝트 구성원).
- **매칭 기준은 `node_key`·`edge_key`**(복제 때 id는 바뀌지만 key는 유지된다). 응답:
  `{ target_version_id, against_version_id, header: [{field_path, before, after}], nodes: {added[], removed[], changed[{node_key, fields[{field_path, before, after}]}]}, edges: {...}, steps: {changed[{node_key, fields[...]}]}, summary: {added, removed, changed} }`
- `field_path`는 해당 엔티티 안의 JSON Pointer(검증 항목과 같은 방식). 값은 입력 그대로(문자열 decimal 유지). 모드가 unknown↔known으로 바뀌는 것도 변경으로 나온다.
- 단계·자원 요구·후보는 `steps.changed`의 `/resources/...` 경로로 표현한다(후보는 `asset_id` 기준으로 매칭).

### 2-3. 편집기 상태 — `GET·PUT /projects/{p}/process-versions/{v}/editor-state`
- 본문: `{ node_positions: { "<node_id>": {x, y} }, viewport: {x, y, zoom} | null }`. 좌표는 JSON 숫자(유한수), `node_id`는 그 버전의 노드여야 한다(아니면 422 `VAL-REF-005`). 크기 상한: 노드 5,000개·본문 1MB.
- **사용자별**(`user_id` = 요청자)로 저장한다. 다른 사람의 배치를 덮어쓰지 않는다. 저장 전에는 GET이 빈 상태(`node_positions: {}`, `row_version: 0`, 200)를 돌려준다.
- **버전 상태와 무관하게 저장 가능**(승인본·제출본에서도). 화면 좌표는 물리 위치도 공정 내용도 아니므로 **버전의 `row_version`·승인·동결에 영향이 없다.** 권한은 admin·editor(읽기는 구성원). 자체 ETag(`row_version`)와 `If-Match`(428/412)를 쓴다.
- 새 초안을 복제할 때 **요청자의 편집기 상태를 새 id로 옮겨 복사**한다(있는 경우, 없는 노드는 버림).

## 3. 데이터(migration 0005)
- `process_editor_state(project_id, process_version_id, user_id, node_positions jsonb, viewport jsonb NULL, row_version, created_at, updated_at)`; `UNIQUE(process_version_id, user_id)`; 복합 FK `(project_id, process_version_id)`, `user_id` → `app_user`; `node_positions`는 객체 CHECK.
- 버전 동결 트리거 대상이 **아니다**(위 이유). 프로젝트 격리·타 프로젝트 버전 거부 테스트 포함.
- 기존 테이블은 변경 없음.

## 4. 호환성과 FE 영향
- 모든 변경은 추가다: 선택 본문, 새 operation 3개(diff, editor-state GET/PUT). 0.4.0 클라이언트는 그대로 동작한다.
- FE는 우선순위가 낮으면 적용을 미뤄도 된다(필수 아님). FE 의견 요청: BE-REQ-017.

## 5. 결정이 필요한 항목
1. **범위**: 위 3가지만(권장) / 이월 규칙 필드 포함(구조가 없어 비권장).
2. **편집기 상태 소유**: 사용자별(권장) vs 버전 공용 하나(마지막 저장이 이김).
3. **편집기 상태와 동결**: 승인본에도 저장 허용(권장) vs draft에서만.
4. **diff 매칭 키**: `node_key`/`edge_key`(권장). FE가 key를 UUID로 만들면 복제 시 key가 유지되어 매칭되지만, FE가 key를 새로 만드는 흐름(전체 재생성)에서는 모두 added/removed로 보인다.
5. **복제 기준 허용 상태**: 같은 제품의 모든 상태(권장) vs approved·superseded만.

## 6. 구현 계획(승인 후)
1. migration 0005 + DB 통합 테스트(격리·사용자별 유일·동결 비대상·FK).
2. diff 순수 함수(도메인)·단위 테스트 → 서비스·API, `base_version_id` 선택 본문, 복제 시 편집기 상태 이전.
3. 계약 0.5.0 승격(스냅샷·해시·CHANGELOG·예제·04 §4.1 확장), 소통 파일·인계.
