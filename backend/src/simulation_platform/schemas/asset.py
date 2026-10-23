import uuid
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
from simulation_platform.schemas.revision import RevisionSummary

AssetKind = Literal["equipment", "storage", "dock"]
SortOrder = Annotated[int, Field(ge=0, le=2_147_483_647)]
TypeName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
OptionalName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ExternalRef = Annotated[str, StringConstraints(min_length=1, max_length=200)]


class PortOut(Out):
    id: uuid.UUID
    port_key: str
    role: Literal["IN", "OUT", "ACCESS"]
    label: str


class EquipmentOut(Out):
    equipment_type: str
    model_name: str | None


class SpaceOut(Out):
    space_type: str


class AssetOut(Out):
    id: uuid.UUID
    project_id: uuid.UUID
    kind: AssetKind
    code: str
    name: str
    sort_order: int
    external_ref: str | None
    notes: str | None
    archived_at: UtcDatetime | None
    equipment: EquipmentOut | None
    space: SpaceOut | None
    ports: list[PortOut]
    # 0.2.0 추가(비파괴): 최신 승인본과 가장 최근 버전의 요약. 버전이 없으면 null.
    current_revision: RevisionSummary | None
    latest_revision: RevisionSummary | None
    created_at: UtcDatetime
    updated_at: UtcDatetime | None
    row_version: int


class EquipmentIn(StrictIn):
    equipment_type: TypeName
    model_name: OptionalName | None = None


class SpaceIn(StrictIn):
    space_type: TypeName


class AssetCreate(StrictIn):
    """포트는 요청에 없다. 서버가 kind에 맞춰 같은 트랜잭션에서 생성한다."""

    kind: AssetKind
    code: Code
    name: Name
    sort_order: SortOrder = 0
    external_ref: ExternalRef | None = None
    notes: FreeText | None = None
    equipment: EquipmentIn | None = None
    space: SpaceIn | None = None

    @model_validator(mode="after")
    def _detail_matches_kind(self):
        if self.kind == "equipment":
            if self.equipment is None or self.space is not None:
                raise ValueError("kind=equipment는 equipment 객체만 필요합니다(space 금지).")
        elif self.space is None or self.equipment is not None:
            raise ValueError(f"kind={self.kind}는 space 객체만 필요합니다(equipment 금지).")
        return self


class EquipmentPatch(PatchIn):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("equipment_type",)

    equipment_type: TypeName | None = None
    model_name: OptionalName | None = None


class SpacePatch(PatchIn):
    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("space_type",)

    space_type: TypeName | None = None


class AssetPatch(PatchIn):
    """kind·포트는 PATCH 대상이 아니다(extra 필드로 422)."""

    NON_NULLABLE: ClassVar[tuple[str, ...]] = ("code", "name", "sort_order", "equipment", "space")

    code: Code | None = None
    name: Name | None = None
    sort_order: SortOrder | None = None
    external_ref: ExternalRef | None = None
    notes: FreeText | None = None
    equipment: EquipmentPatch | None = None
    space: SpacePatch | None = None
