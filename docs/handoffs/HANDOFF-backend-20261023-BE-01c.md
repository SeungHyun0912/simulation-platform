# HANDOFF-backend-20261023-BE-01c
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Backend / BE-01c / A 단계 첫 PR 범위(ERD §16)
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-backend-core / bd60086(origin/main 5125f7c 이후) / 커밋 후 `git log`로 확인
- 계약 버전 / OpenAPI hash / 승인 scope: contract_version null(contract-status.json은 여전히 PENDING_REVIEW).
  사용자가 2026-10-23 CR-backend-20261023-be01c-first-scope-api를 "전부 승인"했으나 contracts/04·contract-status 반영은 조정자 몫(미수행).
  OpenAPI 후보 sha256 = 6bbad0dd3307b54597fba19562eb8e9104f3c6f5498261e756f94a4a4077b66e (backend/artifacts/openapi.candidate.json, Git 제외·재생성 가능)
- 수정 파일: backend/{pyproject.toml, requirements.lock, README.md}, backend/src/simulation_platform/{db.py, auth/principal.py, domain/{errors,pagination}.py, schemas/*, repositories/*, services/*, api/{app,deps,errors,export_openapi}.py, api/v1/{me,projects,assets,common}.py}, backend/tests/{unit,contract,integration}/*, docs/change-requests/CR-backend-20261023-be01c-first-scope-api.md(§4-1 추가), 이 문서
- 실제 구현 내용: 승인 CR의 11개 endpoint(`/api/v1`): GET /health, GET /me, 프로젝트 GET·POST /projects, GET·PATCH /projects/{p}, 자산 GET·POST /projects/{p}/assets, GET·PATCH .../assets/{id}, GET .../assets/{id}/ports.
  자산 생성은 asset+상세+포트(설비 IN/OUT, 공간 ACCESS-01)를 한 트랜잭션으로 저장. PATCH는 FOR UPDATE + row_version 비교(ETag/If-Match, 412/428). 모든 프로젝트 범위 쿼리에 project_id 조건, 비멤버/미존재 동일 404. keyset cursor 목록. 감사 로그 기록. local 전용 인증(`X-Debug-User`, production 거부).
- DB migration head / 적용 DB / 데이터 변환: head 0001(변경 없음) / simulation_platform_test만 / 변환 없음. 개발 DB simulation_platform에는 미적용.
- 추가·변경 API / 예제 / 재생성 필요 여부: 위 API 신규. FE는 contracts 반영 후 generated client 생성 필요. 응답 예(자산 생성 201, ETag "1"):
  `{"data":{"id":"…","project_id":"…","kind":"equipment","code":"EQ-001","name":"…","sort_order":0,"external_ref":null,"notes":null,"archived_at":null,"equipment":{"equipment_type":"extruder","model_name":null},"space":null,"ports":[{"id":"…","port_key":"IN","role":"IN","label":"IN"},{"id":"…","port_key":"OUT","role":"OUT","label":"OUT"}],"created_at":"…Z","updated_at":null,"row_version":1}}`
  오류 예: `{"error":{"code":"EDIT_CONFLICT","message":"…","request_id":"req-…","details":[{"message":"현재 버전은 2입니다.","severity":"error","field_path":"/row_version"}]}}`
- 채택 결정과 근거: CR §4-1(동기 Session 채택은 ADR 후보, 프로젝트 PATCH는 admin만, 단일 필드 sort 등).
- 미정 또는 임시 가정: 역할 권한 매트릭스·TECH-006, 운영 인증 adapter(TECH-002)는 여전히 미결(local 전용 구현).
- 상대 담당자에게 필요한 조치: 조정자 — contracts/04 반영과 contract-status 승인 기록, ADR(동기 Session), 개발 DB에 0001 적용 승인. FE — 승인된 계약 hash로 client 생성 후 FE-01.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| `$env:REQUIRE_DB="1"; python -m pytest -q` | backend/ (.venv) | Python 3.12.10, FastAPI 0.161.1, SQLAlchemy 2.1.6, PostgreSQL 16(WSL Docker) | 0 | 61 passed (단위 9·계약 5·통합 47) |
| `python -m ruff check .` | backend/ | ruff 0.17.2 | 0 | All checks passed |
| `python -m simulation_platform.api.export_openapi` | backend/ | 〃 | 0 | sha256 6bbad0dd… |
| 새 venv: `pip install -r requirements.lock` → `-e . --no-deps` → `pytest tests/unit tests/contract` | backend/ | Python 3.12.10 | 0/0/0 | 14 passed (통합은 이 환경에서 미실행) |
| 실제 uvicorn(포트 8765, test DB, AUTH_MODE=local) 스모크 | backend/ | uvicorn 0.54.0 | 0 | /health 200, 인증 없는 /me 401, 시드 사용자 /me 200 |
| 변이 점검: get_asset의 project_id 조건 제거 | backend/ | — | 1(의도) | `test_asset_is_invisible_through_another_project` 실패 확인 후 원복 |

검증한 동작: 원자 생성(설비 IN/OUT·공간 ACCESS-01), 요청 검증 422(kind/상세 불일치·ports 전송·빈 코드 등), 코드 중복 409(프로젝트별), 역할(viewer 403·비멤버 404·미인증 401), 타 프로젝트 경유 접근 404, ETag/If-Match(428/412), 동시 PATCH 4건 중 1건만 성공, cursor 순회·정렬·필터·재사용 거부, include_archived, 감사 로그 기록.

## 미실행 테스트와 이유
- RLS 정책: 미구현(앱/migration DB 계정 분리 선행).
- 운영 인증(OIDC/사내 SSO): adapter 미결.
- 대량 데이터·성능·부하: 미실행.
- 프로젝트 archive/members/clone, asset archive, revision·용량: CR 범위 밖(미구현).
- 새 venv에서의 통합 테스트: 미실행(메인 .venv에서만 실행).
- 브라우저/FE 연동: 미실행(FE 담당, 계약 미반영).

## 남은 위험·질문
- 계약 문서(contracts/04)와 구현이 아직 분리되어 있다: 승인 CR이 정본이고 contract-status는 PENDING.
- 프로젝트 생성자가 조직 admin이 아닌 경로가 없어 project_member만 있는 사용자의 "나가기" 등은 후속.
- `X-Debug-User`는 운영 인증 도입 전 개발용이다. 운영 배포에 AUTH_MODE=local을 켜면 기동 자체가 거부된다.
- TestClient가 `httpx` 폐기 경고(StarletteDeprecationWarning)를 출력함: 기능 영향 없음, 후속에 httpx2 전환 검토.

## 다음 세션의 첫 작업
- 조정자 반영 후: contracts/04에 CR 반영, openapi.candidate diff 검토 → contracts/openapi.json 승인 스냅샷.
- Backend 후속: asset_revision/port_policy/group 묶음 설계(CR 선행), RLS+DB 계정 분리 제안.
