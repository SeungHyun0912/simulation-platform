# HANDOFF-backend-20261027-BE-11-12-timeline-compare
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-11**(설비 상태 타임라인)·**BE-12**(두 실행 비교), 임시 ID. 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be25 / `d81bd33`(origin/main, PR #54 병합 후) / 구현 `f1e4437`(BE-11)·`2d14408`(BE-12), 계약 승격·문서는 PR 본문과 `git log` 참조
- 승인 근거: 사용자 지시 "후보로 정해준 API들을 순서대로 개발해 줘"(2026-10-27)의 둘째·셋째 후보 = CR be11·be12 권장안 승인으로 해석, PR #54 머지("머지 완료 했고", 2026-10-27) 확인 뒤 승격. 정정 가능.
- 계약 버전: **0.12.0 → 0.13.0**(추가만, sha256 `ea8ee8239ec4280d04805b2a519f920e8a2cd91f2835814b184a3f05cf0ac704`), migration head **0010**(변경 없음).

## API
| Method | Path | 내용 |
|---|---|---|
| GET | /runs/{r}/asset-timeline | 설비마다 일·주·월·전체 구간별 처리·준비·예약·막힘·유휴 시간과 가동률. **후보였지만 쓰이지 않은 설비도 `used=false`로 포함** |
| GET | /runs/{r}/assets/{asset_id}/states | 설비 하나의 상태 구간(간트): 상태·시작·끝·길이·작업·단계·제품. 길이 0 전이 제외 |
| GET | /runs/{r}/compare/{other} | 두 실행 비교 요약: 비교 가능 여부·주의, 입력 스냅샷 차이, 제품별 핵심 지표(기준·비교·차이·비율), 양쪽 병목 상위 5개 |
| GET | /runs/{r}/compare/{other}/metrics | 지표 차이 행. 공정 버전이 달라도 같은 제품이면 맞춤, `changed_only` |

04 초안의 저장형 `POST /comparisons`는 두지 않고 저장 없는 조회형으로 만들었다(입력·결과가 불변이라 같은 두 run 비교는 늘 같다). CR be12 §2.

## 변경 파일
| 파일 | 변경 |
|---|---|
| `backend/src/simulation_platform/simulation/metrics.py` | 지표 구간 생성 `windows()`를 모듈 함수로(타임라인이 같은 구간을 쓴다) |
| `backend/src/simulation_platform/domain/comparison.py` | 비교 순수 규칙: 입력 차이(제품 id·자산 id 기준), 주의 사항, 차원 맞추기(공정 버전 → 제품), 차이·비율 |
| `backend/src/simulation_platform/{services,repositories,api/v1}/runs.py`, `schemas/run.py` | 4개 API |
| `backend/tests/**` | 타임라인 5, 비교 4(통합), 비교 규칙 6(단위) |
| `contracts/**`, `docs/**` | 계약 0.13.0, CR be11·be12, 보드·STATUS·TASK_BOARD·소통 파일 |

## 실제 6공정 실행 확인(개발 DB `DEMO-WIRE-RUN`, 개발 API)
- 타임라인(주 단위): 설비 **83대 중 72대 사용, 11대 미사용**(EQ-012·016~020·079·080·091~093). EQ-096은 14주 내내 가동률 0.87~1.00, EQ-094는 1~10주 1.00 뒤 0(앞 공정 처리를 70일에 끝냄).
- 응답 시간(두 번째 요청부터): 상태 구간 0.05초, 병목 0.1초, 주 단위 타임라인 0.5초(320KB), **일 단위 타임라인 3초(2MB)** → 화면은 `limit`으로 나눠 받거나 주 단위부터.

## P04 병목 해석(사용자 질문 2026-10-27 "EQ-094가 느리면 병목이라고 해줘야지")
P04 공정 입력(시드 값)으로 작업 하나에 걸리는 시간을 비교하면:
- 싱글-1 선행 가공(EQ-094, 4.4m/min): 4,000m 보빈 1개 = **909분**
- 싱글 메인 집합(EQ-096, 32m/min): 작업 1회 = 4,000m × 10개 산출 = 40,000m ÷ 32 = **1,250분**, 이때 싱글-1 보빈 **1개** + 공급 12개를 쓴다.
따라서 메인 작업 1회(1,250분)마다 싱글-1은 909분만 일하면 되고, 지금 입력에서는 EQ-096이 흐름을 제한한다(EQ-094 가동률 = 909 ÷ 1,250 ≈ 0.73과 일치). 엔진 단독 재실행(P04만, DB 변경 없음)으로 확인:

| 변경 | P04 종료 | EQ-094 가동률 | EQ-096 가동률 | 설비 대기가 큰 단계 |
|---|---|---|---|---|
| 현재(4.4 / 32) | 96.6일 | 0.73 | 0.99 | 싱글 메인 |
| 싱글-1만 2배(8.8) | 96.4일(변화 없음) | 0.36 | 0.99 | 싱글 메인 |
| 싱글 메인만 2배(64) | **70.4일** | **1.00** | 0.68 | **싱글-1**(메인 대기 0) |
| 둘 다 2배 | 48.6일 | 0.72 | 0.98 | 싱글 메인 |

- **공정 정보를 바꿔 다시 실행하면 결과와 병목 판정이 달라진다.** 싱글 메인을 빠르게 하면 병목이 EQ-094로 옮겨 간다. 반대로 싱글-1만 빠르게 해서는 끝나는 날이 줄지 않는다.
- 사용자가 "EQ-094가 병목"이라고 본다면, 싱글 메인 입력값(32m/min, 1회 4,000m×10개 산출, 싱글-1 보빈 1개 소비) 중 실제와 다른 값이 있을 수 있다. 값 확인이 필요하다(엔진이 "느린 설비 = 병목"으로 정하지 않는 이유: 같은 흐름에서 실제로 멈춘 곳을 보여 주어야 개선 효과를 바르게 판단할 수 있다).

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `python -m pytest -q tests/unit/test_comparison.py` | backend/ | 0 | 6 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/integration/test_api_run_timeline.py tests/integration/test_api_run_compare.py` | backend/ (PostgreSQL 16) | 0 | 9 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/contract` | backend/ | 0 | 80 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **687 passed**, 경고 3건(테스트 클라이언트·pydantic alias, 기능 영향 없음), 476초(0.13.0 승격 전, PR #56 브랜치에서 실행) |
| `python -m simulation_platform.api.export_openapi` | backend/ | 0 | sha256 `ea8ee823…c704` |
| `python tools/check_workspace.py` | 저장소 루트 | 0 | PASS(문서·구조만 검증) |

## 계약 및 상대 영역에 대한 영향
- **Frontend:** CHANGELOG 0.13.0. 일 단위 타임라인은 크다(나눠 받기). 비교 화면은 `comparable`·`warnings` 먼저, 지표 차이는 `changed_only=true`부터.
- **조정자:** 04 §5 표의 저장형 비교 행은 PROPOSED로 남겼다. 저장형이 필요한지 결정 요청.

## 재검증 방법
1. `$env:REQUIRE_DB="1"; python -m pytest tests/integration/test_api_run_timeline.py tests/integration/test_api_run_compare.py tests/unit/test_comparison.py -q`.
2. 개발 서버: `DEMO-WIRE-RUN`의 run 두 개로 `GET /runs/{a}/compare/{b}` → 같은 시나리오·seed면 `input_changes=[]`이고 지표 차이가 0이어야 한다(엔진이 결정적).
3. 전체 회귀: `$env:REQUIRE_DB="1"; python -m pytest -q`.

## 미정·한계
- 시나리오가 공정 버전을 고정하므로, 공정을 고쳐 다시 돌리려면 시나리오에서도 새 공정 버전을 골라 새 시나리오 버전을 승인해야 한다(단계가 많다). "최신 승인 공정으로 시나리오 갱신" 같은 편의 기능은 후속 후보.
- 비교는 두 run만, 확률 요소가 없어 반복 실행 통계(신뢰구간)는 없다.
- 운반 설비는 타임라인에 없다(엔진이 운반 자원을 모델링하지 않음).
