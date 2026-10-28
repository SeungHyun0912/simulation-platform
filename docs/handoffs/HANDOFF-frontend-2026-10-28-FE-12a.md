# HANDOFF · Frontend · FE-12a (0.16.2 반영 + 남은 실서버 쓰기 검증)

- 작업 ID: **FE-12a** (사용자 요청 "남은 실서버 검증 절차를 전부 진행", 2026-10-28). 상태: **구현완료 / 검증대기**
- 브랜치 `worktree-frontend-fe00-n`, origin/main 병합(PR #66 `79429b3` 포함). 계약 **0.16.2** `4b35e3db69865b6741eec94afce69af10ba0855c0a4af12782cafb09d84d367f` 재생성.

## 1. 0.16.2 반영
- `pnpm gen:api`(생성물은 rank 설명·버전 표기만 바뀜). "고칠 곳" 안내 문장을 04 §5.10 문장으로 교체: "순위는 묶인 병목 후보 중 가장 높은 순위를 기준으로 매깁니다(1위는 가장 큰 정체의 근본 원인)." 가짜 서버 병목 `definition_version` "3", 시험에 문장 단언 추가.

## 2. 실서버 쓰기 검증(사용자 허락 범위의 전용 데이터만)
| 항목 | 대상 | 결과 |
|---|---|---|
| 최신 공정으로 갱신 — 승인본에서 "새 초안을 만들어 갱신" | DEMO-WIRE-RUN `FE-LIVE-S1` v1 → v2 | **통과**(갱신 결과 표 표시, 새 초안 draft) |
| 최신 공정으로 갱신 — 초안에서 "최신 승인 공정으로 갱신" | FE-LIVE-S1 v3(이전 시도가 남긴 초안) | **통과** |
| 운반 가정 2개 저장(빈 차 이동 3분, 산출 보류 명시) | v2·v3 | **통과**(서버 값 `"3"`·`"hold"`, 실행 입력 스냅샷에 포함) |
| 사전검증 → 승인 → 실행 → 상태 자동 갱신 → 결과 리포트 | run `9a599f5d`·`d7c73c33` completed | **통과**(화면이 상태를 스스로 12회 조회해 종료 상태에 닿음, 리포트 한계·제품 결과 표시) |
| 장시간 실행: 대기 중 → 실행 중 → 종료 | v4(도착 2 → 400개, API로 준비·승인), run `d99fc649` | **통과**(이벤트 85,295건, "실행 중" 14초 표시 뒤 completed로 자동 전환, 결과 요약 표시) |
| 실행 중 취소 | v4, run `88d44795` | **통과**(요청 직후 서버 running + `cancel_requested_at`, 버튼 "취소 요청됨" 잠김 → 약 1초 뒤 취소됨, 취소 버튼 사라짐) |
| 플로우차트 단계 자동 저장(PATCH) | DEMO-A `P-006` v1 초안 | **통과**(단계 PATCH만, 그래프 PUT 없음, row_version 증가, 원래 이름으로 되돌려 저장) |
| 회귀: 기존 쓰기 시험 `live-scenario-run-write`·`live-process-ui` | FE-LIVE-S1, P-006 | **11 통과** |

### 2-1. 검증 중 생긴 일(시험 결함, 화면 결함 아님)
- 새 초안이 이전 버전 가정을 복사해 와 시험이 "3" 위에 "3"을 이어 써서 v3에 `"33"`이 저장됨 → 시험을 "비우고 입력"으로 고치고, 남은 v3 초안은 "초안에서 갱신" 경로 검증에 써서 `"3"`으로 승인.
- P-006 단계 이름의 `[`를 user-event가 키 기호로 읽어 되돌리기 입력이 멈춤 → 이름이 `…단계*(FE)`로 남아 API PATCH로 원래 이름 복원(row_version 127 → 128), 시험은 `[[`·`{{` 이스케이프로 고침.
- 취소 시험이 취소 POST보다 먼저 서버를 조회해 실패 → 화면에 "취소 요청됨/취소됨"이 나온 뒤 조회하도록 고침(그 실행 `76eb1ffa`도 실제로 cancelled).

### 2-2. 남은 개발 DB 흔적
- FE-LIVE-S1 승인본 v1~v4(v4가 최신, 도착 400개 → 이 시나리오 실행은 이제 약 16초), run 다수(completed·cancelled). 삭제 endpoint 없음.
- P-006 v1 초안: 이름 원복, row_version만 증가(130).

## 3. 자체 테스트(frontend/, 실제 결과)
| 명령 | 결과 |
|---|---|
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | 0 / 0 / 0 |
| `pnpm check:api` | 0, "생성물이 contract 0.16.2(4b35e3db6986…)과 같습니다" |
| `pnpm test` | 0, **701 통과**·76 건너뜀(라이브) |
| `LIVE_API=… LIVE_WRITE=1 pnpm vitest run tests/live/live-remaining-write.test.tsx` | 갱신·가정·실행·리포트 통과, 플로우차트 자동 저장 통과(고친 뒤 재실행) |
| 같은 파일 `LIVE_LONG=1 -t "장시간"` / `-t "실행 중에 취소"` | 장시간 통과 / 취소 통과(고친 뒤 재실행) |
| `LIVE_WRITE=1 … live-scenario-run-write live-process-ui` | **11 통과** |

로그: `$CLAUDE_JOB_DIR/tmp/fe12a-*.log`.
**미실행:** `live-write.test.ts`(EQ-025 자산 PATCH)·`live-material*` 쓰기(이번 범위의 새 기능 아님).

## 4. 디자인 시스템 §6 점검
화면 변경은 안내 문장 1줄뿐(새 색·간격·컴포넌트 없음) — 모든 항목 기존 상태 유지.

## 5. 관찰(Backend 참고)
- 실행 중 취소가 heartbeat(10초)보다 빨리(약 1초) cancelled가 됨 — 문제는 아니고 안내보다 빠름.
- 실행 목록(`GET /runs`) 항목에서는 취소된 실행의 `cancel_requested_at`이 null로 보임(단건 조회에서는 running 중 값이 있었음).

## 6. 재검증 방법
1. `frontend/`에서 typecheck·lint·test·check:api·build.
2. `$env:LIVE_API="http://127.0.0.1:8000/api/v1"; $env:LIVE_WRITE="1"; $env:LIVE_LONG="1"; pnpm vitest run tests/live/live-remaining-write.test.tsx`(FE-LIVE-S1 버전·run이 하나씩 쌓임).
