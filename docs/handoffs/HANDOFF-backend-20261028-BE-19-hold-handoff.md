# HANDOFF-backend-20261028-BE-19-hold-handoff
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-19**(임시 ID, 직접 인계는 앞 설비가 산출을 쥐고 기다림). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be32 / main `beb4c3f`(0.16.0, PR #62 머지) / 구현 `e54c6fa`
- 승인 근거: 사용자 확정(2026-10-28) "모든 설비에 Input / Output 위치를 1개씩 둔 이유는 이동 경로를 파악하고 소요 시간을 파악하기 위함이지 Buffer와 같은 역할이라고 보기는 어려울 것 같아", 싱글 메인이 도는 동안 다음 회차 12개가 싱글-12에 준비된 채 기다리는 안에 "1번이 맞다".
- 계약 버전: **0.16.0 → 0.16.1**(동작 패치, OpenAPI 해시 불변 `13fa2fb9…42ad`), 엔진 버전 **c0.2 → c0.3**, migration head 0010.

## 구현
| 항목 | 이전(c0.2) | 지금(c0.3) |
|---|---|---|
| 직접 인계(대기 공간 없이 다음 설비로) | 다음 설비 앞에 별도 자리(입력 확보 수 × 후보 설비 대수, 싱글 메인은 1 + 12) | 별도 자리 없음. 앞 설비가 산출을 쥔 채(BLOCKED) 다음 설비(또는 운반 자원)가 가져갈 때까지 기다림 |
| 싱글 메인이 도는 동안 공정 안 보빈 | 최대 36개(메인 12 + 앞자리 12 + 싱글-12 12) | 최대 24개(메인 12 + 싱글-12에 준비된 12) |
| 막힘 이벤트 | 앞자리가 찼을 때 | 다음 설비가 바로 가져가지 못할 때만(같은 시각에 가져가면 없음) |

- 여러 입력을 한 번에 받는 설비는 입력이 모두 준비되면 함께 가져간다. 같은 설비를 다시 쓰는 인계(재방문)와 설비가 없는 다음 단계는 쥐지 않는다(교착 방지, 기존과 같음).
- **함께 고친 결함:** 작업 id가 공정마다 따로 매겨져(P02·P03 모두 `tape#16`) 쥐고 있는 산출과 설비 안 재료 기록이 섞일 수 있었다. 공정 버전과 함께 key로 쓴다. 쥐는 방식에서는 이 결함이 교착(WIP_REMAINING)으로 드러나 실제 3공정 시험에서 발견했다. 기존 일 상태 요약의 `in_machine`도 이 결함으로 적게 셀 수 있었다.
- 입력 부족 판정: 산출을 넘기고 가져가기만 기다리는 작업은 진행 중으로 보지 않는다(그 산출은 입력 대기열에 있다).

## 실제 6공정 재실행(개발 DB `DEMO-WIRE-RUN`, run `aa1a48b2-6708-4244-a532-ae6a7636de77`, 엔진 c0.3)
- stalled(INSUFFICIENT_INPUT), 가상 96.6일, 이벤트 175,332건. **제품별 완료 수·평균 리드타임·마지막 완료일이 c0.2 run(`c3640d5d…`)과 같다**(P04 1,100개·96.6일 등). 비교 API는 엔진 버전 차이로 `comparable=false`.
- 병목: 1위 P04 AL 더블 집합 출력 막힘 415,585.5작업물·분(c0.2 408,304.5), 근본 원인 싱글 메인 집합 EQ-096(98.9%) 그대로. 2위 ST-002, 3위 싱글-12 공급 준비.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check src tests` | backend/ | 0 | All checks passed |
| `python -m pytest -q tests/simulation tests/unit` | backend/ | 0 | 237 passed(앞자리 시험을 쥐는 방식으로 고침, 같은 단계 key 두 공정 회귀 시험 추가) |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/simulation tests/unit tests/integration/test_engine_real_catalog.py` | backend/ | 0 | 250 passed(고치기 전 실제 3공정 시험 1건이 교착으로 실패 → 원인 수정) |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **721 passed**, 경고 2건(테스트 클라이언트·pydantic, 기능 영향 없음), 944초 |
| `python -m pytest -q tests/contract`(계약 0.16.1 갱신 뒤) | backend/ | 0 | **80 passed** |
| `python scripts/demo_capacity_carriers.py --yes`(개발 DB, API·worker 재시작) | backend/ | 0 | 위 재실행 결과 |
| `python scripts/generate_contract_examples.py ../contracts/examples/first-scope` | backend/ | 0 | 예제 1개 갱신(engine_version c0.3) |

## 남은 결정·후보
- 준비 대기로 설비를 쥐는 단계(싱글-12 공급 준비, 가동률 0.0%로 보임)의 가동률 표시 방식(미답).
