# 에이전트 작업 보드
갱신 주체: 조정자. 현재 상태는 모두 미착수이며 구현 완료를 주장하지 않습니다.

| ID | 범위 | 담당 | 상태 | 선행 | 기준 commit/계약 | 인계 |
|---|---|---|---|---|---|---|
| WS-01 | ERD/DTO/API 차이 검토 | 조정자 + Backend/FE 검토 | TODO | 없음 | 미지정 | 없음 |
| WS-02 | 첫 project/assets scope 승인 | 조정자 | BLOCKED | WS-01 | 미지정 | 없음 |
| BE-01 | Python 환경·migration·최초 API | Backend | BLOCKED | WS-02 | 미지정 | 없음 |
| FE-00 | 정적 화면 구조·입력 상태 설계 | Frontend | TODO | 문서 읽기·범위 배정 | 미지정 | 없음 |
| FE-01 | 승인 계약 Mock·프로젝트/자산 화면 | Frontend | BLOCKED | WS-02 | 미지정 | 없음 |
| INT-01 | 최초 실제 연동·격리/충돌 테스트 | 조정자 | BLOCKED | BE-01, FE-01 | 미지정 | 없음 |

이 ID는 협업 배정용이며 기존 11번 로드맵 작업 ID를 대체하지 않습니다.
각 구현 작업은 해당 로드맵 ID를 함께 기록합니다.
상태: TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE.
DONE에는 테스트 증거와 검토자 확인이 필요합니다.
