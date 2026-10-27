# HANDOFF · Frontend · FE-07a (시나리오·실행 메뉴 화면)

- 작업 ID: **FE-07a** (사용자 지시: 시나리오·실행 메뉴 화면 개발). 상태: **구현완료 / 검증대기**
- 브랜치 `worktree-frontend-fe00-n`, origin/main `3d7cd2a` 병합 기준. 계약 **0.11.0**, openapi sha256 `d6189bb841e61e26c59485e28d1d6af098b505f21f708a7f051a647215455d49`(생성물·`pnpm check:api` 일치)
- 사용한 계약: `04_api_contract.md` §5.1(시나리오 0.7.0·0.8.0), §5.2(실행 0.9.0), §5.3(이벤트 0.10.0), §5.4(지표 0.11.0). 새 API 가정 없음, 계약 변경 요청 없음.

## 1. 구현 범위
**시나리오(`/projects/:id/scenarios…`)**
- 목록(최근 버전 요약) · 추가(코드 중복 409 → 코드 필드, 첫 빈 초안 v1 자동 생성 후 편집 화면 이동) · 상세(버전 목록, 새 초안/이 버전으로 새 초안, 열린 초안 있으면 막음·409 시 그 초안으로 이동).
- 버전 화면(`/scenarios/versions/:versionId`): 초안 편집(제품별 **승인됐던 공정 버전** 선택, 우선순위, 도착(시각·개수·길이 또는 무게·로트), 가정(설비 점유·무제한 대기 공간·수동 운반 분·잔량 범위), 종료 규칙 drain/고정 지평선, 가정 사유·메모), 저장(바뀐 최상위 필드만 PATCH, If-Match, **assets는 보내지 않아 서버 고정 보존**, 412 충돌 안내·다시 불러오기, 422 field_path를 제품 줄·도착 줄 필드에 연결), 실행 사전검증(서버 엔진 컴파일 결과를 번역 없이 표시), 승인(관리자, 확인 대화상자, 422 SCENARIO_NOT_RUNNABLE 사유 표시), 승인본은 읽기 전용.
- 도착의 길이·무게는 서로 환산하지 않고 둘 중 하나는 필수(0.8.0), 빈 값은 null이며 0이 아님, 운반 0분은 명시된 값.

**실행(`/projects/:id/runs…`)**
- 실행 요청(승인 버전 화면): seed·반복 번호(0~2³¹−1), **`Idempotency-Key` 필수** — 같은 본문 재시도는 같은 키, 본문이 바뀌면 새 키. 200(기존 run)/202 모두 상세로 이동.
- 목록(상태 필터, 진행 중이면 자동 갱신) · 상세(상태 배지, 진행 중이면 polling 후 종료 상태에서 멈춤, 시도 목록, 취소(요청 ≠ 실제 취소 구분, 409 JOB_CANCEL_TOO_LATE 처리), 결과 요약(공정 버전별 결과·부족한 입력·잔량·쓰인 가정·컴파일 문제, `stalled`는 오류가 아니라 관측 결과로 안내), 입력 스냅샷(펼칠 때만 로드, 해시 검증 결과), 지표(정의는 `/metric-definitions`에서, 구간 run/day/week/month·지표 필터, **null은 "해당 없음"으로 0과 구분**, 공정 간 합산 없음, `quality_status` ≠ complete면 경고), 이벤트(cursor 100건씩 "더 보기", 종류·단계 필터, 모르는 종류는 원문)).
- 409 RUN_RESULT_NOT_AVAILABLE(취소·실패·미완료)은 오류가 아니라 "공식 결과 없음" 안내.
- 정적 모드: 시나리오·실행은 예시 데이터를 만들지 않고 "서버 연동 전용" 안내만 보인다(가짜 실행 결과 방지).
- 메뉴 "시나리오"·"실행 결과"의 준비 중 표시 제거.

