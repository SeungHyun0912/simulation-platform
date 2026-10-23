import re
import uuid
from decimal import Decimal
from typing import Annotated, ClassVar, Literal

from pydantic import Field, StringConstraints, model_validator

from simulation_platform.schemas.common import FreeText, Out, PatchIn, StrictIn, UtcDatetime

CapacityUnit = Literal["item", "bobbin_slot", "pallet_slot", "kg", "m2"]
# 개수 계열은 정수, kg·m2는 소수 6자리까지 허용하는 decimal 문자열(0 초과).
INTEGER_UNITS = frozenset({"item", "bobbin_slot", "pallet_slot"})
_INT = re.compile(r"^[1-9][0-9]{0,17}$")
_DEC = re.compile(r"^(0|[1-9][0-9]{0,17})(\.[0-9]{1,6})?$")


class Capacity(StrictIn):
    """03 §3 용량 계약. finite만 value·unit을 가지며 나머지 mode는 둘 다 null이다.

    status는 보내지 않아도 된다(unknown→unknown, 그 외→confirmed로 서버가 채운다).
    master 값에는 assumed/not_applicable을 쓸 수 없다(가정은 시나리오에서만).
    """

    mode: Literal["unknown", "finite", "unlimited", "not_allowed"]
    value: str | None = None
    unit: CapacityUnit | None = None
    status: Literal["unknown", "confirmed"] | None = None

    @model_validator(mode="after")
    def _consistent(self):
        if self.mode == "finite":
            if self.value is None or self.unit is None:
                raise ValueError("finite 용량에는 value와 unit이 필요합니다.")
            if self.unit in INTEGER_UNITS:
                valid = bool(_INT.match(self.value))
                expected = "0보다 큰 정수"
            else:
                valid = bool(_DEC.match(self.value)) and Decimal(self.value) > 0
                expected = "0보다 큰 숫자(소수 6자리까지)"
            if not valid:
                raise ValueError(f"{self.unit} 용량은 {expected}여야 합니다.")
        elif self.value is not None or self.unit is not None:
            raise ValueError(f"{self.mode} 용량에는 value와 unit을 보낼 수 없습니다.")
        expected_status = "unknown" if self.mode == "unknown" else "confirmed"
        if self.status is None:
            self.status = expected_status
        elif self.status != expected_status:
            raise ValueError(f"{self.mode} 용량의 status는 {expected_status}여야 합니다.")
        return self


class DispatchUnknown(StrictIn):
    mode: Literal["unknown"]


class DispatchWhenAvailable(StrictIn):
    """D-U05: 목적지 설비가 가용하면 이동, 바쁘면 IN에서 대기."""

    mode: Literal["when_destination_available"]
    reservation: Literal["unknown", "reserve", "none"]
    wait_at_in_if_busy: bool


class ReleaseUnknown(StrictIn):
    mode: Literal["unknown"]


class ReleaseWhenAccepts(StrictIn):
    """D-U06: 목적지가 받아들일 때 OUT에서 배출."""

    mode: Literal["when_destination_accepts"]
    block_machine_while_waiting: Literal["unknown", "yes", "no"]


DispatchRule = Annotated[DispatchUnknown | DispatchWhenAvailable, Field(discriminator="mode")]
ReleaseRule = Annotated[ReleaseUnknown | ReleaseWhenAccepts, Field(discriminator="mode")]


class PortPolicyOut(Out):
    port_id: uuid.UUID
    port_key: str
    role: Literal["IN", "OUT"]
    buffer_capacity: Capacity
    dispatch_rule: DispatchRule
    release_rule: ReleaseRule


class IssueOut(Out):
    """검증 항목. 오류 envelope의 details와 같은 필드 구성이다."""

    severity: Literal["error", "warning"]
    rule_id: str
    entity_id: uuid.UUID
    field_path: str
    message: str
    resolution: str | None = None


class AssetRevisionOut(Out):
    id: uuid.UUID
    project_id: uuid.UUID
    asset_id: uuid.UUID
    revision_no: int
    status: Literal["draft", "in_review", "approved", "superseded"]
    schema_version: str
    storage_capacity: Capacity | None
    ports: list[PortPolicyOut]
    notes: str | None
    issues: list[IssueOut]
    submitted_at: UtcDatetime | None
    submitted_by: uuid.UUID | None
    rejection_reason: str | None
    rejected_at: UtcDatetime | None
    approved_at: UtcDatetime | None
    approved_by: uuid.UUID | None
    created_at: UtcDatetime
    updated_at: UtcDatetime | None
    row_version: int


class RevisionSummary(Out):
    """자산 응답에 붙는 버전 요약."""

    id: uuid.UUID
    revision_no: int
    status: Literal["draft", "in_review", "approved", "superseded"]
    approved_at: UtcDatetime | None


class PortPolicyPatch(StrictIn):
    port_id: uuid.UUID
    buffer_capacity: Capacity | None = None
    dispatch_rule: DispatchRule | None = None
    release_rule: ReleaseRule | None = None

    @model_validator(mode="after")
    def _has_change(self):
        provided = self.model_fields_set - {"port_id"}
        if not provided:
            raise ValueError("포트 정책에 변경할 필드가 없습니다.")
        if any(getattr(self, name) is None for name in provided):
            raise ValueError("포트 정책 필드는 null로 지울 수 없습니다.")
        return self


class RevisionPatch(PatchIn):
    """초안만 수정할 수 있다. 보낸 필드만 바뀌며 ports는 port_id별로 병합한다."""

    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("storage_capacity", "ports")

    storage_capacity: Capacity | None = None
    ports: Annotated[list[PortPolicyPatch], Field(min_length=1, max_length=2)] | None = None
    notes: FreeText | None = None

    @model_validator(mode="after")
    def _unique_ports(self):
        if self.ports is not None:
            ids = [p.port_id for p in self.ports]
            if len(set(ids)) != len(ids):
                raise ValueError("ports에 같은 port_id가 중복되었습니다.")
        return self


class RejectBody(StrictIn):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]
