# HANDOFF-backend-20261023-BE-01b
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Backend(+단일 DB 담당) / BE-01b / A 단계 첫 PR 범위(ERD §16)
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-backend-core / 2cf9e7d / 커밋 후 `git log`로 확인
- 계약 버전 / OpenAPI hash / 승인 scope: null / 없음 / 미승인(contract-status PENDING_REVIEW)
- 수정 파일: backend/{pyproject.toml, requirements.lock, alembic.ini, README.md}, backend/migrations/{env.py, script.py.mako, versions/0001_project_asset_port.py}, backend/src/simulation_platform/models/*.py, backend/tests/integration/*, docs/change-requests/CR-backend-20261023-be01-contract-gaps.md(§6 추가)
- 실제 구현 내용: SQLAlchemy 모델과 수동 작성 Alembic 0001. 테이블 organization, app_user, organization_member, project, project_member, audit_log, asset, equipment_detail, space_detail, asset_port. 복합 FK로 project/조직/subtype 일치 강제, 설비 IN/OUT 부분 유일 인덱스, 지연 제약 트리거(설비 IN/OUT, 공간 ACCESS≥1), audit_log append-only 트리거.
- DB migration head / 적용 DB / 데이터 변환: head=0001 / 로컬 compose의 simulation_platform_test만(테스트가 매 세션 downgrade→upgrade). 개발 DB simulation_platform에는 적용하지 않음 / 변환 없음.
- 추가·변경 API / 예제 / 재생성 필요 여부: 없음(스키마만). FE 영향 없음.
- 채택 결정과 근거: CR §6 참조(역할 허용값·조직당 1역할 등 잠정). Alembic autogenerate 미사용, 모델-migration 차이를 테스트로 감시.
- 미정 또는 임시 가정: CR §6.
- 상대 담당자에게 필요한 조치: 조정자는 CR §6 판단, 역할 정책(TECH-006) 결정. 개발 DB에 0001을 적용할지 승인 필요.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| `$env:REQUIRE_DB="1"; python -m pytest -q` | backend/ (.venv) | Python 3.12.10, SQLAlchemy 2.1.6, alembic 1.20.1, psycopg 3.3.6, PostgreSQL 16(WSL Docker) | 0 | 23 passed(단위 5 + 통합 18) |
| `python -m ruff check .` | backend/ | ruff 0.17.2 | 0 | All checks passed |

통합 18건: head=0001·모델 차이 없음, downgrade/upgrade 왕복, 같은 코드 2개 프로젝트 허용·동일 프로젝트 중복 거부, 타 프로젝트 포트/상세 참조 거부, 타 조직 멤버 프로젝트 참여 거부, 설비 IN/OUT 원자성(0·IN만·OUT만 거부, IN 2개 거부, 설비 ACCESS·공간 IN 거부), 공간 ACCESS 필수·복수 허용, 필수 포트 삭제 커밋 거부, subtype/kind 불일치·kind 변경 거부, 잘못된 enum 거부, audit_log UPDATE/DELETE/TRUNCATE 거부.

## 미실행 테스트와 이유
- RLS 정책 테스트: RLS 미구현(앱/migration 계정 분리 필요).
- 새 venv에서 변경된 lock 재설치 검증: 이 단위에서는 미실행(BE-01a에서는 검증).
- 서비스/API 계층 테스트: 미작성(BE-01c).
- 대량 데이터·성능, 동시성(경쟁) 테스트: 미실행.

## 남은 위험·질문
- 계약·ERD 미승인 상태에서 스키마를 확정 구현함. 승인 단계에서 컬럼이 바뀌면 0001을 수정하지 않고 새 migration 필요(아직 공유 DB 적용 전이라 조정자 승인 하에 0001 재작성 가능).
- 테스트는 downgrade를 수행하므로 TEST_DATABASE_URL을 개발 DB로 지정하면 안 됨(이름 `_test` 검사로 방어).

## 다음 세션의 첫 작업
- BE-01c 착수 전 자산 생성 DTO 제안을 CR로 제출 → 승인 후 서비스/API(프로젝트 생성·목록, 자산 생성(포트 원자 생성), 조회, PATCH+If-Match, 포트 조회, 인증 adapter(local)).
