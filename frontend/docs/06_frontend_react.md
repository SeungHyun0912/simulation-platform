> 워크스페이스 재배치본 v1.1.0 / 2026-10-23. 경로 변경은 구조 결정이며, 업무 규칙과 기술 제안의 승인 상태는 승격하지 않습니다.

# 06. React 프런트엔드 개발 기술서

> 선행: 02 ERD → 03 DTO → 04 API.
> UI는 DB의 모든 테이블을 그대로 한 화면씩 노출하지 않는다.
> React는 사용자 선택, TypeScript와 이하 라이브러리는 제안이다.

## 1. 기술 구성

| 영역 | 제안 | 비고 |
|---|---|---|
| 앱 | React + TypeScript | 타입 검증과 컴포넌트 분리 |
| 빌드 | Vite | 개발/빌드 도구로 채택 제안 [S10](../../docs/reference/99_sources.md#s10) |
| 서버 상태 | TanStack Query | project/version 포함 query key [S11](../../docs/reference/99_sources.md#s11) |
| 공정 그래프 | React Flow (@xyflow/react) | node/edge/handle 편집 [S12](../../docs/reference/99_sources.md#s12) |
| 로컬 편집 상태 | React reducer 우선 | 복잡해질 때 별도 store ADR |
| 폼 | typed form + 서버 검증 매핑 | 특정 폼 제품은 아직 고정하지 않음 |
| 라우팅 | 경로 기반 router | /projects/:id 하위 일관된 scope |
| 테스트 | Vitest + browser E2E 도구 | Vitest 근거 [S18](../../docs/reference/99_sources.md#s18), E2E 제품 선택 별도 |
| 스타일 | 공통 디자인 토큰·접근성 컴포넌트 | 라이선스 검토 후 UI kit 선택 |

exact 버전과 Node 버전은 착수 시 호환표 확인 및 lockfile 고정.
플랫폼 기술서가 최신 package 버전을 자동 선택하라는 의미는 아니다.

## 2. 폴더 제안

```text
src/
  app/           # router, providers, auth bootstrap
  generated/     # OpenAPI 생성 타입/클라이언트, 직접 수정 금지
  features/
    projects/
    assets/
    products/
    processes/
    scenarios/
    runs/
    wiki/
    questions/
    layouts/
  shared/
    api/
    units/
    components/
    hooks/
    validation/
  test/
```

feature 간 직접 DB shape 공유 대신 공통 DTO/adapter.
서버 상태·로컬 폼·선택 상태를 분리하고 중복 상태를 줄이는 방향으로 설계한다.
React 공식 지침도 모순·중복·불필요한 상태를 줄일 것을 설명한다. [S09](../../docs/reference/99_sources.md#s09)

## 3. 화면 목록

| 화면 | 핵심 기능 | 우선 |
|---|---|---|
| 프로젝트 목록/생성 | 범위·사업체·복사·보관 | A |
| 프로젝트 홈 | 제품·설비·미정·최근 실행 요약 | A |
| 자산 목록 | 설비/공간/도킹 필터, 코드/이름, 그룹 | A |
| 자산 상세 | IN/OUT, 버전별 용량·정책, 별칭, 미정 | A |
| 제품 목록/상세 | 규격·원자재·완제품 판정 | A |
| 공정 표 편집 | 투입·산출·시간·설비·다음 위치 | A |
| 공정 그래프 편집 | IN/OUT handle, 분기·합류·재방문 | A2 |
| 검토/승인 | 버전 diff, 검증 오류, 승인/반려 | A |
| 위키·질문 | 근거·버전·초안 구분 | B |
| 시나리오 작성 | 입고·WIP·물량·근무·가정·버전 선택 | C |
| 실행 목록/상세 | 큐·실행·취소·오류·로그 | C |
| 결과·비교 | 지표·단위·기간·조건 차이 | C/D |
| CAD/배치 | 배경 도면·매핑·포트·통로 편집 | E |

초기 입력은 표 편집을 먼저 완성하고 드래그 그래프를 후속으로 붙인다.
보기만 가능한 예쁜 그래프를 구현하고 구조화 저장을 나중에 억지로 맞추지 않는다.

## 4. 프로젝트 격리

모든 목록·상세 query key:
```typescript
["project", projectId, "processVersion", versionId, "graph"]
["project", projectId, "run", runId, "metrics", filters]
```

- project 전환 시 요청 cancel, 이전 cache 표시 금지, 로컬 unsaved draft 처리.
- 이전 project ID를 closures/form default에 남기지 않음.
- URL의 project_id와 현재 context 불일치 시 새 scope로 reset.
- 다른 project의 run/version ID를 붙인 URL은 서버 거부를 그대로 표시.
- 대화창도 project에 고정. 프로젝트 전환 시 이전 질문 context 재사용 금지.
- project color/breadcrumb를 상시 표시하여 운영자 오입력 방지.

## 5. 자산 편집

설비:
- 이름/표시 코드/유형/모델/그룹.
- IN/OUT은 필수 고정 포트, UI에서 일반 edge처럼 삭제 불가.
- 포트 위치 unknown 표시. 미배치라도 생성 가능.
- 용량 unknown/finite/unlimited/not_allowed 선택.
- 설비 가용성·reservation·OUT blocking 정책은 설정 버전 내 관리.

저장공간:
- storage/dock 구분, alias.
- 저장 용량과 접근 위치를 다른 섹션에 표시.
- ST-021/022 도킹이 있다는 이유로 적재 용량을 자동 무제한 처리하지 않음.

코드 변경은 자산 연결을 끊지 않음. ID는 UI에서 읽기전용.
기존 데이터에 새 코드 부여는 “정렬 변경”과 별도 기능으로 둔다.

## 6. 공정 편집

표 열:
순서/공정명/설비후보/투입길이·중량·수량·가닥/산출 규격·수량/
선속 또는 시간/준비 trigger/다음 위치/이동/잔량/확인상태.

정수 수량과 decimal 길이 입력 컴포넌트를 분리.
m/min vs min/unit vs min/reference-length 모드 선택으로 모호한 단위 텍스트 줄임.
UNKNOWN 필드는 빈 값만 보이지 않고 “미정” 배지 표시.
0분 입력을 삭제하지 않음. 사용자가 field를 clear하면 unknown 사유 요청.
그룹 후보와 선택된 특정 설비를 명확히 구분.

산출 예시:
- 길이 분할: 2,000m → 1,000m × 2
- 지정 산출: 투입13개 → 4,000m × 10, 추상화 경고
- 유지: 입력 규격 참조, 수량1
- 보빈별 인계와 전체 인계를 별도 선택

## 7. 그래프 편집

node:
- operation: IN/OUT handle, 선택 설비군, 처리 모드 요약
- buffer: ST 코드·용량·확인상태
- source/sink: 시작·종료
- join: 전체 준비 조건
- milestone: 완제품/검사/적재 상태

edge:
- material: 이동/대기 정책
- supply: 직결 공급, 일반 운반과 색상·범례 구분
- precedence: 완료 의존성 점선

동일 EQ-036을 여러 operation node에 보여도 asset_id는 동일.
ST-012 재방문 노드도 동일 space asset_id, 서로 다른 step context.
그래프의 좌우 배치는 공장 실제 방향이 아니다.
React Flow position을 port_placement에 복사하는 기능 금지.
save는 graph PUT 한 번, dangling edge 임시 편집 허용하되 서버 승인 시 검사.
키보드 접근/표 대체 편집 제공. 줌/큰 그래프 필터/제품별 보기 지원.

## 8. 동시 편집·승인

서버 row_version/ETag 유지.
다른 사용자가 수정했으면 자동 덮어쓰기 금지, diff/reload/copy draft 선택.
저장 성공 전 승인 버튼 중복 실행 차단.
approved route는 read-only, “복사하여 수정” 동작.
인증 editor라고 곧 reviewer가 되는 것은 아님.
서버 validation field_path를 그래프 노드와 폼 필드로 연결.
warning과 error, 실행 차단과 지식 승인 가능을 다른 배지로 표시.

## 9. 시나리오·실행

Wizard:
1. 제품/공정 승인 버전 선택.
2. 자산 revision·배치 version pin.
3. 투입 물량/입고 주기/초기 WIP.
4. 근무·실행 기간/목표/seed.
5. UNKNOWN 해결: 실제 입력 vs 가정.
6. validation report 확인.
7. 가정 목록 개별 승인 및 실행 요청.

명시 가정 예:
“테스트에서만 운반시간 0분”, “검증용 EQ-034 하나 사용”.
마스터를 자동 수정하지 않는다.
pending/running/cancel_requested/cancelled/failed/stalled/limit_reached/completed 구분.
retry POST는 항상 idempotency key 관리, 브라우저 재시도 중복 실행 방지.

## 10. 결과 화면

- 생산 완료/검사 완료/적재 완료 보빈 수·길이 별도.
- 가동률은 기간/분모/상태 포함 여부 보여 줌.
- 길이 폐기와 중량 폐기 분리.
- abstract_yield 작업 포함 시 원자재 효율 신뢰 경고.
- 이벤트의 sim_time_min과 server timestamp 분리.
- incomplete/stalled run에도 부분 결과 조회 가능하나 성공 배지 금지.
- compare는 입력 diff 먼저, 지표 차이 다음.
- 질문 버튼은 선택 run ID/metric context 전달; 전체 event payload 전송 금지.

## 11. 위키·LLM

- 답변마다 project/version/run 근거 표시.
- 승인된 데이터만 기본, 초안 포함은 권한·명시 토글.
- 모르는 답은 미정으로 표시. 자동값 채우기 버튼 금지.
- 도구 실패·모델 장애·권한 거부를 서로 다른 상태로 표시.
- 문서에서 생성한 값과 수동 설명을 구분.
- LLM 출력 HTML/Markdown은 안전 렌더링; 임의 script/iframe 실행 금지.

## 12. CAD 후속

- 원본 좌표와 화면 좌표 adapter, 모델 단위 표시.
- CAD에서 찾은 위치는 candidate 배지.
- IN/OUT 방향 제안은 사용자가 확인하기 전 actual로 저장 금지.
- 공간 polygon/통로 graph/설비 footprint를 레이어로 분리.
- 팬·줌·선택 좌표·원본 entity path·증거 보기.
- 수백만 원시 DXF 객체를 React 컴포넌트로 한꺼번에 렌더링하지 않음.

## 13. 프런트엔드 인수 기준

- [ ] project 전환 cache 누출 없음
- [ ] 표↔그래프 round-trip 값/관계 일치
- [ ] known0/unknown/unlimited 구분 보존
- [ ] 1,000m/보빈과 1,000m/min 혼동 방지
- [ ] 같은 설비 재방문 표현 정상
- [ ] 승인 불변·ETag 충돌 표시
- [ ] 역할별 버튼 숨김과 서버 거부 모두 테스트
- [ ] run polling 재접속/취소 상태 정확
- [ ] DB enum 미지원 값에 안전한 오류 표시
- [ ] 한국어·영문 코드만 표시, 잘못 생성된 한자/일본어 없음


---
기술 참조 [Sxx]의 공식 주소와 확인 범위: [99_sources.md](../../docs/reference/99_sources.md).
