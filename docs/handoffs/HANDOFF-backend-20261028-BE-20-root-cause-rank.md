# HANDOFF-backend-20261028-BE-20-root-cause-rank
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-20**(임시 ID, `root_causes` 순위 규칙 결함 수정). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be33 / main `cb5f52f`(0.16.1, PR #64 머지) / 구현 `4a4e9ea`
- 근거: FE 보고(2026-10-28) — run `aa1a48b2`에서 headline의 근본 원인(P04 싱글 메인 EQ-096)과 `root_causes` 1위(P01 쉬스 압출 EQ-002, 14건 중 낮음 13)가 다르다. 0.16.0 규칙의 결함이라 고치고 사용자가 PR 머지로 승인한다.
- 계약 버전: **0.16.1 → 0.16.2**(필드 변경 없음, `RootCauseGroupOut.rank` 설명만 바뀌어 OpenAPI sha `4b35e3db…367f`), 병목 정의 버전 **2 → 3**, 엔진 c0.3 그대로, migration head 0010.

## 변경
| | 이전(정의 버전 2) | 지금(정의 버전 3) |
|---|---|---|
| `root_causes` 순위 | 묶인 후보의 가장 높은 level → 묶인 후보 수 → 멈춘 양 | 묶인 후보 중 가장 높은 전체 순위 |
| 결과 | 낮음이 많은 묶음이 높음 3건 묶음을 앞지름 | 1위 묶음 = 병목 1위 후보의 근본 원인 = headline |

- 화면 안내 문장(04 §5.10): "순위는 묶인 병목 후보 중 가장 높은 순위를 기준으로 매깁니다(1위는 가장 큰 정체의 근본 원인)."

## 실제 확인(개발 DB `DEMO-WIRE-RUN`, run `aa1a48b2-6708-4244-a532-ae6a7636de77`, 개발 API 재시작 후)
- `root_causes` 1위 P04 싱글 메인 집합(EQ-096 98.9%, 후보 11건: 높음 3·중간 3·낮음 5) = headline의 근본 원인. 2위 P01 쉬스 압출(EQ-002 13.8%, 14건: 높음 1·낮음 13).

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check src tests` | backend/ | 0 | All checks passed |
| `python -m pytest -q tests/unit/test_bottleneck.py` | backend/ | 0 | 15 passed(결함 재현 시험 1건 추가) |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_api_run_bottlenecks.py` | backend/ | 0 | 6 passed(정의 버전 3) |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 1 | **721 passed, 1 failed**, 396초. 실패 1건은 `tests/contract/test_openapi.py::test_approved_snapshot_matches_current_code` — 계약 0.16.2 갱신(openapi.json) 전에 실행된 스냅샷 비교라 예상된 불일치이며 갱신 뒤 아래 계약 시험으로 재확인 |
| `python -m pytest -q tests/contract`(계약 0.16.2 갱신 뒤) | backend/ | 0 | **80 passed** |

## 남은 결정
- 없음.
