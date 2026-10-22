> 워크스페이스 재배치본 v1.1.0 / 2026-10-23. 경로 변경은 구조 결정이며, 업무 규칙과 기술 제안의 승인 상태는 승격하지 않습니다.

# 04. 공통 API 계약

> PROPOSED. Backend가 OpenAPI 후보를 만들고 계약 담당자가 검토·승인한 스냅샷으로 Frontend 타입/클라이언트를 생성한다. 정식 파일은 contracts/openapi.json이며 현재 미생성이다.
> FastAPI는 OpenAPI 기반 API 명세 생성을 제공한다. [S04](../docs/reference/99_sources.md#s04)
> URL 아래의 p/v/r은 각각 project_id/process_version_id/run_id를 나타내는 설명용 표기다.

## 1. 공통 규약

- base: `/api/v1`
- 외부 business API는 project path 필수: `/projects/{project_id}/...`
- 인증 주체와 조직/프로젝트 멤버십은 서버에서 확인.
- 프로젝트 객체를 못 찾거나 접근 권한이 없으면 외부에는 동일한 404 정책을 적용할 것을 제안.
- 목록: `limit`, `cursor`, 허용된 `sort`, `q`, `status` 필터. max limit=200 초기 제안.
- 숫자 단위는 필드명과 DTO에 명시.
- 실제 시각 ISO8601 UTC, UI에서 KST 변환.
- `X-Request-ID` 응답, 사용자 입력 request ID 검증.
- 수정 응답 `ETag: "17"`; 변경 요청 `If-Match: "17"`.
  버전 누락 428, 불일치 412. 마지막 저장 승리 방식 금지.
- 실행/복사/가져오기 POST: `Idempotency-Key`.
  동일 키+동일 body는 기존 결과, 동일 키+다른 body는 409.
- validator 규칙의 결과는 단순 HTTP 성공과 분리. `/validate`는 오류 목록이 있어도 정상 검증 처리면 200.
- 별도 계약 없는 순서 의존 bulk write 금지.

## 2. 오류 응답

```json
{
  "error": {
    "code": "RUN_VALIDATION_FAILED",
    "message": "필수 실행 조건이 미정입니다.",
    "request_id": "req-demo",
    "details": [
      {
        "severity": "error",
        "rule_id": "VAL-TIME-003",
        "entity_id": "00000000-0000-4000-8000-000000000001",
        "field_path": "/timing_rule/processing/output_schedule",
        "message": "멀티신선 산출 방식이 미정입니다.",
        "resolution": "확정값 입력 또는 시나리오 가정 승인"
      }
    ]
  }
}
```

기타 코드:
PROJECT_SCOPE_MISMATCH, VERSION_IMMUTABLE, PRECONDITION_REQUIRED,
EDIT_CONFLICT, UNSUPPORTED_HANDLER, MISSING_ASSUMPTION_ACK,
NETWORK_ROUTE_NOT_FOUND, INVALID_UNIT, IDEMPOTENCY_CONFLICT, JOB_CANCEL_TOO_LATE.
프레임워크 기본 validation 오류도 위 envelope로 변환.

## 3. 프로젝트·기준정보 API

| Method | Path | 역할 / 결과 |
|---|---|---|
| GET | /me | 인증 사용자·허용 조직·프로젝트 |
| GET/POST | /projects | 권한 범위 목록 / 생성 |
| GET/PATCH | /projects/{p} | 조회 / 설정 변경 |
| POST | /projects/{p}/archive | 보관 |
| POST | /projects/{p}/clone | 복사 job 202, ID 재매핑 |
| GET/POST/PATCH/DELETE | /projects/{p}/members[/{id}] | 관리자만 역할 관리 |
| GET/POST | /projects/{p}/groups | 그룹 목록/생성 |
| PATCH | /projects/{p}/groups/{id} | 이름·부모 변경 |
| PUT | /projects/{p}/groups/{id}/assets | 매핑 일괄 교체 |
| GET/POST | /projects/{p}/assets | kind 필터, 자산 생성 |
| GET/PATCH | /projects/{p}/assets/{id} | 표시정보 수정; ETag |
| POST | /projects/{p}/assets/{id}/archive | 비활성화 |
| GET | /projects/{p}/assets/{id}/ports | IN/OUT/ACCESS |
| GET/POST | /projects/{p}/assets/{id}/revisions | 버전 조회/초안 생성 |
| GET/PATCH | /projects/{p}/asset-revisions/{id} | 설정 조회/초안 수정 |
| POST | /projects/{p}/asset-revisions/{id}/approve | 검토권한 승인 |
| GET/POST | /projects/{p}/materials | 재료 목록/생성 |
| GET/PATCH | /projects/{p}/materials/{id} | 재료 조회/수정 |
| GET/POST | /projects/{p}/products | 제품 목록/생성 |
| GET/PATCH | /projects/{p}/products/{id} | 제품 조회/표시 수정 |

자산 생성은 kind에 따라 subtype·포트를 원자 생성한다. FE가 포트를 따로 두 번 요청하지 않음.
설비군 candidate qualification 변경은 공정 새 버전에서 수행.

## 4. 공정 버전·그래프 API

| Method | Path | 의미 |
|---|---|---|
| GET/POST | /projects/{p}/products/{id}/process-versions | 목록/새 초안 |
| GET | /projects/{p}/process-versions/{v} | 상태·제품·검증 요약 |
| GET/PUT | /projects/{p}/process-versions/{v}/graph | 그래프 전체 조회/원자 저장 |
| PATCH | /projects/{p}/process-versions/{v}/steps/{step_id} | 공정 상세 수정, 전체 버전 ETag 검사 |
| GET/PUT | /projects/{p}/process-versions/{v}/editor-state | 화면 좌표, 물리 layout 아님 |
| POST | /projects/{p}/process-versions/{v}/validate | knowledge/run_template 구분 |
| POST | /projects/{p}/process-versions/{v}/submit | 검토 요청 |
| POST | /projects/{p}/process-versions/{v}/approve | 승인 |
| POST | /projects/{p}/process-versions/{v}/reject | 반려 사유 |
| POST | /projects/{p}/process-versions/{v}/clone | 새 초안 |
| GET | /projects/{p}/process-versions/{v}/diff?base_id=... | 버전 비교 |

PUT graph 규칙:
1. 권한/If-Match 확인.
2. 모든 client UUID 또는 새 node 임시 key를 검증.
3. 같은 프로젝트/버전 참조인지 검사.
4. DB 트랜잭션 안에 node/step/spec/edge/resource를 함께 저장.
5. 삭제되는 노드에 연결된 edge 처리 명시; 묵시적으로 엉뚱한 연결 생성 금지.
6. new row_version·validation summary 반환.
7. 위키 갱신 outbox 생성. 승인 정보 공개는 승인 이벤트 때만.

## 5. 시나리오·실행 API

| Method | Path | 의미 |
|---|---|---|
| GET/POST | /projects/{p}/scenarios | 목록/생성 |
| GET/POST | /projects/{p}/scenarios/{id}/versions | 버전 조회/초안 |
| GET/PATCH | /projects/{p}/scenario-versions/{id} | 입력·가정·계획 편집 |
| POST | /projects/{p}/scenario-versions/{id}/validate | 사용 자원·경로 기반 실행 검증 |
| POST | /projects/{p}/scenario-versions/{id}/approve | 가정 포함 승인 |
| POST | /projects/{p}/runs | 202, snapshot+run+job 원자 생성 |
| GET | /projects/{p}/runs | 실행 목록 |
| GET | /projects/{p}/runs/{r} | 상태·attempt·진행·종료사유 |
| GET | /projects/{p}/runs/{r}/input | 당시 입력 snapshot |
| POST | /projects/{p}/runs/{r}/cancel | 취소 요청, 실제 취소와 구분 |
| POST | /projects/{p}/runs/{r}/rerun | 동일 snapshot의 새 run |
| GET | /projects/{p}/runs/{r}/events | event_seq cursor, step/asset/item 필터 |
| GET | /projects/{p}/runs/{r}/metrics | 집계 조회, window·definition 포함 |
| GET | /projects/{p}/runs/{r}/items/{item_key}/lineage | 분할·합류·이월 |
| POST | /projects/{p}/comparisons | 승인된 run pair 비교 |
| GET | /projects/{p}/comparisons/{id} | 조건 차이·비교가능성·지표 |

실행 요청:
```json
{
  "scenario_version_id": "00000000-0000-4000-8000-000000000101",
  "seed": 42,
  "replicate_index": 0,
  "assumption_acknowledgments": ["ASM-TRAVEL-001"]
}
```

실행 응답:
```json
{
  "data": {
    "id": "00000000-0000-4000-8000-000000000201",
    "status": "queued",
    "input_hash": "실제_해시로_대체",
    "links": {"status": "/api/v1/projects/.../runs/..."}
  }
}
```

초기 진행 조회는 polling. 실제 동작 검증 후 SSE를 추가해도 됨.
target-based run은 정확한 진행률을 알 수 없으면 percent=null, 현재 시각·생산량 표시.

## 6. LLM·위키 API

| Method | Path | 의미 |
|---|---|---|
| GET | /projects/{p}/wiki | 승인 정보 기본, 권한 있는 초안 토글 |
| GET | /projects/{p}/wiki/{id} | 근거/버전 표시 |
| POST | /projects/{p}/questions | 질문, run/version 선택, 읽기전용 답변 |
| GET | /projects/{p}/conversations/{id} | 프로젝트에 고정된 대화 |
| POST | /projects/{p}/questions/{id}/feedback | 근거성 평가 |

정형 값은 API 계산/조회 결과로 답하고, 모든 수치에 source_ref 연결.
외부 모델 장애 시 실패 메시지와 일반 화면 대체 조회 제공.
확정하지 않은 분석은 fact/hypothesis로 구분.

## 7. CAD·배치 API — 후속

artifact upload init/complete → import job → candidates → mapping approval → layout draft.
`/layouts`, `/layout-versions/{id}`, `/ports`, `/network`, `/validate`, `/approve`.
직접 DWG 지원은 초기 약속 아님. DXF 또는 추출 ZIP 기준, 미지원 형상 보고.
물리 network를 route editor의 임의 노드 좌표로 덮어쓰지 않음.

## 8. API 테스트 계약

- OpenAPI snapshot diff, 변경 시 generated client 갱신.
- 허용되지 않은 enum/NaN/Infinity/음수/모호한 단위 422.
- 다른 프로젝트 UUID로 요청하면 조회/변경 모두 거부.
- 버전 충돌과 승인 직후 PATCH 거부.
- Idempotency-Key 동시 요청은 같은 run 하나 생성.
- 승인 직후 위키 인덱스가 늦더라도 SQL 도구는 올바른 버전 반환.
- 취소/실패 실행 결과를 성공으로 노출하지 않음.


---
기술 참조 [Sxx]의 공식 주소와 확인 범위: [99_sources.md](../docs/reference/99_sources.md).
