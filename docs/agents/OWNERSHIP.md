# 경로별 담당 범위

| 경로 | 기본 작성자 | 검토자 |
|---|---|---|
| backend/src, backend/tests, backend/docs | Backend | 기술 조정자 |
| backend/migrations | Backend의 지정 단일 DB 담당 | 조정자·DB 검토자 |
| frontend/** | Frontend | UI·계약 검토자 |
| contracts/** | 조정자 | Backend + Frontend |
| docs/architecture/** | 조정자 | Backend + Frontend |
| docs/domain/** | 도메인 담당/조정자 | 사용자 |
| docs/decisions/** | 조정자 | 해당 담당 + 사용자(업무 변경) |
| docs/change-requests/** | 요청자별 고유 파일 | 조정자 |
| docs/handoffs/** | 역할별 고유 파일 | 다음 담당자 |
| docs/agents/TASK_BOARD.md | 조정자 단일 작성 | 담당자 |
| 루트 설정, infra, .github, tools/check_workspace.py | 조정자 | 영향받는 담당자 |
| tools/cad/** | 배정된 CAD 담당 | 조정자 |
| tests/integration/** | 통합 담당 | Backend + Frontend |
| docs/reference/original_specs_v1.zip | 수정 금지 | 원본 검증만 |

모든 수정은 배정 범위 내에서 수행합니다. 공통 파일은 요청 후 승인을 받습니다.
CODEOWNERS 자동 검토는 저장소 서비스·실제 계정을 확인한 뒤 설정합니다.
가짜 @사용자명을 넣은 CODEOWNERS를 제공하지 않았습니다.
경로 소유권 표 자체는 파일 접근 권한·Git 보호 규칙을 대신하지 않습니다.
