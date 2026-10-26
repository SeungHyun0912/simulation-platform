# HANDOFF-backend-20261026-BE-04c
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Backend(+단일 DB 담당) / BE-04c / 공정 단계 재료 spec·간선 spec 연결·완제품 지정(ERD §5, CR be04 §7의 04c)
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-backend-core-be07 / be9e5f9(시드 PR #24 위, origin/main은 ccf6072) / 코드 03f21ba, 계약·시드·문서 후속 커밋은 `git log`로 확인
- 계약 버전 / OpenAPI hash / 승인 scope: **0.6.0**(머지 대기), sha256 `509a71f15a7ed1ab1516f0ced5e107a55df56f3a553d9331b1f209a341c138ef`, 기준 commit `03f21ba` / `process-versions` 확장(operation 변경 없음, 선택 필드 추가). 0.5.0(`62e3529c…`, PR #23)은 게시본이라 바꾸지 않았다. 이전·이후 OpenAPI를 구조 비교해 확인: 기존 operation·속성 변경 없음, 새 스키마 `MaterialSpecDto` 1개, 요청 스키마의 새 필드는 모두 선택, 응답 두 곳(`GraphOut`·`ProcessVersionOut`)에 nullable 필드가 늘 뿐이다.
- 승인 근거: 사용자가 "다음 과정 진행해 줘. 확인이 필요한 사항들은 모두 그대로 진행하면 될 것 같아"(2026-10-26)라고 지시한 것을 CR be06 §5의 권장안 승인으로 **해석**했다. 명시적 "be06 승인"·CR 머지는 없고 FE 의견(BE-REQ-020)도 없다. `contract-status.json` approval_record와 CR §7에 기록했고 정정할 수 있다.
- 수정 파일: backend/{migrations/versions/0006…, src/simulation_platform/{models/{process,__init__}.py, schemas/process.py, domain/{process,process_diff}.py, repositories/process.py, services/process.py}, scripts/{seed_wire_factory,seed_demo_data,generate_contract_examples}.py, tests/**, README}, contracts/{openapi.json, contract-status.json, CHANGELOG.md, 04_api_contract.md(§4.1.2), examples/first-scope/*(3개 추가·8개 필드 반영)}, docs/{change-requests/CR-…-be06, planning/STATUS.md, agents/TASK_BOARD.md, communication/request-from-backend.md, handoffs/…-BE-04c.md}
- 실제 구현 내용:
  - migration 0006: `step_material_spec`(수량은 재료 `default_spec`과 같은 값 객체 JSONB, `spec_key` 단계 내 유일, 재료 FK는 같은 프로젝트만, 부모 버전 draft일 때만 변경하는 가드 트리거), `flow_edge.source_output_spec_id`·`target_input_spec_id`(상수 방향 컬럼을 포함한 복합 FK가 **spec이 간선 끝점 단계에 속함과 output/input 방향을 DB가 강제**, precedence 간선은 연결 불가), `process_version.completion_node_id`(milestone 노드만 가리키는 복합 FK, 동결 대상 컬럼에 추가, 가드 함수 교체).
  - API(operation 변경 없음): 단계 `material_specs[]`(그래프 PUT·단계 PATCH·그래프 조회), 간선 `source_output_spec_key`·`target_input_spec_key`(`spec_key`로 연결), 그래프 PUT·응답과 버전 응답의 `completion_node_id`. 단계 PATCH의 spec 교체는 `spec_key`로 맞춰 id를 유지하고, 간선이 연결한 spec을 제거·방향 변경하면 422 `VAL-SPEC-005`.
  - 검증: 저장 오류 `VAL-SPEC-002~004`·`VAL-GRAPH-005`·`VAL-REF-006`(다른 프로젝트의 재료), 경고 `VAL-SPEC-001`(수량 모두 미정)·`VAL-GRAPH-014`(완제품 판정 시점 미정: knowledge 경고, run_template 오류).
  - 비교·복제: `diff`가 spec·간선 연결·완제품(`/completion_node_key`)을 포함하고, 새 초안 복제가 이를 새 id로 함께 복사한다.
  - 실제 기준정보 시드(DEMO-WIRE) 공정 4가지에 단계별 투입·산출 수량, 12가닥 공급(`strand_count 12`), 간선 연결, 완제품 milestone(P04~P06; P01~P03은 문서에 없어 미정)을 반영했다. 이미 만든 개발 DB의 draft 6건에는 멱등하게 보충한다(구조·메모가 바뀐 것은 건드리지 않음).
- DB migration head / 적용 DB / 데이터 변환: **0006** / 테스트 DB(매 세션 재생성)와 로컬 개발 DB `simulation_platform`(0005→0006, 실제 기준정보 시드 2회: 1회 `upgraded P01~P06`, 2회 `upgraded []`; 시험 데이터 시드 2회 변화 없음) / 변환 없음.
- 추가·변경 API / 예제 / 재생성 필요 여부: operation 변경 없음, 선택 필드 추가. 예제 3개 추가(`process-graph.put-with-specs`·`process-step.patch-material-specs`·`error.spec-link-invalid`, 총 47개), 기존 예제 8개는 응답 필드 추가로 갱신. FE는 타입 재생성 시 변경을 반영하면 되며 필수 변경은 없다. **그래프 PUT은 전체 교체이므로 새 필드를 모르는 화면이 저장하면 새 필드가 지워진다**(CHANGELOG·04 §4.1.2에 명시).
- 채택 결정과 근거: CR be06 §5 권장안 + §7(DB가 방향·소속을 강제, 입력 spec이 둘인 단계는 간선마다 구분, `output_rule`과 spec은 자동 검증하지 않음).
- 미정 또는 임시 가정: 값 구조가 도메인 문서에 없는 `input_match_policy`·`condition_rule`·`execution_rule`·`parameter_override`(구현하지 않음), join 준비 조건·분할/합류 allocate 규칙, 물량 보존 판정, 완제품 시점이 문서에 없는 P01~P03의 `completion_node_id`(미정으로 둠), 사용자별 편집기 상태, 역할 정책(TECH-006), 운영 인증(TECH-002).
- 상대 담당자에게 필요한 조치: **FE** — BE-REQ-020(CR be06 의견, 그래프 PUT 새 필드 보존 방식)·BE-REQ-019(실제 기준정보 화면 확인). **사용자** — 이 승인 해석 확인, PR 머지(시드 PR #24 먼저), 다음 범위 지시.
- 시험 데이터 메모: `seed_demo_data.py`의 시험용 "확정된 그래프"에 완제품 milestone을 추가했다(없으면 run_template가 `VAL-GRAPH-014`로 오류). 이미 만들어진 개발 DB의 시험용 승인본은 동결 상태라 바뀌지 않으며 새로 시드하는 DB부터 반영된다.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체, 마지막) | backend/ (.venv) | Python 3.12, PostgreSQL 16(WSL Docker) | 0 | **409 passed**, 경고 3건(starlette 테스트클라이언트·pydantic alias, 기능 영향 없음) |
| `python -m ruff check .` | backend/ | ruff | 0 | All checks passed |
| `python scripts/generate_contract_examples.py ../contracts/examples/first-scope` | backend/ | test DB(0006) | 0 | 47 examples(3개 추가, 8개 필드 반영) |
| OpenAPI 후보 → `contracts/openapi.json` 복사·해시, 이전 계약과 구조 비교 | backend/ | — | 0 | sha256 509a71f1… = `contract-status.json`, 호환 위반 없음(operation 변경 없음, 선택 필드만) |
| `python tools/check_workspace.py` | 루트 | Python | 0 | PASS(문서·구조만, API/DB/SimPy 검증 아님) |
| `alembic upgrade head` (개발 DB) | backend/ | — | 0 | 0005 → 0006 (`alembic current` = 0006 head), 모델·migration 차이 검사 통과 |
| `seed_wire_factory.py --yes` ×2 (개발 DB) | backend/ | — | 0 | 1회 `upgraded P01~P06`, 2회 `[]`(멱등) |
| 개발 서버(포트 8000) 재기동 후 HTTP 조회 | — | local 인증, admin | — | DEMO-WIRE: P01~P03 spec 10·완제품 미정(경고 014), P04 spec 19·연결 간선 17, P05 spec 22·연결 21, P06 spec 14·연결 14, P04~P06 완제품 지정 |

신규 테스트: 순수 규칙·DTO·비교 9건(`test_process_material_spec.py`), DB 제약 13건(`test_step_material_spec_constraints.py`: 소속·방향 FK, 동결, 완제품 FK), API 22건(`test_api_process.py`: 왕복·검증 10종·재료 참조·PUT 전체 교체 주의·PATCH 교체와 연결 보호·동결·복제·diff·감사), 계약 1건(0.6.0 선택·닫힌 스키마)과 예제 1건, 시드 5건(공정 spec 값·보충 멱등·구조 변경 시 미개입).

## 미실행 테스트와 이유
- 값 구조 미정의 규칙 필드, 물량 보존 판정: 미구현. SimPy 엔진 연동: 엔진 미구현, 미실행.
- FE 연동·generated client 생성: FE 담당, 미실행. RLS·부하·대량 그래프 성능: 미실행.
