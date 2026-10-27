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
| `pnpm test` | 31 파일 통과·8 건너뜀, **601 통과·62 건너뜀**(건너뜀=라이브) |
| `pnpm check:api` | OK(0.11.0 `d6189bb841e6…`) |
| `pnpm build` | 종료 0 |
| 읽기 전용 live(`LIVE_API=http://127.0.0.1:8000/api/v1`) `live-scenario-run-ui` | **6 통과** — 프로젝트 `DEMO-WIRE-RUN`의 실제 시나리오 `S-MONTH-24`(승인 v1)와 실행 2건(stalled·cancelled)으로 목록·읽기 전용 버전·결과 요약·취소됨 화면 확인 |
| 브라우저 화면(Edge headless 스크린샷, 실서버) | 실행 목록·실행 상세(stalled 안내·공정 버전별 결과·부족한 입력·가정)·시나리오 버전(읽기 전용) 렌더링 확인 |

**미실행(숨기지 않음):** 시나리오·실행의 **실서버 쓰기**(시나리오 생성·초안 저장·승인·실행 요청·취소) — 공유 DB에 흔적이 남고 삭제 endpoint가 없어 사용자 허락 필요. 쓰기·polling·Idempotency는 가짜 서버(`fakeScenarios.ts`, 생성 타입으로 검증)로만 확인했다. 실행 중(running) 상태의 실서버 polling도 확인하지 못했다(서버에 진행 중 run 없음). 계보(lineage) 조회는 화면을 만들지 않았다.

## 4. 계약·상대 영역 영향
- 계약 변경 요청 없음. Backend 조치 요구 없음.
- 알림(Backend): ① 실행 결과의 `products[]`에 제품 코드·이름이 없고 id뿐이라 화면은 공정 버전 id 앞 8자를 보인다(필요하면 응답에 표시 코드 추가 검토). ② 지표·이벤트는 `stalled`·`cancelled` 실행에서 선택된 시도 유무에 따라 409/200이 갈리는 것으로 이해하고 둘 다 안내로 처리했다(실서버에서 stalled의 지표 응답을 라이브 테스트가 두 경우 모두 허용).

## 5. 통합 검증 담당 재검증 방법
1. `pnpm install --frozen-lockfile` 후 `frontend/`에서 typecheck·lint·test·check:api·build 재실행.
2. 개발 서버가 있으면 `$env:LIVE_API="http://127.0.0.1:8000/api/v1"; pnpm test:live`(읽기). `DEMO-WIRE-RUN`이 없으면 해당 테스트는 건너뛴다.
3. 수동(전용 DB 권장): 시나리오 추가 → 제품·승인된 공정 버전·도착 입력 → 저장 → 사전검증 → 승인(관리자) → 실행 요청 → 실행 상세에서 상태 갱신·지표·이벤트. 같은 요청을 네트워크 단절 후 재시도해도 실행이 하나만 생기는지(Idempotency-Key), 승인본이 읽기 전용인지, 편집자·조회자 권한 제한을 확인.

## 6. 후속
- 사용자 결정 대기: 계보(lineage) 화면, 비교(`comparisons`)·`rerun`(계약 PROPOSED, 미구현), 시나리오의 자산 고정 개별 편집, 복제 기준 선택·버전 비교(BE-REQ-018), milestone 공정 표 편집 UX(DEC-004).
