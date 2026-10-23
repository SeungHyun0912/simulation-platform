# CR-backend-20261023-be01-contract-gaps
- 요청자: Backend / 작업 BE-01 / 대상: contracts/04_api_contract.md, 03 (조정자 검토)
- 상태: 요청(미승인). 아래는 BE-01a 구현 중 확인한 공백이며 임의로 확정하지 않았다.

## 1. 412 오류 코드 매핑
- 04 §1은 If-Match 불일치 412, 누락 428을 정의하고 §2 코드 목록에 `PRECONDITION_REQUIRED`, `EDIT_CONFLICT`가 있으나 412↔코드 대응이 명시되지 않음.
- 현재 구현 가정: 428=`PRECONDITION_REQUIRED`, 412=`EDIT_CONFLICT`.
- 요청: 확정 또는 정정.

## 2. 프레임워크 검증 오류 코드
- 04 §2는 "프레임워크 기본 validation 오류도 envelope로 변환"만 명시하고 code 값이 없음.
- 현재 구현 가정: 422, `VALIDATION_ERROR`, details[].field_path는 JSON Pointer.
- 존재하지 않는 경로의 404는 `NOT_FOUND`, 그 외 HTTP 오류는 `HTTP_ERROR`로 임시 변환.
- 요청: 코드 목록에 `VALIDATION_ERROR`, `NOT_FOUND` 등 추가 여부 결정.

## 3. 성공 응답 래퍼
- 04 §5 예시만 `{"data": ...}`를 사용하고 목록 응답(cursor 포함) 형식은 없음.
- 현재 구현 가정: 단건 `{"data": {...}}`. `/health`가 이를 따름.
- 요청: 목록 응답(`data`, `next_cursor` 등) 형식 확정.

## 4. 자산 생성 DTO (첫 scope 필수)
- 04 §3은 "kind에 따라 subtype·포트를 원자 생성"만 명시. 요청/응답 필드 없음.
- Backend 제안안은 BE-01c 착수 전에 별도 CR로 제출한다. 승인 전 구현하지 않는다.

## 5. 인증 adapter
- TECH-002 미결. BE-01은 local 전용 테스트 주체(AUTH_MODE=local, production 비활성)로 시작하고 운영 adapter는 결정 후 교체.
