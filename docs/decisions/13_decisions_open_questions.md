> 워크스페이스 재배치본 v1.1.0 / 2026-10-23. 경로 변경은 구조 결정이며, 업무 규칙과 기술 제안의 승인 상태는 승격하지 않습니다.

# 13. 결정 기록·미정 사항·위험 목록

## 1. 결정 분류

사용자 도메인 사실(USER_CONFIRMED)과 설계 제안(PROPOSED)을 같은 “확정”으로 쓰지 않는다.
이 문서는 아직 사용자 전체 설계 승인을 받은 ADR가 아니다.
기술 제안 채택 시 담당자/날짜/근거를 기록한다.

## 2. 사용자 확정 결정

| ID | 결정 |
|---|---|
| D-U01 | 프로젝트를 최상위 시뮬레이션 모델 범위로 관리 |
| D-U02 | React/Python/PostgreSQL + SimPy |
| D-U03 | 공정 Add/Update를 서비스 운영 중 지속 |
| D-U04 | 설비 IN/OUT 필수 |
| D-U05 | 가용 시 이동 기본, busy 도착 시 IN 대기 |
| D-U06 | 목적지 수용 조건에 따른 OUT 배출 |
| D-U07 | 선속 Output 기준, 보빈·길이·가닥 분리 |
| D-U08 | P01 잔량 동일제품 이월/제품전환 폐기 |
| D-U09 | P04 싱글 메인 산출10개 설정, 변경 가능 |
| D-U10 | P04/P05/P06 재권취 후 완제품, 검사/적재 별도 |
| D-U11 | P04/P05/P06 검사자 무제한, 10분/보빈 |
| D-U12 | ST-001과 ST-005 별도, 실리콘과 CU 압출 공간 별도 |
| D-U13 | ST-021과 ST-022 별도 도킹 |
| D-U14 | 제품별 공정은 메인 반영 전 검토 초안 유지 |
| D-U15 | 원자재 전체 물량/입고 계획은 추후 시나리오 입력 |
| D-U16 | 한국어 표기, 잘못 생성된 한자/일본어 제거 |

## 3. 기술 제안 ADR

| ID | 제안 | 이유 | 대안/변경 조건 |
|---|---|---|---|
| ADR-001 | organization 보안 경계 + project 모델 범위 | 타 사업체 확장 | 단일 고객 배포에도 scope 유지 |
| ADR-002 | asset + subtype + asset_revision | 포트/그룹/배치 참조 일관성 | 기존 equipment/storage DB 있으면 단계적 adapter |
| ADR-003 | UUID 내부 ID, code project 내 고유 | 정렬·복사 안정성 | 외부 식별코드는 별도 |
| ADR-004 | process graph와 layout graph 분리 | 화면배치/공장좌표 혼동 방지 | 없음 |
| ADR-005 | 버전 불변 + run snapshot | 과거 결과 재현 | snapshot 없이 current 조인은 금지 |
| ADR-006 | FastAPI/Pydantic/SQLAlchemy/Alembic | typed API와 migration | 팀 표준이 있으면 검토 |
| ADR-007 | API와 worker 분리 | 긴 CPU 작업 격리 | worker backend 교체 가능 |
| ADR-008 | PostgreSQL queue 초기 | 인프라 최소화 | 규모/운영 요구에 따라 broker |
| ADR-009 | React+TS+Vite+TanStack Query+React Flow | typed 화면/그래프 | 정확한 package pin 착수 시 |
| ADR-010 | 숫자 decimal string API | 길이·중량 round-trip 보존 | DB numeric, 엔진 float 변환 |
| ADR-011 | 단계별 명시 handler registry | 일반 플랫폼 확장 | 코드 문자열 실행 금지 |
| ADR-012 | 구조화 DB 원본, 위키 projection | 이중 원본 방지 | 수동설명 overlay 허용 |
| ADR-013 | LLM 읽기전용 도구 우선 | scope·근거·통제 | 승인 workflow 후 변경 제안 |
| ADR-014 | 초기 수동 이동시간 허용 | CAD 전에 실행 검증 | 가정 승인/결과 표시 필수 |
| ADR-015 | single-run 자원은 project+asset UUID로 유일 | 공유 설비 중복 방지 | 연합 프로젝트 실행은 별도 연구 |
| ADR-016 | fixed-horizon [0,H) | 경계 테스트 명확 | inclusive는 별도 기능 |
| ADR-017 | 지식 승인과 실행 가능 검증 분리 | UNKNOWN을 거짓으로 채우지 않음 | 실행 필수값은 차단 |
| ADR-018 | 프로젝트 복사시 새 UUID | 독립 모델/실험 | 실물 공유 동기화는 미지원 |
| ADR-019 | 초기 transport count/geometry 미정 유지 | 사실 날조 방지 | 승인 가정으로 테스트만 |

## 4. 도메인 미정 질문

