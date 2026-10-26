# HANDOFF · Frontend · FE-04a (계약 0.6.0: 재료 spec·간선 spec 연결·완제품 지정)

- 작업 ID: **FE-04a** (긴급 보존 수정 + 화면 연결)
- 상태: **구현완료 / 검증대기** (통합 검증 담당자의 재검증 전까지 "완료"가 아니다)
- 브랜치: `worktree-frontend-fe00-n` (기준 origin/main `9e7d224`, 이후 main에 `0043d1b`(BE-08 엔진) 병합됨 — 계약 변경 없음)
- 계약: 0.6.0, openapi sha256 `509a71f15a7ed1ab1516f0ced5e107a55df56f3a553d9331b1f209a341c138ef` (생성물과 `pnpm check:api` 일치)
- 통합 보드: `docs/collaboration/INTEGRATION_BOARD.md`는 2026-10-26 `git fetch` 후 origin/main에 **없었다**(조정자 미병합). 임의로 만들지 않고 이 인계에 보드 요구 항목을 적는다. 병합되면 이 항목을 옮겨 적는다.

## 1. 변경 내용
1. **긴급(커밋 `fd69ffd`, 푸시됨):** 계약 0.6.0 재생성. 그래프 `PUT`이 전체 교체라서 새 필드를 모르면 저장 때 지워지므로, 화면이 조회한 그래프(`completion_node_id`, 단계 `material_specs`, 간선 spec 키)를 그대로 되돌려 보내게 했다. 편집으로 무효가 되는 연결만 정리한다(끝점 변경 시 해당 spec 키 해제, 선후 간선 전환 시 둘 다 해제, 완제품 노드 삭제 시 지정 해제).
2. **화면(이번 커밋):**
   - 단계 편집 "투입·산출 재료"(`MaterialSpecEditor.tsx`): 재료 기준정보 선택, 상태·형태, 길이·중량·단위 수·가닥 수 각각 입력(기본 미정), 수량 기준. 간선에 연결된 spec은 삭제 불가 안내.
   - 그래프 구성: "완제품 판정 노드" 선택(milestone만), 간선 편집의 출력/입력 spec 연결, 표·도식에 완제품 표시.
   - 재료 선택지 `useMaterialOptions`(모든 페이지, 보관 재료는 선택지에서 제외하되 이름 조회 유지).
   - 클라이언트 검증: VAL-GRAPH-005(완제품은 milestone), spec 연결 규칙, spec 입력 검증.
3. 문서: `request-from-frontend.md`(BE-REQ-018·019·020 답변, 상태 표, 변경 이력, 번호 충돌 해소 `FE-REC-016~020`), 이전 FE 인계의 참조 이름 갱신.

## 2. 변경 파일 (frontend/**, docs/**만)
- 신규: `src/features/processes/MaterialSpecEditor.tsx`, `tests/component/api-process-specs.test.tsx`, `tests/unit/processPreserve.test.ts`(커밋 `fd69ffd`)
- 수정: `src/features/processes/{GraphDiagram,GraphEditor,ProcessEditorPage,StepEditPanel}.tsx`, `processDoc.ts`, `processGraph.ts`, `processView.ts`, `processDraft.ts`, `useProcessEditor.ts`, `src/features/materials/queries.ts`, `src/shared/api/generated/*`(재생성), `tests/fakeProcess.ts`, `tests/unit/processModel.test.ts`
- 문서: `docs/communication/request-from-frontend.md`, `docs/handoffs/HANDOFF-frontend-2026-10-26-FE-{01e,02a,02b,03a,04a}.md`
- `backend/**`·`contracts/**`는 수정하지 않았다.

## 3. 자체 테스트 (frontend/ 에서 실행, 실제 결과)
| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 종료 0 |
| `pnpm lint` | 종료 0, 경고 출력 없음 |
| `pnpm test` | 26 파일 통과·7 건너뜀, **539 통과·55 건너뜀**(건너뜀=라이브) |
| `pnpm check:api` | OK(0.6.0 `509a71f15a7e…`와 생성물 일치) |
| `pnpm build` | 종료 0 |
| `LIVE_API=http://127.0.0.1:8000/api/v1 pnpm test:live` (읽기 전용) | 5 파일 통과·2 건너뜀, **29 통과·26 건너뜀**(쓰기 구역은 `LIVE_WRITE` 없이 건너뜀) |

신규 `api-process-specs.test.tsx` 13건: 새 필드 보존(이름만 수정·구조 변경), 완제품 지정·해제·노드 삭제, 서버 VAL-GRAPH-005·VAL-SPEC-002 오류 연결, spec 추가(3.3t×11 → 중량 3300·단위 수 11 분리, 미입력은 unknown), 개수 소수 입력 차단, 연결된 spec 삭제 방지, 간선 연결 선택지·선후 전환·안내.

**미실행(숨기지 않음):**
- 새 필드(재료 spec·간선 연결·완제품)의 **실서버 쓰기 라이브 검증** — 미실행. 가짜 서버(0.6.0 규칙 모델링)로만 검증.
- DEMO-WIRE 프로젝트 화면 확인(자산 118건·dock 필터·제품 6종·P04 분기 표시) — 미실행.
- 브라우저 수동 화면 확인(스크린샷)은 이번 단계에서 하지 않았다.

## 4. 계약·상대 영역 영향
- 계약 변경 요청 없음(0.6.0 그대로 소비). 새 API 가정 없음.
- Backend: 요구 조치 없음. 응답 요청은 `request-from-frontend.md`의 BE-REQ-018·019·020 답변 참조(`확인(BE)` 대기). 0.6.0 규칙(VAL-SPEC-*, VAL-GRAPH-005/014)과 FE 가짜 서버 규칙이 일치하는지는 라이브 쓰기 검증으로 닫아야 한다.
- 주의: FE-02a·02b에서 0.6.0 이전 코드로 저장한 draft가 있다면 새 필드가 지워졌을 수 있다(FE는 P-006·P-007 시험 제품에만 저장함; DEMO-WIRE에는 쓰지 않음).

## 5. 통합 검증 담당자의 재검증 방법
1. `pnpm install --frozen-lockfile` 후 `frontend/`에서 위 표의 5개 명령(typecheck·lint·test·check:api·build) 재실행.
2. 개발 서버가 있으면: `$env:LIVE_API="http://127.0.0.1:8000/api/v1"; pnpm test:live`(읽기). 쓰기 검증은 시험 제품 P-006 초안 한정, `LIVE_WRITE=1`(공유 DB에 흔적이 남으므로 사용자 허락 필요).
3. 수동: `VITE_DATA_SOURCE=api`로 공정 편집 화면에서 (a) 단계 이름만 고쳐 저장 → 재조회 시 `material_specs`·간선 연결·완제품 지정 유지, (b) 완제품 노드 선택 해제 후 저장 → 경고 VAL-GRAPH-014, (c) 연결된 spec 삭제 버튼 비활성.
4. 새 필드를 보존하지 않는 회귀가 생기면 `tests/unit/processPreserve.test.ts`가 실패해야 한다.

## 6. 후속·열린 질문
- 사용자 결정 대기: 복제 기준 선택·버전 비교(diff) UI를 만들지(BE-REQ-018), 프로젝트 생성·수정 연동 순서.
- 새 필드 실서버 쓰기 검증과 DEMO-WIRE 읽기 확인을 다음 작업 초입에 수행(허락 범위 확인 필요).
- 반응형 레이아웃은 보류(전체 화면 기준).
