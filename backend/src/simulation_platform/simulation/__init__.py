"""SimPy 실행 엔진(기준: docs/07_simulation_engine.md, ADR-0002).

책임 분리: DB가 입력 snapshot을 보관하고, compiler가 검증·참조 해석·handler 선택을 하며,
SimPy는 가상 시간의 자원·이벤트만 처리한다. 이 패키지는 FastAPI 요청·ORM 세션·LLM SDK에 의존하지 않고
입력으로 받은 snapshot(JSON 모양의 dict)만 읽는다. 실행 중 DB의 현재 상태를 조회하지 않는다.
"""

# 결과가 달라지는 엔진 동작이 바뀌면 올린다(같은 입력의 결과 비교가 버전이 다름을 알리도록).
# c0.2(2026-10-28): 운반 자원 위치·빈 차 이동, 원자재 입고 위치 용량, 단계 사이 직접 인계의 설비 앞 자리, 출력 대기 기본 hold.
ENGINE_VERSION = "c0.2"
SUPPORTED_SCHEMA_VERSIONS = frozenset({"1.0"})
