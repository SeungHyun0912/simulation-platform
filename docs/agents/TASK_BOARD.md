# 에이전트 작업 보드
갱신 주체: 조정자. 2026-10-23: WS-02·BE-01·BE-02·BE-03 행과 FE-01의 인계 칸(안내서 링크)만 갱신(사용자 위임). FE-01 상태 변경은 조정자 몫. FE·INT 행은 해당 담당/조정자가 갱신하며 아래 값은 그 시점 기록입니다.
BE-01은 테스트 증거가 있으나 검토자 확인 전이라 REVIEW입니다(DONE 아님).

| ID | 범위 | 담당 | 상태 | 선행 | 기준 commit/계약 | 인계 |
|---|---|---|---|---|---|---|
| WS-01 | ERD/DTO/API 차이 검토 | 조정자 + Backend/FE 검토 | TODO | 없음 | 미지정 | 없음 |
| WS-02 | 첫 project/assets scope 승인 | 조정자 | DONE (첫 scope만) | WS-01 전체 검토와 별개 | contract 0.1.0 / 82eb6a2 | contracts/contract-status.json, CR-backend-20261023-be01c |
| BE-01 | Python 환경·migration·최초 API | Backend | REVIEW | WS-02 | 82eb6a2 / contract 0.1.0 | HANDOFF-backend-20261023-BE-01a·01b·01c |
| BE-02 | 자산 버전·포트 정책(용량)·승인 흐름 | Backend | REVIEW | BE-01 | e2f3bba / contract 0.2.0 | HANDOFF-backend-20261023-BE-02, CR-backend-20261023-be02 |
| BE-03 | 제품·재료 기준정보 + `/me` 프로젝트 status | Backend | REVIEW | BE-02 | 6f07b53 / contract 0.3.0 | HANDOFF-backend-20261023-BE-03, CR-backend-20261023-be03 |
| FE-00 | 정적 화면 구조·입력 상태 설계 | Frontend | TODO | 문서 읽기·범위 배정 | 미지정 | 없음 |
| FE-01 | 승인 계약 Mock·프로젝트/자산 화면 | Frontend | BLOCKED | WS-02 | 미지정 | 착수 가능(WS-02 완료). 안내서: HANDOFF-backend-20261023-BE-02-for-frontend, 변경 기록 contracts/CHANGELOG.md |
| INT-01 | 최초 실제 연동·격리/충돌 테스트 | 조정자 | BLOCKED | BE-01, FE-01 | 미지정 | 없음 |

이 ID는 협업 배정용이며 기존 11번 로드맵 작업 ID를 대체하지 않습니다.
각 구현 작업은 해당 로드맵 ID를 함께 기록합니다.
상태: TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE.
DONE에는 테스트 증거와 검토자 확인이 필요합니다.
