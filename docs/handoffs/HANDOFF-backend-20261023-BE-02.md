# HANDOFF-backend-20261023-BE-02
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Backend(+단일 DB 담당) / BE-02 / A 단계 두 번째 묶음(ERD §16)
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-backend-core / 1f8e696(origin/main d4d8227 위) / 코드 e2f3bba, 계약·문서 후속 커밋은 `git log`로 확인
- 계약 버전 / OpenAPI hash / 승인 scope: **0.2.0** / `da54371140b994aca48a9ac19653785d6dbc674bde959615a9d4964efdc2a33a` / `project-assets-ports`, `asset-revisions`
- 승인 근거: 사용자가 CR-backend-20261023-be02-asset-revision-capacity를 "전체 승인"(2026-10-23, CR §4 결정 5건은 제안안대로). 승인 시각의 시·분은 기록되지 않음. 사용자 본인 확인 필요.
- 수정 파일: backend/{migrations/versions/0002…, src/simulation_platform/{models/revision.py, domain/revisions.py, schemas/revision.py, repositories/revisions.py, services/revisions.py, api/v1/revisions.py 외 수정}, scripts/{seed_dev_data,generate_contract_examples}.py, tests/**}, contracts/{openapi.json, contract-status.json, 04_api_contract.md, CHANGELOG.md(신규), examples/first-scope/*, README 류}, docs/{architecture/02_erd_database.md(구현 반영 주석), change-requests/CR-…-be02(§4-1), handoffs/…-BE-02-for-frontend.md(신규), planning/STATUS.md, agents/TASK_BOARD.md(BE-02 행·FE-01 인계 칸)}
- 실제 구현 내용:
  - migration 0002: `asset_revision`, `port_policy`, `asset_port` 복합 유일 추가. 트리거: 상태 전이 표 강제·초안 외 내용 동결·부모가 초안일 때만 정책 변경·설비 revision은 커밋 시 IN/OUT 정책 필수. 부분 유일 인덱스: 자산당 열린 버전 1, 승인본 1.
  - API 7개: 버전 목록/생성/조회/수정, submit/reject/approve. 모든 변경에 `If-Match`. 승인·반려 project admin만, 제출·수정 admin·editor. 승인 시 이전 승인본 자동 `superseded`. 새 초안은 승인본 값 복사.
  - 용량 계약(03 §3) 검증: finite만 value·unit, 0 초과, 개수 단위 정수, kg·m2 소수 6자리, status 일관성. 서버 계산 `issues`(경고, 승인을 막지 않음). 규칙은 판별 유니온.
  - 자산 응답에 `current_revision`·`latest_revision` 추가(비파괴). 감사 로그 5종 기록.
  - 개발용 시드 스크립트, 계약 예제 22개(실제 응답에서 생성), 계약 동기화 테스트 확장.
  - 수정한 결함: SQLAlchemy JSONB가 `None`을 JSON null로 저장해 설비의 `storage_capacity IS NULL` 제약 위반 → `none_as_null=True`(audit_log before/after 포함).
- DB migration head / 적용 DB / 데이터 변환: **0002** / simulation_platform_test(테스트가 매 세션 downgrade→upgrade)와, 사용자 승인 후 로컬 개발 DB `simulation_platform`(빈 DB에 `alembic upgrade head` → 0002, 개발용 시드 실행·재실행 멱등 확인; 조직 1·사용자 3·프로젝트 1·멤버 3) / 변환 없음.
- 추가·변경 API / 예제 / 재생성 필요 여부: 위 7개 신규 + 자산 응답 필드 2개. **FE generated client 재생성 필요**(안내서 §5).
- 채택 결정과 근거: CR be02 §4-1(포트 정책은 설비 IN/OUT만, field_meta 제외, INVALID_UNIT 미사용, 전이도 If-Match 필수 등).
- 미정 또는 임시 가정: 역할 권한 매트릭스(TECH-006), 운영 인증(TECH-002), OPEN-003(예약·설비 점유)은 `unknown`으로 보존.
- 상대 담당자에게 필요한 조치: **FE** — 안내서 `HANDOFF-backend-20261023-BE-02-for-frontend.md` §2 표 대조 후 FE-01a부터(프롬프트는 §8). **조정자/사용자** — approved_by·approved_at 확인(사용자가 "그대로 진행"으로 답함, 2026-10-23), FE-01 배정, 0.2.0 브랜치 PR 머지(FE가 계약 파일을 받으려면 필요), ADR(동기 Session, 패키지 매니저). FE와의 질의응답은 `docs/communication/request-from-*.md`.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| `$env:REQUIRE_DB="1"; python -m pytest -q` | backend/ (.venv) | Python 3.12.10, FastAPI 0.161.1, SQLAlchemy 2.1.6, PostgreSQL 16(WSL Docker) | 0 | 149 passed (마지막 전체 실행 기준) |
| `python -m ruff check .` | backend/ | ruff 0.17.2 | 0 | All checks passed |
| `python -m simulation_platform.api.export_openapi` → `contracts/openapi.json` 비교·해시 | backend/ | — | 0 | sha256 da543711… 일치 |
| `python scripts/generate_contract_examples.py ../contracts/examples/first-scope` | backend/ | test DB | 0 | 22 examples |
| `python tools/check_workspace.py` | 루트 | Python 3.12.10 | 0 | PASS(승인 해시 검증 포함, 문서·구조만) |

검증한 동작: DB 제약(복합 FK·상태 전이 7종 불법 경로·초안 외 동결·정책 동결·열린/승인 유일성·설비 정책 필수·타 자산/ACCESS 포트 거부), API(기본값 unknown, 용량 검증 16종, 포트 병합, 권한(viewer 403·editor의 승인 403·비멤버 404), 제출→반려→재수정→승인, 승인본 불변 409, 새 초안 값 복사·superseded 전환, If-Match 428/412, 승인 직전 수정 방지, 동시 PATCH/승인 경쟁 3종, cursor, 프로젝트 격리, 감사 로그).

## 미실행 테스트와 이유
- RLS 정책: 미구현(앱/migration DB 계정 분리 선행).
- (해소) 개발 DB의 migration 적용·시드 실행은 승인 후 수행했다(`alembic upgrade head` 종료 코드 0, `seed_dev_data.py --yes` 종료 코드 0). 이 DB를 대상으로 한 서버 기동·API 호출 검증은 하지 않았다(API 테스트는 테스트 DB 기준).
- 새 venv에서의 lock 재설치 검증: 이번 단위에서 의존성 변경이 없어 미실행.
- FE 연동·generated client 생성: FE 담당, 미실행. 부하·성능: 미실행.

## 남은 위험·질문
- 승인 기록의 시각·검토자: 단일 사용자 위임 승인이며 별도 검토자 없음(BE-02는 REVIEW).
- 새 버전 승인 시 이전 승인본을 `superseded`로 내리는 것은 이미 이 승인본을 시나리오가 참조하는 상황(아직 시나리오 없음)에서 후속 CR로 재검토가 필요할 수 있음(시나리오가 revision을 핀하므로 superseded도 읽기 가능해야 함 — 현재 조회 가능).
- 용량 UI는 포트별 구조라 FE 작업량이 0.1.0 화면 가정보다 크다(안내서 §2 #1–#5).

## 다음 세션의 첫 작업
- 작업 전 `request-from-frontend.md`(FE worktree)를 읽고 답한다. FE의 BE-REQ 답변(`BE-REQ-001~011`)을 확인한다.
- BE-03 제안(제품·재료, `CR-backend-20261023-be03-products-materials`)의 승인·FE 의견(BE-REQ-010·011) 확인 후 구현. 그 밖에 group·alias CR, RLS·DB 계정 분리 제안(ERD §10).
