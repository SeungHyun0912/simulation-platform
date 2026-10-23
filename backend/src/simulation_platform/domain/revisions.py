"""자산 버전의 순수 규칙(HTTP/ORM 비의존): 상태 전이, 기본값, 검증 이슈 계산.

기준: CR-backend-20261023-be02-asset-revision-capacity, contracts/03 §2·§3·§7.
"""

from dataclasses import dataclass

from simulation_platform.domain.errors import ErrorDetail, InvalidStateTransitionError

DRAFT, IN_REVIEW, APPROVED, SUPERSEDED = "draft", "in_review", "approved", "superseded"

# 허용되는 상태 전이. DB 트리거(asset_revision_guard)가 같은 표를 강제한다.
TRANSITIONS: dict[str, frozenset[str]] = {
    DRAFT: frozenset({IN_REVIEW}),
    IN_REVIEW: frozenset({DRAFT, APPROVED}),
    APPROVED: frozenset({SUPERSEDED}),
    SUPERSEDED: frozenset(),
}

# 현재 엔진이 실행할 수 있는 용량 단위(03 §3). 그 밖의 단위는 등록만 가능하다.
ENGINE_UNITS = frozenset({"item"})

# 새 revision의 기본값. 용량은 0·무제한이 아니라 '미정'으로 시작한다.
UNKNOWN_CAPACITY = {"mode": "unknown", "value": None, "unit": None, "status": "unknown"}
# D-U05(가용 시 이동·바쁘면 IN 대기), D-U06(목적지 수용 시 OUT 배출)은 사용자 확정 규칙이다.
# 예약·설비 점유(OPEN-003)는 미정이므로 'unknown'으로 둔다.
DEFAULT_DISPATCH_RULE = {
    "mode": "when_destination_available",
    "reservation": "unknown",
    "wait_at_in_if_busy": True,
}
DEFAULT_RELEASE_RULE = {
    "mode": "when_destination_accepts",
    "block_machine_while_waiting": "unknown",
}

ROLE_ORDER = {"IN": 0, "OUT": 1}


def ensure_transition(current: str, target: str) -> None:
    if target not in TRANSITIONS.get(current, frozenset()):
        raise InvalidStateTransitionError(
            "허용되지 않는 상태 변경입니다.",
            [ErrorDetail(message=f"{current} 상태에서는 {target}(으)로 바꿀 수 없습니다.",
                         field_path="/status")],
        )


@dataclass(frozen=True)
class PolicyView:
    """이슈 계산에 필요한 포트 정책 값(저장된 JSON 그대로)."""

    port_key: str
    buffer_capacity: dict
    dispatch_rule: dict
    release_rule: dict


def _capacity_issues(entity_id: str, path: str, label: str, cap: dict) -> list[ErrorDetail]:
    issues: list[ErrorDetail] = []
    if cap["mode"] == "unknown":
        issues.append(ErrorDetail(
            severity="warning", rule_id="VAL-CAP-001", entity_id=entity_id, field_path=path,
            message=f"{label} 값이 미정입니다.",
            resolution="확정값 입력(없으면 대기 불가 선택). 실행 전에 해소해야 합니다."))
    elif cap["mode"] == "finite" and cap["unit"] not in ENGINE_UNITS:
        issues.append(ErrorDetail(
            severity="warning", rule_id="VAL-CAP-002", entity_id=entity_id,
            field_path=f"{path}/unit",
            message=f"{label}의 단위({cap['unit']})는 등록할 수 있지만 현재 실행 엔진은 item 단위만 지원합니다.",
            resolution="item 단위로 환산한 값을 입력하거나 엔진 지원을 기다리세요."))
    return issues


def compute_issues(
    revision_id: str, storage_capacity: dict | None, policies: list[PolicyView]
) -> list[ErrorDetail]:
    """버전 설정의 경고 목록. 미정은 오류가 아니라 경고이며 승인을 막지 않는다(ADR-017)."""
    issues: list[ErrorDetail] = []
    if storage_capacity is not None:
        issues += _capacity_issues(revision_id, "/storage_capacity", "저장 용량", storage_capacity)
    for index, policy in enumerate(policies):
        base = f"/ports/{index}"
        issues += _capacity_issues(
            revision_id, f"{base}/buffer_capacity", f"{policy.port_key} 포트 버퍼 용량",
            policy.buffer_capacity)
        dispatch, release = policy.dispatch_rule, policy.release_rule
        if dispatch["mode"] == "unknown":
            issues.append(ErrorDetail(
                severity="warning", rule_id="VAL-POLICY-003", entity_id=revision_id,
                field_path=f"{base}/dispatch_rule",
                message=f"{policy.port_key} 포트의 이동(dispatch) 규칙이 미정입니다.",
                resolution="규칙을 확정하세요."))
        elif dispatch["reservation"] == "unknown":
            issues.append(ErrorDetail(
                severity="warning", rule_id="VAL-POLICY-001", entity_id=revision_id,
                field_path=f"{base}/dispatch_rule/reservation",
                message=f"{policy.port_key} 포트의 이동 중 설비 예약 여부가 미정입니다(OPEN-003).",
                resolution="예약 여부를 확정하거나 시나리오 가정으로 승인하세요."))
        if release["mode"] == "unknown":
            issues.append(ErrorDetail(
                severity="warning", rule_id="VAL-POLICY-004", entity_id=revision_id,
                field_path=f"{base}/release_rule",
                message=f"{policy.port_key} 포트의 배출(release) 규칙이 미정입니다.",
                resolution="규칙을 확정하세요."))
        elif release["block_machine_while_waiting"] == "unknown":
            issues.append(ErrorDetail(
                severity="warning", rule_id="VAL-POLICY-002", entity_id=revision_id,
                field_path=f"{base}/release_rule/block_machine_while_waiting",
                message=f"{policy.port_key} 포트 출력이 막힐 때 설비를 점유하는지 미정입니다(OPEN-003).",
                resolution="점유 여부를 확정하거나 시나리오 가정으로 승인하세요."))
    return issues
