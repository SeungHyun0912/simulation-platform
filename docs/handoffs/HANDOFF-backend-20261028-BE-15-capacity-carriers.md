# HANDOFF-backend-20261028-BE-15-capacity-carriers
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-15**(임시 ID, 운반 자원 모델링·공간 용량 반영). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be28 / `44e058e`(origin/main, PR #58 병합 후) / 구현 `27c5bec`·`4d03a3e`, 계약 승격·문서는 PR 본문과 `git log` 참조
- 승인 근거: 사용자 "2번 운반자원을 모델에 넣는 작업과 3번 바로 진행하자"(2026-10-28), 공간 용량 22개 "맞음", 운반 규칙 답변 — CR be15.
- 계약 버전: **0.14.0 → 0.15.0**(추가만, sha256 `f4df60cddfdb9edbd282ddb9e194f9ecefd6bc69bd015d471e88238de75d859a`), migration head **0010**(변경 없음).

## 사용자 결정과 구현
| 결정 | 구현 |
|---|---|
| 공간 22곳 용량(ST-001 150 … ST-022 1) | 개발 DB `DEMO-WIRE-RUN`의 공간마다 승인된 자산 버전(용량 = 개수). 시나리오는 갱신 API로 다시 고정 |
| 지게차 3대·AMR 2대, 경로 공유, 1제품씩(3분 + 상하차 1분) | 설비 자산 FL-001~003·AMR-001~002, P04·P05·P06의 지게차·AMR 운반 단계 후보(first_available) → 공정 v2 승인 |
| 운반 뒤 다음 명령이 없으면 목적지에서 대기 | 엔진이 운반 자원 위치를 추적, 다른 곳의 일은 빈 차 이동 뒤에(`CARRIER_MOVED`). 빈 차 이동 시간은 시나리오 가정 3분 |
| 그 밖의 공간 사이 이동은 시간 없음 | 지금 그대로 |
| (공간이 유한해져 필요해진 것) 다음 공간이 가득 차면 | 설비별 OUT 정책이 없어 시나리오 가정 `out_release=hold`(산출을 쥐고 기다림) |

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/src/simulation_platform/simulation/{compiler/assumptions,compiler/compile,compiler/model,runtime,monitoring/events}.py` | 운반 자원 위치·빈 차 이동, 출력 대기 가정, 직접 인계 가정 분리(`UNBOUNDED_HANDOFFS`), 이벤트 `CARRIER_MOVED` |
| `backend/src/simulation_platform/schemas/scenario.py`, `domain/scenario.py` | 가정 필드 2개, 사유 필요 규칙에 포함 |
| `backend/src/simulation_platform/domain/bottleneck.py` | 운반 자원을 모델링한 실행의 한계 문구 |
| `backend/scripts/demo_capacity_carriers.py`(새) | 용량 승인·운반 자원 생성·운반 단계 공정 갱신·시나리오 갱신·재실행·비교·병목(개발용, 다시 실행해도 안전) |
| `backend/tests/**` | 운반 자원 8(엔진), 가정 API 2, 병목 한계 1, 실제 공정 가정 코드 갱신 |
| `contracts/**`, `docs/**` | 계약 0.15.0, CR be15, 보드·STATUS·TASK_BOARD·소통 파일 |

## 실제 6공정 재실행 결과(개발 DB `DEMO-WIRE-RUN`, run `f18c3dcb-b37b-4ed1-9502-77d25f3be1aa`)
- 상태 stalled(입력 부족, P04·P05 마지막 묶음), 가상 96.6일(P04가 결정), 이벤트 171,757건(빈 차 이동 2,616회 포함). 완료 수는 6종 모두 이전과 같다.
- **비교(기준 `2b84b7b3…` 공간 무제한·운반 무제한 → 새 실행):** 입력 차이 = P04·P05·P06 공정 버전(운반 자원), 가정, 공간 자산 21곳 용량.
  | 제품 | 마지막 완료(일) | 리드타임 평균(분) |
  |---|---|---|
  | P01 | 16.6 → **4.6** | 12,343 → **3,718** |
  | P02 | 16.9 → **10.2** | 12,633 → 10,717 |
  | P03 | 17.1 → 17.1 | 13,003 → **19,717** |
  | P04·P05·P06 | 변화 거의 없음 | 변화 거의 없음 |
  ST-002(20자리)이 실리콘 라인(P01→P02→P03 순서) 입고를 조절해 먼저 들어온 P01·P02가 빨리 끝나고, P03은 더 오래 기다린다(실리콘 라인 전체 종료 17.1일은 같다).
- **병목(공간 부족이 처음 평가됨):** #1 [space_full/high] **ST-002 실리콘 압출 대기 공간** — 다음 공간에 자리가 없어 최대 13,683분 대기(총 296,767작업물·분). #2 [equipment_busy/high] P04 싱글 메인(EQ-096 98.9%). 그 밖에 P01~P03 절연 압출 출력 막힘(low).
- **운반 자원:** 운반 대기 0분. 가동률 FL-001 3.5%·AMR-001 3.8%, FL-002·AMR-002는 거의 쓰이지 않았고 **FL-003은 쓰이지 않았다**(비는 자원 중 코드 순 선택). 이 조건에서 지게차·AMR은 병목이 아니다.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `python -m pytest -q tests/simulation tests/unit` | backend/ | 0 | 227 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_api_carrier_assumptions.py tests/integration/test_api_scenarios.py` | backend/ | 0 | 16 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/contract` | backend/ | 0 | 80 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **707 passed**, 경고 1건(테스트 클라이언트, 기능 영향 없음), 369초 |
| `python scripts/demo_capacity_carriers.py --yes`(`PYTHONPATH=scripts`, 개발 DB) | 개발 API·worker(재시작) | 0 | 위 결과 |
| `python -m simulation_platform.api.export_openapi` | backend/ | 0 | sha256 `f4df60cd…859a` |
| `python tools/check_workspace.py` | 저장소 루트 | 0 | PASS(문서·구조만 검증) |

## 계약 및 상대 영역에 대한 영향
- **Frontend:** CHANGELOG 0.15.0. 가정 편집에 두 필드, 결과에 `CARRIER_MOVED`·새 가정 코드(열린 목록), 설비 목록에 FL-*·AMR-*.
- **조정자:** 07 §7·§8에 운반 자원 위치 규칙·출력 대기 가정, 03에 가정 필드 반영 요청.
- **데이터:** 용량·운반 자원은 시연 프로젝트 `DEMO-WIRE-RUN`에만 넣었다. 원본 `DEMO-WIRE`(초안)에는 넣지 않았다(사용자가 정하지 않음).

## 미정·한계
- 빈 차 이동 3분은 모든 위치 쌍에 같은 값을 쓴 가정이다(공간 사이 거리 정보 없음).
- 운반 자원 선택은 비는 자원 중 코드 순이라 FL-001에 일이 몰린다(대수가 남아 결과에는 영향 없음). 균등 배분 규칙이 필요하면 정해야 한다.
- 원자재 입고 위치(ST-001·005·017)의 용량은 엔진이 적용하지 않는다(입고는 그대로 들어온다).
- 공간 용량이 유한해도 단계 사이 직접 인계는 여전히 무제한 가정(`UNBOUNDED_HANDOFFS`).
