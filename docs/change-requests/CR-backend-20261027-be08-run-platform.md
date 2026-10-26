# CR-backend-20261027-be08-run-platform
- 요청자: Backend / 작업 BE-06(임시 ID, 로드맵 C-07~C-10·C-15·C-16) / 대상: contracts/04 §5(실행 API), ERD §6(`simulation_run`·`run_input_snapshot`·`job`·`run_attempt`·`simulation_event`·`work_item`·`work_item_relation`·`metric_result`), 07 §9~§11
- 상태: **승인 대기**(보드 §7 DEC-008). 승인 전에는 migration·API를 구현하지 않는다.
- 선행: 엔진 C0-01~07, 시나리오 버전·사전검증(계약 0.7.0, `main` `b2b57c4`).
- 사용자 결정 반영(2026-10-27): ① 실행 범위는 **한 달치 원자재 입고를 기준으로 원자재가 모두 소모될 때까지**(대략 1~2개월 가상 시간)만 본다. ② 하루·주 단위 중간 스냅샷(상태 체크포인트)은 **이번 범위 밖**(후속). ③ 정보가 부족해도 최소한으로 실행 가능한 구조는 별도 CR(be09, 가정 확장)에서 다룬다 — 이 CR은 "실행 가능 판정을 통과한 시나리오"를 돌리는 플랫폼이다.

## 1. 왜 지금 필요한가
엔진은 시험 코드에서만 돈다. API로 실행을 요청해 **입력을 불변으로 고정하고, API와 분리된 프로세스에서 실행하고, 이벤트·지표를 저장해 나중에 조회**하는 경로가 없다. LLM 결과 질의(로드맵 D)는 저장된 run·지표·이벤트가 있어야 시작할 수 있다.

## 2. 범위
| # | 기능 | 로드맵 |
|---|---|---|
| 1 | 실행 요청: 승인된 시나리오 버전 → 입력 스냅샷(불변)·run·job을 한 트랜잭션으로 생성, `Idempotency-Key` | C-07 |
| 2 | DB 기반 job queue: claim·lease·heartbeat·fencing, 재시도 한도 | C-08 |
| 3 | worker: API와 **별도 프로세스**, 엔진 실행, wall-clock·이벤트 한도, 비정상 종료 감지 | C-09 |
| 4 | 취소 요청과 실제 취소 구분, stale attempt 무시 | C-10 |
| 5 | 이벤트·작업물·계보 저장(배치 기록, 불완전 로그 표시) | C-15 |
| 6 | 지표 계산·저장(정의 버전 포함): 생산 완료량, 대기, 설비 상태 시간·가동률, 폐기, WIP, 완료 시각(리드타임) | C-16 |
| 7 | 조회 API: run 목록·상태·종료 사유·입력 스냅샷·이벤트(커서)·지표·작업물 계보 | 04 §5 |

**제외:** 중간 스냅샷(체크포인트), 비교·반복 실행(C-19), 실행 UI(C-17), 가정 확장과 LLM 가정 제안(CR be09), 근무 달력·초기 WIP, 네트워크 이동, 분산 worker·외부 큐.

