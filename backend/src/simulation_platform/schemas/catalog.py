import re
import uuid
from decimal import Decimal
from typing import Annotated, ClassVar, Literal

from pydantic import Field, StringConstraints, model_validator

from simulation_platform.schemas.common import (
    Code,
    FreeText,
    Name,
    Out,
    PatchIn,
    StrictIn,
    UtcDatetime,
)

_DEC = re.compile(r"^(0|[1-9][0-9]{0,17})(\.[0-9]{1,6})?$")
Form = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Specification = Annotated[str, StringConstraints(min_length=1, max_length=4000)]
MeasureMode = Literal["unknown", "known", "not_applicable"]


class DecimalMeasure(StrictIn):
    """길이(m)·중량(kg). known만 값(0 초과 decimal 문자열, 소수 6자리까지)을 가진다."""

    mode: MeasureMode = "unknown"
    value: str | None = None

    @model_validator(mode="after")
    def _consistent(self):
        if self.mode == "known":
            if self.value is None:
                raise ValueError("known에는 value가 필요합니다.")
            if not _DEC.match(self.value) or Decimal(self.value) <= 0:
                raise ValueError("value는 0보다 큰 숫자 문자열(소수 6자리까지)이어야 합니다.")
        elif self.value is not None:
            raise ValueError(f"{self.mode}에는 value를 보낼 수 없습니다.")
        return self


class CountMeasure(StrictIn):
    """단위 수·가닥 수. known만 값(1 이상 정수, JSON integer)을 가진다."""

    mode: MeasureMode = "unknown"
    value: Annotated[int, Field(ge=1, le=10**12, strict=True)] | None = None

    @model_validator(mode="after")
    def _consistent(self):
        if self.mode == "known" and self.value is None:
            raise ValueError("known에는 value가 필요합니다.")
        if self.mode != "known" and self.value is not None:
            raise ValueError(f"{self.mode}에는 value를 보낼 수 없습니다.")
        return self


class DefaultSpec(StrictIn):
    """길이·중량·단위 수·가닥 수는 서로 환산하지 않는다. 기본값은 모두 unknown(0이 아님)."""

    length_m: DecimalMeasure = Field(default_factory=DecimalMeasure)
    weight_kg: DecimalMeasure = Field(default_factory=DecimalMeasure)
    unit_count: CountMeasure = Field(default_factory=CountMeasure)
    strand_count: CountMeasure = Field(default_factory=CountMeasure)


class DefaultSpecPatch(PatchIn):
    """보낸 필드만 교체한다."""

    NON_NULLABLE: ClassVar[tuple[str, ...]] = (
        "length_m", "weight_kg", "unit_count", "strand_count")

    length_m: DecimalMeasure | None = None
    weight_kg: DecimalMeasure | None = None
    unit_count: CountMeasure | None = None
    strand_count: CountMeasure | None = None


class ProductOut(Out):
    id: uuid.UUID
    project_id: uuid.UUID
    code: str
    name: str
    specification: str | None
    notes: str | None
    archived_at: UtcDatetime | None
    created_at: UtcDatetime
    updated_at: UtcDatetime | None
    row_version: int


class ProductCreate(StrictIn):
    code: Code
    name: Name
    specification: Specification | None = None
    notes: FreeText | None = None


class ProductPatch(PatchIn):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("code", "name")

    code: Code | None = None
    name: Name | None = None
    specification: Specification | None = None
    notes: FreeText | None = None


class MaterialOut(Out):
    id: uuid.UUID
    project_id: uuid.UUID
    code: str
    name: str
    form: str
    default_spec: DefaultSpec
    notes: str | None
    archived_at: UtcDatetime | None
    created_at: UtcDatetime
    updated_at: UtcDatetime | None
    row_version: int


class MaterialCreate(StrictIn):
    code: Code
    name: Name
    form: Form
    default_spec: DefaultSpec = Field(default_factory=DefaultSpec)
    notes: FreeText | None = None


class MaterialPatch(PatchIn):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("code", "name", "form", "default_spec")

    code: Code | None = None
    name: Name | None = None
    form: Form | None = None
    default_spec: DefaultSpecPatch | None = None
    notes: FreeText | None = None
