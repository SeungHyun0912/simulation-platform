# CR-frontend-20261023-fe-rule-ui-and-reason-dialog
- 작성자/담당: Frontend
- 상태: **PROPOSED** (승인 전에는 구현하지 않는다)
- 기준 commit / 계약 버전: origin/main `b55c98a` / 계약 0.2.0 (`da54371140…c2a33a`). **계약 변경 없음.**
- 유형: 기술 채택(FE 공통 컴포넌트 확장 제안, `frontend/AGENTS.md` "공통 패턴에 없는 요구는 확장 제안을 먼저 기록")
- 변경 대상과 현재 값:
  1. 포트별 이동·배출 규칙(`dispatch_rule`/`release_rule`) 입력 컴포넌트 — **현재 없음**. 자산 상세는 규칙을 읽기 전용 텍스트로만 표시한다(FE-00h).
  2. 사유 입력이 필요한 확인 창(버전 반려: 사유 필수) — **현재 없음**. `ConfirmDialog`는 본문과 확인·취소만 받는다.
- 변경 이유와 사용자 근거: Backend FE 안내서(BE-02) §2 #9·#10이 FE에 규칙 입력 UI와 반려 사유 입력을 요구한다. 계약 0.2.0이 승인한 operation이다(`PATCH …/asset-revisions/{id}`의 `ports[].dispatch_rule/release_rule`, `POST …/reject`의 사유). 규칙의 일부 값은 사용자 확정 결정(D-U05·D-U06)이고 일부는 미정(OPEN-003)이라 입력에서 이를 구분해야 한다.

## 제안
### 1. `PortRuleInput` (업무 컴포넌트, `features/assets` 안)
- 공통 컴포넌트가 아니라 **자산 기능 안의 컴포넌트**로 시작한다(특정 계약 모양에 의존하므로 `shared`에 두지 않는다). 다른 기능이 같은 규칙 모양을 쓰게 되면 그때 `shared`로 올리는 것을 제안한다.
- 입력 단위: 포트 하나의 이동 규칙 + 배출 규칙. 기존 `Fields`의 `SelectField`와 `CheckboxField`만 쓰며 새 색·모달·표 스타일은 만들지 않는다.
- 필드(코드값은 계약 그대로, 라벨은 BE-REQ-008 답변):
  | 필드 | 선택지 |
  |---|---|
  | 이동 조건 `dispatch_rule.mode` | 목적지 설비가 가용할 때 이동(D-U05) / 미정 |
  | IN 대기 `wait_at_in_if_busy` | 사용 중이면 IN에서 대기(D-U05, 예/아니오) |
  | 이동 중 설비 예약 `reservation` | 미정(OPEN-003) / 이동 중 예약 / 예약하지 않음 |
  | 배출 조건 `release_rule.mode` | 목적지가 수용할 때 OUT에서 배출(D-U06) / 미정 |
  | 대기 중 설비 점유 `block_machine_while_waiting` | 미정(OPEN-003) / 점유 / 점유하지 않음 |
- 원칙: **미정을 항상 선택지로 유지**하고 기본값으로 "아니오"나 "예약 안 함"을 채우지 않는다. `mode: unknown`이면 하위 필드 입력을 숨기고 요청에 하위 필드를 보내지 않는다. 확정 근거(D-U05·D-U06)와 미정 근거(OPEN-003)는 글자와 기호로 표시한다(색에만 의존하지 않음).
- 요청 직전 어댑터가 camelCase 뷰 모델을 계약의 snake_case와 `mode`별 모양으로 바꾼다(`capacityAdapter`와 같은 위치·방식). 단위 테스트로 모양을 고정한다.
- 규칙은 용량과 **같은 버전 PATCH**에 실린다(`ports[]` 단위). 따라서 저장은 기존 "용량·규칙(버전)" 섹션의 한 버튼이다(BE-REQ-003 결정과 일치).

### 2. `ReasonDialog` (공통 컴포넌트, `shared/components`)
- `ConfirmDialog`를 확장하는 얇은 구성이다: 제목, 안내, **필수 텍스트 입력 1개**, 확인(사유가 비어 있으면 비활성)·취소.
- 포커스·Esc·포커스 복귀는 기존 `ConfirmDialog`(Radix Dialog)와 같다. 오류는 입력 아래 `role="alert"`로 표시한다.
- 특정 API에 의존하지 않는다. 첫 사용처는 버전 반려(`POST …/reject`)이며 사유의 길이 제한은 계약의 값을 따른다(openapi에서 확인, 현재 FE는 제한을 가정하지 않음).

## 영향받는 테이블·migration·화면·API·예제·엔진
- 화면: 자산 상세의 포트 구역(규칙 입력), 버전 섹션의 반려 동작. Backend·계약·DB 변경 없음.
- 의존성 추가 없음(Radix·기존 Fields 사용).

## 호환성/데이터 변환/롤백
- 계약 호환. 승인 전에는 읽기 전용 표시를 유지한다. 승인 후 구현해도 읽기 전용 표시로 되돌릴 수 있다.

## 미정·위험
- 규칙 모양의 최종 확인은 FE-01d에서 `openapi.json`의 `DispatchRule`/`ReleaseRule` 판별 유니온(`mode: unknown | when_destination_available` 등)과 대조해서 한다. 대조 결과가 다르면 이 제안의 표를 수정한다.
- `mode`가 지금은 각각 2가지뿐이라 단순 토글처럼 보이지만, 도메인 확정 후 값이 늘어도 선택지만 추가하면 되도록 코드값을 하드코딩하지 않고 라벨 표(`ruleLabels`)를 한 곳에 둔다.
- OPEN-003이 해소되면 미정 선택지를 없애는 것이 아니라 "확정"으로 바뀐 값만 추가한다(기존 미정 데이터가 남아 있으므로).

## 필요한 테스트
- 어댑터 단위 테스트(모드별 요청 모양, unknown 시 하위 필드 제거).
- 컴포넌트 테스트: 미정 기본값 유지, 확정/미정 표시, 읽기 전용(조회자·비초안), 키보드 조작.
- `ReasonDialog`: 사유 없으면 확인 비활성, Esc·취소 후 포커스 복귀, 확인 시 사유 전달.
- 실제 API 연동 테스트는 FE-01d에서(미실행).

## 승인자 / 승인일 / 근거
- (미승인) — 사용자 승인 필요.

## 반영 commit / 양쪽 확인
- (없음) Backend 확인은 `request-from-backend.md`에서 받는다.
