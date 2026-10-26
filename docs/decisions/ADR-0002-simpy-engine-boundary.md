# ADR-0002: SimPy 엔진 의존성과 엔진 패키지 경계
- 상태: **제안(Backend 작성)** — 사용자의 "표준화된 기능에 먼저 집중해 달라"(2026-10-26) 지시에 따라 C0 첫 구현에 적용했다. 조정자가 검토·승인 전까지 PROPOSED 항목(07 엔진 문서)의 승인 상태를 승격하지 않는다.
- 기준일: 2026-10-26
- 근거: `docs/05_backend_python.md`(SimPy 4.x, exact 버전 잠금, simulation은 FastAPI·ORM·LLM에 의존하지 않음), `docs/07_simulation_engine.md`(compiler → RuntimeModel, handler registry, `[0,H)`), 로드맵 C0-01~03, ADR-005·010·011·014·015·016·017.

## 결정
1. **SimPy 4.1.2를 정확히 고정한다.** `pyproject.toml`에는 `simpy>=4,<5`, `requirements.lock`에는 `simpy==4.1.2`(의존 패키지 없음, 설치 후 `import simpy`로 4.1.2 확인). "최신"을 추측하지 않고 검증한 버전만 잠근다(TECH-004). 업그레이드는 새 ADR과 재현성 테스트(같은 입력 → 같은 이벤트) 통과 뒤에 한다.
2. **엔진 패키지 경계:** `backend/src/simulation_platform/simulation/`는 FastAPI·starlette·SQLAlchemy·psycopg를 import하지 않는다(테스트가 새 인터프리터로 검사). 입력은 계약 0.6.0의 버전·그래프 응답과 같은 모양의 JSON dict(`ProcessSnapshot`)뿐이며 실행 중 DB의 현재 상태를 읽지 않는다. 실행 snapshot 저장·job queue·worker(C-07~C-10)는 이 경계 밖의 별도 단계다. 재사용하는 `domain/process.py`는 HTTP·ORM 비의존인 순수 규칙이다.
3. **시간은 Fraction(분), 숫자 입력은 decimal 문자열/정수만.** 1,000m ÷ 30m/min = 100/3분처럼 정확한 값으로 동순위 이벤트 순서가 float 오차로 흔들리지 않게 한다. float·bool 입력은 거부한다. 표시용 decimal 문자열은 이벤트 직렬화 경계에서만 만든다.
3-1. **고정 지평선은 `[0,H)`이며 SimPy `run(until=숫자)`를 쓰지 않는다.** SimPy는 숫자 `until`을 float로 바꿔 정확히 H 시각의 이벤트가 처리되고 종료 후 `now`도 float가 된다(실측: H=200/3에서 200/3 이벤트가 처리됨). 정확한 분수 시각의 URGENT 종료 이벤트를 직접 예약하고, 경계 테스트로 고정한다. 이 구현은 SimPy 4.1.2의 `Event._ok/_value` 내부 속성에 의존하므로 버전 잠금이 전제다.
4. **handler는 순수 계획 함수 + 명시 registry(ADR-011).** `plan(step, item)`이 준비 시간·산출 단위별 준비 시각·잔량을 계산하고, SimPy 실행(자원 확보·시간 경과·이벤트)은 runtime이 맡는다. 이름·버전으로만 선택하며 `eval`·코드 문자열·LLM 생성 코드는 실행하지 않는다. 이번 구현: `pass_through_length`·`split_length`·`inspection`·`transport_manual`. 나머지 등록 handler(`output_units_by_time`·`configured_yield`·`supply_delay`)는 컴파일이 `ENGINE_HANDLER_NOT_AVAILABLE`로 막는다.
5. **미정은 스스로 채우지 않는다(ADR-017).** 컴파일은 도메인 실행 검증(`run_template`) 오류를 그대로 막고, 엔진이 지원하지 않는 구조·값(병렬 스트림, 합류·분기·공급 간선, 준비 시점, 공급 대기, 설비 동시 확보 등)은 이유와 함께 컴파일 오류로 막는다. 오류는 첫 번째에서 멈추지 않고 모아 보고한다.
6. **시나리오 가정은 명시 객체로만 해소하고 결과에 보고한다.** `ScenarioAssumptions`: 설비 점유 정책(`hold_for_operation`만 지원), 저장·대기 공간 용량 제한 없음 선언, 수동 운반 이동 시간(0분도 명시해야 허용). 사용한 가정은 `RuntimeModel.assumptions`와 `RunResult.assumptions`에 남고, 가정으로 면제한 실행 검증 항목은 `CompileResult.waived`로 숨기지 않는다. master 공정은 바뀌지 않는다.
7. **종료 상태를 구분한다:** `completed`, `stalled`(이벤트가 없는데 WIP 잔존, 즉시 교착 단정 없음), `horizon_reached`(관측 중단, censored), `failed`(입력이 단계에 맞지 않음·잔량 정책 미구현 등, 이유 코드 보존), `limit_reached`(이벤트 한도). 진행 중인 작업도 WIP로 센다(지평선에서 끊긴 작업을 완료로 오인하지 않기 위해).
8. **재현성:** 같은 모델·도착·seed면 같은 이벤트(안정된 작업물 key, 후보 설비는 snapshot 순서가 동순위 처리 순서, 전역 random 미사용, 확률 요소가 생기면 이름별 독립 stream). 엔진 버전 `c0.1`을 결과에 남긴다.

## 이번에 하지 않는 것
합류·분기·공급 간선(C0-07), 잔량 이월·폐기(C0-06), IN/OUT 용량·blocking(C0-05), 여러 설비 동시 확보·예약 allocator, 병렬 스트림 산출, 네트워크 운반, 지표 엔진, 시나리오·job queue·worker. 값 구조가 도메인 문서에 없는 `input_match_policy`·`condition_rule`·`execution_rule`·`parameter_override`도 구현하지 않는다.

## 결과
- 엔진 입력 모양이 계약 응답과 같아 실행 snapshot 생성(C-07)은 이 모양을 불변 저장하는 일이 된다.
- 실제 기준정보 공정 6건은 아직 미정(입력 소비 시점·운반 시간·후보 호기 자격 등)이 남아 컴파일되지 않는다. 그 사실을 `tests/integration/test_engine_real_catalog.py`가 기록하며 미정이 확정되면 기대값이 줄어든다.
- SimPy 내부 속성 의존(3-1)은 버전 업그레이드 때 재검증이 필요하다.
