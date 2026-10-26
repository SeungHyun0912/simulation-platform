# HANDOFF-backend-20261026-BE-WIRE-SEED
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Backend(+단일 DB 담당) / BE-WIRE-SEED / 실제 기준정보 시드(`docs/domain/08_catalog_processes.md` §9)
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-backend-core-be06 / ccf6072(origin/main) / 후속 커밋은 `git log`로 확인
- 계약 버전 / OpenAPI hash / 승인 scope: **변경 없음**(0.5.0, `62e3529c…f02d`). 시드 스크립트·테스트·문서만 추가했고 API·DB schema는 바꾸지 않았다.
- 요청 배경: 사용자가 "기본적으로 정리된 공정 프로세스 4가지가 DB에 모두 생성되어 있는지 확인"을 요청했다. 문서는 제품 6종(P01~P06)이지만 P01~P03이 공통 경로 하나를 쓰므로 **서로 다른 공정 흐름은 정확히 4가지**(실리콘 공통, P04 AL, P05 CU 세선, P06 CU 태선)이며 이 해석으로 진행했다(사용자가 확인이 필요한 사항은 그대로 진행하라고 했다).
- **확인 결과(생성 전, 개발 DB `simulation_platform`):** 실제 기준정보는 **없었다.** 있던 것은 `[시험]` 표시의 시험 데이터뿐(DEMO-A 설비 26·저장 25·도킹 10, 제품 P-001~008, 시험용 공정 6건). 문서가 정한 설비 96대·공간 22곳·제품 P01~P06·공정 6건은 하나도 없었다.
- 수정 파일: backend/{scripts/seed_wire_factory.py(신규), tests/integration/test_seed_wire_factory.py(신규), README}, docs/{communication/request-from-backend.md, handoffs/HANDOFF-backend-20261026-BE-WIRE-SEED.md}
- 실제 구현 내용(`seed_wire_factory.py`, 실제 API(서비스 계층)로 생성, 멱등, 운영 거부):
  - 프로젝트 `DEMO-WIRE`(`b16c84ae-4033-5315-bd1d-a562b2e9e180`, dev-org, 개발용 admin·editor·viewer). 프로젝트·제품 코드는 문서가 밝힌 개발 인계용 제안이다.
  - 자산 118건: 설비 `EQ-001~096`(96, 문서 §2의 이름·분류, 포트 IN/OUT 192), 공간 `ST-001~022`(저장·대기 20 + AMR 도킹 `ST-021`·`ST-022` 2, ACCESS 22) → 포트 214.
  - 제품 P01~P06, 공정 버전 6건(**모두 draft**): 실리콘 공통(P01~P03, 직선 10노드·9간선), P04(AL: 싱글-1 `direct_feed` + 싱글-12 `supply` 간선 분기, 23노드), P05(CU 세선, 28노드), P06(CU 태선, 테이핑 없음, 22노드). P04~P06에는 운반 단계(`transport_manual`: 지게차·AMR)와 완제품 milestone이 있다.
  - 문서 값 반영: 속도·준비·산출·분할 단위·잔량 이월(P01)·싱글-12 120분 대기·`abstract_yield`(싱글 메인 10개)·검사 작업자 무제한(P04~P06만)·정정 사항(P05 연선 1:1, 절연에서 24,000×4 분할, P06 설비 EQ-034~035·테이핑 없음 등).
  - **미정은 unknown으로 둠**(준비·교체 시간, 보빈 인계 시점, 운반 시간·자원, 입력 소비 시점, 용량·좌표). 후보 설비는 한 대로 지정된 경우만 `confirmed`, 여러 호기는 `unknown`. P05 출발 공간 ST-005는 "대응 제안"이라 위치를 비웠다.
  - 계약 0.5.0에 필드가 없는 값(단계별 투입 수량·폐기량·12가닥 공급 등)은 각 버전의 `notes`에 문서 근거와 함께 적었다 → **BE-04c(`step_material_spec`)에서 필드로 옮길 대상.**
- DB migration head / 적용 DB / 데이터 변환: **0005**(변경 없음) / 개발 DB `simulation_platform`에 시드 실행 2회(1회 `assets created 118, processes created P01~P06`, 2회 `created 0 / []`) / 변환 없음.
- 추가·변경 API / 예제 / 재생성 필요 여부: 없음.
- 미정 또는 임시 가정: 위 "unknown으로 둠" 목록, GRP-001 연계 그룹(그룹은 계약에 없어 EQ-094~096 notes에만 표기), 이름이 같은 설비(호기명은 문서에 없어 만들지 않음), `DEMO-WIRE` 코드의 승인.
- 상대 담당자에게 필요한 조치: **FE** — BE-REQ-019(`request-from-backend.md`: DEMO-WIRE 자산 118·제품 6이 화면에서 보이는지, 공정 화면 연동 일정). **사용자** — 이 4가지 해석 확인.

## FE에서 보이는 범위 (사용자 질문)
| 데이터 | API(개발 서버 8000) | FE 화면 |
|---|---|---|
| 프로젝트 `DEMO-WIRE` | `/me`의 프로젝트에 admin으로 포함 | 프로젝트 전환 메뉴에서 선택(FE는 `/me` 사용) |
| 자산 118건 | 3페이지(limit 50), kind 필터(dock 2) | **자산 목록·상세는 API 연결됨**(FE-01c) → 보임 |
| 제품 6종 | 최신 공정 버전 draft 요약 포함 | **제품 목록·상세는 API 연결됨**(FE-01e) → 보임 |
| 공정 4가지(버전 6건) | 버전·그래프·검증 조회 가능 | **공정 편집 화면은 아직 샘플 데이터**(`sampleProcesses.ts`) → 화면에는 안 보임, FE 공정 연동 후 보임 |

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ (.venv) | Python 3.12, PostgreSQL 16(WSL Docker) | 0 | **354 passed**, 경고 2건(starlette 테스트클라이언트·pydantic alias, 기능 영향 없음) |
| `python -m pytest -q tests/integration/test_seed_wire_factory.py` | backend/ | 위와 같음 | 0 | 13 passed(문서 §2·§3 표 파싱 대조 포함) |
| `python -m ruff check .` | backend/ | ruff | 0 | All checks passed |
| `python scripts/seed_wire_factory.py --yes` ×2 (개발 DB) | backend/ | — | 0 | 1회 생성(118/6), 2회 0 |
| 개발 서버 HTTP 조회(`/me`, `/assets`, `/products`, `/process-versions/{id}/graph`) | — | local 인증, admin | — | 자산 118건(3페이지; 설비 96·저장 20·도킹 2), 제품 6, 그래프 노드 10/10/10/23/28/22 |
| `python tools/check_workspace.py` | 루트 | Python | 0 | PASS(문서·구조만, API/DB/SimPy 검증 아님) |

신규 테스트 13건: 문서 표 대조(설비 96·이름·분류, 공간 22·kind), 포트 214·미정 값 미생성, 페이징 118, 제품 6·공정 6 draft, 실리콘 3종 값·잔량, P04 직결·공급·대기·`abstract_yield`, P05 정정 사항, P06 테이핑 없음·EQ-034~035, 후보 `confirmed`/`unknown` 규칙, 구조 오류 0·run_template 미정 잔존, 비구성원 404, 멱등, CLI 거부.

## 미실행 테스트와 이유
- 공정 실행(SimPy) 가능 여부: 엔진 미구현, 미실행. run_template 검증은 미정이 남아 오류가 나는 것이 정상이다(숨기지 않음).
- FE 화면 확인: FE 담당(BE-REQ-019), 미실행. RLS·부하: 미실행.
