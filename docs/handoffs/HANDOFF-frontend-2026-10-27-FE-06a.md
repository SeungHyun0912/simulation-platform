# HANDOFF · Frontend · FE-06a (공정 API 준비 확인, 계약 0.9.0 반영, 잔여 처리 `discard`)

- 작업 ID: **FE-06a** (사용자 지시: 공정 정보 API 준비 여부 확인 후 개발). 상태: **구현완료 / 검증대기**
- 브랜치 `worktree-frontend-fe00-n`, origin/main `de74230` 병합 기준. 계약 **0.9.0**, openapi sha256 `229cc091b84e00810e2883455e84257066d3954091e82bc84f9ed86f164aae74`(생성물·`pnpm check:api` 일치)

## 1. 공정 API 준비 상태 확인 결과
- 공정 API는 **계약 0.4.0부터 준비·승인**되어 있고 FE는 FE-02a~04a에서 **이미 연동**했다(버전 목록·새 초안·그래프 GET/PUT·단위 PATCH·검증·제출·승인·반려). 0.5.0(`diff`·`editor-state`·`base_version_id`), 0.6.0(재료 spec·간선 연결·완제품)도 서버에 있다.
- 개발 서버(8000, 계약 0.9.0 코드로 실행 중)에서 DEMO-WIRE의 admin 사용자로 읽기 전용 확인: 제품 P01~P06의 최신 공정 버전 6건(모두 draft) 그래프가 내려온다. P01~P03 노드 11·간선 10·단계 5·spec 10, P04 노드 23·간선 23·단계 11·spec 19(issues 1), P05 노드 28·단계 13·spec 22, P06 노드 22·단계 9·spec 14, 전부 `completion_node_id` 지정. 이 응답을 FE가 읽는 경로(어댑터)와 같은 필드다.
- 0.7.0~0.9.0의 새 operation은 시나리오(`/scenarios`, `/scenario-versions`)와 실행(`/runs`)이며 **공정 API 변경은 `residual_rule.mode`에 `discard` 추가(0.8.0) 하나**다.

## 2. 변경
1. 계약 0.9.0으로 생성 타입 재생성(`pnpm gen:api`, 수동 수정 없음).
2. 잔여 처리 선택지에 `discard`(그 자리에서 폐기) 추가(`RESIDUAL_MODE_LABELS`).
3. `EnumSelect`: 서버가 열거를 늘려 화면이 모르는 값이 오면 "알 수 없는 값 (원문)"으로 표시하고 저장 때 그대로 되돌려 보낸다(0.8.0 안내의 "열린 목록" 지침).
- 변경 파일: `frontend/src/features/processes/{processView.ts,StepEditPanel.tsx}`, `src/shared/api/generated/*`(재생성), `tests/component/api-process-specs.test.tsx`(+2건).

## 3. 자체 테스트(frontend/, 실제 결과)
`pnpm typecheck` 0 · `pnpm lint` 0 · `pnpm check:api` OK(0.9.0) · `pnpm build` 0 · `pnpm test` **548 통과·55 건너뜀**(첫 실행에서 부하로 2건이 21초대 시간 초과, 단독 재실행 49건 통과·전체 재실행 통과 — 알려진 부하 의존 불안정) · 읽기 전용 live(8000) 29 통과·26 건너뜀.
**미실행:** `discard`·0.6.0 새 필드의 실서버 쓰기(공유 DB 흔적, 허락 필요), 브라우저 수동 확인.

## 4. 영향·재검증
- 계약 변경 요청 없음. Backend 영향 없음.
- 재검증: `pnpm test`, 위 live 읽기, 공정 편집 화면에서 잔여 처리에 "그 자리에서 폐기" 선택 → 저장 → 재조회 시 `discard` 유지.

## 5. 후속(사용자 결정 필요)
- **시나리오·실행 화면은 아직 없다.** 계약 0.7.0(시나리오 버전 생성·수정·사전검증·승인)·0.9.0(실행 요청 202·polling·취소·입력 스냅샷)이 준비돼 있다. 공정 정보 다음 단계로 시나리오 목록·편집부터 만들지 결정을 요청한다.
- 복제 기준 선택·버전 비교(diff) UI(BE-REQ-018), milestone 공정의 표 편집 UX(DEC-004)도 결정 대기.
