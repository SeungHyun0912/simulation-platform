import uuid

from pydantic import BaseModel


class MeUser(BaseModel):
    id: uuid.UUID
    display_name: str


class MeOrganization(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    role: str


class MeProject(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    code: str
    name: str
    role: str


class MeOut(BaseModel):
    user: MeUser
    organizations: list[MeOrganization]
    projects: list[MeProject]
