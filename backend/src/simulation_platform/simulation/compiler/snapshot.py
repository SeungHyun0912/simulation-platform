"""엔진이 읽는 공정 snapshot. 계약 0.6.0의 버전·그래프 응답 모양(JSON dict)을 그대로 받는다.

ORM·HTTP에 의존하지 않는다. 실행 snapshot 생성(C-07)은 이 모양의 dict를 불변으로 저장하는 일이다.
"""

from dataclasses import dataclass


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

    @classmethod
    def from_api(cls, version: dict, graph: dict) -> "ProcessSnapshot":
        """`GET process-versions/{v}`의 data와 `GET …/graph`의 data로 만든다."""
        completion = graph.get("completion_node_id")
        return cls(
            version_id=str(version["id"]), project_id=version.get("project_id"),
            status=version["status"], schema_version=version["schema_version"],
            raw_unit_spec=version["raw_unit_spec"], finished_unit_spec=version["finished_unit_spec"],
            completion_node_id=None if completion is None else str(completion),
            nodes=tuple(graph["nodes"]), edges=tuple(graph["edges"]))
