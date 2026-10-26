# HANDOFF-backend-20261026-C0-engine
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Backend / BE-C0 / C0-01(compiler skeleton)·C0-02(단일 설비 처리)·C0-03(보빈 분할 trace)
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-backend-core-be08 / ccf6072 이후 origin/main / 커밋은 `git log`로 확인
- 계약 버전 / OpenAPI hash / 승인 scope: **변경 없음**(0.6.0, `509a71f1…38ef`). API·DB schema를 바꾸지 않았다(migration 없음, head 0006).
- 승인 근거: 사용자가 이월 필드 대신 "표준화된 기능에 먼저 집중"을 지시했다(2026-10-26: "특정 공정 프로세스의 정보나 설비의 정보는 그때그때 사용자 입력으로 달라지는 부분이라 표준화된 기능에 먼저 집중"). 로드맵상 A 다음 병행 단계인 C0(엔진 골격)을 Backend가 첫 표준 기능으로 선택했다(내부 라이브러리, 계약 변경 없음). **SimPy 의존성 추가와 엔진 경계는 ADR-0002(제안)로 기록했고 조정자 검토 전에는 PROPOSED다.**
- 수정 파일: backend/{pyproject.toml, requirements.lock(`simpy==4.1.2` 한 줄), src/simulation_platform/simulation/**(신규), tests/simulation/**(신규), tests/integration/{test_api_process.py(연결 테스트 1건), test_engine_real_catalog.py(신규)}, README}, docs/{decisions/ADR-0002-simpy-engine-boundary.md, planning/STATUS.md, agents/TASK_BOARD.md, communication/request-from-backend.md, handoffs/HANDOFF-backend-20261026-C0-engine.md}
- 실제 구현 내용(엔진 `c0.1`, HTTP·ORM 비의존):
  - **compiler**(`simulation/compiler`): 계약 0.6.0 응답 모양의 `ProcessSnapshot` → `RuntimeModel`. schema_version·버전 상태(기본은 승인본만) 확인 → 도메인 실행 검증(`run_template`) 오류 반영 → 단일 선형 경로 해석 → handler 선택·단계 모델 구성 → 시나리오 가정 요구 확인. 오류는 모아서 한 번에 보고한다. 엔진이 지원하지 않는 구조·값(병렬 스트림, 합류·분기·공급 간선, 준비 시점, 공급 대기, 설비 동시 확보, 유한 작업자, 미지원 할당 규칙)은 이유와 함께 막는다.
  - **handlers**(`simulation/handlers`): 명시 registry와 순수 계획 함수 4종 — `pass_through_length`·`split_length`·`inspection`·`transport_manual`. 등록은 됐지만 엔진에 없는 `output_units_by_time`·`configured_yield`·`supply_delay`는 `ENGINE_HANDLER_NOT_AVAILABLE`.
  - **resources**: 전역 FIFO 설비 allocator(같은 asset_id는 하나의 자원, 후보는 snapshot 순서가 동순위 처리 순서).
  - **runtime**: SimPy 실행. 시각은 Fraction(분). 이벤트(MATERIAL_ARRIVED·INPUT_RESERVED/CONSUMED·SETUP·PROCESS_STARTED·OUTPUT_UNIT_READY·PROCESS_FINISHED·BUFFER_ENTERED/LEFT·MILESTONE_REACHED·SINK_REACHED·ASSET_STATE_CHANGED·RUN_TERMINATED). 보빈별 인계/일괄 인계 구분, 분할 계보(parent/child/remaining, 길이 합계 검증), 종료 상태 5종(completed·stalled·horizon_reached·failed·limit_reached).
  - **시나리오 가정**(`ScenarioAssumptions`): 설비 점유 정책(`hold_for_operation`), 저장·대기 공간 무제한 선언, 수동 운반 이동 시간. 용량·점유·운반 시간은 snapshot에 없어 스스로 정하지 않고 시나리오가 명시해야 하며, 사용한 가정과 면제한 검증 항목을 결과에 보고한다.
- **발견한 문제와 조치(테스트가 잡음):** ① 고정 지평선: SimPy `run(until=숫자)`는 float로 바꿔 정확히 H 시각의 이벤트가 처리된다(실측) → 정확한 분수 시각의 URGENT 종료 이벤트를 직접 예약하고 `[0,H)` 경계 테스트로 고정(ADR-0002 3-1). ② 지평선에서 끊긴 진행 중 작업이 WIP로 세지 않아 `completed`로 오판 → 진행 중 작업 수를 WIP에 포함. ③ SimPy가 실패 예외를 `type(exc)(*exc.args)`로 재생성해 `RunFailure`가 깨짐 → args 보존.
- DB migration head / 적용 DB / 데이터 변환: **0006**(변경 없음) / 해당 없음 / 변환 없음.
- 추가·변경 API / 예제 / 재생성 필요 여부: 없음. FE 조치 없음.
- 채택 결정과 근거: ADR-0002(제안). 핵심: SimPy 4.1.2 exact 고정, 엔진은 HTTP·ORM 비의존, Fraction 시간, `[0,H)`, 순수 handler, 미정은 컴파일 오류 또는 명시 가정.
- **실제 기준정보(DEMO-WIRE) 공정은 아직 컴파일되지 않는다**(의도한 결과, `test_engine_real_catalog.py`가 기록): 6건 모두 입력 소비 시점·확보 범위(`VAL-INPUT-001`)가 미정이다. P01~P03은 완제품 시점·검사 자원·인계 방식 미정, P04는 분기·공급 간선과 미구현 handler, P05·P06은 선형이지만 운반 이동 시간·후보 호기 자격(`VAL-RES-004`)이 미정이다. 시나리오가 용량·점유·운반 시간을 명시하면 해당 오류만 사라지고 도메인 입력이 남는다.
- 미정 또는 임시 가정: 위 미정 값(도메인 입력), 설비 점유 정책의 실제 값, 저장·대기 공간 용량(자산 버전 데이터와의 연결은 C0-05), 잔량 정책(C0-06), 합류·공급 처리(C0-07), 이월 필드(`input_match_policy` 등, 값 구조 미정의).
- 상대 담당자에게 필요한 조치: **조정자/사용자** — ADR-0002 검토(SimPy 의존성·경계), 다음 단계(C0-04 공유 자원 mini fixture, C0-05 IN/OUT blocking, C0-06 잔량, C0-07 AL 합류) 순서 지시. **FE** — 없음.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체, 마지막) | backend/ (.venv) | Python 3.12, SimPy 4.1.2, PostgreSQL 16(WSL Docker) | 0 | **478 passed**, 경고 3건(starlette 테스트클라이언트·pydantic alias, 기능 영향 없음) |
| `python -m pytest -q tests/simulation` | backend/ | 위와 같음(DB 불필요) | 0 | 58 passed(컴파일러 26 + 실행 32) |
| `python -m ruff check .` | backend/ | ruff | 0 | All checks passed |
| `python -m pip install "simpy>=4,<5"` → `import simpy` | backend/ (.venv) | — | 0 | 4.1.2, 의존 패키지 없음 |
| `python tools/check_workspace.py` | 루트 | Python | 0 | PASS(문서·구조만, 엔진/API/DB 검증 아님) |

신규 테스트: 컴파일러 26건(정상 컴파일·정확한 Fraction·가정 보고·미정/미지원 차단·경로·운반 가정·면제 보고), 실행 32건(단일 설비 100/3·200/3분 보빈별 이벤트·이벤트 순서·보빈별/일괄 인계·준비 시간·분할 계보 길이 합계·pass_through 상태 전이·검사 동시성·수동 운반·설비 경쟁·후보 병렬·공유 설비·`[0,H)` 경계·정체·실패·한도·입력 검증·재현성·HTTP/ORM 비의존), 연결 11건(API 응답 → snapshot → 컴파일·실행 1건, 실제 기준정보 공정 차단 사유 10건).

## 미실행 테스트와 이유
- 실제 기준정보 공정의 실제 실행: 미정 값이 남아 불가(위). 합류·분기·공급(C0-07), 잔량(C0-06), IN/OUT blocking(C0-05), 병렬 스트림 산출, 네트워크 운반, 지표, 시나리오·job queue·worker(C 단계): 미구현·미실행.
- 대규모 작업물·성능·worker crash: 미실행. RLS: 미구현.
