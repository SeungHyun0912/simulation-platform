# HANDOFF-frontend-2026-10-23-FE-00h
- 상태: 검토 요청
- 역할 / 작업 ID / 관련 로드맵 ID: Frontend / FE-00h(정적 화면을 계약 0.2.0 구조에 정렬, FE-01 준비) / A-01
- workspace 버전: 1.1.0
- branch / 시작 commit / 종료 commit: worktree-frontend-fe00-i / b55c98a(origin/main) / (커밋 후 기록)
- 계약 버전 / OpenAPI hash / 승인 scope: **읽은 계약** 0.2.0 / `da54371140b994aca48a9ac19653785d6dbc674bde959615a9d4964efdc2a33a` / `project-assets-ports`, `asset-revisions`. **코드에 반영한 계약(generated client·API 호출): 없음.** 정적 화면 모델만 0.2.0 구조에 맞췄다.
- 수정 파일: `frontend/**`, `docs/communication/request-from-frontend.md`, `docs/change-requests/CR-frontend-20261023-fe-rule-ui-and-reason-dialog.md`, 이 문서. **계약·backend·`request-from-backend.md`는 수정하지 않았다.**

## 세션 시작 절차 이행 (backend의 "FE 세션 시작 절차")
1. main 기준으로 새 브랜치를 만들어 계약 0.2.0·소통 파일을 받았다.
2. backend worktree의 `request-from-backend.md`(커밋 `d0a9f38`, 아직 main 미병합)를 읽고 R-FE-13 답변을 확인 → `[x]`.
3. BE-REQ-001~011 답변은 이전 작업(FE-COMM-01)에서 작성했고 이번에 BE-REQ-001 진행 현황 표를 추가했다.
4. 새 질문: 없음(버전 목록이 상세와 같은 모양임을 `openapi.json`에서 직접 확인하고 FE 판단으로 기록).
- 확인: backend 파일에는 아직 내 BE-REQ 답변에 대한 `확인(BE)` 기록이 없다(읽은 시점 기준).

