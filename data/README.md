# 데이터 관리
실제 공정·CAD·DB 덤프는 접근 승인 후 로컬 또는 별도 artifact 저장소에서 관리합니다.
data/local 아래 실제 파일은 Git에서 제외됩니다. 이 패키지에는 원본 CAD를 넣지 않았습니다.
첨부 CAD 목록/크기/해시는 docs/reference/attachment_inventory.json에 있습니다.

권장 로컬 배치:
data/local/cad/source/       원본 DWG/DXF
data/local/cad/extracted/    manifest/layers/texts/inserts/geometry
data/local/artifacts/        실행별 결과
data/local/logs/             민감정보 제거된 진단

현재 제품 목록은 docs/domain/08_catalog_processes.md가 기준입니다.
개발 seed는 승인 후 코드로 작성하고 실제 운영 데이터와 분리합니다.
CAD 원본 문자 증거는 그대로 보존하되 사용자 표시명은 한국어 정규화 필드로 관리합니다.
