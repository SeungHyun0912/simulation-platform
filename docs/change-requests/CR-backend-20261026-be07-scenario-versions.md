# CR-backend-20261026-be07-scenario-versions
- 요청자: Backend / 작업 BE-05a(임시 ID) / 대상: contracts/04(새 §4.2 시나리오), ERD §6(`scenario`·`scenario_version`·`scenario_product`·`scenario_asset`), 03 §9(실행 입력 스냅샷)·§10(종료 규칙)
- 상태: **승인·구현·승격됨(contract 0.7.0)** — 사용자가 PR #40 머지 후 "권당안대로 진행해줘"(2026-10-27)라고 지시해 §5의 권장안 1~5를 승인으로 기록(보드 DEC-007). 결과는 §7.
- 선행: 엔진 C0(C0-01~07, `main` `ba6f95e`). 계약 0.6.1. 이 CR은 게시된 계약을 바꾸지 않고 **새 범위를 추가**한다(0.7.0 예정).

## 1. 왜 지금 필요한가
엔진은 공정 버전을 컴파일하고 실행할 수 있지만, 지금은 **시험 코드에서만** 입력을 만든다. 무엇을 얼마나 언제 넣는지(도착), 어떤 설비 버전을 쓰는지(용량·배출 규칙), 미정을 어떤 가정으로 채우는지, 언제 멈추는지를 **사용자가 저장하고 승인하는 곳**이 없다. 로드맵 C-01~C-06이 이것이며, 다음 CR(실행 스냅샷·job queue·worker, C-07~C-10)의 입력이 된다.

## 2. 범위
| # | 기능 | 로드맵 | 근거 |
|---|---|---|---|
| 1 | 시나리오와 시나리오 버전(draft → approved 불변, 새 초안 복제) | C-01 | ERD §6 `scenario`·`scenario_version` |
| 2 | 제품별 공정 버전(승인본) 고정과 도착 계획(시각·개수·길이·lot) | C-01·C-02 | ERD §6 `scenario_product`, 03 §10 입고 |
| 3 | 자산 버전 고정(사용 설비·공간의 승인된 자산 버전) | C-01 | ERD §6 `scenario_asset`, ADR-0002 결정 11 |
| 4 | 종료 규칙: `drain`(모든 작업물 소진) / `fixed_horizon`(분, `[0,H)`) | C-04 | 03 §10, 07 §11 |
| 5 | 시나리오 가정(미정 해소, master 불변)과 사유 | C-05 | ADR-017, 엔진 `ScenarioAssumptions` |
| 6 | 실행 사전검증: 엔진 컴파일 결과(오류·사용한 가정·면제 항목)를 그대로 보여 준다 | C-06 | 07 §2, 12 "등록/검증/실행 가능 분리" |

**제외(다음 CR be08):** 실행 요청·스냅샷·job queue·worker·이벤트 저장·지표(C-07~C-17). **제외(도메인 정의 없음):** 초기 WIP(C-03), 근무 달력(calendar), 주기·확률 입고, 완제품 목표 종료(`target_completed`).

## 3. API(추가만, contract 0.7.0 예정) — `/api/v1/projects/{project_id}` 아래
| 메서드·경로 | 권한 | 설명 |
|---|---|---|
| `GET/POST /scenarios` | viewer / editor | 목록(커서) / 생성 `{code, name, description}` → 첫 draft 버전도 함께 생성 |
| `GET/PATCH /scenarios/{id}` | viewer / editor | 이름·설명(ETag) |
| `GET /scenarios/{id}/versions`, `POST /scenarios/{id}/versions` | viewer / editor | 버전 목록 / 새 draft(`from_version_id` 선택: 복제) |
| `GET/PATCH /scenario-versions/{vid}` | viewer / editor | 내용 조회·수정(draft만, `If-Match` 필수, 아래 본문) |
| `POST /scenario-versions/{vid}/validate` | viewer | 실행 사전검증(저장하지 않음) |
| `POST /scenario-versions/{vid}/approve` | approver | 승인(사전검증 오류 0일 때만, 이후 불변) |

`ScenarioVersionOut`/`PATCH` 본문:
```json
{
  "products": [{
    "product_id": "…", "process_version_id": "…(approved)", "priority": 1,
    "arrivals": [{"at_min": "0", "count": 13, "length_m": "4000", "lot": null}],
    "assumptions": {
      "equipment_hold": "hold_for_operation", "unbounded_buffers": true,
      "manual_transport_minutes": {"forklift": "15"}, "residual_scope": {"sheath": "machine"}
    }
  }],
  "assets": [{"asset_id": "…", "asset_revision_id": "…(approved)"}],
  "stopping_rule": {"mode": "drain"} ,
  "assumption_reason": "현장 확인 전 임시 가정: 운반 15분",
  "notes": null
}
```
- `products[].process_version_id`는 그 제품의 **승인된** 공정 버전이어야 한다(아니면 422 `SCN-REF-001`). 같은 공정 버전은 한 번만.
- `arrivals[]`: `at_min`(decimal 문자열 ≥ 0), `count`(정수 ≥ 1), `length_m`(decimal > 0), `lot`(선택). 중량 단위 도착은 엔진이 아직 길이 작업물만 다루므로 제외.
- `assumptions`는 공정(node_key)마다 다르므로 **제품별**로 둔다. 값이 하나라도 있으면 `assumption_reason` 필수(422 `SCN-ASM-001`). 엔진이 쓴 가정은 사전검증 결과에 그대로 보고된다.
- `assets[]`: draft를 만들 때 서버가 **포함된 공정이 참조하는 자산의 최신 승인 버전**으로 채우고, draft 동안 사용자가 바꿀 수 있다. 승인 버전이 없는 자산은 비워 두고 사전검증에서 알린다(용량·배출 규칙을 모름 → 엔진이 unknown으로 다룸).
- `stopping_rule`: `{"mode":"drain"}` 또는 `{"mode":"fixed_horizon","horizon_min":"1440"}`.

