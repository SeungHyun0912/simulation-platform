# HANDOFF-backend-20261028-BE-18-root-cause-report
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-18**(임시 ID, 병목 원인 추적·결과 리포트 묶음). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be31 / main `d53dd56`(0.15.2, PR #61 머지) / 구현 `2191ce9`
- 승인 근거: 사용자 지시(2026-10-28) "리포트 묶음 API를 포함해서 원인 추적 기능을 개발해줘". CR `docs/change-requests/CR-backend-20261028-be17-root-cause-report.md`. LLM 없이 규칙으로 계산(사용자 질문에 대한 답변으로 확인).
- 계약 버전: **0.15.2 → 0.16.0**(추가만, OpenAPI sha `13fa2fb9…42ad`), 엔진 버전 c0.2 그대로, migration head 0010(새 migration 없음).

## 구현
| 항목 | 내용 |
|---|---|
| 원인 추적(`domain/bottleneck.py`, 정의 버전 2) | 후보마다 막힘을 하류로 따라간다: 출력이 막힌 단계(≥60작업물·분) → 다음 위치, 공간 → 그 공간을 가진 **모든 공정**의 소비 단계 중 더 막힌(같으면 처리 시간이 긴) 단계, **막히지 않은 단계 = 근본 원인**. 재방문·20단계 초과·갈 곳 없음 → null |
| 병목 응답(추가) | 후보마다 `root_cause`(제품·단계·후보 설비 가동률·입력 대기·설명)·`chain`(경로), 요약에 `root_causes[]`(근본 원인별 묶음·순위), headline에 "근본 원인: …" |
| 낮은 가동률 안내 | 근본 원인 설비 가동률이 50% 미만이면 "설비 속도보다 투입 조건을 먼저 확인"(묶음 투입·입력 대기) |
| `GET /runs/{r}/report` | 실행·시나리오·가정, 제품별 핵심 지표와 입력 부족, 병목 상위 10개와 근본 원인, 가동률 상위 설비 10대, 적체 상위 공간 10곳, 한국어 요약 문장(`domain/report.py`, 규칙), 한계 |
| 공용화 | `services/runs.py`의 `_analysis`(지표 수집 + 규칙)를 병목·리포트가 함께 쓴다. 비교 요약의 병목에도 새 필드가 나온다 |

## 실제 6공정 확인(개발 DB `DEMO-WIRE-RUN`, run `c3640d5d-3f8a-4fba-ac9e-ff0b3f4db686`, 엔진 c0.2, 개발 API 재시작 후 호출)
- headline: "가장 큰 정체: P04 · AL 더블 집합: … 출력이 막혔습니다(총 408,304.5작업물·분). **근본 원인: P04 · 싱글 메인 집합(EQ-096 가동률 98.9%).**"
- #1 AL 더블 집합 → ST-019 → 싱글-12 공급 준비 → **싱글 메인 집합**. #3·#4·#5·#6·#7·#8도 같은 근본 원인 → `root_causes[0]` = 싱글 메인(후보 11건: 높음 3·중간 3·낮음 5).
- #2 ST-002(공유 공간, P01·P02·P03) → 절연 압출 → ST-004 → **P03 실리콘 편조(EQ-003 17.3%)**, 낮은 가동률이라 "투입 조건 먼저 확인" 안내가 붙는다(후보 10건, 높음 1). 이 쪽은 설비 속도보다 편조의 묶음 투입·입력 조건을 봐야 한다는 뜻이다.
- 리포트 요약 문장(발췌): "실행 결과: 더 진행할 수 없어 멈춤(INSUFFICIENT_INPUT), 가상 96.6일 관측, 엔진 c0.2." / "P04: 완료 1,100개, 하루 11.4개, 평균 리드타임 48.9일, 미완료 10개, 마지막 완료 96.6일." / "고칠 곳 1: P04 · 싱글 메인 집합(EQ-096 가동률 98.9%) …" / "가동률이 가장 높은 설비: EQ-096 98.9%." / "입력이 모자라 기다리는 단계: P04 single-feed(필요 12, 보유 0), P05 draw(필요 11, 보유 0)." 응답 크기 약 54KB.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check src tests` | backend/ | 0 | All checks passed |
| `python -m pytest -q tests/unit/test_bottleneck.py tests/unit/test_report.py` | backend/ | 0 | 16 passed(원인 추적 6건·요약 문장 2건 신규) |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/unit/test_bottleneck.py tests/unit/test_report.py tests/integration/test_api_run_bottlenecks.py tests/integration/test_api_run_report.py` | backend/ | 0 | 25 passed(직전 1건 실패는 숫자 표기 기대값 수정 후 통과) |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 1 | **719 passed, 1 failed**, 경고 7건, 844초. 실패 1건은 `tests/contract/test_openapi.py::test_approved_snapshot_matches_current_code` — 계약 0.16.0 승격(openapi.json 갱신) 전에 실행된 스냅샷 비교라 예상된 불일치이며, 승격 뒤 아래 계약 시험으로 재확인 |
| `python -m pytest -q tests/contract`(계약 0.16.0 갱신 뒤) | backend/ | 0 | **80 passed** |
| `python tools/check_workspace.py` | 저장소 루트 | 0 | PASS(Markdown 138, JSON 62, 링크 151 — 문서·구조 검사일 뿐 API 테스트가 아님) |

## 프런트 영향
- 타입 재생성. 병목 화면: 후보 행에 `root_cause.explanation`·`chain`(경로 표시), 상단 "고칠 곳" 목록 = `root_causes`. 결과 화면/보고서: `GET /runs/{r}/report` 한 번으로 그릴 수 있고 `limitations[]`는 함께 보여야 한다.

## 남은 결정·후보
- 기준값(출력 막힘 60작업물·분, 낮은 가동률 50%)은 임시 휴리스틱.
- 실리콘 편조처럼 가동률이 낮은 근본 원인의 투입 조건(묶음 수·입력 대기) 상세 분석.
- 이전 미답 질문: 싱글-12가 앞자리가 찼을 때 다음 12개를 미리 받을지, 준비 대기로 설비를 쥐는 단계의 가동률 표시.
