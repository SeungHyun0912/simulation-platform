# HANDOFF-backend-20261028-BE-17-front-slots
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-17**(임시 ID, 단계 사이 직접 인계의 설비 앞 자리). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be30 / `3639f01`(PR #60 브랜치 be29 위, PR #60 머지 대기) / 구현 `77f8fb5`
- 승인 근거: 사용자 규칙(2026-10-28) "설비 앞 단계 산출은 기본적으로 1개 — ① 설비 사이에 대기 공간이 있으면 그 공간에서 대기 ② 여러 Input을 처리해도 이전 대기 공간이 있으면 한번에 처리할 Input이 쌓일 때까지 대기 후 가동 ③ 앞쪽 대기 공간이 없고 여러 Input을 처리하면(예: 싱글-12) 하나씩 미리 넣어두는 것도 가능".
- 계약 버전: **0.15.1 → 0.15.2**(동작 패치, OpenAPI 해시 불변 `f4df60cd…859a`), 엔진 버전 **c0.1 → c0.2**, migration head 0010.

## 구현
| 규칙 | 엔진 |
|---|---|
| ① 사이에 대기 공간이 있으면 그 공간에서 대기 | 기존 그대로(공간 노드) |
| ② 여러 입력을 한 번에 처리하면 앞 공간에서 다 쌓인 뒤 가동 | 기존 그대로(입력 묶음을 다 확보해야 작업 시작) — 확인 |
| 기본 1개 + ③ 앞 공간이 없고 여러 입력이면 미리 넣어 두기 | 직접 인계의 **설비 앞 자리 = 그 입력의 확보 수 × 다음 단계 후보 설비 대수**. 자리가 차면 앞 설비가 산출을 쥐고 기다린다(`OUT_BLOCKED`). 자리는 설비·입력별(예: 싱글 메인의 선행 가공 1자리와 공급 12자리), 같은 설비·입력을 쓰는 제품은 함께 쓴다 |
| (예외) 같은 설비를 다시 쓰는 직접 인계 | 설비가 자기 산출을 자기 앞에 둔 채 막혀 교착이 되므로 제한하지 않는다(실제 6공정에는 없음) |

- 직접 인계는 더 이상 미정이 아니라 `unbounded_buffers` 가정이 필요 없다(가정 코드 `UNBOUNDED_HANDOFFS` 삭제).
- **엔진 버전 c0.2:** 결과가 바뀌는 엔진 동작(운반 자원 위치, 원자재 입고 위치 용량, 설비 앞 자리, 출력 대기 기본값)이 쌓였는데 버전이 c0.1 그대로였다. 올려서 이전 run과의 비교가 `comparable=false`로 알린다.

## 실제 6공정 재실행(개발 DB `DEMO-WIRE-RUN`, run `c3640d5d-3f8a-4fba-ac9e-ff0b3f4db686`, 엔진 c0.2)
- 완료 수·마지막 완료일은 이전 run(`f18c3dcb…`, c0.1)과 같다(P04 96.6일이 종료를 결정). 비교 API: `comparable=false`(엔진 버전 다름), 입력 차이 = 엔진 버전·시나리오 버전.
- **병목 모습이 바뀌었다(P04):** 설비 앞 자리가 1개(싱글-1→메인)·12개(싱글-12→메인)로 제한되자 싱글-1·싱글-12가 메인(EQ-096) 앞에서 막히고, ST-019가 용량 120까지 가득 차(이전 최대 61) AL 더블 집합의 출력이 막힌다. 그래서 병목 1위가 `space_full` P04 AL 더블 집합(408,305작업물·분), 2위 ST-002, 3위 P04 싱글-12 공급 준비(`equipment_busy`)로 나온다. **흐름을 제한하는 근본은 여전히 싱글 메인(EQ-096, 가동률 98.9%)** 이며, 막힘이 상류로 번진 결과다.
- 해석 주의: 지금 병목 요약은 "멈춘 곳"을 순위로 보여 주므로, 하류 설비가 느려 생긴 상류의 막힘이 1위가 될 수 있다. "막힘이 어느 하류 설비에서 시작됐는지" 원인 추적을 병목 요약에 더하는 것이 다음 개선 후보다.
- 싱글-12 공급 준비의 설명에 "EQ-095 가동률 0.0%"가 나온다: 이 단계는 처리 없이 준비 대기(2시간)로 설비를 쥐므로 PROCESSING이 0이다(가동률은 처리 시간 기준). 표시 개선 후보.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `python -m pytest -q tests/simulation tests/unit tests/contract` | backend/ | 0 | 309 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_engine_real_catalog.py` | backend/ | 0 | 13 passed(완료 수·기간 단정 그대로) |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **709 passed**, 경고 3건(테스트 클라이언트·pydantic alias, 기능 영향 없음), 439초(계약 기록 0.15.2 갱신 뒤 `tests/contract` 80 passed 재확인) |
| `python scripts/demo_capacity_carriers.py --yes`(개발 DB) | 개발 API·worker(재시작) | 0 | 위 재실행 결과 |
| `python scripts/generate_contract_examples.py ../contracts/examples/first-scope` | backend/ | 0 | 예제 2개 갱신(engine_version c0.2, 가정 필드, 문구) |

## 남은 결정·후보
- 병목 원인 추적(상류 막힘 → 하류 구속 설비) 추가 여부.
- 준비 대기로 설비를 쥐는 단계의 가동률 표시 방식.
