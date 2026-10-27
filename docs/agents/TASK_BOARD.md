# 에이전트 작업 보드
갱신 주체: 조정자. 2026-10-23: WS-02·BE-01·BE-02·BE-03 행과 FE-01의 인계 칸(안내서 링크)만 갱신(사용자 위임). FE-01 상태 변경은 조정자 몫. FE·INT 행은 해당 담당/조정자가 갱신하며 아래 값은 그 시점 기록입니다.
BE-01은 테스트 증거가 있으나 검토자 확인 전이라 REVIEW입니다(DONE 아님).

| ID | 범위 | 담당 | 상태 | 선행 | 기준 commit/계약 | 인계 |
|---|---|---|---|---|---|---|
| WS-01 | ERD/DTO/API 차이 검토 | 조정자 + Backend/FE 검토 | TODO | 없음 | 미지정 | 없음 |
| WS-02 | 첫 project/assets scope 승인 | 조정자 | DONE (첫 scope만) | WS-01 전체 검토와 별개 | contract 0.1.0 / 82eb6a2 | contracts/contract-status.json, CR-backend-20261023-be01c |
| BE-01 | Python 환경·migration·최초 API | Backend | REVIEW | WS-02 | 82eb6a2 / contract 0.1.0 | HANDOFF-backend-20261023-BE-01a·01b·01c |
| BE-02 | 자산 버전·포트 정책(용량)·승인 흐름 | Backend | REVIEW | BE-01 | e2f3bba / contract 0.2.0 | HANDOFF-backend-20261023-BE-02, CR-backend-20261023-be02 |
| BE-03 | 제품·재료 기준정보 + `/me` 프로젝트 status·timezone | Backend | REVIEW | BE-02 | 6f07b53 / contract 0.3.0(게시), 64e66c0 / 0.3.1(머지 대기) | HANDOFF-backend-20261023-BE-03, CR-backend-20261023-be03 |
| BE-04a | 공정 버전·그래프·단계·자원 요구·검증(04b/04c 제외) | Backend | REVIEW | BE-03 | 18754cf / contract 0.4.0(main 게시, PR #18) | HANDOFF-backend-20261023-BE-04a, CR-backend-20261023-be04 |
| BE-04b | 공정 복제 기준 선택·버전 비교·편집기 상태(공용) | Backend | REVIEW | BE-04a | c9de49a / contract 0.5.0(머지 대기) | HANDOFF-backend-20261026-BE-04b, CR-backend-20261026-be05 |
| BE-WIRE-SEED | 실제 기준정보 시드(설비 96·공간 22·제품 6·공정 6 draft, 프로젝트 DEMO-WIRE) | Backend | REVIEW | BE-04b | ccf6072 / contract 0.5.0 | HANDOFF-backend-20261026-BE-WIRE-SEED |
| BE-04c | 공정 단계 재료 spec·간선 spec 연결·완제품 지정(값 구조 미정의 규칙 필드 제외) | Backend | REVIEW | BE-04b | 03f21ba / contract 0.6.0(머지 대기) | HANDOFF-backend-20261026-BE-04c, CR-backend-20261026-be06 |
| BE-C0 | 엔진 골격: 컴파일러·표준 handler·단일 선형 흐름 실행(C0-01~03), SimPy 4.1.2 고정(ADR-0002 제안) | Backend | REVIEW | BE-04c | ccf6072 이후 / contract 0.6.0(변경 없음) | HANDOFF-backend-20261026-C0-engine, ADR-0002 |
| BE-C0-04 | 엔진: 서로 다른 제품이 같은 설비를 공유·경쟁(다중 공정 실행) | Backend | **구현완료·검증대기**(통합 검증 담당 재검증 필요) | BE-C0 | 0043d1b 이후 / contract 0.6.0(변경 없음) | HANDOFF-backend-20261026-C0-04 |
| BE-C0-06 | 엔진: 잔량 이월·폐기(범위별 길이 풀, 제품 전환·실행 종료 정책) | Backend | **구현완료·검증대기** | BE-C0-04 | 93d63b9 이후 / contract 0.6.0(변경 없음) | HANDOFF-backend-20261026-C0-06 |
| BE-DEC-005 | 단계 없는 공정을 실행 판정 오류로(`VAL-GRAPH-010`, 보드 DEC-005) | Backend | **구현완료·검증대기** | INT-O-001 | 1b79d76 이후 / contract 0.6.1 | HANDOFF-backend-20261026-DEC005-C0-05 |
| BE-C0-05 | 엔진: 저장공간 자리·OUT 막힘(DEC-006 대응표: hold·release_after_out) | Backend | **구현완료·검증대기** | BE-C0-06, DEC-006 | 1b79d76 이후 / contract 0.6.1(엔진 내부) | HANDOFF-backend-20261026-DEC005-C0-05 |
| BE-C0-07 | 엔진: 저장공간 분기·단계 합류·공급 간선, configured_yield·supply_delay·준비 대기 | Backend | **구현완료·검증대기** | BE-C0-05 | bf93a63 이후 / contract 0.6.1(엔진 내부) | HANDOFF-backend-20261026-C0-07 |
| BE-05a | 시나리오 버전·실행 사전검증 API(migration 0007, 계약 0.7.0, DEC-007) | Backend | **구현완료·검증대기** | BE-C0-07, DEC-007 | 22f5c1f 이후 / contract 0.7.0 | HANDOFF-backend-20261027-BE-05a |
| BE-07 | 실제 공정 6종에 사용자 정리 결과 반영(공정 draft 값, 데이터 기반 운반 시간) | Backend | **구현완료·검증대기** | BE-05a, CR be09 | 3225fd5 이후 / contract 0.7.0(변경 없음) | HANDOFF-backend-20261027-BE-07-intake |
| BE-08 | 2차 결정 반영(일괄 확보 순차 산출, 길이 없는 원자재, 제품 전환 준비, 잔량 폐기, 입력 부족 진단) | Backend | **구현완료·검증대기** | BE-07 | PR #43 위 / contract 0.7.0(변경 없음) | HANDOFF-backend-20261027-BE-08-batch-engine |
| BE-09 | P05 절연 잔량 폐기와 계약 0.8.0(잔량 `discard`·도착 `weight_kg`) | Backend | **구현완료·검증대기** | BE-08, CR be09 §9 | e250b48 이후 / contract 0.8.0 | HANDOFF-backend-20261027-BE-09-discard |
| BE-06a | 실행 플랫폼 1단계: 실행 요청·입력 스냅샷·DB job queue·별도 worker·취소, 계약 0.9.0 | Backend | **구현완료·검증대기** | BE-09, CR be08 | 339de64 이후 / contract 0.9.0 | HANDOFF-backend-20261027-BE-06a-run-platform |
| FE-00 | 정적 화면 구조·입력 상태 설계 | Frontend | TODO | 문서 읽기·범위 배정 | 미지정 | 없음 |
| FE-01 | 승인 계약 Mock·프로젝트/자산 화면 | Frontend | BLOCKED | WS-02 | 미지정 | 착수 가능(WS-02 완료). 안내서: HANDOFF-backend-20261023-BE-02-for-frontend, 변경 기록 contracts/CHANGELOG.md |
| INT-01 | 최초 실제 연동·격리/충돌 테스트 | 조정자 | BLOCKED | BE-01, FE-01 | 미지정 | 없음 |

이 ID는 협업 배정용이며 기존 11번 로드맵 작업 ID를 대체하지 않습니다.
각 구현 작업은 해당 로드맵 ID를 함께 기록합니다.
상태: TODO / IN_PROGRESS / BLOCKED / REVIEW / DONE.
DONE에는 테스트 증거와 검토자 확인이 필요합니다.
