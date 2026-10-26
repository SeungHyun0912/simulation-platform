"""엔진이 읽는 공정 snapshot. 계약 0.6.0의 버전·그래프 응답 모양(JSON dict)을 그대로 받는다.

ORM·HTTP에 의존하지 않는다. 실행 snapshot 생성(C-07)은 이 모양의 dict를 불변으로 저장하는 일이다.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class ProcessSnapshot:
    version_id: str
    project_id: str | None
    status: str
    schema_version: str
    raw_unit_spec: dict
    finished_unit_spec: dict
    completion_node_id: str | None
    nodes: tuple[dict, ...]
    edges: tuple[dict, ...]
    # asset id → 실행에 쓰는 자산 버전(계약 0.2.0 `GET asset-revisions/{id}`의 data: storage_capacity·ports).
    # 없으면 용량·배출 규칙을 모르는 것으로 본다(무제한으로 가정하지 않는다).
    assets: dict = field(default_factory=dict)

    @classmethod
    def from_api(cls, version: dict, graph: dict, assets: dict | None = None) -> "ProcessSnapshot":
        """`GET process-versions/{v}`·`GET …/graph`의 data와, 쓰는 자산들의 승인된 자산 버전(asset id → data)으로 만든다."""
        completion = graph.get("completion_node_id")
        return cls(
            version_id=str(version["id"]), project_id=version.get("project_id"),
            status=version["status"], schema_version=version["schema_version"],
            raw_unit_spec=version["raw_unit_spec"], finished_unit_spec=version["finished_unit_spec"],
            completion_node_id=None if completion is None else str(completion),
            nodes=tuple(graph["nodes"]), edges=tuple(graph["edges"]),
            assets={str(k): v for k, v in (assets or {}).items()})
