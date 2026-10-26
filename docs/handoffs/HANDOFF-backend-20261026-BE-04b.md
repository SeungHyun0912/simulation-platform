# HANDOFF-backend-20261026-BE-04b
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Backend(+단일 DB 담당) / BE-04b / 공정 복제 기준 선택·버전 비교·편집기 상태(ERD §5, CR be04 §7)
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-backend-core-be05 / d26f7af(origin/main) / 코드 c9de49a, 계약·시드·문서 후속 커밋은 `git log`로 확인
- 계약 버전 / OpenAPI hash / 승인 scope: **0.5.0**(머지 대기), sha256 `62e3529cbd258d1507d2827148b54b32e48f2715fe0421f8578ff77ad529f02d`, 기준 commit `c9de49a` / `process-versions` 확장. 0.4.0(`1da94db0…`, PR #18)은 게시본이라 바꾸지 않았다. 0.4.0과의 호환은 이전·이후 OpenAPI를 구조 비교해 확인했다(기존 operation·스키마 변경 없음, 추가 operation 3개·스키마 16개, 복제 요청 본문은 선택).
- 승인 근거: 사용자가 CR be05를 **PR #21 머지로 승인**(2026-10-26)하고 결정 4건에 대화로 답했다. 항목 2("draft가 최종 승인을 말하는 거라면 저장 시 바로 승인")는 draft가 최종 승인이 아니라 편집 가능 상태라서 **편집기 상태가 승인 절차 없이 바로 저장되는 것으로 해석**했다(CR §5-3 권장안과 동일). 해석은 `contract-status.json` approval_record와 CR §7에 기록했고 정정할 수 있다.
- 수정 파일: backend/{migrations/versions/0005…, src/simulation_platform/{models/process.py, models/__init__.py, schemas/process.py, domain/process_diff.py, repositories/process.py, services/process.py, api/v1/process_versions.py}, scripts/{seed_demo_data,generate_contract_examples}.py, tests/**, README}, contracts/{openapi.json, contract-status.json, CHANGELOG.md, 04_api_contract.md(§4 표·§4.1.1), examples/first-scope/*(4개 추가)}, docs/{change-requests/CR-…-be05(§7), planning/STATUS.md, agents/TASK_BOARD.md, communication/request-from-backend.md}
- 실제 구현 내용:
  - migration 0005 `process_editor_state`: 버전당 공용 하나(`user_id IS NULL`, 부분 유일 인덱스), 사용자별 유일 인덱스는 미리 준비, 복합 FK `(project_id, process_version_id)`, JSONB 객체 CHECK. **버전 동결 트리거 대상이 아니다**(승인본에도 저장).
  - 복제 기준 선택: `POST …/process-versions` 선택 본문 `{base_version_id}`(같은 제품의 모든 상태). 복사본은 항상 draft, 승인·제출 기록 미복사, 단위·메모·그래프를 새 id로 복사, 기준의 편집기 상태도 새 노드 id로 복사. 다른 제품·프로젝트·없는 버전 404.
  - 비교: `GET …/diff?against=`(생략 시 base, 없으면 현재 승인본). 순수 함수(`domain/process_diff.py`)가 `node_key`·`edge_key`로 맞추고 간선 끝점은 `node_key`로 비교, 자원 요구는 `role_key`·후보 `asset_id`로 키를 잡아 순서에 의존하지 않는다. 항목 `{field_path, change, before, after}`.
  - 편집기 상태: `GET·PUT …/editor-state`, 자체 ETag(저장 전 0), 어떤 버전 상태에서도 저장, 공정 버전의 `row_version`·감사 로그에 영향 없음, 같은 버전의 동시 첫 저장은 한 건만 성공(나머지 412).
  - 시험 시드 보충(멱등): P-001 승인본의 화면 좌표, P-004 초안(승인본에서 복사 후 메모·1단계 이름·속도 변경)로 비교 결과가 나오게 했다. 이미 공정 샘플이 있는 DB에도 보충된다.
- DB migration head / 적용 DB / 데이터 변환: **0005** / 테스트 DB(매 세션 재생성)와 로컬 개발 DB `simulation_platform`(0004→0005, 시드 2회 실행: 1회 `extras: added [editor-state, diff-sample]`, 2회 `added: []`) / 변환 없음.
- 추가·변경 API / 예제 / 재생성 필요 여부: 신규 3개 + 생성 본문(선택). 예제 4개(`process-version.create-from-base`·`process-version.diff`·`process-editor-state.get|put`, 총 44개). FE는 타입 재생성 시 변경을 반영하면 되며 필수 변경은 없다(CHANGELOG 0.5.0).
- 채택 결정과 근거: CR be05 + 사용자 결정(CR §7). 편집기 상태는 PoC로 공용, 사용자별 전환은 이후 계약 변경.
- 미정 또는 임시 가정: 사용자별 편집기 상태로 전환 시점, 편집기 상태 동시 저장 UX(마지막 저장 이김이 아니라 ETag 412), `execution_rule`·`input_match_policy`·`condition_rule`·`parameter_override`의 값 구조(도메인 결정 필요), 역할 정책(TECH-006), 운영 인증(TECH-002).
- 상대 담당자에게 필요한 조치: **FE** — BE-REQ-017(필요 없으면 "불필요"), CHANGELOG 0.5.0의 선택 작업. **사용자/조정자** — "저장 시 바로 승인" 해석 확인, PR 머지, 다음 범위(04c 또는 이월 규칙 필드의 도메인 결정) 지시.
- 환경 메모: 이 작업 중 개발 DB 컨테이너(`simulation-platform-postgres`)가 WSL 재시작으로 `exited`였고 `docker start`로 되살렸다(볼륨 유지, 데이터 변경 없음).

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체, 마지막) | backend/ (.venv) | Python 3.12, PostgreSQL 16(WSL Docker) | 0 | **341 passed**, 경고 5건(pydantic alias·starlette 테스트클라이언트, 기능 영향 없음) |
| `python -m ruff check .` | backend/ | ruff | 0 | All checks passed |
| `python scripts/generate_contract_examples.py ../contracts/examples/first-scope` | backend/ | test DB(0005) | 0 | 44 examples(기존 40개 불변, 4개 추가) |
| OpenAPI 후보 → `contracts/openapi.json` 복사·해시, 이전 계약과 구조 비교 | backend/ | — | 0 | sha256 62e3529c… = `contract-status.json`, 호환 위반 없음(추가 operation 3개) |
| `python tools/check_workspace.py` | 루트 | Python | 0 | PASS(문서·구조만, API/DB/SimPy 검증 아님) |
| `alembic upgrade head` (개발 DB) | backend/ | — | 0 | 0004 → 0005 (`alembic current` = 0005 head) |
| `seed_demo_data.py --yes` (개발 DB) 2회 | backend/ | — | 0 | 1회 보충 2건, 2회 `added: []`(멱등) |
| 개발 서버(`run_dev_api.ps1`, 포트 8000) 재기동 후 `GET diff`·`GET editor-state` | — | local 인증 | — | P-004 최신(v2 draft) vs 승인본: changed 2, header `/notes`, `nodes.changed=step-1`. P-001 승인본 editor-state `row_version 1`, 좌표 5개 |

신규 테스트: 순수 함수 단위 8건(`test_process_diff.py`), DB 제약 3건(`test_editor_state_constraints.py`), API 14건(`test_api_process.py`에 추가: 복제 기준·편집기 상태 ETag/검증/권한/동결/동시 저장/감사 없음·diff 변경 유형/방향/거부), 계약 1건(0.5.0 호환·닫힌 스키마)과 예제 1건, 시험 시드 검증 확장.

## 미실행 테스트와 이유
- 사용자별 편집기 상태: 미구현(DB 인덱스만 준비).
- RLS, FE 연동·generated client 생성(FE 담당), 부하·대량 그래프 성능, SimPy 엔진 연동: 미실행.
