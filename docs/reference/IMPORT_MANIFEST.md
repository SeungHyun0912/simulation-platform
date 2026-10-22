# 이관 기록
문서 재구성 기준일: 2026-10-23.
원본: 사용자 업로드 기술서 ZIP (파일명·크기·SHA-256은 attachment_inventory.json).
원본 보존: original_specs_v1.zip. 내부 18개 MD와 단일 통합 MD 포함.
원본 ZIP 내용은 수정하지 않았고, 활성 문서는 경로 정리·협업 규칙 보완본입니다.

## 파일 분배
| 원본 파일 | 활성/참고 경로 |
|---|---|
| `README.md` | `docs/reference/original_package_readme.md` |
| `AGENTS.md` | `docs/reference/original_agent_rules.md` |
| `01_context_requirements.md` | `docs/architecture/01_context_requirements.md` |
| `02_erd_database.md` | `docs/architecture/02_erd_database.md` |
| `03_domain_contracts.md` | `contracts/03_domain_contracts.md` |
| `04_api_contract.md` | `contracts/04_api_contract.md` |
| `05_backend_python.md` | `backend/docs/05_backend_python.md` |
| `06_frontend_react.md` | `frontend/docs/06_frontend_react.md` |
| `07_simulation_engine.md` | `backend/docs/07_simulation_engine.md` |
| `08_catalog_processes.md` | `docs/domain/08_catalog_processes.md` |
| `09_llm_wiki.md` | `docs/features/09_llm_wiki.md` |
| `10_cad_layout.md` | `docs/features/10_cad_layout.md` |
| `11_roadmap_backlog.md` | `docs/planning/11_roadmap_backlog.md` |
| `12_testing_operations.md` | `docs/testing/12_testing_operations.md` |
| `13_decisions_open_questions.md` | `docs/decisions/13_decisions_open_questions.md` |
| `14_handoff_prompts.md` | `docs/agents/14_handoff_prompts.md` |
| `15_change_log.md` | `docs/planning/15_change_log.md` |
| `99_sources.md` | `docs/reference/99_sources.md` |

## 의도적인 수정
- 상대 Markdown 링크를 새 위치에 맞게 변환.
- Backend 예시 apps/api·apps/worker·packages를 backend/src/simulation_platform으로 변경.
- OpenAPI는 backend 후보 → 조정자 승인 → contracts/openapi.json 경로로 통일.
- 활성 원본 기술서 상단에 재배치본 표시. 기술 설계의 PROPOSED 상태는 유지.
- 원본 README/AGENTS는 참고 문서로 표시, 루트 최신 지침을 사용.
- 원본 외부 출처 조회 이력은 과거 기록임을 명시하고 이번 전체 재검증을 주장하지 않음.
- 원본 통합 MD는 ZIP 안에만 보존하여 중복 편집을 방지.

## CAD
DWG와 4파일 추출 ZIP은 재포함하지 않습니다.
이번 작업은 문서/워크스페이스 구성으로 CAD 위치·통로·IN/OUT을 재분석하지 않았습니다.
파일 해시를 기존 자료 대응용으로 제공하되 CAD 원본의 전체 텍스트/형상을 판독했다고 주장하지 않습니다.
