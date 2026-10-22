# 공유 계약 수정 규칙
루트 AGENTS.md 적용. 직접 수정 권한은 조정자/계약 담당자에게만 있습니다.
Backend는 후보·CR을 제출하고 Frontend는 client/Mock을 소비합니다.
JSON만 바꾸지 말고 DTO/API 설명, 예제, 승인 상태, FE 재생성 영향을 함께 변경합니다.
승인자 이름·일시·근거 commit/hash 없는 임의 승인은 금지합니다.
계약 pending 상태에서 openapi.json을 빈 파일로 만들어 도구 검사를 우회하지 않습니다.
