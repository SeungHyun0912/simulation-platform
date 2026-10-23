# 계약 관리
상태: **PARTIALLY_APPROVED** — scope `project-assets-ports`만 승인(contract 0.1.0, 승인·해시 기록은
[contract-status.json](contract-status.json)). 그 밖의 원본 제안은 승인 상태로 바꾸지 않았고 PROPOSED입니다.
기준 문서: [도메인 계약](03_domain_contracts.md), [API 계약](04_api_contract.md).
승인 현황의 기계 판독 파일: [contract-status.json](contract-status.json).

## 정식 계약의 생성 경로
1. 조정자가 범위를 선택하고 ERD/필드/권한/단위/오류 의미를 검토합니다.
2. Backend 담당자가 DTO와 endpoint를 구현하고 OpenAPI 후보를 생성합니다.
3. 후보를 backend/artifacts/openapi.candidate.json에 두고 차이·예제를 전달합니다.
4. 조정자가 review 후 contracts/openapi.json으로 승격하고 version/hash/scope를 기록합니다.
5. Frontend가 이 스냅샷을 기준으로 client/types/Mock을 생성합니다.
6. CI는 Backend 재생성 명세와 승인 스냅샷의 의미 차이를 검사합니다(후속 구현).

원본 제안은 Backend 생성형 명세이므로 **정식 JSON과 별도 수동 YAML을 동시에 관리하지 않습니다.**
[openapi.json](openapi.json)은 승인 scope의 11개 operation만 포함하며 Backend의 `export_openapi` 후보(`backend/artifacts/openapi.candidate.json`)를
바이트 그대로 승격한 것입니다(해시는 contract-status.json). 빈 OpenAPI를 만들어 승인된 계약인 것처럼 배포하지 않습니다.
승인 예제는 [examples/first-scope](examples/first-scope/)에 있습니다.
UI 구조 작업은 가능하지만 계약 미정 필드는 임의로 굳히지 않습니다.

## 승인 단위
전체 미래 API를 한 번에 확정할 필요는 없습니다.
scope별로 phase0-project-assets 등을 승인하고 해당 endpoint/DTO/schema/hash를 기록합니다.
승인 scope 밖의 기능은 Mock이어도 PROPOSED 표기를 유지합니다.
전체 문서 버전과 API schema version, 개별 공정 version, run snapshot version은 서로 다릅니다.

## 변경 절차
CR 작성 → 양쪽 영향 검토 → 조정자 승인 → 후보 구현/검증 →
정식 스냅샷·예제·버전 갱신 → FE 재생성 → 실제 연동 테스트.
Enum/null 의미/단위 변경도 호환성 검토 대상입니다.
동일 URL·필드명이라도 의미가 달라지면 breaking change 후보입니다.

## 예제
examples에는 원문 예제를 보관하지만 seed·실행 snapshot으로 사용하지 않습니다.
원본 계약 승인 전 예제도 PROPOSED입니다.
API 동작이 없는 초기 단계에서 이 예제로 사용자에게 저장 성공을 가장하지 않습니다.
