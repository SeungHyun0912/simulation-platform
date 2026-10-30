# 로컬 전용 데이터 위치
원본 CAD·추출 결과·실행 결과를 필요한 경우 여기에 둡니다.
이 안내 파일 외 데이터는 Git 제외입니다. 새 ZIP 배포 시에도 실수로 포함하지 마세요.

## 비공개 업무 데이터 (2026-10-30 저장소에서 제외)
이 저장소는 공개(PUBLIC)라서 회사 내부 설비·공정 기준정보를 추적에서 뺐습니다. 파일은 로컬에서만 관리합니다.
`private/` 아래에 원래 경로 그대로 백업되어 있습니다(Git 제외).

| 백업 경로(`data/local/private/` 기준) | 용도 |
|---|---|
| `docs/domain/08_catalog_processes.md` | 설비 96대·공간 22곳·제품 6종 공정 정리본(도메인 정본) |
| `docs/reference/original_specs_v1.zip`, `attachment_inventory.json`, `source_file_manifest.json` | 원본 기술서 ZIP과 첨부 목록 |
| `backend/scripts/seed_wire_factory.py`, `demo_run_wire_factory.py` | DEMO-WIRE 실제 기준정보 시드·시연 |
| `backend/tests/integration/test_seed_wire_factory.py`, `test_engine_real_catalog.py` | 위 시드를 쓰는 테스트 |

- **복원:** 필요한 파일을 같은 상대 경로로 저장소 루트에 복사합니다. 복사본은 `.gitignore`에 올라 있어 커밋되지 않습니다.
  예: `Copy-Item data\local\private\backend\scripts\seed_wire_factory.py backend\scripts\`
- 복원하지 않으면 해당 시드와 테스트는 없는 상태로 동작하고, 문서 검증(`tools/check_workspace.py`)은 이 경로의 링크를 깨진 링크로 보지 않습니다.
- 과거 커밋 이력에는 이 파일들이 남아 있습니다. 이력 정리와 저장소 비공개 전환은 별도 결정입니다.
- 새로 이 종류의 데이터를 추가할 때는 `data/local/`에만 두고 커밋하지 않습니다.