## 2. 변경 파일 (frontend/**, docs/**만)
- 신규 `src/features/scenarios/*`(scenarioView·queries·writer·ScenarioList/Create/Detail/Version·ScenarioProductEditor), `src/features/runs/*`(runView·queries·writer·RunStatusBadge·RunRequestSection·RunList/Detail·RunDetailSections), `src/shared/components/ApiOnlyNotice.tsx`
- 수정 `src/app/router.tsx`, `src/app/layout/AppShell.tsx`(메뉴·배너), `src/shared/api/client.ts`(요청 헤더 옵션), `src/shared/api/errors.ts`(새 오류 코드 분류), 생성물 `src/shared/api/generated/*`(0.11.0 재생성)
- 테스트 신규 `tests/fakeScenarios.ts`, `tests/unit/scenarioView.test.ts`, `tests/component/api-scenarios.test.tsx`(19), `tests/component/api-runs.test.tsx`(23), `tests/live/live-scenario-run-ui.test.tsx`(6, 읽기 전용); 수정 `tests/fakeApi.ts`, `tests/component/api-mode.test.tsx`

## 3. 자체 테스트(frontend/, 실제 결과)
| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 종료 0 |
| `pnpm lint` | 종료 0 |
| `pnpm test` | 31 파일 통과·9 건너뜀, **604 통과·67 건너뜀**(건너뜀=라이브; 한 번은 파일 집계가 하나 적게 나왔으나 재실행에서 재현되지 않음) |
| `pnpm check:api` | OK(0.11.0 `d6189bb841e6…`) |
| `pnpm build` | 종료 0 |
| 읽기 전용 live(`LIVE_API=http://127.0.0.1:8000/api/v1`) `live-scenario-run-ui` | **6 통과** — 프로젝트 `DEMO-WIRE-RUN`의 실제 시나리오 `S-MONTH-24`(승인 v1)와 실행 2건(stalled·cancelled)으로 목록·읽기 전용 버전·결과 요약·취소됨 화면 확인 |
| 브라우저 화면(Edge headless 스크린샷, 실서버) | 실행 목록·실행 상세(stalled 안내·공정 버전별 결과·부족한 입력·가정)·시나리오 버전(읽기 전용) 렌더링 확인 |

**실서버 쓰기 검증(사용자 허락 2026-10-27, 전용 시험 시나리오 `FE-LIVE-S1`, 프로젝트 `DEMO-WIRE-RUN`) — 통과 5건** (`LIVE_API=http://127.0.0.1:8000/api/v1 LIVE_WRITE=1 pnpm vitest run tests/live/live-scenario-run-write.test.tsx`, `tests/live/live-scenario-run-write.test.tsx`):
- 화면으로 시나리오 생성(v1 초안 자동) → 제품 P01·승인된 공정 버전·도착(2개, 3000m, 로트)·무제한 대기 공간 가정·사유 입력 → 저장(PATCH) → 사전검증(runnable) → 승인(관리자) → 승인본 읽기 전용 확인.
- 승인본에서 실행 요청 → worker가 실행 → 상세 화면이 종료 상태·결과 요약·지표·이벤트를 그림(completed, 이벤트 385건).
- 요청 직후 취소 → `CANCELLED_BEFORE_START`(cancelled)로 화면·서버 상태 일치.
- 서버 계약: 같은 `Idempotency-Key`·같은 본문 202 → 200(같은 run), 같은 키·다른 본문 409 `IDEMPOTENCY_CONFLICT`, 키 없음 428. 승인본 PATCH 409 `VERSION_IMMUTABLE`, If-Match 없으면 428.
- 추가 읽기 확인(서버 응답): 취소된 run의 metrics·events는 409 `RUN_RESULT_NOT_AVAILABLE`, stalled run은 200 + `quality_status=incomplete`(화면이 불완전 관측 경고를 띄움), day 구간 지표 70행 중 null 3행(화면은 "해당 없음").
- **서버에 남은 흔적(삭제 endpoint 없음):** 시나리오 `FE-LIVE-S1`(승인 v1) 하나, run 4건(completed 2·cancelled 1·멱등성 시험 completed 1). 재실행하면 시나리오는 재사용하고 run만 늘어난다. Backend에 SendMessage로 알림.

