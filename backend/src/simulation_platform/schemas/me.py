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
    # 0.3.0 추가(비파괴). 보관된 프로젝트도 목록에 포함하고 제외 여부는 클라이언트가 정한다.
    status: str
    role: str


class MeOut(BaseModel):
    user: MeUser
    organizations: list[MeOrganization]
    projects: list[MeProject]
