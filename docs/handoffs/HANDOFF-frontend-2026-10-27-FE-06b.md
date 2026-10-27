# HANDOFF · Frontend · FE-06b (공정 메뉴·공정 목록 화면)

- 작업 ID: **FE-06b** (사용자 지적: "공정 화면도 개발이 안된 것 같다"). 상태: **구현완료 / 검증대기**
- 브랜치 `worktree-frontend-fe00-n`. 계약 0.9.0 `229cc091…`(변경 없음, 새 API 없음)

## 1. 원인 확인
- 공정 **편집** 화면(`/projects/:id/products/:productId/processes/:versionId`)은 FE-02a~04a에서 구현·연동되어 있었지만 **제품 상세 → 공정 버전 목록으로만 들어갈 수 있었다.**
- 사이드 메뉴 "공정"은 `pending: true`("공정 (준비 중)")로 남아 있었고 `/projects/:id/processes` 경로가 없었다. 제품 목록의 안내 문구도 "공정 화면은 아직 정적 예시"로 낡아 있었다. 그래서 공정이 개발되지 않은 것처럼 보였다.

## 2. 변경
- 신규 `features/processes/ProcessListPage.tsx`(경로 `/projects/:projectId/processes`): 제품별 최신 공정 버전·승인본 요약을 표로 보여 주고(검색·보관 포함·더 보기), 버전 번호가 공정 편집 화면 링크, 공정이 없는 제품은 "제품에서 공정 만들기" 링크. 별도 목록 API는 없고 제품 목록(`GET /products`)의 `current_process_version`·`latest_process_version` 요약을 쓴다(새 API 가정 없음). 불러오기 실패는 오류 안내이며 정적 예시로 대체하지 않는다.
- 사이드 메뉴 "공정"의 준비 중 표시 제거, 라우터 연결. 제품 목록의 낡은 안내 문구 교체.
- 변경 파일: `frontend/src/features/processes/ProcessListPage.tsx`(신규), `src/app/router.tsx`, `src/app/layout/AppShell.tsx`, `src/features/products/ProductListPage.tsx`, `tests/component/api-process-list.test.tsx`(신규 4건), `tests/live/live-process-ui.test.tsx`(읽기 전용 live 1건 추가).

## 3. 자체 테스트(frontend/, 실제 결과)
`pnpm typecheck` 0 · `pnpm lint` 0 · `pnpm check:api` OK(0.9.0) · `pnpm build` 0 · `pnpm test` **552 통과·56 건너뜀** · 읽기 전용 live(8000) `live-process-ui` 4 통과·2 건너뜀(쓰기 구역, 새 목록 테스트 포함).
**미실행:** 브라우저 수동 확인(스크린샷), 쓰기 live.

## 4. 영향·재검증
- 계약·Backend 영향 없음.
- 재검증: `DEV_DEBUG_USER` 지정 후 `pnpm dev` → 프로젝트 선택 → 사이드 메뉴 "공정" → 제품별 공정 버전 표 → 버전 번호 클릭 시 편집 화면. DEMO-WIRE는 제품 P01~P06 모두 최신 버전 draft.

## 5. 후속(사용자 결정 필요)
- 시나리오·실행 화면(메뉴 "준비 중" 유지), 복제 기준 선택·diff UI(BE-REQ-018), milestone 공정 표 편집 UX(DEC-004).
