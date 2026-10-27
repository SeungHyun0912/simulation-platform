# HANDOFF-backend-20261027-BE-06d-real-run-demo
- 상태: **구현완료 / 검증대기**(자체 테스트·시연 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-06d**(임시 ID, 실제 6공정을 API→큐→worker→저장→지표 조회로 끝까지 실행하는 시연과 그때 발견한 저장 성능 결함 수정). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be23 / `3d7cd2a`(origin/main, PR #50 병합 후)
- 계약 버전: **0.11.0 유지**(OpenAPI·계약 변경 없음), migration head **0010**(변경 없음).
- 사용자 지시: "머지 완료 했어. 1번 먼저 진행해 줘"(2026-10-27) — 6공정 API 실행 시연.

## 한 일
1. **시연 스크립트** `backend/scripts/demo_run_wire_factory.py`: DEMO-WIRE의 draft 공정을 건드리지 않도록 같은 기준정보를 별도 프로젝트 `DEMO-WIRE-RUN`에 시드(멱등) → 공정 6개 제출·승인 → 시나리오 `S-MONTH-24` 작성·사전검증·승인 → `POST /runs` → polling → 결과·지표 조회. **실행 중인 개발 API와 worker**를 쓴다(`run_dev_api.ps1`, `run_dev_worker.ps1`).
2. **저장 성능 결함 수정(발견·수정):** 첫 시연은 15분이 지나도 끝나지 않았다. 엔진은 16만 건을 11초에 끝내는데 **DB 저장이 이벤트 2,000건에 16초**(초당 약 120행)였다. 원인은 `session.execute(insert(Model), rows)`(ORM 벌크 삽입)이고, Core 삽입(`Model.__table__.insert()`)은 같은 2,000행에 0.19초다(약 85배). `worker/queue.py`의 `write_batch`를 Core 삽입으로 바꾸고 회귀 시험을 추가했다(2,000건 저장 3초 미만). 기존 통합 시험은 이벤트가 수십 건이라 이 결함을 잡지 못했다.
3. 실행 중 취소 경로 실사: 느린 첫 실행에 `POST /runs/{id}/cancel`을 보내자 worker가 heartbeat에서 요청을 보고 `cancelled`/`CANCELLED`로 끝냈다(시도 상태 `cancelled`).

## 시연 결과(원자재 월초 24개씩, 공간 용량 무제한 가정, 설비 점유 기본값 hold_for_operation)
- run 상태 `stalled`/`INSUFFICIENT_INPUT`(P04·P05의 마지막 묶음이 모자람), 가상 종료 **96.6일**, 실제 소요 **54초**(실행 요청~종료, API·worker 분리 상태), 이벤트 160,272건, 작업물 8,675개, 계보 38,306행, 지표 60,552행(설비 72대에 지표 행), `quality_status` = incomplete.
- 저장 크기: simulation_event 169MB, metric_result 28MB(전체 테이블+인덱스).

| 제품 | 완료 | 완료 길이(m) | 폐기(m) | 리드타임 평균(분) | 끝 재공품 |
|---|---|---|---|---|---|
| P01 | 240 | 72,000 | 0 | 12,343 | 0 |
| P02 | 192 | 96,000 | 0 | 12,633 | 0 |
| P03 | 240 | 120,000 | 0 | 13,003 | 0 |
| P06 | 96 | 48,000 | 0 | 1,302 | 0 |
| P04 | 1,100 | 4,400,000 | 0 | 70,389 | 10 |
| P05 | 4,320 | 2,592,000 | 108,000 | 37,625 | 2 |

- 입력 부족: P04 싱글 공급 단계 9/12, P05 태신선 2/11 — 이전 단일 공정 시험(P04 1,100 보빈·P05 4,320 보빈)과 같은 값이다. 6공정을 한 실행에서 같은 설비·공간을 공유해 돌려도 제품별 결과가 단독 실행과 일치했다(공유 설비 충돌이 이 6종에서는 생산량을 바꾸지 않음).
- 가동률 상위 설비(24시간 연속 기준): **EQ-096 AL 집합 싱글 0.99**(처리 137,500분), EQ-094 AL 집합 싱글-1 0.73, EQ-085 재권취기 0.65, EQ-032 절연 압출기 0.65, EQ-036 조사기 0.48.

## 사용자 확인이 필요한 관찰
- 앞서 P04의 병목을 "싱글-1(EQ-094, 4.4m/min)"로 확인받았는데, 이 실행에서 가장 오래 일한 설비는 **EQ-096 AL 집합 싱글(99%)**이고 EQ-094는 73%다. 두 설비가 연계 그룹(GRP-001)의 구성원이라 후보 선택(코드 순 첫 빈 설비)에 따라 일이 나뉘는 결과일 수 있다. 어느 설비가 병목인지, 후보 선택 규칙이 맞는지 확인이 필요하다.
- 가상 96.6일은 P04가 지배한다(다른 공정은 1~44일 안에 끝남). "한 달치 입고를 원자재 소진까지"의 범위(1~2개월 가상 시간) 기대보다 길다 — P04 입력 처리 속도·병목 설비 값을 다시 확인할 필요가 있다.

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check .` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **654 passed**, 경고 3건(테스트 클라이언트·pydantic alias, 기능 영향 없음), 521.53초 |
| `python scripts/demo_run_wire_factory.py --yes --timeout 600` (`DATABASE_URL`=개발 DB, `PYTHONPATH=scripts`) | backend/ | 0 | 위 표(run 상태 stalled, 54초) |
| `python tools/check_workspace.py` | 저장소 루트 | 0 | PASS(문서·구조만 검증) |

## 재검증 방법
1. 개발 API·worker가 실행 중인지 확인(포트 8000, `run_dev_worker.ps1`), 개발 DB가 head 0010인지 `alembic current`.
2. `$env:DATABASE_URL='postgresql+psycopg://postgres:postgres@127.0.0.1:5432/simulation_platform'; $env:PYTHONPATH='scripts'; python scripts/demo_run_wire_factory.py --yes` → 위 표와 같은 값(같은 시나리오·seed면 결정적).
3. 새 시나리오 값으로 다시 돌리려면 시나리오를 새 버전으로 만들어 승인한 뒤 같은 방식으로 요청한다(승인된 버전은 불변이므로 이 스크립트는 승인된 `S-MONTH-24`를 재사용해 새 run만 만든다).
4. 저장 성능 회귀: `$env:REQUIRE_DB="1"; python -m pytest tests/integration/test_api_run_events.py -k full_batch -q`.

## 한계
- 시연의 공간 용량 무제한·설비 점유·월초 24개 입고는 시나리오 쪽 가정이며 사실이 아니다(사전검증 경고 `SCN-ASSET-001`: 자산 104개에 승인된 자산 버전이 없음).
- 작업물 8,675개·이벤트 16만 건 규모만 확인했다. 입고량을 늘리거나 여러 달을 돌리는 규모, 운영 DB·worker 여러 대는 미검증이다.
- 시연 프로젝트 `DEMO-WIRE-RUN`은 개발 DB에만 있는 시험 데이터다.
