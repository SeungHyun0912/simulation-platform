# FE 안내서: contract 0.2.0 (자산 버전·용량) 연동

- 상태: 검토 요청 · 작성: Backend · 대상: Frontend 담당 · 2026-10-23
- 기준: `contracts/contract-status.json` → contract **0.2.0**, openapi sha256 `da54371140b994aca48a9ac19653785d6dbc674bde959615a9d4964efdc2a33a`, 기준 commit `e2f3bba`
- 정본: [openapi.json](../../contracts/openapi.json) · 규칙 설명: [04 §3.1·§3.2](../../contracts/04_api_contract.md) · 예제: [examples/first-scope](../../contracts/examples/first-scope/) · 변경 기록: [CHANGELOG](../../contracts/CHANGELOG.md)
- 이 문서는 FE-00b/FE-00e 인계 시점의 코드(`frontend/src/**`)를 읽고 작성했다. 코드가 바뀌었으면 파일명 기준으로 읽는다.
- Backend는 `frontend/**`를 수정하지 않았다. 아래는 제안이며 구현 순서·구조는 FE가 정한다.

## 1. 한눈에 보기
| 구분 | 내용 |
|---|---|
| 호환성 | 0.1.0 client와 **호환**(필드 추가만). 다만 *화면이 가정한 것* 중 바꿔야 할 항목이 있다(§2) |
| 신규 | 자산 버전(revision) API 7개, 자산 응답의 `current_revision`·`latest_revision`, 오류 코드 3개 |
| 가장 큰 영향 | ① 설비 용량이 **포트별** ② 자산 기본 정보와 용량이 **서로 다른 리소스·ETag** ③ 편집 잠금은 버전(draft)에만 적용 |
| 실제 연동 전제 | 운영 인증 미정 → 로컬 `X-Debug-User` 모드 백엔드만 사용 가능(§4) |

## 2. 영향 분석 (현재 FE 코드 ↔ 계약)
우선순위: **A**=잘못 구현되면 데이터·UX가 틀림, **B**=필요 기능, **C**=정리.

