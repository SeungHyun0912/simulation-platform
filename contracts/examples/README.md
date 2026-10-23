# 공통 요청·응답 예제

## 승인 scope 예제: first-scope/ (contract 0.1.0, scope project-assets-ports)
`first-scope/*.json`은 [scripts/generate_contract_examples.py](../../backend/scripts/generate_contract_examples.py)가
**실제 API 응답에서 생성**한 예제다(UUID는 `00000000-0000-4000-8000-0000000000NN`, 시각은 `2026-10-23T00:00:00Z`,
request_id는 `req-example`, cursor는 `opaque-cursor-example`로 치환). 실제 고객·인증 정보는 없다.
각 파일은 `{request, response{status, headers?, body}}` 구조이며 Backend 계약 테스트(`backend/tests/contract/test_examples.py`)가
요청·응답 body를 승인 DTO로 검증한다. FE Mock은 같은 파일을 사용한다.

| 파일 | endpoint | 상태 |
|---|---|---|
| project.create.json | POST /projects | 201 (ETag "1", Location) |
| asset.create.equipment.json | POST /projects/{p}/assets (설비, IN/OUT 자동 생성) | 201 |
| asset.create.storage.json | POST /projects/{p}/assets (공간, ACCESS-01 자동 생성) | 201 |
| asset.list.json | GET /projects/{p}/assets?limit=1 (cursor 페이지) | 200 |
| asset.patch.json | PATCH /projects/{p}/assets/{id} | 200 (ETag "2") |
| error.edit-conflict.json | PATCH, 오래된 If-Match | 412 EDIT_CONFLICT |
| error.precondition-required.json | PATCH, If-Match 누락 | 428 PRECONDITION_REQUIRED |
| error.asset-code-conflict.json | POST, 중복 code | 409 ASSET_CODE_CONFLICT |
| error.validation.json | POST, 설비인데 equipment 누락 | 422 VALIDATION_ERROR |
| error.not-found.json | GET, 없거나 접근 불가 자산 | 404 NOT_FOUND |

재생성(스키마가 head인 `_test` DB 필요): `python scripts/generate_contract_examples.py ../contracts/examples/first-scope` (backend/에서).
빈 목록 예제와 프로젝트 목록·`/me` 예제는 아직 없다(후속).

## PROPOSED 예제
error.proposed.json은 업로드한 API 문서의 오류 응답 예제를 그대로 옮긴 것입니다.
상태 PROPOSED, 더미 UUID, 실제 실행 결과/fixture 승인본 아님. 승인 scope 밖(RUN_VALIDATION_FAILED 등)이다.
