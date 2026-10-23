import uuid
from typing import Annotated, ClassVar

from pydantic import StringConstraints

from simulation_platform.schemas.common import (
    Code,
    FreeText,
    Name,
    Out,
    PatchIn,
    StrictIn,
    UtcDatetime,
)

Timezone = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)]


class ProjectOut(Out):
    id: uuid.UUID
    organization_id: uuid.UUID
    code: str
    name: str
    timezone: str
    description: str | None
    status: str
    created_at: UtcDatetime
    updated_at: UtcDatetime | None
    row_version: int


class ProjectCreate(StrictIn):
    organization_id: uuid.UUID
    code: Code
    name: Name
    timezone: Timezone
    description: FreeText | None = None


class ProjectPatch(PatchIn):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("name", "timezone")

    name: Name | None = None
    timezone: Timezone | None = None
    description: FreeText | None = None