| # | 우선 | 현재 FE (파일) | 계약 0.2.0 | 필요한 변경 |
|---|---|---|---|---|
| 1 | A | `AssetDetailPage`: `readOnly = base.status !== "draft"`로 **코드·이름·모델·그룹까지** 잠금 | 자산 기본 정보는 버전이 없는 리소스라 **항상 편집 가능**. 잠기는 것은 버전의 용량·정책·notes뿐 | 잠금 기준 분리: 기본 정보=항상(권한 viewer만 읽기 전용), 용량·정책=`revision.status==="draft"` |
| 2 | A | `AssetView` 하나에 기본 정보+용량+`status`를 합쳐 한 번에 저장 | 두 리소스: `PATCH /assets/{id}`(자산 ETag), `PATCH /asset-revisions/{rid}`(버전 ETag) | 뷰 모델 분리(자산 / 버전). 저장은 **변경된 쪽만** 요청, 각자 `If-Match`. 둘 다 바뀌었다면 순차 요청·부분 실패(한쪽만 저장됨)를 사용자에게 알림 |
| 3 | A | 설비도 단일 "대기 용량"(`AssetView.capacity`) | 설비는 **IN/OUT 포트별** `buffer_capacity`, 공간(storage/dock)은 `storage_capacity` 하나. 공간의 ACCESS 포트에는 정책 없음 | 설비: IN/OUT 용량 입력 2개(+규칙 UI), 공간: 저장 용량 1개. 라벨은 "IN 대기 용량"/"OUT 대기 용량" |
| 4 | A | `KnownValueInput`: 값 모드 이름 `value`, 숫자 `"0"` 허용(`/^\d+(\.\d+)?$/`) | 모드 `finite`. **`finite`는 0 초과**, 개수 단위는 정수(선행 0 불가), `kg`·`m2`는 소수 6자리까지. 0 의미의 "대기 안 함"은 `not_allowed` | 어댑터에서 `value`↔`finite` 변환. 값 검증을 계약에 맞춤(0·`007`·소수 7자리 오류, 문구: "0은 용량이 될 수 없습니다. 대기 적재를 허용하지 않으면 '대기 불가'를 선택하세요") |
| 5 | A | 모드가 `value`가 아니어도 선택한 단위를 유지(`unit` 보존) | `finite`가 아니면 `value`·`unit` **둘 다 null**(보내면 422). `status`는 보낼 필요 없음 | 요청 직전 어댑터가 `finite` 외 모드의 `unit`을 제거. `status`는 보내지 않음. `not_applicable` 모드는 용량에 쓸 수 없음(현재 `CAPACITY_MODES`가 이미 제외 — 유지) |
| 6 | A | 화면 `VersionStatus = draft\|in_review\|approved\|archived` | 서버 상태 `draft\|in_review\|approved\|superseded`. `archived`는 아직 서버가 쓰지 않음 | `VersionStatusBadge`에 `superseded`("대체됨") 추가. 모르는 값은 기존처럼 "알 수 없음" 유지 |
| 7 | A | 저장 충돌: `ConflictNotice` 한 종류 | 리소스별 412 `EDIT_CONFLICT`. 전이(제출·승인·반려)도 `If-Match` 필수, 불일치 412 | 충돌 알림이 **어느 리소스**인지 구분(자산/버전). 기본 정보 충돌 시 버전 입력은 보존, 그 반대도 동일 |
| 8 | B | 없음 | 서버 계산 `issues[]` = `{severity, rule_id, entity_id, field_path, message, resolution?}` | `ValidationPanel`에 그대로 전달(필드가 호환: `severity`, `rule_id`, `field_path`, `message`). `field_path`는 JSON Pointer(`/ports/0/buffer_capacity`, 인덱스는 응답 `ports` 배열 기준 = IN, OUT). 클라이언트 자체 검증 경고(현재 화면의 용량 미정·단위 경고)와 **중복 표시 주의** → 서버 `issues`를 정본으로 |
| 9 | B | 없음 | `dispatch_rule`/`release_rule`(mode, reservation, wait_at_in_if_busy, block_machine_while_waiting) | 포트별 규칙 입력 UI 신규. `reservation`·`block_machine_while_waiting`은 **미정(unknown)을 선택지로 유지**(OPEN-003). 공통 컴포넌트에 없는 패턴이므로 `frontend/AGENTS.md` 규칙대로 확장 제안을 먼저 기록 |
| 10 | B | 저장·승인 버튼 비활성("계약 필요") | `submit`(admin·editor), `reject`·`approve`(**admin만**), reject는 사유 필수 | 버튼 노출은 `/me`의 `projects[].role`로 정하되 최종 판정은 서버(403 처리). 반려 사유는 `ConfirmDialog` 확장 또는 입력 다이얼로그. 승인/반려 후 즉시 서버 응답으로 화면 갱신 |
| 11 | B | "초안이 아닌 버전은 수정할 수 없습니다. 복사하여 수정…" 안내문 | "복사하여 수정" = `POST /assets/{id}/revisions`(승인본 값을 복사한 새 초안). 열린 버전(draft/in_review)이 있으면 409 `REVISION_DRAFT_EXISTS` | 버튼 "새 초안 만들기". 409면 `latest_revision`의 열린 버전으로 이동 |
| 12 | B | 자산 생성 후 용량 편집 흐름 없음 | 자산을 만들어도 **버전은 자동 생성되지 않음**(`latest_revision=null`) | 자산 상세에서 `latest_revision==null`이면 "용량 설정 시작"(= `POST …/revisions`). 생성 직후 자동 호출은 FE 선택 |
| 13 | B | 목록 컬럼 `capacity`, `status`, `group`(상세), `model` | 목록 API에 **용량·그룹 없음**. 상태는 `latest_revision.status`(없으면 "버전 없음"), 현재값은 `current_revision`. 모델은 `equipment.model_name` | 용량 컬럼 제거(또는 "상세에서 확인"), 그룹 필드·필터 제거(그룹 API 후속), 상태 컬럼은 요약 필드 사용 |
| 14 | B | 정렬·검색을 클라이언트에서 처리(`localeCompare`) | 서버: `sort=sort_order\|code\|name`(`-` 접두), `q`(code/name, 대소문자 무시), `kind`, `include_archived`, `limit`≤200, `cursor`. **상태·모델 정렬/필터는 서버 미지원** | 서버 정렬·검색·cursor로 전환, 지원하지 않는 컬럼의 정렬 비활성. 서버 정렬 순서는 DB 정렬 규칙이라 `localeCompare("ko")`와 다를 수 있음 |
| 15 | C | `PortView = {kind, placement}` | `Port = {id, port_key, role, label}`. 위치(placement)는 API에 없음 | `role`↔`kind` 이름 변경, `placement`는 계속 FE 기본 표시("위치 미정")로 유지. 버전 PATCH에는 `port.id`가 필요(`ports[].port_id`) |
| 16 | C | 샘플 프로젝트 id `demo-a`(문자열) | 모든 `project_id`·`asset_id`는 **UUID**. 비UUID 경로는 422 | 실제 모드의 프로젝트 목록은 `GET /me`(또는 `GET /projects`)에서 가져오고 저장된 선택값은 신뢰하지 않음(권한 없는 프로젝트는 404) |
| 17 | C | `queryKeys.projectKey(projectId, …)` | 리소스가 늘어남 | 키 예: `projectKey(p,"assets",{list params})`, `projectKey(p,"asset",id)`, `projectKey(p,"asset-revisions",assetId)`, `projectKey(p,"asset-revision",rid)`. 변경 성공 시 해당 revision·asset(요약 필드가 바뀜)·assets 목록·revisions 목록 무효화 |
| 18 | C | `VITE_ENABLE_MOCKS` | 승인 예제가 `contracts/examples/first-scope`에 있음 | Mock/MSW 응답을 이 예제에서 만들고, Mock 상태를 화면에 명시(루트 AGENTS §5). 예제의 UUID·시각은 치환값 |

