from datetime import UTC, datetime
from typing import Annotated, ClassVar

from pydantic import BaseModel, ConfigDict, PlainSerializer, StringConstraints, model_validator


def _utc_iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


# 실제 시각은 ISO8601 UTC로 내보낸다(UI에서 KST 변환).
UtcDatetime = Annotated[datetime, PlainSerializer(_utc_iso, return_type=str)]

Code = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
FreeText = Annotated[str, StringConstraints(min_length=1, max_length=4000)]


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class StrictIn(BaseModel):
    """알려지지 않은 필드는 거부한다(계약 03 §1)."""

    model_config = ConfigDict(extra="forbid")


class PatchIn(StrictIn):
    """PATCH 본문. 빈 본문과, null을 허용하지 않는 필드의 null을 거부한다."""

    NON_NULLABLE: ClassVar[tuple[str, ...]] = ()

    @model_validator(mode="after")
    def _check_patch(self):
        if not self.model_fields_set:
            raise ValueError("변경할 필드가 없습니다.")
        for name in self.NON_NULLABLE:
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name}은(는) null로 지울 수 없습니다.")
        return self


class Page(BaseModel):
    limit: int
    next_cursor: str | None


class Single[T](BaseModel):
    data: T


class ListOut[T](BaseModel):
    data: list[T]
    page: Page


class ErrorDetailOut(BaseModel):
    message: str
    severity: str = "error"
    rule_id: str | None = None
    entity_id: str | None = None
    field_path: str | None = None
    resolution: str | None = None


class ErrorBody(BaseModel):
    code: str
    message: str
    request_id: str | None
    details: list[ErrorDetailOut]


class ErrorEnvelope(BaseModel):
    error: ErrorBody
