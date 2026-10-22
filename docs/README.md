# 문서 지도
루트 README와 AGENTS가 작업 시작점입니다. 원본 번호는 인계 편의를 위해 유지했습니다.

## 원본 기술서 분배
| 원본 | 현재 경로 |
|---|---|
| README.md | [docs/reference/original_package_readme.md](reference/original_package_readme.md) |
| AGENTS.md | [docs/reference/original_agent_rules.md](reference/original_agent_rules.md) |
| 01_context_requirements.md | [docs/architecture/01_context_requirements.md](architecture/01_context_requirements.md) |
| 02_erd_database.md | [docs/architecture/02_erd_database.md](architecture/02_erd_database.md) |
| 03_domain_contracts.md | [contracts/03_domain_contracts.md](../contracts/03_domain_contracts.md) |
| 04_api_contract.md | [contracts/04_api_contract.md](../contracts/04_api_contract.md) |
| 05_backend_python.md | [backend/docs/05_backend_python.md](../backend/docs/05_backend_python.md) |
| 06_frontend_react.md | [frontend/docs/06_frontend_react.md](../frontend/docs/06_frontend_react.md) |
| 07_simulation_engine.md | [backend/docs/07_simulation_engine.md](../backend/docs/07_simulation_engine.md) |
| 08_catalog_processes.md | [docs/domain/08_catalog_processes.md](domain/08_catalog_processes.md) |
| 09_llm_wiki.md | [docs/features/09_llm_wiki.md](features/09_llm_wiki.md) |
| 10_cad_layout.md | [docs/features/10_cad_layout.md](features/10_cad_layout.md) |
| 11_roadmap_backlog.md | [docs/planning/11_roadmap_backlog.md](planning/11_roadmap_backlog.md) |
| 12_testing_operations.md | [docs/testing/12_testing_operations.md](testing/12_testing_operations.md) |
| 13_decisions_open_questions.md | [docs/decisions/13_decisions_open_questions.md](decisions/13_decisions_open_questions.md) |
| 14_handoff_prompts.md | [docs/agents/14_handoff_prompts.md](agents/14_handoff_prompts.md) |
| 15_change_log.md | [docs/planning/15_change_log.md](planning/15_change_log.md) |
| 99_sources.md | [docs/reference/99_sources.md](reference/99_sources.md) |

## 새 운영 문서
- [현재 상태](planning/STATUS.md), [G0 승인 체크리스트](planning/G0_ACCEPTANCE.md)
- [협업 절차](agents/COLLABORATION.md), [담당 경로](agents/OWNERSHIP.md), [작업 보드](agents/TASK_BOARD.md)
- [Backend 지시문](agents/PROMPT_BACKEND.md), [Frontend 지시문](agents/PROMPT_FRONTEND.md)
- [조정자 지시문](agents/PROMPT_COORDINATOR.md), [편집기 설정](agents/EDITOR_SETUP.md)
- [계약 관리](../contracts/README.md), [인계 양식](handoffs/TEMPLATE.md), [변경 요청 양식](change-requests/TEMPLATE.md)
- [구조 결정](decisions/ADR-0001-workspace.md), [변경 이력](planning/WORKSPACE_CHANGELOG.md)
- [검증 결과](testing/WORKSPACE_VALIDATION.md), [원본 이관](reference/IMPORT_MANIFEST.md)

## 문서 편집 원칙
같은 내용의 완성 기술서를 frontend/backend 양쪽에 복사하지 않습니다.
ERD는 architecture, DTO/API는 contracts, 공정은 domain에 단일 원본을 둡니다.
원본 번호만 적힌 과거 참조(예: 02/03/04)는 위 표의 현재 문서로 해석합니다.
원본 시작 프롬프트보다 새 역할별 PROMPT 문서를 우선 사용합니다.