## 3. 핵심 설계
- **입력 스냅샷**(`run_input_snapshot`, run당 1개): 시나리오 버전 내용 + 제품별 공정 버전 그래프(엔진 입력 모양) + 고정 자산 버전 + 가정 + 종료 규칙 + seed + `engine_version` + 의존성 잠금 해시. 정규화 JSON의 SHA-256을 `input_hash`로 저장하고 수정·삭제는 DB가 금지한다(승인 버전과 같은 방식). worker는 **이 스냅샷만** 읽고 현재 master를 읽지 않는다(ADR-0002 결정 2).
- **실행 가능 조건:** 승인된 시나리오 버전만(0.7.0의 승인 = 사전검증 통과). 실행 시점에 한 번 더 컴파일해 통과해야 job을 만든다.
- **상태:** run = `queued → running → completed | stalled | horizon_reached | failed | limit_reached | cancelled`(엔진 종료 상태 그대로, 완료와 정체를 구분). attempt는 run당 여러 번(재시도), 공식 결과는 선택된 성공 attempt 하나.
- **queue:** `job` 테이블에서 `SELECT … FOR UPDATE SKIP LOCKED`로 claim, `lease_expires_at`·`fencing_token`으로 늦게 끝난 옛 worker의 쓰기를 거부(모든 결과 쓰기에 fencing 검사). 외부 큐 도입 없음(ERD 결정).
- **worker:** `python -m simulation_platform.worker` 별도 프로세스. 엔진은 **자식 프로세스**에서 실행하고 부모가 heartbeat·timeout을 감시한다(실행이 멈춰도 lease 갱신/종료 처리 가능). 설정: wall-clock 한도, 이벤트 한도(기본 200,000은 한 달치 규모에 모자랄 수 있어 **측정 후 상향**, §5-3).
- **이벤트 저장:** 엔진이 만든 이벤트를 `simulation_event`에 배치 INSERT(`(attempt_id, event_seq)` 유일). 실행 중 비정상 종료면 attempt를 `incomplete`로 표시하고 부분 로그를 공식 결과에서 제외한다.
- **지표:** 이벤트로만 계산(엔진 내부 상태 직접 참조 금지), `metric_result`에 `(metric_key, dimensions, window, value, unit, definition_version, quality_status)` 저장. 분모가 0이면 null(0% 금지), 미완료 run은 `observed/censored`로 표시. 지표 정의 문서 07 §10을 코드 상수로 고정하고 버전을 붙인다.
- **API(초안, project 아래):** `POST /runs`(202, `Idempotency-Key`), `GET /runs`, `GET /runs/{r}`, `GET /runs/{r}/input`, `POST /runs/{r}/cancel`, `GET /runs/{r}/events`(`event_seq` 커서, step/asset/item 필터), `GET /runs/{r}/metrics`, `GET /runs/{r}/items/{item_key}/lineage`. 권한: 실행 요청·취소 editor, 조회 viewer. 오류 코드 추가: `RUN_NOT_RUNNABLE`(422), `IDEMPOTENCY_CONFLICT`(409), `JOB_CANCEL_TOO_LATE`(409).

## 4. 쪼개서 구현(각각 PR, 앞 것이 머지된 뒤 다음)
1. **be08a:** migration 0008(run·snapshot·job·attempt), 실행 요청·스냅샷·`input_hash`, queue claim·lease·fencing, worker 프로세스(엔진 실행, 결과는 상태·종료 사유까지), 취소. 계약 0.8.0(`POST/GET runs`, `input`, `cancel`).
2. **be08b:** migration 0009(event·work_item·relation), 이벤트·계보 저장과 조회 API. 계약 0.9.0.
3. **be08c:** migration 0010(metric_result), 지표 엔진과 조회 API. 계약 0.10.0.
각 단계마다 인계 문서와 FE 공지를 남긴다.

## 5. 결정이 필요한 항목(권장안)
1. **범위:** 위 7가지 + 3개 PR로 분할(권장) / 한 번에(변경이 커서 비권장).
2. **"스냅샷 추후"의 해석:** 이번에 제외하는 것은 **하루·주 단위 중간 상태 체크포인트**이고, 실행 입력을 불변으로 고정하는 `run_input_snapshot`은 포함한다(재현성·감사에 필요, 권장). 다르게 의도하셨다면 알려 주세요.
3. **이벤트 규모:** 한 달치 입고면 이벤트가 수십만~수백만 건일 수 있다. be08a에서 **대표 시나리오로 이벤트 수를 측정**한 뒤 한도(권장: 측정값의 2배, 상한 설정)와 저장 방식을 확정한다. 너무 크면 이벤트 상세는 run당 압축 파일(artifact)로 두고 지표·요약만 테이블에 두는 대안을 제시한다.
4. **가상 시간 가정:** 근무 달력이 아직 없어 엔진은 **24시간 연속 가동**으로 계산한다(교대·휴무 없음). 한 달 = 30일 × 24시간으로 본다. 결과 화면·LLM 답변에 이 가정을 한계로 항상 표시한다(권장). 교대 반영이 필요하면 달력(C-04) CR이 먼저다.
5. **종료 규칙:** 기본은 `drain`(원자재 소진까지, 안전 한도 = wall-clock·이벤트 수·가상 시간 상한 예: 120일), 필요하면 `fixed_horizon`. 가상 시간 상한 초과는 `horizon_reached`(관측 중단)로 표시, 성공으로 취급하지 않는다(권장).
6. **worker 배치:** 개발은 같은 PC에서 별도 프로세스(`run_dev_worker.ps1`), 운영 배포 방식은 F 단계에서 결정(권장).

## 6. 구현 계획(승인 후)
be08a → be08b → be08c 순서로 CR §4를 따른다. 각 PR: 모델·migration → 서비스·API → 시험(DB·권한·격리·동시 claim·fencing·멱등·취소) → OpenAPI 후보 → 계약 승격 → 인계. 엔진은 DB를 모르는 그대로 두고 worker가 스냅샷 dict를 엔진 입력으로 변환한다.
