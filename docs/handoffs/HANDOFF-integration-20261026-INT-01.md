# HANDOFF-integration-20261026-INT-01
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: 통합 검증(INT) / TASK-001·TASK-002(보드 임시 번호, 정식 ID는 조정자 발급) / INT-01
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: `worktree-integration-qa` / `0043d1b`(+보드 `02a0c08`) / 2회차 기준 `origin/main@e382749`를 병합한 뒤 이 인계 포함 마지막 커밋(PR 참고)
- 계약 버전 / OpenAPI hash / 승인 scope: **0.6.0 / `509a71f15a7ed1ab1516f0ced5e107a55df56f3a553d9331b1f209a341c138ef`** / 승인 4개 scope(변경 없음)
- 수정 파일: `tests/integration/**`(신규 테스트·README·evidence), `docs/collaboration/INTEGRATION_BOARD.md`(`docs/communication/`에서 이동·갱신), `docs/change-requests/CR-integration-20261026-doc-status-drift.md`, 이 문서. **제품 코드·계약·ERD·기대값은 수정하지 않았다.**
- 실제 구현 내용: 실제 FastAPI·PostgreSQL에 연결하는 통합 테스트 pytest 25건(`tests/integration/test_*.py`)과 vitest UI 10건(`tests/integration/ui/`, 프런트엔드 실제 API 클라이언트·화면을 jsdom에 렌더링). 전용 DB·포트·안전장치(공유 8000·`_int_test` 아닌 DB 거부).
- DB migration head / 적용 DB / 데이터 변환: **0006** / 전용 `simulation_platform_int_test`(이 세션이 생성), 일회용 `simulation_platform_intpytest_test` / 변환 없음. 공유 DB 무변경.
- 추가·변경 API / 예제 / 재생성 필요 여부: 없음.
- 채택 결정과 근거: 사용자 승인(2026-10-26): 보드 경로 이동 허용, 전용 DB, 8100·5174 직접 기동, UI 검증 A안(vitest+jsdom), `tests/integration/` 사용, T8은 "알려진 제한"으로 진행(1회차에 재현, `e382749`에서 해소), 문서 불일치는 변경 요청.
- 미정 또는 임시 가정: TASK/결함 번호는 임시. Playwright 도입(실제 브라우저)은 미결.
- 상대 담당자에게 필요한 조치: 아래 "전달 메시지".

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| `backend\.venv\Scripts\python.exe -m pytest tests/integration -v -p no:cacheprovider` | 저장소 루트 | Py3.12, API 8100, 전용 DB | 0 | 1회차 24 passed·1 xfailed, 2회차 **25 passed**. `tests/integration/evidence/20261026/{pytest-api-db,round2-pytest-api-db}.log` |
| `pnpm --dir frontend exec vitest run --config vitest.config.mjs --root ../tests/integration/ui` | 저장소 루트 | Node 24.17, vitest 5.0.5, jsdom | 0 | 1회차 9 passed·1 expected fail, 2회차 **10 passed**. `…/{vitest-ui-live,round2-vitest-ui-live}.log` |
| `pytest -q`(백엔드 전체, `REQUIRE_DB=1`, `TEST_DATABASE_URL`=일회용 DB) | backend/ | PostgreSQL 16 | 1회차 0 / 2회차 미기록 | 1회차 478 passed(238 s), 2회차 `e382749` **490 passed**(294 s, `…/round2-backend-pytest-full.log`) |
| `pnpm typecheck` / `pnpm lint` | frontend/ | — | 0 / 0 | 1·2회차 동일 |
| `pnpm test`(FE 자체 Mock 테스트) | frontend/ | — | 1회차 1(2건 실패) / 2회차 0 | 1회차 516 passed·2 failed(해시 가드, 타임아웃 불안정) / 2회차 539 passed·55 skipped. `…/round2-fe-mock-vitest.log` |
| `LIVE_API=…8100 LIVE_WRITE=1 LIVE_APPROVE=1 pnpm test:live` | frontend/ | 전용 서버 | 1 | 53 passed·**2 failed**(INT-F-002) 1·2회차 동일. `…/round2-fe-live-vitest.log` |

## 미실행 테스트와 이유
- T10 실행 스냅샷·결과·상태: 시나리오·실행 API가 PROPOSED·미구현.
- 실제 브라우저 E2E·새로고침 보존: Playwright 미도입(승인 필요), jsdom은 브라우저가 아님.
- 공간(storage·dock) 생성, 자산 버전 승인 흐름, 공정 버전의 타 프로젝트 접근, 빈 데이터·로딩·422 화면 표시, 재료·규격 단위 왕복, 공정·용량 버전 충돌 UI: 이번 범위에서 작성하지 않음(보드 §8에 [~]).
- 공유 개발 API(8000)·DB: 의도적으로 사용하지 않음.