| ID | 질문 | 영향 | 지금 구조 개발 차단? |
|---|---|---|---|
| OPEN-001 | 각 제품이 후보 설비 모든 호기를 사용할 수 있는가? | 배정·성능 | 아니오; 실행은 해소 필요 |
| OPEN-002 | 설비 처리 용량, IN/OUT/저장 용량과 단위? | buffer/동시성 | 아니오; 실행은 필수 |
| OPEN-003 | 이동 중 설비 예약, OUT 막힘 시 설비 점유? | 시간·교착 | 정책 enum은 먼저, 실제 run은 필수 |
| OPEN-004 | AL feeder 선행/메인 중 점유·소비·인계 상세? | line handler | 해당 기능 실행 차단 |
| OPEN-005 | AL12보빈/CU9보빈 멀티신선 동시/순차와 속도기준? | 처리량 | 해당 단계 실행 차단 |
| OPEN-006 | 준비120분·공급대기120분 발생 주기? | 시간 | 해당 단계 실행 차단 |
| OPEN-007 | P01 잔량 scope/생산종료 처리/출력 인계? | 이월·폐기 | 정책 구조 가능, 해당 run 해소 |
| OPEN-008 | P05 절연 잔량4,000m의 처리? | 물량·시간 | 전체 run 해소 |
| OPEN-009 | P05 최초 원자재 저장 위치 ST-005가 맞는가? | 시작 이동 | 해당 run 해소 |
| OPEN-010 | P01~03 준비/인계/검사자/완제품 판정? | 완료량·리드타임 | 해당 run 해소 |
| OPEN-011 | 운반 대수·속도·상하차·나머지 이동 방식? | 물류 | 수동시간 가정 가능 |
| OPEN-012 | 실제 생산계획·입고주기·초기 WIP·근무시간? | scenario | UI/API 가능, 실제 run 필요 |
| OPEN-013 | 순서·제품 우선순위·배정 정책? | 대기/재공품 | fixture FIFO 가정 가능 |
| OPEN-014 | 실제 IN/OUT·구역·통로·도면 매핑 승인? | CAD 이동 | 수동시간 모드로 우회 |
| OPEN-015 | ST-022 기준명칭 일반화 승인? | 표시 | 아니오, 기존명 유지 |
| OPEN-016 | 제품/설비 교체 중 불량·중단·보전 범위? | 후속 확장 | 초기 범위 밖으로 명시 |
| OPEN-017 | source 잔량이 다음 batch에 사용되는 선택/매칭 조건? | 재고 | 단위 fixture는 가정, 전체 run 필요 |
| OPEN-018 | 가동중 교대 종료 시 정지/계속/완료 후 종료? | calendar | 정책 fixture로 결정 |
| OPEN-019 | 검사 합격/불합격·재검사 규칙? | 품질 | 현재는 소요시간만, 합격률을 만들지 않음 |
| OPEN-020 | 한 작업의 여러 산출 사이 설비를 계속 점유하는가? | 보빈 간 배정·교체 | 인계 규칙과 분리, 시험 가정 필요 |

## 5. 플랫폼 착수 시 결정

| ID | 질문 | 권장 초기 방향 |
|---|---|---|
| TECH-001 | 기존 repo/코드/DB 유무 | 실제 저장소 조사 먼저 |
| TECH-002 | 인증 공급자/조직 온보딩 | OIDC 또는 기존 사내 인증 adapter |
| TECH-003 | 내부망/외부 cloud, secret·object storage | 로컬은 compose, 운영 선택 별도 |
| TECH-004 | 정확한 의존성·DB 서버 버전 | 검증 후 lock, 문서 “최신” 추측 금지 |
| TECH-005 | 외부 LLM 전송 허용 정보 | 기본 미전송, 승인 범위만 |
| TECH-006 | 승인자/권한/보존 정책 | 사용자와 결정 |
| TECH-007 | run 규모/동시 실행/SLO | 측정 기준 합의 후 성능 목표 |
| TECH-008 | RLS 도입 운영 방식 | API scope + 최소권한 DB + RLS 제안 |
| TECH-009 | queue 운영 책임/worker 제한 | 초기 DB queue, 비용·규모 측정 |
| TECH-010 | 템플릿 공유 범위 | 프로젝트 독립 복사 먼저 |

## 6. 초기 리스크

- R01: 미정값을 default0/무제한으로 처리 → 결과 왜곡. validator+assumption gate.
- R02: 같은 EQ 반복 방문을 별도 자원으로 생성 → 처리량 과대. ID invariant test.
- R03: DB·위키·LLM의 서로 다른 최신값 → outbox/version/ref.
- R04: 프로젝트 cache/검색 누출 → scope FK/RLS/querykey/tool auth.
- R05: 한 번에 10개 산출 → downstream lead time 왜곡. unit event.
- R06: 설정 산출량을 물리보존 결과로 해석 → abstract_yield label.
- R07: CAD 문자좌표를 실제 포트로 사용 → review_status.
- R08: job 중복/늦은 worker 쓰기 → idempotency/fencing.
- R09: 문서와 구현 불일치 → 변경 PR·계약 테스트·handoff.
- R10: 범용화 과잉으로 MVP 지연 → ERD core/후속 테이블 단계 도입.
- R11: 성능 확인 없이 전체 CAD JSON DB 적재 → artifact/streaming.
- R12: 예제6종 외 handler 지원을 약속 → capability matrix.

## 7. 질문 처리 규칙

구조 개발에 불필요한 현장 질문을 모두 먼저 요구하지 않는다.
UNKNOWN을 표현하는 구조와 UI는 구현 가능.
실행 직전 선택한 경로에서 필요한 질문만 묶어서 요청한다.
질문 해결 시 source_ref, 대상 제품/버전/field path, 이전값, 새값, 영향 테스트를 기록한다.
