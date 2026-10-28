# HANDOFF-backend-20261028-BE-16-yard-capacity-seed
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-16**(임시 ID, 출력 대기 기본값·원자재 입고 위치 용량·원본 DEMO-WIRE 반영). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be29 / `fc07858`(origin/main, PR #59 병합 후) / 구현 `c32f8fd`
- 승인 근거(사용자, 2026-10-28): ① PR #59 머지 ② "다음 공간이 가득 차면 설비가 산출을 쥐고 기다림" = 실제와 맞음 ③ 운반 자원은 "먼저 비는 자원을 써 줘"(현재 방식 유지) ④ 남은 항목 "모두 반영해 줘".
- 계약 버전: **0.15.0 → 0.15.1**(동작 패치, OpenAPI 해시 불변 `f4df60cd…859a`), migration head **0010**(변경 없음).

## 반영
| 항목 | 반영 |
|---|---|
| 출력 대기(hold) 사실 확정 | 시나리오 가정 `out_release` 기본값 = hold(설비 점유 `equipment_hold` 기본값과 같은 방식). 보내지 않아도 적용, 가정 코드 `OUT_RELEASE_HOLD`로 보고 |
| 운반 자원 선택 | 먼저 비는 자원, 동시에 비어 있으면 코드 순(변경 없음 — 확인만) |
| 원자재 입고 위치 용량 | source 노드의 저장공간(ST-001·005·017) 용량을 엔진이 적용: 가득 차면 원자재가 자리가 날 때까지 들어오지 못함(`ENTRY_WAITING`, 입고 노드, `item_key` null), 다음 공간으로 옮겨 가거나 단계가 가져가면 비움. 용량 미정이면 제한하지 않음 |
| 원본 `DEMO-WIRE` 반영 | 시드(`seed_wire_factory.py`) 4차: 운반 자원 설비 5대 생성, 공간 22곳 확정 용량 자산 버전 승인(이미 승인 버전이 있으면 건드리지 않음), 운반 단계 후보 = 지게차 3대·AMR 2대(초안 6개 다시 적용). 개발 DB 실행 결과: `assets: created 5, capacities_approved 22`, `reapplied: P01~P06` |
| **단계 사이 직접 인계 용량** | **보류 — 값이 필요하다(아래 질문)** |

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/src/simulation_platform/simulation/{compiler/assumptions,compiler/compile,runtime}.py` | `out_release` 기본 hold, 입고 위치 용량 |
| `backend/scripts/seed_wire_factory.py` | 운반 자원·공간 용량·운반 단계 후보, INTAKE_MARK 4차 |
| `backend/tests/**` | 입고 위치 용량 2(엔진), 시드 시험(자산 123·포트 224·공간 승인 버전·재시드 멱등), 실제 공정 시험 가정 |
| `contracts/**`, `docs/**` | 계약 0.15.1 기록, 보드·STATUS·TASK_BOARD·소통 파일 |

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `python -m pytest -q tests/simulation tests/unit` | backend/ | 0 | 229 passed(입고 위치 2 포함) |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_seed_wire_factory.py tests/integration/test_engine_real_catalog.py` | backend/ | 0 | 34 passed(실제 공정 결과 값 변화 없음) |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/contract` | backend/ | 0 | 80 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **709 passed**, 경고 3건(테스트 클라이언트·pydantic alias, 기능 영향 없음), 492초 |
| `python scripts/seed_wire_factory.py --yes`(개발 DB) | backend/ | 0 | DEMO-WIRE: 운반 자원 5 생성, 용량 22 승인, 초안 6개 다시 적용 |

## 남은 결정(사용자)
- **단계 사이 직접 인계 용량**: 아래 5개 공정의 직접 인계 지점마다 "앞 단계 산출이 다음 단계 설비 앞에서 몇 개까지 기다릴 수 있는가". 0이면 다음 설비가 받을 때까지 앞 설비가 산출을 쥐고 기다린다.
  - P01·P02·P03: 실리콘 편조 → 실리콘 테이핑, 실리콘 테이핑 → 쉬스 압출
  - P04: 싱글-1 선행 가공 → 싱글 메인 집합, 싱글-12 공급 준비 → 싱글 메인 집합(공급)
  - P05: CU 편조 → CU 테이핑
  값이 정해지면 저장 위치(간선·단계 중 어디에 둘지)와 계약 변경이 필요하다(추가만).

## 한계
- 지금 용량에서 입고 위치는 넘치지 않는다(ST-001 150 ≥ 월초 96, ST-005 48 ≥ 24, ST-017 24 = 24) — 적용은 됐지만 이번 시나리오 결과는 바뀌지 않는다.
- `DEMO-WIRE`의 공정은 초안이라 그대로는 실행할 수 없다(시연 실행은 `DEMO-WIRE-RUN`).