### 오류 코드별 UX 권장
| code (HTTP) | 의미 | 권장 화면 처리 |
|---|---|---|
| `EDIT_CONFLICT` (412) | 다른 곳에서 먼저 수정 | `ConflictNotice`(다시 불러오기 / 계속 편집). 자동 덮어쓰기 금지 |
| `PRECONDITION_REQUIRED` (428) | `If-Match` 누락 | **FE 버그 신호**. 사용자에게 노출하지 않고 로깅 |
| `VERSION_IMMUTABLE` (409) | 초안이 아닌 버전을 수정 | 읽기 전용 전환 + "새 초안 만들기" 안내 (누군가 제출·승인한 직후 발생 가능) |
| `REVISION_DRAFT_EXISTS` (409) | 이미 열린 버전 있음 | 열린 버전으로 이동 |
| `INVALID_STATE_TRANSITION` (409) | 이미 처리된 전이 | 새로고침 안내 |
| `VALIDATION_ERROR` (422) | 요청 형식 | `details[].field_path`를 폼 필드에 매핑(`/ports/0/buffer_capacity/value`, `/storage_capacity/value` 등). 본문 전체 규칙은 `/` |
| `ASSET_CODE_CONFLICT` (409) | 코드 중복 | 코드 필드 오류 |
| `FORBIDDEN` (403) | 역할 부족 | 권한 안내(버튼은 미리 숨기되 서버 응답을 신뢰) |
| `NOT_FOUND` (404) | 없음 **또는** 접근 불가(구분 안 함) | "찾을 수 없습니다" 단일 화면 |
| `UNAUTHENTICATED` (401) | 인증 필요 | 인증 화면/안내(운영 인증 방식 확정 전에는 개발 모드 안내) |

## 3. 응답 ↔ 화면 모델 대응 (제안)
| 화면(AssetView) | API 위치 |
|---|---|
| `id`, `code`, `name`, `kind` | `Asset.id/code/name/kind` |
| `model` | `Asset.equipment.model_name` (설비만) |
| `group` | **없음**(후속) — 필드 제거 |
| `ports[].kind` | `Asset.ports[].role` (+ `id`, `port_key`, `label`) |
| `status` | 자산에는 없음. 버전: `AssetRevision.status` / 요약: `Asset.latest_revision.status`, `Asset.current_revision` |
| `capacity`(설비) | `AssetRevision.ports[role=IN|OUT].buffer_capacity` |
| `capacity`(공간) | `AssetRevision.storage_capacity` |
| `KnownValue{mode,value,unit}` | `Capacity{mode,value,unit,status}` — `value`→`finite`, 그 외 모드는 value/unit null |
| 규칙 | `AssetRevision.ports[].dispatch_rule/release_rule` |

용량 어댑터 규칙(요청): `{mode:"value",value,unit}` → `{mode:"finite",value,unit}` / 다른 모드 → `{mode}` 만(unit 제거).
응답: `finite` → `{mode:"value",value,unit}` / 그 외 → `{mode, value:"", unit: 선택값 유지}`. 숫자는 항상 **문자열**로 주고받는다(JS number 금지).

## 4. 실제 API로 개발하기 (로컬)
1. 백엔드 실행(백엔드 담당 안내): PostgreSQL(WSL `docker compose up -d postgres`) → migration `alembic upgrade head` → `AUTH_MODE=local`로 uvicorn.
   - 개발 DB(`simulation_platform`)에는 migration을 **아직 적용하지 않았다.** 적용은 사용자 승인 후 Backend가 수행한다.
