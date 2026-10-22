# 생산 이산 시뮬레이션 플랫폼 워크스페이스

패키지 **1.1.0**, 문서 기준일 **2026-10-23 (Asia/Seoul)**.
React / Python / PostgreSQL / SimPy 기반 프로젝트 단위 통합 플랫폼의 개발 준비본입니다.

> **애플리케이션 구현본이 아닙니다.** 기술서, 디렉터리 골격, 에이전트 규칙, 계약 관리,
> 문서 검증 도구만 포함합니다. Backend/Frontend 실행, DB migration, 정식 OpenAPI는
> 아직 준비되지 않았습니다. 기존 소스 저장소·DB와 연결하거나 테스트하지 않았습니다.

## 지금 시작하는 방법
1. [AGENTS.md](AGENTS.md)를 읽습니다. 자동 로딩 여부와 무관하게 에이전트에 명시적으로 읽게 합니다.
2. [문서 지도](docs/README.md), [현재 상태](docs/planning/STATUS.md)를 확인합니다.
3. [ERD](docs/architecture/02_erd_database.md) →
   [도메인 계약](contracts/03_domain_contracts.md) →
   [API 계약](contracts/04_api_contract.md)을 검토합니다. 현재 모두 제안 상태입니다.
4. [G0 승인 체크리스트](docs/planning/G0_ACCEPTANCE.md)를 채웁니다.
5. 계약 담당자가 첫 수직 기능의 계약을 승인하면 Backend/Frontend를 병렬 개발합니다.
6. 첫 통합 목표는 **프로젝트 생성·선택 → 설비/공간 등록 → IN/OUT 조회 → 수정 충돌 처리**입니다.

## 주요 폴더
```text
simulation-platform/
├─ README.md / AGENTS.md / CONTRIBUTING.md
├─ simulation-platform.code-workspace
├─ backend/          # Python API·worker·domain·simulation, 기술서
├─ frontend/         # React 앱, 기술서, 계약 기반 Mock
├─ contracts/        # DTO/API 문서, 계약 승인 상태, 공통 예제
├─ docs/             # ERD·공정·로드맵·결정·인계·운영 규칙
├─ infra/            # DB·컨테이너·CI 운영 안내, 실제 배포 설정은 후속
├─ tools/            # 문서 검증, CAD 추출 도구 배치 위치
├─ data/local/       # 로컬 민감 자료 보관 위치; Git 제외
├─ tests/integration/# 실제 FE/BE 연동·보안 인수 테스트 계획
└─ .github/          # 문서 검증 CI와 PR 양식
```

## 병렬 작업
- 한 저장소를 공유하되 **에이전트별 브랜치 + 별도 worktree**를 권장합니다.
- 한 물리 폴더만 써야 하면 Git 변경·의존성 설치·마이그레이션은 조정자가 직렬 실행합니다.
- [협업 규칙](docs/agents/COLLABORATION.md) 및 [담당 범위](docs/agents/OWNERSHIP.md)를 따릅니다.
- Backend 시작: [전용 지시문](docs/agents/PROMPT_BACKEND.md).
- Frontend 시작: [전용 지시문](docs/agents/PROMPT_FRONTEND.md).
- 조정자 시작: [계약·통합 지시문](docs/agents/PROMPT_COORDINATOR.md).

## 현재 실행 가능한 명령
저장소 루트에서 Python 3.10 이상으로:
```bash
python tools/check_workspace.py
```
이는 문서 링크·JSON·필수 구조 검증일 뿐 앱·DB·시뮬레이션 테스트가 아닙니다.
VS Code 사용 시 code-workspace 파일을 열면 동일 검증 작업을 선택할 수 있습니다.
실제 언어/DB/라이브러리 버전은 G0에서 호환성을 확인하고 lockfile과 함께 고정합니다.

## 무엇이 보존되었는가
- 업로드된 18개 Markdown 문서는 역할별 폴더로 재배치하고 상대 링크를 수정했습니다.
- 제품6종·설비96대·공간22곳과 미정 사항은 [도메인 문서](docs/domain/08_catalog_processes.md)에 유지합니다.
- 원본 ZIP과 해시는 [이관 기록](docs/reference/IMPORT_MANIFEST.md)에 있습니다.
- 이전 단일 통합 MD는 원본 ZIP에만 보존합니다. 별도 편집본을 만들지 않아 내용 분기를 방지합니다.
- 첨부 CAD는 분석/승인하지 않았고 이 워크스페이스 ZIP에 복사하지 않았습니다.
  [CAD 자료 안내](data/README.md)를 참고하세요.

## 운영 주의
이 패키지의 문서·예제 공정은 사업상 민감할 수 있습니다. 비공개 저장소를 권장하며
외부 AI/서비스로 전송하기 전 사용자의 허용 범위를 확인하세요.
계획·PROPOSED·unknown을 임의로 승인·완료·0으로 바꾸지 마세요.