## 실제 구현 내용 (정적·예시 데이터, API 호출 없음)
**자산 (BE-REQ-001 #1~#7, #11~#13, #15, #16)**
- 뷰 모델 분리: `AssetInfo`(기본 정보, 자산 ETag) / `RevisionDetail`(상태·용량·규칙·issues, 버전 ETag). 목록 응답의 `current_revision`·`latest_revision` 요약 반영.
- 목록: 용량·그룹 제거, 최신 버전(상태 배지, "버전 없음")·승인본 표시, 정렬은 서버 지원 키(정렬 순서·코드·이름)만.
- 상세: 기본 정보 섹션(역할이 허용하면 항상 편집, 종류·ID 읽기 전용) / 버전 섹션(버전 선택, 상태, 서버 issues, 섹션별 저장·되돌리기) / 설비 포트별 용량(IN·OUT)과 규칙 읽기 전용 / 공간 저장 용량 / 버전 이력(승인 시각은 프로젝트 시간대).
- 편집 가능 조건: 버전은 `draft` + 편집 역할. 승인·검토 중·대체됨 버전은 읽기 전용이며 열린 버전이 있으면 그리로 이동, 없으면 "새 초안 만들기(연동 후)". 버전이 없으면 "용량 설정 시작(연동 후)".
- 충돌 안내가 리소스별("자산 기본 정보" / "용량 버전")이며 한쪽을 되돌려도 다른 쪽 입력이 유지된다.
- 역할별 버튼 노출: 제출 = 관리자·편집자, 승인·반려 = 관리자(검토 중 버전). 모두 "연동 후"로 비활성. 조회자는 전부 읽기 전용.
- `capacityAdapter`(값 있음↔`finite`, finite 외 모드는 value·unit 제거, status 미전송), `validateCapacity`(0·선행 0·소수 7자리·공정 단위 거부), `ruleLabels`(확정 D-U05·D-U06 / 미정 OPEN-003 구분).
- 예시 데이터는 승인 예제(`contracts/examples/first-scope`) 모양 + 상태별 케이스(버전 없음, 초안+승인본, 승인본만, 대체됨 이력, kg 경고, 검토 중 도킹, 미정 저장 용량).
**프로젝트·공통**
- R-FE-13 반영: 생성 폼의 조직 선택지는 관리자 조직만, 없으면 안내, IANA 시간대 검증, 설명 생략.
- R-FE-09: 프로젝트 색은 id 해시(`accentFor`). 예시 프로젝트 id를 UUID로 교체, 경로·전환 메뉴는 프로젝트 **코드** 표시(`useCurrentProject`).
- 공통: `VersionStatusBadge`에 `superseded`, `KnownValueInput`에 `validator` 옵션(공정의 0분은 계속 유효), `ConflictNotice`에 리소스 이름, `ValidationIssue`에 `entity_id`, 시각 표시 `formatDateTime`.
- 확장 제안 문서: `CR-frontend-20261023-fe-rule-ui-and-reason-dialog` (규칙 입력, 반려 사유 입력 창). **승인 전에는 구현하지 않음.**

## 채택 결정과 근거
- 저장은 섹션별(BE-REQ-003 FE 결정). 합성 endpoint 불필요.
- 공통 입력의 0 허용은 그대로 두고 필드별 `validator`로 용량만 0 불허(공정 "준비 0분" 보존).
- 역할 문자열은 모르는 값을 원문 표시, 권한 판정은 서버 403이 정본이며 FE는 노출만 제한.
- 서버 `issues[]`가 정본이므로 연동 모드에서는 FE 자체 경고(미정·item 외 단위)를 쓰지 않는다. 정적 단계에서는 샘플 issues를 보여 주고 형식 오류만 클라이언트가 만든다.

## 미정 또는 임시 가정
- 규칙·용량 모양은 `openapi.json`을 읽고 손으로 쓴 타입이다. 생성 client가 생기면 교체하고 불일치는 어댑터 테스트가 잡도록 해야 한다. 규칙 판별 유니온의 정확한 모양은 FE-01d에서 openapi와 대조한다.
- 역할 라벨은 잠정 역할(admin/editor/viewer) 기준이며 TECH-006 결정 시 바뀔 수 있다.
- 승인 시각 표시 시간대는 프로젝트 시간대를 쓴다(계약은 UTC 제공, 표시는 UI 책임).

## 상대 담당자·사용자에게 필요한 조치
- **사용자 결정:** (1) API 서버 실행 주체(BE-REQ-004), (2) client 생성 도구 승인(FE-01a), (3) 확장 제안 CR 승인 여부, (4) backend 기능 우선순위(BE-REQ-010).
- Backend: 내 BE-REQ 답변 확인(`확인(BE)`), 시드 요청(BE-REQ-006) 검토.

## 실행 증거
| 명령 | 실행 위치 | 환경·버전 | 종료 코드 | 결과·로그 |
|---|---|---|---|---|
| pnpm vite --port 5199 + Edge 헤드리스 스크린샷(1280px) | frontend/ | Edge(설치본), Vite 8.3.5 | 0 | 설비 상세(초안+승인본)·목록 육안 확인, 서버 종료 확인 |
| pnpm typecheck | frontend/ | Node 24.17.0, TS 6.0.3 | 0 | 오류 없음 |
| pnpm lint | frontend/ | ESLint 10.13.0 | 0 | 경고·오류 없음 |
| pnpm test | frontend/ | Vitest 5.0.5 | 0 | 파일 8개, 146개 통과 |
| pnpm build | frontend/ | Vite 8.3.5 | 0 | 빌드 성공 |
| python tools/check_workspace.py | 루트 | Python 3.12 | 0 | PASS(문서·구조만) |

## 미실행 테스트와 이유
- 실제 API 연동·계약 기반 Mock·generated client: 사용자 결정(서버 실행, 도구 승인) 대기. **Backend 서버와의 실제 호환성은 검증하지 않았다**(계약 파일과 예제를 읽고 맞춘 것).
- 브라우저 수동 확인(키보드·포커스·스크린리더·색 대비), 500px 미만 폭, 새 상세 화면의 좁은 폭 레이아웃: 미실행(스크린샷은 1280px의 정상 상태만). QA_CHECKLIST.md 갱신.
- 조회자·편집자 화면의 실제 렌더링은 jsdom 테스트로만 확인.

## 남은 위험·질문
- 상세 화면이 길다(기본 정보·버전·IN·OUT·이력). 사용성 검토 필요(탭이나 접기 등은 승인된 패턴이 없어 도입하지 않음).
- 규칙을 읽기 전용으로만 보여 주므로 현재 화면만으로는 규칙을 바꿀 수 없다(확장 제안 CR 대기).
- 예시 프로젝트 B(조회자)·C(편집자)는 같은 예시 자산을 보며, 실제로는 프로젝트별 데이터가 다르다.

## 다음 세션의 첫 작업
- `request-from-backend.md`(최신 worktree 또는 main)와 `request-from-frontend.md`를 읽고 새 답변 반영.
- 사용자 결정에 따라 FE-01a(client 생성 도구 비교표 제출 → 승인 → 생성 → 계약 hash 기록) 착수.