**미실행(숨기지 않음):** 실행 중(running) 상태를 오래 유지하는 실서버 polling(시험 실행이 몇 초 만에 끝나 가짜 서버로만 단계 전환 검증), 실행 중 취소(`cancel_requested_at`)의 실서버 확인, 편집자·조회자 권한의 실서버 쓰기 거부 확인. 계보(lineage) 조회는 화면을 만들지 않았다.

## 4. 계약·상대 영역 영향
- 계약 변경 요청 없음. Backend 조치 요구 없음.
- Backend 전달(2026-10-27, SendMessage): 검증 결과·시험 흔적, 확인 요청 2건(결과 `products[]`에 제품 코드 추가 가능 여부, 자산 고정 0건 + 모르는 값 판정으로 실행되는 것이 맞는지). **Backend 답변 수신(backend-dev):** ① 자산 고정 0건은 승인 자산 버전이 없는 것이며 용량·배출 규칙을 모르는 값으로 판정하고, 시나리오가 `unbounded_buffers` 가정+사유를 명시해야 runnable이다(경고 SCN-ASSET-001 동반, 설비 점유 기본값 `hold_for_operation`은 확정 사실). 해석이 맞음. 결과 화면에 "가정 위의 결과"로 보이길 권함 → **반영**(`result.assumptions`가 있으면 "가정 위의 결과입니다" 안내, 용량 무제한 가정은 별도 문구). ② 결과 `products[]`에 제품 코드·이름 추가는 가능(추가 필드, 실행 입력 스냅샷 값 사용)하며 다음 계약 변경(0.12.0) 후보로 기록 예정, 시점 미정 → 그때까지 FE가 제품 목록으로 id를 코드·이름으로 바꿔 표시 → **반영**(목록에 없으면 id 앞 8자, 코드를 만들어 내지 않음; 필드가 생기면 그 값을 우선). ③ 시험 흔적(삭제 endpoint 없음)은 의도이며 DEMO-WIRE-RUN 시험 데이터로 둠.
- 알림(Backend): ① 실행 결과의 `products[]`에 제품 코드·이름이 없고 id뿐이라 화면은 공정 버전 id 앞 8자를 보인다(필요하면 응답에 표시 코드 추가 검토). ② 지표·이벤트는 `stalled`·`cancelled` 실행에서 선택된 시도 유무에 따라 409/200이 갈리는 것으로 이해하고 둘 다 안내로 처리했다(실서버에서 stalled의 지표 응답을 라이브 테스트가 두 경우 모두 허용).

## 5. 통합 검증 담당 재검증 방법
1. `pnpm install --frozen-lockfile` 후 `frontend/`에서 typecheck·lint·test·check:api·build 재실행.
2. 개발 서버가 있으면 `$env:LIVE_API="http://127.0.0.1:8000/api/v1"; pnpm test:live`(읽기). `DEMO-WIRE-RUN`이 없으면 해당 테스트는 건너뛴다.
3. 수동(전용 DB 권장): 시나리오 추가 → 제품·승인된 공정 버전·도착 입력 → 저장 → 사전검증 → 승인(관리자) → 실행 요청 → 실행 상세에서 상태 갱신·지표·이벤트. 같은 요청을 네트워크 단절 후 재시도해도 실행이 하나만 생기는지(Idempotency-Key), 승인본이 읽기 전용인지, 편집자·조회자 권한 제한을 확인.

## 6. 후속
- 사용자 결정 대기: 계보(lineage) 화면, 비교(`comparisons`)·`rerun`(계약 PROPOSED, 미구현), 시나리오의 자산 고정 개별 편집, 복제 기준 선택·버전 비교(BE-REQ-018), milestone 공정 표 편집 UX(DEC-004).