2. 개발용 사용자·프로젝트 시드: `python scripts/seed_dev_data.py --yes` (backend/에서, 멱등). 출력되는 `project_id`와 `X-Debug-User` 값(admin/editor/viewer 3종)을 사용한다.
3. **브라우저 번들에 사용자 id를 넣지 않는다.** `VITE_*` 변수는 번들에 노출되므로 쓰지 말고, Vite dev proxy가 헤더를 붙이게 한다:
   ```ts
   // vite.config.ts (예시, FE가 결정)
   server: { proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true,
     headers: { "X-Debug-User": process.env.DEV_DEBUG_USER ?? "" } } } },
   ```
   `DEV_DEBUG_USER`는 `VITE_` 접두사 없는 셸 환경변수다(서버 측 설정이라 번들에 포함되지 않음). 역할 전환 테스트는 값만 바꿔 재시작한다.
   프록시를 쓰면 CORS 설정이 필요 없다(백엔드는 CORS 미들웨어를 아직 두지 않았다).
4. 이 로컬 인증은 **계약이 아니다**. 운영 인증 방식(TECH-002)이 정해지면 FE 인증 부트스트랩이 바뀐다.

## 5. 권장 작업 순서 (FE-01 쪼개기 제안)
| 단계 | 내용 | 선행 |
|---|---|---|
| FE-01a | generated client/types 생성 도구 결정(ADR) → `openapi.json`로 생성, **계약 hash를 생성물에 기록**. fetch 래퍼: 오류 envelope 파싱, `ETag` 보관, `If-Match` 부착, `X-Request-ID` 로깅 | 없음 |
| FE-01b | 프로젝트 선택(`/me`)·자산 목록/상세(기본 정보)·생성·수정 연동(0.1.0 범위). 서버 정렬·검색·cursor, 상태 미리보기(`usePreviewState`) 제거 | FE-01a |
| FE-01c | 버전 **읽기**: 목록·상세·issues 표시, 용량 어댑터(`KnownValue`↔`Capacity`), 포트별 용량 표시, 상태 배지 | FE-01b |
| FE-01d | 버전 **편집·워크플로**: 용량·규칙 입력, 제출/반려/승인, 새 초안, 충돌·권한·불변 오류 처리 | FE-01c, 규칙 UI 확장 제안 승인 |
| INT-01 | 실제 연동 테스트(격리·충돌·권한) — 조정자 | FE-01d |

각 단계는 작업 보드의 FE 행으로 조정자가 배정한다(Backend는 `TASK_BOARD.md`의 FE 행을 수정하지 않았다).

## 6. 계약이 바뀌었을 때의 전달 절차 (앞으로)
1. Backend가 CR → 승인 → 코드 → `export_openapi` → `contracts/openapi.json`·`contract-status.json`(version/hash/baseline)·`CHANGELOG.md` 갱신.
2. 백엔드 계약 테스트가 스냅샷·해시·예제 불일치를 실패로 막는다(FE는 이 파일들만 신뢰하면 된다).
3. FE는 세션 시작 시 `contract-status.json`의 `contract_version`/`openapi_sha256`이 **마지막으로 반영한 값**과 다른지 확인하고, 다르면 `CHANGELOG.md`의 해당 항목 → client 재생성 → 타입 오류 수정 → 테스트 순으로 진행한다.
4. 호환성이 깨지는 변경은 CHANGELOG에 "호환성: 비호환"과 마이그레이션 방법을 먼저 적고 조정자 확인을 받는다.

## 7. FE가 결정·확인해야 할 것
- 설비 상세의 용량 UI 구조(포트별 섹션 2개 + 규칙 입력)와 규칙 입력 컴포넌트 확장 제안.
- 자산 기본 정보와 버전 편집을 한 화면에서 저장할 때의 UX(버튼 하나로 두 요청 vs 섹션별 저장). Backend 권장: **섹션별 저장**(ETag·충돌·부분 실패가 단순).
- 목록의 용량 컬럼 대체안(제거 vs 상세 링크 vs 후속 API 요청). 필요하면 `?include=current_revision` 같은 확장은 별도 CR로 요청.
- generated client 도구 선택(현재 `package.json`에 없음).

## 8. FE 세션 시작 프롬프트 (붙여넣기용)
```text
루트 README.md, AGENTS.md, frontend/AGENTS.md를 먼저 읽으세요. 이전 대화 기억은 없습니다.
contracts/contract-status.json의 contract_version(0.2.0)과 openapi_sha256을 확인하고,
contracts/CHANGELOG.md의 0.2.0 항목, docs/handoffs/HANDOFF-backend-20261023-BE-02-for-frontend.md를 읽으세요.
이 안내서의 §2 표를 현재 frontend/src 코드와 대조해 실제로 필요한 변경 목록·수정 예정 파일·테스트 계획을 먼저 보고하고,
승인 후 §5의 FE-01a부터 작은 단위로 진행하세요. 계약·backend/**는 수정하지 말고 필요하면 docs/change-requests/에
CR-frontend-... 파일로 요청하세요. 실행하지 않은 테스트는 미실행으로 보고하세요.
```
