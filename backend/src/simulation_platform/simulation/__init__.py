"""SimPy 실행 엔진(기준: docs/07_simulation_engine.md, ADR-0002).

책임 분리: DB가 입력 snapshot을 보관하고, compiler가 검증·참조 해석·handler 선택을 하며,
SimPy는 가상 시간의 자원·이벤트만 처리한다. 이 패키지는 FastAPI 요청·ORM 세션·LLM SDK에 의존하지 않고
입력으로 받은 snapshot(JSON 모양의 dict)만 읽는다. 실행 중 DB의 현재 상태를 조회하지 않는다.
"""

ENGINE_VERSION = "c0.1"
SUPPORTED_SCHEMA_VERSIONS = frozenset({"1.0"})