## 남은 위험·질문
- INT-F-002(FE live 테스트 2건이 새로 시드한 DB에서 실패)는 원인 미확정, API·UI 공동 진단 요청.
- 조정자 소유 문서(STATUS·TASK_BOARD·README)가 낡았다: CR 제출.
- 이 브랜치의 보드·테스트는 PR이 병합되기 전에는 다른 세션에 보이지 않는다. 다른 세션 메모리는 보드가 `docs/collaboration/`에 있다고 가정한다.

## 전달 메시지 (사용자가 각 세션에 직접 전달; 자동 전달되지 않는다)
### API(Backend) 세션에게
> 통합 검증(INT) 결과입니다. 기준 `origin/main@e382749`, 계약 0.6.0(해시 일치). API·DB(migration 0006)·권한(403/404)·ETag(412/428)·승인 불변(409)·미정 값 보존·용량 모드 구분은 실제 PostgreSQL로 검증해 모두 통과했고 백엔드 pytest 478건도 독립 재실행에서 통과했습니다(`e382749`에서 490건 통과). 요청 1건: **INT-F-002** — 현재 `seed_demo_data.py` 등으로 새 DB를 시드하면 DEMO-A의 P-001·P-004 승인본·초안 그래프에 `milestone` 노드(`complete`)와 `completion_node_id`가 들어가는데, 이는 FE의 live 테스트 2건(`live-process.test.ts` "승인본 그래프는 직선…", `live-process-ui.test.tsx` "P-004 복사 초안…")과 맞지 않습니다. 시드가 이 구조를 의도한 시점(커밋)과 의도를 보드 §13.3에 답해 주세요. 원인을 API/UI 중 어느 쪽으로 단정하지 않았습니다. 보드와 테스트는 브랜치 `worktree-integration-qa`(PR)에 있으며 `docs/collaboration/INTEGRATION_BOARD.md`를 먼저 읽어 주세요.
### UI(Frontend) 세션에게
> 통합 검증(INT) 결과입니다. 기준 `origin/main@e382749`, 클라이언트 0.6.0. 1회차(`0043d1b`, 클라이언트 0.4.0)에서 편집 없이 저장만 해도 `completion_node_id`(완제품 지정)가 해제되는 것을 재현했고(재료 spec·간선 spec 연결은 보존), FE-04a(`e382749`)에서 해소됨을 2회차에 확인했습니다. 프로젝트 전환 후 이전 데이터 잔류 없음, 서버 중단 시 정적 예시로 대체하지 않음, 412 충돌 안내와 입력 보존, 조회 전용 저장 비활성은 실제 서버로 통과했습니다. 요청 1건: **INT-F-002** — 전용 서버·새로 시드한 DB에서 FE live 테스트 2건이 실패합니다(`parseLinear`가 milestone이 있는 승인본을 null로 돌려줘 "단계 추가"가 렌더링되지 않음). milestone이 있는 공정을 표 편집기에서 어떻게 다루는 것이 의도인지, live 테스트의 가정(직선 그래프)을 어떻게 맞출지 보드 §13.3에 답해 주세요. 원인을 단정하지 않았고 API 세션에도 같은 요청을 보냈습니다. 참고: `api-write.test.tsx`가 전체 병렬 실행에서 한 번 20초 타임아웃을 넘긴 적이 있습니다(단독·2회차에서는 통과).
### 조정자에게
> 보드를 `docs/collaboration/`로 옮겼고 STATUS·TASK_BOARD·README의 낡은 서술은 `docs/change-requests/CR-integration-20261026-doc-status-drift.md`로 요청했습니다. 보드·테스트 PR 병합과 CR 검토가 필요합니다.

## 다음 세션의 첫 작업
- INT-F-002 답변을 받으면 같은 전용 환경에서 재검증(보드 §13에 3회차로 추가).
- API·UI 수정이 병합되면 `origin/main`을 병합하고 `tests/integration/README.md`의 절차로 재실행.
- 미실행 항목(공간 생성, 자산 버전 승인, 화면 상태, 재료 단위 왕복) 시나리오 추가는 사용자 승인 후.
민감값·실제 고객 도면·토큰을 인계 로그에 붙이지 않는다.