사전검증 응답:
```json
{"runnable": false,
 "issues": [{"rule_id": "SCN-ARR-001", "severity": "error", "field_path": "/products/0/arrivals", "message": "…"}],
 "products": [{"process_version_id": "…", "compile_issues": [{"rule_id": "INPUT_COUNT_UNKNOWN", "node_key": "single-main", "message": "…"}],
               "assumptions_used": [{"code": "UNBOUNDED_BUFFERS", "node_key": null, "message": "…"}],
               "waived": []}]}
```
- 엔진 컴파일 오류 코드를 **새로 번역하지 않고 그대로** 돌려준다(엔진 코드 = 계약 문자열 목록, 04에 표로 고정).

## 4. DB(migration 0007, Backend 단일 작성)
- `scenario`(project_id, code UNIQUE in project, name, description), `scenario_version`(project_id, scenario_id, version_no, status draft|approved, stopping_rule jsonb, assumption_reason, notes, approved_by/at, row_version), `scenario_product`(…, product_id, process_version_id, priority, arrivals jsonb, assumptions jsonb), `scenario_asset`(…, asset_id, asset_revision_id).
- 프로젝트 격리 복합 FK: 공정 버전은 같은 제품의 것(ERD §6 "product와 version 일치"), 자산 버전은 같은 자산의 것. 승인본과 그 자식은 트리거로 동결(공정 버전과 같은 방식).
- ERD에 있는 `layout_version_id`·`calendar_rule`·`initial_wip`·`engine_options`는 이번에 만들지 않는다(정의 없음, 후속 ADD COLUMN).

## 5. 결정이 필요한 항목(권장안)
1. **범위:** 시나리오 정의 + 사전검증만, 실행(스냅샷·job·worker)은 다음 CR be08(권장) / 한 번에 실행까지(변경이 커서 비권장).
2. **승인 조건:** 사전검증 오류 0일 때만 승인(권장, 승인 시나리오 = 실행 가능) / 미정이 있어도 승인 허용.
3. **자산 버전 고정:** draft 생성 시 최신 승인 버전 자동 채움 + draft 동안 수정 가능(권장) / 사용자가 매번 직접 지정.
4. **가정 위치:** 제품(공정)별 가정 + 버전 공통 사유 1개(권장) / 시나리오 공통 가정.
5. **도착 형식:** 지정 시각 목록(`at_min`·`count`·`length_m`·`lot`)만(권장) / 주기·확률 입고 포함(정의 없음, 비권장).

## 6. 구현 계획(승인 후)
1. migration 0007 + 동결 트리거 + DB 통합 시험(프로젝트 격리·복합 FK·동결).
2. 순수 규칙(`SCN-*` 검증), 서비스·API, 사전검증은 DB에서 공정 버전·그래프·자산 버전을 읽어 엔진 `compile_snapshot`에 넘긴다(엔진은 DB를 모르는 그대로).
3. OpenAPI 후보(`backend/artifacts/openapi.candidate.json`) → 계약 0.7.0 승격(04 §4.2, 예제, CHANGELOG), 개발 시드에 시험 시나리오 1건, 인계 문서.

## 7. 구현 결과와 CR 원안과의 차이 (BE-05a, 2026-10-27)
- 구현: migration 0007(`scenario`·`scenario_version`·`scenario_product`·`scenario_asset`, 동결 트리거, 공정 버전 `(project_id, product_id, id)` 유일 제약 추가), API 10개, 계약 0.7.0. 구현 커밋 `f776dc3`. 증거는 `docs/handoffs/HANDOFF-backend-20261027-BE-05a.md`.
- **원안과 다른 점:** (a) 가정 사유 누락(`SCN-ASM-001`)은 저장 시 422가 아니라 **사전검증 오류**로 했다(초안 저장과 실행 가능 판정 분리, AGENTS §5). (b) 승인 권한은 원안의 "approver"가 아니라 공정·자산 버전과 같은 **project admin**이다(역할 체계에 approver 역할이 없음). (c) 상태는 draft → approved만 있고 검토(in_review) 단계는 두지 않았다(승인 조건이 사전검증이라 별도 검토 단계가 필요 없음). (d) 자산 자동 채움은 시나리오 생성 시점이 아니라 `products`를 저장할 때(그때 공정이 정해지므로) 한다. (e) 승인 후 대체된(superseded) 공정·자산 버전도 동결 내용이라 넣을 수 있다.
- **결정 적용:** §5의 5개 결정은 권장안 그대로.
