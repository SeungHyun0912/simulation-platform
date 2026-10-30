# HANDOFF-backend-20261030-BE-22-aisles-paths
- 상태: **구현완료 / 검증대기**(자체 테스트 통과만으로 통합 작업을 완료 처리하지 않는다)
- 작업 ID: **BE-22**(임시 ID, 통로 W와 포트 → 포트 경로 계산). 정식 TASK ID는 조정자 발급 대기
- 역할 / workspace 버전: Backend(API 담당) / 1.1.0
- branch / 기준 commit: worktree-backend-core-be35 / main `dfbdb26`(0.17.0) / 구현 `4e96a1b`
- 승인 근거: 사용자 지시(2026-10-30) — 점(P)·통로(W) 저장, 경로(R)는 P·W 조합으로 서버가 계산(고정 경로 우선), 교차는 가운데 점 공유(방법 1), "일방통행은 없어", "운반 시간은 나중에 별도로 두고 변경할 때마다 계산이 자동으로 될 수 있게만". CR `docs/change-requests/CR-backend-20261030-be19-aisles-paths.md`.
- 계약 버전: **0.17.0 → 0.18.0**(scope `layouts` 확장, 추가만, OpenAPI sha `3b54b5df…3dee`), migration head **0011 → 0012**, 엔진 c0.3 그대로(결과 불변).

## 구현
| 항목 | 내용 |
|---|---|
| DB(0012) | `layout_aisle`(aisle_key·attributes), `layout_aisle_point`(점 순서). 같은 배치판의 점만 참조, 승인 후 동결(0011 트리거 함수 재사용) |
| 배치판 내용 | PUT/GET에 `aisles[]`(응답에 계산한 `length_m`), 새 초안 복사에 포함. PUT은 통째로 교체라 aisles를 안 보내면 지워진다 |
| 경로 계산 | `POST /layout-versions/{v}/paths`(1~500쌍): 같은 포트 쌍의 고정 경로 우선(`fixed`), 없으면 통로·고정 경로 선분(양방향)으로 만든 길 그물의 최단 경로(`computed`, Dijkstra, 같은 길이면 점 key 순). 저장하지 않으므로 점·통로를 고치면 다음 조회부터 자동으로 바뀐다 |
| 오류·경고 | 저장 `LAY-SAVE-011`(통로 key 중복)과 통로 점 오류(003·008·009). 검증 경고 `LAY-008`(만나는데 공유 점 없음), `LAY-009`(포트의 점이 길에 닿지 않음) |

## 자체 테스트 명령과 실제 결과
| 명령 | 위치 | 종료 코드 | 실제 결과 |
|---|---|---|---|
| `python -m ruff check src tests migrations` | backend/ | 0 | All checks passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q tests/unit/test_layout_rules.py tests/integration/test_api_layouts.py tests/integration/test_schema_constraints.py` | backend/ | 0 | 31 passed(십자 교차·최단 경로·양방향·고립·택1 후보 2대·고정 경로 우선·점 이동 후 자동 재계산·복사, head 0012·모델 차이 없음) |
| `python -m pytest -q tests/contract`(계약 0.18.0 갱신 뒤) | backend/ | 0 | 80 passed |
| `$env:REQUIRE_DB="1"; python -m pytest -q` (전체) | backend/ | 0 | **735 passed**, 경고 3건(테스트 클라이언트·pydantic, 기능 영향 없음), 566초 |
| `alembic upgrade head`(로컬 개발 DB) | backend/ | 0 | 0011 → 0012, 개발 API 재시작 |

## 남은 결정·후보
- 사람·지게차·AMR 속도(m/분) — 정해지면 경로 계산 응답에 시간(= 길이 ÷ 속도)을 더하고, 엔진 운반 시간에 반영할지 결정.
