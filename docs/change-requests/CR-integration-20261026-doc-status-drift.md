# CR-integration-20261026-doc-status-drift
- 작성자/담당: 통합 검증 담당(INT) → 조정자
- 상태: PROPOSED
- 기준 commit / 계약 버전: origin/main `e382749` / 0.6.0 (`509a71f1…38ef`)
- 유형: 환경(문서 정합)
- 변경 대상과 현재 값(조정자 소유 문서, INT는 수정하지 않음):
  1. `docs/planning/STATUS.md`: 계약 "0.5.0이 main에 게시, 0.6.0은 머지 대기"라고 적었으나 `contract-status.json`은 main에서 **0.6.0**(PR #27 머지). 프런트엔드를 "정적 화면, API 연동 없음"이라고 적었으나 FE-01~04a가 실서버 연동·검증을 보고했고 e382749에서 클라이언트는 0.6.0이다.
  2. `docs/agents/TASK_BOARD.md`: FE-00 TODO, FE-01 BLOCKED, INT-01 BLOCKED로 남아 있고 FE-02·03·04, BE-04c 이후, BE-09 행이 없다. INT-01은 통합 검증 세션이 시작되어 상태 갱신이 필요하다.
  3. 루트 `README.md`, `backend/README.md`, `frontend/README.md`의 첫 줄: "구현본이 아님/구조만 있음/API 연동 없음".
  4. `contracts/openapi.json`의 `info.version`이 `0.0.0`(계약 버전은 `contract-status.json`에서만 알 수 있음). 해시는 일치하므로 결함으로 단정하지 않는다.
  5. 통합 보드 권장 경로 `docs/collaboration/`와 STATUS·README의 `docs/communication/` 참조가 섞여 있다. 통합 보드는 `docs/collaboration/INTEGRATION_BOARD.md`로 옮겼다(이 브랜치).
- 변경 이유와 사용자 근거: 사용자가 통합 검증 첫 응답(2026-10-26) 후 "필요하면 변경 요청해 줘"라고 승인했다. 근거 증거는 통합 보드 §3·§13.
- 제안: 위 항목을 조정자가 사실과 맞게 갱신. INT가 임의로 상태(DONE 등)를 바꾸지 않는다. 4번은 계약 변경이므로 필요 여부를 조정자가 결정한다.
- 영향받는 테이블·migration·화면·API·예제·엔진: 없음(문서만).
- 호환성/데이터 변환/롤백: 해당 없음.
- 미정·위험: 문서가 낡으면 새 세션이 "API 연동 없음"으로 오판해 범위를 잘못 잡을 수 있다.
- 필요한 테스트: `python tools/check_workspace.py`(문서 검증만).
- 승인자 / 승인일 / 근거: 미승인(조정자 검토 대기).
- 반영 commit / 양쪽 확인: 없음.
APPROVED와 IMPLEMENTED를 구별한다. 사용자 생산 규칙은 기술 담당자가 임의 승인하지 않는다.
